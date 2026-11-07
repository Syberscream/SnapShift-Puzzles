// Slider Puzzle: today's shared 4×4 slider (with a leaderboard) and a slider
// on any picture you can play. The server picks the shuffle, then replays the
// move list when the game ends before it counts anything.

import { Hono } from 'hono';
import type { AppEnv, Env, User } from '../env';
import { requireUser } from '../lib/auth';
import { isMember, plusSql } from '../lib/membership';
import { canPlay, DAILY_CATEGORY, imageFields, media, type PuzzleRow } from '../lib/catalog';
import { checkAchievements } from '../lib/rewards';
import { balance, creditStatements } from '../lib/points';
import { body, dayKey, fail, int, msUntilNextDay, now, randomId } from '../lib/util';
import { randomSeed, seedFromString } from '../../shared/engine';
import { PLUS } from '../../shared/rules';
import { isSliderSize, SLIDER, sliderMedal, sliderReplay, sliderSolved, type SliderSize } from '../../shared/slider';

const app = new Hono<AppEnv>();

interface SliderDaily {
  day: string;
  puzzle_id: number;
  seed: number;
}

/** Today's slider picture, chosen on first request from open (free, non-daily) pictures not used for 60 days. */
async function getSliderDaily(env: Env, day: string): Promise<{ d: SliderDaily; p: PuzzleRow } | null> {
  let d = await env.DB.prepare('SELECT day, puzzle_id, seed FROM slider_daily WHERE day = ?').bind(day).first<SliderDaily>();
  if (!d) {
    const pick = async (recentDays: number) =>
      env.DB.prepare(
        `SELECT p.id FROM puzzles p JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'published' AND c.id != ? AND c.members_only = 0 AND COALESCE(p.published_at, 0) <= ?
           AND p.id NOT IN (SELECT puzzle_id FROM slider_daily WHERE day >= date(?, ?))
         ORDER BY p.id`,
      )
        .bind(DAILY_CATEGORY, now() - PLUS.earlyAccessMs, day, `-${recentDays} days`)
        .all<{ id: number }>();
    let { results } = await pick(60);
    if (!results.length) results = (await pick(0)).results;
    if (!results.length) return null;
    const seed = seedFromString('slider:' + day);
    const id = results[seed % results.length].id;
    await env.DB.prepare('INSERT OR IGNORE INTO slider_daily (day, puzzle_id, seed, created_at) VALUES (?, ?, ?, ?)').bind(day, id, seed, now()).run();
    d = await env.DB.prepare('SELECT day, puzzle_id, seed FROM slider_daily WHERE day = ?').bind(day).first<SliderDaily>();
  }
  const p = await env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(d!.puzzle_id).first<PuzzleRow>();
  return p ? { d: d!, p } : null;
}

const pictureOf = (p: PuzzleRow) => ({
  slug: p.slug,
  title: p.title,
  ...imageFields(p),
  thumb: media(p.thumb_key || p.image_key || p.original_key),
  width: p.width,
  height: p.height,
});

async function dailyBoard(env: Env, day: string, user: User | null) {
  const { results } = await env.DB.prepare(
    `SELECT u.username, r.user_id, r.elapsed_ms, r.moves, r.medal, ${plusSql('u')} AS plus
     FROM slider_results r JOIN users u ON u.id = r.user_id
     WHERE r.day = ? ORDER BY r.elapsed_ms ASC, r.moves ASC, r.created_at ASC LIMIT 50`,
  )
    .bind(day)
    .all<{ username: string; user_id: number; elapsed_ms: number; moves: number; medal: string; plus: number }>();
  let me = null;
  if (user) {
    const mine = await env.DB.prepare('SELECT elapsed_ms, moves, medal FROM slider_results WHERE day = ? AND user_id = ?').bind(day, user.id).first<{
      elapsed_ms: number;
      moves: number;
      medal: string;
    }>();
    if (mine) {
      const r = await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM slider_results WHERE day = ? AND (elapsed_ms < ? OR (elapsed_ms = ? AND moves < ?))')
        .bind(day, mine.elapsed_ms, mine.elapsed_ms, mine.moves)
        .first<{ r: number }>();
      me = { elapsedMs: mine.elapsed_ms, moves: mine.moves, medal: mine.medal, rank: r?.r ?? null };
    }
  }
  return {
    rows: results.map((r, i) => ({ rank: i + 1, username: r.username, elapsedMs: r.elapsed_ms, moves: r.moves, medal: r.medal, plus: !!r.plus, isMe: r.user_id === user?.id })),
    me,
  };
}

/** Today's slider: the picture, the leaderboard and your result. */
app.get('/daily', async (c) => {
  const day = dayKey(c.env);
  const t = await getSliderDaily(c.env, day);
  if (!t) fail(404, 'No pictures yet.');
  return c.json({
    day,
    size: SLIDER.dailySize,
    nextInMs: msUntilNextDay(c.env),
    puzzle: pictureOf(t.p),
    leaderboard: await dailyBoard(c.env, day, c.get('user')),
  });
});

/**
 * Start a game: {daily: true} for today's slider, or {slug, size} for any
 * picture you can play. Signed-in players get it recorded; guests get the shuffle only.
 */
app.post('/start', async (c) => {
  const user = c.get('user');
  const b = await body(c);
  const day = dayKey(c.env);
  let p: PuzzleRow | null;
  let size: SliderSize;
  let seed: number;
  let daily: string | null = null;
  if (b.daily) {
    const t = await getSliderDaily(c.env, day);
    if (!t) fail(404, 'No pictures yet.');
    p = t.p;
    size = SLIDER.dailySize;
    seed = t.d.seed;
    daily = day;
  } else {
    size = int(b.size, 0) as SliderSize;
    if (!isSliderSize(size)) fail(422, 'Pick a size.');
    if (size === SLIDER.membersSize && !isMember(user)) fail(403, 'The 5×5 slider is for SnapShift Plus members.');
    p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE slug = ?').bind(String(b.slug ?? '')).first<PuzzleRow>();
    if (!p || !(await canPlay(c.env, user, p))) fail(403, 'Unlock this picture first, or pick another one.');
    seed = randomSeed();
  }
  let gameId: string | null = null;
  if (user) {
    gameId = randomId(12);
    await c.env.DB.prepare(
      'INSERT INTO slider_games (id, user_id, puzzle_id, size, seed, daily_day, local_day, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(gameId, user.id, p!.id, size, seed, daily, day, now())
      .run();
  }
  return c.json({ gameId, size, seed, daily, puzzle: pictureOf(p!) });
});

interface GameRow {
  id: string;
  user_id: number;
  puzzle_id: number;
  size: number;
  seed: number;
  daily_day: string | null;
  local_day: string;
  started_at: number;
  finished_at: number | null;
}

/** Finish: {actions} is every single slide, in order. Time is measured by the server. */
app.post('/:id/finish', async (c) => {
  const user = requireUser(c);
  const g = await c.env.DB.prepare('SELECT * FROM slider_games WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<GameRow>();
  if (!g) fail(404, 'Game not found.');
  if (g.finished_at) fail(409, 'This game is already finished.');
  const b = await body<{ actions?: unknown }>(c);
  const actions = Array.isArray(b.actions) ? b.actions : [];
  if (actions.length > 20_000) fail(422, 'Too many moves.');
  const size = g.size as SliderSize;
  const r = sliderReplay(g.seed, size, actions);
  if (r.invalidAt !== -1) fail(422, `Move ${r.invalidAt + 1} isn't legal.`);
  if (!sliderSolved(r.state)) fail(422, 'The picture isn’t finished yet.');
  const t = now();
  const elapsed = t - g.started_at;
  if (r.state.moves * SLIDER.minMsPerMove > elapsed + 1000) fail(422, 'Those moves came in faster than a person can play.');
  const medal = sliderMedal(size, elapsed);

  // Points: per solve, plus a bonus for today's slider the first time; capped per day.
  const already = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(points), 0) AS n, SUM(daily_day IS NOT NULL AND finished_at IS NOT NULL) AS dailies FROM slider_games WHERE user_id = ? AND local_day = ? AND finished_at IS NOT NULL',
  )
    .bind(user.id, g.local_day)
    .first<{ n: number; dailies: number | null }>();
  const firstDaily = !!g.daily_day && !(already?.dailies ?? 0);
  const want = SLIDER.points[size] + (firstDaily ? SLIDER.dailyBonus : 0);
  const points = Math.max(0, Math.min(want, SLIDER.dailyPointsCap - (already?.n ?? 0)));

  const stmts = [
    c.env.DB.prepare('UPDATE slider_games SET finished_at = ?, elapsed_ms = ?, moves = ?, medal = ?, points = ? WHERE id = ? AND finished_at IS NULL').bind(
      t,
      elapsed,
      r.state.moves,
      medal,
      points,
      g.id,
    ),
    ...creditStatements(c.env, user.id, points, 'slider', g.id),
  ];
  if (g.daily_day) {
    // Keep each player's best (fastest, then fewest moves) for the day.
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO slider_results (day, user_id, game_id, elapsed_ms, moves, medal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, user_id) DO UPDATE SET game_id = excluded.game_id, elapsed_ms = excluded.elapsed_ms, moves = excluded.moves,
           medal = excluded.medal, created_at = excluded.created_at
         WHERE excluded.elapsed_ms < slider_results.elapsed_ms OR (excluded.elapsed_ms = slider_results.elapsed_ms AND excluded.moves < slider_results.moves)`,
      ).bind(g.daily_day, user.id, g.id, elapsed, r.state.moves, medal, t),
    );
  }
  const res = await c.env.DB.batch(stmts);
  if (!res[0].meta.changes) fail(409, 'This game is already finished.');

  const best = await c.env.DB.prepare(
    'SELECT MIN(elapsed_ms) AS ms, MIN(moves) AS moves, COUNT(*) AS n FROM slider_games WHERE user_id = ? AND puzzle_id = ? AND size = ? AND finished_at IS NOT NULL',
  )
    .bind(user.id, g.puzzle_id, size)
    .first<{ ms: number; moves: number; n: number }>();
  return c.json({
    elapsedMs: elapsed,
    moves: r.state.moves,
    medal,
    points,
    pointsCapped: points < want,
    firstDaily,
    best: { elapsedMs: best?.ms ?? elapsed, moves: best?.moves ?? r.state.moves, games: best?.n ?? 1 },
    newBest: (best?.n ?? 1) > 1 && elapsed <= (best?.ms ?? elapsed),
    daily: g.daily_day ? (await dailyBoard(c.env, g.daily_day, user)).me : null,
    achievements: await checkAchievements(c.env, user.id),
    balance: await balance(c.env, user.id),
  });
});

/** The leaderboard for a day's slider (?day=YYYY-MM-DD, default today). */
app.get('/leaderboard', async (c) => {
  const q = c.req.query('day') || '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : dayKey(c.env);
  return c.json({ day, ...(await dailyBoard(c.env, day, c.get('user'))) });
});

export default app;
