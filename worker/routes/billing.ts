// SnapShift Plus billing with Stripe Checkout, the Stripe customer portal and webhooks.
//
// Stripe is the source of truth: the webhook keeps users.supporter_until in step
// with the subscription (renewals extend it, cancellations let it run out).

import { Hono } from 'hono';
import type { AppEnv, Env, User } from '../env';
import { requireUser } from '../lib/auth';
import { setLifetime, setMemberUntil } from '../lib/membership';
import { periodEnd, stripe, stripeEnabled, verifyStripeSignature, type StripeSubscription } from '../lib/stripe';
import { body, fail, getSetting, now } from '../lib/util';

const app = new Hono<AppEnv>();

export type Plan = 'monthly' | 'yearly' | 'lifetime';
export const PLANS: Plan[] = ['monthly', 'yearly', 'lifetime'];

/** Admin → Site settings → Membership. Price ids come from the Stripe dashboard. */
export interface BillingSettings {
  monthlyPriceId: string;
  yearlyPriceId: string;
  lifetimePriceId: string;
  monthlyLabel: string;
  yearlyLabel: string;
  lifetimeLabel: string;
}
export const BILLING_DEFAULTS: BillingSettings = {
  monthlyPriceId: '',
  yearlyPriceId: '',
  lifetimePriceId: '',
  monthlyLabel: '$2.99 / month',
  yearlyLabel: '$24.99 / year',
  lifetimeLabel: '$49 once',
};

export const getBilling = async (env: Env) => ({ ...BILLING_DEFAULTS, ...(await getSetting<Partial<BillingSettings>>(env, 'billing', {})) });

/** A few days' grace so a slightly late renewal never locks anyone out. */
const GRACE_MS = 3 * 86400_000;

app.get('/plans', async (c) => {
  const b = await getBilling(c.env);
  const on = stripeEnabled(c.env);
  return c.json({
    enabled: on && !!(b.monthlyPriceId || b.yearlyPriceId || b.lifetimePriceId),
    plans: PLANS.map((p) => ({ id: p, label: b[`${p}Label`], available: on && !!b[`${p}PriceId`] })),
  });
});

async function customerFor(env: Env, user: User): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const cust = await stripe<{ id: string }>(env, 'POST', 'customers', { email: user.email, name: user.username, 'metadata[user_id]': user.id });
  await env.DB.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL').bind(cust.id, user.id).run();
  const row = await env.DB.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').bind(user.id).first<{ stripe_customer_id: string }>();
  return row!.stripe_customer_id;
}

const siteUrl = (c: { env: Env; req: { url: string } }) => (c.env.DEV_MODE ? new URL(c.req.url).origin : c.env.APP_URL.replace(/\/$/, ''));

app.post('/checkout', async (c) => {
  const user = requireUser(c);
  const plan = String((await body(c)).plan) as Plan;
  if (!PLANS.includes(plan)) fail(422, 'Pick a plan.');
  if (user.lifetime) fail(409, 'You already have lifetime membership.');
  const b = await getBilling(c.env);
  const price = b[`${plan}PriceId`];
  if (!price) fail(503, 'That plan is not available yet.');
  if (plan !== 'lifetime' && user.stripe_subscription_id && user.supporter_until && user.supporter_until > now()) {
    fail(409, 'You already have a membership. Use “Manage billing” to change it.');
  }
  const customer = await customerFor(c.env, user);
  const base = siteUrl(c);
  const session = await stripe<{ url: string }>(c.env, 'POST', 'checkout/sessions', {
    mode: plan === 'lifetime' ? 'payment' : 'subscription',
    customer,
    client_reference_id: user.id,
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    'metadata[user_id]': user.id,
    'metadata[plan]': plan,
    ...(plan === 'lifetime' ? {} : { 'subscription_data[metadata][user_id]': user.id }),
    allow_promotion_codes: true,
    success_url: `${base}/plus?welcome=1`,
    cancel_url: `${base}/plus`,
  });
  return c.json({ url: session.url });
});

/** Stripe's hosted page to cancel, switch plan or update the card. */
app.post('/portal', async (c) => {
  const user = requireUser(c);
  if (!user.stripe_customer_id) fail(404, 'No billing account yet.');
  const s = await stripe<{ url: string }>(c.env, 'POST', 'billing_portal/sessions', { customer: user.stripe_customer_id, return_url: `${siteUrl(c)}/account` });
  return c.json({ url: s.url });
});

/** Apply a subscription's state to its member. */
export async function applySubscription(env: Env, sub: StripeSubscription): Promise<void> {
  const byMeta = Number(sub.metadata?.user_id) || 0;
  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ? OR stripe_customer_id = ? ORDER BY id = ? DESC LIMIT 1')
    .bind(byMeta, sub.customer, byMeta)
    .first<{ id: number }>();
  if (!row) return;
  const live = ['active', 'trialing', 'past_due'].includes(sub.status);
  const end = periodEnd(sub);
  if (live && end) {
    await env.DB.prepare('UPDATE users SET stripe_subscription_id = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?')
      .bind(sub.id, sub.customer, row.id)
      .run();
    await setMemberUntil(env, row.id, end + GRACE_MS);
  } else {
    // Ended: membership stops now (only if this is the subscription we know about).
    const cur = await env.DB.prepare('SELECT stripe_subscription_id FROM users WHERE id = ?').bind(row.id).first<{ stripe_subscription_id: string | null }>();
    if (cur?.stripe_subscription_id && cur.stripe_subscription_id !== sub.id) return;
    await env.DB.prepare('UPDATE users SET stripe_subscription_id = NULL WHERE id = ?').bind(row.id).run();
    await setMemberUntil(env, row.id, null);
  }
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

app.post('/webhook', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) fail(503, 'Webhook not configured.');
  const raw = await c.req.text();
  if (!(await verifyStripeSignature(secret, raw, c.req.header('stripe-signature') || ''))) fail(400, 'Bad signature.');
  const event = JSON.parse(raw) as StripeEvent;
  // Each event once.
  const fresh = await c.env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)').bind(event.id, event.type, now()).run();
  if (!fresh.meta.changes) return c.json({ received: true, duplicate: true });

  try {
    const o = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const userId = Number(o.client_reference_id) || Number((o.metadata as Record<string, string>)?.user_id);
        if (!userId) break;
        if (o.customer) {
          await c.env.DB.prepare('UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?').bind(o.customer, userId).run();
        }
        if (o.mode === 'payment' && o.payment_status === 'paid') await setLifetime(c.env, userId, true);
        if (o.mode === 'subscription' && o.subscription) {
          await applySubscription(c.env, await stripe<StripeSubscription>(c.env, 'GET', `subscriptions/${o.subscription}`));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(c.env, o as unknown as StripeSubscription);
        break;
      case 'invoice.paid': {
        const subId = (o.subscription as string) || ((o.parent as Record<string, Record<string, string>>)?.subscription_details?.subscription ?? '');
        if (subId) await applySubscription(c.env, await stripe<StripeSubscription>(c.env, 'GET', `subscriptions/${subId}`));
        break;
      }
      case 'charge.refunded': {
        // A refunded lifetime purchase ends lifetime membership.
        const cust = o.customer as string;
        if (cust && o.refunded && !(o.invoice as string)) {
          await c.env.DB.prepare('UPDATE users SET lifetime = 0 WHERE stripe_customer_id = ?').bind(cust).run();
        }
        break;
      }
    }
  } catch (e) {
    // Let Stripe retry later.
    await c.env.DB.prepare('DELETE FROM stripe_events WHERE id = ?').bind(event.id).run();
    throw e;
  }
  return c.json({ received: true });
});

export default app;
