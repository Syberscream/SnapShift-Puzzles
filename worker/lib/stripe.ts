// Minimal Stripe client (REST + webhook signatures) using fetch and Web Crypto.

import type { Env } from '../env';
import { fail } from './util';

type Params = Record<string, string | number | boolean | null | undefined>;

export function stripeEnabled(env: Env): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/** Call the Stripe API. `params` use Stripe's bracket form, e.g. {'line_items[0][price]': 'price_…'}. */
export async function stripe<T = Record<string, unknown>>(env: Env, method: 'GET' | 'POST', path: string, params: Params = {}): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) fail(503, 'Payments are not set up yet.');
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) form.append(k, String(v));
  const base = (env.STRIPE_BASE_URL || 'https://api.stripe.com').replace(/\/$/, '');
  const url = `${base}/v1/${path}${method === 'GET' && form.size ? `?${form}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? form : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    console.error('[stripe]', path, res.status, data.error?.message);
    fail(502, `Payment provider error: ${data.error?.message ?? res.status}`);
  }
  return data;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Check a webhook's Stripe-Signature header (t=…,v1=…) against the raw body.
 * Rejects signatures older than 5 minutes.
 */
export async function verifyStripeSignature(secret: string, payload: string, header: string, nowSec = Date.now() / 1000): Promise<boolean> {
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSec - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign a payload the way Stripe does (used by tests and the local fake). */
export async function signStripePayload(secret: string, payload: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `t=${t},v1=${hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))}`;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: { current_period_end?: number }[] };
}

/** End of the paid period in ms (newer Stripe API versions keep it on the subscription item). */
export function periodEnd(sub: StripeSubscription): number | null {
  const s = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return s ? s * 1000 : null;
}
