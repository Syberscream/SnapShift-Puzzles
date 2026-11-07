// Account page sections for SnapShift Plus: membership, board frame,
// picture requests and the medal collection.

import { api, type Me } from '../lib/api';
import { bg, errorText, h, hasPaidPlus, medalBadge, mount, plusTag, toast } from '../lib/ui';
import { FRAME_LABELS, FRAMES, MODE_LABELS, PLUS, RULES, type Difficulty, type Mode } from '@shared/rules';

async function openPortal(btn: HTMLButtonElement) {
  btn.disabled = true;
  try {
    location.href = (await api.post<{ url: string }>('/billing/portal')).url;
  } catch (e) {
    toast('Couldn’t open billing', errorText(e), 'bad', 6000);
    btn.disabled = false;
  }
}

export function membershipPanel(user: Me, freezesLeft: number | null): HTMLElement {
  const paying = hasPaidPlus(user);
  const manage = h('button', { class: 'btn' }, 'Manage billing') as HTMLButtonElement;
  manage.addEventListener('click', () => void openPortal(manage));
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'spread' }, h('h2', {}, 'Membership'), plusTag('SNAPSHIFT PLUS')),
    paying || user.role === 'admin'
      ? h(
          'div',
          { class: 'stack' },
          h(
            'p',
            {},
            !paying
              ? 'Admins get every Plus feature.'
              : user.lifetime
                ? 'Lifetime member. Thank you! ♥'
                : user.memberUntil
                  ? `Plus member until ${new Date(user.memberUntil).toLocaleDateString()} (renews automatically unless cancelled).`
                  : 'Plus member.',
          ),
          freezesLeft != null ? h('p', { class: 'muted small' }, `Streak freezes left this month: ${freezesLeft} of ${PLUS.streakFreezesPerMonth}. They’re used automatically when you finish a daily after missing a day.`) : null,
          h('div', { class: 'row' }, user.billing ? manage : null, h('a', { class: 'btn', href: '/plus' }, 'What’s included')),
        )
      : h(
          'div',
          { class: 'stack' },
          h('p', { class: 'muted' }, 'Every puzzle unlocked, no ads, the full daily archive, new puzzles first, streak freezes and more.'),
          h('div', { class: 'row' }, h('a', { class: 'btn plus-btn', href: '/plus' }, '✦ Get SnapShift Plus'), user.billing ? manage : null),
        ),
  );
}

export function framePanel(user: Me): HTMLElement {
  let current = user.frame;
  const swatches = FRAMES.map((f) => {
    const b = h(
      'button',
      { class: 'btn', 'aria-pressed': String(current === f) },
      h('span', { class: `frame-swatch board-wrap${f ? ` frame-${f}` : ''}`, style: f ? '' : 'background:var(--surface);border:1px solid var(--border-soft)' }),
      ' ',
      FRAME_LABELS[f],
    );
    b.addEventListener('click', async () => {
      try {
        await api.put('/plus/frame', { frame: f });
        current = f;
        swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(FRAMES[i] === f)));
        toast('Frame saved', 'It shows around your board on every puzzle.', 'good');
      } catch (e) {
        toast('Couldn’t save', errorText(e), 'bad');
      }
    });
    return b;
  });
  return h('section', { class: 'panel' }, h('h2', {}, 'Board frame'), h('div', { class: 'frame-picker' }, swatches));
}

interface Req {
  id: number;
  idea: string;
  createdAt: number;
  title: string | null;
  status: 'making' | 'review' | 'published' | 'declined' | 'failed';
  slug: string | null;
}

export async function requestsPanel(): Promise<HTMLElement> {
  const panel = h('section', { class: 'panel' });
  const draw = async () => {
    const d = await api.get<{ left: number; perMonth: number; categories: { id: string; name: string }[]; requests: Req[] }>('/plus/requests');
    const idea = h('textarea', { rows: 2, maxlength: 300, placeholder: 'e.g. A lighthouse on a stormy cliff at sunset' }) as HTMLTextAreaElement;
    const cat = h('select', {}, d.categories.map((c) => h('option', { value: c.id, selected: c.id === 'members' }, c.name))) as HTMLSelectElement;
    const send = h('button', { class: 'btn primary', disabled: d.left <= 0 }, 'Send idea') as HTMLButtonElement;
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        await api.post('/plus/requests', { idea: idea.value, categoryId: cat.value });
        toast('Idea sent!', 'We’ll make it and add it after a quick check.', 'good');
        await draw();
      } catch (e) {
        toast('Couldn’t send', errorText(e), 'bad', 6000);
        send.disabled = false;
      }
    });
    const label: Record<Req['status'], string> = { making: 'Being made', review: 'Waiting for review', published: 'Published', declined: 'Not used', failed: 'Couldn’t be made' };
    mount(
      panel,
      h('h2', {}, 'Request a picture'),
      h('p', { class: 'muted small' }, `Describe a picture and we’ll turn it into a puzzle. ${d.left} of ${d.perMonth} requests left this month. Every picture is checked before it goes live.`),
      h('div', { class: 'field' }, idea),
      h('div', { class: 'row' }, cat, send),
      d.requests.length
        ? h(
            'table',
            { style: 'margin-top:12px' },
            h(
              'tbody',
              {},
              d.requests.map((r) =>
                h(
                  'tr',
                  {},
                  h('td', {}, r.idea),
                  h('td', { class: 'small' }, r.status === 'published' && r.slug ? h('a', { href: `/play?p=${encodeURIComponent(r.slug)}` }, `Play “${r.title}” →`) : label[r.status]),
                ),
              ),
            ),
          )
        : null,
    );
  };
  await draw().catch((e) => mount(panel, h('p', { class: 'error' }, errorText(e))));
  return panel;
}

export async function medalsPanel(): Promise<HTMLElement> {
  const d = await api.get<{ puzzles: { slug: string; title: string; thumb: string; daily: string | null; results: { difficulty: Difficulty; mode: Mode; medal: string | null }[] }[] }>('/plus/medals');
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, `Medal collection (${d.puzzles.length})`),
    d.puzzles.length
      ? h(
          'div',
          { class: 'medal-grid' },
          d.puzzles.map((p) =>
            h(
              'a',
              { class: 'card', href: p.daily ? `/play?daily=${p.daily}` : `/play?p=${encodeURIComponent(p.slug)}` },
              h('div', { class: 'thumb wide', style: bg(p.thumb) }),
              h(
                'div',
                { class: 'meta' },
                h('b', {}, p.title),
                h(
                  'div',
                  { class: 'medal-row' },
                  p.results.map((r) =>
                    r.medal
                      ? h('span', { title: `${RULES[r.difficulty].label} · ${MODE_LABELS[r.mode]}` }, medalBadge(r.medal))
                      : h('span', { class: 'pill dark small', title: `${RULES[r.difficulty].label} · ${MODE_LABELS[r.mode]}` }, 'Zen ✓'),
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'Finish puzzles to fill your collection.'),
  );
}

/** Streak reminder email on/off. */
export function remindersPanel(user: Me): HTMLElement {
  const box = h('input', { type: 'checkbox', checked: user.remindStreak, disabled: !user.emailVerified }) as HTMLInputElement;
  box.addEventListener('change', async () => {
    try {
      await api.put('/auth/preferences', { remindStreak: box.checked });
      toast(box.checked ? 'Reminders on' : 'Reminders off', box.checked ? 'You’ll get an email in the evening if your streak is about to end.' : '', 'good');
    } catch (e) {
      box.checked = !box.checked;
      toast('Couldn’t save', errorText(e), 'bad');
    }
  });
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Email'),
    h('label', { class: 'check' }, box, 'Remind me in the evening if I haven’t played the daily and my streak is about to end'),
    !user.emailVerified ? h('p', { class: 'small muted' }, 'Verify your email address first (see the notice at the top).') : null,
    new URLSearchParams(location.search).has('unsubscribed') ? h('p', { class: 'small' }, 'You’ve been unsubscribed from reminder emails.') : null,
  );
}

/** Every achievement, earned ones first. */
export async function achievementsPanel(): Promise<HTMLElement> {
  const d = await api.get<{ achievements: { id: string; title: string; description: string; icon: string; earnedAt: number | null }[] }>('/me/achievements');
  const got = d.achievements.filter((a) => a.earnedAt).length;
  const list = [...d.achievements].sort((a, b) => (b.earnedAt ? 1 : 0) - (a.earnedAt ? 1 : 0));
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, `Achievements (${got} of ${d.achievements.length})`),
    h(
      'div',
      { class: 'achievements' },
      list.map((a) =>
        h(
          'div',
          { class: `achievement${a.earnedAt ? ' earned' : ''}`, title: a.earnedAt ? `Earned ${new Date(a.earnedAt).toLocaleDateString()}` : 'Not earned yet' },
          h('span', { class: 'icon', 'aria-hidden': 'true' }, a.icon),
          h('span', {}, h('b', {}, a.title), h('span', { class: 'small muted' }, a.description)),
        ),
      ),
    ),
  );
}
