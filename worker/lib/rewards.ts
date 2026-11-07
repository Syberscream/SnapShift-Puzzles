// What happens after a game is finished: category collections, events and achievements.

import type { Env } from '../env';
import { DAILY_CATEGORY } from './catalog';
import { creditStatements } from './points';
import { dayKey, now } from './util';
import { ACHIEVEMENT_BY_ID, collectionBonus, COLLECTION_MIN, type Achievement } from '../../shared/achievements';

/** Finished / total puzzles per category for a player (published puzzles only). */
export async function categoryProgress(env: Env, userId: number): Promise<Map<string, { done: number; total: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT p.category_id AS id, COUNT(*) AS total,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM plays pl WHERE pl.user_id = ? AND pl.puzzle_id = p.id AND pl.completed_at IS NOT NULL) THEN 1 ELSE 0 END) AS done
     FROM puzzles p WHERE p.status = 'published' AND p.category_id IS NOT NULL AND p.category_id != ? AND p.category_id != 'events' GROUP BY p.category_id`,
  )
    .bind(userId, DAILY_CATEGORY)
    .all<{ id: string; total: number; done: number }>();
  return new Map(results.map((r) => [r.id, { done: r.done, total: r.total }]));
}

export interface CollectionReward {
  categoryId: string;
  name: string;
  points: number;
}

/** Pay the one-time bonus if this finish completed the puzzle's whole category. */
export async function checkCollection(env: Env, userId: number, categoryId: string | null): Promise<CollectionReward | null> {
  if (!categoryId || categoryId === DAILY_CATEGORY || categoryId === 'events') return null;
  const p = (await categoryProgress(env, userId)).get(categoryId);
  if (!p || p.total < COLLECTION_MIN || p.done < p.total) return null;
  const points = collectionBonus(p.total);
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO collection_rewards (user_id, category_id, points, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, categoryId, points, now())
    .run();
  if (!ins.meta.changes) return null;
  await env.DB.batch(creditStatements(env, userId, points, 'collection', categoryId));
  const cat = await env.DB.prepare('SELECT name FROM categories WHERE id = ?').bind(categoryId).first<{ name: string }>();
  return { categoryId, name: cat?.name ?? categoryId, points };
}

export interface EventRow {
  id: string;
  title: string;
  description: string;
  image_url: string;
  starts: string;
  ends: string;
  bonus: number;
}

/** Events running today. */
export async function activeEvents(env: Env, day = dayKey(env)): Promise<EventRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM events WHERE starts <= ? AND ends >= ? ORDER BY starts').bind(day, day).all<EventRow>();
  return results;
}

/** Is this puzzle part of an event that's on today? (Event puzzles are open to everyone.) */
export async function inActiveEvent(env: Env, puzzleId: number): Promise<boolean> {
  const day = dayKey(env);
  const r = await env.DB.prepare(
    'SELECT 1 FROM event_puzzles ep JOIN events e ON e.id = ep.event_id WHERE ep.puzzle_id = ? AND e.starts <= ? AND e.ends >= ? LIMIT 1',
  )
    .bind(puzzleId, day, day)
    .first();
  return !!r;
}

export interface EventProgress {
  id: string;
  title: string;
  done: number;
  total: number;
  bonus: number | null;
}

/** Record an event finish (best score per puzzle) and pay the bonus once all are done. */
export async function recordEventFinish(
  env: Env,
  userId: number,
  puzzleId: number,
  result: { scorePct: number; elapsedMs: number; medal: string | null },
): Promise<EventProgress[]> {
  const day = dayKey(env);
  const { results: events } = await env.DB.prepare(
    'SELECT e.* FROM events e JOIN event_puzzles ep ON ep.event_id = e.id WHERE ep.puzzle_id = ? AND e.starts <= ? AND e.ends >= ?',
  )
    .bind(puzzleId, day, day)
    .all<EventRow>();
  const out: EventProgress[] = [];
  for (const e of events) {
    await env.DB.prepare(
      `INSERT INTO event_results (event_id, user_id, puzzle_id, score_pct, elapsed_ms, medal, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, user_id, puzzle_id) DO UPDATE SET score_pct = excluded.score_pct, elapsed_ms = excluded.elapsed_ms,
         medal = excluded.medal, updated_at = excluded.updated_at
       WHERE excluded.score_pct > event_results.score_pct
          OR (excluded.score_pct = event_results.score_pct AND excluded.elapsed_ms < event_results.elapsed_ms)`,
    )
      .bind(e.id, userId, puzzleId, result.scorePct, result.elapsedMs, result.medal, now())
      .run();
    const counts = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM event_puzzles WHERE event_id = ?) AS total,
              (SELECT COUNT(*) FROM event_results WHERE event_id = ? AND user_id = ?) AS done`,
    )
      .bind(e.id, e.id, userId)
      .first<{ total: number; done: number }>();
    let bonus: number | null = null;
    if (counts && counts.total > 0 && counts.done >= counts.total) {
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO event_rewards (event_id, user_id, points, created_at) VALUES (?, ?, ?, ?)')
        .bind(e.id, userId, e.bonus, now())
        .run();
      if (ins.meta.changes) {
        bonus = e.bonus;
        if (e.bonus > 0) await env.DB.batch(creditStatements(env, userId, e.bonus, 'event', e.id));
      }
    }
    out.push({ id: e.id, title: e.title, done: counts?.done ?? 0, total: counts?.total ?? 0, bonus });
  }
  return out;
}

/**
 * Work out which achievements a player now has and record the new ones.
 * `extra` adds ones decided by the caller (e.g. 'perfect', 'challenge-win').
 */
export async function checkAchievements(env: Env, userId: number, extra: string[] = []): Promise<Achievement[]> {
  const [stats, have] = await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL) AS finished,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND medal = 'gold') AS golds,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND mode = 'rotation') AS rotations,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND mode = 'zen') AS zens,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'hard' AND mode != 'zen'
            AND hints_paid = 0 AND places_paid = 0) AS hardClean,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'easy' AND mode = 'classic'
            AND elapsed_ms < 60000) AS speedy,
         (SELECT COUNT(*) FROM daily_results WHERE user_id = ?1) AS dailies,
         (SELECT COALESCE(MAX(solved), 0) FROM time_attack_runs WHERE user_id = ?1) AS taBest,
         (SELECT COUNT(*) FROM collection_rewards WHERE user_id = ?1) AS collections,
         (SELECT COUNT(*) FROM event_rewards WHERE user_id = ?1) AS events,
         (SELECT COALESCE(MAX(milestone), 0) FROM streak_rewards WHERE user_id = ?1) AS streakBest,
         (SELECT COUNT(*) FROM slider_games WHERE user_id = ?1 AND finished_at IS NOT NULL) AS sliders,
         (SELECT COUNT(*) FROM slider_games WHERE user_id = ?1 AND finished_at IS NOT NULL AND size = 5) AS sliders5,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'medium') AS mediums,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'hard') AS hards,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'hard' AND medal = 'gold') AS hardGolds,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'easy' AND mode = 'classic' AND elapsed_ms < 30000) AS speedy30,
         (SELECT COUNT(*) FROM plays WHERE user_id = ?1 AND completed_at IS NOT NULL AND difficulty = 'medium' AND mode = 'classic' AND elapsed_ms < 180000) AS mediumFast,
         (SELECT COUNT(DISTINCT p.category_id) FROM plays pl JOIN puzzles p ON p.id = pl.puzzle_id
            WHERE pl.user_id = ?1 AND pl.completed_at IS NOT NULL AND pl.daily_day IS NULL AND p.category_id IS NOT NULL AND p.category_id != 'daily') AS categories,
         (SELECT COUNT(*) FROM daily_results WHERE user_id = ?1 AND medal = 'gold') AS dailyGolds,
         (SELECT COUNT(*) FROM slider_results WHERE user_id = ?1) AS sliderDailies,
         (SELECT COUNT(*) FROM slider_games WHERE user_id = ?1 AND finished_at IS NOT NULL AND size = 4 AND elapsed_ms < 60000) AS sliderFast,
         (SELECT COUNT(*) FROM challenge_results cr JOIN challenges ch ON ch.id = cr.challenge_id
            WHERE cr.user_id = ?1 AND ch.user_id != ?1
              AND ((ABS(cr.elapsed_ms - ch.elapsed_ms) <= 500 AND cr.moves < ch.moves) OR (ABS(cr.elapsed_ms - ch.elapsed_ms) > 500 AND cr.elapsed_ms < ch.elapsed_ms))) AS challengeWins`,
    ).bind(userId),
    env.DB.prepare('SELECT achievement FROM user_achievements WHERE user_id = ?').bind(userId),
  ]);
  const s = (stats.results[0] ?? {}) as Record<string, number>;
  const owned = new Set((have.results as { achievement: string }[]).map((r) => r.achievement));
  const earned = new Set<string>(extra);
  const when = (cond: boolean, id: string) => cond && earned.add(id);
  when(s.finished >= 1, 'first-finish');
  when(s.finished >= 25, 'finish-25');
  when(s.finished >= 100, 'finish-100');
  when(s.golds >= 1, 'gold-1');
  when(s.golds >= 10, 'gold-10');
  when(s.golds >= 50, 'gold-50');
  when(s.rotations >= 5, 'rotation-5');
  when(s.zens >= 10, 'zen-10');
  when(s.hardClean >= 1, 'hard-clean');
  when(s.speedy >= 1, 'speedy');
  when(s.dailies >= 10, 'daily-10');
  when(s.taBest >= 10, 'timeattack-10');
  when(s.collections >= 1, 'collection');
  when(s.events >= 1, 'event');
  when(s.streakBest >= 7, 'streak-7');
  when(s.streakBest >= 30, 'streak-30');
  when(s.sliders >= 1, 'slider-1');
  when(s.sliders5 >= 1, 'slider-5x5');
  when(s.finished >= 10, 'finish-10');
  when(s.finished >= 250, 'finish-250');
  when(s.golds >= 25, 'gold-25');
  when(s.categories >= 5, 'explorer');
  when(s.mediums >= 10, 'medium-10');
  when(s.hards >= 10, 'hard-10');
  when(s.hardGolds >= 1, 'hard-gold');
  when(s.speedy30 >= 1, 'speedy-30');
  when(s.mediumFast >= 1, 'medium-fast');
  when(s.rotations >= 25, 'rotation-25');
  when(s.zens >= 50, 'zen-50');
  when(s.dailies >= 30, 'daily-30');
  when(s.dailyGolds >= 10, 'daily-gold-10');
  when(s.streakBest >= 100, 'streak-100');
  when(s.taBest >= 15, 'timeattack-15');
  when(s.sliders >= 10, 'slider-10');
  when(s.sliderDailies >= 7, 'slider-daily-7');
  when(s.sliderFast >= 1, 'slider-fast');
  when(s.collections >= 3, 'collection-3');
  when(s.challengeWins >= 5, 'challenge-5');
  const fresh = [...earned].filter((id) => !owned.has(id) && ACHIEVEMENT_BY_ID.has(id));
  if (!fresh.length) return [];
  const t = now();
  // Each one is paid once: the reward only goes out if this request inserted the row.
  const got: Achievement[] = [];
  for (const id of fresh) {
    const a = ACHIEVEMENT_BY_ID.get(id)!;
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement, earned_at) VALUES (?, ?, ?)').bind(userId, id, t).run();
    if (!ins.meta.changes) continue;
    if (a.reward) await env.DB.batch(creditStatements(env, userId, a.reward, 'achievement', id));
    got.push(a);
  }
  return got;
}
