import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAdmin } from '../lib/auth';
import { media, type PuzzleRow } from '../lib/catalog';
import { creditStatements } from '../lib/points';
import { body, dayKey, fail, getSetting, int, now, putSetting, randomId, slugify, str } from '../lib/util';
import { SITE_DEFAULTS } from './catalog';
import { addPendingPuzzle, GENERATION_DEFAULTS, queueJob, runPipeline, type GenerationSettings } from '../pipeline/pipeline';
import { pickIdea, titleFromPrompt, PUZZLE_SUFFIX } from '../pipeline/prompts';
import { rng, randomSeed } from '../../shared/engine';

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
  };
}

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
  return c.json({ puzzles: results.map(adminPuzzle) });
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
  const maxSort = await c.env.DB.prepare("SELECT COALESCE(MAX(sort), -1) AS m FROM puzzles WHERE category_id = ? AND status = 'published'")
    .bind(categoryId)
    .first<{ m: number }>();
  const sort = p.status === 'published' && p.category_id === categoryId ? p.sort : (maxSort?.m ?? -1) + 1;
  // Clean up previous web copies if re-publishing.
  for (const k of [p.image_key, p.thumb_key]) if (k) await c.env.MEDIA.delete(k);
  await c.env.DB.prepare(
    `UPDATE puzzles SET status = 'published', slug = ?, title = ?, description = ?, category_id = ?, image_key = ?, thumb_key = ?,
     width = ?, height = ?, sort = ?, published_at = COALESCE(published_at, ?) WHERE id = ?`,
  )
    .bind(slug, title, description || p.description, categoryId, imageKey, thumbKey, int(form.get('width')) || null, int(form.get('height')) || null, sort, now(), id)
    .run();
  const out = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first<PuzzleRow>();
  return c.json({ puzzle: adminPuzzle(out!) });
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
    for (const k of [p.original_key, p.image_key, p.thumb_key]) if (k) await c.env.MEDIA.delete(k);
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
  return c.json({ settings, jobs: results, configured: !!c.env.ELEVENLABS_API_KEY, puzzleSuffix: PUZZLE_SUFFIX });
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
  const ids: string[] = [];
  if (custom) {
    const title = str(b.title, 80) || titleFromPrompt(custom);
    const prompt = b.addPuzzleGuidance === false ? custom : `${custom} ${PUZZLE_SUFFIX}`;
    for (let i = 0; i < count; i++) ids.push(await queueJob(c.env, settings, { categoryId, title, prompt }));
  } else {
    if (!categoryId) fail(422, 'Pick a category or write a prompt.');
    const cat = await c.env.DB.prepare('SELECT prompt_hint FROM categories WHERE id = ?').bind(categoryId).first<{ prompt_hint: string }>();
    if (!cat) fail(404, 'Unknown category.');
    const rand = rng(randomSeed());
    for (let i = 0; i < count; i++) ids.push(await queueJob(c.env, settings, { categoryId, ...pickIdea(categoryId, rand, cat.prompt_hint) }));
  }
  const log = await runPipeline(c.env);
  return c.json({ jobs: ids, log });
});

app.post('/generation/run', async (c) => c.json({ log: await runPipeline(c.env) }));

app.post('/generation/jobs/:id/retry', async (c) => {
  await c.env.DB.prepare("UPDATE generation_jobs SET status = 'queued', attempts = 0, error = NULL, updated_at = ? WHERE id = ? AND status = 'failed'")
    .bind(now(), c.req.param('id'))
    .run();
  return c.json({ log: await runPipeline(c.env) });
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
    `INSERT INTO categories (id, name, description, tile_url, sort, generate, prompt_hint) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, tile_url = excluded.tile_url,
       sort = excluded.sort, generate = excluded.generate, prompt_hint = excluded.prompt_hint`,
  )
    .bind(id, name, str(b.description, 300), str(b.tile_url, 300), int(b.sort), b.generate === false ? 0 : 1, str(b.prompt_hint, 300))
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
  return c.json({ today: dayKey(c.env), days: results });
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
    `SELECT id, username, email, role, email_verified, points, supporter_until, created_at, last_login_at FROM users
     ${q ? 'WHERE username LIKE ? OR email LIKE ?' : ''} ORDER BY id DESC LIMIT 50`,
  )
    .bind(...(q ? [`%${q}%`, `%${q}%`] : []))
    .all();
  return c.json({ users: results });
});

app.post('/users/:id/points', async (c) => {
  const b = await body(c);
  const delta = int(b.delta);
  if (!delta) fail(422, 'Enter a non-zero amount.');
  await c.env.DB.batch(creditStatements(c.env, int(c.req.param('id')), delta, 'admin', str(b.note, 120) || null));
  return c.json({ ok: true });
});

app.post('/users/:id/supporter', async (c) => {
  const days = int((await body(c)).days);
  const until = days > 0 ? now() + days * 86400_000 : null;
  await c.env.DB.prepare('UPDATE users SET supporter_until = ? WHERE id = ?').bind(until, int(c.req.param('id'))).run();
  return c.json({ ok: true, supporterUntil: until });
});

app.get('/messages', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM contact_messages ORDER BY handled, created_at DESC LIMIT 100').all();
  return c.json({ messages: results });
});

app.post('/messages/:id/handled', async (c) => {
  await c.env.DB.prepare('UPDATE contact_messages SET handled = 1 WHERE id = ?').bind(int(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.get('/site', async (c) => c.json(await getSetting(c.env, 'site', SITE_DEFAULTS)));
app.put('/site', async (c) => {
  const b = await body(c);
  const next = {
    announcement: str(b.announcement, 300),
    supporterMonthlyUrl: str(b.supporterMonthlyUrl, 300),
    supporterYearlyUrl: str(b.supporterYearlyUrl, 300),
    contactEmail: str(b.contactEmail, 190) || SITE_DEFAULTS.contactEmail,
  };
  await putSetting(c.env, 'site', next);
  return c.json(next);
});

export default app;
