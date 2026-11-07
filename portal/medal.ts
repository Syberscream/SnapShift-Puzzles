// Medals: the same round ★ coins as the website.

import type { Medal } from '@shared/engine';

/** A medal coin. `size` is its diameter in pixels. */
export function medalIcon(medal: Medal, size = 28, title = `${medal[0].toUpperCase()}${medal.slice(1)} medal`): HTMLElement {
  const el = document.createElement('span');
  el.className = `medal ${medal}`;
  el.textContent = '★';
  el.title = title;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', title);
  el.style.width = el.style.height = `${size}px`;
  el.style.fontSize = `${Math.round(size * 0.54)}px`;
  return el;
}
