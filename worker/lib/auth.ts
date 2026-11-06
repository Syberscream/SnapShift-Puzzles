import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { AppEnv, Env, User } from '../env';
import { fail, now, randomId, sha256 } from './util';
import { isMember } from './membership';

const COOKIE = 'ss_session';
const SESSION_DAYS = 30;
// Cloudflare Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Format: pbkdf2$<iterations>$<salt b64>$<hash b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

const USER_COLS = 'u.id, u.email, u.username, u.role, u.email_verified, u.points, u.supporter_until, u.lifetime, u.frame, u.stripe_customer_id, u.stripe_subscription_id, u.created_at';

export async function startSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = randomId(32);
  const expires = now() + SESSION_DAYS * 86400_000;
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, expires, now())
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Middleware: loads the signed-in user (or null) into c.var.user. */
export async function loadUser(c: Context<AppEnv>, next: Next): Promise<void> {
  c.set('user', null);
  const token = getCookie(c, COOKIE);
  if (token) {
    const user = await c.env.DB.prepare(
      `SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
    )
      .bind(await sha256(token), now())
      .first<User>();
    if (user) c.set('user', user);
  }
  await next();
}

export function requireUser(c: Context<AppEnv>): User {
  const u = c.get('user');
  if (!u) fail(401, 'Please sign in.');
  return u;
}

export function requireAdmin(c: Context<AppEnv>): User {
  const u = requireUser(c);
  if (u.role !== 'admin') fail(403, 'Admins only.');
  return u;
}

export function isAdminEmail(env: Env, email: string): boolean {
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export function publicUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    emailVerified: !!u.email_verified,
    points: u.points,
    supporter: isMember(u),
    member: isMember(u),
    memberUntil: u.lifetime ? null : u.supporter_until && u.supporter_until > now() ? u.supporter_until : null,
    lifetime: !!u.lifetime,
    billing: !!u.stripe_customer_id,
    frame: isMember(u) ? u.frame : '',
  };
}
