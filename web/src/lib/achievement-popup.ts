// "Achievement unlocked!" popup: one at a time, with confetti and the points reward.

import { h, modal } from './ui';
import { confetti } from '../game/confetti';
import { sfx } from '../game/sound';

export interface EarnedAchievement {
  id?: string;
  icon: string;
  title: string;
  description: string;
  reward?: number;
}

let queue: EarnedAchievement[] = [];
let showing = false;

/** Show newly earned achievements (after `delayMs`, so a result screen can appear first). */
export function celebrateAchievements(list: EarnedAchievement[] | undefined, delayMs = 1200): void {
  if (!list?.length) return;
  const total = queue.length + list.length;
  queue.push(...list.map((a) => ({ ...a, _total: total }) as EarnedAchievement));
  if (!showing) {
    showing = true;
    setTimeout(next, delayMs);
  }
}

function next(): void {
  const a = queue.shift();
  if (!a) {
    showing = false;
    return;
  }
  const left = queue.length;
  sfx.win('gold');
  const d = modal(
    h(
      'div',
      { class: 'ach-pop' },
      h('div', { class: 'ach-rays', 'aria-hidden': 'true' }),
      h('div', { class: 'ach-badge', 'aria-hidden': 'true' }, a.icon),
      h('div', { class: 'ach-kicker' }, 'Achievement unlocked!'),
      h('h2', {}, a.title),
      h('p', { class: 'muted' }, a.description),
      a.reward ? h('div', { class: 'ach-reward' }, `+${a.reward} points`) : null,
      h(
        'div',
        { class: 'row ach-actions' },
        h('a', { class: 'btn', href: '/account#achievements' }, 'All achievements'),
        h('button', { class: 'btn primary', onclick: () => d.close() }, left ? `Next (${left} more)` : 'Awesome!'),
      ),
    ),
  );
  d.classList.add('ach-modal');
  setTimeout(() => confetti('gold'), 150);
  d.addEventListener('close', () => setTimeout(next, 250));
}
