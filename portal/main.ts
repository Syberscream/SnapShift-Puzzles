// SnapShift Puzzles: portal edition (CrazyGames, Poki, itch.io …).
// A level-based casual game: picture worlds on a map, levels that unlock one by
// one, five ways to play each picture (Classic, Twist, Slider, Memory, Time Rush),
// stars, points, Trifectas, badges and a daily puzzle. Uses the same puzzle engine
// and board as the website; progress stays on the device.

import '@fontsource-variable/plus-jakarta-sans';
import './style.css';
import { Board } from '@web/game/board';
import { admire } from '@web/lib/admire';
import { correctCount, isCorrect, isSolved, newGameWithRules, randomSeed, rotate, seedFromString, suggest, swap, type GameState } from '@shared/engine';
import { distance, lineSteps, slide, sliderNew, sliderSolved, type SliderSize, type SliderState } from '@shared/slider';
import { portal } from './sdk';
import { music, setForcedMute, sfx, unlockAudio } from './audio';
import { burst, confetti, floatText, initFx, shake } from './fx';
import { solveSlider } from './slider-solve';
import { dailyShape, MODE, MODES, moveGoals, rulesFor, rushSeconds, rushStars, shapeFor, TRIFECTA, TRIFECTA_POINTS, SLAM_POINTS, type ModeId, type Shape } from './modes';
import {
  BADGES,
  checkBadges,
  hasSlam,
  hasTrifecta,
  levelDone,
  levelsDone,
  levelStars,
  loadProgress,
  recordDaily,
  recordWin,
  saveProgress,
  TIER_NAMES,
  totalStars,
  type Earned,
  type WinResult,
} from './progress';

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
}
interface World {
  name: string;
  color: string;
  levels: Level[];
}

const WORLD_COLORS = ['#a78bfa', '#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#818cf8', '#2dd4bf', '#fb923c', '#60a5fa', '#e879f9', '#a3e635', '#fb7185'];

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
const ICON: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  back: '<path d="M14.7 5.3 8 12l6.7 6.7-1.4 1.4L5.2 12l8.1-8.1z"/>',
  gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.6 5.1 1.6 1.2-2 3.5-1.9-.7a7.7 7.7 0 0 1-2.1 1.2L16 21h-4l-.3-2.2a7.7 7.7 0 0 1-2.1-1.2l-1.9.7-2-3.5 1.6-1.2a7.9 7.9 0 0 1 0-2.4L5.7 10l2-3.5 1.9.7a7.7 7.7 0 0 1 2.1-1.2L12 3h4l.3 2.2a7.7 7.7 0 0 1 2.1 1.2l1.9-.7 2 3.5-1.6 1.2a7.9 7.9 0 0 1 0 2.4Z" transform="translate(-2 0)"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/>',
  bulb: '<path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>',
  eye: '<path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/>',
  eyeOff: '<path d="M3.3 2 22 20.7l-1.4 1.4-3.3-3.3A10.6 10.6 0 0 1 12 20c-5 0-9-4.5-10-7a14 14 0 0 1 4-5.2L1.9 3.4zM12 4c5 0 9 4.5 10 7a13.8 13.8 0 0 1-2.6 3.9L7.7 5.2A10.4 10.4 0 0 1 12 4Z"/>',
  lock: '<path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/>',
  star: '<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>',
  restart: '<path d="M12 4a8 8 0 1 1-7.4 5h2.2A6 6 0 1 0 12 6v3L7.5 5 12 1z"/>',
  next: '<path d="M7 4.5v15a1 1 0 0 0 1.6.8l9.5-7.5a1 1 0 0 0 0-1.6L8.6 3.7A1 1 0 0 0 7 4.5Z"/>',
  music: '<path d="M9 18.5a3 3 0 1 1-2-2.8V5.5l12-2.5v12.5a3 3 0 1 1-2-2.8V7.4L9 9z"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4zm12.5-1.5a6 6 0 0 1 0 9l-1.4-1.4a4 4 0 0 0 0-6.2zm2.8-2.8a10 10 0 0 1 0 14.6l-1.4-1.4a8 8 0 0 0 0-11.8z"/>',
  cal: '<path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5z"/>',
  rotate: '<path d="M12 5V2L7.5 6 12 10V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>',
  swap: '<path d="M7 4 2.5 8.5 7 13V10h9V7H7zm10 7v3H8v3h9v3l4.5-4.5z"/>',
  slider: '<path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3z"/><path d="M14.5 17h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-3 3 3 3 0 0 0 1 2.2A3 3 0 0 0 4 16a3 3 0 0 0 3 3 2 2 0 0 0 4 0V5a2 2 0 0 0-2-2Zm6 0a2 2 0 0 0-2 2v14a2 2 0 0 0 4 0 3 3 0 0 0 3-3 3 3 0 0 0 0-4.8A3 3 0 0 0 21 9a3 3 0 0 0-3-3 3 3 0 0 0-3-3Z"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  target: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>',
  flame: '<path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-6.5 1-8.5ZM12 22a7 7 0 0 1-7-7c0-1.3.3-2.5.9-3.6C6.5 15.5 9 18 12 18s5.5-2.5 6.1-6.6c.6 1.1.9 2.3.9 3.6a7 7 0 0 1-7 7Z"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-1.2 13.6-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4z"/>',
  globe: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4ZM4.3 14a8 8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4Zm.8 2h3a15.6 15.6 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16Zm3-8h-3a8 8 0 0 1 4.4-3.6A15.6 15.6 0 0 0 8.1 8ZM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4Zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4Zm.2 5.6a15.6 15.6 0 0 0 1.4-3.6h3a8 8 0 0 1-4.4 3.6Zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8 8 0 0 1 0 4Z"/>',
  trophy: '<path d="M7 3h10v2h4v3a5 5 0 0 1-4.6 5A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 7.6 13 5 5 0 0 1 3 8V5h4zm10 4v4a3 3 0 0 0 2-3V7zM5 7v1a3 3 0 0 0 2 3V7z"/>',
  crown: '<path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 12H5zm2.4 14h13.2v1.5H5.4z"/>',
  trifecta: '<path d="M12 2 2 20h20zm0 5.2L17.6 17H6.4z"/><circle cx="12" cy="13.5" r="2"/>',
};
const MODE_ICON: Record<ModeId, string> = { classic: ICON.swap, twist: ICON.rotate, slider: ICON.slider, memory: ICON.brain, rush: ICON.bolt };

let progress = loadProgress();
const save = () => saveProgress(progress);

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000 - 0.001));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtNum = (n: number) => (n >= 100_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US'));
const today = () => new Date().toLocaleDateString('en-CA');
const yesterday = () => new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
const dayIndex = () => Math.floor(new Date(today() + 'T00:00:00Z').getTime() / 864e5);
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

/** Game button with a click sound. */
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
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
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

/** Small badge medallion: icon in a ring coloured by tier (0 = not earned yet). */
function medal(icon: string, tier: number, cls = '') {
  return h('span', { class: `medal tier-${tier} ${cls}` }, svg(ICON[icon] ?? ICON.star));
}

// ---------- badge toasts ----------

const toastQueue: Earned[] = [];
let toasting = false;
function toastBadges(list: Earned[]) {
  toastQueue.push(...list);
  if (!toasting) nextToast();
}
function nextToast() {
  const e = toastQueue.shift();
  if (!e) {
    toasting = false;
    return;
  }
  toasting = true;
  sfx.unlock();
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    medal(e.badge.icon, e.tier),
    h('span', { class: 'toast-text' }, h('small', {}, `${TIER_NAMES[e.tier]} badge`), h('b', {}, e.badge.name)),
    h('span', { class: 'toast-pts' }, `+${e.points}`),
  );
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => {
    el.remove();
    nextToast();
  }, 3000);
}

// ---------- title ----------

function title() {
  portal.stop();
  music.play('menu');
  const tiles = h('div', { class: 'title-tiles', 'aria-hidden': 'true' });
  const thumbs = pack.puzzles.filter((_, k) => k % Math.max(1, Math.floor(pack.puzzles.length / 14)) === 0).slice(0, 14);
  thumbs.forEach((p, i) => {
    const t = h('div', { class: 'ftile', style: `--x:${(i * 37) % 100}%;--d:${-((i * 2.3) % 14)}s;--s:${0.7 + ((i * 13) % 5) / 10};--r:${((i * 29) % 40) - 20}deg` });
    t.style.backgroundImage = `url(${p.thumb})`;
    tiles.append(t);
  });
  const total = totalStars(progress);
  screen(
    'title',
    tiles,
    h(
      'div',
      { class: 'title-center' },
      h('img', { class: 'logo bob', src: './logo.png', alt: 'SnapShift Puzzles' }),
      h('p', { class: 'tagline' }, `${levels.length} pictures · 5 ways to play`),
      btn([svg(ICON.play), total ? 'Continue' : 'Play'], () => (unlockAudio(), map()), 'green huge pulse'),
      h(
        'div',
        { class: 'title-row' },
        total ? h('span', { class: 'pill' }, svg(ICON.star, 'star on'), `${total}`) : null,
        progress.points ? h('span', { class: 'pill pts' }, `${fmtNum(progress.points)} pts`) : null,
        roundBtn(ICON.trophy, 'Trophies', trophies),
        roundBtn(ICON.gear, 'Settings', settings),
      ),
    ),
  );
}

// ---------- map ----------

function nextLevelIndex() {
  const i = levels.findIndex((l) => !levelDone(progress, l.i));
  return i < 0 ? levels.length - 1 : i;
}
const unlocked = (i: number) => i === 0 || levelDone(progress, i - 1);
const modeOpen = (m: ModeId) => levelsDone(progress) >= MODE[m].unlockAfter;

/** Five little dots, one per mode: bright for 3 stars, dim for fewer. */
function modePips(i: number) {
  return h(
    'span',
    { class: 'pips', 'aria-hidden': 'true' },
    MODES.map((m) => {
      const s = progress.stars[i]?.[m.id] ?? 0;
      return h('i', { class: s === 3 ? 'full' : s ? 'part' : '', style: `--mc:${m.color}` });
    }),
  );
}

function map(scrollTo = nextLevelIndex()) {
  portal.stop();
  music.play('menu');
  const dailyDone = progress.daily.day === today();

  const path = h('div', { class: 'map-path' });
  worlds.forEach((w, wi) => {
    const got = w.levels.reduce((a, l) => a + levelStars(progress, l.i), 0);
    const tri = w.levels.filter((l) => hasTrifecta(progress, l.i)).length;
    const open = unlocked(w.levels[0].i);
    const sec = h(
      'section',
      { class: `world ${open ? '' : 'locked'}`, style: `--wc:${w.color}` },
      h(
        'div',
        { class: 'world-head' },
        h('span', { class: 'world-num' }, `World ${wi + 1}`),
        h('h2', {}, w.name),
        h('span', { class: 'world-stars', title: 'Stars and Trifectas in this world' }, svg(ICON.star, 'star on'), `${got}`, h('i', { class: 'sep' }), svg(ICON.trifecta, 'ico tri'), `${tri}/${w.levels.length}`),
      ),
    );
    const nodes = h('div', { class: 'nodes' });
    w.levels.forEach((l) => {
      const done = levelDone(progress, l.i);
      const can = unlocked(l.i);
      const current = can && !done;
      const slam = hasSlam(progress, l.i);
      const tri = !slam && hasTrifecta(progress, l.i);
      const node = h(
        'button',
        {
          class: `node ${done ? 'done' : ''} ${current ? 'current' : ''} ${can ? '' : 'locked'} ${slam ? 'slam' : tri ? 'tri' : ''}`,
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
        done ? modePips(l.i) : null,
        current ? h('span', { class: 'you' }, 'PLAY') : null,
        slam ? h('span', { class: 'tri-tag slam', title: 'Grand Slam' }, svg(ICON.crown)) : tri ? h('span', { class: 'tri-tag', title: 'Trifecta' }, svg(ICON.trifecta)) : null,
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
      h('span', { class: 'pill big' }, svg(ICON.star, 'star on'), `${totalStars(progress)}`),
      h('span', { class: 'pill pts' }, `${fmtNum(progress.points)}`, h('small', {}, 'pts')),
      h('span', { class: 'grow' }),
      btn([svg(ICON.trophy), h('span', { class: 'lbl' }, 'Trophies'), progress.newBadges ? h('i', { class: 'dot' }) : null], trophies, 'small'),
      btn([svg(ICON.cal), h('span', { class: 'lbl' }, 'Daily'), !dailyDone ? h('i', { class: 'dot' }) : null], daily, 'orange small'),
      roundBtn(ICON.gear, 'Settings', settings),
    ),
    h('div', { class: 'map-scroll' }, path, bannerEl ? h('div', { class: 'map-foot' }, bannerEl) : null),
  );
  requestAnimationFrame(() => {
    const target = el.querySelector(`[data-level="${scrollTo}"]`);
    target?.scrollIntoView({ block: 'center' });
  });
  const fresh = unseenModes()[0];
  if (fresh) setTimeout(() => document.querySelector('.screen.map') && !document.querySelector('.modal-back') && modeUnlocked(fresh.id, levels[nextLevelIndex()], () => {}), 500);
}

/** The mode to offer first: Classic until it's done, then the first open mode without 3 stars. */
function suggestedMode(i: number): ModeId {
  const st = progress.stars[i] ?? {};
  if (!st.classic) return 'classic';
  return MODES.find((m) => modeOpen(m.id) && (st[m.id] ?? 0) < 3)?.id ?? 'classic';
}

function levelIntro(l: Level, pick: ModeId = suggestedMode(l.i)) {
  let mode = pick;
  const st = () => progress.stars[l.i] ?? {};
  const info = h('div', { class: 'mode-info' });
  const chips = h('div', { class: 'chips' });
  const bestEl = h('div', { class: 'intro-best' });
  const tiles = MODES.map((m) => {
    const open = modeOpen(m.id);
    const s = st()[m.id] ?? 0;
    const b = h(
      'button',
      {
        class: `mode-tile ${open ? '' : 'locked'}`,
        style: `--mc:${m.color}`,
        'aria-label': `${m.name}${open ? '' : ' (locked)'}`,
        'data-mode': m.id,
        onclick: () => {
          if (!open) {
            sfx.denied();
            shake(b);
            info.replaceChildren(h('span', { class: 'muted' }, `${m.name} opens after ${m.unlockAfter} pictures. You've done ${levelsDone(progress)}.`));
            return;
          }
          sfx.click();
          mode = m.id;
          refresh();
        },
      },
      h('span', { class: 'mode-ico' }, svg(open ? MODE_ICON[m.id] : ICON.lock)),
      h('span', { class: 'mode-name' }, m.name),
      open ? starRow(s, 'stars mini') : h('span', { class: 'mode-lock' }, `${m.unlockAfter} pics`),
    );
    return b;
  });
  const tri = h(
    'div',
    { class: 'tri-track' },
    svg(ICON.trifecta, 'ico tri'),
    h('span', {}, h('b', {}, 'Trifecta'), ` · 3 stars in Classic, Twist and Slider: +${TRIFECTA_POINTS}`),
  );
  const refresh = () => {
    const m = MODE[mode];
    const shape = shapeFor(l.i, mode);
    tiles.forEach((t) => t.classList.toggle('on', t.dataset.mode === mode));
    card.style.setProperty('--mc', m.color);
    info.replaceChildren(h('b', {}, m.name), ` · ${m.blurb}`);
    chips.replaceChildren(h('span', { class: 'chip' }, mode === 'slider' ? `${shape.size}×${shape.size} slider` : `${shape.rows * shape.cols} tiles`));
    const s = st()[mode] ?? 0;
    const best = progress.best[`${l.i}:${mode}`];
    bestEl.replaceChildren(
      ...[
        s ? starRow(s) : h('span', { class: 'muted small' }, mode === 'rush' ? 'Finish fast for 3 stars!' : 'Use as few moves as you can for 3 stars!'),
        best && s ? h('span', {}, mode === 'rush' ? `Best time: ${fmtTime(best.ms)}` : `Best: ${best.moves} moves`) : null,
      ].filter((x): x is HTMLElement => !!x),
    );
    tri.classList.toggle('done', hasTrifecta(progress, l.i));
  };
  const card = h(
    'div',
    { class: 'panel-card intro-card', style: `--wc:${worlds[l.packIndex].color}` },
    h('div', { class: 'ribbon' }, `Level ${l.i + 1} · ${worlds[l.packIndex].name}`),
    h('div', { class: 'intro-pic' }, h('img', { src: l.puzzle.thumb, alt: '' })),
    h('h3', {}, l.puzzle.title),
    h('div', { class: 'mode-tiles' }, tiles),
    info,
    h('div', { class: 'intro-meta' }, chips, bestEl),
    modeOpen('slider') ? tri : null,
    btn([svg(ICON.play), 'Play'], () => (m.close(), void play(l, mode)), 'green wide big', { 'data-play': '' }),
  );
  const m = modal(card, () => {});
  refresh();
}

// ---------- trophies ----------

function trophies() {
  portal.stop();
  music.play('menu');
  progress.newBadges = 0;
  save();
  const worldsDone = worldsComplete();
  const earned = Object.values(progress.badges).reduce((a, t) => a + t, 0);
  const cards = BADGES.map((b) => {
    const tier = progress.badges[b.id] ?? 0;
    const v = b.value(progress, { worldsDone });
    const goal = b.tiers[Math.min(2, tier)];
    const done = tier >= 3;
    return h(
      'div',
      { class: `badge-card tier-${tier}` },
      medal(b.icon, tier, 'big'),
      h(
        'div',
        { class: 'badge-body' },
        h('b', {}, b.name),
        h('span', { class: 'badge-tier' }, tier ? TIER_NAMES[tier] : 'Not earned yet'),
        h('p', {}, badgeText(b.text, done ? b.tiers[2] : goal)),
        h('div', { class: 'badge-bar' }, h('i', { style: `width:${Math.min(100, (v / goal) * 100)}%` })),
        h('span', { class: 'badge-num' }, done ? 'Complete' : `${Math.min(v, goal)} / ${goal}`),
      ),
    );
  });
  screen(
    'trophies',
    h('header', { class: 'topbar' }, roundBtn(ICON.back, 'Back to the map', () => map()), h('h1', { class: 'screen-title' }, 'Trophies'), h('span', { class: 'grow' }), roundBtn(ICON.gear, 'Settings', settings)),
    h(
      'div',
      { class: 'map-scroll' },
      h(
        'div',
        { class: 'trophy-wrap' },
        h(
          'div',
          { class: 'trophy-stats' },
          h('div', {}, h('small', {}, 'Points'), h('b', {}, fmtNum(progress.points))),
          h('div', {}, h('small', {}, 'Stars'), h('b', {}, String(totalStars(progress)))),
          h('div', {}, h('small', {}, 'Trifectas'), h('b', {}, String(progress.stats.trifectas))),
          h('div', {}, h('small', {}, 'Grand Slams'), h('b', {}, String(progress.stats.slams))),
          h('div', {}, h('small', {}, 'Badges'), h('b', {}, `${earned}/${BADGES.length * 3}`)),
        ),
        h(
          'div',
          { class: 'bonus-row' },
          h('div', { class: 'bonus' }, svg(ICON.trifecta, 'ico tri'), h('span', {}, h('b', {}, `Trifecta +${TRIFECTA_POINTS}`), '3 stars in Classic, Twist and Slider on one picture')),
          h('div', { class: 'bonus slam' }, svg(ICON.crown, 'ico'), h('span', {}, h('b', {}, `Grand Slam +${SLAM_POINTS}`), '3 stars in all five modes on one picture')),
        ),
        h('div', { class: 'badge-grid' }, cards),
      ),
    ),
  );
}

/** "Finish {n} puzzles" with the number filled in ("1 picture", not "1 pictures"). */
const badgeText = (t: string, n: number) => {
  const out = t.replace('{n}', String(n));
  return n === 1 ? out.replace('1 times', 'once').replace(/\b1 (\w+?)s\b/, '1 $1') : out;
};

function worldsComplete() {
  return worlds.filter((w) => w.levels.every((l) => levelDone(progress, l.i))).length;
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

/** One game in progress, whatever the mode: the board shows `gs`. */
interface Run {
  gs: GameState;
  slider: SliderState | null;
  /** Fewest moves (swap modes) or a good solver's count (slider). */
  par: number;
  moves(): number;
  correct(): number;
  total(): number;
  solved(): boolean;
  /** Positions to light up for a hint, or null. */
  hint(): number[] | null;
}

let board: Board | null = null;
let run: Run;
let startedAt = 0;
let elapsedBefore = 0;
let finished = false;
let paused = false;
let tickHandle = 0;
let moveHandlers: { swap(a: number, b: number): void; rotate(p: number): void; slide(p: number): void } | null = null;
let closeIntro: () => void = () => {};
const introKey = 'ssp_intro_seen2';
const introSeen = () => {
  try {
    return !!localStorage.getItem(introKey);
  } catch {
    return false;
  }
};

const elapsed = () => elapsedBefore + (startedAt && !paused ? performance.now() - startedAt : 0);

interface PlaySpec {
  level?: Level;
  daily?: boolean;
  puzzle: PackPuzzle;
  shape: Shape;
  label: string;
  color: string;
}

function play(l: Level, mode: ModeId = 'classic') {
  return startGame({ level: l, puzzle: l.puzzle, shape: shapeFor(l.i, mode), label: `Level ${l.i + 1}`, color: worlds[l.packIndex].color });
}

function daily() {
  const p = pack.puzzles[seedFromString('daily:' + today()) % pack.puzzles.length];
  const shape = dailyShape(dayIndex());
  return startGame({ daily: true, puzzle: p, shape, label: 'Daily', color: '#fbbf24' });
}

function newRun(seed: number, shape: Shape): Run {
  const rules = rulesFor(shape);
  if (shape.mode === 'slider') {
    const n = shape.size ?? 3;
    const ss = sliderNew(seed, n as SliderSize);
    const gs: GameState = {
      rows: n,
      cols: n,
      tiles: ss.tiles, // the same array: slides show up on the board straight away
      rot: new Array(n * n).fill(0),
      locked: new Array(n * n).fill(false),
      rules,
      par: 0,
      moves: 0,
      streak: 0,
      score: 0,
      hints: 0,
      places: 0,
    };
    const path = solveSlider(ss.tiles, n);
    const par = path?.length ?? distance(ss) * 2;
    gs.par = par;
    return {
      gs,
      slider: ss,
      par,
      moves: () => ss.moves,
      correct: () => ss.tiles.reduce((k, t, p) => k + (t === p && t !== n * n - 1 ? 1 : 0), 0),
      total: () => n * n - 1,
      solved: () => sliderSolved(ss),
      hint: () => {
        const p = solveSlider(ss.tiles, n);
        return p?.length ? [p[0]] : null;
      },
    };
  }
  const gs = newGameWithRules(seed, rules);
  return {
    gs,
    slider: null,
    par: gs.par,
    moves: () => gs.moves,
    correct: () => correctCount(gs),
    total: () => gs.tiles.length,
    solved: () => isSolved(gs),
    hint: () => {
      const m = suggest(gs);
      return m ? (m.kind === 'swap' ? [m.a, m.b] : [m.p]) : null;
    },
  };
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
  const mode = spec.shape.mode;
  const info = MODE[mode];
  const seed = spec.daily ? seedFromString('daily-board:' + today()) : randomSeed();
  run = newRun(seed, spec.shape);
  const state = run.gs;
  finished = false;
  paused = false;
  startedAt = 0;
  elapsedBefore = 0;
  let combo = 0;
  let hints = 3;
  let hintsUsed = 0;
  const [goal3, goal2] = moveGoals(mode, run.par);
  const rushMs = mode === 'rush' ? rushSeconds(run.par, run.total()) * 1000 : 0;
  const memory = mode === 'memory';
  const slider = mode === 'slider';

  // HUD
  const movesEl = h('b', {}, '0');
  const timeEl = h('span', { class: `time ${mode === 'rush' ? 'countdown' : ''}` }, mode === 'rush' ? fmtTime(rushMs) : '0:00');
  const meterFill = h('i');
  const meterStars = [0, 1, 2].map((k) => svg(ICON.star, `star on m${k}`));
  const meter = h('div', { class: `meter ${mode === 'rush' ? 'clock' : ''}` }, h('div', { class: 'meter-bar' }, meterFill), h('div', { class: 'meter-stars' }, meterStars));
  const progFill = h('i');
  const hintBadge = h('span', { class: 'badge' }, String(hints));
  const canvas = h('canvas', { id: 'board', tabindex: '0', 'aria-label': 'Puzzle board' }) as HTMLCanvasElement;
  const frame = h('div', { class: 'board-frame' }, canvas);
  const peekImg = h('div', { class: 'peek-full' }, h('img', { src: spec.puzzle.image, alt: '' }));
  const stage = h('div', { class: 'stage' }, frame, peekImg);
  const target = memory
    ? h('span', { class: 'target off', title: 'No peeking in Memory mode' }, svg(ICON.eyeOff))
    : h('button', { class: 'target', 'aria-label': 'Hold to see the picture' }, h('img', { src: spec.puzzle.thumb, alt: '' }), svg(ICON.eye, 'ico eye'));

  const showPeek = (v: boolean) => stage.classList.toggle('peeking', v);
  if (!memory) {
    target.addEventListener('pointerdown', () => showPeek(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) target.addEventListener(ev, () => showPeek(false));
  }

  const hintBtn = btn([svg(ICON.bulb), 'Hint', hintBadge], () => {
    if (finished || paused) return;
    if (hints <= 0) {
      sfx.denied();
      shake(hintBtn);
      return;
    }
    const pos = run.hint();
    if (!pos) return;
    hints--;
    hintsUsed++;
    hintBadge.textContent = String(hints);
    hintBtn.classList.toggle('empty', hints === 0);
    sfx.hint();
    begin();
    board!.showHint(pos, 3500);
  }, 'yellow');

  const tip = slider ? 'Tap a tile in line with the gap' : mode === 'twist' ? 'Tap a tile to turn it' : null;
  screen(
    `game mode-${mode}`,
    h(
      'header',
      { class: 'topbar game-top', style: `--wc:${spec.color};--mc:${info.color}` },
      roundBtn(ICON.pause, 'Pause', () => pause()),
      h('div', { class: 'level-pill' }, h('span', {}, spec.label), h('small', {}, svg(MODE_ICON[mode]), info.name)),
      meter,
      h('div', { class: 'moves' }, h('small', {}, 'Moves'), movesEl),
      target,
    ),
    stage,
    h(
      'footer',
      { class: 'game-bottom' },
      h('div', { class: 'progress' }, progFill),
      h('div', { class: 'bottom-row' }, timeEl, h('span', { class: 'grow' }), tip ? h('span', { class: 'tip' }, svg(slider ? ICON.slider : ICON.rotate), tip) : null, hintBtn),
    ),
  );

  const updateMeter = () => {
    if (mode === 'rush') {
      const left = Math.max(0, 1 - elapsed() / rushMs);
      meterFill.style.width = `${left * 100}%`;
      meter.classList.toggle('low', left < 0.2);
      meterStars[2].classList.toggle('on', rushStars(left) >= 3);
      meterStars[1].classList.toggle('on', rushStars(left) >= 2);
      return;
    }
    const m = run.moves();
    const left = m <= goal3 ? 1 - (m / goal3) * 0.34 : m <= goal2 ? 0.66 - ((m - goal3) / (goal2 - goal3)) * 0.33 : 0.33;
    meterFill.style.width = `${Math.max(0.08, left) * 100}%`;
    meterStars[2].classList.toggle('on', m <= goal3);
    meterStars[1].classList.toggle('on', m <= goal2);
  };
  const hud = () => {
    movesEl.textContent = String(run.moves());
    progFill.style.width = `${(run.correct() / run.total()) * 100}%`;
    updateMeter();
  };
  const begin = () => {
    closeIntro();
    if (!startedAt && !finished && !paused) startedAt = performance.now();
  };
  const tileCenter = (p: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((p % state.cols) + 0.5) * (r.width / state.cols), y: r.top + (Math.floor(p / state.cols) + 0.5) * (r.height / state.rows) };
  };
  const PRAISE = ['', '', 'Nice', 'Great', 'Superb', 'Brilliant', 'On fire', 'Unstoppable'];
  const after = (placed: number[], quiet = false) => {
    // Memory: every move sounds and looks the same, so nothing gives the answer away.
    if (memory) placed = [];
    if (placed.length && slider) {
      // Sliding moves tiles in and out of place all the time: no combos.
      sfx.correct(Math.min(9, run.correct()), placed.length);
      for (const p of placed) {
        const c = tileCenter(p);
        burst(c.x, c.y, 8);
      }
    } else if (placed.length) {
      combo++;
      if (combo > progress.stats.maxCombo) progress.stats.maxCombo = combo;
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
      if (!quiet) sfx.swap();
    }
    hud();
    if (run.solved()) void win(spec, { hintsUsed, rushMs });
  };
  const onSwap = (a: number, b: number) => {
    if (finished || paused || slider) return;
    begin();
    const before = state.tiles.map((_, q) => isCorrect(state, q));
    const r = swap(state, a, b);
    if (!r.ok) {
      sfx.denied();
      shake(frame);
      return;
    }
    const placed = [a, b].filter((q) => !before[q] && isCorrect(state, q));
    board!.animateSwap(a, b, memory ? [] : placed);
    after(placed);
  };
  const onRotate = (q: number) => {
    if (finished || paused || slider) return;
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
  const onSlide = (p: number) => {
    const ss = run.slider;
    if (finished || paused || !ss) return;
    const steps = lineSteps(ss, p);
    if (!steps.length) {
      sfx.denied();
      return;
    }
    begin();
    const placed: number[] = [];
    for (const q of steps) {
      const from = ss.blank;
      slide(ss, q);
      // The tile from q is now at `from`.
      const ok = ss.tiles[from] === from;
      if (ok) placed.push(from);
      board!.animateSwap(from, q, ok ? [from] : []);
    }
    if (!placed.length) sfx.swap();
    after(placed, true);
  };
  moveHandlers = { swap: onSwap, rotate: onRotate, slide: onSlide };
  board = new Board(canvas, img, {
    showCorrect: !memory && !slider,
    hideCorrect: memory,
    onSwap,
    onRotate,
    ...(slider ? { blankTile: state.rows * state.cols - 1, onSlide } : {}),
  });
  board.setState(state);
  board.setCompleted(false);
  hud();
  music.play('game');
  portal.start();

  clearInterval(tickHandle);
  tickHandle = window.setInterval(() => {
    if (mode === 'rush') {
      const left = rushMs - elapsed();
      timeEl.textContent = fmtTime(left);
      timeEl.classList.toggle('low', left < rushMs * 0.2);
      updateMeter();
      if (left <= 0 && !finished) timeUp(spec);
    } else timeEl.textContent = fmtTime(elapsed());
  }, 200);
  canvas.focus({ preventScroll: true });

  if (memory) {
    // Study the picture, then rebuild it without looking.
    const secs = Math.min(6, 3 + Math.floor(run.total() / 20));
    board.setRevealed(true);
    paused = true;
    const count = h('b', {}, String(secs));
    const over = h('div', { class: 'memorize' }, h('span', {}, 'Memorize the picture'), count);
    stage.append(over);
    let left = secs;
    const t = window.setInterval(() => {
      left--;
      count.textContent = String(left);
      if (left > 0) sfx.click();
      if (left <= 0 || !board) {
        clearInterval(t);
        over.remove();
        if (!board || finished) return;
        board.setRevealed(false);
        sfx.whoosh();
        paused = false;
        begin();
      }
    }, 1000);
  } else if (mode === 'rush') {
    setTimeout(() => begin(), 600);
  } else if (mode === 'classic' || mode === 'twist') {
    setTimeout(() => !finished && showIntro(stage, canvas, mode === 'twist'), 450);
  }

  // Pause menu
  function pause() {
    if (finished || paused) return;
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
      if (run.moves() || mode === 'rush' || memory) startedAt = performance.now();
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
  if (introSeen()) return;
  const state = run.gs;
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
    try {
      localStorage.setItem(introKey, '1');
    } catch {
      /* storage blocked */
    }
    anim.cancel();
    layer.remove();
    board?.showHint([], 0);
  };
}

function stopClock() {
  finished = true;
  elapsedBefore = elapsed();
  startedAt = 0;
  clearInterval(tickHandle);
  portal.stop();
}

function timeUp(spec: PlaySpec) {
  stopClock();
  sfx.denied();
  shake(document.querySelector('.board-frame') as HTMLElement);
  const done = Math.round((run.correct() / run.total()) * 100);
  const m = modal(
    h(
      'div',
      { class: 'panel-card lose-card' },
      h('div', { class: 'ribbon', style: '--wc:#fbbf24' }, "Time's up!"),
      h('div', { class: 'lose-ring', style: `--p:${done}` }, h('b', {}, `${done}%`)),
      h('p', { class: 'muted' }, 'So close! Have another go, or try a calmer mode.'),
      h(
        'div',
        { class: 'win-btns' },
        roundBtn(ICON.home, 'Map', () => (m.close(), void breakAd().then(() => map())), 'orange'),
        spec.level ? btn('Classic', () => (m.close(), void play(spec.level!, 'classic')), 'grow') : null,
        btn([svg(ICON.restart), 'Retry'], () => (m.close(), void startGame(spec)), 'green big grow'),
      ),
    ),
  );
}

async function win(spec: PlaySpec, extra: { hintsUsed: number; rushMs: number }) {
  stopClock();
  const mode = spec.shape.mode;
  const moves = run.moves();
  const ms = elapsedBefore;
  const stars = mode === 'rush' ? rushStars(Math.max(0, 1 - ms / extra.rushMs)) : moves <= moveGoals(mode, run.par)[0] ? 3 : moves <= moveGoals(mode, run.par)[1] ? 2 : 1;
  const l = spec.level;
  let result: WinResult;
  if (l) {
    result = recordWin(progress, l.i, mode, stars, {
      moves,
      ms,
      perfect: (mode === 'classic' || mode === 'twist') && moves <= run.par,
      clean: run.total() >= 30 && extra.hintsUsed === 0,
      starPoints: MODE[mode].starPoints,
    });
  } else result = recordDaily(progress, stars, today(), yesterday());
  const badges = checkBadges(progress, { worldsDone: worldsComplete() });
  const newModes = unseenModes();
  save();

  board!.setCompleted(true);
  await board!.celebrate();
  sfx.win();
  confetti(result.trifecta || result.slam ? 260 : stars === 3 ? 180 : 110);
  portal.celebrate();
  // Enjoy the finished picture for a moment (any tap skips).
  await admire(2400);

  const starEls = [0, 1, 2].map(() => h('span', { class: 'big-star' }, svg(ICON.star, 'star')));
  const nextLevel = l && l.i + 1 < levels.length ? levels[l.i + 1] : null;
  const goNext = async () => {
    m.close();
    await breakAd();
    const nextMode: ModeId = modeOpen(mode) ? mode : 'classic';
    const go = () => {
      if (nextLevel) {
        if (l && nextLevel.packIndex !== l.packIndex) worldUnlocked(nextLevel, nextMode);
        else void play(nextLevel, nextMode);
      } else map();
    };
    if (newModes.length) modeUnlocked(newModes[0].id, nextLevel ?? l!, go);
    else go();
  };
  const goal = mode === 'rush' ? null : moveGoals(mode, run.par)[0];
  const modeRow = l
    ? h(
        'div',
        { class: 'mode-row' },
        MODES.map((mm) =>
          h(
            'span',
            { class: `mode-chip ${mm.id === mode ? 'now' : ''} ${TRIFECTA.includes(mm.id) ? 'tri' : ''}`, style: `--mc:${mm.color}`, title: mm.name },
            svg(MODE_ICON[mm.id]),
            starRow(progress.stars[l.i]?.[mm.id] ?? 0, 'stars mini'),
          ),
        ),
      )
    : null;
  const m = modal(
    h(
      'div',
      { class: `panel-card win-card ${result.trifecta ? 'is-tri' : ''} ${result.slam ? 'is-slam' : ''}`, style: `--mc:${MODE[mode].color}` },
      h('div', { class: 'ribbon green' }, spec.daily ? `Daily ${MODE[mode].name} complete!` : `${MODE[mode].name} complete!`),
      h('div', { class: 'win-stars' }, starEls),
      result.slam
        ? h('div', { class: 'tri-banner slam' }, svg(ICON.crown), h('span', {}, h('b', {}, 'GRAND SLAM'), 'All five modes, 3 stars!'))
        : result.trifecta
          ? h('div', { class: 'tri-banner' }, svg(ICON.trifecta), h('span', {}, h('b', {}, 'TRIFECTA'), 'Classic, Twist and Slider, 3 stars each!'))
          : h('div', { class: 'win-pic' }, h('img', { src: spec.puzzle.thumb, alt: '' })),
      h(
        'div',
        { class: 'win-stats' },
        h('div', {}, h('small', {}, 'Moves'), h('b', {}, String(moves))),
        h('div', {}, h('small', {}, mode === 'rush' ? 'Time left' : 'Time'), h('b', {}, fmtTime(mode === 'rush' ? extra.rushMs - ms : ms))),
        h('div', { class: 'pts-stat' }, h('small', {}, 'Points'), h('b', {}, `+${result.points}`)),
        spec.daily ? h('div', {}, h('small', {}, 'Streak'), h('b', {}, `${progress.daily.streak}🔥`)) : null,
      ),
      h('div', { class: 'pts-lines' }, result.lines.map((x) => h('span', {}, x.label, h('b', {}, `+${x.points}`)))),
      modeRow,
      stars < 3 && goal ? h('p', { class: 'muted small' }, `3 stars: ${goal} moves or fewer`) : stars < 3 ? h('p', { class: 'muted small' }, 'Finish faster for 3 stars') : null,
      h(
        'div',
        { class: 'win-btns' },
        roundBtn(ICON.home, 'Map', () => (m.close(), void breakAd().then(() => map())), 'orange'),
        roundBtn(ICON.restart, 'Play again', () => (m.close(), void startGame(spec)), 'blue'),
        l && !hasTrifecta(progress, l.i) && modeOpen('slider')
          ? (() => {
              const missing = TRIFECTA.find((x) => (progress.stars[l.i]?.[x] ?? 0) < 3 && x !== mode) ?? null;
              return missing ? roundBtn(MODE_ICON[missing], `Play this picture in ${MODE[missing].name}`, () => (m.close(), void play(l, missing)), 'blue') : null;
            })()
          : null,
        nextLevel ? btn(['Next', svg(ICON.next)], () => void goNext(), 'green big grow', { 'data-next': '' }) : btn('Back to map', () => (m.close(), map()), 'green big grow'),
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
  if (result.trifecta || result.slam) setTimeout(() => (sfx.combo(), confetti(160)), 1500);
  if (badges.length) setTimeout(() => toastBadges(badges), 1700);
}

/** Modes that have opened but haven't been introduced yet. */
const unseenModes = () => MODES.filter((m) => !progress.modesSeen.includes(m.id) && modeOpen(m.id));

function modeUnlocked(id: ModeId, l: Level, later: () => void) {
  const m0 = MODE[id];
  progress.modesSeen.push(id);
  save();
  sfx.unlock();
  confetti(90);
  const m = modal(
    h(
      'div',
      { class: 'panel-card mode-card', style: `--mc:${m0.color}` },
      h('div', { class: 'ribbon', style: `--wc:${m0.color}` }, 'New way to play!'),
      h('span', { class: 'mode-hero' }, svg(MODE_ICON[id])),
      h('h3', {}, m0.name),
      h('p', { class: 'muted' }, m0.how),
      id === 'slider' ? h('p', { class: 'small tri-note' }, svg(ICON.trifecta, 'ico tri'), `Get 3 stars in Classic, Twist and Slider on a picture for a Trifecta: +${TRIFECTA_POINTS} points.`) : null,
      h('div', { class: 'win-btns' }, btn('Later', () => (m.close(), later()), 'grow'), btn([svg(ICON.play), `Try ${m0.name}`], () => (m.close(), void play(l, id)), 'green big grow')),
    ),
  );
  m.box.classList.add('pop');
}

function worldUnlocked(l: Level, mode: ModeId) {
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
      h('p', { class: 'muted small' }, `${w.levels.length} pictures`),
      btn([svg(ICON.play), "Let's go!"], () => (m.close(), void play(l, mode)), 'green wide big'),
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
    levels: ps.map((p) => ({ i: i++, puzzle: p, packIndex: wi })),
  }));
  levels = worlds.flatMap((w) => w.levels);
}
// Badges for anything already done (e.g. progress from an earlier version).
if (checkBadges(progress, { worldsDone: worldsComplete() }).length) save();
portal.loaded();

// On portals, players should be playing straight away: first visit opens level 1;
// later visits open the map at the next level. Elsewhere, start on the title.
const params = new URLSearchParams(location.search);
if (params.has('menu')) title();
else if (params.has('map')) map();
else if (params.has('trophies')) trophies();
else if (!levelsDone(progress)) void play(levels[0]);
else if (portal.name !== 'web') map();
else title();

// Automated test hooks (?selftest).
if (params.has('selftest')) {
  let path: number[] = [];
  const step = () => {
    if (run.solved() || finished) return false;
    if (run.slider) {
      if (!path.length) path = solveSlider(run.slider.tiles, run.slider.n) ?? [];
      const q = path.shift();
      if (q === undefined) return false;
      moveHandlers!.slide(q);
      return true;
    }
    const m = suggest(run.gs);
    if (!m) return false;
    if (m.kind === 'swap') moveHandlers!.swap(m.a, m.b);
    else moveHandlers!.rotate(m.p);
    return true;
  };
  (window as unknown as { __ssp: unknown }).__ssp = {
    step,
    solve() {
      path = [];
      while (step());
    },
    play(slug: string, mode: ModeId = 'classic') {
      const l = levels.find((x) => x.puzzle.slug === slug);
      if (l) void play(l, mode);
    },
    level(i: number, mode: ModeId = 'classic') {
      path = [];
      void play(levels[i], mode);
    },
    unlockAll() {
      levels.forEach((l) => ((progress.stars[l.i] ??= {}).classic ||= 3));
      save();
    },
    progress: () => progress,
  };
}
