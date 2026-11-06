// Time Attack: three minutes, as many small puzzles as you can solve.
// The server hands out the puzzles and shuffles; at the end it replays every
// move list before it counts anything.

import { api } from '../lib/api';
import { me, setPoints, shell, showError } from '../lib/shell';
import { errorText, h, modal, mount, plural, plusTag, store } from '../lib/ui';
import { ApiError } from '../lib/api';
import { Board } from '../game/board';
import { isMuted, setMuted, sfx } from '../game/sound';
import { correctCount, isCorrect, isSolved, newGame, swap, type Action, type GameState } from '@shared/engine';
import { PLUS, TIME_ATTACK, TIME_ATTACK_SETUP, timeAttackScore } from '@shared/rules';

interface RunPuzzle {
  slug: string;
  title: string;
  image: string;
  seed: number;
}
interface Run {
  runId: string | null;
  /** Free signed-in players: runs left today after this one. */
  runsLeft: number | null;
  durationMs: number;
  rows: number;
  cols: number;
  puzzles: RunPuzzle[];
}
interface Board_ {
  week: string;
  weekEnds: string;
  rows: { rank: number; username: string; score: number; solved: number; runs: number; plus: boolean; isMe: boolean }[];
  me: { score: number; runs: number; rank: number | null } | null;
}
interface Finish {
  solved: number;
  moves: number;
  score: number;
  points: number;
  pointsCapped: boolean;
  bestThisWeek: number;
  newBest: boolean;
  rank: number | null;
  balance: number;
}

const main = await shell({ title: 'Time Attack' });
const guestBest = store<number>('ss_ta_guest_best', 0);
/** Guests get the same daily allowance as free players, counted on this device. */
const guestRuns = store<{ day: string; n: number }>('ss_ta_guest_runs', { day: '', n: 0 });
const localDay = () => new Date().toLocaleDateString('en-CA');

// ---- run state ----
let run: Run | null = null;
let index = 0;
let logs: Action[][] = [];
let state: GameState;
let solved = 0;
let score = 0;
let endsAt = 0;
let over = true;
/** True once the countdown is done and the clock is running. */
let live = false;
let tick = 0;
let board: Board | null = null;
const images = new Map<number, Promise<HTMLImageElement>>();

const timeEl = h('span', { class: 'pill gold' }, '3:00');
const solvedEl = h('span', { class: 'pill dark' }, 'Solved: 0');
const scoreEl = h('span', { class: 'pill dark' }, 'Score: 0');
const titleEl = h('span', { class: 'pill dark small' }, '');
const canvas = h('canvas', { id: 'board' }) as HTMLCanvasElement;
const note = h('div', { class: 'memorize-note', hidden: true }, '');
const progressFill = h('i');
const skipBtn = h('button', { class: 'btn', onclick: () => void nextPuzzle() }, 'Skip puzzle');
const endBtn = h('button', { class: 'btn', onclick: () => void endRun() }, 'Finish now');
const muteBtn = h('button', { class: 'btn', 'aria-pressed': String(isMuted()) }, isMuted() ? 'Sound off' : 'Sound on');
muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on';
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
});

function loadImage(i: number): Promise<HTMLImageElement> {
  if (!run || i >= run.puzzles.length) return Promise.reject(new Error('No more puzzles.'));
  let p = images.get(i);
  if (!p) {
    const src = run.puzzles[i].image;
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('A puzzle image did not load.'));
      img.src = src;
    });
    p.catch(() => {});
    images.set(i, p);
  }
  return p;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function updateHud() {
  solvedEl.textContent = `Solved: ${solved}`;
  scoreEl.textContent = `Score: ${score}`;
  if (state) progressFill.style.width = `${(correctCount(state) / state.tiles.length) * 100}%`;
}

function onSwap(a: number, b: number) {
  if (over || !live || !state || isSolved(state)) return;
  const before = state.tiles.map((_, p) => isCorrect(state, p));
  const r = swap(state, a, b);
  if (!r.ok) {
    sfx.denied();
    return;
  }
  logs[index].push([a, b]);
  board!.animateSwap(a, b, [a, b].filter((p) => !before[p] && isCorrect(state, p)));
  if (r.newlyCorrect) sfx.correct(r.newlyCorrect);
  else sfx.swap();
  if (isSolved(state)) {
    solved++;
    score += timeAttackScore(state.par, state.moves);
    sfx.win('bronze');
    board!.setCompleted(true);
    updateHud();
    setTimeout(() => void nextPuzzle(), 450);
  } else updateHud();
}

async function showPuzzle(i: number) {
  if (!run) return;
  const img = await loadImage(i);
  if (over) return;
  index = i;
  logs[i] = logs[i] ?? [];
  state = newGame(run.puzzles[i].seed, TIME_ATTACK_SETUP);
  board!.setImage(img);
  board!.setCompleted(false);
  board!.setState(state);
  titleEl.textContent = `#${i + 1} · ${run.puzzles[i].title}`;
  updateHud();
  // Keep a few pictures ready ahead.
  for (let k = 1; k <= 3; k++) if (i + k < run.puzzles.length) void loadImage(i + k).catch(() => {});
}

async function nextPuzzle() {
  if (over || !run) return;
  if (index + 1 >= run.puzzles.length) return endRun();
  try {
    await showPuzzle(index + 1);
  } catch {
    // Picture failed: skip past it.
    logs[index + 1] = [];
    index++;
    void nextPuzzle();
  }
}

function startTimer() {
  endsAt = performance.now() + (run?.durationMs ?? TIME_ATTACK.durationMs);
  const step = () => {
    if (over) return;
    const left = endsAt - performance.now();
    timeEl.textContent = clock(left);
    timeEl.classList.toggle('warn', left < 15_000);
    if (left <= 0) void endRun();
    else tick = window.setTimeout(step, 200);
  };
  step();
}

async function countdown() {
  note.hidden = false;
  for (const n of ['3', '2', '1', 'Go!']) {
    note.textContent = n;
    await new Promise((r) => setTimeout(r, n === 'Go!' ? 400 : 800));
  }
  note.hidden = true;
}

function limitReached() {
  modal(
    h('h2', {}, 'That’s today’s runs'),
    h('p', {}, `Free players get ${PLUS.freeTimeAttackRuns} Time Attack runs a day. Come back tomorrow, or get SnapShift Plus for unlimited runs.`),
    h('div', { class: 'row end' }, h('a', { class: 'btn', href: '/time-attack' }, 'OK'), h('a', { class: 'btn primary', href: '/plus' }, 'See SnapShift Plus')),
  );
}

async function startRun() {
  if (!me()) {
    const g = guestRuns.get();
    const n = g.day === localDay() ? g.n : 0;
    if (n >= PLUS.freeTimeAttackRuns) return limitReached();
    guestRuns.set({ day: localDay(), n: n + 1 });
  }
  try {
    run = await api.post<Run>('/time-attack/start', {});
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return limitReached();
    showError(main, errorText(e));
    return;
  }
  images.clear();
  logs = [];
  solved = 0;
  score = 0;
  index = 0;
  renderGame();
  const first = await loadImage(0).catch(() => new Image());
  if (!board) board = new Board(canvas, first, { showCorrect: true, onSwap, onRotate: () => {} });
  live = false;
  over = false;
  timeEl.textContent = clock(run.durationMs);
  timeEl.classList.remove('warn');
  await showPuzzle(0).catch(() => {});
  board.setRevealed(true);
  await countdown();
  board.setRevealed(false);
  live = true;
  startTimer();
  canvas.focus();
}

async function endRun() {
  if (over || !run) return;
  over = true;
  live = false;
  clearTimeout(tick);
  board?.setCompleted(true);
  timeEl.textContent = '0:00';
  const played = logs.slice(0, index + 1).map((l) => l ?? []);
  if (!run.runId) {
    const best = Math.max(guestBest.get(), score);
    guestBest.set(best);
    return showResult({ solved, moves: played.reduce((n, l) => n + l.length, 0), score, points: 0, pointsCapped: false, bestThisWeek: best, newBest: score >= best && score > 0, rank: null, balance: 0 }, true);
  }
  try {
    const r = await api.post<Finish>(`/time-attack/${run.runId}/finish`, { results: played });
    setPoints(r.balance);
    showResult(r, false);
  } catch (e) {
    modal(h('h2', {}, 'Run not counted'), h('p', {}, errorText(e)), h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => location.reload() }, 'OK')));
  }
}

function showResult(r: Finish, guest: boolean) {
  const d = modal(
    h('h2', {}, r.newBest ? 'New best!' : 'Time!'),
    h(
      'div',
      { class: 'result-grid' },
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Solved'), h('b', {}, `${r.solved}`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Score'), h('b', {}, `${r.score}`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, guest ? 'Your best' : 'Best this week'), h('b', {}, `${r.bestThisWeek}`)),
    ),
    guest
      ? h('div', { class: 'notice' }, h('a', { href: '/account?next=/time-attack' }, 'Create a free account'), ' to get on the weekly leaderboard and earn points.')
      : h(
          'p',
          {},
          r.rank ? `You're #${r.rank} this week. ` : '',
          run?.runsLeft != null ? `${plural(run.runsLeft, 'free run')} left today. ` : '',
          r.points ? `+${r.points} points.` : r.pointsCapped ? 'You’ve reached today’s Time Attack points limit; your score still counts.' : '',
          r.points && r.pointsCapped ? ' (Today’s points limit reached.)' : '',
        ),
    h(
      'div',
      { class: 'row end' },
      h('a', { class: 'btn', href: '/leaderboard?tab=timeattack' }, 'Leaderboard'),
      h('button', { class: 'btn primary', onclick: () => (d.close(), void startRun()) }, 'Play again'),
    ),
  );
}

function renderGame() {
  mount(
    main,
    h(
      'div',
      { class: 'game' },
      h(
        'aside',
        { class: 'side panel', 'aria-label': 'Time Attack controls' },
        h('a', { class: 'btn', href: '/time-attack' }, '← Back'),
        h('b', { class: 'sidebar-title' }, 'Time Attack'),
        h('p', { class: 'small muted' }, `${TIME_ATTACK.rows}×${TIME_ATTACK.cols} boards. Correct tiles lock. Solve, and the next one appears.`),
        skipBtn,
        endBtn,
        muteBtn,
      ),
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'hud' }, h('div', { class: 'row' }, timeEl, solvedEl, scoreEl), h('div', { class: 'row' }, titleEl)),
        h('div', { class: `board-wrap${me()?.frame ? ` frame-${me()!.frame}` : ''}` }, canvas, note),
        h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Tiles in place' }, progressFill),
      ),
    ),
  );
}

async function intro() {
  const user = me();
  let lb: Board_ | null = null;
  try {
    lb = await api.get<Board_>('/time-attack/leaderboard');
  } catch {
    /* leaderboard is optional here */
  }
  mount(
    main,
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'stack' },
        h('h1', {}, 'Time Attack'),
        h(
          'p',
          { class: 'muted' },
          `You have ${TIME_ATTACK.durationMs / 60000} minutes to solve as many small ${TIME_ATTACK.rows}×${TIME_ATTACK.cols} puzzles as you can. Correct tiles glow and lock. ` +
            `Each solve scores ${TIME_ATTACK.perSolve}, plus up to ${TIME_ATTACK.efficiencyBonus} for using few moves. Stuck? Skip to the next picture.`,
        ),
        h(
          'p',
          { class: 'muted small' },
          `The leaderboard runs Monday to Sunday and counts your best run of the week. Signed-in players also earn ${TIME_ATTACK.pointsPerSolve} points per puzzle solved, up to ${TIME_ATTACK.dailyPointsCap} a day.`,
        ),
        !user?.member
          ? h('p', { class: 'small muted' }, `${PLUS.freeTimeAttackRuns} runs a day for free players. `, plusTag(), ' members play as many as they like.')
          : null,
        lb?.me ? h('div', { class: 'notice' }, `Your best this week: ${lb.me.score}${lb.me.rank ? ` (#${lb.me.rank})` : ''} · ${plural(lb.me.runs, 'run')}.`) : null,
        !user && guestBest.get() ? h('div', { class: 'notice' }, `Your best on this device: ${guestBest.get()}.`) : null,
        !user ? h('p', { class: 'small' }, 'Guests can play. ', h('a', { href: '/account?next=/time-attack' }, 'Sign in'), ' to go on the leaderboard and earn points.') : null,
        h('div', { class: 'row' }, h('button', { class: 'btn primary big', id: 'ta-start', onclick: () => void startRun() }, 'Start'), h('a', { class: 'btn', href: '/leaderboard?tab=timeattack' }, 'Full leaderboard')),
      ),
    ),
    lb && lb.rows.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', {}, `This week · ${lb.week} to ${lb.weekEnds}`),
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Score'), h('th', { class: 'num' }, 'Solved'))),
            h(
              'tbody',
              {},
              lb.rows.slice(0, 10).map((r) => h('tr', { class: r.isMe ? 'me' : '' }, h('td', {}, r.rank), h('td', {}, r.username, r.plus ? plusTag() : null), h('td', { class: 'num' }, r.score), h('td', { class: 'num' }, r.solved))),
            ),
          ),
        )
      : null,
  );
}

window.addEventListener('beforeunload', (e) => {
  if (!over) e.preventDefault();
});

await intro();
