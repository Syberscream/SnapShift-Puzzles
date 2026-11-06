import type { Env, User } from '../env';
import { unlockCost } from '../../shared/rules';
import { seedFromString } from '../../shared/engine';
import { dayKey } from './util';

export interface PuzzleRow {
  id: number;
  slug: string;
  category_id: string | null;
  title: string;
  description: string;
  status: string;
  source: string;
  original_key: string;
  image_key: string | null;
  thumb_key: string | null;
  width: number | null;
  height: number | null;
  prompt: string | null;
  model: string | null;
  sort: number;
  created_at: number;
  published_at: number | null;
}

/** Category whose puzzles are only played as daily challenges. */
export const DAILY_CATEGORY = 'daily';

export const media = (key: string | null | undefined) => (key ? `/media/${key}` : '');

export interface PuzzleView {
  id: number;
  slug: string;
  title: string;
  description: string;
  categoryId: string | null;
  index: number;
  image: string;
  thumb: string;
  unlockCost: number;
  unlocked: boolean;
  bestMedal: string | null;
  inProgress: boolean;
}

/** Position of each published puzzle inside its category (drives unlock cost). */
export async function categoryIndexes(env: Env, categoryId: string): Promise<Map<number, number>> {
  const { results } = await env.DB.prepare(
    "SELECT id FROM puzzles WHERE category_id = ? AND status = 'published' ORDER BY sort, id",
  )
    .bind(categoryId)
    .all<{ id: number }>();
  return new Map(results.map((r, i) => [r.id, i]));
}

export async function userPuzzleState(env: Env, user: User | null, puzzleIds: number[]) {
  const unlocked = new Set<number>();
  const best = new Map<number, string>();
  const inProgress = new Set<number>();
  if (!user || puzzleIds.length === 0) return { unlocked, best, inProgress };
  const ids = puzzleIds.join(',');
  const [u, b, p] = await env.DB.batch([
    env.DB.prepare(`SELECT puzzle_id FROM unlocks WHERE user_id = ? AND puzzle_id IN (${ids})`).bind(user.id),
    env.DB.prepare(
      `SELECT puzzle_id, MAX(CASE medal WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END) AS m
       FROM plays WHERE user_id = ? AND completed_at IS NOT NULL AND puzzle_id IN (${ids}) GROUP BY puzzle_id`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT DISTINCT puzzle_id FROM plays WHERE user_id = ? AND completed_at IS NULL AND daily_day IS NULL
       AND actions != '[]' AND puzzle_id IN (${ids})`,
    ).bind(user.id),
  ]);
  for (const r of u.results as { puzzle_id: number }[]) unlocked.add(r.puzzle_id);
  for (const r of b.results as { puzzle_id: number; m: number }[])
    if (r.m) best.set(r.puzzle_id, ['', 'bronze', 'silver', 'gold'][r.m]);
  for (const r of p.results as { puzzle_id: number }[]) inProgress.add(r.puzzle_id);
  return { unlocked, best, inProgress };
}

export function toView(
  p: PuzzleRow,
  index: number,
  state: Awaited<ReturnType<typeof userPuzzleState>>,
  isAdmin = false,
): PuzzleView {
  const cost = unlockCost(index);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    categoryId: p.category_id,
    index,
    image: media(p.image_key || p.original_key),
    thumb: media(p.thumb_key || p.image_key || p.original_key),
    unlockCost: cost,
    unlocked: cost === 0 || isAdmin || state.unlocked.has(p.id),
    bestMedal: state.best.get(p.id) ?? null,
    inProgress: state.inProgress.has(p.id),
  };
}

/** Can this player start a non-daily play of this puzzle? */
export async function canPlay(env: Env, user: User | null, p: PuzzleRow): Promise<boolean> {
  if (p.status !== 'published' || !p.category_id) return user?.role === 'admin';
  if (user?.role === 'admin') return true;
  if (p.category_id === DAILY_CATEGORY) return false; // played through the daily / archive only
  const idx = (await categoryIndexes(env, p.category_id)).get(p.id) ?? 0;
  if (unlockCost(idx) === 0) return true;
  if (!user) return false;
  const row = await env.DB.prepare('SELECT 1 FROM unlocks WHERE user_id = ? AND puzzle_id = ?').bind(user.id, p.id).first();
  return !!row;
}

export interface DailyRow {
  day: string;
  puzzle_id: number;
  seed: number;
}

/**
 * The daily puzzle for a day, picked on first request (never ahead of time):
 *   1. the next unused puzzle in the "Puzzles of the Day" category (in its sort order),
 *   2. otherwise a daily-category puzzle not used in the last 60 days,
 *   3. otherwise any published puzzle not used in the last 60 days, then any at all.
 * Admins can also choose a specific puzzle for a day in Admin → Daily schedule.
 */
export async function getDaily(env: Env, day: string): Promise<{ daily: DailyRow; puzzle: PuzzleRow } | null> {
  let daily = await env.DB.prepare('SELECT * FROM daily_puzzles WHERE day = ?').bind(day).first<DailyRow>();
  if (!daily) {
    if (day > dayKey(env)) return null; // never reveal future dailies
    const seed = seedFromString('daily:' + day);
    const ids = async (sql: string, ...args: unknown[]) =>
      (await env.DB.prepare(sql).bind(...args).all<{ id: number }>()).results.map((r) => r.id);
    const recent = "id NOT IN (SELECT puzzle_id FROM daily_puzzles WHERE day > date(?, '-60 days'))";
    let pick: number | undefined = (
      await ids(
        `SELECT id FROM puzzles WHERE status = 'published' AND category_id = ?
         AND id NOT IN (SELECT puzzle_id FROM daily_puzzles) ORDER BY sort, id LIMIT 1`,
        DAILY_CATEGORY,
      )
    )[0];
    for (const [sql, args] of [
      [`SELECT id FROM puzzles WHERE status = 'published' AND category_id = ? AND ${recent} ORDER BY id`, [DAILY_CATEGORY, day]],
      [`SELECT id FROM puzzles WHERE status = 'published' AND ${recent} ORDER BY id`, [day]],
      ["SELECT id FROM puzzles WHERE status = 'published' ORDER BY id", []],
    ] as [string, unknown[]][]) {
      if (pick !== undefined) break;
      const pool = await ids(sql, ...args);
      if (pool.length) pick = pool[seed % pool.length];
    }
    if (pick === undefined) return null;
    await env.DB.prepare('INSERT OR IGNORE INTO daily_puzzles (day, puzzle_id, seed) VALUES (?, ?, ?)').bind(day, pick, seed).run();
    daily = await env.DB.prepare('SELECT * FROM daily_puzzles WHERE day = ?').bind(day).first<DailyRow>();
    if (!daily) return null;
  }
  const puzzle = await env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(daily.puzzle_id).first<PuzzleRow>();
  return puzzle ? { daily, puzzle } : null;
}

/** How many daily-category puzzles are published and haven't been used as a daily yet. */
export async function dailyPoolLeft(env: Env): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM puzzles WHERE status = 'published' AND category_id = ?
     AND id NOT IN (SELECT puzzle_id FROM daily_puzzles)`,
  )
    .bind(DAILY_CATEGORY)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Current daily streak: consecutive days with a result, ending today or yesterday. */
export async function dailyStreak(env: Env, userId: number, today: string): Promise<{ current: number; best: number; doneToday: boolean }> {
  const { results } = await env.DB.prepare('SELECT day FROM daily_results WHERE user_id = ? ORDER BY day DESC LIMIT 400')
    .bind(userId)
    .all<{ day: string }>();
  const days = results.map((r) => r.day);
  const set = new Set(days);
  const doneToday = set.has(today);
  const prev = (d: string) => {
    const t = new Date(d + 'T12:00:00Z');
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  };
  let cursor = doneToday ? today : prev(today);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = prev(cursor);
  }
  let best = 0;
  let run = 0;
  let last = '';
  for (const d of [...days].sort()) {
    run = last && prev(d) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  return { current, best, doneToday };
}
