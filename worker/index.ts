import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env } from './env';
import { loadUser } from './lib/auth';
import auth from './routes/auth';
import catalog from './routes/catalog';
import play from './routes/play';
import stats from './routes/stats';
import admin from './routes/admin';
import timeAttack from './routes/timeattack';
import billing from './routes/billing';
import plus from './routes/plus';
import challenges from './routes/challenges';
import events from './routes/events';
import slider from './routes/slider';
import seo from './routes/seo';
import invites from './routes/invites';
import push from './routes/push';
import portal from './routes/portal';
import { sendDailyPushes } from './lib/push';
import { settleEventPrizes } from './lib/rewards';
import { runPipeline } from './pipeline/pipeline';
import { sendStreakReminders } from './lib/reminders';

const app = new Hono<AppEnv>();

app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});
app.use('/api/*', loadUser);

app.route('/api/auth', auth);
app.route('/api/plays', play);
app.route('/api/admin', admin);
app.route('/api/time-attack', timeAttack);
app.route('/api/billing', billing);
app.route('/api/plus', plus);
app.route('/api/challenges', challenges);
app.route('/api/invites', invites);
app.route('/api/push', push);
app.route('/api/portal', portal);
app.route('/api/events', events);
app.route('/api/slider', slider);
app.route('/api', catalog);
app.route('/', seo);
app.route('/api', stats);

app.get('/api/health', (c) => c.json({ ok: true }));
app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

/** Puzzle images and thumbnails from R2. */
app.get('/media/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/media/'.length));
  if (!key || key.includes('..')) return c.notFound();
  const obj = await c.env.MEDIA.get(key, { onlyIf: c.req.raw.headers, range: c.req.raw.headers });
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runPipeline(env).then(
        (log) => log.length && console.log('[pipeline]', log.join('\n')),
        (e) => console.error('[pipeline] error', e),
      ),
    );
    ctx.waitUntil(
      sendStreakReminders(env).then(
        (log) => log.length && console.log('[reminders]', log.join('\n')),
        (e) => console.error('[reminders] error', e),
      ),
    );
    ctx.waitUntil(
      sendDailyPushes(env).then(
        (log) => log.length && console.log('[push]', log.join('\n')),
        (e) => console.error('[push] error', e),
      ),
    );
    ctx.waitUntil(settleEventPrizes(env).catch((e) => console.error('[events] prizes', e)));
  },
} satisfies ExportedHandler<Env>;
