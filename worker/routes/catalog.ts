import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireUser } from '../lib/auth';
import {
  canPlay,
  DAILY_CATEGORY,
  categoryIndexes,
  dailyStreak,
  getDaily,
  media,
  toView,
  userPuzzleState,
  type PuzzleRow,
} from '../lib/catalog';
import { spend, balance } from '../lib/points';
import { dayKey, fail, getSetting, msUntilNextDay, now, str, body } from '../lib/util';
import { unlockCost } from '../../shared/rules';

const app = new Hono<AppEnv>();

interface CategoryRow {
  id: string;
  name: string;
  description: string;
  tile_url: string;
  sort: number;
}

/** Public site settings (supporter links, announcement). */
export const SITE_DEFAULTS = {
  announcement: '',
  supporterMonthlyUrl: '',
  supporterYearlyUrl: '',
  contactEmail: 'contact@snapshiftpuzzles.com',
};

app.get('/site', async (c) => c.json(await getSetting(c.env, 'site', SITE_DEFAULTS)));

app.get('/home', async (c) => {
  const user = c.get('user');
  const today = dayKey(c.env);
  const [cats, counts, latest, daily] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM categories WHERE id != ? ORDER BY sort, name').bind(DAILY_CATEGORY).all<CategoryRow>(),
    c.env.DB.prepare("SELECT category_id, COUNT(*) AS n FROM puzzles WHERE status = 'published' GROUP BY category_id").all<{
      category_id: string;
      n: number;
    }>(),
    c.env.DB.prepare("SELECT * FROM puzzles WHERE status = 'published' AND category_id != ? ORDER BY published_at DESC LIMIT 8").bind(DAILY_CATEGORY).all<PuzzleRow>(),
    getDaily(c.env, today),
  ]);
  const countMap = new Map(counts.results.map((r) => [r.category_id, r.n]));
  const latestState = await userPuzzleState(c.env, user, latest.results.map((p) => p.id));
  const latestViews = await Promise.all(
    latest.results.map(async (p) => {
      const idx = (await categoryIndexes(c.env, p.category_id!)).get(p.id) ?? 0;
      return toView(p, idx, latestState, user?.role === 'admin');
    }),
  );

  let streak = null;
  let dailyResult = null;
  let continuePlays: unknown[] = [];
  if (user) {
    streak = await dailyStreak(c.env, user.id, today);
    dailyResult = await c.env.DB.prepare('SELECT score_pct, elapsed_ms, moves, medal FROM daily_results WHERE day = ? AND user_id = ?')
      .bind(today, user.id)
      .first();
    const { results } = await c.env.DB.prepare(
      `SELECT pl.id, pl.difficulty, pl.daily_day, pl.updated_at, p.slug, p.title, p.thumb_key, p.image_key, p.original_key
       FROM plays pl JOIN puzzles p ON p.id = pl.puzzle_id
       WHERE pl.user_id = ? AND pl.completed_at IS NULL AND pl.actions != '[]'
       ORDER BY pl.updated_at DESC LIMIT 3`,
    )
      .bind(user.id)
      .all<Record<string, string>>();
    continuePlays = results.map((r) => ({
      playId: r.id,
      slug: r.slug,
      title: r.title,
      difficulty: r.difficulty,
      daily: r.daily_day,
      thumb: media(r.thumb_key || r.image_key || r.original_key),
    }));
  }

  return c.json({
    today,
    nextDailyInMs: msUntilNextDay(c.env),
    daily: daily
      ? {
          day: daily.daily.day,
          slug: daily.puzzle.slug,
          title: daily.puzzle.title,
          thumb: media(daily.puzzle.thumb_key || daily.puzzle.image_key || daily.puzzle.original_key),
          categoryId: daily.puzzle.category_id,
        }
      : null,
    dailyResult,
    streak,
    continue: continuePlays,
    categories: cats.results.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      tile: cat.tile_url,
      count: countMap.get(cat.id) ?? 0,
    })),
    latest: latestViews,
  });
});

app.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM puzzles p WHERE p.category_id = c.id AND p.status = 'published') AS count
     FROM categories c WHERE c.id != ? ORDER BY c.sort, c.name`,
  )
    .bind(DAILY_CATEGORY)
    .all<CategoryRow & { count: number }>();
  return c.json({ categories: results.map((r) => ({ id: r.id, name: r.name, description: r.description, tile: r.tile_url, count: r.count })) });
});

app.get('/categories/:id', async (c) => {
  const user = c.get('user');
  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(c.req.param('id')).first<CategoryRow>();
  if (!cat || (cat.id === DAILY_CATEGORY && user?.role !== 'admin')) fail(404, 'Category not found.');
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM puzzles WHERE category_id = ? AND status = 'published' ORDER BY sort, id",
  )
    .bind(cat.id)
    .all<PuzzleRow>();
  const state = await userPuzzleState(c.env, user, results.map((p) => p.id));
  const puzzles = results.map((p, i) => toView(p, i, state, user?.role === 'admin'));
  return c.json({
    category: { id: cat.id, name: cat.name, description: cat.description, tile: cat.tile_url },
    puzzles,
    unlockedCount: puzzles.filter((p) => p.unlocked).length,
    nextDailyInMs: msUntilNextDay(c.env),
  });
});

app.get('/puzzles/:slug', async (c) => {
  const user = c.get('user');
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE slug = ?').bind(c.req.param('slug')).first<PuzzleRow>();
  if (!p || (p.status !== 'published' && user?.role !== 'admin')) fail(404, 'Puzzle not found.');
  if (p.category_id === DAILY_CATEGORY && user?.role !== 'admin') fail(404, 'This picture is a daily puzzle. Find it in the Daily archive.');
  const indexes = p.category_id ? await categoryIndexes(c.env, p.category_id) : new Map<number, number>();
  const idx = indexes.get(p.id) ?? 0;
  const state = await userPuzzleState(c.env, user, [p.id]);
  const view = toView(p, idx, state, user?.role === 'admin');
  const cat = p.category_id
    ? await c.env.DB.prepare('SELECT id, name FROM categories WHERE id = ?').bind(p.category_id).first<{ id: string; name: string }>()
    : null;
  // Next puzzle in the category, for the "next puzzle" button.
  const order = [...indexes.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const nextId = order[order.indexOf(p.id) + 1];
  const next = nextId ? await c.env.DB.prepare('SELECT slug, title FROM puzzles WHERE id = ?').bind(nextId).first() : null;
  let best = null;
  if (user) {
    const { results } = await c.env.DB.prepare(
      `SELECT difficulty, MAX(score_pct) AS score_pct, MIN(elapsed_ms) AS elapsed_ms, MIN(moves) AS moves
       FROM plays WHERE user_id = ? AND puzzle_id = ? AND completed_at IS NOT NULL GROUP BY difficulty`,
    )
      .bind(user.id, p.id)
      .all();
    best = results;
  }
  return c.json({ puzzle: { ...view, width: p.width, height: p.height }, category: cat, next, best });
});

app.post('/puzzles/:slug/unlock', async (c) => {
  const user = requireUser(c);
  const p = await c.env.DB.prepare("SELECT * FROM puzzles WHERE slug = ? AND status = 'published'").bind(c.req.param('slug')).first<PuzzleRow>();
  if (!p || !p.category_id) fail(404, 'Puzzle not found.');
  if (await canPlay(c.env, user, p)) return c.json({ ok: true, alreadyUnlocked: true, points: await balance(c.env, user.id) });
  const idx = (await categoryIndexes(c.env, p.category_id)).get(p.id) ?? 0;
  const cost = unlockCost(idx);
  if (!(await spend(c.env, user.id, cost, 'unlock', p.slug))) fail(402, `You need ${cost} points to unlock this puzzle.`);
  await c.env.DB.prepare('INSERT OR IGNORE INTO unlocks (user_id, puzzle_id, created_at) VALUES (?, ?, ?)').bind(user.id, p.id, now()).run();
  return c.json({ ok: true, cost, points: await balance(c.env, user.id) });
});

app.post('/contact', async (c) => {
  const b = await body(c);
  const name = str(b.name, 80);
  const email = str(b.email, 190);
  const subject = str(b.subject, 140) || 'Message';
  const message = str(b.message, 4000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) fail(422, 'Please fill in your name, email and message.');
  // Light spam guard: max 5 messages per email per day.
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE email = ? AND created_at > ?')
    .bind(email, now() - 86400_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) fail(429, 'Thanks! We already have your messages and will reply soon.');
  await c.env.DB.prepare('INSERT INTO contact_messages (name, email, subject, message, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, email, subject, message, c.get('user')?.id ?? null, now())
    .run();
  return c.json({ ok: true });
});

export default app;
