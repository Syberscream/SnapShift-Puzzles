import { pushOffer } from '../lib/push';
import { api } from '../lib/api';
import { plusStrip } from '../lib/plus-promo';
import { me, shell, showError } from '../lib/shell';
import { bg, countdown, errorText, h, medalBadge, mount, plusTag } from '../lib/ui';

interface Today {
  day: string;
  nextDailyInMs: number;
  puzzle: { slug: string; title: string; thumb: string } | null;
  result: { score_pct: number; moves: number; medal: string } | null;
  streak: { current: number; best: number } | null;
  players: number;
}
interface ArchiveDay {
  day: string;
  slug: string;
  title: string;
  thumb: string;
  players: number;
  mine: { medal: string; score_pct: number } | null;
  locked: boolean;
}

const main = await shell({ title: 'Daily Challenge & Archive' });
try {
  const [t, a] = await Promise.all([api.get<Today>('/daily/today'), api.get<{ days: ArchiveDay[] }>('/daily/archive')]);
  const cd = h('span', { class: 'countdown' });
  const grid = h('div', { class: 'grid' });
  const more = h('button', { class: 'btn' }, 'Load older days');
  const addDays = (days: ArchiveDay[]) => {
    for (const d of days) {
      grid.append(
        h(
          'a',
          { class: 'card', href: d.locked ? '/plus' : `/play?daily=${d.day}`, title: d.locked ? 'Older dailies are part of SnapShift Plus' : '' },
          h('div', { class: `thumb wide${d.locked ? ' archive-locked' : ''}`, style: bg(d.thumb) }),
          d.mine ? h('span', { class: 'corner' }, medalBadge(d.mine.medal, true)) : d.locked ? h('span', { class: 'corner' }, plusTag('PLUS')) : null,
          h(
            'div',
            { class: 'meta' },
            h('b', {}, d.title),
            h('div', { class: 'spread' }, h('span', {}, d.day === t.day ? `Today · ${d.day}` : d.day), h('span', {}, `${d.players} players`)),
          ),
        ),
      );
    }
    more.hidden = days.length < 30;
    if (days.length) more.dataset.before = days[days.length - 1].day;
  };
  more.addEventListener('click', async () => {
    const r = await api.get<{ days: ArchiveDay[] }>(`/daily/archive?before=${more.dataset.before}`);
    addDays(r.days);
  });

  mount(
    main,
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'hero' },
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'row' }, h('span', { class: 'pill' }, h('span', { class: 'label' }, 'Next daily'), cd), h('span', { class: 'pill dark' }, `${t.players} solved today`)),
          h('h1', {}, 'Daily Challenge'),
          h('p', { class: 'muted' }, t.puzzle ? `Today: ${t.puzzle.title}. Hard (8×12), same board for everyone. The first finish of the day counts for the leaderboard and your streak.` : 'No daily yet.'),
          t.result ? h('div', { class: 'notice' }, medalBadge(t.result.medal), ` Done: ${t.result.score_pct}% overall in ${t.result.moves} moves.`) : null,
          me() && t.streak ? h('p', {}, `Streak: ${t.streak.current} day(s) · best ${t.streak.best}`) : null,
          h(
            'div',
            { class: 'row' },
            t.puzzle ? h('a', { class: 'btn primary big', href: `/play?daily=${t.day}` }, t.result ? 'Play again' : 'Play today') : null,
            h('a', { class: 'btn', href: '/leaderboard' }, 'Leaderboard'),
          ),
          pushOffer(),
        ),
        h('div', { class: 'art', style: bg(t.puzzle?.thumb ?? '') }),
      ),
    ),
    h('section', { class: 'panel' }, h('h2', {}, 'Archive'), h('p', { class: 'muted' }, 'Replay past dailies any time. Archive runs earn normal puzzle points.', me()?.member ? '' : [' Free players can play the last 7 days; ', h('a', { href: '/plus' }, 'SnapShift Plus'), ' opens the whole archive.']), grid,
      await plusStrip('Plus opens the whole daily archive, back to day one.'), h('div', { class: 'row', style: 'margin-top:12px' }, more)),
  );
  countdown(cd, t.nextDailyInMs, () => location.reload());
  addDays(a.days);
} catch (e) {
  showError(main, errorText(e));
}
