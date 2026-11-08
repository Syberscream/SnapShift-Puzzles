// Delete your account: the explanation lives in the HTML; signed-in players also get the form here.
import { api } from '../lib/api';
import { me, shell } from '../lib/shell';
import { errorText, h, mount, toast } from '../lib/ui';

await shell();
const slot = document.getElementById('delete-form');
if (slot) mount(slot, deleteAccountForm());

/** The "delete my account" box. Shared with the account page. */
export function deleteAccountForm(): HTMLElement {
  const u = me();
  if (!u) {
    return h('div', { class: 'notice' }, 'You’re not signed in. ', h('a', { href: '/account?next=/delete-account' }, 'Sign in'), ' to delete your account.');
  }
  const pw = h('input', { type: 'password', id: 'del-pw', autocomplete: 'current-password', required: true }) as HTMLInputElement;
  const sure = h('input', { type: 'checkbox', id: 'del-sure' }) as HTMLInputElement;
  const btn = h('button', { class: 'btn danger', type: 'submit', disabled: true }, 'Delete my account permanently') as HTMLButtonElement;
  const err = h('p', { class: 'error', role: 'alert' });
  const sync = () => (btn.disabled = !sure.checked || !pw.value);
  pw.addEventListener('input', sync);
  sure.addEventListener('change', sync);
  const form = h(
    'form',
    { class: 'panel danger-zone', id: 'delete-account' },
    h('h2', {}, 'Delete my account'),
    h('p', {}, `Signed in as ${u.username}. This deletes your account and all its progress for good.`),
    h('div', { class: 'field' }, h('label', { for: 'del-pw' }, 'Your password'), pw),
    h('label', { class: 'check' }, sure, `I understand ${u.username}’s points, medals and progress will be gone for good`),
    err,
    btn,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try {
      await api.post('/auth/delete-account', { password: pw.value });
      mount(form, h('h2', {}, 'Your account has been deleted'), h('p', {}, 'Thanks for playing SnapShift Puzzles. You can keep playing as a guest any time.'), h('a', { class: 'btn', href: '/' }, 'Home'));
      toast('Account deleted', '', 'good');
    } catch (x) {
      err.textContent = errorText(x);
      sync();
    }
  });
  return form;
}
