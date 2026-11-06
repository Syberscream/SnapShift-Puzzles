// A tiny fake of the parts of Stripe SnapShift uses, for the end-to-end test.
//   node tests/e2e/mock-stripe.mjs <worker base url> <webhook secret>
// Checkout "pay" pages immediately send the webhooks a real payment would and
// redirect back to the site. POST /test/cancel/:sub sends a cancellation.
import http from 'node:http';
import crypto from 'node:crypto';

const WORKER = process.argv[2] || 'http://127.0.0.1:8787';
const SECRET = process.argv[3] || 'whsec_test';
const PORT = 8791;
const customers = new Map();
const sessions = new Map();
const subs = new Map();
let n = 0;
const id = (p) => `${p}_${++n}${Math.random().toString(36).slice(2, 8)}`;

async function sendEvent(type, object) {
  const payload = JSON.stringify({ id: id('evt'), type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
  const r = await fetch(`${WORKER}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
  return r.status;
}

const readForm = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(b))));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith('/v1/') && req.headers.authorization !== 'Bearer sk_test_mock') return json(401, { error: { message: 'Invalid API key' } });
    const f = req.method === 'POST' ? await readForm(req) : {};
    if (req.method === 'POST' && url.pathname === '/v1/customers') {
      const c = { id: id('cus'), email: f.email };
      customers.set(c.id, c);
      return json(200, c);
    }
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const s = { id: id('cs'), ...f };
      sessions.set(s.id, s);
      return json(200, { id: s.id, url: `http://127.0.0.1:${PORT}/pay/${s.id}` });
    }
    if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') return json(200, { url: `${f.return_url}?portal=1` });
    const sm = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/);
    if (req.method === 'GET' && sm) return subs.has(sm[1]) ? json(200, subs.get(sm[1])) : json(404, { error: { message: 'No such subscription' } });
    const pm = url.pathname.match(/^\/pay\/(.+)$/);
    if (pm && sessions.has(pm[1])) {
      const s = sessions.get(pm[1]);
      const obj = { id: s.id, mode: s.mode, customer: s.customer, client_reference_id: s.client_reference_id, metadata: { user_id: s['metadata[user_id]'] }, payment_status: 'paid' };
      if (s.mode === 'subscription') {
        const days = s['line_items[0][price]'].includes('year') ? 365 : 30;
        const sub = { id: id('sub'), status: 'active', customer: s.customer, metadata: { user_id: s['subscription_data[metadata][user_id]'] }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + days * 86400 }] } };
        subs.set(sub.id, sub);
        obj.subscription = sub.id;
      }
      const code = await sendEvent('checkout.session.completed', obj);
      res.writeHead(303, { location: s.success_url, 'x-webhook-status': String(code) });
      return res.end();
    }
    const cm = url.pathname.match(/^\/test\/cancel\/(.+)$/);
    if (cm && subs.has(cm[1])) {
      const sub = { ...subs.get(cm[1]), status: 'canceled' };
      subs.set(sub.id, sub);
      return json(200, { webhook: await sendEvent('customer.subscription.deleted', sub) });
    }
    if (url.pathname === '/test/subs') return json(200, [...subs.values()]);
    if (url.pathname === '/test/raw-event' && req.method === 'POST') {
      // Send an event with a bad signature.
      const r = await fetch(`${WORKER}/api/billing/webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}' });
      return json(200, { status: r.status });
    }
    json(404, { error: { message: 'Not found' } });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock stripe on ${PORT}`));
