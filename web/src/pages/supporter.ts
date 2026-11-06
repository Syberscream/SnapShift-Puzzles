import { api } from '../lib/api';
import { me, shell } from '../lib/shell';
import { h, mount } from '../lib/ui';

const main = await shell({ title: 'Become a Supporter' });
const site = await api.get<{ supporterMonthlyUrl: string; supporterYearlyUrl: string }>('/site').catch(() => ({ supporterMonthlyUrl: '', supporterYearlyUrl: '' }));
const user = me();
const link = (url: string, label: string) => {
  if (!url) return null;
  const u = new URL(url);
  if (user) u.searchParams.set('prefilled_email', user.email);
  return h('a', { class: 'btn primary big', href: u.toString(), rel: 'noopener' }, label);
};
mount(
  main,
  h(
    'section',
    { class: 'panel prose' },
    h('h1', {}, 'Support SnapShift'),
    user?.supporter ? h('div', { class: 'notice' }, 'You are a supporter. Thank you! ♥') : null,
    h('p', {}, 'SnapShift is free to play. Supporters help pay for new puzzles and hosting, and get a supporter badge on their account.'),
    h('ul', {}, h('li', {}, 'Supporter badge next to your name'), h('li', {}, 'Helps fund new puzzles every week'), h('li', {}, 'Cancel any time')),
    h('div', { class: 'row' }, link(site.supporterMonthlyUrl, 'Monthly'), link(site.supporterYearlyUrl, 'Yearly')),
    !site.supporterMonthlyUrl && !site.supporterYearlyUrl ? h('p', { class: 'muted' }, 'Supporter options are coming soon.') : null,
    h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Payments are handled securely by Stripe. Use the same email as your SnapShift account so we can add your badge.'),
  ),
);
