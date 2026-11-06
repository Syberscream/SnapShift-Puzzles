// Time Attack: solve as many small puzzles as possible in 3 minutes.
// The server picks the puzzles and their shuffles, then replays every move
// log when the run ends before it scores anything.

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireUser } from '../lib/auth';
import { DAILY_CATEGORY, media, type PuzzleRow } from '../lib/catalog';
import { balance, creditStatements } from '../lib/points';
import { addDays, body, dayKey, fail, now, randomId, weekOf } from '../lib/util';
import { isSolved, randomSeed, replay, rng, type Action } from '../../shared/engine';
import { TIME_ATTACK, TIME_ATTACK_SETUP as TA_SETUP, timeAttackScore } from '../../shared/rules';

const app = new Hono<AppEnv>();


interface RunRow {
  id: string;
  user_id: number;
  day: string;
  week: string;
  seed: number;
  puzzles: string;
  started_at: number;
  finished_at: number | null;
  solved: number | null;
  moves: number | null;
  score: number | null;
  points: number | null;
}

/** Start a run. Signed-in players get it recorded; guests get puzzles only. */
app.post('/start', async (c) => {
  const user = c.get('user');
  const { results: pool } = await c.env.DB.prepare(
    "SELECT * FROM puzzles WHERE status = 'published' AND category_id IS NOT NULL AND category_id != ? ORDER BY id",
  )
    .bind(DAILY_CATEGORY)
    .all<PuzzleRow>();
  if (pool.length === 0) fail(404, 'No puzzles yet.');
  const seed = randomSeed();
  const rand = rng(seed);
  // Shuffle the pool, repeating it if there are fewer puzzles than a run needs.
  const order: PuzzleRow[] = [];
  while (order.length < TIME_ATTACK.puzzles) {
    const round = [...pool];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    order.push(...round);
  }
  const list = order.slice(0, TIME_ATTACK.puzzles).map((p) => ({ p, seed: Math.floor(rand() * 2 ** 31) + 1 }));

  let runId: string | null = null;
  if (user) {
    runId = randomId(12);
    await c.env.DB.prepare('INSERT INTO time_attack_runs (id, user_id, day, week, seed, puzzles, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(runId, user.id, dayKey(c.env), weekOf(dayKey(c.env)), seed, JSON.stringify(list.map((x) => ({ id: x.p.id, seed: x.seed }))), now())
      .run();
  }
  return c.json({
    runId,
    durationMs: TIME_ATTACK.durationMs,
    rows: TIME_ATTACK.rows,
    cols: TIME_ATTACK.cols,
    puzzles: list.map((x) => ({ slug: x.p.slug, title: x.p.title, image: media(x.p.image_key || x.p.original_key), seed: x.seed })),
  });
});

/**
 * Finish a run. `results[i]` is the move log for puzzle i (in order); a puzzle
 * counts if its log solves it. Logs must replay legally from the server's seeds.
 */
app.post('/:id/finish', async (c) => {
  const user = requireUser(c);
  const run = await c.env.DB.prepare('SELECT * FROM time_attack_runs WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<RunRow>();
  if (!run) fail(404, 'Run not found.');
  if (run.finished_at) fail(409, 'This run is already finished.');
  const t = now();
  const wall = t - run.started_at;
  if (wall > TIME_ATTACK.durationMs + TIME_ATTACK.graceMs) {
    await c.env.DB.prepare('UPDATE time_attack_runs SET finished_at = ?, solved = 0, moves = 0, score = 0, points = 0 WHERE id = ?').bind(t, run.id).run();
    fail(422, 'Time ran out before the run was sent. It was recorded with no score.');
  }
  const b = await body<{ results?: unknown }>(c);
  const results = Array.isArray(b.results) ? (b.results as unknown[]) : [];
  const puzzles = JSON.parse(run.puzzles) as { id: number; seed: number }[];
  if (results.length > puzzles.length) fail(422, 'Too many puzzles.');

  let solved = 0;
  let moves = 0;
  let score = 0;
  for (let i = 0; i < results.length; i++) {
    const log = results[i];
    if (!Array.isArray(log) || log.length > 500) fail(422, `Puzzle ${i + 1}: invalid move list.`);
    const r = replay(puzzles[i].seed, TA_SETUP, log as Action[]);
    if (r.invalidAt !== -1) fail(422, `Puzzle ${i + 1}: move ${r.invalidAt + 1} isn't legal.`);
    if (r.state.hints || r.state.places) fail(422, 'Helpers are not allowed in Time Attack.');
    moves += r.state.moves;
    if (isSolved(r.state)) {
      solved++;
      score += timeAttackScore(r.state.par, r.state.moves);
    }
  }
  // Humanly possible: at least 150 ms per move overall.
  if (moves * 150 > wall + 1000) fail(422, 'Those moves came in faster than a person can play.');

  // Balance points, capped per day across all Time Attack runs.
  const already = await c.env.DB.prepare('SELECT COALESCE(SUM(points), 0) AS n FROM time_attack_runs WHERE user_id = ? AND day = ? AND finished_at IS NOT NULL')
    .bind(user.id, run.day)
    .first<{ n: number }>();
  const points = Math.max(0, Math.min(solved * TIME_ATTACK.pointsPerSolve, TIME_ATTACK.dailyPointsCap - (already?.n ?? 0)));

  const res = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE time_attack_runs SET finished_at = ?, solved = ?, moves = ?, score = ?, points = ? WHERE id = ? AND finished_at IS NULL').bind(
      t,
      solved,
      moves,
      score,
      points,
      run.id,
    ),
    ...creditStatements(c.env, user.id, points, 'timeattack', run.id),
  ]);
  if (!res[0].meta.changes) fail(409, 'This run is already finished.');

  const best = await c.env.DB.prepare('SELECT MAX(score) AS s FROM time_attack_runs WHERE user_id = ? AND week = ? AND finished_at IS NOT NULL')
    .bind(user.id, run.week)
    .first<{ s: number }>();
  const rank = await c.env.DB.prepare(
    `SELECT COUNT(*) + 1 AS r FROM (SELECT user_id, MAX(score) AS s FROM time_attack_runs
       WHERE week = ? AND finished_at IS NOT NULL GROUP BY user_id) WHERE s > ?`,
  )
    .bind(run.week, best?.s ?? score)
    .first<{ r: number }>();
  return c.json({
    solved,
    moves,
    score,
    points,
    pointsCapped: points < solved * TIME_ATTACK.pointsPerSolve,
    bestThisWeek: best?.s ?? score,
    newBest: score >= (best?.s ?? 0) && score > 0,
    rank: rank?.r ?? null,
    balance: await balance(c.env, user.id),
  });
});

/** Weekly leaderboard: each player's best run of the week. */
app.get('/leaderboard', async (c) => {
  const user = c.get('user');
  const q = c.req.query('week') || '';
  const week = /^\d{4}-\d{2}-\d{2}$/.test(q) ? weekOf(q) : weekOf(dayKey(c.env));
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, r.user_id, MAX(r.score) AS score,
       (SELECT r2.solved FROM time_attack_runs r2 WHERE r2.user_id = r.user_id AND r2.week = r.week AND r2.finished_at IS NOT NULL
        ORDER BY r2.score DESC, r2.finished_at ASC LIMIT 1) AS solved,
       COUNT(*) AS runs
     FROM time_attack_runs r JOIN users u ON u.id = r.user_id
     WHERE r.week = ? AND r.finished_at IS NOT NULL
     GROUP BY r.user_id ORDER BY score DESC, MIN(r.finished_at) ASC LIMIT 50`,
  )
    .bind(week)
    .all<{ username: string; user_id: number; score: number; solved: number; runs: number }>();
  let me = null;
  if (user) {
    const mine = await c.env.DB.prepare(
      'SELECT MAX(score) AS score, COUNT(*) AS runs FROM time_attack_runs WHERE user_id = ? AND week = ? AND finished_at IS NOT NULL',
    )
      .bind(user.id, week)
      .first<{ score: number | null; runs: number }>();
    if (mine?.score != null) {
      const r = await c.env.DB.prepare(
        `SELECT COUNT(*) + 1 AS r FROM (SELECT MAX(score) AS s FROM time_attack_runs WHERE week = ? AND finished_at IS NOT NULL GROUP BY user_id) WHERE s > ?`,
      )
        .bind(week, mine.score)
        .first<{ r: number }>();
      me = { score: mine.score, runs: mine.runs, rank: r?.r ?? null };
    }
  }
  return c.json({
    week,
    weekEnds: addDays(week, 6),
    rows: results.map((r, i) => ({ rank: i + 1, username: r.username, score: r.score, solved: r.solved, runs: r.runs, isMe: r.user_id === user?.id })),
    me,
  });
});

export default app;
