// The SnapShift Plus section shown to free players (home, category and daily pages).

import { api } from './api';
import { me } from './shell';
import { h, hasPaidPlus, plusTag } from './ui';

interface Plans {
  enabled: boolean;
  plans: { id: 'monthly' | 'yearly' | 'lifetime'; label: string; available: boolean }[];
  promo: { enabled: boolean; title: string; text: string };
}

let cached: Promise<Plans | null> | null = null;
const loadPlans = () => (cached ??= api.get<Plans>('/billing/plans').catch(() => null));

const PERKS: [string, string][] = [
  ['🔓', 'Every puzzle unlocked'],
  ['🚫', 'No ads'],
  ['📅', 'Full daily archive'],
  ['✨', 'New puzzles 48 h early'],
  ['🖼️', 'Members’ Gallery'],
  ['⏱️', 'Unlimited Time Attack'],
  ['🧊', 'Streak freezes'],
  ['💡', 'Request pictures'],
];

/** Who sees it: guests and free players. Admins see it too, with a note. */
function audience(): 'show' | 'admin' | 'hide' {
  const u = me();
  if (!u) return 'show';
  if (hasPaidPlus(u)) return 'hide';
  if (u.role === 'admin') return 'admin';
  return u.member ? 'hide' : 'show';
}

/** The full section (home page). Resolves to null when it shouldn't show. */
export async function plusSection(): Promise<HTMLElement | null> {
  const who = audience();
  if (who === 'hide') return null;
  const p = await loadPlans();
  if (!p || !p.promo.enabled) return null;
  const plan = (id: string) => p.plans.find((x) => x.id === id);
  const prices = p.enabled
    ? h(
        'div',
        { class: 'promo-prices' },
        plan('yearly')?.available ? h('a', { class: 'promo-price best', href: '/plus' }, h('span', { class: 'small' }, 'Best value'), h('b', {}, plan('yearly')!.label)) : null,
        plan('monthly')?.available ? h('a', { class: 'promo-price', href: '/plus' }, h('span', { class: 'small' }, 'Monthly'), h('b', {}, plan('monthly')!.label)) : null,
        plan('lifetime')?.available ? h('a', { class: 'promo-price', href: '/plus' }, h('span', { class: 'small' }, 'Lifetime'), h('b', {}, plan('lifetime')!.label)) : null,
      )
    : h('p', { class: 'muted small' }, 'Memberships open very soon.');
  return h(
    'section',
    { class: 'panel plus-promo', 'aria-label': 'SnapShift Plus' },
    h(
      'div',
      { class: 'promo-main' },
      h('div', { class: 'row' }, plusTag('SNAPSHIFT PLUS'), who === 'admin' ? h('span', { class: 'muted small' }, 'Only free players and guests see this section.') : null),
      h('h2', {}, p.promo.title),
      h('p', { class: 'muted' }, p.promo.text),
      h('ul', { class: 'promo-perks' }, PERKS.map(([icon, text]) => h('li', {}, h('span', { 'aria-hidden': 'true' }, icon), text))),
      h('div', { class: 'row' }, h('a', { class: 'btn plus-btn big', href: '/plus' }, '✦ Get Plus'), h('a', { class: 'btn', href: '/plus' }, 'See everything included')),
    ),
    h('div', { class: 'promo-side' }, h('div', { class: 'promo-tiles', 'aria-hidden': 'true' }, Array.from({ length: 9 }, (_, i) => h('i', { class: `t${i}` }))), prices),
  );
}

/** A one-line version for other pages. */
export async function plusStrip(text: string): Promise<HTMLElement | null> {
  if (audience() !== 'show') return null;
  const p = await loadPlans();
  if (!p || !p.promo.enabled) return null;
  const from = p.plans.find((x) => x.id === 'monthly' && x.available)?.label;
  return h(
    'section',
    { class: 'panel plus-strip' },
    plusTag(),
    h('span', {}, text, from ? h('span', { class: 'muted' }, ` From ${from}.`) : null),
    h('a', { class: 'btn plus-btn', href: '/plus' }, 'Get Plus'),
  );
}
