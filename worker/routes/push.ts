// Daily puzzle reminders by push notification: sign a device up, change the
// time, turn it off, or send a test.

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { body, dayKey, fail, int, now, str } from '../lib/util';
import { dailyMessage, sendPush, vapidKeys } from '../lib/push';

const app = new Hono<AppEnv>();

app.get('/key', async (c) => c.json({ publicKey: (await vapidKeys(c.env)).publicKey }));

function endpointOf(c: { env: AppEnv['Bindings'] }, v: unknown): string {
  const ep = str(v, 1000);
  let u: URL;
  try {
    u = new URL(ep);
  } catch {
    fail(422, 'That isn’t a push address.');
  }
  if (u.protocol !== 'https:' && !(c.env.DEV_MODE === '1' && u.protocol === 'http:')) fail(422, 'That isn’t a push address.');
  return ep;
}

app.post('/subscribe', async (c) => {
  const b = await body(c);
  const sub = (b.subscription ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = endpointOf(c, sub.endpoint);
  const p256dh = str(sub.keys?.p256dh, 200);
  const auth = str(sub.keys?.auth, 100);
  if (!p256dh || !auth) fail(422, 'That subscription is missing its keys.');
  let tz = str(b.tz, 64) || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const hour = Math.max(0, Math.min(23, int(b.hour, 9)));
  const user = c.get('user');
  await c.env.DB.prepare(
    `INSERT INTO push_subs (endpoint, p256dh, auth, user_id, tz, hour, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
       user_id = COALESCE(excluded.user_id, push_subs.user_id), tz = excluded.tz, hour = excluded.hour, failures = 0`,
  )
    .bind(endpoint, p256dh, auth, user?.id ?? null, tz, hour, now())
    .run();
  return c.json({ ok: true, hour });
});

app.post('/unsubscribe', async (c) => {
  const endpoint = endpointOf(c, (await body(c)).endpoint);
  await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
  return c.json({ ok: true });
});

app.post('/status', async (c) => {
  const endpoint = endpointOf(c, (await body(c)).endpoint);
  const row = await c.env.DB.prepare('SELECT hour FROM push_subs WHERE endpoint = ?').bind(endpoint).first<{ hour: number }>();
  return c.json({ subscribed: !!row, hour: row?.hour ?? 9 });
});

/** Send this device a sample now, so players can see it works. */
app.post('/test', async (c) => {
  const endpoint = endpointOf(c, (await body(c)).endpoint);
  const row = await c.env.DB.prepare('SELECT * FROM push_subs WHERE endpoint = ?')
    .bind(endpoint)
    .first<{ endpoint: string; p256dh: string; auth: string; user_id: number | null }>();
  if (!row) fail(404, 'This device isn’t signed up for reminders.');
  const msg = await dailyMessage(c.env, row.user_id ?? c.get('user')?.id ?? null, dayKey(c.env));
  const r = await sendPush(c.env, row, msg);
  if (r === 'gone') await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
  if (r !== 'ok') fail(502, r === 'gone' ? 'Your browser has turned notifications off for this site.' : 'The notification couldn’t be sent. Try again in a minute.');
  return c.json({ ok: true });
});

export default app;
