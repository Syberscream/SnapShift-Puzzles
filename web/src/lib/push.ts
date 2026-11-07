// Daily puzzle reminders by notification, for this device.

import { api } from './api';
import { errorText, h, mount, store, toast } from './ui';

const dismissed = store<number>('ss_push_offer_off', 0);
const onHere = store<boolean>('ss_push_on', false);

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone and iPad only allow notifications from a site added to the Home Screen. */
export function needsHomeScreen(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone && !('PushManager' in window);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  return navigator.serviceWorker.ready.then(() => reg);
}

function keyBytes(b64: string): Uint8Array {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(pad), (ch) => ch.charCodeAt(0));
}

export async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission (if needed), sign this device up and save the reminder hour. */
export async function enablePush(hour = 9): Promise<void> {
  if (!pushSupported()) throw new Error('This browser can’t show notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.get<{ publicKey: string }>('/push/key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  }
  await api.post('/push/subscribe', { subscription: sub.toJSON(), hour, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  onHere.set(true);
}

export async function disablePush(): Promise<void> {
  const sub = await currentSub();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  onHere.set(false);
}

export async function pushStatus(): Promise<{ on: boolean; hour: number }> {
  const sub = await currentSub();
  if (!sub) return { on: false, hour: 9 };
  const r = await api.post<{ subscribed: boolean; hour: number }>('/push/status', { endpoint: sub.endpoint });
  onHere.set(r.subscribed);
  return { on: r.subscribed, hour: r.hour };
}

const hourLabel = (n: number) => new Date(2000, 0, 1, n).toLocaleTimeString([], { hour: 'numeric' });

/** Settings for this device: on/off, what time, and a test. */
export function pushPanel(): HTMLElement {
  const section = h('section', { class: 'panel', id: 'notifications' }, h('h2', {}, '🔔 Daily reminder on this device'));
  const body = h('div', {}, h('p', { class: 'muted small' }, 'Checking…'));
  section.append(body);
  if (needsHomeScreen()) {
    mount(body, h('p', {}, 'On iPhone and iPad, add SnapShift to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on reminders.'));
    return section;
  }
  if (!pushSupported()) {
    mount(body, h('p', { class: 'muted' }, 'This browser can’t show notifications.'));
    return section;
  }
  const draw = async () => {
    const s = await pushStatus().catch(() => ({ on: false, hour: 9 }));
    const sel = h('select', { 'aria-label': 'Reminder time' }, Array.from({ length: 24 }, (_, n) => h('option', { value: String(n), selected: n === s.hour }, hourLabel(n)))) as HTMLSelectElement;
    const toggle = h('button', { class: `btn ${s.on ? '' : 'primary'}` }, s.on ? 'Turn off' : 'Turn on reminders') as HTMLButtonElement;
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        if (s.on) await disablePush();
        else await enablePush(Number(sel.value));
        toast(s.on ? 'Reminders off' : 'Reminders on', s.on ? '' : `You’ll get a notification around ${hourLabel(Number(sel.value))} when there’s a new daily puzzle you haven’t played.`, 'good');
      } catch (e) {
        toast('Couldn’t change reminders', errorText(e), 'bad');
      }
      void draw();
    });
    sel.addEventListener('change', async () => {
      if (!s.on) return;
      try {
        await enablePush(Number(sel.value));
        toast('Saved', `Reminders around ${hourLabel(Number(sel.value))}.`, 'good');
      } catch (e) {
        toast('Couldn’t save', errorText(e), 'bad');
      }
    });
    const test = h('button', { class: 'btn' }, 'Send a test') as HTMLButtonElement;
    test.addEventListener('click', async () => {
      test.disabled = true;
      try {
        const sub = await currentSub();
        await api.post('/push/test', { endpoint: sub?.endpoint });
        toast('Sent', 'It should pop up in a few seconds.', 'good');
      } catch (e) {
        toast('Couldn’t send', errorText(e), 'bad');
      } finally {
        test.disabled = false;
      }
    });
    mount(
      body,
      h('p', {}, 'Get one notification a day when the new daily puzzle is out (skipped if you’ve already played it). It also reminds you to keep your streak going.'),
      Notification.permission === 'denied' ? h('p', { class: 'small error' }, 'Notifications are blocked for this site. Allow them in your browser’s site settings first.') : null,
      h('div', { class: 'row' }, h('label', { class: 'small' }, 'Around ', sel), toggle, s.on ? test : null),
    );
  };
  void draw();
  return section;
}

/** A one-tap offer (after finishing a daily). Hidden once it's on, refused or dismissed. */
export function pushOffer(): HTMLElement | null {
  if (!pushSupported() || needsHomeScreen() || onHere.get() || Notification.permission === 'denied') return null;
  if (Date.now() - dismissed.get() < 14 * 864e5) return null;
  const yes = h('button', { class: 'btn primary' }, 'Notify me') as HTMLButtonElement;
  const no = h('button', { class: 'btn' }, 'No thanks');
  const box = h('div', { class: 'notice push-offer' }, '🔔 Want a notification when tomorrow’s puzzle is ready? ', yes, ' ', no);
  no.addEventListener('click', () => (dismissed.set(Date.now()), box.remove()));
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    try {
      await enablePush(9);
      mount(box, '🔔 Done. You’ll get one around 9 am when a new daily is out. Change the time or turn it off on your account page.');
    } catch (e) {
      toast('Couldn’t turn on notifications', errorText(e), 'bad');
      yes.disabled = false;
    }
  });
  return box;
}
