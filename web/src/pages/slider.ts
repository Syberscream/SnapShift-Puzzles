// Slider Puzzle: one empty square; tap a tile next to it (or anywhere in its
// row or column) to slide tiles into it. Today's shared 4×4 slider has a
// leaderboard; any picture you can play can be slid at 3×3, 4×4 or 5×5 (Plus).

import { celebrateAchievements } from '../lib/achievement-popup';
import { api, ApiError } from '../lib/api';
import { me, setPoints, shell, showError } from '../lib/shell';
import { countdown, errorText, h, medalBadge, modal, mount, pickImage, plusTag, qs, store, toast, userLink, bg } from '../lib/ui';
import { confetti } from '../game/confetti';
import { isMuted, setMuted, sfx } from '../game/sound';
import { noteFinish } from '../lib/install';
import { isSliderSize, lineSteps, slide, SLIDER, SLIDER_SIZES, sliderCorrect, sliderMedal, sliderNew, sliderSolved, type SliderSize, type SliderState } from '@shared/slider';

interface Picture {
  slug: string;
  title: string;
  image: string;
  imageSmall?: string | null;
  thumb: string;
  width: number | null;
  height: number | null;
}
interface BoardRow {
  rank: number;
  username: string;
  elapsedMs: number;
  moves: number;
  medal: string;
  plus: boolean;
  isMe: boolean;
}
interface Daily {
  day: string;
  size: SliderSize;
  nextInMs: number;
  puzzle: Picture;
  leaderboard: { rows: BoardRow[]; me: { elapsedMs: number; moves: number; medal: string; rank: number | null } | null };
}
interface Start {
  gameId: string | null;
  size: SliderSize;
  seed: number;
  daily: string | null;
  puzzle: Picture;
}
interface Finish {
  elapsedMs: number;
  moves: number;
  medal: string;
  points: number;
  pointsCapped: boolean;
  firstDaily: boolean;
  best: { elapsedMs: number; moves: number; games: number };
  newBest: boolean;
  daily: { rank: number | null; elapsedMs: number } | null;
  achievements: { icon: string; title: string; description: string }[];
  balance: number;
}

const main = await shell({ title: 'Slider Puzzle', bodyClass: 'game-page' });
const prefs = store<{ size: SliderSize; numbers: boolean }>('ss_slider_prefs', { size: 3, numbers: false });
const guestBest = store<Record<string, number>>('ss_slider_guest_best', {});

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
};
const shortClock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('The picture did not load. Please refresh.'));
    i.src = src;
  });
}

// ---------------- the board ----------------

class SliderBoard {
  el = h('div', { class: 'slider-board', tabindex: '0', role: 'grid', 'aria-label': 'Slider board. Tap a tile in the same row or column as the empty square to slide it. Arrow keys slide too.' });
  private tiles: HTMLElement[] = [];
  private peekEl = h('div', { class: 'slider-peek', hidden: true });
  private crop = { x: 0, y: 0, w: 1, h: 1 };
  private numbers = false;
  done = false;

  constructor(
    private img: HTMLImageElement,
    private s: SliderState,
    private onTap: (p: number) => void,
  ) {
    const n = s.n;
    // Phones get a squarer crop so the tiles aren't tiny.
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    // Very wide pictures are cropped too (to 16:9) so tiles stay reasonably square.
    const aspect = Math.min(W / H, window.matchMedia('(max-width: 700px)').matches ? 4 / 3 : 16 / 9);
    if (W / H > aspect) this.crop = { x: (W - H * aspect) / 2, y: 0, w: H * aspect, h: H };
    else this.crop = { x: 0, y: (H - W / aspect) / 2, w: W, h: W / aspect };
    this.el.style.aspectRatio = `${this.crop.w} / ${this.crop.h}`;
    this.el.style.setProperty('--aspect', String(this.crop.w / this.crop.h));
    this.el.style.setProperty('--n', String(n));
    for (let t = 0; t < n * n; t++) {
      const tile = h('div', { class: `slider-tile${t === n * n - 1 ? ' blank' : ''}`, 'data-t': t }, h('span', { class: 'num' }, String(t + 1)));
      tile.style.backgroundImage = `url("${img.src}")`;
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.done) this.onTap(this.s.tiles.indexOf(t));
      });
      this.tiles[t] = tile;
      this.el.append(tile);
    }
    this.peekEl.style.backgroundImage = `url("${img.src}")`;
    this.el.append(this.peekEl);
    this.el.addEventListener('keydown', (e) => {
      if (this.done) return;
      const b = this.s.blank;
      const map: Record<string, number> = { ArrowLeft: b % n < n - 1 ? b + 1 : -1, ArrowRight: b % n > 0 ? b - 1 : -1, ArrowUp: b + n < n * n ? b + n : -1, ArrowDown: b - n >= 0 ? b - n : -1 };
      if (e.key in map) {
        e.preventDefault();
        if (map[e.key] >= 0) this.onTap(map[e.key]);
      }
    });
    new ResizeObserver(() => this.layout()).observe(this.el);
    this.draw(false);
  }

  setState(s: SliderState) {
    this.s = s;
    this.done = false;
    this.el.classList.remove('solved');
    this.draw(false);
  }

  setNumbers(v: boolean) {
    this.numbers = v;
    this.el.classList.toggle('show-numbers', v);
  }

  /** Background sizes in pixels, recomputed when the board changes size. */
  private layout() {
    const bw = this.el.clientWidth;
    if (!bw) return;
    const n = this.s.n;
    const scale = bw / this.crop.w;
    const tw = bw / n;
    const th = this.el.clientHeight / n;
    const size = `${this.img.naturalWidth * scale}px ${this.img.naturalHeight * scale}px`;
    this.tiles.forEach((tile, t) => {
      tile.style.backgroundSize = size;
      tile.style.backgroundPosition = `${-(this.crop.x * scale + (t % n) * tw)}px ${-(this.crop.y * scale + Math.floor(t / n) * th)}px`;
    });
    this.peekEl.style.backgroundSize = size;
    this.peekEl.style.backgroundPosition = `${-this.crop.x * scale}px ${-this.crop.y * scale}px`;
  }

  draw(animate = true) {
    const n = this.s.n;
    this.el.classList.toggle('instant', !animate);
    this.s.tiles.forEach((t, p) => {
      const tile = this.tiles[t];
      tile.style.transform = `translate(${(p % n) * 100}%, ${Math.floor(p / n) * 100}%)`;
      tile.classList.toggle('home', t === p && t !== n * n - 1);
    });
    if (!animate) requestAnimationFrame(() => this.el.classList.remove('instant'));
  }

  peek(ms = 1600) {
    this.peekEl.hidden = false;
    setTimeout(() => (this.peekEl.hidden = true), ms);
  }

  finish() {
    this.done = true;
    this.el.classList.add('solved');
  }
}

// ---------------- a game ----------------

let timer = 0;

async function play(opts: { daily?: Daily; slug?: string; size?: SliderSize }) {
  // Load the picture first, so the clock doesn't run while it downloads.
  let pic: Picture;
  try {
    pic = opts.daily ? opts.daily.puzzle : { ...(await api.get<{ puzzle: Picture }>(`/puzzles/${encodeURIComponent(opts.slug!)}`)).puzzle };
  } catch (e) {
    return showError(main, errorText(e));
  }
  let img: HTMLImageElement;
  try {
    img = await loadImg(pickImage(pic, true));
  } catch (e) {
    return showError(main, errorText(e));
  }
  let size: SliderSize = opts.daily ? opts.daily.size : (opts.size ?? 3);
  let start!: Start;
  let s!: SliderState;
  let actions: number[] = [];
  let startedAt = 0;
  let finished = false;
  let board!: SliderBoard;

  const timeEl = h('span', { class: 'pill time-pill' }, 'Time: 0:00.0');
  const movesEl = h('span', { class: 'pill dark' }, 'Moves: 0');
  const sizeEl = h('span', { class: 'pill dark' }, '');
  const progressFill = h('i');
  const wrap = h('div', { class: `slider-wrap${me()?.frame ? ` board-wrap frame-${me()!.frame}` : ''}` });

  const begin = async () => {
    try {
      start = await api.post<Start>('/slider/start', opts.daily ? { daily: true } : { slug: pic.slug, size });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && size === 5) {
        modal(h('h2', {}, '5×5 is a Plus board'), h('p', {}, 'SnapShift Plus members can play the 5×5 slider on any picture.'), h('div', { class: 'row end' }, h('a', { class: 'btn primary', href: '/plus' }, 'See SnapShift Plus')));
        return false;
      }
      showError(main, errorText(e));
      return false;
    }
    size = start.size;
    s = sliderNew(start.seed, size);
    actions = [];
    finished = false;
    if (board) board.setState(s);
    else board = new SliderBoard(img, s, onTap);
    board.setNumbers(prefs.get().numbers);
    sizeEl.textContent = opts.daily ? `Today · ${SLIDER.labels[size]}` : SLIDER.labels[size];
    startedAt = performance.now();
    clearInterval(timer);
    timer = window.setInterval(() => {
      if (!finished) timeEl.textContent = `Time: ${clock(performance.now() - startedAt)}`;
    }, 100);
    hud();
    return true;
  };

  const hud = () => {
    movesEl.textContent = `Moves: ${s.moves}`;
    progressFill.style.width = `${(sliderCorrect(s) / (s.n * s.n - 1)) * 100}%`;
  };

  function onTap(p: number) {
    if (finished) return;
    const steps = lineSteps(s, p);
    if (!steps.length) return sfx.denied();
    const before = sliderCorrect(s);
    for (const q of steps) {
      slide(s, q);
      actions.push(q);
    }
    board.draw();
    const gained = sliderCorrect(s) - before;
    if (gained > 0) sfx.correct(gained);
    else sfx.swap();
    hud();
    if (sliderSolved(s)) void done();
  }

  async function done() {
    finished = true;
    clearInterval(timer);
    const localMs = performance.now() - startedAt;
    timeEl.textContent = `Time: ${clock(localMs)}`;
    board.finish();
    noteFinish();
    let r: Finish | null = null;
    if (start.gameId) {
      try {
        r = await api.post<Finish>(`/slider/${start.gameId}/finish`, { actions });
        setPoints(r.balance);
      } catch (e) {
        toast('Not saved', errorText(e), 'bad');
      }
    }
    const medal = r?.medal ?? sliderMedal(size, localMs);
    sfx.win(medal);
    setTimeout(() => confetti(medal), 350);
    setTimeout(() => result(r, medal, localMs), 900);
  }

  function result(r: Finish | null, medal: string, localMs: number) {
    celebrateAchievements(r?.achievements);
    const ms = r?.elapsedMs ?? localMs;
    let best = r?.best.elapsedMs ?? ms;
    if (!r) {
      const key = `${opts.daily ? 'daily:' + opts.daily.day : pic.slug}:${size}`;
      const all = guestBest.get();
      best = Math.min(all[key] ?? Infinity, ms);
      guestBest.set({ ...all, [key]: best });
    }
    const share = `SnapShift Slider ${size}×${size} ${medal === 'gold' ? '🥇' : medal === 'silver' ? '🥈' : '🥉'} ${shortClock(ms)} · ${s.moves} moves\n${location.origin}/slider`;
    const d = modal(
      h('div', { class: `result-medal ${medal} celebrate` }, medalBadge(medal), h('span', { class: 'medal-name' }, `${medal} medal`)),
      h('h2', {}, r?.newBest ? 'New best!' : 'Solved!'),
      h('p', { class: 'muted' }, `${pic.title} · ${SLIDER.labels[size]}${opts.daily ? ' · today’s slider' : ''}`),
      h(
        'div',
        { class: 'result-grid' },
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Time'), h('b', {}, shortClock(ms))),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Moves'), h('b', {}, String(s.moves))),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Your best'), h('b', {}, shortClock(best))),
      ),
      r
        ? h(
            'p',
            {},
            r.daily?.rank ? `You're #${r.daily.rank} on today’s slider. ` : '',
            r.points ? `+${r.points} points${r.firstDaily ? ' (with today’s slider bonus)' : ''}.` : r.pointsCapped ? 'You’ve reached today’s slider points limit.' : '',
          )
        : h('div', { class: 'notice small' }, h('a', { href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Create a free account'), opts.daily ? ' to get on today’s leaderboard and earn points.' : ' to save your times and earn points.'),
      h(
        'div',
        { class: 'row end' },
        h('a', { class: 'btn', href: '/' }, 'Home'),
        h('button', { class: 'btn', onclick: () => void shareText(share) }, 'Share'),
        h('a', { class: 'btn', href: '/slider' }, opts.daily ? 'Leaderboard' : 'Slider home'),
        h('button', { class: 'btn primary', onclick: () => (d.close(), void begin()) }, 'Play again'),
      ),
    );
  }

  // ---- controls ----
  const peekBtn = h('button', { class: 'btn key', onclick: () => board?.peek() }, 'Peek');
  const numBtn = h('button', { class: 'btn key', 'aria-pressed': String(prefs.get().numbers) }, 'Numbers');
  numBtn.addEventListener('click', () => {
    const v = !prefs.get().numbers;
    prefs.set({ ...prefs.get(), numbers: v });
    numBtn.setAttribute('aria-pressed', String(v));
    board?.setNumbers(v);
  });
  const newBtn = h('button', { class: 'btn key', onclick: () => void begin() }, opts.daily ? 'Restart' : 'New shuffle');
  const sizeSel = h(
    'select',
    { 'aria-label': 'Board size', disabled: !!opts.daily },
    SLIDER_SIZES.map((n) => h('option', { value: n, selected: n === size }, `${SLIDER.labels[n]}${n === SLIDER.membersSize && !me()?.member ? ' (Plus)' : ''}`)),
  ) as HTMLSelectElement;
  sizeSel.addEventListener('change', async () => {
    const want = Number(sizeSel.value) as SliderSize;
    const prev = size;
    size = want;
    if (await begin()) {
      prefs.set({ ...prefs.get(), size: want });
      history.replaceState(null, '', `/slider?p=${encodeURIComponent(pic.slug)}&size=${want}`);
    } else {
      size = prev;
      sizeSel.value = String(prev);
    }
  });
  const muteBtn = h('button', { class: 'btn', 'aria-pressed': String(isMuted()) }, isMuted() ? 'Sound off' : 'Sound on');
  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on';
  });

  if (!(await begin())) {
    if (size === 5) {
      size = 4;
      if (!(await begin())) return;
    } else return;
  }
  sizeSel.value = String(size);
  wrap.append(board.el);
  mount(
    main,
    h(
      'div',
      { class: 'game' },
      h(
        'aside',
        { class: 'side panel', 'aria-label': 'Slider controls' },
        h('a', { class: 'btn', href: '/slider' }, '← Slider home'),
        h('b', { class: 'sidebar-title' }, pic.title),
        h('div', { class: 'preview', style: bg(pic.thumb) }),
        opts.daily ? null : sizeSel,
        newBtn,
        peekBtn,
        numBtn,
        muteBtn,
        h('p', { class: 'small muted' }, 'Tap a tile next to the empty square to slide it. Tap further along the row or column to slide several at once. Arrow keys work too.'),
      ),
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'hud' }, h('div', { class: 'row' }, timeEl, movesEl, sizeEl)),
        wrap,
        h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Tiles in place' }, progressFill),
      ),
    ),
  );
  board.el.focus({ preventScroll: true });
}

async function shareText(text: string) {
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Copied', 'Paste it anywhere to share.', 'good');
    }
  } catch {
    /* cancelled */
  }
}

// ---------------- the slider home ----------------

async function intro() {
  document.body.classList.remove('game-page');
  let d: Daily | null = null;
  try {
    d = await api.get<Daily>('/slider/daily');
  } catch (e) {
    showError(main, errorText(e));
  }
  const user = me();
  const size = prefs.get().size;
  const cd = h('span', { class: 'countdown' });
  const sizeBtns = SLIDER_SIZES.map((n) =>
    h(
      'button',
      { class: `btn${n === size ? ' primary' : ''}`, 'data-size': n, onclick: () => pickRandom(n) },
      SLIDER.labels[n],
      n === SLIDER.membersSize && !user?.member ? plusTag() : null,
    ),
  );
  const pickRandom = async (n: SliderSize) => {
    if (n === SLIDER.membersSize && !user?.member) return void (location.href = '/plus');
    prefs.set({ ...prefs.get(), size: n });
    try {
      const t = await api.get<{ slug: string }>('/tutorial');
      location.href = `/slider?p=${encodeURIComponent(t.slug)}&size=${n}`;
    } catch (e) {
      toast('Couldn’t pick a picture', errorText(e), 'bad');
    }
  };
  mount(
    main,
    d
      ? h(
          'section',
          { class: 'panel slider-hero' },
          h('div', { class: 'slider-hero-art', style: bg(d.puzzle.thumb) }),
          h(
            'div',
            { class: 'stack' },
            h('div', { class: 'row' }, h('span', { class: 'pill' }, h('span', { class: 'label' }, 'New slider in'), cd)),
            h('h1', {}, `Today’s Slider · ${d.puzzle.title}`),
            h('p', { class: 'muted' }, `Slide the tiles into the empty square to rebuild the picture. Same ${d.size}×${d.size} shuffle for everyone today; fastest time wins.`),
            d.leaderboard.me
              ? h('div', { class: 'notice' }, h('b', {}, 'Done today! '), medalBadge(d.leaderboard.me.medal), ` ${shortClock(d.leaderboard.me.elapsedMs)} · ${d.leaderboard.me.moves} moves${d.leaderboard.me.rank ? ` · #${d.leaderboard.me.rank}` : ''}`)
              : null,
            h('div', { class: 'row' }, h('a', { class: 'btn primary big', href: '/slider?daily=1' }, d.leaderboard.me ? 'Try to beat it' : 'Play today’s slider')),
            !user ? h('p', { class: 'small muted' }, 'Guests can play. ', h('a', { href: '/account?next=/slider' }, 'Sign in'), ' to get on the leaderboard and earn points.') : null,
          ),
        )
      : null,
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Slide any picture'),
      h('p', { class: 'muted' }, 'Pick a size for a random picture, or open any puzzle you can play and choose “Play as slider”.'),
      h('div', { class: 'row' }, sizeBtns),
      h('p', { class: 'small muted' }, `Signed-in players earn ${SLIDER.points[3]}, ${SLIDER.points[4]} or ${SLIDER.points[5]} points per solve, plus ${SLIDER.dailyBonus} for today’s slider (up to ${SLIDER.dailyPointsCap} a day).`),
    ),
    d && d.leaderboard.rows.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', {}, 'Today’s fastest'),
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Time'), h('th', { class: 'num' }, 'Moves'))),
            h(
              'tbody',
              {},
              d.leaderboard.rows.slice(0, 20).map((r) =>
                h(
                  'tr',
                  { class: r.isMe ? 'me' : '' },
                  h('td', {}, r.rank),
                  h('td', {}, medalBadge(r.medal), ' ', userLink(r.username), r.plus ? plusTag() : null),
                  h('td', { class: 'num' }, shortClock(r.elapsedMs)),
                  h('td', { class: 'num' }, r.moves),
                ),
              ),
            ),
          ),
        )
      : d
        ? h('section', { class: 'panel' }, h('p', { class: 'muted' }, 'No one has finished today’s slider yet. Be the first!'))
        : null,
  );
  if (d) countdown(cd, d.nextInMs);
}

// ---------------- route ----------------

const slug = qs('p');
const sizeQ = Number(qs('size'));
if (qs('daily')) {
  try {
    await play({ daily: await api.get<Daily>('/slider/daily') });
  } catch (e) {
    showError(main, errorText(e));
  }
} else if (slug) {
  await play({ slug, size: isSliderSize(sizeQ) ? sizeQ : prefs.get().size });
} else {
  await intro();
}
