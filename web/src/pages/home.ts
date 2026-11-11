import { api, type Category, type PuzzleView } from '../lib/api';
import { me, shell, showError } from '../lib/shell';
import { bg, countdown, errorText, h, medalBadge, mount, plural, plusTag, store, longCountdown } from '../lib/ui';
import { categoryCard, puzzleCard } from './shared';
import { plusSection } from '../lib/plus-promo';
import { PLUS } from '@shared/rules';

interface Home {
  today: string;
  nextDailyInMs: number;
  daily: { day: string; slug: string; title: string; thumb: string; categoryId: string } | null;
  dailyResult: { score_pct: number; elapsed_ms: number; moves: number; medal: string } | null;
  sliderToday?: { elapsedMs: number; moves: number; medal: string } | null;
  timeAttackToday?: { runs: number; best: number | null; solved: number | null; runsLeft: number | null } | null;
  streak: { current: number; best: number; doneToday: boolean } | null;
  continue: { playId: string; slug: string; title: string; difficulty: string; mode: string; daily: string | null; challenge: string | null; thumb: string }[];
  events: {
    id: string;
    title: string;
    description: string;
    image: string;
    ends: string;
    bonus: number;
    prizes: number[];
    me: { done: number; total: number; completed: boolean; rank: number | null; players: number; bonus: number | null } | null;
  }[];
  upcoming: { id: string; title: string; description: string; image: string; starts: string; startsInMs: number; prizes: number[] }[];
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

  // Played Time Attack today? Signed in: from the server. Guests: on this device.
  const taToday = (() => {
    if (me()) return d.timeAttackToday?.runs ? d.timeAttackToday : null;
    try {
      const day = new Date().toLocaleDateString('en-CA');
      const runs = JSON.parse(localStorage.getItem('ss_ta_guest_runs') || '{}') as { day?: string; n?: number };
      const best = JSON.parse(localStorage.getItem('ss_ta_guest_today') || '{}') as { day?: string; best?: number; solved?: number };
      if (runs.day !== day || !runs.n) return null;
      return { runs: runs.n, best: best.day === day ? (best.best ?? null) : null, solved: best.day === day ? (best.solved ?? null) : null, runsLeft: Math.max(0, PLUS.freeTimeAttackRuns - runs.n) };
    } catch {
      return null;
    }
  })();
  const taOut = !!taToday && taToday.runsLeft === 0;
  const ta = h(
    'section',
    { class: `panel${taToday ? ' ta-done' : ''}` },
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        {},
        h('h2', {}, 'Time Attack', taToday ? h('span', { class: 'done-badge' }, taOut ? '✓ Done for today' : '✓ Played today') : null),
        taToday
          ? h(
              'p',
              { class: 'small' },
              taToday.best != null ? `Best today: ${taToday.best}${taToday.solved != null ? ` (${taToday.solved} solved)` : ''}. ` : '',
              taToday.runsLeft == null ? 'Play as many runs as you like.' : taOut ? 'New runs tomorrow.' : `${taToday.runsLeft} ${taToday.runsLeft === 1 ? 'run' : 'runs'} left today.`,
            )
          : h('p', { class: 'muted small' }, '3 minutes. As many quick 3×4 puzzles as you can solve. New weekly leaderboard every Monday.'),
      ),
      h(
        'div',
        { class: 'row' },
        h('a', { class: `btn${taOut ? '' : ' primary'}`, href: '/time-attack' }, taOut ? 'See your runs' : taToday ? 'Play again' : 'Play Time Attack'),
        h('a', { class: 'btn', href: '/leaderboard?tab=timeattack' }, 'This week'),
      ),
    ),
  );

  // Today's slider done? Signed in: from the server. Guests: kept on this device.
  const guestSlider = (() => {
    try {
      const all = JSON.parse(localStorage.getItem('ss_slider_guest_best') || '{}') as Record<string, number>;
      const ms = all[`daily:${d.today}:4`];
      return ms ? { elapsedMs: ms, moves: 0, medal: '' } : null;
    } catch {
      return null;
    }
  })();
  const sliderDone = d.sliderToday ?? (me() ? null : guestSlider);
  const secs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
  const slider = h(
    'section',
    { class: `panel${sliderDone ? ' slider-done' : ''}` },
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        {},
        h('h2', {}, 'Slider Puzzle', sliderDone ? h('span', { class: 'done-badge' }, '✓ Done today') : null),
        sliderDone
          ? h(
              'p',
              { class: 'small' },
              sliderDone.medal ? medalBadge(sliderDone.medal) : null,
              ` Today’s slider in ${secs(sliderDone.elapsedMs)}${sliderDone.moves ? ` · ${sliderDone.moves} moves` : ''}. A new one tomorrow!`,
            )
          : h('p', { class: 'muted small' }, 'Slide tiles into the empty square to rebuild the picture. A new 4×4 slider every day, fastest time wins.'),
      ),
      h(
        'div',
        { class: 'row' },
        sliderDone
          ? h('a', { class: 'btn', href: '/slider?daily=1' }, 'See your result')
          : h('a', { class: 'btn primary', href: '/slider?daily=1' }, 'Play today’s slider'),
        h('a', { class: 'btn', href: '/slider' }, 'More sizes'),
      ),
    ),
  );

  const PLACES = ['🥇', '🥈', '🥉'];
  const events = d.events.map((e) => {
    const until = new Date(e.ends + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const url = `/event?e=${encodeURIComponent(e.id)}`;
    const me = e.me;
    const prizes = e.prizes.some((x) => x > 0);
    // Finished it: show that, the bonus and where they stand for the prizes.
    if (me?.completed)
      return h(
        'section',
        { class: 'panel event-panel event-complete' },
        e.image ? h('div', { class: 'event-art', style: bg(e.image) }, h('span', { class: 'event-art-badge' }, '✓ Completed')) : null,
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'row' }, h('span', { class: 'pill event-done-pill' }, '🏅 Event complete'), h('span', { class: 'muted small' }, `Prizes on ${until}`)),
          h('h2', {}, e.title),
          h(
            'div',
            { class: 'event-done-stats' },
            h('div', {}, h('small', {}, 'Puzzles'), h('b', {}, `${me.done}/${me.total}`)),
            me.bonus ? h('div', {}, h('small', {}, 'Bonus'), h('b', {}, `+${me.bonus.toLocaleString()}`)) : null,
            me.rank ? h('div', {}, h('small', {}, 'Your rank'), h('b', {}, `${me.rank <= 3 && prizes ? PLACES[me.rank - 1] + ' ' : ''}#${me.rank}`)) : null,
          ),
          h(
            'p',
            { class: 'small' },
            prizes
              ? me.rank && me.rank <= 3
                ? `You're in the prizes! Stay in the top 3 until ${until} to win ${e.prizes[me.rank - 1].toLocaleString()} points. Replay puzzles to raise your score.`
                : `The top 3 on ${until} win up to ${Math.max(...e.prizes).toLocaleString()} points. Replay puzzles to raise your score.`
              : 'Well done! Your event badge is on your profile.',
          ),
          h('div', { class: 'row' }, h('a', { class: 'btn primary', href: url + '#leaderboard' }, 'See the leaderboard'), h('a', { class: 'btn', href: url }, 'Replay puzzles')),
        ),
      );
    const started = !!me && me.done > 0;
    return h(
      'section',
      { class: 'panel event-panel' },
      e.image ? h('div', { class: 'event-art', style: bg(e.image) }) : null,
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row' }, h('span', { class: 'pill event-pill' }, '🎉 Event'), h('span', { class: 'muted small' }, `Until ${until}`)),
        h('h2', {}, e.title),
        e.description ? h('p', { class: 'muted' }, e.description) : null,
        started
          ? h(
              'div',
              { class: 'stack event-progress' },
              h('b', { class: 'small' }, `Your progress: ${me!.done} of ${me!.total}${me!.rank ? ` · #${me!.rank} on the leaderboard` : ''}`),
              h('div', { class: 'progress-bar' }, h('i', { style: `width:${Math.round((me!.done / Math.max(1, me!.total)) * 100)}%` })),
            )
          : null,
        h('p', { class: 'small' }, `Every event puzzle is free to play while it runs.${e.bonus ? ` Finish them all for +${e.bonus} bonus points.` : ''}${prizes ? ` Top 3 win up to ${Math.max(...e.prizes).toLocaleString()} points.` : ''}`),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: url }, started ? 'Continue the event' : 'Play the event')),
      ),
    );
  });

  // Coming soon: a countdown to events about to start.
  const upcoming = (d.upcoming ?? []).map((e) => {
    const cd = h('b', { class: 'countdown' });
    longCountdown(cd, e.startsInMs, () => location.reload());
    return h(
      'section',
      { class: 'panel event-panel coming-soon' },
      e.image ? h('div', { class: 'event-art', style: bg(e.image) }) : null,
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row' }, h('span', { class: 'pill dark' }, '⏳ Coming soon'), h('span', { class: 'pill gold' }, 'Starts in ', cd)),
        h('h2', {}, e.title),
        e.description ? h('p', { class: 'muted' }, e.description) : null,
        e.prizes.some((x) => x > 0) ? h('p', { class: 'small' }, `🏆 Top 3 win ${e.prizes.map((x) => x.toLocaleString()).join(' / ')} points.`) : null,
        h('div', { class: 'row' }, h('a', { class: 'btn', href: `/event?e=${encodeURIComponent(e.id)}` }, 'See the event')),
      ),
    );
  });

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

  mount(main, welcome, hero, ...events, ...upcoming, cont, ta, slider, cats, latest, await plusSection());
}
