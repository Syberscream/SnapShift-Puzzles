// Canvas board: draws the sliced image and turns clicks, drags and keys into moves.
//   Classic / Zen: drag a tile onto another, or click two tiles, to swap.
//   Rotation:      drag to swap, tap a tile to turn it a quarter turn clockwise (or press R).
//   Slider:        (opt-in via blankTile/onSlide) tap a tile in line with the gap to slide it.

import type { GameState } from '@shared/engine';

export interface BoardOptions {
  /** Show the green "correct" outline on locked tiles. */
  showCorrect: boolean;
  onSwap: (a: number, b: number) => void;
  onRotate: (p: number) => void;
  /**
   * Slider puzzles: this tile is the empty square (not drawn until the end), and
   * tapping a tile calls onSlide instead of picking it up. Arrow keys slide too.
   */
  blankTile?: number;
  onSlide?: (p: number) => void;
  /** Give nothing away about which tiles are right (memory games): seams stay until the end. */
  hideCorrect?: boolean;
}

interface Anim {
  from: number;
  to: number;
  tile: number;
  rot: number;
  start: number;
}

const ANIM_MS = 170;
/** Snap-and-settle bounce when a tile lands in its right place. */
const SETTLE_MS = 380;
/** Shimmer + gentle zoom when the last tile goes in. */
const CELEBRATE_MS = 1100;

/** Players who ask their device for less motion get the plain versions. */
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Board {
  private ctx: CanvasRenderingContext2D;
  private state!: GameState;
  private selected = -1;
  private cursor = 0;
  private hover = -1;
  private dragFrom = -1;
  private dragStart: { x: number; y: number } | null = null;
  private dragPoint: { x: number; y: number } | null = null;
  private hint: { positions: number[]; until: number } | null = null;
  private anims: Anim[] = [];
  private turns = new Map<number, { from: number; start: number }>(); // pos -> rotation animation
  private flashes = new Map<number, number>();
  /** pos -> time its snap-and-settle starts. */
  private settles = new Map<number, number>();
  /** Edge key -> current seam opacity (fades out when both sides are right). */
  private seams = new Map<number, number>();
  private lastFrame = 0;
  /** Drag lift: when it started and a smoothed sideways speed for the tilt. */
  private liftStart = 0;
  private tilt = 0;
  private lastDragX = 0;
  private celebrateStart = 0;
  private raf = 0;
  private keyboardUsed = false;
  /** Source rectangle of the picture (centre-cropped for square tiles). */
  private src = { x: 0, y: 0, w: 1, h: 1 };
  paused = false;
  /** Finished: draw the whole picture with no grid and ignore input. */
  private completed = false;
  /** Temporarily show the whole picture (memorize at start, peek). */
  private revealed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private image: HTMLImageElement,
    private opts: BoardOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    this.ctx = ctx;
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    window.addEventListener('resize', () => this.resize());
  }

  /** Use a different picture (call setState afterwards). */
  setImage(img: HTMLImageElement) {
    this.image = img;
  }

  setState(s: GameState) {
    this.state = s;
    this.seams.clear();
    this.settles.clear();
    this.celebrateStart = 0;
    this.cursor = Math.min(this.cursor, s.tiles.length - 1);
    this.selected = -1;
    this.hint = null;
    const W = this.image.naturalWidth;
    const H = this.image.naturalHeight;
    if (s.rules.square) {
      const aspect = s.cols / s.rows;
      if (W / H > aspect) this.src = { x: (W - H * aspect) / 2, y: 0, w: H * aspect, h: H };
      else this.src = { x: 0, y: (H - W / aspect) / 2, w: W, h: W / aspect };
    } else this.src = { x: 0, y: 0, w: W, h: H };
    this.canvas.setAttribute(
      'aria-label',
      s.rules.rotation
        ? 'Puzzle board. Drag to swap tiles, tap a tile to rotate it. Keyboard: arrows to move, Enter to pick up and swap, R to rotate.'
        : 'Puzzle board. Drag or click two tiles to swap them. Keyboard: arrows to move, Enter to pick up a tile and Enter again to swap.',
    );
    this.resize();
  }

  setShowCorrect(v: boolean) {
    this.opts.showCorrect = v;
    this.request();
  }

  setCompleted(v: boolean) {
    this.completed = v;
    if (!v) this.celebrateStart = 0;
    this.selected = -1;
    this.hint = null;
    this.canvas.style.cursor = v ? 'default' : '';
    this.request();
  }

  setRevealed(v: boolean) {
    this.revealed = v;
    this.selected = -1;
    this.request();
  }

  /**
   * The finishing moment: a shimmer sweeps across the picture while it gently
   * zooms. Resolves when it's over (straight away for reduced motion).
   */
  celebrate(): Promise<void> {
    if (reducedMotion()) return Promise.resolve();
    this.celebrateStart = performance.now() + ANIM_MS;
    this.request();
    return new Promise((r) => setTimeout(r, ANIM_MS + CELEBRATE_MS));
  }

  showHint(positions: number[], ms = 4000) {
    this.hint = { positions, until: performance.now() + ms };
    this.request();
  }

  /** Animate a swap that the controller already applied to the state. */
  animateSwap(a: number, b: number, newlyCorrect: number[]) {
    const t = performance.now();
    this.anims.push(
      { from: b, to: a, tile: this.state.tiles[a], rot: this.state.rot[a], start: t },
      { from: a, to: b, tile: this.state.tiles[b], rot: this.state.rot[b], start: t },
    );
    for (const p of newlyCorrect) {
      this.flashes.set(p, t + ANIM_MS);
      if (!reducedMotion()) this.settles.set(p, t + ANIM_MS);
    }
    if (this.hint && (this.hint.positions.includes(a) || this.hint.positions.includes(b))) this.hint = null;
    this.request();
  }

  /** Animate a quarter turn that the controller already applied. */
  animateRotate(p: number, newlyCorrect: boolean) {
    const t = performance.now();
    this.turns.set(p, { from: (this.state.rot[p] + 3) % 4, start: t });
    if (newlyCorrect) {
      this.flashes.set(p, t + ANIM_MS);
      if (!reducedMotion()) this.settles.set(p, t + ANIM_MS);
    }
    if (this.hint?.positions.includes(p)) this.hint = null;
    this.request();
  }

  clearSelection() {
    this.selected = -1;
    this.request();
  }

  private get rows() {
    return this.state.rows;
  }
  private get cols() {
    return this.state.cols;
  }
  private get sliding() {
    return this.opts.blankTile !== undefined && !!this.opts.onSlide;
  }
  private get inputOff() {
    return this.paused || this.completed || this.revealed || !this.state;
  }

  private resize() {
    if (!this.state) return;
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const aspect = this.src.w / this.src.h || 16 / 9;
    const cs = getComputedStyle(parent);
    let cssW = parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    let cssH = cssW / aspect;
    // Phones on their side: fit the board to the screen height under the score bar.
    const shortLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
    const maxH = document.fullscreenElement
      ? window.innerHeight - 24
      : shortLandscape
        ? Math.max(160, window.innerHeight - (parent.getBoundingClientRect().top + window.scrollY) - 10)
        : Math.max(320, window.innerHeight - 140);
    if (cssH > maxH) {
      cssH = maxH;
      cssW = cssH * aspect;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.request();
  }

  private posAt(clientX: number, clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    const col = Math.floor(((clientX - r.left) / r.width) * this.cols);
    const row = Math.floor(((clientY - r.top) / r.height) * this.rows);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  /** Click/tap on a tile: rotate (rotation mode) or pick up / swap (classic). */
  private tap(p: number) {
    if (this.state.rules.rotation) {
      this.selected = -1;
      this.opts.onRotate(p);
      return;
    }
    if (this.selected === -1) this.selected = p;
    else if (this.selected === p) this.selected = -1;
    else {
      const a = this.selected;
      this.selected = -1;
      this.opts.onSwap(a, p);
    }
  }

  private bind() {
    const c = this.canvas;
    c.tabIndex = 0;
    c.setAttribute('role', 'application');
    c.setAttribute('aria-roledescription', 'puzzle board');

    c.addEventListener('pointerdown', (e) => {
      if (this.inputOff) return;
      const p = this.posAt(e.clientX, e.clientY);
      if (p < 0 || this.state.locked[p]) return;
      this.keyboardUsed = false;
      if (this.sliding) {
        this.opts.onSlide!(p);
        this.request();
        return;
      }
      c.setPointerCapture(e.pointerId);
      this.dragFrom = p;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragPoint = null;
      this.tilt = 0;
      this.lastDragX = e.clientX;
      this.request();
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.posAt(e.clientX, e.clientY);
      if (p !== this.hover) {
        this.hover = p;
        this.request();
      }
      if (this.dragFrom >= 0 && this.dragStart) {
        // Only start showing a drag once the pointer has really moved.
        if (this.dragPoint || Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 6) {
          if (!this.dragPoint) this.liftStart = performance.now();
          // Tilt a little in the direction of travel, like a piece held by its top.
          if (!reducedMotion()) this.tilt = Math.max(-0.14, Math.min(0.14, this.tilt * 0.7 + (e.clientX - this.lastDragX) * 0.006));
          this.lastDragX = e.clientX;
          this.dragPoint = { x: e.clientX, y: e.clientY };
          this.request();
        }
      }
    });
    c.addEventListener('pointerleave', () => {
      this.hover = -1;
      this.request();
    });
    const end = (e: PointerEvent) => {
      if (this.dragFrom < 0) return;
      const from = this.dragFrom;
      const dragged = !!this.dragPoint;
      const to = this.posAt(e.clientX, e.clientY);
      this.dragFrom = -1;
      this.dragPoint = null;
      this.dragStart = null;
      if (to >= 0 && to !== from && !this.state.locked[to]) {
        this.selected = -1;
        this.opts.onSwap(from, to);
      } else if (to === from && !dragged) {
        this.tap(from);
      }
      this.request();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => {
      this.dragFrom = -1;
      this.dragPoint = null;
      this.dragStart = null;
      this.request();
    });

    c.addEventListener('keydown', (e) => {
      if (this.inputOff) return;
      const { rows, cols } = this;
      let r = Math.floor(this.cursor / cols);
      let col = this.cursor % cols;
      const k = e.key;
      if (this.sliding && k.startsWith('Arrow')) {
        // Arrows push the tile next to the gap in that direction into it.
        e.preventDefault();
        const b = this.state.tiles.indexOf(this.opts.blankTile!);
        const br = Math.floor(b / cols);
        const bc = b % cols;
        const q =
          k === 'ArrowLeft' && bc < cols - 1 ? b + 1 : k === 'ArrowRight' && bc > 0 ? b - 1 : k === 'ArrowUp' && br < rows - 1 ? b + cols : k === 'ArrowDown' && br > 0 ? b - cols : -1;
        if (q >= 0) this.opts.onSlide!(q);
        return;
      }
      if (k === 'ArrowLeft') col = (col - 1 + cols) % cols;
      else if (k === 'ArrowRight') col = (col + 1) % cols;
      else if (k === 'ArrowUp') r = (r - 1 + rows) % rows;
      else if (k === 'ArrowDown') r = (r + 1) % rows;
      else if ((k === 'r' || k === 'R') && this.state.rules.rotation) {
        e.preventDefault();
        if (!this.state.locked[this.cursor]) this.opts.onRotate(this.cursor);
        return;
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        const p = this.cursor;
        if (this.state.locked[p]) return;
        // Keyboard always picks up and swaps (R rotates in rotation mode).
        if (this.selected === -1) this.selected = p;
        else if (this.selected === p) this.selected = -1;
        else {
          const a = this.selected;
          this.selected = -1;
          this.opts.onSwap(a, p);
        }
        this.request();
        return;
      } else if (k === 'Escape') {
        this.selected = -1;
        this.request();
        return;
      } else return;
      e.preventDefault();
      this.keyboardUsed = true;
      this.cursor = r * cols + col;
      this.request();
    });
    c.addEventListener('focus', () => this.request());
    c.addEventListener('blur', () => this.request());
  }

  request() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.draw(t));
  }

  private rect(pos: number) {
    const w = this.canvas.width / this.cols;
    const hgt = this.canvas.height / this.rows;
    return { x: (pos % this.cols) * w, y: Math.floor(pos / this.cols) * hgt, w, h: hgt };
  }

  private correct(p: number) {
    return this.state.tiles[p] === p && this.state.rot[p] === 0;
  }

  /** Draw a tile (by id) into a cell, turned `quarter` quarter turns clockwise. */
  private drawTile(tile: number, x: number, y: number, w: number, hgt: number, quarter = 0) {
    const sw = this.src.w / this.cols;
    const sh = this.src.h / this.rows;
    const sx = this.src.x + (tile % this.cols) * sw;
    const sy = this.src.y + Math.floor(tile / this.cols) * sh;
    if (!quarter) {
      this.ctx.drawImage(this.image, sx, sy, sw, sh, x, y, w, hgt);
      return;
    }
    this.ctx.save();
    this.ctx.translate(x + w / 2, y + hgt / 2);
    this.ctx.rotate((quarter * Math.PI) / 2);
    this.ctx.drawImage(this.image, sx, sy, sw, sh, -w / 2, -hgt / 2, w, hgt);
    this.ctx.restore();
  }

  private draw(now: number) {
    this.raf = 0;
    if (!this.state) return;
    const ctx = this.ctx;
    const dpr = this.canvas.width / this.canvas.getBoundingClientRect().width || 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const settling = this.anims.some((a) => now - a.start < ANIM_MS) || [...this.turns.values()].some((t) => now - t.start < ANIM_MS);
    if ((this.completed && !settling) || this.revealed) {
      // The finished picture, in one piece.
      const W = this.canvas.width;
      const H = this.canvas.height;
      const ck = this.celebrateStart && !this.revealed ? (now - this.celebrateStart) / CELEBRATE_MS : 1;
      if (ck >= 0 && ck < 1) {
        // Gentle zoom in and back, with a light band sweeping across.
        const z = 1 + 0.045 * Math.sin(Math.PI * ck);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(z, z);
        ctx.drawImage(this.image, this.src.x, this.src.y, this.src.w, this.src.h, -W / 2, -H / 2, W, H);
        ctx.restore();
        const band = W * 0.35;
        const x = -band + (W + band * 2) * Math.min(1, ck * 1.25);
        const g = ctx.createLinearGradient(x - band, 0, x + band, H * 0.4);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.38)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        this.request();
      } else {
        ctx.drawImage(this.image, this.src.x, this.src.y, this.src.w, this.src.h, 0, 0, W, H);
        if (ck < 0) this.request();
      }
      if (this.completed) {
        this.anims = [];
        this.turns.clear();
        this.flashes.clear();
      }
      return;
    }

    ctx.fillStyle = '#0b1424';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.anims = this.anims.filter((a) => now - a.start < ANIM_MS);
    const moving = new Set(this.anims.map((a) => a.to));
    const n = this.state.tiles.length;

    const settlingNow: number[] = [];
    for (const [p, at] of this.settles) {
      if (now - at >= SETTLE_MS) this.settles.delete(p);
      else if (now >= at && !moving.has(p)) settlingNow.push(p);
    }
    for (let p = 0; p < n; p++) {
      if (moving.has(p) || (p === this.dragFrom && this.dragPoint) || settlingNow.includes(p)) continue;
      const r = this.rect(p);
      let quarter = this.state.rot[p];
      const turn = this.turns.get(p);
      if (turn) {
        const k = Math.min(1, (now - turn.start) / ANIM_MS);
        if (k >= 1) this.turns.delete(p);
        else quarter = turn.from + (1 - Math.pow(1 - k, 3));
      }
      if (this.state.tiles[p] === this.opts.blankTile) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        continue;
      }
      this.drawTile(this.state.tiles[p], r.x, r.y, r.w, r.h, quarter);
    }
    // Seams between tiles. Where both neighbours are in their right place the
    // seam fades away, so the picture visibly joins up as you go.
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : 16;
    this.lastFrame = now;
    const fade = reducedMotion() ? 1 : 1 - Math.pow(0.001, dt / 450);
    let seamsMoving = false;
    ctx.lineWidth = Math.max(1, dpr);
    const { rows, cols } = this;
    const seam = (key: number, a: number, b: number, x1: number, y1: number, x2: number, y2: number) => {
      const target = (!this.opts.hideCorrect || this.completed) && this.correct(a) && this.correct(b) ? 0 : 1;
      const cur = this.seams.get(key) ?? target;
      const next = Math.abs(target - cur) < 0.02 ? target : cur + (target - cur) * fade;
      if (next !== target) seamsMoving = true;
      this.seams.set(key, next);
      if (next <= 0.01) return;
      ctx.strokeStyle = `rgba(0,0,0,${0.55 * next})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    for (let p = 0; p < n; p++) {
      const r = this.rect(p);
      const col = p % cols;
      const row = Math.floor(p / cols);
      if (col < cols - 1) seam(p * 2, p, p + 1, Math.round(r.x + r.w) + 0.5, r.y, Math.round(r.x + r.w) + 0.5, r.y + r.h);
      if (row < rows - 1) seam(p * 2 + 1, p, p + cols, r.x, Math.round(r.y + r.h) + 0.5, r.x + r.w, Math.round(r.y + r.h) + 0.5);
    }
    // Correct-tile outline and flash.
    for (let p = 0; p < n; p++) {
      const flashAt = this.flashes.get(p);
      const r = this.rect(p);
      if (flashAt !== undefined) {
        const k = (now - flashAt) / 600;
        if (k >= 1) this.flashes.delete(p);
        else if (k >= 0) {
          ctx.fillStyle = `rgba(61, 220, 132, ${0.45 * (1 - k)})`;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
      }
      if (this.opts.showCorrect && this.state.locked[p]) {
        // Outline the edge of the finished area (not between finished tiles).
        ctx.strokeStyle = 'rgba(61, 220, 132, 0.6)';
        ctx.lineWidth = 2 * dpr;
        const col = p % cols;
        const row = Math.floor(p / cols);
        const open = (q: number, ok: boolean) => ok && !this.state.locked[q];
        const i = dpr;
        ctx.beginPath();
        if (row === 0 || open(p - cols, true)) (ctx.moveTo(r.x, r.y + i), ctx.lineTo(r.x + r.w, r.y + i));
        if (row === rows - 1 || open(p + cols, true)) (ctx.moveTo(r.x, r.y + r.h - i), ctx.lineTo(r.x + r.w, r.y + r.h - i));
        if (col === 0 || open(p - 1, true)) (ctx.moveTo(r.x + i, r.y), ctx.lineTo(r.x + i, r.y + r.h));
        if (col === cols - 1 || open(p + 1, true)) (ctx.moveTo(r.x + r.w - i, r.y), ctx.lineTo(r.x + r.w - i, r.y + r.h));
        ctx.stroke();
      }
    }
    // Swap animation.
    for (const a of this.anims) {
      if (a.tile === this.opts.blankTile) continue;
      const k = Math.min(1, (now - a.start) / ANIM_MS);
      const e = 1 - Math.pow(1 - k, 3);
      const f = this.rect(a.from);
      const t = this.rect(a.to);
      this.drawTile(a.tile, f.x + (t.x - f.x) * e, f.y + (t.y - f.y) * e, t.w, t.h, a.rot);
    }
    // Snap and settle: the tile pops slightly, then settles in with a bright edge.
    for (const p of settlingNow) {
      const k = (now - this.settles.get(p)!) / SETTLE_MS;
      const r = this.rect(p);
      const sc = 1 + 0.09 * Math.exp(-5 * k) * Math.cos(k * 9);
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(sc, sc);
      ctx.shadowColor = `rgba(0,0,0,${0.5 * (1 - k)})`;
      ctx.shadowBlur = 14 * dpr * (1 - k);
      this.drawTile(this.state.tiles[p], -r.w / 2, -r.h / 2, r.w, r.h, this.state.rot[p]);
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = `rgba(255, 244, 200, ${0.9 * (1 - k)})`;
      ctx.lineWidth = (3 - 2 * k) * dpr;
      ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }
    // Hint.
    if (this.hint) {
      if (now > this.hint.until) this.hint = null;
      else {
        const pulse = 0.55 + 0.45 * Math.sin(now / 140);
        ctx.strokeStyle = `rgba(245, 197, 66, ${pulse})`;
        ctx.lineWidth = 4 * dpr;
        for (const p of this.hint.positions) {
          const r = this.rect(p);
          ctx.strokeRect(r.x + 2 * dpr, r.y + 2 * dpr, r.w - 4 * dpr, r.h - 4 * dpr);
        }
      }
    }
    // Hover, selection, keyboard cursor.
    const outline = (p: number, color: string, width: number) => {
      if (p < 0) return;
      const r = this.rect(p);
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.strokeRect(r.x + (width / 2) * dpr, r.y + (width / 2) * dpr, r.w - width * dpr, r.h - width * dpr);
    };
    if (this.hover >= 0 && !this.state.locked[this.hover] && this.dragFrom < 0) outline(this.hover, 'rgba(255,255,255,0.5)', 2);
    if (this.selected >= 0) outline(this.selected, '#7cc4ff', 4);
    if (this.keyboardUsed && document.activeElement === this.canvas) outline(this.cursor, '#ffffff', 3);
    // Dragged tile follows the pointer.
    let lifting = false;
    if (this.dragFrom >= 0 && this.dragPoint) {
      const r = this.rect(this.dragFrom);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const b = this.canvas.getBoundingClientRect();
      const cx = (this.dragPoint.x - b.left) * dpr;
      const cy = (this.dragPoint.y - b.top) * dpr;
      // Lift: grow and cast a deeper, offset shadow over ~120 ms.
      const lk = reducedMotion() ? 1 : Math.min(1, (now - this.liftStart) / 120);
      lifting = lk < 1;
      const sc = 1 + 0.12 * (1 - Math.pow(1 - lk, 3));
      this.tilt *= 0.85; // ease back to level when the pointer stops
      if (Math.abs(this.tilt) > 0.003) lifting = true;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.tilt);
      ctx.scale(sc, sc);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 24 * dpr * lk;
      ctx.shadowOffsetX = 6 * dpr * lk;
      ctx.shadowOffsetY = 12 * dpr * lk;
      this.drawTile(this.state.tiles[this.dragFrom], -r.w / 2, -r.h / 2, r.w, r.h, this.state.rot[this.dragFrom]);
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = (2 * dpr) / sc;
      ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }
    if (this.anims.length || this.turns.size || this.hint || this.flashes.size || this.settles.size || seamsMoving || lifting || this.completed) this.request();
    else this.lastFrame = 0;
  }
}
