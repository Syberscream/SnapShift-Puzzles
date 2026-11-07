// Medal artwork: a ribboned coin with a star, shaded like real metal.

import type { Medal } from '@shared/engine';

const METAL: Record<Medal, { hi: string; mid: string; lo: string; edge: string; star: string; ribbon: [string, string] }> = {
  gold: { hi: '#fff7c9', mid: '#ffd23f', lo: '#c98a00', edge: '#8a5a00', star: '#fff3b0', ribbon: ['#2563eb', '#1d3f8f'] },
  silver: { hi: '#ffffff', mid: '#dfe6ef', lo: '#98a5b6', edge: '#5f6b7c', star: '#ffffff', ribbon: ['#dc2626', '#8f1d1d'] },
  bronze: { hi: '#ffe2c4', mid: '#e39a5a', lo: '#a85f26', edge: '#6b3a14', star: '#ffd9b3', ribbon: ['#16a34a', '#0f6a33'] },
};

let uid = 0;

/** An SVG medal. `size` is its height in pixels (the width is 0.8 of that). */
export function medalIcon(medal: Medal, size = 32, title = `${medal[0].toUpperCase()}${medal.slice(1)} medal`): SVGSVGElement {
  const m = METAL[medal];
  const id = `md${++uid}`;
  const wrap = document.createElement('span');
  wrap.innerHTML = `
<svg class="medal-svg ${medal}" viewBox="0 0 64 80" width="${Math.round(size * 0.8)}" height="${size}" role="img" aria-label="${title}">
  <title>${title}</title>
  <defs>
    <radialGradient id="${id}c" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="${m.hi}"/><stop offset=".45" stop-color="${m.mid}"/><stop offset="1" stop-color="${m.lo}"/>
    </radialGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${m.ribbon[0]}"/><stop offset="1" stop-color="${m.ribbon[1]}"/>
    </linearGradient>
  </defs>
  <path d="M14 0h14l10 30H24z" fill="url(#${id}r)"/>
  <path d="M50 0H36L26 30h14z" fill="${m.ribbon[1]}"/>
  <path d="M21 0h4l9 27h-4z M43 0h-4l-9 27h4z" fill="#ffffff" opacity=".35"/>
  <circle cx="32" cy="52" r="25" fill="${m.edge}"/>
  <circle cx="32" cy="51" r="23" fill="url(#${id}c)"/>
  <circle cx="32" cy="51" r="17.5" fill="none" stroke="${m.edge}" stroke-opacity=".45" stroke-width="1.6"/>
  <path d="M32 38.5l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L32 57.1l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" fill="${m.star}" stroke="${m.edge}" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"/>
  <ellipse cx="24" cy="40" rx="8" ry="4.5" fill="#ffffff" opacity=".45" transform="rotate(-30 24 40)"/>
</svg>`.trim();
  return wrap.firstElementChild as SVGSVGElement;
}
