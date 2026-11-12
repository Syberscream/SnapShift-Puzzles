// Themed events: the list (/event) and one event (/event?e=id).

import { api, type PuzzleView } from '../lib/api';
import { me, shell, showError } from '../lib/shell';
import { bg, countdown, errorText, h, longCountdown, medalBadge, mount, plusTag, qs, userLink } from '../lib/ui';
import { pager, PER_PAGE, puzzleCard } from './shared';
import { celebrateEvent } from '../lib/event-complete';

interface EventView {
  id: string;
  title: string;
  description: string;
  image: string;
  starts: string;
  ends: string;
  bonus: number;
  difficulty: 'easy' | 'medium' | 'hard';
  mode: 'classic' | 'rotation';
  prizes: number[];
  status: 'live' | 'upcoming' | 'ended';
}

const DIFF: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const PLACES = ['🥇', '🥈', '🥉'];
/** "Medium · Classic · same shuffle for everyone · no hints" */
const rulesLine = (e: EventView) => `${DIFF[e.difficulty] ?? 'Medium'} · ${e.mode === 'rotation' ? 'Rotation' : 'Classic'} · the same shuffle for everyone · no hints or placed tiles`;
const prizesLine = (e: EventView) => (e.prizes.some((p) => p > 0) ? e.prizes.map((p, i) => `${PLACES[i]} ${p.toLocaleString()}`).join('  ') : '');

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
    me: { done: number; total: number; completed: boolean; rank: number | null; players: number; bonus: number | null } | null;
    winners: { username: string; place: number; points: number }[];
    startsInMs: number | null;
  }>(`/events/${encodeURIComponent(eventId)}`);
  const e = d.event;
  document.title = `${e.title} | SnapShift Puzzles`;
  const cd = h('span', { class: 'countdown' });
  const startCd = h('b', { class: 'countdown' });
  const pct = d.me && d.me.total ? Math.round((d.me.done / d.me.total) * 100) : 0;
  const notCounted = d.puzzles.filter((p) => p.finished && !p.eventResult).length;
  // The event's puzzle cards, 20 to a page for big events (?page=2 in the address).
  const eventCard = (p: (typeof d.puzzles)[number]) => {
    const card = puzzleCard(p);
    // Play it the event's way (its rules and shuffle) while it's on.
    if (e.status === 'live' && card instanceof HTMLAnchorElement) card.href = `/play?p=${encodeURIComponent(p.slug)}&event=${encodeURIComponent(e.id)}`;
    // Finished outside the event (another page, other rules): it doesn't count yet.
    if (e.status === 'live' && !p.eventResult && p.finished) {
      const label = card.querySelector('.spread > span:last-child');
      if (label) label.textContent = 'Play for event →';
      card.classList.add('not-counted');
      card.title = 'You finished this picture outside the event. Play it here to count it.';
    }
    if (p.eventResult) {
      card.querySelector('.corner')?.remove();
      card.append(h('span', { class: 'corner' }, p.eventResult.medal ? medalBadge(p.eventResult.medal, true) : h('span', { class: 'pill' }, `${p.eventResult.scorePct}%`)));
    }
    return card;
  };
  let evPage = Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1);
  const evGrid = h('div', { class: 'grid' });
  const evPagerTop = h('div', { class: 'pager-wrap' });
  const evPagerBottom = h('div', { class: 'pager-wrap' });
  const drawEvent = (scroll = false) => {
    evPage = Math.min(evPage, Math.max(1, Math.ceil(d.puzzles.length / PER_PAGE)));
    mount(evGrid, d.puzzles.slice((evPage - 1) * PER_PAGE, evPage * PER_PAGE).map(eventCard));
    const go = (n: number) => {
      evPage = n;
      drawEvent(true);
    };
    mount(evPagerTop, pager(evPage, d.puzzles.length, go));
    mount(evPagerBottom, pager(evPage, d.puzzles.length, go));
    const u = new URL(location.href);
    if (evPage > 1) u.searchParams.set('page', String(evPage));
    else u.searchParams.delete('page');
    history.replaceState(history.state, '', u);
    if (scroll) evPagerTop.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  drawEvent();
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
        h('div', { class: 'row event-rules' }, h('span', { class: 'pill dark' }, '📏 ' + rulesLine(e))),
        prizesLine(e) ? h('div', { class: 'row' }, h('span', { class: 'pill gold' }, `🏆 Top 3 win: ${prizesLine(e)} points`)) : null,
        e.status === 'live'
          ? h('p', { class: 'small' }, 'Every puzzle here is free to play until the event ends. Your best score on each one counts.', e.bonus ? ` Finish them all for +${e.bonus} bonus points and an event badge on your profile.` : ' Finish them all for an event badge on your profile.')
          : e.status === 'upcoming'
            ? h('p', { class: 'small' }, `Starts ${fmt(e.starts)} · `, h('b', {}, 'in '), startCd)
            : h('p', { class: 'small muted' }, 'This event has ended.'),
        d.me && e.status !== 'upcoming'
          ? h(
              'div',
              { class: 'stack', style: 'gap:6px' },
              h('b', {}, `Your progress: ${d.me.done} of ${d.me.total}`),
              h('div', { class: 'progress-bar' }, h('i', { style: `width:${pct}%` })),
              notCounted && e.status === 'live'
                ? h(
                    'p',
                    { class: 'small muted' },
                    `${notCounted} ${notCounted === 1 ? 'picture you finished elsewhere doesn’t' : 'pictures you finished elsewhere don’t'} count yet. Only games started from this page count (same rules and shuffle for everyone). They’re marked “Play for event”.`,
                  )
                : null,
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
      evPagerTop,
      evGrid,
      evPagerBottom,
    ),
    d.winners.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', {}, '🏆 Winners'),
          h(
            'div',
            { class: 'row' },
            d.winners.map((w) => h('span', { class: 'pill dark winner' }, `${PLACES[w.place - 1]} `, userLink(w.username), w.points ? ` · +${w.points.toLocaleString()} points` : '')),
          ),
        )
      : null,
    h(
      'section',
      { class: 'panel', id: 'leaderboard' },
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
  if (d.startsInMs != null) longCountdown(startCd, d.startsInMs, () => location.reload());
  // Finished the whole event (maybe before this pop-up existed): celebrate once.
  if (d.me?.completed) celebrateEvent(e.id, 700, d as unknown as Parameters<typeof celebrateEvent>[2]).catch((err) => console.error('event celebration', err));
  if (location.hash === '#leaderboard') document.getElementById('leaderboard')?.scrollIntoView();
}
