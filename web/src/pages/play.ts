import { api, ApiError } from '../lib/api';
import { me, setPoints, shell, showError } from '../lib/shell';
import { bg, errorText, h, medalBadge, modal, mount, qs, store, toast } from '../lib/ui';
import { Board } from '../game/board';
import { isMuted, setMuted, sfx } from '../game/sound';
import {
  applySuggestion,
  correctCount,
  formatTime,
  isCorrect,
  isSolved,
  randomSeed,
  rate,
  replay,
  rotate,
  seedFromString,
  suggest,
  swap,
  winPoints,
  type Action,
  type GameState,
  type Rating,
  type Suggestion,
} from '@shared/engine';
import {
  DIFFICULTIES,
  ENGINE_VERSION,
  gameRules,
  MEMORIZE_MS,
  MODE_LABELS,
  MODES,
  PEEK_COOLDOWN_MS,
  PEEK_MS,
  RULES,
  ZEN_POINTS,
  type Difficulty,
  type EngineVersion,
  type GameRules,
  type GameSetup,
  type Mode,
} from '@shared/rules';

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

interface Done {
  medal: string | null;
  scorePct: number | null;
  moves: number;
  elapsedMs: number;
}

interface ServerPlay {
  id: string;
  seed: number;
  difficulty: Difficulty;
  mode: Mode;
  engine: EngineVersion;
  hardMode: boolean;
  daily: string | null;
  actions: Action[];
  elapsedMs: number;
  completed: boolean;
  result: (Done & { points: number; score: number; completedAt: number }) | null;
}

interface CompleteResult {
  rating: Rating | null;
  zen: boolean;
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

interface GuestSave {
  seed: number;
  actions: Action[];
  elapsedMs: number;
  version?: EngineVersion;
  completed?: Done;
}

const main = await shell({ bodyClass: 'game-page' });
const user = me();
const dailyDay = qs('daily');
const slug = qs('p');
const prefs = store('ss_play_prefs', { difficulty: 'easy' as Difficulty, mode: 'classic' as Mode });
const guestSaves = store<Record<string, GuestSave>>('ss_guest_games', {});

let puzzle!: PuzzleInfo;
let difficulty: Difficulty = dailyDay ? 'hard' : DIFFICULTIES.includes(qs('d') as Difficulty) ? (qs('d') as Difficulty) : prefs.get().difficulty;
let mode: Mode = dailyDay ? 'classic' : MODES.includes(qs('m') as Mode) ? (qs('m') as Mode) : (prefs.get().mode ?? 'classic');
let setup: GameSetup = { version: ENGINE_VERSION, difficulty, mode, daily: !!dailyDay, hardMode: false };
let rules: GameRules = gameRules(setup);
let seed = 0;
let play: ServerPlay | null = null;
let state: GameState;
let actions: Action[] = [];
let elapsedBase = 0;
let runningSince = 0;
let paused = false;
let finished = false;
let memorizing = 0;
let saveTimer = 0;
let lastHintAt = 0;
let lastPeekAt = 0;
let board: Board;
let image: HTMLImageElement;

// ---------- UI elements ----------
const timeEl = h('span', { class: 'pill' }, 'Time: 00:00.0');
const modeEl = h('span', { class: 'pill' }, '');
const scoreEl = h('span', { class: 'pill' }, 'Score: 0');
const streakEl = h('span', { class: 'pill' }, 'Streak: 0');
const movesEl = h('span', { class: 'pill dark' }, 'Moves: 0');
const saveEl = h('span', { class: 'pill dark small' }, '');
const progressFill = h('i');
const canvas = h('canvas', { id: 'board' }) as HTMLCanvasElement;
const memorizeNote = h('div', { class: 'memorize-note', hidden: true }, 'Memorize the picture…');
const wrap = h(
  'div',
  { class: 'board-wrap' },
  canvas,
  memorizeNote,
  h('div', { class: 'pause-cover' }, h('button', { class: 'btn big primary', onclick: () => togglePause(false) }, 'Resume')),
);
const diffSel = h('select', { 'aria-label': 'Difficulty' }) as HTMLSelectElement;
const modeSel = h('select', { 'aria-label': 'Mode' }, MODES.map((m) => h('option', { value: m }, `${MODE_LABELS[m]} mode`))) as HTMLSelectElement;
const hintBtn = h('button', { class: 'btn' }, 'Hint');
const placeBtn = h('button', { class: 'btn' }, 'Place 1 tile');
const peekBtn = h('button', { class: 'btn', title: 'Show the finished picture for a moment' }, 'Peek');
const pauseBtn = h('button', { class: 'btn', onclick: () => togglePause() }, 'Pause');
const muteBtn = h('button', { class: 'btn', 'aria-pressed': String(isMuted()) }, isMuted() ? 'Sound off' : 'Sound on');
const preview = h('div', { class: 'preview', title: 'The finished picture' });
const doneBar = h('div', { class: 'notice done-bar', hidden: true });
const helpText = h('p', { class: 'small muted', style: 'margin-top:8px' });

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

const guestBase = () => (dailyDay ? 'daily:' + dailyDay : slug);
const guestKey = () => `${guestBase()}:${difficulty}:${mode}:v2`;

/** Guest save for the current difficulty/mode, including games saved before modes existed. */
function guestSave(): (GuestSave & { key: string }) | null {
  const saves = guestSaves.get();
  const v2 = saves[guestKey()];
  if (v2) return { ...v2, version: 2, key: guestKey() };
  const old = mode === 'classic' ? saves[`${guestBase()}:${difficulty}:n`] : undefined;
  return old ? { ...old, version: 1, key: `${guestBase()}:${difficulty}:n` } : null;
}

/** Start or resume a game (server-backed when signed in, local for guests). */
async function startGame(fresh = false): Promise<void> {
  finished = false;
  lastHintAt = 0;
  stopMemorize();
  let done: Done | null = null;
  if (user) {
    const r = await api.post<{ play: ServerPlay; resumed: boolean }>('/plays', {
      puzzle: puzzle.slug,
      difficulty,
      mode,
      daily: dailyDay || undefined,
      fresh,
    });
    play = r.play;
    seed = play.seed;
    difficulty = play.difficulty;
    mode = play.mode;
    setup = { version: play.engine, difficulty, mode, daily: !!play.daily, hardMode: play.hardMode };
    actions = play.actions;
    elapsedBase = play.elapsedMs;
    done = play.completed ? play.result : null;
    if (r.resumed && actions.length) toast('Welcome back', 'Picked up where you left off.');
  } else {
    const saved = fresh ? null : guestSave();
    if (fresh) {
      const saves = guestSaves.get();
      delete saves[guestKey()];
      guestSaves.set(saves);
    }
    seed = dailyDay ? seedFromString('daily:' + dailyDay) : (saved?.seed ?? randomSeed());
    setup = { version: saved?.version ?? ENGINE_VERSION, difficulty, mode, daily: !!dailyDay, hardMode: false };
    actions = saved?.actions ?? [];
    elapsedBase = saved?.elapsedMs ?? 0;
    done = saved?.completed ?? null;
  }
  rules = gameRules(setup);
  const r = replay(seed, setup, actions);
  if (r.invalidAt !== -1) {
    actions = actions.slice(0, r.invalidAt);
    state = replay(seed, setup, actions).state;
  } else state = r.state;
  runningSince = 0;
  board.setState(state);
  board.setShowCorrect(rules.glow);
  syncControls();
  if (done && isSolved(state)) {
    showCompleted(done);
    updateHud();
    return;
  }
  showCompleted(null);
  updateHud();
  // A brand-new board: show the finished picture first, then start the clock.
  if (state.moves === 0 && actions.length === 0) startMemorize();
  else if (!paused) runningSince = performance.now();
}

function startMemorize() {
  board.setRevealed(true);
  memorizeNote.hidden = false;
  memorizing = window.setTimeout(() => {
    stopMemorize();
    if (!paused && !finished) runningSince = performance.now();
  }, MEMORIZE_MS);
}

function stopMemorize() {
  if (memorizing) clearTimeout(memorizing);
  memorizing = 0;
  memorizeNote.hidden = true;
  board?.setRevealed(false);
}

/** Show (or clear) the finished state: whole picture, a "Completed" bar and Play again. */
function showCompleted(done: Done | null) {
  finished = !!done;
  board.setCompleted(!!done);
  for (const b of [hintBtn, placeBtn, pauseBtn, peekBtn]) b.toggleAttribute('disabled', !!done);
  if (!done) {
    doneBar.hidden = true;
    return;
  }
  elapsedBase = done.elapsedMs;
  runningSince = 0;
  const label = done.medal ? done.medal[0].toUpperCase() + done.medal.slice(1) : '';
  const summary = rules.timed
    ? ` ${label} · ${done.scorePct}% overall · ${done.moves} moves · ${formatTime(done.elapsedMs)}`
    : ` ${MODE_LABELS[mode]} · ${done.moves} moves`;
  mount(
    doneBar,
    h(
      'div',
      { class: 'spread' },
      h('span', {}, h('b', {}, '✓ Completed'), ' ', done.medal ? medalBadge(done.medal, true) : null, summary),
      h(
        'span',
        { class: 'row' },
        puzzle.next && !dailyDay ? h('a', { class: 'btn', href: `/play?p=${encodeURIComponent(puzzle.next.slug)}&d=${difficulty}&m=${mode}` }, 'Next puzzle →') : null,
        h('button', { class: 'btn primary', onclick: () => void restart(true) }, 'Play again'),
      ),
    ),
  );
  doneBar.hidden = false;
}

function elapsed(): number {
  return elapsedBase + (runningSince ? performance.now() - runningSince : 0);
}

function updateHud() {
  timeEl.textContent = `Time: ${formatTime(elapsed())}`;
  scoreEl.textContent = `Score: ${state.score}`;
  streakEl.textContent = `Streak: ${state.streak}`;
  movesEl.textContent = `Moves: ${state.moves}`;
  progressFill.style.width = `${(correctCount(state) / state.tiles.length) * 100}%`;
}

function tick() {
  if (state && runningSince && !finished && rules.timed) timeEl.textContent = `Time: ${formatTime(elapsed())}`;
  requestAnimationFrame(tick);
}

function syncControls() {
  const r = (d: Difficulty) => gameRules({ ...setup, difficulty: d });
  mount(
    diffSel,
    DIFFICULTIES.map((d) => h('option', { value: d, selected: d === difficulty }, `${RULES[d].label} (${r(d).rows}×${r(d).cols})`)),
  );
  diffSel.disabled = !!dailyDay;
  modeSel.value = mode;
  modeSel.hidden = !!dailyDay || setup.version === 1;
  placeBtn.hidden = !rules.placeAllowed;
  peekBtn.hidden = rules.preview !== 'peek';
  pauseBtn.hidden = !rules.timed;
  preview.hidden = rules.preview !== 'always';
  for (const el of [timeEl, scoreEl, streakEl]) el.hidden = !rules.timed;
  modeEl.textContent = dailyDay ? `Daily · ${dailyDay}` : `${puzzle.categoryName || 'Puzzle'} · ${MODE_LABELS[mode]}`;
  hintBtn.textContent = rules.hintCost ? `Hint (${rules.hintCost} pts)` : 'Hint (free)';
  placeBtn.textContent = rules.placeCost ? `Place 1 tile (${rules.placeCost} pts)` : 'Place 1 tile (free)';
  const lockText = rules.lock ? 'Tiles lock when they land in the right place.' : 'Tiles do not lock on this difficulty: a correct tile can be swapped out again.';
  helpText.textContent = rules.rotation
    ? `Drag a tile onto another to swap them; tap a tile to turn it. A tile is right when it's in place and upright. ${lockText} Keyboard: arrows, Enter to swap, R to rotate.`
    : `Drag a tile onto another to swap them, or click two tiles. ${lockText} Keyboard: arrows + Enter.`;
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
      const key = setup.version === 1 ? `${guestBase()}:${difficulty}:n` : guestKey();
      saves[key] = { seed, actions, elapsedMs: Math.round(elapsed()), version: setup.version };
      guestSaves.set(saves);
      saveEl.textContent = 'Saved on this device';
    }
  };
  if (now) void doSave();
  else saveTimer = window.setTimeout(doSave, 1500);
}

function afterMove(r: { ok: boolean; newlyCorrect: number }) {
  if (r.newlyCorrect) sfx.correct(r.newlyCorrect);
  else sfx.swap();
  updateHud();
  if (isSolved(state)) void finish();
  else scheduleSave();
}

function beginClock() {
  if (memorizing) stopMemorize();
  if (!runningSince && !paused) runningSince = performance.now();
}

function onSwap(a: number, b: number) {
  if (finished || paused) return;
  beginClock();
  const before = state.tiles.map((_, p) => isCorrect(state, p));
  const r = swap(state, a, b);
  if (!r.ok) {
    sfx.denied();
    return;
  }
  actions.push([a, b]);
  board.animateSwap(a, b, [a, b].filter((p) => !before[p] && isCorrect(state, p)));
  afterMove(r);
}

function onRotate(p: number) {
  if (finished || paused) return;
  beginClock();
  const before = isCorrect(state, p);
  const r = rotate(state, p);
  if (!r.ok) {
    sfx.denied();
    return;
  }
  actions.push(['r', p]);
  board.animateRotate(p, !before && isCorrect(state, p));
  afterMove(r);
}

const hintPositions = (m: Suggestion) => (m.kind === 'swap' ? [m.a, m.b] : [m.p]);

async function useHint() {
  if (finished) return;
  if (Date.now() - lastHintAt < rules.hintCooldownMs) {
    toast('Hint cooling down', `Ready in ${Math.ceil((rules.hintCooldownMs - (Date.now() - lastHintAt)) / 1000)}s.`);
    return;
  }
  if (!user) {
    if (rules.hintCost > 0) return signInPrompt(`use hints on ${dailyDay ? 'the daily challenge' : `${RULES[difficulty].label}`} (they cost points)`);
    const m = suggest(state);
    if (m) {
      actions.push(['hint']);
      state.hints++;
      board.showHint(hintPositions(m));
      lastHintAt = Date.now();
    }
    return;
  }
  try {
    const r = await api.post<{ move: Suggestion; cost: number; points: number }>(`/plays/${play!.id}/hint`, { actions });
    actions.push(['hint']);
    state.hints++;
    board.showHint(hintPositions(r.move));
    lastHintAt = Date.now();
    setPoints(r.points);
    if (r.cost) toast('Hint used', `−${r.cost} points`);
  } catch (e) {
    toast('No hint', errorText(e), 'bad');
  }
}

async function placeTile() {
  if (finished || !rules.placeAllowed) return;
  if (!user && rules.placeCost > 0) return signInPrompt('use the place-a-tile helper (it costs points)');
  beginClock();
  let move: Suggestion | null;
  let cost = 0;
  if (user) {
    try {
      const r = await api.post<{ move: Suggestion; cost: number; points: number }>(`/plays/${play!.id}/place`, { actions });
      move = r.move;
      cost = r.cost;
      setPoints(r.points);
    } catch (e) {
      toast('Could not place a tile', errorText(e), 'bad');
      return;
    }
  } else move = suggest(state);
  if (!move) return;
  const before = state.tiles.map((_, p) => isCorrect(state, p));
  const r = applySuggestion(state, move);
  state.places++;
  actions.push(['place']);
  if (move.kind === 'swap') board.animateSwap(move.a, move.b, [move.a, move.b].filter((p) => !before[p] && isCorrect(state, p)));
  else board.animateRotate(move.p, !before[move.p] && isCorrect(state, move.p));
  if (cost) toast('Tile placed', `−${cost} points`);
  afterMove(r);
  scheduleSave(true);
}

function peek() {
  if (finished || memorizing) return;
  const wait = lastPeekAt + PEEK_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    toast('Peek cooling down', `Ready in ${Math.ceil(wait / 1000)}s.`);
    return;
  }
  lastPeekAt = Date.now();
  board.setRevealed(true);
  setTimeout(() => board.setRevealed(false), PEEK_MS);
}

function signInPrompt(what: string) {
  modal(
    h('h2', {}, 'Sign in to continue'),
    h('p', { class: 'muted' }, `Sign in to ${what}. Your account keeps points, unlocks, streaks and progress on every device.`),
    h('div', { class: 'row end' }, h('a', { class: 'btn primary', href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Sign in')),
  );
}

function togglePause(force?: boolean) {
  if (finished || !rules.timed) return;
  const next = force ?? !paused;
  if (next === paused) return;
  paused = next;
  if (paused) {
    elapsedBase = elapsed();
    runningSince = 0;
    scheduleSave(true);
  } else if (!memorizing) runningSince = performance.now();
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
    const rating = rules.timed ? rate(difficulty, state, elapsedBase) : null;
    const done: Done = { medal: rating?.medal ?? null, scorePct: rating?.scorePct ?? null, moves: state.moves, elapsedMs: Math.round(elapsedBase) };
    const saves = guestSaves.get();
    saves[setup.version === 1 ? `${guestBase()}:${difficulty}:n` : guestKey()] = { seed, actions, elapsedMs: done.elapsedMs, version: setup.version, completed: done };
    guestSaves.set(saves);
    showCompleted(done);
    sfx.win(rating?.medal ?? 'silver');
    showResult(
      {
        rating,
        zen: !rules.timed,
        elapsedMs: elapsedBase,
        moves: state.moves,
        score: state.score,
        points: rules.timed ? winPoints(difficulty, rules, { medal: rating?.medal ?? null, elapsedMs: elapsedBase }, setup.version) : ZEN_POINTS,
        firstClear: true,
        dailyBonus: 0,
        milestone: null,
        streak: null,
        rank: null,
        balance: 0,
      },
      true,
    );
    return;
  }
  try {
    const r = await api.post<CompleteResult>(`/plays/${play!.id}/complete`, { actions, elapsedMs: Math.round(elapsedBase) });
    setPoints(r.balance);
    showCompleted({ medal: r.rating?.medal ?? null, scorePct: r.rating?.scorePct ?? null, moves: r.moves, elapsedMs: r.elapsedMs });
    sfx.win(r.rating?.medal ?? 'silver');
    showResult(r, false);
  } catch (e) {
    toast('Could not record your finish', errorText(e), 'bad');
  }
}

function showResult(r: CompleteResult, guest: boolean) {
  const rating = r.rating;
  const label = rating ? rating.medal[0].toUpperCase() + rating.medal.slice(1) : '';
  const subtitle = `${puzzle.title} · ${RULES[difficulty].label} · ${MODE_LABELS[mode]}`;
  const share = async () => {
    const what = dailyDay ? `the SnapShift daily (${dailyDay})` : `“${puzzle.title}” on SnapShift (${RULES[difficulty].label}, ${MODE_LABELS[mode]})`;
    const text = rating
      ? `I solved ${what} in ${formatTime(r.elapsedMs)}: ${label} medal, ${rating.scorePct}%. ${location.origin}${dailyDay ? '/daily' : ''}`
      : `I solved ${what}. ${location.origin}`;
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
    rating ? h('div', { class: `result-medal ${rating.medal}` }, medalBadge(rating.medal), h('span', { class: 'medal-name' }, `${rating.medal} medal`)) : h('div', { class: 'result-medal', style: 'font-size:48px' }, '✓'),
    h('h2', { style: 'text-align:center' }, rating ? `${label} medal!` : 'Puzzle complete'),
    h('p', { class: 'muted', style: 'text-align:center' }, subtitle),
    rating
      ? h(
          'div',
          { class: 'result-grid' },
          h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Overall'), h('b', {}, `${rating.scorePct}%`)),
          h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Moves'), h('b', {}, `${r.moves}`), h('span', { class: 'small muted' }, `${rating.moveEffPct}% efficient`)),
          h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Time'), h('b', {}, formatTime(r.elapsedMs)), h('span', { class: 'small muted' }, `${rating.speedEffPct}% speed`)),
        )
      : h('p', { style: 'text-align:center' }, `${r.moves} moves. Nicely done.`),
    guest
      ? h('div', { class: 'notice' }, `That run would have earned ${r.points} points. `, h('a', { href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Create a free account'), ' to keep points, unlock puzzles and join the leaderboard.')
      : h(
          'div',
          { class: 'notice' },
          h('b', {}, `+${r.points + r.dailyBonus} points`),
          r.firstClear ? '' : r.zen ? ' (Zen pays once per puzzle)' : ' (replay rate)',
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
      puzzle.next
        ? h('a', { class: 'btn primary', href: `/play?p=${encodeURIComponent(puzzle.next.slug)}&d=${difficulty}&m=${mode}` }, 'Next puzzle →')
        : h('a', { class: 'btn primary', href: puzzle.categoryId ? `/category?c=${puzzle.categoryId}` : '/' }, 'More puzzles'),
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

/** Switch difficulty or mode: keeps any game already saved for that combination. */
async function switchTo(next: { difficulty?: Difficulty; mode?: Mode }) {
  if (state.moves > 0 && !finished && !confirm('Switch? This game stays saved and you can come back to it.')) {
    syncControls();
    return;
  }
  scheduleSave(true);
  difficulty = next.difficulty ?? difficulty;
  mode = next.mode ?? mode;
  setup = { ...setup, version: ENGINE_VERSION, difficulty, mode, hardMode: false };
  prefs.set({ difficulty, mode });
  const url = new URL(location.href);
  if (!dailyDay) {
    url.searchParams.set('d', difficulty);
    url.searchParams.set('m', mode);
    history.replaceState(null, '', url);
  }
  await restart(false);
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
          diffSel,
          modeSel,
          h('button', { class: 'btn', onclick: () => restart(true) }, 'Shuffle / restart'),
          hintBtn,
          peekBtn,
          placeBtn,
          pauseBtn,
          h('button', { class: 'btn', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.()) }, 'Full screen'),
          muteBtn,
          h('a', { class: 'btn', href: '/how-to-play', target: '_blank' }, 'How to play'),
        ),
        h(
          'section',
          { class: 'panel' },
          h('div', { class: 'hud' }, h('div', { class: 'row' }, timeEl, modeEl, scoreEl, streakEl, movesEl), h('div', { class: 'row' }, saveEl)),
          doneBar,
          wrap,
          h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Tiles in place' }, progressFill),
          helpText,
        ),
      ),
    );
    board = new Board(canvas, image, { showCorrect: rules.glow, onSwap, onRotate });
    diffSel.addEventListener('change', () => void switchTo({ difficulty: diffSel.value as Difficulty }));
    modeSel.addEventListener('change', () => void switchTo({ mode: modeSel.value as Mode }));
    hintBtn.addEventListener('click', useHint);
    placeBtn.addEventListener('click', placeTile);
    peekBtn.addEventListener('click', peek);
    muteBtn.addEventListener('click', () => {
      setMuted(!isMuted());
      muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on';
      muteBtn.setAttribute('aria-pressed', String(isMuted()));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !finished) togglePause(true);
    });
    window.addEventListener('pagehide', () => scheduleSave(true));
    syncControls(); // show the right controls for the chosen mode straight away
    await startGame(false);
    requestAnimationFrame(tick);
  }
} catch (e) {
  showError(main, errorText(e));
}
