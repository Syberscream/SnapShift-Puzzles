// Public player profile: /u?name=…

import { api } from '../lib/api';
import { shell, showError } from '../lib/shell';
import { bg, errorText, h, medalBadge, mount, plural, plusTag, qs } from '../lib/ui';

interface Profile {
  username: string;
  joined: number;
  plus: boolean;
  frame: string;
  isPublic: boolean;
  self: boolean;
  medals: { gold: number; silver: number; bronze: number };
  completed: number;
  streak: { current: number; best: number };
  dailies: { played: number; golds: number };
  timeAttack: { best: number | null; runs: number };
  achievements: { id: string; icon: string; title: string; description: string; earnedAt: number }[];
  achievementsTotal: number;
  recent: { slug: string; title: string; thumb: string; medal: string | null; difficulty: string; at: number }[];
}

const name = qs('name');
const main = await shell({ title: name ? `${name}` : 'Player' });

const stat = (label: string, value: string | number) => h('div', { class: 'stat' }, h('span', { class: 'muted small' }, label), h('b', {}, String(value)));

try {
  if (!name) throw new Error('No player chosen.');
  const p = await api.get<Profile>(`/profile/${encodeURIComponent(name)}`);
  document.title = `${p.username} | SnapShift Puzzles`;
  const joined = new Date(p.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  mount(
    main,
    h(
      'section',
      { class: 'panel profile-head' },
      h('div', { class: `profile-avatar${p.frame ? ` frame-${p.frame}` : ''}` }, p.username.slice(0, 1).toUpperCase()),
      h(
        'div',
        { class: 'stack' },
        h('h1', {}, p.username, p.plus ? plusTag() : null),
        h('p', { class: 'muted' }, `Playing since ${joined}`),
        p.self
          ? h(
              'p',
              { class: 'small muted' },
              p.isPublic ? 'This is your public profile. ' : 'Your profile is private: only you can see this page. ',
              h('a', { href: '/account#profile' }, 'Change in your account'),
            )
          : null,
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'profile-stats' },
        stat('Puzzles finished', p.completed),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Medals'), h('div', { class: 'row profile-medals' }, medalBadge('gold'), ` ${p.medals.gold}`, medalBadge('silver'), ` ${p.medals.silver}`, medalBadge('bronze'), ` ${p.medals.bronze}`)),
        stat('Daily streak', p.streak.current ? `🔥 ${p.streak.current}` : '0'),
        stat('Best streak', p.streak.best),
        stat('Dailies played', p.dailies.played),
        stat('Time Attack best', p.timeAttack.best ?? '–'),
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, `Achievements · ${p.achievements.length} of ${p.achievementsTotal}`),
      p.achievements.length
        ? h(
            'div',
            { class: 'achievements' },
            p.achievements.map((a) =>
              h('div', { class: 'achievement earned', title: `Earned ${new Date(a.earnedAt).toLocaleDateString()}` }, h('span', { class: 'icon', 'aria-hidden': 'true' }, a.icon), h('span', {}, h('b', {}, a.title), h('span', { class: 'small muted' }, a.description))),
            ),
          )
        : h('p', { class: 'muted' }, 'None yet.'),
    ),
    p.recent.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', {}, 'Recently finished'),
          h(
            'div',
            { class: 'grid profile-recent' },
            p.recent.map((r) =>
              h(
                'a',
                { class: 'card', href: `/play?p=${encodeURIComponent(r.slug)}` },
                h('div', { class: 'thumb', style: bg(r.thumb) }),
                r.medal ? h('span', { class: 'corner' }, medalBadge(r.medal)) : null,
                h('div', { class: 'meta' }, h('b', {}, r.title), h('div', { class: 'small muted' }, `${r.difficulty[0].toUpperCase()}${r.difficulty.slice(1)} · ${new Date(r.at).toLocaleDateString()}`)),
              ),
            ),
          ),
        )
      : null,
    h('p', { class: 'small muted' }, plural(p.dailies.golds, 'daily gold'), ' · ', plural(p.timeAttack.runs, 'Time Attack run')),
  );
} catch (e) {
  showError(main, errorText(e));
}
