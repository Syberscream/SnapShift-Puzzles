// Challenge a Friend: share a finished game's exact board by link.

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireUser } from '../lib/auth';
import { DAILY_CATEGORY, media, type PuzzleRow, imageFields } from '../lib/catalog';
import { body, fail, now, randomId } from '../lib/util';
import type { ChallengeRow } from './play';

const app = new Hono<AppEnv>();

/** Turn one of your finished games into a challenge (the same game always gives the same link). */
app.post('/', async (c) => {
  const user = requireUser(c);
  const playId = String((await body(c)).playId ?? '');
  const play = await c.env.DB.prepare('SELECT * FROM plays WHERE id = ? AND user_id = ?').bind(playId, user.id).first<{
    id: string;
    puzzle_id: number;
    seed: number;
    difficulty: string;
    mode: string;
    engine: number;
    daily_day: string | null;
    elapsed_ms: number;
    moves: number;
    medal: string | null;
    score_pct: number | null;
    completed_at: number | null;
  }>();
  if (!play || !play.completed_at) fail(404, 'Finish the puzzle first.');
  if (play.daily_day) fail(422, 'Daily puzzles can’t be challenges; everyone already plays the same board.');
  if (play.mode === 'zen') fail(422, 'Zen games have no clock, so they can’t be challenges.');
  const p = await c.env.DB.prepare('SELECT category_id FROM puzzles WHERE id = ?').bind(play.puzzle_id).first<{ category_id: string }>();
  if (p?.category_id === DAILY_CATEGORY) fail(422, 'This puzzle can’t be a challenge.');
  const existing = await c.env.DB.prepare('SELECT id FROM challenges WHERE play_id = ?').bind(play.id).first<{ id: string }>();
  if (existing) return c.json({ id: existing.id });
  const id = randomId(8);
  await c.env.DB.prepare(
    `INSERT INTO challenges (id, puzzle_id, user_id, play_id, seed, difficulty, mode, engine, elapsed_ms, moves, medal, score_pct, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, play.puzzle_id, user.id, play.id, play.seed, play.difficulty, play.mode, play.engine, play.elapsed_ms, play.moves, play.medal, play.score_pct, now())
    .run();
  return c.json({ id });
});

/** A challenge, who set it and the best results so far. Public, so guests can play it. */
app.get('/:id', async (c) => {
  const user = c.get('user');
  const ch = await c.env.DB.prepare('SELECT c.*, u.username FROM challenges c JOIN users u ON u.id = c.user_id WHERE c.id = ?')
    .bind(c.req.param('id'))
    .first<ChallengeRow & { username: string }>();
  if (!ch) fail(404, 'Challenge not found.');
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(ch.puzzle_id).first<PuzzleRow>();
  if (!p || p.status !== 'published') fail(404, 'That puzzle is no longer available.');
  const cat = p.category_id ? await c.env.DB.prepare('SELECT name FROM categories WHERE id = ?').bind(p.category_id).first<{ name: string }>() : null;
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, r.user_id, r.elapsed_ms, r.moves, r.medal FROM challenge_results r JOIN users u ON u.id = r.user_id
     WHERE r.challenge_id = ? ORDER BY r.elapsed_ms ASC, r.moves ASC LIMIT 20`,
  )
    .bind(ch.id)
    .all<{ username: string; user_id: number; elapsed_ms: number; moves: number; medal: string | null }>();
  return c.json({
    id: ch.id,
    by: ch.username,
    mine: user?.id === ch.user_id,
    seed: ch.seed,
    difficulty: ch.difficulty,
    mode: ch.mode,
    engine: ch.engine,
    elapsedMs: ch.elapsed_ms,
    moves: ch.moves,
    medal: ch.medal,
    puzzle: {
      slug: p.slug,
      title: p.title,
      ...imageFields(p),
      thumb: media(p.thumb_key || p.image_key || p.original_key),
      categoryId: p.category_id,
      categoryName: cat?.name ?? '',
    },
    results: results.map((r) => ({ username: r.username, elapsedMs: r.elapsed_ms, moves: r.moves, medal: r.medal, isMe: r.user_id === user?.id })),
  });
});

export default app;
