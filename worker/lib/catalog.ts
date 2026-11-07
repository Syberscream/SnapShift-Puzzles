import type { Env, User } from '../env';
import { PLUS, unlockCost } from '../../shared/rules';
import { isMember } from './membership';
import { seedFromString } from '../../shared/engine';
import { addDays, dayKey, now } from './util';

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
  /** 1200×630 JPEG for link previews. */
  share_key?: string | null;
  /** Made for this event (joins it when published). */
  event_id?: string | null;
  /** Phone-sized copy (about 1200px wide). */
  small_key?: string | null;
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
/** Pictures made only for events: hidden from the catalogue, playable while their event is on. */
export const EVENT_CATEGORY = 'events';
/** Categories never listed for browsing. */
export const HIDDEN_CATEGORIES_SQL = `('${DAILY_CATEGORY}', '${EVENT_CATEGORY}')`;

export const media = (key: string | null | undefined) => (key ? `/media/${key}` : '');
/** The picture to play, plus the phone-sized copy when there is one. */
export const imageFields = (p: { image_key: string | null; original_key: string; small_key?: string | null }): { image: string; imageSmall: string | null } => ({
  image: media(p.image_key || p.original_key),
  imageSmall: media(p.small_key) || null,
});

export interface PuzzleView {
  id: number;
  slug: string;
  title: string;
  description: string;
  categoryId: string | null;
  index: number;
  image: string;
  imageSmall: string | null;
  thumb: string;
  unlockCost: number;
  unlocked: boolean;
  /** Why it's locked: earn points, members-only category, or members' early access. */
  lock: 'points' | 'members' | 'early' | 'event' | null;
  /** Early access: when everyone can play it (ms). */
  publicAt: number | null;
  /** Finished at least once (any difficulty or mode). */
  finished: boolean;
  /** In an event that's on today. */
  inEvent: boolean;
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
  const finished = new Set<number>();
  if (!user || puzzleIds.length === 0) return { unlocked, best, inProgress, finished };
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
  for (const r of b.results as { puzzle_id: number; m: number }[]) {
    finished.add(r.puzzle_id);
    if (r.m) best.set(r.puzzle_id, ['', 'bronze', 'silver', 'gold'][r.m]);
  }
  for (const r of p.results as { puzzle_id: number }[]) inProgress.add(r.puzzle_id);
  return { unlocked, best, inProgress, finished };
}

/** What the viewer is: drives which puzzles are open to them. */
export interface Viewer {
  user: User | null;
  member: boolean;
  admin: boolean;
}
export const viewerOf = (user: User | null): Viewer => ({ user, member: isMember(user), admin: user?.role === 'admin' });

/** Categories only members can play. */
export async function membersOnlyCategories(env: Env): Promise<Set<string>> {
  const { results } = await env.DB.prepare('SELECT id FROM categories WHERE members_only = 1').all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

/** Still in members' early access? Returns when it opens to everyone, else null. */
export function earlyUntil(p: Pick<PuzzleRow, 'published_at'>, t = now()): number | null {
  const open = (p.published_at ?? 0) + PLUS.earlyAccessMs;
  return open > t ? open : null;
}

/** Puzzles in an event that's on today: open to everyone while it runs. */
export async function activeEventPuzzleIds(env: Env, day = dayKey(env)): Promise<Set<number>> {
  const { results } = await env.DB.prepare(
    'SELECT ep.puzzle_id AS id FROM event_puzzles ep JOIN events e ON e.id = ep.event_id WHERE e.starts <= ? AND e.ends >= ?',
  )
    .bind(day, day)
    .all<{ id: number }>();
  return new Set(results.map((r) => r.id));
}

/** Is this (non-daily) puzzle open to the viewer, and if not, why? */
export function access(
  p: PuzzleRow,
  index: number,
  viewer: Viewer,
  membersOnly: boolean,
  unlockedByPoints: boolean,
  inEvent = false,
): { unlocked: boolean; lock: PuzzleView['lock']; publicAt: number | null } {
  // The free first puzzle of a category is never held back.
  if (p.category_id === EVENT_CATEGORY && !viewer.admin) {
    return inEvent ? { unlocked: true, lock: null, publicAt: null } : { unlocked: false, lock: 'event', publicAt: null };
  }
  const early = membersOnly || index === 0 ? null : earlyUntil(p);
  if (viewer.admin || viewer.member) return { unlocked: true, lock: null, publicAt: early };
  if (membersOnly) return { unlocked: false, lock: 'members', publicAt: null };
  if (inEvent) return { unlocked: true, lock: null, publicAt: null };
  if (early) return { unlocked: false, lock: 'early', publicAt: early };
  if (unlockCost(index) === 0 || unlockedByPoints) return { unlocked: true, lock: null, publicAt: null };
  return { unlocked: false, lock: 'points', publicAt: null };
}

export function toView(
  p: PuzzleRow,
  index: number,
  state: Awaited<ReturnType<typeof userPuzzleState>>,
  viewer: Viewer,
  membersOnly = false,
  eventIds: Set<number> = new Set(),
): PuzzleView {
  const cost = unlockCost(index);
  const a = access(p, index, viewer, membersOnly, state.unlocked.has(p.id), eventIds.has(p.id));
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    categoryId: p.category_id,
    index,
    ...imageFields(p),
    thumb: media(p.thumb_key || p.image_key || p.original_key),
    unlockCost: cost,
    unlocked: a.unlocked,
    lock: a.lock,
    publicAt: a.publicAt,
    finished: state.finished.has(p.id),
    inEvent: eventIds.has(p.id),
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
  const membersOnly = (await membersOnlyCategories(env)).has(p.category_id);
  const paid = user ? !!(await env.DB.prepare('SELECT 1 FROM unlocks WHERE user_id = ? AND puzzle_id = ?').bind(user.id, p.id).first()) : false;
  return access(p, idx, viewerOf(user), membersOnly, paid, (await activeEventPuzzleIds(env)).has(p.id)).unlocked;
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

/** Free players can play the archive this many days back; members can play all of it. */
export function archiveOpen(day: string, today: string, member: boolean): boolean {
  return member || day > addDays(today, -PLUS.freeArchiveDays);
}

/**
 * Current daily streak: consecutive days with a result, ending today or yesterday.
 * Days covered by a member's streak freeze keep the streak going but don't add to it.
 */
export async function dailyStreak(env: Env, userId: number, today: string): Promise<{ current: number; best: number; doneToday: boolean }> {
  const [played, frozen] = await env.DB.batch([
    env.DB.prepare('SELECT day FROM daily_results WHERE user_id = ? ORDER BY day DESC LIMIT 400').bind(userId),
    env.DB.prepare('SELECT day FROM streak_freezes WHERE user_id = ? ORDER BY day DESC LIMIT 100').bind(userId),
  ]);
  const days = (played.results as { day: string }[]).map((r) => r.day);
  const set = new Set(days);
  const freeze = new Set((frozen.results as { day: string }[]).map((r) => r.day));
  const doneToday = set.has(today);
  const prev = (d: string) => addDays(d, -1);
  let cursor = doneToday ? today : prev(today);
  let current = 0;
  while (set.has(cursor) || freeze.has(cursor)) {
    if (set.has(cursor)) current++;
    cursor = prev(cursor);
  }
  let best = 0;
  let run = 0;
  let last = '';
  for (const d of [...days].sort()) {
    // A gap made only of frozen days doesn't break the run.
    let p = prev(d);
    while (last && p > last && freeze.has(p)) p = prev(p);
    run = last && p === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  return { current, best, doneToday };
}

/**
 * A member finishing today's daily after missing day(s): spend streak freezes on the
 * missed days just before today, if this month's allowance covers all of them and
 * there was a streak to save. Returns the days frozen.
 */
export async function useStreakFreezes(env: Env, userId: number, today: string): Promise<string[]> {
  const prior = await env.DB.prepare('SELECT MAX(day) AS d FROM daily_results WHERE user_id = ? AND day < ?').bind(userId, today).first<{ d: string | null }>();
  if (!prior?.d) return [];
  const missed: string[] = [];
  for (let d = addDays(today, -1); d > prior.d; d = addDays(d, -1)) missed.push(d);
  if (!missed.length) return [];
  const { results } = await env.DB.prepare('SELECT day FROM streak_freezes WHERE user_id = ? AND day >= ?').bind(userId, missed[missed.length - 1].slice(0, 7) + '-01').all<{ day: string }>();
  const already = new Set(results.map((r) => r.day));
  const need = missed.filter((d) => !already.has(d));
  if (!need.length) return [];
  // Count this month's allowance per calendar month of each missed day.
  const used = new Map<string, number>();
  for (const r of results) used.set(r.day.slice(0, 7), (used.get(r.day.slice(0, 7)) ?? 0) + 1);
  for (const d of need) {
    const m = d.slice(0, 7);
    used.set(m, (used.get(m) ?? 0) + 1);
    if (used.get(m)! > PLUS.streakFreezesPerMonth) return [];
  }
  await env.DB.batch(need.map((d) => env.DB.prepare('INSERT OR IGNORE INTO streak_freezes (user_id, day, created_at) VALUES (?, ?, ?)').bind(userId, d, now())));
  return need;
}

/** Streak freezes left this month. */
export async function freezesLeft(env: Env, userId: number, today: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM streak_freezes WHERE user_id = ? AND day >= ? AND day <= ?')
    .bind(userId, today.slice(0, 7) + '-01', today.slice(0, 7) + '-31')
    .first<{ n: number }>();
  return Math.max(0, PLUS.streakFreezesPerMonth - (r?.n ?? 0));
}
