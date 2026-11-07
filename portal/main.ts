// SnapShift Puzzles: portal edition. A single-screen, account-free version of
// the game for portals like CrazyGames, Poki and itch.io. It plays the bundled
// picture pack with the same engine and board as the website, and keeps medals
// on this device.

import './portal.css';
import { Board } from '@web/game/board';
import { confetti } from '@web/game/confetti';
import { isMuted, setMuted, sfx } from '@web/game/sound';
import { correctCount, formatTime, isCorrect, isSolved, newGame, rate, rotate, seedFromString, suggest, swap, randomSeed, type GameState, type Medal, type Rating } from '@shared/engine';
import { PEEK_MS, RULES, type Difficulty, type GameSetup } from '@shared/rules';
import { portal } from './sdk';
import { medalIcon } from './medal';

interface PackPuzzle {
  slug: string;
  title: string;
  category: string;
  image: string;
  thumb: string;
}
interface Pack {
  puzzles: PackPuzzle[];
  /** "Full game" banner: a link, plain text (portals that forbid links) or none. */
  banner?: 'link' | 'text' | 'none';
  /** Older builds: true = link banner. */
  link?: boolean;
  /** How many pictures the full game on the website has. */
  total?: number;
  site: string;
}
type PMode = 'classic' | 'rotation';

// ---------- tiny helpers ----------

type Child = Node | string | number | null | undefined | false | Child[];
function h(tag: string, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  };
  kids.forEach(add);
  return el;
}

function store<T>(key: string, fallback: T) {
  return {
    get(): T {
      try {
        const v = localStorage.getItem(key);
        return v ? (JSON.parse(v) as T) : fallback;
      } catch {
        return fallback;
      }
    },
    set(v: T) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage blocked */
      }
    },
  };
}

const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };
const progress = store<Record<string, Medal>>('ssp_medals', {});
const prefs = store<{ difficulty: Difficulty; mode: PMode }>('ssp_prefs', { difficulty: 'easy', mode: 'classic' });
const key = (slug: string, d: Difficulty, m: PMode) => `${slug}|${d}|${m}`;
const bestMedal = (slug: string): Medal | null => {
  let best: Medal | null = null;
  for (const [k, m] of Object.entries(progress.get())) if (k.startsWith(slug + '|') && (!best || MEDAL_RANK[m] > MEDAL_RANK[best])) best = m;
  return best;
};

function toast(text: string) {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => bad(new Error('Picture failed to load'));
    img.src = src;
  });
}

// ---------- state ----------

const app = document.getElementById('app')!;
let pack: Pack;
let filter = 'All';

/** Puzzle of the day: the same picture for everyone on a given date. */
function dailyPick(): PackPuzzle {
  const day = new Date().toLocaleDateString('en-CA');
  return pack.puzzles[seedFromString('daily:' + day) % pack.puzzles.length];
}

// ---------- "full game" banner ----------

function bannerMode(): 'link' | 'text' | 'none' {
  return pack.banner ?? (pack.link ? 'link' : 'none');
}

/** Announces the full game on the website. `compact` for the win screen. */
function fullGameBanner(compact = false): HTMLElement | null {
  const mode = bannerMode();
  if (mode === 'none') return null;
  const total = Math.max(pack.total ?? 0, pack.puzzles.length);
  const count = total > pack.puzzles.length ? `${Math.floor(total / 10) * 10}+ pictures` : 'More pictures';
  const text = h(
    'span',
    { class: 'fg-text' },
    h('b', {}, compact ? 'Want more?' : 'Play the full game, free'),
    h('span', {}, compact ? `${count}, a daily challenge and leaderboards at snapshiftpuzzles.com` : `${count} with new ones every week, a daily challenge, streaks, achievements and leaderboards.`),
  );
  const icon = h('img', { class: 'fg-icon', src: './icon.png', alt: '' });
  if (mode === 'text') return h('div', { class: `full-game${compact ? ' compact' : ''}` }, icon, text, h('span', { class: 'fg-site' }, 'snapshiftpuzzles.com'));
  return h(
    'a',
    { class: `full-game${compact ? ' compact' : ''}`, href: pack.site, target: '_blank', rel: 'noopener' },
    icon,
    text,
    h('span', { class: 'btn primary fg-btn' }, compact ? 'Visit →' : 'Play full game →'),
  );
}

// ---------- menu ----------

function menu() {
  portal.stop();
  const p = prefs.get();
  const seg = <T extends string>(opts: [T, string][], cur: T, set: (v: T) => void) =>
    h(
      'div',
      { class: 'seg', role: 'group' },
      opts.map(([v, label]) => h('button', { class: 'btn', 'aria-pressed': String(v === cur), onclick: () => (set(v), menu()) }, label)),
    );
  const cats = ['All', ...new Set(pack.puzzles.map((x) => x.category))];
  const list = pack.puzzles.filter((x) => filter === 'All' || x.category === filter);
  const daily = dailyPick();
  // One medal per difficulty you've finished the picture on (your best there).
  const medals = (slug: string) => {
    const all = progress.get();
    const got = (['easy', 'medium', 'hard'] as Difficulty[]).flatMap((d) => {
      const ms = (['classic', 'rotation'] as PMode[]).map((m) => all[key(slug, d, m)]).filter(Boolean) as Medal[];
      if (!ms.length) return [];
      const best = ms.sort((a, b) => MEDAL_RANK[b] - MEDAL_RANK[a])[0];
      return [medalIcon(best, 26, `${RULES[d].label}: ${best} medal`)];
    });
    return got.length ? h('span', { class: 'medals' }, got) : null;
  };
  const done = pack.puzzles.filter((x) => bestMedal(x.slug)).length;
  const tally = { gold: 0, silver: 0, bronze: 0 } as Record<Medal, number>;
  for (const m of Object.values(progress.get())) tally[m]++;
  app.className = '';
  app.replaceChildren(
    h(
      'div',
      { class: 'bar' },
      h('img', { class: 'logo', src: './logo.png', alt: 'SnapShift Puzzles' }),
      h('span', { class: 'grow' }),
      seg<Difficulty>([['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], p.difficulty, (d) => prefs.set({ ...prefs.get(), difficulty: d })),
      seg<PMode>([['classic', 'Classic'], ['rotation', 'Rotation']], p.mode, (m) => prefs.set({ ...prefs.get(), mode: m })),
      soundButton(),
    ),
    h(
      'div',
      { class: 'scroll' },
      fullGameBanner(),
      h(
        'div',
        { class: 'daily' },
        h('img', { src: daily.thumb, alt: '' }),
        h(
          'div',
          {},
          h('b', {}, '🧩 Puzzle of the day'),
          h('div', { class: 'muted small' }, daily.title),
          h('div', { style: 'margin-top:6px' }, h('button', { class: 'btn primary', onclick: () => void play(daily) }, 'Play')),
        ),
      ),
      h(
        'div',
        { class: 'spread' },
        h('h1', {}, 'Pick a picture'),
        h(
          'span',
          { class: 'tally' },
          (['gold', 'silver', 'bronze'] as Medal[]).map((m) => h('span', { class: 'tally-item' }, medalIcon(m, 24), h('b', {}, tally[m]))),
          h('span', { class: 'muted small' }, `${done} of ${pack.puzzles.length} pictures`),
        ),
      ),
      h(
        'div',
        { class: 'filters' },
        cats.map((c) => h('button', { class: 'btn', 'aria-pressed': String(c === filter), onclick: () => ((filter = c), menu()) }, c)),
      ),
      h(
        'div',
        { class: 'grid' },
        list.map((x) =>
          h(
            'button',
            { class: 'card', onclick: () => void play(x) },
            h('img', { src: x.thumb, alt: '', loading: 'lazy' }),
            medals(x.slug),
            h('span', { class: 'meta' }, h('b', {}, x.title), h('span', { class: 'muted small' }, x.category)),
          ),
        ),
      ),
    ),
  );
}

function soundButton(): HTMLElement {
  const b = h('button', { class: 'btn', 'aria-pressed': String(!isMuted()), title: 'Sound' }, isMuted() ? '🔇' : '🔊');
  b.addEventListener('click', () => {
    setMuted(!isMuted());
    b.textContent = isMuted() ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', String(!isMuted()));
  });
  return b;
}

// ---------- game ----------

let board: Board | null = null;
let state: GameState;
let startedAt = 0;
let elapsedBefore = 0;
let finished = false;
let tickHandle = 0;
let lastHint = 0;
let lastPeek = 0;
/** The current game's move handlers (used by the self-test). */
let moveHandlers: { swap(a: number, b: number): void; rotate(p: number): void } | null = null;

const elapsed = () => elapsedBefore + (startedAt ? performance.now() - startedAt : 0);

async function play(p: PackPuzzle) {
  const { difficulty, mode } = prefs.get();
  const setup: GameSetup = { version: 2, difficulty, mode, daily: false, hardMode: false };
  app.className = 'loading';
  app.replaceChildren(h('div', { class: 'spinner', 'aria-label': 'Loading' }));
  let img: HTMLImageElement;
  try {
    img = await loadImage(p.image);
  } catch {
    toast('That picture didn’t load. Try another.');
    return menu();
  }
  state = newGame(randomSeed(), setup);
  finished = false;
  startedAt = 0;
  elapsedBefore = 0;
  const rules = state.rules;

  const timeEl = h('span', { class: 'pill' }, '0:00');
  const movesEl = h('span', { class: 'pill' }, '0 moves');
  const fill = h('i');
  const canvas = h('canvas', { id: 'board', tabindex: '0' }) as HTMLCanvasElement;
  const stage = h('div', { class: 'stage' }, h('div', { class: 'board-wrap' }, canvas), h('div', { class: 'preview' }, h('img', { src: p.image, alt: '' })));
  const hintBtn = h('button', { class: 'btn' }, '💡 Hint') as HTMLButtonElement;
  const peekBtn = h('button', { class: 'btn' }, '👁 Peek') as HTMLButtonElement;
  app.className = '';
  app.replaceChildren(
    h(
      'div',
      { class: 'bar' },
      h('button', { class: 'btn', onclick: () => leave() }, '← Pictures'),
      h('b', { class: 'grow' }, p.title, h('span', { class: 'muted small' }, ` · ${RULES[difficulty].label}${mode === 'rotation' ? ' · Rotation' : ''}`)),
      timeEl,
      movesEl,
      hintBtn,
      rules.preview !== 'always' ? peekBtn : null,
      h('button', { class: 'btn', onclick: () => void play(p) }, '↻'),
      soundButton(),
    ),
    h('div', { class: 'game' }, stage, h('div', { class: 'progress' }, fill)),
  );

  const hud = () => {
    movesEl.textContent = `${state.moves} moves`;
    fill.style.width = `${(correctCount(state) / state.tiles.length) * 100}%`;
  };
  const begin = () => {
    if (!startedAt && !finished) startedAt = performance.now();
    portal.start();
  };
  const after = (r: { newlyCorrect: number }) => {
    if (r.newlyCorrect) sfx.correct(r.newlyCorrect);
    else sfx.swap();
    hud();
    if (isSolved(state)) void win(p, img, setup);
  };
  const onSwap = (a: number, b: number) => {
    if (finished) return;
    begin();
    const before = state.tiles.map((_, q) => isCorrect(state, q));
    const r = swap(state, a, b);
    if (!r.ok) return sfx.denied();
    board!.animateSwap(a, b, [a, b].filter((q) => !before[q] && isCorrect(state, q)));
    after(r);
  };
  const onRotate = (q: number) => {
    if (finished) return;
    begin();
    const before = isCorrect(state, q);
    const r = rotate(state, q);
    if (!r.ok) return sfx.denied();
    board!.animateRotate(q, !before && isCorrect(state, q));
    after(r);
  };

  moveHandlers = { swap: onSwap, rotate: onRotate };
  board = new Board(canvas, img, { showCorrect: rules.glow, onSwap, onRotate });
  board.setState(state);
  board.setShowCorrect(rules.glow);
  board.setCompleted(false);
  hud();

  // Hard hides the picture: show it for a moment first.
  if (rules.preview === 'hidden') {
    board.setRevealed(true);
    setTimeout(() => board?.setRevealed(false), 2500);
  }

  const cooldown = RULES[difficulty].hintCooldownMs;
  hintBtn.addEventListener('click', () => {
    if (finished) return;
    const wait = lastHint + cooldown - Date.now();
    if (wait > 0) return toast(`Next hint in ${Math.ceil(wait / 1000)} s`);
    const m = suggest(state);
    if (!m) return;
    lastHint = Date.now();
    begin();
    board!.showHint(m.kind === 'swap' ? [m.a, m.b] : [m.p]);
  });
  peekBtn.addEventListener('click', () => {
    if (finished) return;
    const wait = lastPeek + 10_000 - Date.now();
    if (wait > 0) return toast(`Peek again in ${Math.ceil(wait / 1000)} s`);
    lastPeek = Date.now();
    board!.setRevealed(true);
    setTimeout(() => board?.setRevealed(false), PEEK_MS);
  });

  clearInterval(tickHandle);
  tickHandle = window.setInterval(() => (timeEl.textContent = formatTime(elapsed()).replace(/\.\d$/, '')), 250);
  canvas.focus({ preventScroll: true });
}

function leave() {
  clearInterval(tickHandle);
  board = null;
  menu();
}

async function win(p: PackPuzzle, img: HTMLImageElement, setup: GameSetup) {
  finished = true;
  elapsedBefore = elapsed();
  startedAt = 0;
  clearInterval(tickHandle);
  portal.stop();
  const rating: Rating = rate(setup.difficulty, state, elapsedBefore);
  const k = key(p.slug, setup.difficulty, setup.mode as PMode);
  const all = progress.get();
  const prev = all[k];
  const improved = !prev || MEDAL_RANK[rating.medal] > MEDAL_RANK[prev];
  if (improved) progress.set({ ...all, [k]: rating.medal });
  board!.setCompleted(true);
  await board!.celebrate();
  sfx.win(rating.medal);
  confetti(rating.medal);
  portal.celebrate();
  void img;

  const idx = pack.puzzles.indexOf(p);
  const nextPuzzle = pack.puzzles[(idx + 1) % pack.puzzles.length];
  const next = async () => {
    overlay.remove();
    const wasMuted = isMuted();
    await portal.breakBetween((m) => setMuted(m || wasMuted));
    void play(nextPuzzle);
  };
  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-label': 'Puzzle solved' },
      h('div', { class: `big-medal ${rating.medal}` }, medalIcon(rating.medal, 96)),
      h('h1', {}, `${rating.medal[0].toUpperCase() + rating.medal.slice(1)} medal!`),
      h('div', { class: 'muted' }, `${p.title} · ${RULES[setup.difficulty].label}${setup.mode === 'rotation' ? ' · Rotation' : ''}`),
      h(
        'div',
        { class: 'stats' },
        h('div', {}, h('span', { class: 'muted small' }, 'Score'), h('b', {}, `${rating.scorePct}%`)),
        h('div', {}, h('span', { class: 'muted small' }, 'Moves'), h('b', {}, state.moves)),
        h('div', {}, h('span', { class: 'muted small' }, 'Time'), h('b', {}, formatTime(elapsedBefore).replace(/\.\d$/, ''))),
      ),
      prev && !improved ? h('p', { class: 'small muted' }, `Your best here is ${prev}.`) : improved && prev ? h('p', { class: 'small' }, `New best! (was ${prev})`) : null,
      rating.medal !== 'gold' ? h('p', { class: 'small muted' }, 'Gold needs few moves and a quick time. Have another go!') : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => (overlay.remove(), leave()) }, 'Pictures'),
        h('button', { class: 'btn', onclick: () => (overlay.remove(), void play(p)) }, 'Play again'),
        h('button', { class: 'btn primary', onclick: () => void next() }, 'Next picture →'),
      ),
      fullGameBanner(true),
    ),
  );
  document.querySelector('.stage')?.append(overlay);
}

// ---------- start ----------

document.addEventListener('visibilitychange', () => {
  if (!board || finished) return;
  if (document.hidden && startedAt) {
    elapsedBefore = elapsed();
    startedAt = 0;
    portal.stop();
  }
});
// Portals' own keys (space, arrows) shouldn't scroll the page around the game.
window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target === document.body) e.preventDefault();
});

await portal.init();
try {
  pack = (await (await fetch('./pack.json')).json()) as Pack;
  if (!pack.puzzles?.length) throw new Error('empty pack');
} catch {
  app.className = 'loading';
  app.replaceChildren(h('p', {}, 'The pictures couldn’t be loaded. Please refresh.'));
  throw new Error('pack missing');
}
portal.loaded();
menu();

// Automated test hook (?selftest): solve the current board with the engine's own suggestions.
if (new URLSearchParams(location.search).has('selftest')) {
  (window as unknown as { __ssp: unknown }).__ssp = {
    solve() {
      for (let m = suggest(state); m && !isSolved(state); m = suggest(state)) {
        if (m.kind === 'swap') moveHandlers!.swap(m.a, m.b);
        else moveHandlers!.rotate(m.p);
      }
    },
  };
}
