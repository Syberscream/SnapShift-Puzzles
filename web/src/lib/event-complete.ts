// "Event complete!" celebration: the event art, the bonus points, the badge and
// where the player stands for the prizes. Shown once per event (when the last
// puzzle is finished, or on the next visit to the event page).

import { api } from './api';
import { bg, h, modal } from './ui';
import { confetti } from '../game/confetti';
import { sfx } from '../game/sound';

interface EventData {
  event: { id: string; title: string; image: string; ends: string; bonus: number; prizes: number[]; status: string };
  me: { done: number; total: number; completed: boolean; rank: number | null; players: number; bonus: number | null } | null;
}

const PLACES = ['🥇', '🥈', '🥉'];
const seenKey = (id: string) => `ss_event_done_${id}`;

export function eventCelebrated(id: string): boolean {
  try {
    return localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return false;
  }
}

function markCelebrated(id: string) {
  try {
    localStorage.setItem(seenKey(id), '1');
  } catch {
    /* storage blocked */
  }
}

/** Show the celebration (once). `afterMs` lets a result screen appear first. Resolves when it closes. */
export async function celebrateEvent(id: string, afterMs = 0, data?: EventData): Promise<void> {
  if (eventCelebrated(id)) return;
  const d = data ?? (await api.get<EventData>(`/events/${encodeURIComponent(id)}`).catch(() => null));
  if (!d?.me?.completed) return;
  await new Promise((r) => setTimeout(r, afterMs));
  const e = d.event;
  const me = d.me;
  const ends = new Date(e.ends + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const prizes = e.prizes.some((p) => p > 0);
  const inPrizes = me.rank !== null && me.rank <= 3 && prizes;
  try {
    sfx.win('gold');
  } catch {
    /* no sound: fine */
  }
  const dlg = modal(
    h(
      'div',
      { class: 'event-done' },
      h('div', { class: 'event-done-art', style: bg(e.image) }, h('span', { class: 'event-done-ribbon' }, '🎉 Event complete!')),
      h('h2', {}, e.title),
      h('p', { class: 'muted' }, `You finished all ${me.total} puzzles. Brilliant work!`),
      h(
        'div',
        { class: 'event-done-rewards' },
        me.bonus ? h('div', { class: 'event-done-reward' }, h('b', {}, `+${me.bonus.toLocaleString()}`), h('span', {}, 'bonus points')) : null,
        h('div', { class: 'event-done-reward' }, h('b', {}, '🏅'), h('span', {}, 'Event badge on your profile')),
        me.rank ? h('div', { class: 'event-done-reward' }, h('b', {}, `#${me.rank}`), h('span', {}, `of ${me.players} on the leaderboard`)) : null,
      ),
      prizes
        ? h(
            'p',
            { class: `event-done-prize ${inPrizes ? 'in' : ''}` },
            inPrizes
              ? `${PLACES[me.rank! - 1]} You're in the prizes! If you're still #${me.rank} when the event ends on ${ends}, you win ${e.prizes[me.rank! - 1].toLocaleString()} points.`
              : `The top 3 on ${ends} win ${e.prizes.map((p, i) => `${PLACES[i]} ${p.toLocaleString()}`).join('  ')} points. Replay puzzles to raise your score!`,
          )
        : null,
      h(
        'div',
        { class: 'row ach-actions' },
        h('a', { class: 'btn', href: `/event?e=${encodeURIComponent(e.id)}#leaderboard` }, 'See the leaderboard'),
        h('button', { class: 'btn primary', onclick: () => dlg.close() }, 'Awesome!'),
      ),
    ),
  );
  dlg.classList.add('event-done-modal');
  markCelebrated(id);
  confetti('gold', 240);
  setTimeout(() => confetti('gold', 160), 900);
  await new Promise((r) => dlg.addEventListener('close', r, { once: true }));
}
