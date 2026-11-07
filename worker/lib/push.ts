// Web Push for the daily puzzle reminder.
//
// Standard Web Push (RFC 8030) with VAPID sign-in (RFC 8292) and encrypted
// messages (RFC 8291, aes128gcm), all with the Workers' built-in WebCrypto, so
// there are no extra services or keys to set up: the site makes its own VAPID
// key pair the first time it's needed and keeps it in the settings table.

import type { Env } from '../env';
import { dailyStreak } from './catalog';
import { dayKey } from './util';

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

const enc = new TextEncoder();

export const b64url = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
};

// ---------- VAPID keys ----------

interface VapidKeys {
  publicKey: string; // raw uncompressed point, base64url (what browsers want)
  privateJwk: JsonWebKey;
}

let cached: VapidKeys | null = null;

export async function vapidKeys(env: Env): Promise<VapidKeys> {
  if (cached) return cached;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'push_vapid'").first<{ value: string }>();
  if (row) return (cached = JSON.parse(row.value) as VapidKeys);
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const keys: VapidKeys = {
    publicKey: b64url.encode((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    privateJwk: (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey,
  };
  // If two requests race, the first one wins and both use it.
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('push_vapid', ?)").bind(JSON.stringify(keys)).run();
  const saved = await env.DB.prepare("SELECT value FROM settings WHERE key = 'push_vapid'").first<{ value: string }>();
  return (cached = JSON.parse(saved!.value) as VapidKeys);
}

async function vapidHeader(env: Env, endpoint: string): Promise<string> {
  const keys = await vapidKeys(env);
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const admin = (env.ADMIN_EMAILS || '').split(',')[0]?.trim();
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url.encode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: admin ? `mailto:${admin}` : env.APP_URL })),
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url.encode(sig)}, k=${keys.publicKey}`;
}

// ---------- message encryption (RFC 8291) ----------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

export async function encryptPayload(sub: PushSub, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64url.decode(sub.p256dh);
  const authSecret = b64url.decode(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as never, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2])); // 0x02: last (and only) record
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, body);
}

/** Send one notification. 'gone' means the browser has dropped this subscription. */
export async function sendPush(env: Env, sub: PushSub, msg: PushMessage): Promise<'ok' | 'gone' | 'failed'> {
  try {
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(msg)));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidHeader(env, sub.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(12 * 3600),
        Urgency: 'normal',
        ...(msg.tag ? { Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

// ---------- the daily reminder ----------

const PER_RUN = 300;

/** The hour (0–23) in a player's own timezone. */
function hourIn(tz: string, at: number): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(at)));
  } catch {
    return new Date(at).getUTCHours();
  }
}

/** The message for one subscriber: their streak if they have one, else today's puzzle. */
export async function dailyMessage(env: Env, userId: number | null, today: string): Promise<PushMessage> {
  const base = env.APP_URL.replace(/\/$/, '');
  if (userId) {
    const s = await dailyStreak(env, userId, today).catch(() => null);
    if (s && s.current >= 2)
      return { title: `🔥 Keep your ${s.current}-day streak going`, body: 'Today’s SnapShift puzzle is ready. One picture, a few minutes.', url: `${base}/daily`, tag: 'daily' };
  }
  return { title: '🧩 Today’s puzzle is ready', body: 'A new SnapShift daily picture is waiting. Can you get the gold?', url: `${base}/daily`, tag: 'daily' };
}

/**
 * Each run (every 10 minutes): subscribers whose own clock has reached their
 * chosen hour and who haven't had today's reminder (or already played) get one.
 */
export async function sendDailyPushes(env: Env, at = Date.now(), force = false): Promise<string[]> {
  const log: string[] = [];
  const today = dayKey(env, at);
  const { results } = await env.DB.prepare(
    `SELECT s.*, (SELECT 1 FROM daily_results r WHERE r.user_id = s.user_id AND r.day = ?1) AS played
     FROM push_subs s WHERE COALESCE(s.sent_day, '') != ?1 LIMIT 2000`,
  )
    .bind(today)
    .all<PushSub & { user_id: number | null; tz: string; hour: number; played: number | null }>();
  let sent = 0;
  for (const s of results) {
    if (sent >= PER_RUN) break;
    if (!force && hourIn(s.tz, at) < s.hour) continue;
    // Mark first, so a slow or failed send never turns into repeats.
    await env.DB.prepare('UPDATE push_subs SET sent_day = ? WHERE endpoint = ?').bind(today, s.endpoint).run();
    if (s.played) continue;
    const r = await sendPush(env, s, await dailyMessage(env, s.user_id, today));
    sent++;
    if (r === 'gone') await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
    else if (r === 'failed') await env.DB.prepare('UPDATE push_subs SET failures = failures + 1 WHERE endpoint = ?').bind(s.endpoint).run();
    else await env.DB.prepare('UPDATE push_subs SET failures = 0 WHERE endpoint = ?').bind(s.endpoint).run();
    log.push(`${r}: daily push${s.user_id ? ` to user ${s.user_id}` : ' to a guest'}`);
  }
  // Give up on devices that keep failing.
  await env.DB.prepare('DELETE FROM push_subs WHERE failures >= 7').run();
  return log;
}
