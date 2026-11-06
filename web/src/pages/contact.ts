import { api } from '../lib/api';
import { me, shell } from '../lib/shell';
import { errorText, h, mount } from '../lib/ui';

const main = await shell({ title: 'Contact' });
const user = me();
const site = await api.get<{ contactEmail: string }>('/site').catch(() => ({ contactEmail: '' }));
const err = h('p', { class: 'error', role: 'alert' });
const field = (label: string, el: HTMLElement) => h('div', { class: 'field' }, h('label', {}, label), el);
const f = h(
  'form',
  { class: 'panel form-narrow' },
  h('h1', {}, 'Contact'),
  h('p', { class: 'muted' }, 'Questions, bugs, puzzle ideas or account help. We usually reply within a couple of days.', site.contactEmail ? ` You can also email ${site.contactEmail}.` : ''),
  field('Name', h('input', { name: 'name', required: true, value: user?.username ?? '' })),
  field('Email', h('input', { name: 'email', type: 'email', required: true, value: user?.email ?? '' })),
  field('Subject', h('input', { name: 'subject' })),
  field('Message', h('textarea', { name: 'message', required: true, minlength: 5 })),
  err,
  h('button', { class: 'btn primary block big', type: 'submit' }, 'Send'),
);
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  try {
    await api.post('/contact', Object.fromEntries(new FormData(f)));
    mount(main, h('section', { class: 'panel form-narrow' }, h('h1', {}, 'Thanks!'), h('p', {}, 'Your message is in. We will reply by email.')));
  } catch (x) {
    err.textContent = errorText(x);
  }
});
mount(main, f);
