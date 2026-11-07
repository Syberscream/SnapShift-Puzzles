import { Hono } from 'hono';
import type { AppEnv, User } from '../env';
import {
  endSession,
  hashPassword,
  isAdminEmail,
  publicUser,
  requireUser,
  startSession,
  verifyPassword,
} from '../lib/auth';
import { sendEmail } from '../lib/email';
import { body, fail, int, now, randomId, sha256, str } from '../lib/util';

const app = new Hono<AppEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

async function issueEmailToken(c: { env: AppEnv['Bindings'] }, userId: number, kind: 'verify' | 'reset', minutes: number) {
  const token = randomId(24);
  await c.env.DB.prepare('INSERT INTO email_tokens (id, user_id, kind, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, kind, now() + minutes * 60_000)
    .run();
  return token;
}

/** Links point at the site the request came from in development, APP_URL in production. */
function siteUrl(env: AppEnv['Bindings'], reqUrl: string): string {
  return env.DEV_MODE === '1' ? new URL(reqUrl).origin : env.APP_URL;
}

async function sendVerification(env: AppEnv['Bindings'], user: { id: number; email: string }, base: string) {
  const token = await issueEmailToken({ env }, user.id, 'verify', 48 * 60);
  const link = `${base}/account?verify=${token}`;
  const sent = await sendEmail(
    env,
    user.email,
    `Verify your ${env.APP_NAME} account`,
    `Welcome to ${env.APP_NAME}!\n\nConfirm your email address:\n${link}\n\nIf you didn't create this account, ignore this email.`,
  );
  return { sent, link };
}

async function tooManyAttempts(env: AppEnv['Bindings'], keys: string[]): Promise<boolean> {
  const since = now() - 15 * 60_000;
  for (const key of keys) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND ok = 0 AND created_at > ?')
      .bind(key, since)
      .first<{ n: number }>();
    if ((r?.n ?? 0) >= (key.startsWith('ip:') ? 20 : 6)) return true;
  }
  return false;
}

app.get('/me', (c) => {
  const u = c.get('user');
  return c.json({ user: u ? publicUser(u) : null });
});

app.post('/signup', async (c) => {
  const b = await body(c);
  const email = str(b.email, 190).toLowerCase();
  const username = str(b.username, 20);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!EMAIL_RE.test(email)) fail(422, 'Enter a valid email address.');
  if (!USERNAME_RE.test(username)) fail(422, 'Usernames are 3–20 letters, numbers or underscores.');
  if (password.length < 8) fail(422, 'Passwords need at least 8 characters.');

  const clash = await c.env.DB.prepare('SELECT email, username FROM users WHERE email = ? OR username = ?')
    .bind(email, username)
    .first<{ email: string; username: string }>();
  if (clash) fail(409, clash.email.toLowerCase() === email ? 'That email already has an account.' : 'That username is taken.');

  const role = isAdminEmail(c.env, email) ? 'admin' : 'player';
  const res = await c.env.DB.prepare(
    'INSERT INTO users (email, username, password_hash, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(email, username, await hashPassword(password), role, now(), now())
    .run();
  const id = Number(res.meta.last_row_id);
  await startSession(c, id);
  const { sent, link } = await sendVerification(c.env, { id, email }, siteUrl(c.env, c.req.url));
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  return c.json({ user: publicUser(user!), verificationSent: sent, ...(c.env.DEV_MODE === '1' ? { devLink: link } : {}) });
});

app.post('/login', async (c) => {
  const b = await body(c);
  const login = str(b.email, 190).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const ip = c.req.header('cf-connecting-ip') || 'local';
  if (await tooManyAttempts(c.env, [login, 'ip:' + ip])) fail(429, 'Too many attempts. Try again in 15 minutes.');

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? OR username = ?')
    .bind(login, login)
    .first<User & { password_hash: string }>();
  const ok = !!user && (await verifyPassword(password, user.password_hash));
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO login_attempts (key, ok, created_at) VALUES (?, ?, ?)').bind(login, ok ? 1 : 0, now()),
    c.env.DB.prepare('INSERT INTO login_attempts (key, ok, created_at) VALUES (?, ?, ?)').bind('ip:' + ip, ok ? 1 : 0, now()),
  ]);
  if (!ok || !user) fail(401, 'Wrong email/username or password.');

  const role = user.role === 'admin' || isAdminEmail(c.env, user.email) ? 'admin' : 'player';
  await c.env.DB.prepare('UPDATE users SET last_login_at = ?, role = ? WHERE id = ?').bind(now(), role, user.id).run();
  await startSession(c, user.id);
  return c.json({ user: publicUser({ ...user, role }) });
});

app.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

app.post('/verify', async (c) => {
  const token = str((await body(c)).token, 200);
  const row = await c.env.DB.prepare("SELECT * FROM email_tokens WHERE id = ? AND kind = 'verify'")
    .bind(await sha256(token))
    .first<{ id: string; user_id: number; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < now()) fail(400, 'That verification link is invalid or has expired.');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id),
    c.env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE id = ?').bind(now(), row.id),
  ]);
  return c.json({ ok: true });
});

app.post('/resend-verification', async (c) => {
  const user = requireUser(c);
  if (user.email_verified) return c.json({ ok: true, alreadyVerified: true });
  const { sent, link } = await sendVerification(c.env, user, siteUrl(c.env, c.req.url));
  return c.json({ ok: true, sent, ...(c.env.DEV_MODE === '1' ? { devLink: link } : {}) });
});

app.post('/forgot', async (c) => {
  const email = str((await body(c)).email, 190).toLowerCase();
  const user = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first<{ id: number; email: string }>();
  let devLink: string | undefined;
  if (user) {
    const token = await issueEmailToken(c, user.id, 'reset', 60);
    devLink = `${siteUrl(c.env, c.req.url)}/account?reset=${token}`;
    await sendEmail(
      c.env,
      user.email,
      `Reset your ${c.env.APP_NAME} password`,
      `Someone asked to reset your password.\n\nChoose a new one here (valid for 1 hour):\n${devLink}\n\nIf this wasn't you, ignore this email.`,
    );
  }
  // Same answer whether or not the email exists.
  return c.json({ ok: true, ...(c.env.DEV_MODE === '1' && devLink ? { devLink } : {}) });
});

app.post('/reset', async (c) => {
  const b = await body(c);
  const token = str(b.token, 200);
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 8) fail(422, 'Passwords need at least 8 characters.');
  const row = await c.env.DB.prepare("SELECT * FROM email_tokens WHERE id = ? AND kind = 'reset'")
    .bind(await sha256(token))
    .first<{ id: string; user_id: number; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < now()) fail(400, 'That reset link is invalid or has expired.');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').bind(await hashPassword(password), row.user_id),
    c.env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE id = ?').bind(now(), row.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
  ]);
  await startSession(c, row.user_id);
  return c.json({ ok: true });
});

/** Email preferences: {remindStreak}. */
app.put('/preferences', async (c) => {
  const user = requireUser(c);
  const b = await body(c);
  if (typeof b.remindStreak === 'boolean') {
    if (b.remindStreak && !user.email_verified) fail(422, 'Verify your email address first, then turn reminders on.');
    await c.env.DB.prepare('UPDATE users SET remind_streak = ?, unsub_token = COALESCE(unsub_token, ?) WHERE id = ?')
      .bind(b.remindStreak ? 1 : 0, randomId(16), user.id)
      .run();
  }
  return c.json({ ok: true });
});

/** One-click unsubscribe from reminder emails (link in every reminder). */
app.get('/unsubscribe', async (c) => {
  const u = int(c.req.query('u'));
  const t = c.req.query('t') || '';
  if (u && t) await c.env.DB.prepare('UPDATE users SET remind_streak = 0 WHERE id = ? AND unsub_token = ?').bind(u, t).run();
  return c.redirect('/account?unsubscribed=1');
});
app.post('/unsubscribe', async (c) => {
  // RFC 8058 one-click (List-Unsubscribe-Post).
  const u = int(c.req.query('u'));
  const t = c.req.query('t') || '';
  if (u && t) await c.env.DB.prepare('UPDATE users SET remind_streak = 0 WHERE id = ? AND unsub_token = ?').bind(u, t).run();
  return c.json({ ok: true });
});

app.post('/password', async (c) => {
  const user = requireUser(c);
  const b = await body(c);
  const current = typeof b.current === 'string' ? b.current : '';
  const next = typeof b.next === 'string' ? b.next : '';
  if (next.length < 8) fail(422, 'Passwords need at least 8 characters.');
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) fail(401, 'Your current password is wrong.');
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), user.id).run();
  return c.json({ ok: true });
});

export default app;
