import { api, type Me } from '../lib/api';
import { me, shell } from '../lib/shell';
import { errorText, h, medalBadge, mount, qs, toast, plusTag } from '../lib/ui';
import { framePanel, medalsPanel, membershipPanel, requestsPanel } from './account-plus';

const main = await shell({ title: 'Account' });
const next = qs('next') && qs('next').startsWith('/') && !qs('next').startsWith('//') ? qs('next') : '/';

function form(title: string, fields: HTMLElement[], submitLabel: string, onSubmit: (data: Record<string, string>) => Promise<void>, extra: (HTMLElement | null)[] = []) {
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary block big', type: 'submit' }, submitLabel);
  const f = h('form', { class: 'panel form-narrow' }, h('h1', {}, title), ...fields, err, btn, ...extra);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.setAttribute('disabled', '');
    try {
      await onSubmit(Object.fromEntries(new FormData(f).entries()) as Record<string, string>);
    } catch (x) {
      err.textContent = errorText(x);
    } finally {
      btn.removeAttribute('disabled');
    }
  });
  return f;
}

const field = (label: string, name: string, type = 'text', attrs: Record<string, string> = {}) =>
  h('div', { class: 'field' }, h('label', { for: name }, label), h('input', { id: name, name, type, required: true, ...attrs }));

function devLink(link?: string) {
  if (link) toast('Development link', link, '', 15000), console.log('Dev link:', link);
}

function signInView() {
  mount(
    main,
    form(
      'Sign in',
      [field('Email or username', 'email', 'text', { autocomplete: 'username' }), field('Password', 'password', 'password', { autocomplete: 'current-password' })],
      'Sign in',
      async (d) => {
        await api.post('/auth/login', d);
        location.href = next;
      },
      [
        h('p', { class: 'small', style: 'margin-top:12px' }, h('a', { href: '#', onclick: (e: Event) => (e.preventDefault(), signUpView()) }, 'Create an account'), ' · ', h('a', { href: '#', onclick: (e: Event) => (e.preventDefault(), forgotView()) }, 'Forgot password?')),
      ],
    ),
  );
}

function signUpView() {
  mount(
    main,
    form(
      'Create your account',
      [
        field('Email', 'email', 'email', { autocomplete: 'email' }),
        field('Username (shown on leaderboards)', 'username', 'text', { autocomplete: 'nickname', pattern: '[A-Za-z0-9_]{3,20}', title: '3–20 letters, numbers or underscores' }),
        field('Password (8+ characters)', 'password', 'password', { autocomplete: 'new-password', minlength: '8' }),
      ],
      'Create account',
      async (d) => {
        const r = await api.post<{ devLink?: string }>('/auth/signup', d);
        devLink(r.devLink);
        toast('Welcome to SnapShift!', 'Check your email to verify your address.', 'good');
        setTimeout(() => (location.href = next), r.devLink ? 2500 : 800);
      },
      [h('p', { class: 'small', style: 'margin-top:12px' }, 'Already have an account? ', h('a', { href: '#', onclick: (e: Event) => (e.preventDefault(), signInView()) }, 'Sign in'))],
    ),
  );
}

function forgotView() {
  mount(
    main,
    form('Reset your password', [field('Email', 'email', 'email')], 'Email me a reset link', async (d) => {
      const r = await api.post<{ devLink?: string }>('/auth/forgot', d);
      devLink(r.devLink);
      mount(main, h('section', { class: 'panel form-narrow' }, h('h1', {}, 'Check your email'), h('p', {}, 'If that address has an account, a reset link is on its way. It works for one hour.')));
    }),
  );
}

function resetView(token: string) {
  mount(
    main,
    form('Choose a new password', [field('New password', 'password', 'password', { autocomplete: 'new-password', minlength: '8' })], 'Save password', async (d) => {
      await api.post('/auth/reset', { token, password: d.password });
      toast('Password updated', 'You are signed in.', 'good');
      setTimeout(() => (location.href = '/account'), 800);
    }),
  );
}

async function profileView(user: Me) {
  const s = await api.get<{
    streak: { current: number; best: number };
    medals: { gold: number; silver: number; bronze: number };
    completed: number;
    freezesLeft: number | null;
    ledger: { delta: number; reason: string; ref: string | null; created_at: number }[];
  }>('/me/summary');
  const reasons: Record<string, string> = { win: 'Puzzle finished', daily: 'Daily bonus', streak: 'Streak reward', timeattack: 'Time Attack', unlock: 'Unlocked a puzzle', hint: 'Swap hint', place: 'Placed a tile', admin: 'Adjustment' };
  const pw = form(
    'Change password',
    [field('Current password', 'current', 'password', { autocomplete: 'current-password' }), field('New password', 'next', 'password', { autocomplete: 'new-password', minlength: '8' })],
    'Update password',
    async (d) => {
      await api.post('/auth/password', d);
      toast('Password changed', '', 'good');
    },
  );
  pw.classList.remove('form-narrow');
  mount(
    main,
    !user.emailVerified
      ? h(
          'div',
          { class: 'notice warn' },
          'Please verify your email address. ',
          h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                const r = await api.post<{ devLink?: string }>('/auth/resend-verification');
                devLink(r.devLink);
                toast('Sent', 'Check your inbox.');
              },
            },
            'Resend email',
          ),
        )
      : null,
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'spread' }, h('div', {}, h('h1', {}, user.username), h('p', { class: 'muted' }, user.email, user.member && user.role !== 'admin' ? [' · ', plusTag()] : '')), h('button', { class: 'btn', onclick: async () => (await api.post('/auth/logout'), (location.href = '/')) }, 'Sign out')),
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Points'), h('b', {}, user.points.toLocaleString())),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Puzzles finished'), h('b', {}, s.completed)),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Daily streak'), h('b', {}, `${s.streak.current} (best ${s.streak.best})`)),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Medals'), h('b', {}, medalBadge('gold'), ` ${s.medals.gold}  `, medalBadge('silver'), ` ${s.medals.silver}  `, medalBadge('bronze'), ` ${s.medals.bronze}`)),
      ),
    ),
    h(
      'div',
      { class: 'two-col' },
      h(
        'section',
        { class: 'panel' },
        h('h2', {}, 'Points history'),
        s.ledger.length
          ? h(
              'table',
              {},
              h(
                'tbody',
                {},
                s.ledger.map((l) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, reasons[l.reason] ?? l.reason),
                    h('td', { class: 'muted small' }, new Date(l.created_at).toLocaleString()),
                    h('td', { class: 'num', style: `color:${l.delta > 0 ? 'var(--ok)' : 'var(--muted)'}` }, `${l.delta > 0 ? '+' : ''}${l.delta}`),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Finish a puzzle to earn your first points.'),
      ),
      pw,
    ),
  );
  main.append(membershipPanel(user, s.freezesLeft));
  if (user.member) {
    main.append(framePanel(user));
    main.append(await requestsPanel());
    main.append(await medalsPanel().catch((e) => h('p', { class: 'error' }, errorText(e))));
  }
}

const verify = qs('verify');
const reset = qs('reset');
if (verify) {
  try {
    await api.post('/auth/verify', { token: verify });
    toast('Email verified', 'Thanks!', 'good');
  } catch (e) {
    toast('Verification failed', errorText(e), 'bad');
  }
  history.replaceState(null, '', '/account');
}
if (reset) resetView(reset);
else if (me()) await profileView((await api.get<{ user: Me }>('/auth/me')).user);
else if (qs('signup')) signUpView();
else signInView();
