// Canvas board: draws the sliced image and turns clicks, drags and keys into moves.
//   Classic / Zen: drag a tile onto another, or click two tiles, to swap.
//   Rotation:      drag to swap, tap a tile to turn it a quarter turn clockwise (or press R).

import type { GameState } from '@shared/engine';

export interface BoardOptions {
  /** Show the green "correct" outline on locked tiles. */
  showCorrect: boolean;
  onSwap: (a: number, b: number) => void;
  onRotate: (p: number) => void;
}

interface Anim {
  from: number;
  to: number;
  tile: number;
  rot: number;
  start: number;
}

const ANIM_MS = 170;

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
  }

  /** Use a different picture (call setState afterwards). */
  setImage(img: HTMLImageElement) {
    this.image = img;
  }

  setState(s: GameState) {
    this.state = s;
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

  showHint(positions: number[]) {
    this.hint = { positions, until: performance.now() + 4000 };
    this.request();
  }

  /** Animate a swap that the controller already applied to the state. */
  animateSwap(a: number, b: number, newlyCorrect: number[]) {
    const t = performance.now();
    this.anims.push(
      { from: b, to: a, tile: this.state.tiles[a], rot: this.state.rot[a], start: t },
      { from: a, to: b, tile: this.state.tiles[b], rot: this.state.rot[b], start: t },
    );
    for (const p of newlyCorrect) this.flashes.set(p, t + ANIM_MS);
    if (this.hint && (this.hint.positions.includes(a) || this.hint.positions.includes(b))) this.hint = null;
    this.request();
  }

  /** Animate a quarter turn that the controller already applied. */
  animateRotate(p: number, newlyCorrect: boolean) {
    const t = performance.now();
    this.turns.set(p, { from: (this.state.rot[p] + 3) % 4, start: t });
    if (newlyCorrect) this.flashes.set(p, t + ANIM_MS);
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
    const maxH = document.fullscreenElement ? window.innerHeight - 24 : Math.max(320, window.innerHeight - 140);
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
      c.setPointerCapture(e.pointerId);
      this.dragFrom = p;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragPoint = null;
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
      ctx.drawImage(this.image, this.src.x, this.src.y, this.src.w, this.src.h, 0, 0, this.canvas.width, this.canvas.height);
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

    for (let p = 0; p < n; p++) {
      if (moving.has(p) || (p === this.dragFrom && this.dragPoint)) continue;
      const r = this.rect(p);
      let quarter = this.state.rot[p];
      const turn = this.turns.get(p);
      if (turn) {
        const k = Math.min(1, (now - turn.start) / ANIM_MS);
        if (k >= 1) this.turns.delete(p);
        else quarter = turn.from + (1 - Math.pow(1 - k, 3));
      }
      this.drawTile(this.state.tiles[p], r.x, r.y, r.w, r.h, quarter);
    }
    // Grid lines between tiles that can still move.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, dpr);
    for (let p = 0; p < n; p++) {
      if (this.state.locked[p]) continue;
      const r = this.rect(p);
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
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
        ctx.strokeStyle = 'rgba(61, 220, 132, 0.55)';
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(r.x + dpr, r.y + dpr, r.w - 2 * dpr, r.h - 2 * dpr);
      }
    }
    // Swap animation.
    for (const a of this.anims) {
      const k = Math.min(1, (now - a.start) / ANIM_MS);
      const e = 1 - Math.pow(1 - k, 3);
      const f = this.rect(a.from);
      const t = this.rect(a.to);
      this.drawTile(a.tile, f.x + (t.x - f.x) * e, f.y + (t.y - f.y) * e, t.w, t.h, a.rot);
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
    if (this.dragFrom >= 0 && this.dragPoint) {
      const r = this.rect(this.dragFrom);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const b = this.canvas.getBoundingClientRect();
      const x = (this.dragPoint.x - b.left) * dpr - r.w / 2;
      const y = (this.dragPoint.y - b.top) * dpr - r.h / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18 * dpr;
      this.drawTile(this.state.tiles[this.dragFrom], x, y, r.w * 1.06, r.h * 1.06, this.state.rot[this.dragFrom]);
      ctx.restore();
      ctx.strokeStyle = '#7cc4ff';
      ctx.lineWidth = 3 * dpr;
      ctx.strokeRect(x, y, r.w * 1.06, r.h * 1.06);
    }
    if (this.anims.length || this.turns.size || this.hint || this.flashes.size || this.completed) this.request();
  }
}
