import { api, ApiError } from '../lib/api';
import { me, setPoints, shell, showError } from '../lib/shell';
import { bg, errorText, h, medalBadge, modal, mount, qs, store, toast } from '../lib/ui';
import { Board } from '../game/board';
import { isMuted, setMuted, sfx } from '../game/sound';
import {
  correctCount,
  formatTime,
  isSolved,
  newGame,
  randomSeed,
  rate,
  replay,
  seedFromString,
  suggestSwap,
  swap,
  winPoints,
  type Action,
  type GameState,
  type Rating,
} from '@shared/engine';
import { DAILY_SWAP_HINT_COST, DIFFICULTIES, HINT_COOLDOWN_MS, RULES, SWAP_HINT_COST, type Difficulty } from '@shared/rules';

interface PuzzleInfo {
  slug: string;
  title: string;
  image: string;
  thumb: string;
  categoryName: string;
  categoryId: string | null;
  unlocked: boolean;
  next: { slug: string; title: string } | null;
}

interface ServerPlay {
  id: string;
  seed: number;
  difficulty: Difficulty;
  hardMode: boolean;
  daily: string | null;
  actions: Action[];
  elapsedMs: number;
  completed: boolean;
}

interface CompleteResult {
  rating: Rating;
  elapsedMs: number;
  moves: number;
  score: number;
  points: number;
  firstClear: boolean;
  dailyBonus: number;
  milestone: { days: number; points: number; title: string } | null;
  streak: { current: number } | null;
  rank: number | null;
  balance: number;
}

const main = await shell({ bodyClass: 'game-page' });
const user = me();
const dailyDay = qs('daily');
const slug = qs('p');
const prefs = store('ss_play_prefs', { difficulty: 'easy' as Difficulty, hardMode: false });
const guestSaves = store<Record<string, { seed: number; actions: Action[]; elapsedMs: number }>>('ss_guest_games', {});

let puzzle!: PuzzleInfo;
let difficulty: Difficulty = dailyDay ? 'hard' : (DIFFICULTIES.includes(qs('d') as Difficulty) ? (qs('d') as Difficulty) : prefs.get().difficulty);
let hardMode = dailyDay ? false : prefs.get().hardMode;
let seed = 0;
let play: ServerPlay | null = null;
let state: GameState;
let actions: Action[] = [];
let elapsedBase = 0;
let runningSince = 0;
let paused = false;
let finished = false;
let saveTimer = 0;
let lastHintAt = 0;
let board: Board;
let image: HTMLImageElement;

// ---------- UI elements ----------
const timeEl = h('span', { class: 'pill' }, 'Time: 00:00.0');
const scoreEl = h('span', { class: 'pill' }, 'Score: 0');
const streakEl = h('span', { class: 'pill' }, 'Streak: 0');
const movesEl = h('span', { class: 'pill dark' }, 'Moves: 0');
const saveEl = h('span', { class: 'pill dark small' }, '');
const progressFill = h('i');
const canvas = h('canvas', { id: 'board' }) as HTMLCanvasElement;
const wrap = h('div', { class: 'board-wrap' }, canvas, h('div', { class: 'pause-cover' }, h('button', { class: 'btn big primary', onclick: () => togglePause(false) }, 'Resume')));
const diffSel = h('select', { 'aria-label': 'Difficulty' }, DIFFICULTIES.map((d) => h('option', { value: d }, `${RULES[d].label} (${RULES[d].rows}×${RULES[d].cols})`))) as HTMLSelectElement;
const hintBtn = h('button', { class: 'btn' }, 'Swap hint');
const placeBtn = h('button', { class: 'btn' }, 'Place 1 tile');
const hardBtn = h('button', { class: 'btn', 'aria-pressed': 'false', title: 'No correct-tile glow, ×1.45 points' }, 'Hard mode');
const pauseBtn = h('button', { class: 'btn', onclick: () => togglePause() }, 'Pause');
const muteBtn = h('button', { class: 'btn', 'aria-pressed': String(isMuted()) }, isMuted() ? 'Sound off' : 'Sound on');
const preview = h('div', { class: 'preview', title: 'The finished picture' });

async function loadPuzzle(): Promise<void> {
  if (dailyDay) {
    const d = await api.get<{ seed: number; puzzle: { slug: string; title: string; image: string; thumb: string }; category: { id: string; name: string } | null }>(
      `/daily/day/${encodeURIComponent(dailyDay)}`,
    );
    seed = d.seed;
    puzzle = { ...d.puzzle, categoryName: 'Daily', categoryId: d.category?.id ?? null, unlocked: true, next: null };
    return;
  }
  const d = await api.get<{
    puzzle: { slug: string; title: string; image: string; thumb: string; unlocked: boolean; unlockCost: number };
    category: { id: string; name: string } | null;
    next: { slug: string; title: string } | null;
  }>(`/puzzles/${encodeURIComponent(slug)}`);
  puzzle = { ...d.puzzle, categoryName: d.category?.name ?? '', categoryId: d.category?.id ?? null, next: d.next };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The puzzle image did not load.'));
    img.src = src;
  });
}

const guestKey = () => `${dailyDay ? 'daily:' + dailyDay : slug}:${difficulty}:${hardMode ? 'h' : 'n'}`;

/** Start or resume a game (server-backed when signed in, local for guests). */
async function startGame(fresh = false): Promise<void> {
  finished = false;
  lastHintAt = 0;
  if (user) {
    const r = await api.post<{ play: ServerPlay; resumed: boolean }>('/plays', {
      puzzle: puzzle.slug,
      difficulty,
      hardMode,
      daily: dailyDay || undefined,
      fresh,
    });
    play = r.play;
    seed = play.seed;
    difficulty = play.difficulty;
    hardMode = play.hardMode;
    actions = play.actions;
    elapsedBase = play.elapsedMs;
    if (r.resumed && actions.length) toast('Welcome back', 'Picked up where you left off.');
  } else {
    const saves = guestSaves.get();
    const saved = fresh ? undefined : saves[guestKey()];
    if (!dailyDay) seed = saved?.seed ?? randomSeed();
    else seed = seedFromString('daily:' + dailyDay);
    actions = saved?.actions ?? [];
    elapsedBase = saved?.elapsedMs ?? 0;
  }
  const r = replay(seed, difficulty, actions, hardMode);
  if (r.invalidAt !== -1) {
    actions = actions.slice(0, r.invalidAt);
    state = replay(seed, difficulty, actions, hardMode).state;
  } else state = r.state;
  runningSince = 0;
  board.setState(state);
  board.setShowCorrect(!hardMode);
  syncControls();
  updateHud();
  if (!paused) runningSince = performance.now();
}

function elapsed(): number {
  return elapsedBase + (runningSince ? performance.now() - runningSince : 0);
}

function updateHud() {
  timeEl.textContent = `Time: ${formatTime(elapsed())}`;
  scoreEl.textContent = `Score: ${state.score}`;
  streakEl.textContent = `Streak: ${state.streak}`;
  movesEl.textContent = `Moves: ${state.moves}`;
  const pct = (correctCount(state) / state.tiles.length) * 100;
  progressFill.style.width = `${pct}%`;
}

function tick() {
  if (state && runningSince && !finished) timeEl.textContent = `Time: ${formatTime(elapsed())}`;
  requestAnimationFrame(tick);
}

function syncControls() {
  diffSel.value = difficulty;
  diffSel.disabled = !!dailyDay;
  hardBtn.setAttribute('aria-pressed', String(hardMode));
  hardBtn.hidden = !!dailyDay;
  placeBtn.hidden = !!dailyDay;
  const hintCost = dailyDay ? DAILY_SWAP_HINT_COST : SWAP_HINT_COST;
  hintBtn.textContent = hintCost ? `Swap hint (${hintCost} pts)` : 'Swap hint (free)';
  placeBtn.textContent = `Place 1 tile (${RULES[difficulty].placeCost} pts)`;
}

function scheduleSave(now = false) {
  if (finished) return;
  clearTimeout(saveTimer);
  const doSave = async () => {
    if (user && play) {
      try {
        await api.put(`/plays/${play.id}`, { actions, elapsedMs: Math.round(elapsed()) });
        saveEl.textContent = 'Saved';
      } catch (e) {
        saveEl.textContent = 'Not saved';
        if (e instanceof ApiError && e.status === 422) toast('Save problem', e.message, 'bad');
      }
    } else {
      const saves = guestSaves.get();
      saves[guestKey()] = { seed, actions, elapsedMs: Math.round(elapsed()) };
      guestSaves.set(saves);
      saveEl.textContent = 'Saved on this device';
    }
  };
  if (now) void doSave();
  else saveTimer = window.setTimeout(doSave, 1500);
}

function onSwap(a: number, b: number) {
  if (finished || paused) return;
  if (!runningSince) runningSince = performance.now();
  const before = state.tiles.map((t, i) => t === i);
  const r = swap(state, a, b, hardMode);
  if (!r.ok) {
    sfx.denied();
    return;
  }
  actions.push([a, b]);
  const newly = [a, b].filter((p) => !before[p] && state.tiles[p] === p);
  board.animateSwap(a, b, newly);
  if (r.newlyCorrect) sfx.correct(r.newlyCorrect);
  else sfx.swap();
  updateHud();
  if (isSolved(state)) void finish();
  else scheduleSave();
}

async function useHint() {
  if (finished) return;
  if (Date.now() - lastHintAt < HINT_COOLDOWN_MS) {
    toast('Hint cooling down', `Ready in ${Math.ceil((HINT_COOLDOWN_MS - (Date.now() - lastHintAt)) / 1000)}s.`);
    return;
  }
  if (!user) {
    if (dailyDay) return signInPrompt('use hints on the daily challenge');
    const pair = suggestSwap(state);
    if (pair) {
      actions.push(['hint']);
      state.hints++;
      board.showHint(pair);
      lastHintAt = Date.now();
    }
    return;
  }
  try {
    const r = await api.post<{ pair: [number, number]; cost: number; points: number }>(`/plays/${play!.id}/hint`, { actions });
    actions.push(['hint']);
    state.hints++;
    board.showHint(r.pair);
    lastHintAt = Date.now();
    setPoints(r.points);
    if (r.cost) toast('Hint used', `−${r.cost} points`);
  } catch (e) {
    toast('No hint', errorText(e), 'bad');
  }
}

async function placeTile() {
  if (finished || dailyDay) return;
  if (!user) return signInPrompt('use the place-a-tile helper (it costs points)');
  try {
    const r = await api.post<{ pair: [number, number]; cost: number; points: number }>(`/plays/${play!.id}/place`, { actions });
    const before = state.tiles.map((t, i) => t === i);
    swap(state, r.pair[0], r.pair[1], hardMode);
    state.places++;
    actions.push(['place']);
    board.animateSwap(r.pair[0], r.pair[1], r.pair.filter((p) => !before[p] && state.tiles[p] === p));
    setPoints(r.points);
    sfx.correct(1);
    updateHud();
    toast('Tile placed', `−${r.cost} points`);
    if (isSolved(state)) void finish();
    else scheduleSave(true);
  } catch (e) {
    toast('Could not place a tile', errorText(e), 'bad');
  }
}

function signInPrompt(what: string) {
  modal(
    h('h2', {}, 'Sign in to continue'),
    h('p', { class: 'muted' }, `Sign in to ${what}. Your account keeps points, unlocks, streaks and progress on every device.`),
    h('div', { class: 'row end' }, h('a', { class: 'btn primary', href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Sign in')),
  );
}

function togglePause(force?: boolean) {
  if (finished) return;
  const next = force ?? !paused;
  if (next === paused) return;
  paused = next;
  if (paused) {
    elapsedBase = elapsed();
    runningSince = 0;
    scheduleSave(true);
  } else runningSince = performance.now();
  board.paused = paused;
  wrap.classList.toggle('paused', paused);
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
}

async function finish() {
  finished = true;
  elapsedBase = elapsed();
  runningSince = 0;
  updateHud();
  timeEl.textContent = `Time: ${formatTime(elapsedBase)}`;
  if (!user) {
    const rating = rate(difficulty, state.tiles.length, state.moves, elapsedBase);
    const saves = guestSaves.get();
    delete saves[guestKey()];
    guestSaves.set(saves);
    sfx.win(rating.medal);
    showResult({
      rating,
      elapsedMs: elapsedBase,
      moves: state.moves,
      score: state.score,
      points: winPoints(difficulty, elapsedBase, hardMode),
      firstClear: true,
      dailyBonus: 0,
      milestone: null,
      streak: null,
      rank: null,
      balance: 0,
    }, true);
    return;
  }
  try {
    const r = await api.post<CompleteResult>(`/plays/${play!.id}/complete`, { actions, elapsedMs: Math.round(elapsedBase) });
    setPoints(r.balance);
    sfx.win(r.rating.medal);
    showResult(r, false);
  } catch (e) {
    toast('Could not record your finish', errorText(e), 'bad');
  }
}

function showResult(r: CompleteResult, guest: boolean) {
  const label = r.rating.medal[0].toUpperCase() + r.rating.medal.slice(1);
  const share = async () => {
    const text = `I solved ${dailyDay ? `the SnapShift daily (${dailyDay})` : `“${puzzle.title}” on SnapShift`} in ${formatTime(r.elapsedMs)} — ${label} medal, ${r.rating.scorePct}%. ${location.origin}${dailyDay ? '/daily' : ''}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied', 'Result copied to the clipboard.');
      }
    } catch {
      /* cancelled */
    }
  };
  const d = modal(
    h('div', { class: 'result-medal' }, medalBadge(r.rating.medal)),
    h('h2', { style: 'text-align:center' }, `${label} medal!`),
    h('p', { class: 'muted', style: 'text-align:center' }, `${puzzle.title} · ${RULES[difficulty].label}${hardMode ? ' · Hard mode' : ''}`),
    h(
      'div',
      { class: 'result-grid' },
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Overall'), h('b', {}, `${r.rating.scorePct}%`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Moves'), h('b', {}, `${r.moves}`), h('span', { class: 'small muted' }, `${r.rating.moveEffPct}% efficient`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Time'), h('b', {}, formatTime(r.elapsedMs)), h('span', { class: 'small muted' }, `${r.rating.speedEffPct}% speed`)),
    ),
    guest
      ? h('div', { class: 'notice' }, `That run would have earned ${r.points} points. `, h('a', { href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Create a free account'), ' to keep points, unlock puzzles and join the leaderboard.')
      : h(
          'div',
          { class: 'notice' },
          h('b', {}, `+${r.points + r.dailyBonus} points`),
          r.firstClear ? '' : ' (replay rate)',
          r.dailyBonus ? ` including a ${r.dailyBonus}-point daily bonus` : '',
          '.',
          r.rank ? ` You're #${r.rank} on today's leaderboard.` : '',
          r.streak ? ` Daily streak: ${r.streak.current}.` : '',
        ),
    r.milestone ? h('div', { class: 'notice warn' }, h('b', {}, `${r.milestone.title}! `), `${r.milestone.days}-day streak: +${r.milestone.points} bonus points.`) : null,
    h(
      'div',
      { class: 'row end' },
      h('button', { class: 'btn', onclick: share }, 'Share'),
      dailyDay ? h('a', { class: 'btn', href: `/leaderboard?day=${dailyDay}` }, 'Leaderboard') : null,
      h('button', { class: 'btn', onclick: () => { d.close(); void restart(true); } }, 'Play again'),
      puzzle.next ? h('a', { class: 'btn primary', href: `/play?p=${encodeURIComponent(puzzle.next.slug)}&d=${difficulty}` }, 'Next puzzle →') : h('a', { class: 'btn primary', href: puzzle.categoryId ? `/category?c=${puzzle.categoryId}` : '/' }, 'More puzzles'),
    ),
  );
}

async function restart(fresh: boolean) {
  if (fresh && state && state.moves > 0 && !finished && !confirm('Start over? Your current progress on this board will be lost.')) {
    syncControls();
    return;
  }
  paused = false;
  wrap.classList.remove('paused');
  board.paused = false;
  pauseBtn.textContent = 'Pause';
  try {
    await startGame(fresh);
  } catch (e) {
    toast('Could not start', errorText(e), 'bad');
  }
}

// ---------- page ----------
try {
  if (!dailyDay && !slug) throw new Error('No puzzle chosen.');
  await loadPuzzle();
  document.title = `${dailyDay ? `Daily ${dailyDay}` : puzzle.title} | SnapShift Puzzles`;
  if (!puzzle.unlocked) {
    mount(
      main,
      h(
        'section',
        { class: 'panel' },
        h('h1', {}, puzzle.title),
        h('p', { class: 'muted' }, 'This puzzle is locked. Unlock it with points from its category page.'),
        h('a', { class: 'btn primary', href: puzzle.categoryId ? `/category?c=${puzzle.categoryId}` : '/' }, 'Go to category'),
      ),
    );
  } else {
    image = await loadImage(puzzle.image);
    preview.setAttribute('style', bg(puzzle.thumb || puzzle.image));
    mount(
      main,
      h(
        'div',
        { class: 'game' },
        h(
          'aside',
          { class: 'side panel', 'aria-label': 'Game controls' },
          h('a', { class: 'btn', href: puzzle.categoryId && !dailyDay ? `/category?c=${puzzle.categoryId}` : '/' }, '← Back'),
          h('b', { class: 'sidebar-title' }, puzzle.title),
          preview,
          h('label', { class: 'sr-only', for: 'diff' }, 'Difficulty'),
          diffSel,
          h('button', { class: 'btn', onclick: () => restart(true) }, 'Shuffle / restart'),
          hintBtn,
          placeBtn,
          hardBtn,
          pauseBtn,
          h('button', { class: 'btn', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.()) }, 'Full screen'),
          muteBtn,
          h('a', { class: 'btn', href: '/how-to-play', target: '_blank' }, 'How to play'),
        ),
        h(
          'section',
          { class: 'panel' },
          h(
            'div',
            { class: 'hud' },
            h('div', { class: 'row' }, timeEl, h('span', { class: 'pill' }, dailyDay ? `Daily · ${dailyDay}` : puzzle.categoryName || 'Puzzle'), scoreEl, streakEl, movesEl),
            h('div', { class: 'row' }, saveEl),
          ),
          wrap,
          h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Tiles in place' }, progressFill),
          h('p', { class: 'small muted', style: 'margin-top:8px' }, 'Drag a tile onto another to swap them, or click two tiles. Tiles lock when they land in the right place. Keyboard: arrows + Enter.'),
        ),
      ),
    );
    board = new Board(canvas, image, { showCorrect: !hardMode, onSwap });
    diffSel.addEventListener('change', async () => {
      const prev = difficulty;
      difficulty = diffSel.value as Difficulty;
      prefs.set({ ...prefs.get(), difficulty });
      if (state.moves > 0 && !finished && !confirm('Switch difficulty? This starts a new board.')) {
        difficulty = prev;
        diffSel.value = prev;
        return;
      }
      await restart(false);
    });
    hardBtn.addEventListener('click', async () => {
      const prev = hardMode;
      hardMode = !hardMode;
      if (state.moves > 0 && !finished && !confirm('Switch hard mode? This starts a new board.')) {
        hardMode = prev;
        return;
      }
      prefs.set({ ...prefs.get(), hardMode });
      await restart(false);
    });
    hintBtn.addEventListener('click', useHint);
    placeBtn.addEventListener('click', placeTile);
    muteBtn.addEventListener('click', () => {
      setMuted(!isMuted());
      muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on';
      muteBtn.setAttribute('aria-pressed', String(isMuted()));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !finished) togglePause(true);
    });
    window.addEventListener('pagehide', () => scheduleSave(true));
    await startGame(false);
    requestAnimationFrame(tick);
  }
} catch (e) {
  showError(main, errorText(e));
}
