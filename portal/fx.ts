// Visual effects layer: sparkle bursts, confetti, floating words, screen shake.
// One full-screen canvas above the game, drawn only while something is moving.

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'star' | 'dot' | 'confetti';
  rot: number;
  vr: number;
}

const COLORS = ['#ffd23f', '#ff6b9a', '#4dd4ff', '#7cf068', '#ff9f1c', '#b388ff', '#ffffff'];
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let parts: P[] = [];
let running = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initFx() {
  canvas = document.createElement('canvas');
  canvas.className = 'fx-layer';
  document.body.append(canvas);
  ctx = canvas.getContext('2d')!;
  const size = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * d;
    canvas.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  size();
  addEventListener('resize', size);
}

function star(x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life < p.max);
  for (const p of parts) {
    p.life++;
    p.vy += p.g;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    const k = Math.max(0, 1 - p.life / p.max);
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    if (p.kind === 'star') star(p.x, p.y, p.size * (0.6 + 0.4 * k), p.rot);
    else if (p.kind === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else running = false;
}

function go() {
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

/** A little burst of stars and sparkles at a screen point. */
export function burst(x: number, y: number, n = 14, palette = COLORS) {
  if (reduced) n = Math.min(n, 4);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 4.5;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.5,
      g: 0.12,
      life: 0,
      max: 34 + Math.random() * 20,
      size: i % 3 === 0 ? 7 + Math.random() * 5 : 3 + Math.random() * 3,
      color: palette[i % palette.length],
      kind: i % 3 === 0 ? 'star' : 'dot',
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
    });
  }
  go();
}

/** Confetti raining from the top. */
export function confetti(amount = 140) {
  if (reduced) amount = 20;
  for (let i = 0; i < amount; i++) {
    parts.push({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      g: 0.05,
      life: 0,
      max: 150 + Math.random() * 80,
      size: 8 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      kind: 'confetti',
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.25,
    });
  }
  go();
}

/** A word that pops up and floats away ("Great!"). */
export function floatText(text: string, x: number, y: number, cls = '') {
  const el = document.createElement('div');
  el.className = `float-text ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1300);
}

export function shake(el: HTMLElement) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
