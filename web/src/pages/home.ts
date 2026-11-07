import { api, type Category, type PuzzleView } from '../lib/api';
import { me, shell, showError } from '../lib/shell';
import { bg, countdown, errorText, h, medalBadge, mount, plural, plusTag, store } from '../lib/ui';
import { categoryCard, puzzleCard } from './shared';
import { plusSection } from '../lib/plus-promo';

interface Home {
  today: string;
  nextDailyInMs: number;
  daily: { day: string; slug: string; title: string; thumb: string; categoryId: string } | null;
  dailyResult: { score_pct: number; elapsed_ms: number; moves: number; medal: string } | null;
  streak: { current: number; best: number; doneToday: boolean } | null;
  continue: { playId: string; slug: string; title: string; difficulty: string; mode: string; daily: string | null; challenge: string | null; thumb: string }[];
  events: { id: string; title: string; description: string; image: string; ends: string; bonus: number }[];
  categories: Category[];
  latest: PuzzleView[];
}

const main = await shell({ title: 'Free Picture Tile Puzzles & Daily Challenge' });
try {
  const d = await api.get<Home>('/home');
  await render(d);
} catch (e) {
  showError(main, errorText(e));
}

async function render(d: Home) {
  const user = me();
  const cd = h('span', { class: 'countdown' });
  const hero = h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'hero' },
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row' }, h('span', { class: 'pill' }, h('span', { class: 'label' }, 'Next daily'), cd)),
        h('h1', {}, d.daily ? `Daily Challenge · ${d.daily.title}` : 'Daily Challenge'),
        h(
          'p',
          { class: 'muted' },
          'One featured puzzle a day, the same board for everyone, always on Hard (8×12). Keep your streak alive for bonus points at 7, 14 and 30 days, and every month after.',
        ),
        d.dailyResult
          ? h(
              'div',
              { class: 'notice' },
              h('b', {}, 'Done for today! '),
              medalBadge(d.dailyResult.medal),
              ` ${d.dailyResult.score_pct}% overall in ${d.dailyResult.moves} moves.`,
            )
          : null,
        h(
          'div',
          { class: 'row' },
          d.daily
            ? h('a', { class: 'btn primary big', href: `/play?daily=${d.daily.day}` }, d.dailyResult ? 'Play again' : 'Play today’s puzzle')
            : h('span', { class: 'muted' }, 'The first daily appears once puzzles are published.'),
          h('a', { class: 'btn', href: '/daily' }, 'Archive'),
          h('a', { class: 'btn', href: '/leaderboard' }, 'Leaderboard'),
        ),
        user && d.streak
          ? h(
              'div',
              { class: 'row' },
              h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Streak'), h('b', {}, `${d.streak.current} day${d.streak.current === 1 ? '' : 's'}`)),
              h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Best'), h('b', {}, `${d.streak.best}`)),
              h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Points'), h('b', {}, user.points.toLocaleString())),
            )
          : !user
            ? h('p', { class: 'small muted' }, h('a', { href: '/account' }, 'Create a free account'), ' to save progress, earn points and join the leaderboard.')
            : null,
      ),
      h('a', { class: 'art', href: d.daily ? `/play?daily=${d.daily.day}` : '#', style: bg(d.daily?.thumb ?? ''), 'aria-label': 'Play the daily puzzle' }),
    ),
  );
  countdown(cd, d.nextDailyInMs, () => location.reload());

  const cont = d.continue.length
    ? h(
        'section',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Continue playing')),
        h(
          'div',
          { class: 'grid' },
          d.continue.map((c) =>
            h(
              'a',
              { class: 'card', href: c.challenge ? `/play?challenge=${c.challenge}` : c.daily ? `/play?daily=${c.daily}` : `/play?p=${c.slug}&d=${c.difficulty}&m=${c.mode}` },
              h('div', { class: 'thumb wide', style: bg(c.thumb) }),
              h('div', { class: 'meta' }, h('b', {}, c.title), h('span', { class: 'muted small' }, c.challenge ? '⚔ Challenge' : c.daily ? `Daily ${c.daily}` : `${c.difficulty} · ${c.mode}`)),
            ),
          ),
        ),
      )
    : null;

  const cats = h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', {}, 'Categories'), h('a', { class: 'btn', href: '/categories' }, 'Browse all')),
    h(
      'div',
      { class: 'grid' },
      d.categories
        .filter((c) => c.count > 0 || user?.role === 'admin')
        .map((c) =>
          categoryCard(c, !!me()),
        ),
    ),
  );

  const latest = d.latest.length
    ? h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'New puzzles')), h('div', { class: 'grid' }, d.latest.map((p) => puzzleCard(p))))
    : null;

  const ta = h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-head' },
      h('div', {}, h('h2', {}, 'Time Attack'), h('p', { class: 'muted small' }, '3 minutes. As many quick 3×4 puzzles as you can solve. New weekly leaderboard every Monday.')),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '/time-attack' }, 'Play Time Attack'), h('a', { class: 'btn', href: '/leaderboard?tab=timeattack' }, 'This week')),
    ),
  );

  const slider = h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-head' },
      h('div', {}, h('h2', {}, 'Slider Puzzle'), h('p', { class: 'muted small' }, 'Slide tiles into the empty square to rebuild the picture. A new 4×4 slider every day, fastest time wins.')),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '/slider?daily=1' }, 'Play today’s slider'), h('a', { class: 'btn', href: '/slider' }, 'More sizes')),
    ),
  );

  const events = d.events.map((e) =>
    h(
      'section',
      { class: 'panel event-panel' },
      e.image ? h('div', { class: 'event-art', style: bg(e.image) }) : null,
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row' }, h('span', { class: 'pill event-pill' }, '🎉 Event'), h('span', { class: 'muted small' }, `Until ${new Date(e.ends + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`)),
        h('h2', {}, e.title),
        e.description ? h('p', { class: 'muted' }, e.description) : null,
        h('p', { class: 'small' }, `Every event puzzle is free to play while it runs.${e.bonus ? ` Finish them all for +${e.bonus} bonus points.` : ''}`),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: `/event?e=${encodeURIComponent(e.id)}` }, 'Play the event')),
      ),
    ),
  );

  // New visitors (no account, never finished a game here) get the guided first game.
  const fresh = !user && !store<boolean>('ss_tutorial_done', false).get() && store<number>('ss_finishes', 0).get() === 0;
  const welcome = fresh
    ? h(
        'section',
        { class: 'panel first-visit' },
        h('div', {}, h('h2', {}, 'New to SnapShift?'), h('p', { class: 'muted' }, 'Swap tiles to rebuild the picture. Learn how in 30 seconds with a quick guided puzzle.')),
        h('a', { class: 'btn primary big', href: '/tutorial' }, 'Show me how'),
      )
    : null;

  mount(main, welcome, hero, ...events, cont, ta, slider, cats, latest, await plusSection());
}
