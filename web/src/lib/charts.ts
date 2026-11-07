// Small, dependency-free charts for the admin Analytics tab: a daily column
// chart with a hover tooltip, and ranked horizontal bars.

import { h } from './ui';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const fmt = (n: number) => n.toLocaleString();
const shortDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** A nice round top for the y axis. */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** One series per day: columns, a total in the header, hover for each day. */
export function dayChart(title: string, labels: string[], values: number[], opts: { total?: string; note?: string } = {}): HTMLElement {
  // Drawn at about the size it shows, so the axis text stays readable.
  const W = 400;
  const H = 160;
  const pad = { l: 34, r: 8, t: 10, b: 24 };
  const max = niceMax(Math.max(0, ...values));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / values.length;
  const bw = Math.max(1, Math.min(24, step - 2));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${title} per day` });
  // Recessive grid: 0, half, top.
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + ih - f * ih;
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: f ? 'chart-grid' : 'chart-axis' }));
    const t = s('text', { x: pad.l - 6, y: y + 4, class: 'chart-tick', 'text-anchor': 'end' });
    t.textContent = fmt(Math.round(max * f));
    svg.append(t);
  }
  // X labels: first, middle, last.
  for (const i of [...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])]) {
    const t = s('text', { x: pad.l + step * i + step / 2, y: H - 6, class: 'chart-tick', 'text-anchor': i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle' });
    t.textContent = shortDay(labels[i]);
    svg.append(t);
  }
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const hover = s('rect', { class: 'chart-hover', y: pad.t, height: ih, width: step, x: 0, visibility: 'hidden' });
  svg.append(hover);
  values.forEach((v, i) => {
    const bh = max ? (v / max) * ih : 0;
    const x = pad.l + step * i + (step - bw) / 2;
    if (v > 0) {
      // Rounded top, square at the baseline.
      const r = Math.min(4, bw / 2, bh);
      const y = pad.t + ih - bh;
      svg.append(s('path', { class: 'chart-bar', d: `M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z` }));
    }
    // Hit area: the whole column, much bigger than the bar.
    const hit = s('rect', { x: pad.l + step * i, y: pad.t, width: step, height: ih, fill: 'transparent' });
    const show = () => {
      hover.setAttribute('x', String(pad.l + step * i));
      hover.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.replaceChildren(h('span', { class: 'muted' }, shortDay(labels[i])), h('b', {}, fmt(v)));
      const left = ((pad.l + step * i + step / 2) / W) * 100;
      tip.style.left = `${Math.min(88, Math.max(12, left))}%`;
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('touchstart', show, { passive: true });
    svg.append(hit);
  });
  svg.addEventListener('mouseleave', () => {
    tip.hidden = true;
    hover.setAttribute('visibility', 'hidden');
  });
  const total = opts.total ?? fmt(values.reduce((a, b) => a + b, 0));
  return h(
    'div',
    { class: 'chart' },
    h('div', { class: 'chart-head' }, h('span', { class: 'muted small' }, title), h('b', {}, total)),
    h('div', { class: 'chart-plot' }, svg, tip),
    opts.note ? h('p', { class: 'small muted' }, opts.note) : null,
  );
}

/** Ranked list with a bar behind each value. */
export function rankBars(title: string, rows: { name: string; value: number; sub?: string; href?: string }[], unit = ''): HTMLElement {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return h(
    'div',
    { class: 'chart' },
    h('div', { class: 'chart-head' }, h('span', { class: 'muted small' }, title)),
    rows.length
      ? h(
          'ol',
          { class: 'rank-bars' },
          rows.map((r) =>
            h(
              'li',
              { title: `${r.name}: ${fmt(r.value)}${unit}` },
              h('div', { class: 'rank-fill', style: `width:${(r.value / max) * 100}%` }),
              h('span', { class: 'rank-name' }, r.href ? h('a', { href: r.href, target: '_blank' }, r.name) : r.name, r.sub ? h('span', { class: 'muted small' }, ` ${r.sub}`) : null),
              h('b', { class: 'rank-value' }, `${fmt(r.value)}${unit}`),
            ),
          ),
        )
      : h('p', { class: 'muted small' }, 'Nothing yet.'),
  );
}
