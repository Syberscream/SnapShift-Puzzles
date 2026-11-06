import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';

export function fail(status: 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 503, message: string): never {
  throw new HTTPException(status, { message });
}

export async function body<T = Record<string, unknown>>(c: Context<AppEnv>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    fail(400, 'Expected a JSON body.');
  }
}

export function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function int(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function now(): number {
  return Date.now();
}

export function randomId(bytes = 16): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** YYYY-MM-DD for a moment in the site timezone. */
export function dayKey(env: Env, at: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.TIMEZONE || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

export function addDays(day: string, delta: number): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Milliseconds until the daily rolls over in the site timezone. */
export function msUntilNextDay(env: Env, at: number = Date.now()): number {
  const today = dayKey(env, at);
  // Walk forward in 1-minute steps from a coarse guess; cheap and DST-safe.
  let lo = at;
  let hi = at + 26 * 3600_000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(env, mid) === today) lo = mid;
    else hi = mid;
  }
  return hi - at;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 60) || 'puzzle'
  );
}

export async function getSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  if (!row) return fallback;
  try {
    return { ...(fallback as object), ...JSON.parse(row.value) } as T;
  } catch {
    return fallback;
  }
}

export async function putSetting(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value))
    .run();
}

/** Monday (YYYY-MM-DD) of the week containing `day`. */
export function weekOf(day: string): string {
  const back = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -back);
}
