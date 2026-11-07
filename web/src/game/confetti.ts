// A short burst of confetti over the page, in a medal's colours.

const PALETTES: Record<string, string[]> = {
  gold: ['#ffe58a', '#f5c542', '#d99a00', '#fff6c4', '#ffffff'],
  silver: ['#ffffff', '#e2e8f0', '#aab6c6', '#c9d3e0'],
  bronze: ['#ffe0c2', '#e59a5c', '#b8692c', '#f3c08f'],
  zen: ['#7ee0b5', '#7cc4ff', '#d3b2ff', '#ffffff'],
};

export function confetti(kind: string, amount = kind === 'gold' ? 160 : kind === 'silver' ? 110 : 70): void {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = PALETTES[kind] ?? PALETTES.zen;
  const c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2000';
  document.body.append(c);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const ctx = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const parts = Array.from({ length: amount }, () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    return {
      x: W / 2 + side * W * (0.05 + Math.random() * 0.1),
      y: H * 0.42,
      vx: side * (2 + Math.random() * 9) * dpr,
      vy: -(8 + Math.random() * 10) * dpr,
      w: (5 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 8) * dpr,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const start = performance.now();
  const LIFE = 2200;
  const frame = (t: number) => {
    const k = (t - start) / LIFE;
    if (k >= 1) return c.remove();
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    for (const p of parts) {
      p.vy += 0.38 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.scale(1, Math.cos(p.a * 2)); // flutter
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Count a number up inside an element. */
export function countUp(el: HTMLElement, to: number, render: (n: number) => string, ms = 900): void {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = render(to);
    return;
  }
  const start = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / ms);
    el.textContent = render(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = render(0);
  requestAnimationFrame(step);
}
