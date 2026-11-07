// Themed events: the list (/event) and one event (/event?e=id).

import { api, type PuzzleView } from '../lib/api';
import { me, shell, showError } from '../lib/shell';
import { bg, countdown, errorText, h, medalBadge, mount, plusTag, qs, userLink } from '../lib/ui';
import { puzzleCard } from './shared';

interface EventView {
  id: string;
  title: string;
  description: string;
  image: string;
  starts: string;
  ends: string;
  bonus: number;
  status: 'live' | 'upcoming' | 'ended';
}

const main = await shell({ title: 'Events' });
const id = qs('e');
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const statusPill = (e: EventView) =>
  h('span', { class: `pill ${e.status === 'live' ? 'event-pill' : 'dark'}` }, e.status === 'live' ? '🎉 On now' : e.status === 'upcoming' ? `Starts ${fmt(e.starts)}` : 'Ended');

try {
  if (id) await showEvent(id);
  else await showList();
} catch (e) {
  showError(main, errorText(e));
}

async function showList() {
  const d = await api.get<{ events: EventView[] }>('/events');
  mount(
    main,
    h('section', { class: 'panel' }, h('h1', {}, 'Events'), h('p', { class: 'muted' }, 'Themed puzzle weeks with their own leaderboard. Event puzzles are free for everyone while the event is on.')),
    d.events.length
      ? h(
          'div',
          { class: 'grid' },
          d.events.map((e) =>
            h(
              'a',
              { class: 'card', href: `/event?e=${encodeURIComponent(e.id)}` },
              h('div', { class: 'thumb wide', style: bg(e.image) }),
              h('span', { class: 'corner' }, statusPill(e)),
              h('div', { class: 'meta' }, h('b', {}, e.title), h('span', { class: 'muted small' }, `${fmt(e.starts)} – ${fmt(e.ends)}`)),
            ),
          ),
        )
      : h('section', { class: 'panel' }, h('p', { class: 'muted' }, 'No events right now. Check back soon!')),
  );
}

async function showEvent(eventId: string) {
  const d = await api.get<{
    event: EventView;
    nextDayInMs: number;
    puzzles: (PuzzleView & { eventResult: { scorePct: number; medal: string | null } | null })[];
    leaderboard: { rank: number; username: string; done: number; total: number; plus: boolean; isMe: boolean }[];
    me: { done: number; total: number } | null;
  }>(`/events/${encodeURIComponent(eventId)}`);
  const e = d.event;
  document.title = `${e.title} | SnapShift Puzzles`;
  const cd = h('span', { class: 'countdown' });
  const pct = d.me && d.me.total ? Math.round((d.me.done / d.me.total) * 100) : 0;
  mount(
    main,
    h(
      'section',
      { class: 'panel event-panel' },
      e.image ? h('div', { class: 'event-art', style: bg(e.image) }) : null,
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row' }, statusPill(e), h('span', { class: 'muted small' }, `${fmt(e.starts)} – ${fmt(e.ends)}`)),
        h('h1', {}, e.title),
        e.description ? h('p', { class: 'muted' }, e.description) : null,
        e.status === 'live'
          ? h('p', { class: 'small' }, 'Every puzzle here is free to play until the event ends. Your best score on each one counts.', e.bonus ? ` Finish them all for +${e.bonus} bonus points.` : '')
          : e.status === 'upcoming'
            ? h('p', { class: 'small' }, `Starts ${fmt(e.starts)}.`)
            : h('p', { class: 'small muted' }, 'This event has ended. The puzzles stay in their categories.'),
        d.me && e.status !== 'upcoming'
          ? h(
              'div',
              { class: 'stack', style: 'gap:6px' },
              h('b', {}, `Your progress: ${d.me.done} of ${d.me.total}`),
              h('div', { class: 'progress-bar' }, h('i', { style: `width:${pct}%` })),
            )
          : !me()
            ? h('p', { class: 'small' }, h('a', { href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Sign in'), ' to go on the event leaderboard.')
            : null,
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Puzzles'),
      h(
        'div',
        { class: 'grid' },
        d.puzzles.map((p) => {
          const card = puzzleCard(p);
          if (p.eventResult) {
            card.querySelector('.corner')?.remove();
            card.append(h('span', { class: 'corner' }, p.eventResult.medal ? medalBadge(p.eventResult.medal, true) : h('span', { class: 'pill' }, `${p.eventResult.scorePct}%`)));
          }
          return card;
        }),
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Leaderboard'),
      h('p', { class: 'muted small' }, 'Most puzzles finished, then the highest total score (your best on each puzzle).'),
      d.leaderboard.length
        ? h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Finished'), h('th', { class: 'num' }, 'Score'))),
            h(
              'tbody',
              {},
              d.leaderboard.map((r) =>
                h('tr', { class: r.isMe ? 'me' : '' }, h('td', {}, r.rank), h('td', {}, userLink(r.username), r.plus ? plusTag() : null), h('td', { class: 'num' }, `${r.done}/${d.puzzles.length}`), h('td', { class: 'num' }, r.total)),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No one has finished an event puzzle yet. Be the first!'),
    ),
  );
  countdown(cd, d.nextDayInMs);
}
