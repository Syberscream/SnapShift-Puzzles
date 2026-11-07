import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAdmin } from '../lib/auth';
import { dailyPoolLeft, EVENT_CATEGORY, media, type PuzzleRow } from '../lib/catalog';
import { EVENT_THEMES, splitIdea } from '../pipeline/event-themes';
import { creditStatements } from '../lib/points';
import { body, dayKey, fail, getSetting, int, now, putSetting, randomId, slugify, str } from '../lib/util';
import { cleanBanners, cleanTheme, getSite, SITE_DEFAULTS } from '../lib/site';
import { addPendingPuzzle, GENERATION_DEFAULTS, queueJob, runPipeline, takenTitles, type GenerationSettings, type LastRun } from '../pipeline/pipeline';
import { pickIdea, titleFromPrompt, PUZZLE_SUFFIX, LOOKS, isLook, lookStyle } from '../pipeline/prompts';
import { rng, randomSeed } from '../../shared/engine';
import { BILLING_DEFAULTS, getBilling, type BillingSettings } from './billing';
import { setLifetime } from '../lib/membership';
import { sendStreakReminders } from '../lib/reminders';
import analytics from './analytics';

const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  requireAdmin(c);
  await next();
});

const MAX_UPLOAD = 25 * 1024 * 1024;

function adminPuzzle(p: PuzzleRow) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    categoryId: p.category_id,
    status: p.status,
    source: p.source,
    original: media(p.original_key),
    image: media(p.image_key),
    thumb: media(p.thumb_key || p.image_key || p.original_key),
    width: p.width,
    height: p.height,
    prompt: p.prompt,
    model: p.model,
    sort: p.sort,
    createdAt: p.created_at,
    publishedAt: p.published_at,
    eventId: p.event_id ?? null,
  };
}

app.route('/analytics', analytics);

app.get('/overview', async (c) => {
  const today = dayKey(c.env);
  const q = (sql: string, ...args: unknown[]) => c.env.DB.prepare(sql).bind(...args).first<{ n: number }>();
  const [users, newUsers, playsToday, dailyPlayers, pending, published, queued, failed, messages] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM users'),
    q('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now() - 7 * 86400_000),
    q('SELECT COUNT(*) AS n FROM plays WHERE completed_at > ?', now() - 86400_000),
    q('SELECT COUNT(*) AS n FROM daily_results WHERE day = ?', today),
    q("SELECT COUNT(*) AS n FROM puzzles WHERE status = 'pending'"),
    q("SELECT COUNT(*) AS n FROM puzzles WHERE status = 'published'"),
    q("SELECT COUNT(*) AS n FROM generation_jobs WHERE status IN ('queued','submitting','submitted','downloading')"),
    q("SELECT COUNT(*) AS n FROM generation_jobs WHERE status = 'failed' AND updated_at > ?", now() - 86400_000),
    q('SELECT COUNT(*) AS n FROM contact_messages WHERE handled = 0'),
  ]);
  return c.json({
    users: users?.n,
    newUsers7d: newUsers?.n,
    completions24h: playsToday?.n,
    dailyPlayers: dailyPlayers?.n,
    pending: pending?.n,
    published: published?.n,
    jobsInFlight: queued?.n,
    jobsFailed24h: failed?.n,
    unreadMessages: messages?.n,
    dailyPoolLeft: await dailyPoolLeft(c.env),
    elevenlabsConfigured: !!c.env.ELEVENLABS_API_KEY,
    emailConfigured: !!c.env.RESEND_API_KEY,
  });
});

// ---------- puzzles ----------

app.get('/puzzles', async (c) => {
  const status = ['pending', 'published', 'rejected'].includes(c.req.query('status') || '') ? c.req.query('status')! : 'pending';
  const cat = c.req.query('category');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM puzzles WHERE status = ? ${cat ? 'AND category_id = ?' : ''}
     ORDER BY ${status === 'published' ? 'category_id, sort, id' : 'created_at DESC'} LIMIT 300`,
  )
    .bind(...(cat ? [status, cat] : [status]))
    .all<PuzzleRow>();
  // Members' picture requests behind these puzzles.
  const req = new Map<number, { username: string; idea: string }>();
  if (results.length) {
    const r = await c.env.DB.prepare(
      `SELECT j.puzzle_id, u.username, r.idea FROM puzzle_requests r JOIN generation_jobs j ON j.id = r.job_id JOIN users u ON u.id = r.user_id
       WHERE j.puzzle_id IN (${results.map((p) => p.id).join(',')})`,
    ).all<{ puzzle_id: number; username: string; idea: string }>();
    for (const x of r.results) req.set(x.puzzle_id, { username: x.username, idea: x.idea });
  }
  return c.json({ puzzles: results.map((p) => ({ ...adminPuzzle(p), request: req.get(p.id) ?? null })) });
});

app.patch('/puzzles/:id', async (c) => {
  const id = int(c.req.param('id'));
  const b = await body(c);
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  if (!p) fail(404, 'Not found.');
  const title = b.title !== undefined ? str(b.title, 80) || p.title : p.title;
  const description = b.description !== undefined ? str(b.description, 400) : p.description;
  const categoryId = b.categoryId !== undefined ? str(b.categoryId, 40) || null : p.category_id;
  const sort = b.sort !== undefined ? int(b.sort, p.sort) : p.sort;
  await c.env.DB.prepare('UPDATE puzzles SET title = ?, description = ?, category_id = ?, sort = ? WHERE id = ?')
    .bind(title, description, categoryId, sort, id)
    .run();
  const out = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  return c.json({ puzzle: adminPuzzle(out!) });
});

/**
 * Publish. The admin page resizes the image in the browser and sends a
 * web-sized copy and a thumbnail (WebP), so no paid image service is needed.
 */
app.post('/puzzles/:id/publish', async (c) => {
  const id = int(c.req.param('id'));
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  if (!p) fail(404, 'Not found.');
  const form = await c.req.formData();
  const image = form.get('image');
  const thumb = form.get('thumb');
  const categoryId = str(form.get('categoryId'), 40) || p.category_id;
  const title = str(form.get('title'), 80) || p.title;
  const description = str(form.get('description'), 400);
  if (!categoryId) fail(422, 'Choose a category.');
  if (!(image instanceof File) || !(thumb instanceof File)) fail(422, 'Image and thumbnail are required.');
  const slug = p.slug.startsWith(slugify(title)) ? p.slug : `${slugify(title)}-${id}`;
  const imageKey = `puzzles/${slug}-${randomId(4)}.webp`;
  const thumbKey = `thumbs/${slug}-${randomId(4)}.webp`;
  const meta = { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' };
  await c.env.MEDIA.put(imageKey, await image.arrayBuffer(), { httpMetadata: meta });
  await c.env.MEDIA.put(thumbKey, await thumb.arrayBuffer(), { httpMetadata: meta });
  const small = form.get('small');
  const smallKey = small instanceof File ? `small/${slug}-${randomId(4)}.webp` : null;
  if (small instanceof File) await c.env.MEDIA.put(smallKey!, await small.arrayBuffer(), { httpMetadata: meta });
  const share = form.get('share');
  const shareKey = share instanceof File ? `share/${slug}-${randomId(4)}.jpg` : null;
  if (share instanceof File) await c.env.MEDIA.put(shareKey!, await share.arrayBuffer(), { httpMetadata: { ...meta, contentType: 'image/jpeg' } });
  const maxSort = await c.env.DB.prepare("SELECT COALESCE(MAX(sort), -1) AS m FROM puzzles WHERE category_id = ? AND status = 'published'")
    .bind(categoryId)
    .first<{ m: number }>();
  const sort = p.status === 'published' && p.category_id === categoryId ? p.sort : (maxSort?.m ?? -1) + 1;
  // Clean up previous web copies if re-publishing.
  for (const k of [p.image_key, p.thumb_key, p.small_key, p.share_key]) if (k) await c.env.MEDIA.delete(k);
  await c.env.DB.prepare(
    `UPDATE puzzles SET status = 'published', slug = ?, title = ?, description = ?, category_id = ?, image_key = ?, thumb_key = ?, small_key = ?, share_key = ?,
     width = ?, height = ?, sort = ?, published_at = COALESCE(published_at, ?) WHERE id = ?`,
  )
    .bind(slug, title, description || p.description, categoryId, imageKey, thumbKey, smallKey, shareKey, int(form.get('width')) || null, int(form.get('height')) || null, sort, now(), id)
    .run();
  // Made for an event: it joins that event (at the end) when published.
  if (p.event_id) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO event_puzzles (event_id, puzzle_id, sort)
       SELECT e.id, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM event_puzzles WHERE event_id = e.id) FROM events e WHERE e.id = ?`,
    )
      .bind(id, p.event_id)
      .run();
  }
  const out = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  return c.json({ puzzle: adminPuzzle(out!) });
});

/** Published puzzles that don't have a phone-sized copy yet. */
app.get('/puzzles/needs-small', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, title, image_key, original_key, small_key, share_key FROM puzzles WHERE status = 'published' AND (small_key IS NULL OR share_key IS NULL) ORDER BY id",
  ).all<{ id: number; title: string; image_key: string | null; original_key: string; small_key: string | null; share_key: string | null }>();
  return c.json({
    puzzles: results.map((p) => ({ id: p.id, title: p.title, image: media(p.image_key || p.original_key), needsSmall: !p.small_key, needsShare: !p.share_key })),
  });
});

/** Store a phone-sized copy (made in the admin's browser) for a published puzzle. */
app.post('/puzzles/:id/small', async (c) => {
  const id = int(c.req.param('id'));
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  if (!p) fail(404, 'Not found.');
  const form = await c.req.formData();
  const small = form.get('small');
  const share = form.get('share');
  if (!(small instanceof File && small.size >= 1000) && !(share instanceof File && share.size >= 1000)) fail(422, 'Image required.');
  if (small instanceof File && small.size >= 1000) {
    const key = `small/${p.slug}-${randomId(4)}.webp`;
    await c.env.MEDIA.put(key, await small.arrayBuffer(), { httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' } });
    if (p.small_key) await c.env.MEDIA.delete(p.small_key);
    await c.env.DB.prepare('UPDATE puzzles SET small_key = ? WHERE id = ?').bind(key, id).run();
  }
  if (share instanceof File && share.size >= 1000) {
    const key = `share/${p.slug}-${randomId(4)}.jpg`;
    await c.env.MEDIA.put(key, await share.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
    if (p.share_key) await c.env.MEDIA.delete(p.share_key);
    await c.env.DB.prepare('UPDATE puzzles SET share_key = ? WHERE id = ?').bind(key, id).run();
  }
  return c.json({ ok: true });
});

app.post('/puzzles/:id/reject', async (c) => {
  const id = int(c.req.param('id'));
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  if (!p) fail(404, 'Not found.');
  const inUse = await c.env.DB.prepare('SELECT 1 FROM daily_puzzles WHERE puzzle_id = ? UNION SELECT 1 FROM plays WHERE puzzle_id = ? LIMIT 1')
    .bind(id, id)
    .first();
  if (inUse) {
    // Played before: hide it but keep the files so old results still make sense.
    await c.env.DB.prepare("UPDATE puzzles SET status = 'rejected' WHERE id = ?").bind(id).run();
  } else {
    for (const k of [p.original_key, p.image_key, p.thumb_key, p.small_key, p.share_key]) if (k) await c.env.MEDIA.delete(k);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE generation_jobs SET puzzle_id = NULL WHERE puzzle_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM puzzles WHERE id = ?').bind(id),
    ]);
  }
  return c.json({ ok: true });
});

app.post('/puzzles/:id/unpublish', async (c) => {
  await c.env.DB.prepare("UPDATE puzzles SET status = 'pending' WHERE id = ?").bind(int(c.req.param('id'))).run();
  return c.json({ ok: true });
});

/** Upload your own image into the review queue. */
app.post('/upload', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) fail(422, 'Choose an image file.');
  if (file.size > MAX_UPLOAD) fail(422, 'Images must be under 25 MB.');
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) fail(422, 'Use PNG, JPEG or WebP.');
  const title = str(form.get('title'), 80) || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  const id = await addPendingPuzzle(c.env, {
    title,
    categoryId: str(form.get('categoryId'), 40) || null,
    bytes: await file.arrayBuffer(),
    mimeType: file.type,
    source: 'upload',
  });
  return c.json({ id });
});

// ---------- generation ----------

app.get('/generation', async (c) => {
  const settings = await getSetting(c.env, 'generation', GENERATION_DEFAULTS);
  const { results } = await c.env.DB.prepare('SELECT * FROM generation_jobs ORDER BY created_at DESC LIMIT 60').all();
  const counts = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM generation_jobs WHERE auto = 1 AND created_at > ? AND status != 'failed') AS started24h,
            (SELECT COUNT(*) FROM generation_jobs WHERE auto = 0 AND created_at > ? AND status != 'failed') AS manual24h,
            (SELECT COUNT(*) FROM puzzles WHERE status = 'pending') AS waiting,
            (SELECT COUNT(*) FROM generation_jobs WHERE status IN ('queued','submitting','submitted','downloading')) AS inflight,
            (SELECT COUNT(*) FROM generation_jobs WHERE status = 'failed' AND updated_at > ?) AS failed24h,
            (SELECT COUNT(*) FROM categories WHERE generate = 1 AND id != 'daily') AS openCategories`,
  )
    .bind(now() - 86400_000, now() - 86400_000, now() - 86400_000)
    .first();
  return c.json({ settings, jobs: results, status: counts, lastRun: await getSetting<LastRun | null>(c.env, 'pipeline_last', null), configured: !!c.env.ELEVENLABS_API_KEY, puzzleSuffix: PUZZLE_SUFFIX, looks: LOOKS });
});

app.put('/generation', async (c) => {
  const b = await body<Partial<GenerationSettings>>(c);
  const cur = await getSetting(c.env, 'generation', GENERATION_DEFAULTS);
  const next: GenerationSettings = {
    enabled: b.enabled !== undefined ? !!b.enabled : cur.enabled,
    perDay: Math.max(0, Math.min(100, int(b.perDay, cur.perDay))),
    maxPending: Math.max(1, Math.min(500, int(b.maxPending, cur.maxPending))),
    model: str(b.model, 60) || cur.model,
    options: b.options && typeof b.options === 'object' && !Array.isArray(b.options) ? b.options : cur.options,
    categories: Array.isArray(b.categories) ? b.categories.map((x) => str(x, 40)).filter(Boolean) : cur.categories,
    dailyPoolTarget: b.dailyPoolTarget !== undefined ? Math.max(0, Math.min(365, int(b.dailyPoolTarget, cur.dailyPoolTarget))) : cur.dailyPoolTarget,
    photoShare: b.photoShare !== undefined ? Math.max(0, Math.min(100, int(b.photoShare, 60))) : (cur.photoShare ?? GENERATION_DEFAULTS.photoShare),
  };
  await putSetting(c.env, 'generation', next);
  return c.json({ settings: next });
});

/** Generate now: either a custom prompt or N ideas for a category. */
app.post('/generate', async (c) => {
  const b = await body(c);
  const settings = await getSetting(c.env, 'generation', GENERATION_DEFAULTS);
  const categoryId = str(b.categoryId, 40) || null;
  const custom = str(b.prompt, 2000);
  const count = Math.max(1, Math.min(10, int(b.count, 1)));
  const look = isLook(b.look) ? b.look : 'auto';
  const share = settings.photoShare ?? GENERATION_DEFAULTS.photoShare;
  const ids: string[] = [];
  if (custom) {
    const title = str(b.title, 80) || titleFromPrompt(custom);
    const rand = rng(randomSeed());
    // Several copies of a custom prompt become "Title", "Title 2", … (queueJob makes each unique).
    for (let i = 0; i < count; i++) {
      const style = lookStyle(look, categoryId, rand, share, true);
      const text = style ? `${custom.replace(/[.\s]+$/, '')}, ${style}.` : custom;
      const prompt = b.addPuzzleGuidance === false ? text : `${text} ${PUZZLE_SUFFIX}`;
      ids.push(await queueJob(c.env, settings, { categoryId, title, prompt }));
    }
  } else {
    if (!categoryId) fail(422, 'Pick a category or write a prompt.');
    const cat = await c.env.DB.prepare('SELECT prompt_hint FROM categories WHERE id = ?').bind(categoryId).first<{ prompt_hint: string }>();
    if (!cat) fail(404, 'Unknown category.');
    const rand = rng(randomSeed());
    const taken = await takenTitles(c.env, categoryId);
    for (let i = 0; i < count; i++) ids.push(await queueJob(c.env, settings, { categoryId, ...pickIdea(categoryId, rand, cat.prompt_hint, taken, share, look) }, true));
  }
  const log = await runPipeline(c.env, 'manual');
  return c.json({ jobs: ids, log });
});

app.post('/generation/run', async (c) => c.json({ log: await runPipeline(c.env, 'manual') }));

app.post('/generation/jobs/:id/retry', async (c) => {
  await c.env.DB.prepare("UPDATE generation_jobs SET status = 'queued', attempts = 0, error = NULL, updated_at = ? WHERE id = ? AND status = 'failed'")
    .bind(now(), c.req.param('id'))
    .run();
  return c.json({ log: await runPipeline(c.env, 'manual') });
});

// ---------- categories ----------

app.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM puzzles p WHERE p.category_id = c.id AND p.status = 'published') AS published,
       (SELECT COUNT(*) FROM puzzles p WHERE p.category_id = c.id AND p.status = 'pending') AS pending
     FROM categories c ORDER BY sort, name`,
  ).all();
  return c.json({ categories: results });
});

app.put('/categories/:id', async (c) => {
  const id = slugify(c.req.param('id'));
  const b = await body(c);
  const name = str(b.name, 40);
  if (!name) fail(422, 'Name is required.');
  await c.env.DB.prepare(
    `INSERT INTO categories (id, name, description, tile_url, sort, generate, prompt_hint, members_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, tile_url = excluded.tile_url,
       sort = excluded.sort, generate = excluded.generate, prompt_hint = excluded.prompt_hint, members_only = excluded.members_only`,
  )
    .bind(id, name, str(b.description, 300), str(b.tile_url, 300), int(b.sort), b.generate === false ? 0 : 1, str(b.prompt_hint, 300), b.members_only ? 1 : 0)
    .run();
  return c.json({ ok: true, id });
});

// ---------- daily ----------

app.get('/daily', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.day, p.id AS puzzle_id, p.title, p.slug,
       (SELECT COUNT(*) FROM daily_results r WHERE r.day = d.day) AS players
     FROM daily_puzzles d JOIN puzzles p ON p.id = d.puzzle_id ORDER BY d.day DESC LIMIT 60`,
  ).all();
  return c.json({ today: dayKey(c.env), days: results, poolLeft: await dailyPoolLeft(c.env) });
});

/** Choose a specific puzzle for a future (or today's, if nobody has played it yet) daily. */
app.put('/daily/:day', async (c) => {
  const day = c.req.param('day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(422, 'Use YYYY-MM-DD.');
  if (day < dayKey(c.env)) fail(422, "Past dailies can't be changed.");
  const played = await c.env.DB.prepare('SELECT 1 FROM plays WHERE daily_day = ? LIMIT 1').bind(day).first();
  if (played) fail(409, 'People have already played this daily.');
  const puzzleId = int((await body(c)).puzzleId);
  const p = await c.env.DB.prepare("SELECT id FROM puzzles WHERE id = ? AND status = 'published'").bind(puzzleId).first();
  if (!p) fail(422, 'Pick a published puzzle.');
  const { seedFromString } = await import('../../shared/engine');
  await c.env.DB.prepare('INSERT INTO daily_puzzles (day, puzzle_id, seed) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET puzzle_id = excluded.puzzle_id')
    .bind(day, puzzleId, seedFromString('daily:' + day))
    .run();
  return c.json({ ok: true });
});

// ---------- players, messages, site ----------

app.get('/users', async (c) => {
  const q = str(c.req.query('q'), 100);
  const { results } = await c.env.DB.prepare(
    `SELECT id, username, email, role, email_verified, points, supporter_until, lifetime, stripe_customer_id, stripe_subscription_id, created_at, last_login_at FROM users
     ${q ? 'WHERE username LIKE ? OR email LIKE ?' : ''} ORDER BY id DESC LIMIT 50`,
  )
    .bind(...(q ? [`%${q}%`, `%${q}%`] : []))
    .all();
  return c.json({ users: results });
});

/** Give (or take) points from one player. The note shows in their points history. */
app.post('/users/:id/points', async (c) => {
  const b = await body(c);
  const id = int(c.req.param('id'));
  const delta = int(b.delta);
  if (!delta) fail(422, 'Enter a non-zero amount.');
  if (Math.abs(delta) > 100_000) fail(422, 'That’s more than 100,000 points in one go.');
  const u = await c.env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(id).first<{ points: number }>();
  if (!u) fail(404, 'Player not found.');
  if (u.points + delta < 0) fail(422, `They only have ${u.points} points, so you can take at most ${u.points}.`);
  await c.env.DB.batch(creditStatements(c.env, id, delta, 'admin', str(b.note, 120) || null));
  return c.json({ ok: true, points: u.points + delta });
});

/** Who a group grant goes to. */
const GRANT_GROUPS: Record<string, { label: string; where: string }> = {
  all: { label: 'Everyone', where: '1 = 1' },
  verified: { label: 'Verified emails', where: 'email_verified = 1' },
  active: { label: 'Played in the last 30 days', where: 'id IN (SELECT user_id FROM plays WHERE updated_at > :since)' },
  members: { label: 'Plus members', where: '(lifetime = 1 OR COALESCE(supporter_until, 0) > :now)' },
};

app.get('/points/groups', async (c) => {
  const t = now();
  const out = [];
  for (const [id, g] of Object.entries(GRANT_GROUPS)) {
    const where = g.where.replace(':since', String(t - 30 * 86400_000)).replace(':now', String(t));
    const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${where}`).first<{ n: number }>();
    out.push({ id, label: g.label, count: r?.n ?? 0 });
  }
  return c.json({ groups: out });
});

/** Give the same number of points to a whole group, e.g. a holiday gift or an apology for downtime. */
app.post('/points/grant', async (c) => {
  const b = await body(c);
  const g = GRANT_GROUPS[String(b.group)];
  if (!g) fail(422, 'Pick who gets the points.');
  const amount = int(b.amount);
  if (amount < 1 || amount > 10_000) fail(422, 'Give between 1 and 10,000 points each.');
  const note = str(b.note, 120) || null;
  const t = now();
  const where = g.where.replace(':since', String(t - 30 * 86400_000)).replace(':now', String(t));
  // One batch runs as a single transaction, so both statements see the same group.
  const [ins] = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO points_ledger (user_id, delta, reason, ref, created_at) SELECT id, ?, 'admin', ?, ? FROM users WHERE ${where}`).bind(amount, note, t),
    c.env.DB.prepare(`UPDATE users SET points = points + ? WHERE ${where}`).bind(amount),
  ]);
  return c.json({ ok: true, players: ins.meta.changes, amount });
});

/** Recent points given or taken by admins. */
app.get('/points/recent', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.delta, l.ref, l.created_at, u.username FROM points_ledger l JOIN users u ON u.id = l.user_id
     WHERE l.reason = 'admin' ORDER BY l.id DESC LIMIT 40`,
  ).all();
  return c.json({ rows: results });
});

/** Give (or take away) membership by hand: {days} from now (0 removes), or {lifetime: true|false}. */
app.post('/users/:id/supporter', async (c) => {
  const b = await body(c);
  const id = int(c.req.param('id'));
  if (typeof b.lifetime === 'boolean') {
    await setLifetime(c.env, id, b.lifetime);
    return c.json({ ok: true, lifetime: b.lifetime });
  }
  const days = int(b.days);
  const until = days > 0 ? now() + days * 86400_000 : null;
  await c.env.DB.prepare('UPDATE users SET supporter_until = ? WHERE id = ?').bind(until, id).run();
  return c.json({ ok: true, supporterUntil: until });
});

/** Send any streak reminders that are due now, ignoring the evening start time. */
app.post('/reminders/run', async (c) => c.json({ log: await sendStreakReminders(c.env, Date.now(), true) }));

// ---------- events ----------

app.get('/events', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.*, (SELECT COUNT(*) FROM event_puzzles ep WHERE ep.event_id = e.id) AS puzzles,
       (SELECT COUNT(DISTINCT user_id) FROM event_results r WHERE r.event_id = e.id) AS players
     FROM events e ORDER BY e.starts DESC LIMIT 50`,
  ).all();
  const { results: links } = await c.env.DB.prepare('SELECT event_id, puzzle_id FROM event_puzzles ORDER BY sort').all<{ event_id: string; puzzle_id: number }>();
  return c.json({
    events: results.map((e) => ({ ...e, puzzleIds: links.filter((l) => l.event_id === (e as { id: string }).id).map((l) => l.puzzle_id) })),
  });
});

/** Create or update an event: {title, description, image_url, starts, ends, bonus, puzzleIds}. */
app.put('/events/:id', async (c) => {
  const id = slugify(c.req.param('id'));
  if (!id) fail(422, 'Give the event a short id, like ocean-week.');
  const b = await body(c);
  const title = str(b.title, 80);
  if (!title) fail(422, 'Give the event a title.');
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const starts = day(b.starts);
  const ends = day(b.ends);
  if (!starts || !ends || ends < starts) fail(422, 'Pick a start and end date (the end on or after the start).');
  const ids = Array.isArray(b.puzzleIds) ? [...new Set(b.puzzleIds.map((x) => int(x)).filter((x) => x > 0))].slice(0, 50) : [];
  const difficulty = ['easy', 'medium', 'hard'].includes(String(b.difficulty)) ? String(b.difficulty) : 'medium';
  const mode = b.mode === 'rotation' ? 'rotation' : 'classic';
  const prizes = (Array.isArray(b.prizes) ? b.prizes : [500, 300, 150]).slice(0, 3).map((x) => Math.max(0, Math.min(10000, int(x))));
  const teaser = Math.max(0, Math.min(14, int(b.teaserDays, 3)));
  // Moving the end date into the future (re)opens prizes.
  const reopen = ends >= dayKey(c.env);
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO events (id, title, description, image_url, starts, ends, bonus, difficulty, mode, prizes, teaser_days, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, image_url = excluded.image_url,
         starts = excluded.starts, ends = excluded.ends, bonus = excluded.bonus, difficulty = excluded.difficulty, mode = excluded.mode,
         prizes = excluded.prizes, teaser_days = excluded.teaser_days, prizes_paid_at = ${reopen ? 'NULL' : 'events.prizes_paid_at'}`,
    ).bind(id, title, str(b.description, 400), str(b.image_url, 300), starts, ends, Math.max(0, Math.min(5000, int(b.bonus))), difficulty, mode, JSON.stringify(prizes), teaser, t),
    c.env.DB.prepare('DELETE FROM event_puzzles WHERE event_id = ?').bind(id),
    ...ids.map((pid, i) => c.env.DB.prepare('INSERT OR IGNORE INTO event_puzzles (event_id, puzzle_id, sort) VALUES (?, ?, ?)').bind(id, pid, i)),
  ]);
  return c.json({ ok: true, id });
});

/** Idea packs for event pictures. */
app.get('/events/themes', (c) => c.json({ themes: EVENT_THEMES, looks: LOOKS }));

/**
 * Generate pictures only for this event: one per idea ("Title: what to picture").
 * They go to the review queue in "Event pictures" and join the event when published.
 */
app.post('/events/:id/generate', async (c) => {
  const ev = await c.env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(c.req.param('id')).first<{ id: string }>();
  if (!ev) fail(404, 'Save the event first.');
  const b = await body(c);
  const ideas = (Array.isArray(b.ideas) ? b.ideas : String(b.ideas ?? '').split('\n'))
    .map((x) => str(x, 400).trim())
    .filter(Boolean);
  if (!ideas.length) fail(422, 'Add at least one idea, one per line.');
  if (ideas.length > 30) fail(422, 'Up to 30 pictures at a time.');
  const settings = await getSetting(c.env, 'generation', GENERATION_DEFAULTS);
  const look = isLook(b.look) ? b.look : 'auto';
  const rand = rng(randomSeed());
  const share = settings.photoShare ?? GENERATION_DEFAULTS.photoShare;
  const ids: string[] = [];
  for (const line of ideas) {
    const { title, subject } = splitIdea(line);
    const style = lookStyle(look, EVENT_CATEGORY, rand, share, false);
    const prompt = `${subject.replace(/[.\s]+$/, '')}${style ? `, ${style}` : ''}. ${PUZZLE_SUFFIX}`;
    ids.push(await queueJob(c.env, settings, { categoryId: EVENT_CATEGORY, title, prompt, eventId: ev.id }));
  }
  const log = await runPipeline(c.env, 'manual');
  return c.json({ jobs: ids, log });
});

app.delete('/events/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- membership / billing ----------

app.get('/billing', async (c) => {
  const [settings, members] = await Promise.all([
    getBilling(c.env),
    c.env.DB.prepare(
      `SELECT SUM(lifetime = 1) AS lifetime, SUM(lifetime = 0 AND supporter_until > ? AND stripe_subscription_id IS NOT NULL) AS subscribers,
         SUM(lifetime = 0 AND supporter_until > ? AND stripe_subscription_id IS NULL) AS granted FROM users`,
    )
      .bind(now(), now())
      .first<{ lifetime: number; subscribers: number; granted: number }>(),
  ]);
  return c.json({
    settings,
    stripeKey: !!c.env.STRIPE_SECRET_KEY,
    stripeTestMode: (c.env.STRIPE_SECRET_KEY || '').startsWith('sk_test') || (c.env.STRIPE_SECRET_KEY || '').startsWith('rk_test'),
    webhookSecret: !!c.env.STRIPE_WEBHOOK_SECRET,
    webhookUrl: `${c.env.APP_URL.replace(/\/$/, '')}/api/billing/webhook`,
    members: { lifetime: members?.lifetime ?? 0, subscribers: members?.subscribers ?? 0, granted: members?.granted ?? 0 },
  });
});

app.put('/billing', async (c) => {
  const b = await body(c);
  const cur = await getBilling(c.env);
  const next = { ...cur };
  for (const k of Object.keys(BILLING_DEFAULTS) as (keyof BillingSettings)[]) {
    if (b[k] === undefined) continue;
    const v = str(b[k], k === 'promoText' ? 300 : 120);
    if (k.endsWith('PriceId') && v && !/^price_[A-Za-z0-9]+$/.test(v)) fail(422, 'Price ids look like price_1Abc… (copy them from the Stripe dashboard).');
    next[k] = v;
  }
  await putSetting(c.env, 'billing', next);
  return c.json({ settings: next });
});

app.get('/messages', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM contact_messages ORDER BY handled, created_at DESC LIMIT 100').all();
  return c.json({ messages: results });
});

app.post('/messages/:id/handled', async (c) => {
  await c.env.DB.prepare('UPDATE contact_messages SET handled = 1 WHERE id = ?').bind(int(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.get('/site', async (c) => c.json(await getSite(c.env)));

/** Save any part of the site settings (text, theme, banners); missing parts are kept. */
app.put('/site', async (c) => {
  const b = await body(c);
  const cur = await getSite(c.env);
  const text = (k: 'announcement' | 'supporterMonthlyUrl' | 'supporterYearlyUrl' | 'contactEmail', max: number) =>
    b[k] !== undefined ? str(b[k], max) : cur[k];
  const next = {
    announcement: text('announcement', 300),
    supporterMonthlyUrl: text('supporterMonthlyUrl', 300),
    supporterYearlyUrl: text('supporterYearlyUrl', 300),
    contactEmail: text('contactEmail', 190) || SITE_DEFAULTS.contactEmail,
    analyticsToken: b.analyticsToken !== undefined ? str(b.analyticsToken, 64).replace(/[^a-zA-Z0-9]/g, '') : cur.analyticsToken,
    theme: b.theme !== undefined ? cleanTheme(b.theme as object, cur.theme) : cur.theme,
    banners: b.banners !== undefined ? cleanBanners(b.banners) : cur.banners,
  };
  await putSetting(c.env, 'site', next);
  return c.json(next);
});

/** Upload a background or banner image; returns its URL. */
app.post('/site/image', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) fail(422, 'Choose an image file.');
  if (file.size > 8 * 1024 * 1024) fail(422, 'Images must be under 8 MB.');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
  if (!ext) fail(422, 'Use PNG, JPEG, WebP or GIF.');
  const key = `site/${randomId(8)}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return c.json({ url: media(key) });
});

export default app;
