import { api } from '../lib/api';
import { me, shell } from '../lib/shell';
import { errorText, h, hasPaidPlus, inAndroidApp, mount, plusTag, qs, toast } from '../lib/ui';
import { PLUS } from '@shared/rules';

interface Plans {
  enabled: boolean;
  plans: { id: 'monthly' | 'yearly' | 'lifetime'; label: string; available: boolean }[];
}

const main = await shell({ title: 'SnapShift Plus' });
const plans = await api.get<Plans>('/billing/plans').catch((): Plans => ({ enabled: false, plans: [] }));

async function checkout(plan: string, btn: HTMLButtonElement) {
  if (!me()) {
    location.href = `/account?next=${encodeURIComponent('/plus')}`;
    return;
  }
  btn.disabled = true;
  try {
    const r = await api.post<{ url: string }>('/billing/checkout', { plan });
    location.href = r.url;
  } catch (e) {
    toast('Couldn’t start checkout', errorText(e), 'bad', 6000);
    btn.disabled = false;
  }
}

async function portal(btn: HTMLButtonElement) {
  btn.disabled = true;
  try {
    location.href = (await api.post<{ url: string }>('/billing/portal')).url;
  } catch (e) {
    toast('Couldn’t open billing', errorText(e), 'bad', 6000);
    btn.disabled = false;
  }
}

const perks: [string, string][] = [
  ['Every puzzle unlocked', 'Play any picture in any category, no points needed.'],
  ['No ads', 'Just the puzzles.'],
  ['The whole daily archive', `Free players get the last ${PLUS.freeArchiveDays} days; Plus goes back to day one.`],
  ['New puzzles first', `Play new pictures ${PLUS.earlyAccessMs / 3600_000} hours before everyone else.`],
  ['Members’ Gallery', 'A members-only category with new pictures every week.'],
  ['Unlimited Time Attack', `Free players get ${PLUS.freeTimeAttackRuns} runs a day.`],
  ['Streak freeze', `Miss a day and keep your streak, up to ${PLUS.streakFreezesPerMonth} times a month.`],
  ['Request a picture', `Send us ${PLUS.requestsPerMonth} picture ideas a month and we’ll make them into puzzles.`],
  ['Download your pictures', 'Save the full-size picture of any puzzle you finish.'],
  ['Look the part', 'A Plus badge on the leaderboards, board frames and your medal collection.'],
];

const yes = '✓';
const compare: [string, string, string][] = [
  ['Daily challenge, streaks, leaderboards', yes, yes],
  ['All difficulties and modes', yes, yes],
  ['Puzzles', 'First free, unlock the rest with points', 'All unlocked'],
  ['Daily archive', `Last ${PLUS.freeArchiveDays} days`, 'Everything'],
  ['Time Attack', `${PLUS.freeTimeAttackRuns} runs a day`, 'Unlimited'],
  ['New puzzles', `After ${PLUS.earlyAccessMs / 3600_000} hours`, 'Straight away'],
  ['Members’ Gallery', '—', yes],
  ['Streak freeze', '—', `${PLUS.streakFreezesPerMonth} a month`],
  ['Picture requests', '—', `${PLUS.requestsPerMonth} a month`],
  ['Download pictures', '—', yes],
  ['Ads', 'A few banners', 'None'],
];

function planCard(p: Plans['plans'][number]) {
  const names = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };
  const notes = { monthly: 'Cancel any time.', yearly: 'Best value. Cancel any time.', lifetime: 'Pay once, Plus forever.' };
  const btn = h('button', { class: `btn ${p.id === 'yearly' ? 'primary' : ''} big`, disabled: !p.available }, p.available ? `Choose ${names[p.id]}` : 'Coming soon') as HTMLButtonElement;
  btn.addEventListener('click', () => void checkout(p.id, btn));
  return h(
    'div',
    { class: `plan${p.id === 'yearly' ? ' best' : ''}` },
    h('div', { class: 'spread' }, h('b', {}, names[p.id]), p.id === 'yearly' ? plusTag('BEST VALUE') : null),
    h('b', { class: 'price' }, p.label),
    h('span', { class: 'muted small' }, notes[p.id]),
    btn,
  );
}

function render() {
  const user = me();
  const member = hasPaidPlus(user);
  const manage = h('button', { class: 'btn' }, 'Manage billing') as HTMLButtonElement;
  manage.addEventListener('click', () => void portal(manage));
  mount(
    main,
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'row' }, plusTag('SNAPSHIFT PLUS')),
      h('h1', {}, 'More puzzles, no limits'),
      h('p', { class: 'muted' }, 'SnapShift stays free to play. Plus unlocks everything and helps pay for new pictures every week.'),
      qs('welcome') && member ? h('div', { class: 'notice' }, h('b', {}, 'Welcome to Plus! '), 'Everything is unlocked. Thank you for supporting SnapShift ♥') : null,
      qs('welcome') && !member ? h('div', { class: 'notice' }, 'Thanks! We’re confirming your payment with Stripe; this page updates in a moment.') : null,
      member
        ? h(
            'div',
            { class: 'notice' },
            h('b', {}, 'You’re a Plus member. '),
            user!.lifetime ? 'Lifetime membership.' : user!.memberUntil ? `Renews or ends on ${new Date(user!.memberUntil).toLocaleDateString()}.` : '',
            ' ',
            user!.billing ? manage : null,
          )
        : user?.role === 'admin'
          ? h(
              'div',
              { class: 'notice' },
              'As an admin you already get every Plus feature. You can still buy a plan here, just like a player would (handy for testing). ',
              user.billing ? manage : null,
            )
          : user?.billing
            ? h('div', { class: 'notice' }, 'Your membership has ended. ', manage)
            : null,
    ),
    h('section', { class: 'panel' }, h('h2', {}, 'What you get'), h('ul', { class: 'perks' }, perks.map(([t, d]) => h('li', {}, h('b', {}, t), h('span', { class: 'muted small' }, d))))),
    !member
      ? h(
          'section',
          { class: 'panel' },
          h('h2', {}, 'Choose a plan'),
          inAndroidApp()
            ? h('div', { class: 'notice' }, 'Plus can’t be bought inside the Android app. If you’re already a member, sign in and all your Plus perks work here too.')
            : plans.enabled
            ? h('div', { class: 'plans' }, plans.plans.map(planCard))
            : h('p', { class: 'muted' }, 'Memberships open very soon. Check back shortly!'),
          !user ? h('p', { class: 'small muted' }, 'You’ll sign in or create a free account first.') : null,
          h('p', { class: 'small muted' }, 'Payments are handled securely by Stripe. Cancel any time from your account page; you keep Plus until the end of the period you paid for.'),
        )
      : null,
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Free vs Plus'),
      h(
        'table',
        { class: 'compare' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Free'), h('th', {}, 'Plus'))),
        h('tbody', {}, compare.map(([a, b, c]) => h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', {}, c)))),
      ),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Plus never changes scores, medals or points, so the leaderboards stay fair.'),
    ),
  );
}

render();

// Back from Stripe: the webhook may take a few seconds to arrive.
if (qs('welcome') && !hasPaidPlus(me())) {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await api.get<{ user: ReturnType<typeof me> }>('/auth/me').catch(() => null);
    if (hasPaidPlus(r?.user)) {
      location.reload();
      break;
    }
  }
}
