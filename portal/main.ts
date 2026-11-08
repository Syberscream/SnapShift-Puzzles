// SnapShift Puzzles: portal edition (CrazyGames, Poki, itch.io …).
// A level-based casual game: picture packs on a map, levels that unlock one by
// one, three stars per level, a puzzle of the day, music and effects. Uses the
// same puzzle engine and board as the website; progress stays on the device.

import '@fontsource-variable/plus-jakarta-sans';
import './style.css';
import { Board } from '@web/game/board';
import { correctCount, isCorrect, isSolved, newGameWithRules, randomSeed, rotate, seedFromString, suggest, swap, type GameState } from '@shared/engine';
import type { GameRules } from '@shared/rules';
import { portal } from './sdk';
import { music, setForcedMute, sfx, unlockAudio } from './audio';
import { burst, confetti, floatText, initFx, shake } from './fx';

// ---------- data ----------

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
  link?: boolean;
  total?: number;
  site: string;
}
interface Level {
  i: number;
  puzzle: PackPuzzle;
  packIndex: number;
  rows: number;
  cols: number;
  rotation: boolean;
  scramble: 'pairs' | 'mixed' | 'long';
}
interface World {
  name: string;
  color: string;
  levels: Level[];
}
interface Progress {
  stars: Record<number, number>;
  best: Record<number, { moves: number; ms: number }>;
  daily: { day: string; stars: number; streak: number; lastDone: string };
  seenWorlds: number;
}

const WORLD_COLORS = ['#a78bfa', '#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#818cf8', '#2dd4bf', '#fb923c', '#60a5fa', '#e879f9', '#a3e635', '#fb7185'];

/** Board size, twist and shuffle style for the n-th level (gets harder slowly). */
function levelShape(i: number): Pick<Level, 'rows' | 'cols' | 'rotation' | 'scramble'> {
  // Starts as a real puzzle (12 tiles, fully mixed) and grows steadily.
  const sizes: [number, number, number][] = [
    // [until level, rows, cols]
    [1, 3, 4],
    [3, 4, 4],
    [6, 4, 5],
    [10, 4, 6],
    [16, 5, 6],
    [24, 5, 7],
    [34, 6, 7],
    [46, 6, 8],
    [9999, 7, 9],
  ];
  const [, rows, cols] = sizes.find(([until]) => i < until)!;
  const rotation = i >= 5 && i % 6 === 5;
  return {
    rows: rotation ? Math.max(3, rows - 1) : rows,
    cols: rotation ? Math.max(3, cols - 1) : cols,
    rotation,
    scramble: i < 8 ? 'mixed' : 'long',
  };
}

function rulesFor(l: Pick<Level, 'rows' | 'cols' | 'rotation' | 'scramble'>): GameRules {
  return {
    rows: l.rows,
    cols: l.cols,
    lock: true,
    glow: true,
    preview: 'always',
    scramble: l.scramble,
    rotation: l.rotation,
    square: l.rotation,
    scoreMultiplier: 1,
    hintCost: 0,
    hintCooldownMs: 0,
    placeAllowed: false,
    placeCost: 0,
    timed: true,
  };
}

/** Moves allowed for each star: tight for 3, generous for 2. */
function starGoals(par: number): [number, number] {
  return [par + Math.max(1, Math.ceil(par * 0.2)), par + Math.max(3, Math.ceil(par * 0.75))];
}
function starsFor(moves: number, par: number): number {
  const [three, two] = starGoals(par);
  return moves <= three ? 3 : moves <= two ? 2 : 1;
}

// ---------- tiny helpers ----------

type Child = Node | string | number | null | undefined | false | Child[];
function h(tag: string, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  };
  kids.forEach(add);
  return el;
}
const svg = (inner: string, cls = 'ico') => {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  return s;
};
const ICON = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.6 5.1 1.6 1.2-2 3.5-1.9-.7a7.7 7.7 0 0 1-2.1 1.2L16 21h-4l-.3-2.2a7.7 7.7 0 0 1-2.1-1.2l-1.9.7-2-3.5 1.6-1.2a7.9 7.9 0 0 1 0-2.4L5.7 10l2-3.5 1.9.7a7.7 7.7 0 0 1 2.1-1.2L12 3h4l.3 2.2a7.7 7.7 0 0 1 2.1 1.2l1.9-.7 2 3.5-1.6 1.2a7.9 7.9 0 0 1 0 2.4Z" transform="translate(-2 0)"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/>',
  bulb: '<path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>',
  eye: '<path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/>',
  lock: '<path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/>',
  star: '<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>',
  restart: '<path d="M12 4a8 8 0 1 1-7.4 5h2.2A6 6 0 1 0 12 6v3L7.5 5 12 1z"/>',
  next: '<path d="M7 4.5v15a1 1 0 0 0 1.6.8l9.5-7.5a1 1 0 0 0 0-1.6L8.6 3.7A1 1 0 0 0 7 4.5Z"/>',
  music: '<path d="M9 18.5a3 3 0 1 1-2-2.8V5.5l12-2.5v12.5a3 3 0 1 1-2-2.8V7.4L9 9z"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4zm12.5-1.5a6 6 0 0 1 0 9l-1.4-1.4a4 4 0 0 0 0-6.2zm2.8-2.8a10 10 0 0 1 0 14.6l-1.4-1.4a8 8 0 0 0 0-11.8z"/>',
  cal: '<path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5z"/>',
  close: '<path d="m6 4.6 6 6 6-6L19.4 6l-6 6 6 6-1.4 1.4-6-6-6 6L4.6 18l6-6-6-6z"/>',
  rotate: '<path d="M12 5V2L7.5 6 12 10V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>',
};

function store<T>(key: string, fallback: T) {
  return {
    get(): T {
      try {
        const v = localStorage.getItem(key);
        return v ? { ...fallback, ...(JSON.parse(v) as T) } : structuredClone(fallback);
      } catch {
        return structuredClone(fallback);
      }
    },
    set(v: T) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage blocked: progress lasts this session */
      }
    },
  };
}
const progressStore = store<Progress>('ssp_progress_v2', { stars: {}, best: {}, daily: { day: '', stars: 0, streak: 0, lastDone: '' }, seenWorlds: 1 });
let progress = progressStore.get();
const save = () => progressStore.set(progress);

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const today = () => new Date().toLocaleDateString('en-CA');
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => bad(new Error('Picture failed to load'));
    img.src = src;
  });

function starRow(n: number, cls = 'stars') {
  return h('span', { class: cls, 'aria-label': `${n} of 3 stars` }, [0, 1, 2].map((k) => svg(ICON.star, `star ${k < n ? 'on' : ''}`)));
}

/** Chunky game button with a click sound. */
function btn(label: Child, onClick: () => void, cls = 'blue', attrs: Record<string, unknown> = {}) {
  return h(
    'button',
    {
      class: `gbtn ${cls}`,
      ...attrs,
      onclick: (e: Event) => {
        e.stopPropagation();
        sfx.click();
        onClick();
      },
    },
    label,
  );
}
function roundBtn(icon: string, label: string, onClick: () => void, cls = 'white') {
  return btn(svg(icon), onClick, `round ${cls}`, { 'aria-label': label, title: label });
}

// ---------- app shell ----------

const app = document.getElementById('app')!;
let pack: Pack;
let worlds: World[] = [];
let levels: Level[] = [];

function screen(cls: string, ...kids: Child[]) {
  const el = h('div', { class: `screen ${cls}` }, ...kids);
  app.replaceChildren(el);
  return el;
}

function modal(content: HTMLElement, onClose?: () => void, cls = '') {
  const back = h('div', { class: `modal-back ${cls}` });
  const box = h('div', { class: 'modal', role: 'dialog' }, content);
  back.append(box);
  let closed = false;
  // close(): a button in the box handles what happens next. Tapping the backdrop
  // dismisses the box and runs onClose. Either only ever runs once.
  const close = () => {
    if (closed) return;
    closed = true;
    back.classList.add('out');
    setTimeout(() => back.remove(), 200);
  };
  if (onClose)
    back.addEventListener('click', (e) => {
      if (e.target !== back || closed) return;
      close();
      onClose();
    });
  document.body.append(back);
  return { close, box };
}

function settings() {
  const row = (icon: string, label: string, get: () => boolean, set: (v: boolean) => void) => {
    const b = h('button', { class: `toggle ${get() ? 'on' : ''}`, role: 'switch', 'aria-checked': String(get()) }, h('i'));
    b.addEventListener('click', () => {
      set(!get());
      b.classList.toggle('on', get());
      b.setAttribute('aria-checked', String(get()));
      sfx.click();
    });
    return h('div', { class: 'set-row' }, svg(icon), h('span', {}, label), b);
  };
  const m = modal(
    h(
      'div',
      { class: 'panel-card' },
      h('div', { class: 'ribbon purple' }, 'Settings'),
      row(ICON.music, 'Music', () => music.on, (v) => (music.on = v)),
      row(ICON.sound, 'Sound effects', () => sfx.on, (v) => (sfx.on = v)),
      btn('Done', () => m.close(), 'green wide'),
    ),
    () => {},
  );
}

// ---------- title ----------

function title() {
  portal.stop();
  music.play('menu');
  const tiles = h('div', { class: 'title-tiles', 'aria-hidden': 'true' });
  const thumbs = pack.puzzles.slice(0, 14);
  thumbs.forEach((p, i) => {
    const t = h('div', { class: 'ftile', style: `--x:${(i * 37) % 100}%;--d:${-((i * 2.3) % 14)}s;--s:${0.7 + ((i * 13) % 5) / 10};--r:${((i * 29) % 40) - 20}deg` });
    t.style.backgroundImage = `url(${p.thumb})`;
    tiles.append(t);
  });
  const total = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  screen(
    'title',
    tiles,
    h(
      'div',
      { class: 'title-center' },
      h('img', { class: 'logo bob', src: './logo.png', alt: 'SnapShift Puzzles' }),
      h('p', { class: 'tagline' }, 'Swap the tiles. Rebuild the picture.'),
      btn([svg(ICON.play), total ? 'Continue' : 'Play'], () => (unlockAudio(), map()), 'green huge pulse'),
      h(
        'div',
        { class: 'title-row' },
        total ? h('span', { class: 'pill' }, svg(ICON.star, 'star on'), `${total}`) : null,
        roundBtn(ICON.gear, 'Settings', settings),
      ),
    ),
  );
}

// ---------- map ----------

function nextLevelIndex() {
  const i = levels.findIndex((l) => !progress.stars[l.i]);
  return i < 0 ? levels.length - 1 : i;
}
const unlocked = (i: number) => i === 0 || !!progress.stars[i - 1];

function map(scrollTo = nextLevelIndex()) {
  portal.stop();
  music.play('menu');
  const total = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const max = levels.length * 3;
  const dailyDone = progress.daily.day === today();

  const path = h('div', { class: 'map-path' });
  worlds.forEach((w, wi) => {
    const got = w.levels.reduce((a, l) => a + (progress.stars[l.i] ?? 0), 0);
    const open = unlocked(w.levels[0].i);
    const sec = h(
      'section',
      { class: `world ${open ? '' : 'locked'}`, style: `--wc:${w.color}` },
      h(
        'div',
        { class: 'world-head' },
        h('span', { class: 'world-num' }, `World ${wi + 1}`),
        h('h2', {}, w.name),
        h('span', { class: 'world-stars' }, svg(ICON.star, 'star on'), `${got}/${w.levels.length * 3}`),
      ),
    );
    const nodes = h('div', { class: 'nodes' });
    w.levels.forEach((l, k) => {
      const st = progress.stars[l.i] ?? 0;
      const can = unlocked(l.i);
      const current = can && !st;
      const node = h(
        'button',
        {
          class: `node ${st ? 'done' : ''} ${current ? 'current' : ''} ${can ? '' : 'locked'} ${l.rotation ? 'twist' : ''}`,
          style: `--k:${[0, 1, 0, -1][k % 4]}`,
          'aria-label': `Level ${l.i + 1}${can ? '' : ' (locked)'}`,
          'data-level': String(l.i),
          onclick: () => {
            if (!can) {
              sfx.denied();
              shake(node);
              return;
            }
            sfx.click();
            levelIntro(l);
          },
        },
        h('span', { class: 'node-face' }, can ? h('img', { src: l.puzzle.thumb, alt: '', loading: 'lazy' }) : svg(ICON.lock), h('b', {}, String(l.i + 1))),
        st ? starRow(st, 'stars node-stars') : null,
        current ? h('span', { class: 'you' }, 'PLAY') : null,
        l.rotation && can ? h('span', { class: 'twist-tag' }, svg(ICON.rotate)) : null,
      );
      nodes.append(node);
    });
    sec.append(nodes);
    path.append(sec);
  });

  const bannerEl = fullGameBanner();
  const el = screen(
    'map',
    h(
      'header',
      { class: 'topbar' },
      roundBtn(ICON.home, 'Title screen', title),
      h('span', { class: 'pill big' }, svg(ICON.star, 'star on'), `${total}`, h('small', {}, `/${max}`)),
      h('span', { class: 'grow' }),
      btn([svg(ICON.cal), 'Daily', !dailyDone ? h('i', { class: 'dot' }) : null], daily, 'orange small'),
      roundBtn(ICON.gear, 'Settings', settings),
    ),
    h('div', { class: 'map-scroll' }, path, bannerEl ? h('div', { class: 'map-foot' }, bannerEl) : null),
  );
  requestAnimationFrame(() => {
    const target = el.querySelector(`[data-level="${scrollTo}"]`);
    target?.scrollIntoView({ block: 'center' });
  });
}

function levelIntro(l: Level) {
  const st = progress.stars[l.i] ?? 0;
  const best = progress.best[l.i];
  const m = modal(
    h(
      'div',
      { class: 'panel-card intro-card', style: `--wc:${worlds[l.packIndex].color}` },
      h('div', { class: 'ribbon' }, `Level ${l.i + 1}`),
      h('div', { class: 'intro-pic' }, h('img', { src: l.puzzle.thumb, alt: '' })),
      h('h3', {}, l.puzzle.title),
      h(
        'div',
        { class: 'chips' },
        h('span', { class: 'chip' }, `${l.rows * l.cols} tiles`),
        l.rotation ? h('span', { class: 'chip twist' }, svg(ICON.rotate), 'Twist: turn tiles upright') : null,
      ),
      st ? h('div', { class: 'intro-best' }, starRow(st), best ? h('span', {}, `Best: ${best.moves} moves`) : null) : h('p', { class: 'muted' }, 'Use as few moves as you can to earn 3 stars!'),
      btn([svg(ICON.play), 'Play'], () => (m.close(), void play(l)), 'green wide big'),
    ),
    () => {},
  );
}

// ---------- full game banner ----------

function fullGameBanner(compact = false): HTMLElement | null {
  const mode = pack.banner ?? (pack.link ? 'link' : 'none');
  if (mode === 'none') return null;
  const total = Math.max(pack.total ?? 0, pack.puzzles.length);
  const count = total > pack.puzzles.length ? `${Math.floor(total / 10) * 10}+ pictures` : 'More pictures';
  const inner = [
    h('img', { class: 'fg-icon', src: './icon.png', alt: '' }),
    h('span', { class: 'fg-text' }, h('b', {}, compact ? 'Want more?' : 'Play the full game, free'), h('span', {}, `${count}, daily leaderboards and streaks at snapshiftpuzzles.com`)),
  ];
  return mode === 'link'
    ? h('a', { class: `full-game ${compact ? 'compact' : ''}`, href: pack.site, target: '_blank', rel: 'noopener' }, inner, h('span', { class: 'gbtn green small' }, 'Visit'))
    : h('div', { class: `full-game ${compact ? 'compact' : ''}` }, inner);
}

// ---------- game ----------

let board: Board | null = null;
let state: GameState;
let startedAt = 0;
let elapsedBefore = 0;
let finished = false;
let paused = false;
let tickHandle = 0;
let moveHandlers: { swap(a: number, b: number): void; rotate(p: number): void } | null = null;
let closeIntro: () => void = () => {};
const introSeen = store<{ v: boolean }>('ssp_intro_seen2', { v: false });

const elapsed = () => elapsedBefore + (startedAt && !paused ? performance.now() - startedAt : 0);

interface PlaySpec {
  level?: Level;
  daily?: boolean;
  puzzle: PackPuzzle;
  shape: Pick<Level, 'rows' | 'cols' | 'rotation' | 'scramble'>;
  label: string;
  color: string;
}

function play(l: Level) {
  return startGame({ level: l, puzzle: l.puzzle, shape: l, label: `Level ${l.i + 1}`, color: worlds[l.packIndex].color });
}

function daily() {
  const p = pack.puzzles[seedFromString('daily:' + today()) % pack.puzzles.length];
  return startGame({ daily: true, puzzle: p, shape: { rows: 5, cols: 7, rotation: false, scramble: 'long' }, label: 'Daily puzzle', color: '#fbbf24' });
}

async function startGame(spec: PlaySpec) {
  closeIntro();
  screen('loading', h('div', { class: 'loader' }, h('div', { class: 'spinner' }), 'Loading picture…'));
  let img: HTMLImageElement;
  try {
    img = await loadImage(spec.puzzle.image);
  } catch {
    map();
    return;
  }
  const seed = spec.daily ? seedFromString('daily-board:' + today()) : randomSeed();
  state = newGameWithRules(seed, rulesFor(spec.shape));
  finished = false;
  paused = false;
  startedAt = 0;
  elapsedBefore = 0;
  let combo = 0;
  let hints = 3;
  const [goal3, goal2] = starGoals(state.par);

  // HUD
  const movesEl = h('b', {}, '0');
  const timeEl = h('span', { class: 'time' }, '0:00');
  const meterFill = h('i');
  const meterStars = [0, 1, 2].map((k) => svg(ICON.star, `star on m${k}`));
  const meter = h('div', { class: 'meter' }, h('div', { class: 'meter-bar' }, meterFill), h('div', { class: 'meter-stars' }, meterStars));
  const progFill = h('i');
  const hintBadge = h('span', { class: 'badge' }, String(hints));
  const canvas = h('canvas', { id: 'board', tabindex: '0', 'aria-label': 'Puzzle board' }) as HTMLCanvasElement;
  const frame = h('div', { class: 'board-frame' }, canvas);
  const peekImg = h('div', { class: 'peek-full' }, h('img', { src: spec.puzzle.image, alt: '' }));
  const stage = h('div', { class: 'stage' }, frame, peekImg);
  const target = h('button', { class: 'target', 'aria-label': 'Hold to see the picture' }, h('img', { src: spec.puzzle.thumb, alt: '' }), svg(ICON.eye, 'ico eye'));

  const showPeek = (v: boolean) => stage.classList.toggle('peeking', v);
  target.addEventListener('pointerdown', () => showPeek(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) target.addEventListener(ev, () => showPeek(false));

  const hintBtn = btn([svg(ICON.bulb), 'Hint', hintBadge], () => {
    if (finished) return;
    if (hints <= 0) {
      sfx.denied();
      shake(hintBtn);
      return;
    }
    const m = suggest(state);
    if (!m) return;
    hints--;
    hintBadge.textContent = String(hints);
    hintBtn.classList.toggle('empty', hints === 0);
    sfx.hint();
    begin();
    board!.showHint(m.kind === 'swap' ? [m.a, m.b] : [m.p], 3500);
  }, 'yellow');

  screen(
    `game`,
    h(
      'header',
      { class: 'topbar game-top', style: `--wc:${spec.color}` },
      roundBtn(ICON.pause, 'Pause', () => pause()),
      h('div', { class: 'level-pill' }, h('span', {}, spec.label), spec.shape.rotation ? h('small', {}, 'Twist') : null),
      meter,
      h('div', { class: 'moves' }, h('small', {}, 'Moves'), movesEl),
      target,
    ),
    stage,
    h(
      'footer',
      { class: 'game-bottom' },
      h('div', { class: 'progress' }, progFill),
      h('div', { class: 'bottom-row' }, timeEl, h('span', { class: 'grow' }), spec.shape.rotation ? h('span', { class: 'tip' }, svg(ICON.rotate), 'Tap a tile to turn it') : null, hintBtn),
    ),
  );

  const updateMeter = () => {
    const m = state.moves;
    const left = m <= goal3 ? 1 - (m / goal3) * 0.34 : m <= goal2 ? 0.66 - ((m - goal3) / (goal2 - goal3)) * 0.33 : 0.33;
    meterFill.style.width = `${Math.max(0.08, left) * 100}%`;
    meterStars[2].classList.toggle('on', m <= goal3);
    meterStars[1].classList.toggle('on', m <= goal2);
  };
  const hud = () => {
    movesEl.textContent = String(state.moves);
    progFill.style.width = `${(correctCount(state) / state.tiles.length) * 100}%`;
    updateMeter();
  };
  const begin = () => {
    closeIntro();
    if (!startedAt && !finished) startedAt = performance.now();
  };
  const tileCenter = (p: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((p % state.cols) + 0.5) * (r.width / state.cols), y: r.top + (Math.floor(p / state.cols) + 0.5) * (r.height / state.rows) };
  };
  const PRAISE = ['', '', 'Nice', 'Great', 'Superb', 'Brilliant', 'On fire', 'Unstoppable'];
  const after = (placed: number[]) => {
    if (placed.length) {
      combo++;
      sfx.correct(combo, placed.length);
      for (const p of placed) {
        const c = tileCenter(p);
        burst(c.x, c.y, 12);
      }
      if (combo >= 2) {
        const c = tileCenter(placed[0]);
        floatText(PRAISE[Math.min(PRAISE.length - 1, combo)], c.x, c.y - 20, combo >= 4 ? 'big' : '');
        if (combo >= 4) sfx.combo();
      }
    } else {
      combo = 0;
      sfx.swap();
    }
    hud();
    if (isSolved(state)) void win(spec, img);
  };
  const onSwap = (a: number, b: number) => {
    if (finished || paused) return;
    begin();
    const before = state.tiles.map((_, q) => isCorrect(state, q));
    const r = swap(state, a, b);
    if (!r.ok) {
      sfx.denied();
      shake(frame);
      return;
    }
    const placed = [a, b].filter((q) => !before[q] && isCorrect(state, q));
    board!.animateSwap(a, b, placed);
    after(placed);
  };
  const onRotate = (q: number) => {
    if (finished || paused) return;
    begin();
    const before = isCorrect(state, q);
    const r = rotate(state, q);
    if (!r.ok) {
      sfx.denied();
      return;
    }
    const placed = !before && isCorrect(state, q) ? [q] : [];
    board!.animateRotate(q, placed.length > 0);
    if (!placed.length) {
      combo = 0;
      sfx.rotate();
      hud();
    } else after(placed);
  };
  moveHandlers = { swap: onSwap, rotate: onRotate };
  board = new Board(canvas, img, { showCorrect: true, onSwap, onRotate });
  board.setState(state);
  board.setShowCorrect(true);
  board.setCompleted(false);
  hud();
  music.play('game');
  portal.start();

  clearInterval(tickHandle);
  tickHandle = window.setInterval(() => (timeEl.textContent = fmtTime(elapsed())), 250);
  setTimeout(() => !finished && showIntro(stage, canvas, spec.shape.rotation), 450);
  canvas.focus({ preventScroll: true });

  // Pause menu
  function pause() {
    if (finished) return;
    if (startedAt) {
      elapsedBefore = elapsed();
      startedAt = 0;
    }
    paused = true;
    portal.stop();
    const m = modal(
      h(
        'div',
        { class: 'panel-card' },
        h('div', { class: 'ribbon purple' }, 'Paused'),
        btn([svg(ICON.play), 'Resume'], () => resume(), 'green wide big'),
        btn([svg(ICON.restart), 'Restart'], () => (m.close(), void startGame(spec)), 'blue wide'),
        btn([svg(ICON.home), 'Map'], () => (m.close(), leave()), 'orange wide'),
        h('div', { class: 'set-inline' }, roundBtn(ICON.gear, 'Settings', settings)),
      ),
      () => resume(),
    );
    function resume() {
      m.close();
      paused = false;
      if (state.moves) startedAt = performance.now();
      portal.start();
    }
  }
  pauseCurrent = pause;
}
let pauseCurrent: (() => void) | null = null;

function leave() {
  clearInterval(tickHandle);
  closeIntro();
  board = null;
  pauseCurrent = null;
  map();
}

/** First game: a finger drags a real tile to where it belongs. */
function showIntro(stage: HTMLElement, canvas: HTMLCanvasElement, rotation: boolean) {
  if (introSeen.get().v) return;
  const m = suggest(state);
  if (!m || m.kind !== 'swap') return;
  const s = stage.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  if (!c.width) return;
  const tw = c.width / state.cols;
  const th = c.height / state.rows;
  const at = (p: number) => ({ x: c.left - s.left + ((p % state.cols) + 0.5) * tw, y: c.top - s.top + (Math.floor(p / state.cols) + 0.5) * th });
  const a = at(m.a);
  const b = at(m.b);
  const ghost = h('div', { class: 'intro-ghost', style: `width:${tw}px;height:${th}px` });
  const finger = h('div', { class: 'intro-finger' });
  const mover = h('div', { class: 'intro-mover' }, ghost, finger);
  const got = btn('Got it!', () => closeIntro(), 'green small');
  const layer = h('div', { class: 'intro' }, mover, h('div', { class: 'intro-caption' }, h('span', {}, h('b', {}, 'Drag a tile onto another to swap them.'), rotation ? ' Tap a tile to turn it upright.' : ' Put every tile back in its place!'), got));
  stage.append(layer);
  board?.showHint([m.a, m.b], 60_000);
  const anim = mover.animate(
    [
      { transform: `translate(${a.x}px, ${a.y}px) scale(1)`, opacity: 0, offset: 0 },
      { transform: `translate(${a.x}px, ${a.y}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${a.x}px, ${a.y}px) scale(0.92)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${b.x}px, ${b.y}px) scale(0.92)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${b.x}px, ${b.y}px) scale(1)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${b.x}px, ${b.y}px) scale(1)`, opacity: 0, offset: 1 },
    ],
    { duration: 2200, iterations: Infinity, easing: 'ease-in-out' },
  );
  closeIntro = () => {
    closeIntro = () => {};
    introSeen.set({ v: true });
    anim.cancel();
    layer.remove();
    board?.showHint([], 0);
  };
}

async function win(spec: PlaySpec, img: HTMLImageElement) {
  void img;
  finished = true;
  elapsedBefore = elapsed();
  startedAt = 0;
  clearInterval(tickHandle);
  portal.stop();
  const stars = starsFor(state.moves, state.par);
  const l = spec.level;
  let improved = false;
  let unlockedNext = false;
  if (l) {
    const prev = progress.stars[l.i] ?? 0;
    improved = stars > prev;
    unlockedNext = !prev && l.i + 1 < levels.length;
    if (improved) progress.stars[l.i] = stars;
    const b = progress.best[l.i];
    if (!b || state.moves < b.moves) progress.best[l.i] = { moves: state.moves, ms: elapsedBefore };
  } else if (spec.daily) {
    const d = progress.daily;
    const t = today();
    if (d.lastDone !== t) {
      const y = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
      d.streak = d.lastDone === y ? d.streak + 1 : 1;
      d.lastDone = t;
    }
    d.day = t;
    d.stars = Math.max(d.day === t ? d.stars : 0, stars);
  }
  save();
  board!.setCompleted(true);
  await board!.celebrate();
  sfx.win();
  confetti(stars === 3 ? 180 : 110);
  portal.celebrate();

  const starEls = [0, 1, 2].map(() => h('span', { class: 'big-star' }, svg(ICON.star, 'star')));
  const nextLevel = l && l.i + 1 < levels.length ? levels[l.i + 1] : null;
  const goNext = async () => {
    m.close();
    await breakAd();
    if (nextLevel) {
      if (nextLevel.packIndex !== l!.packIndex) worldUnlocked(nextLevel);
      else void play(nextLevel);
    } else map();
  };
  const m = modal(
    h(
      'div',
      { class: 'panel-card win-card' },
      h('div', { class: 'ribbon green' }, spec.daily ? 'Daily complete!' : 'Level complete!'),
      h('div', { class: 'win-stars' }, starEls),
      h('div', { class: 'win-pic' }, h('img', { src: spec.puzzle.thumb, alt: '' })),
      h(
        'div',
        { class: 'win-stats' },
        h('div', {}, h('small', {}, 'Moves'), h('b', {}, String(state.moves))),
        h('div', {}, h('small', {}, 'Time'), h('b', {}, fmtTime(elapsedBefore))),
        spec.daily ? h('div', {}, h('small', {}, 'Streak'), h('b', {}, `${progress.daily.streak}🔥`)) : null,
      ),
      stars < 3 ? h('p', { class: 'muted small' }, `3 stars: finish in ${starGoals(state.par)[0]} moves or fewer`) : improved && l ? h('p', { class: 'yay' }, 'Perfect!') : null,
      h(
        'div',
        { class: 'win-btns' },
        roundBtn(ICON.home, 'Map', () => (m.close(), void breakAd().then(() => map())), 'orange'),
        roundBtn(ICON.restart, 'Play again', () => (m.close(), void startGame(spec)), 'blue'),
        nextLevel ? btn([unlockedNext ? 'Next level' : 'Next', svg(ICON.next)], () => void goNext(), 'green big grow') : btn('Back to map', () => (m.close(), map()), 'green big grow'),
      ),
      fullGameBanner(true),
    ),
  );
  m.box.classList.add('pop');
  starEls.forEach((e, k) => {
    if (k >= stars) return;
    setTimeout(
      () => {
        e.classList.add('on');
        sfx.star(k);
        const r = e.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 18);
      },
      450 + k * 380,
    );
  });
}

function worldUnlocked(l: Level) {
  const w = worlds[l.packIndex];
  sfx.unlock();
  confetti(80);
  const m = modal(
    h(
      'div',
      { class: 'panel-card world-card', style: `--wc:${w.color}` },
      h('div', { class: 'ribbon' }, 'New world unlocked!'),
      h('div', { class: 'world-pics' }, w.levels.slice(0, 4).map((x) => h('img', { src: x.puzzle.thumb, alt: '' }))),
      h('h3', {}, `World ${l.packIndex + 1}: ${w.name}`),
      btn([svg(ICON.play), "Let's go!"], () => (m.close(), void play(l)), 'green wide big'),
    ),
  );
  m.box.classList.add('pop');
}

let lastAd = 0;
async function breakAd() {
  if (Date.now() - lastAd < 60_000) return;
  lastAd = Date.now();
  await portal.breakBetween((mt) => setForcedMute(mt));
}

// ---------- start ----------

document.addEventListener('visibilitychange', () => {
  if (document.hidden && board && !finished && !paused) pauseCurrent?.();
});
window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target === document.body) e.preventDefault();
  if ((e.key === 'p' || e.key === 'P') && board && !finished && !paused) pauseCurrent?.();
});
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

initFx();
await portal.init();
portal.onMute((m) => setForcedMute(m));
try {
  pack = (await (await fetch('./pack.json')).json()) as Pack;
  if (!pack.puzzles?.length) throw new Error('empty pack');
} catch {
  app.replaceChildren(h('p', { class: 'loader' }, 'The pictures couldn’t be loaded. Please refresh.'));
  throw new Error('pack missing');
}
{
  const byCat = new Map<string, PackPuzzle[]>();
  for (const p of pack.puzzles) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  let i = 0;
  worlds = [...byCat.entries()].map(([name, ps], wi) => ({
    name,
    color: WORLD_COLORS[wi % WORLD_COLORS.length],
    levels: ps.map((p) => {
      const l: Level = { i, puzzle: p, packIndex: wi, ...levelShape(i) };
      i++;
      return l;
    }),
  }));
  levels = worlds.flatMap((w) => w.levels);
}
portal.loaded();

// On portals, players should be playing straight away: first visit opens level 1;
// later visits open the map at the next level. Elsewhere, start on the title.
const params = new URLSearchParams(location.search);
if (params.has('menu')) title();
else if (params.has('map')) map();
else if (!Object.keys(progress.stars).length) void play(levels[0]);
else if (portal.name !== 'web') map();
else title();

// Automated test hooks (?selftest).
if (params.has('selftest')) {
  (window as unknown as { __ssp: unknown }).__ssp = {
    solve() {
      for (let m = suggest(state); m && !isSolved(state); m = suggest(state)) {
        if (m.kind === 'swap') moveHandlers!.swap(m.a, m.b);
        else moveHandlers!.rotate(m.p);
      }
    },
    step() {
      const m = suggest(state);
      if (!m || isSolved(state)) return false;
      if (m.kind === 'swap') moveHandlers!.swap(m.a, m.b);
      else moveHandlers!.rotate(m.p);
      return true;
    },
    play(slug: string) {
      const l = levels.find((x) => x.puzzle.slug === slug);
      if (l) void play(l);
    },
    level(i: number) {
      void play(levels[i]);
    },
    unlockAll() {
      levels.forEach((l) => (progress.stars[l.i] ||= 3));
      save();
    },
  };
}
