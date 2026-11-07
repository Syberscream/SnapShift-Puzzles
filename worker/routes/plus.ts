// SnapShift Plus member features: board frame, medal collection, picture downloads
// and picture requests.

import { Hono } from 'hono';
import type { AppEnv, User } from '../env';
import { requireUser } from '../lib/auth';
import { media } from '../lib/catalog';
import { isMember, monthOf } from '../lib/membership';
import { body, dayKey, fail, now, str } from '../lib/util';
import { FRAMES, PLUS, type Frame } from '../../shared/rules';
import { GENERATION_DEFAULTS, queueJob, runPipeline } from '../pipeline/pipeline';
import { PUZZLE_SUFFIX, titleFromPrompt } from '../pipeline/prompts';
import { getSetting } from '../lib/util';

const app = new Hono<AppEnv>();

function requireMember(user: User): void {
  if (!isMember(user)) fail(403, 'This is a SnapShift Plus feature.');
}

app.put('/frame', async (c) => {
  const user = requireUser(c);
  requireMember(user);
  const frame = String((await body(c)).frame ?? '') as Frame;
  if (!FRAMES.includes(frame)) fail(422, 'Unknown frame.');
  await c.env.DB.prepare('UPDATE users SET frame = ? WHERE id = ?').bind(frame, user.id).run();
  return c.json({ frame });
});

/** Every puzzle you've finished, with your best medal on each difficulty and mode. */
app.get('/medals', async (c) => {
  const user = requireUser(c);
  requireMember(user);
  const { results } = await c.env.DB.prepare(
    `SELECT p.slug, p.title, p.thumb_key, p.image_key, p.original_key, pl.difficulty, pl.mode, pl.daily_day,
       MAX(CASE pl.medal WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END) AS m,
       MAX(pl.completed_at) AS last
     FROM plays pl JOIN puzzles p ON p.id = pl.puzzle_id
     WHERE pl.user_id = ? AND pl.completed_at IS NOT NULL
     GROUP BY p.id, pl.difficulty, pl.mode ORDER BY last DESC LIMIT 1000`,
  )
    .bind(user.id)
    .all<{ slug: string; title: string; thumb_key: string; image_key: string; original_key: string; difficulty: string; mode: string; daily_day: string | null; m: number; last: number }>();
  const byPuzzle = new Map<string, { slug: string; title: string; thumb: string; daily: string | null; results: { difficulty: string; mode: string; medal: string | null }[] }>();
  for (const r of results) {
    let e = byPuzzle.get(r.slug);
    if (!e) {
      e = { slug: r.slug, title: r.title, thumb: media(r.thumb_key || r.image_key || r.original_key), daily: r.daily_day, results: [] };
      byPuzzle.set(r.slug, e);
    }
    e.results.push({ difficulty: r.difficulty, mode: r.mode, medal: ['', 'bronze', 'silver', 'gold'][r.m] || null });
  }
  return c.json({ puzzles: [...byPuzzle.values()] });
});

/** Full-size picture of a puzzle you've finished. */
app.get('/download/:slug', async (c) => {
  const user = requireUser(c);
  requireMember(user);
  const p = await c.env.DB.prepare('SELECT id, slug, original_key FROM puzzles WHERE slug = ?').bind(c.req.param('slug')).first<{ id: number; slug: string; original_key: string }>();
  if (!p) fail(404, 'Puzzle not found.');
  const done = await c.env.DB.prepare('SELECT 1 FROM plays WHERE user_id = ? AND puzzle_id = ? AND completed_at IS NOT NULL LIMIT 1').bind(user.id, p.id).first();
  if (!done && user.role !== 'admin') fail(403, 'Finish this puzzle to download its picture.');
  const obj = await c.env.MEDIA.get(p.original_key);
  if (!obj) fail(404, 'Picture not found.');
  const ext = p.original_key.split('.').pop() || 'png';
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Disposition', `attachment; filename="snapshift-${p.slug}.${ext}"`);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(obj.body, { headers });
});

interface RequestRow {
  id: number;
  idea: string;
  category_id: string | null;
  created_at: number;
  job_status: string | null;
  job_error: string | null;
  puzzle_slug: string | null;
  puzzle_status: string | null;
  puzzle_title: string | null;
}

/** A request's status as the member sees it. */
function requestStatus(r: RequestRow): { status: 'making' | 'review' | 'published' | 'declined' | 'failed'; slug: string | null } {
  if (r.puzzle_status === 'published') return { status: 'published', slug: r.puzzle_slug };
  if (r.puzzle_status === 'rejected') return { status: 'declined', slug: null };
  if (r.puzzle_status === 'pending') return { status: 'review', slug: null };
  if (r.job_status === 'failed') return { status: 'failed', slug: null };
  return { status: 'making', slug: null };
}

app.get('/requests', async (c) => {
  const user = requireUser(c);
  const month = monthOf(dayKey(c.env));
  const [mine, cats] = await Promise.all([
    c.env.DB.prepare(
      `SELECT r.id, r.idea, r.category_id, r.created_at, r.month, j.status AS job_status, j.error AS job_error,
         p.slug AS puzzle_slug, p.status AS puzzle_status, p.title AS puzzle_title
       FROM puzzle_requests r LEFT JOIN generation_jobs j ON j.id = r.job_id LEFT JOIN puzzles p ON p.id = j.puzzle_id
       WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 30`,
    )
      .bind(user.id)
      .all<RequestRow & { month: string }>(),
    c.env.DB.prepare("SELECT id, name FROM categories WHERE id NOT IN ('daily', 'events') ORDER BY sort, name").all<{ id: string; name: string }>(),
  ]);
  const used = mine.results.filter((r) => r.month === month).length;
  return c.json({
    left: isMember(user) ? Math.max(0, PLUS.requestsPerMonth - used) : 0,
    perMonth: PLUS.requestsPerMonth,
    categories: cats.results,
    requests: mine.results.map((r) => ({ id: r.id, idea: r.idea, categoryId: r.category_id, createdAt: r.created_at, title: r.puzzle_title, ...requestStatus(r) })),
  });
});

app.post('/requests', async (c) => {
  const user = requireUser(c);
  requireMember(user);
  const b = await body(c);
  const idea = str(b.idea, 300);
  if (idea.length < 8) fail(422, 'Describe the picture in a few words (at least 8 characters).');
  const categoryId = str(b.categoryId, 40) || 'members';
  const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ? AND id NOT IN ('daily', 'events')").bind(categoryId).first();
  if (!cat) fail(422, 'Pick a category.');
  const month = monthOf(dayKey(c.env));
  const used = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM puzzle_requests WHERE user_id = ? AND month = ?').bind(user.id, month).first<{ n: number }>();
  if ((used?.n ?? 0) >= PLUS.requestsPerMonth) fail(429, `You've used this month's ${PLUS.requestsPerMonth} picture requests. More next month!`);
  const res = await c.env.DB.prepare('INSERT INTO puzzle_requests (user_id, month, idea, category_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, month, idea, categoryId, now())
    .run();
  const requestId = Number(res.meta.last_row_id);
  const settings = await getSetting(c.env, 'generation', GENERATION_DEFAULTS);
  const jobId = await queueJob(c.env, settings, { categoryId, title: titleFromPrompt(idea), prompt: `${idea}. ${PUZZLE_SUFFIX}` });
  await c.env.DB.prepare('UPDATE puzzle_requests SET job_id = ? WHERE id = ?').bind(jobId, requestId).run();
  c.executionCtx.waitUntil(runPipeline(c.env, 'manual').catch((e) => console.error('[pipeline]', e)));
  return c.json({ ok: true, id: requestId });
});

export default app;
