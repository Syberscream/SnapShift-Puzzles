import { api } from '../lib/api';
import { shell, showError } from '../lib/shell';
import { errorText, h, medalBadge, mount, qs } from '../lib/ui';
import { formatTime } from '@shared/engine';

interface DailyRow {
  rank: number;
  username: string;
  scorePct: number;
  elapsedMs: number;
  moves: number;
  medal: string;
  isMe: boolean;
}

const main = await shell({ title: 'Leaderboard' });
const body = h('div');
let tab: 'daily' | 'points' = qs('tab') === 'points' ? 'points' : 'daily';

async function draw() {
  try {
    if (tab === 'daily') {
      const day = qs('day');
      const d = await api.get<{ day: string; rows: DailyRow[]; me: { rank: number; score_pct: number } | null }>(`/leaderboard/daily${day ? `?day=${day}` : ''}`);
      mount(
        body,
        h('p', { class: 'muted' }, `Daily challenge · ${d.day}. Ranked by overall score, then time.`),
        d.me ? h('div', { class: 'notice' }, `You're #${d.me.rank} with ${d.me.score_pct}%.`) : null,
        d.rows.length
          ? h(
              'table',
              {},
              h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Medal'), h('th', { class: 'num' }, 'Score'), h('th', { class: 'num' }, 'Time'), h('th', { class: 'num' }, 'Moves'))),
              h(
                'tbody',
                {},
                d.rows.map((r) =>
                  h(
                    'tr',
                    { class: r.isMe ? 'me' : '' },
                    h('td', {}, r.rank),
                    h('td', {}, r.username),
                    h('td', {}, medalBadge(r.medal)),
                    h('td', { class: 'num' }, `${r.scorePct}%`),
                    h('td', { class: 'num' }, formatTime(r.elapsedMs)),
                    h('td', { class: 'num' }, r.moves),
                  ),
                ),
              ),
            )
          : h('p', {}, 'No finishes yet. ', h('a', { href: `/play?daily=${d.day}` }, 'Be the first!')),
      );
    } else {
      const d = await api.get<{ rows: { rank: number; username: string; earned: number; golds: number; isMe: boolean }[] }>('/leaderboard/points');
      mount(
        body,
        h('p', { class: 'muted' }, 'All-time points earned from puzzles, dailies and streaks (spending points doesn’t lower your rank).'),
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Points earned'), h('th', { class: 'num' }, 'Gold medals'))),
          h(
            'tbody',
            {},
            d.rows.map((r) => h('tr', { class: r.isMe ? 'me' : '' }, h('td', {}, r.rank), h('td', {}, r.username), h('td', { class: 'num' }, r.earned.toLocaleString()), h('td', { class: 'num' }, r.golds))),
          ),
        ),
      );
    }
  } catch (e) {
    showError(main, errorText(e));
  }
}

const tabBtn = (key: typeof tab, label: string) =>
  h(
    'button',
    {
      class: 'btn',
      'aria-pressed': String(tab === key),
      onclick: (e: Event) => {
        tab = key;
        document.querySelectorAll('.tabs .btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        (e.currentTarget as HTMLElement).setAttribute('aria-pressed', 'true');
        void draw();
      },
    },
    label,
  );

mount(main, h('section', { class: 'panel' }, h('h1', {}, 'Leaderboard'), h('div', { class: 'tabs' }, tabBtn('daily', 'Today’s daily'), tabBtn('points', 'All-time points')), body));
await draw();
