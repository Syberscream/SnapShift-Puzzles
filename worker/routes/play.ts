import { Hono } from 'hono';
import type { AppEnv, User } from '../env';
import { requireUser } from '../lib/auth';
import { archiveOpen, canPlay, dailyStreak, getDaily, media, useStreakFreezes, type PuzzleRow, imageFields } from '../lib/catalog';
import { isMember } from '../lib/membership';
import { checkAchievements, checkCollection, recordEventFinish } from '../lib/rewards';
import { balance, creditStatements, spend } from '../lib/points';
import { body, dayKey, fail, int, now, randomId } from '../lib/util';
import {
  acceptedElapsed,
  isSolved,
  randomSeed,
  rate,
  replay,
  suggest,
  winPoints,
  type Action,
  type Suggestion,
} from '../../shared/engine';
import {
  DAILY_BONUS,
  DAILY_DIFFICULTY,
  DIFFICULTIES,
  ENGINE_VERSION,
  gameRules,
  MODES,
  REPLAY_FACTOR,
  streakMilestone,
  ZEN_POINTS,
  type Difficulty,
  type EngineVersion,
  type GameSetup,
  type Mode,
} from '../../shared/rules';

const app = new Hono<AppEnv>();

interface PlayRow {
  id: string;
  user_id: number;
  puzzle_id: number;
  difficulty: Difficulty;
  mode: Mode;
  engine: EngineVersion;
  hard_mode: number;
  daily_day: string | null;
  seed: number;
  actions: string;
  elapsed_ms: number;
  started_at: number;
  updated_at: number;
  last_hint_at: number | null;
  hints_paid: number;
  places_paid: number;
  completed_at: number | null;
  moves: number | null;
  score: number | null;
  score_pct: number | null;
  medal: string | null;
  points: number | null;
  challenge_id: string | null;
}

export interface ChallengeRow {
  id: string;
  puzzle_id: number;
  user_id: number;
  play_id: string;
  seed: number;
  difficulty: Difficulty;
  mode: Mode;
  engine: EngineVersion;
  elapsed_ms: number;
  moves: number;
  medal: string | null;
  score_pct: number | null;
  created_at: number;
}

/** A challenger wins on time; within half a second, fewer moves wins. */
export function beats(a: { elapsed_ms: number; moves: number }, b: { elapsed_ms: number; moves: number }): boolean {
  if (Math.abs(a.elapsed_ms - b.elapsed_ms) <= 500) return a.moves < b.moves;
  return a.elapsed_ms < b.elapsed_ms;
}

const MAX_ACTIONS = 5000;

function playView(p: PlayRow) {
  return {
    id: p.id,
    seed: p.seed,
    difficulty: p.difficulty,
    mode: p.mode,
    engine: p.engine,
    hardMode: !!p.hard_mode,
    daily: p.daily_day,
    challenge: p.challenge_id,
    actions: JSON.parse(p.actions) as Action[],
    elapsedMs: p.elapsed_ms,
    completed: !!p.completed_at,
    hintsPaid: p.hints_paid,
    placesPaid: p.places_paid,
    result: p.completed_at
      ? { medal: p.medal, scorePct: p.score_pct, moves: p.moves, elapsedMs: p.elapsed_ms, points: p.points, score: p.score, completedAt: p.completed_at }
      : null,
  };
}

async function loadPlay(c: { env: AppEnv['Bindings'] }, user: User, id: string): Promise<PlayRow> {
  const p = await c.env.DB.prepare('SELECT * FROM plays WHERE id = ? AND user_id = ?').bind(id, user.id).first<PlayRow>();
  if (!p) fail(404, 'Game not found.');
  return p;
}

function parseActions(raw: unknown): Action[] {
  if (!Array.isArray(raw) || raw.length > MAX_ACTIONS) fail(422, 'Invalid move list.');
  return raw as Action[];
}

/**
 * Validate a submitted move log: it must replay cleanly from the server's seed,
 * and it can only contain as many hint/place actions as the server charged for.
 */
function setupOf(play: PlayRow): GameSetup {
  return { version: play.engine, difficulty: play.difficulty, mode: play.mode, daily: !!play.daily_day, hardMode: !!play.hard_mode };
}

/** The same move written as a log action: a swap pair or ['r', position]. */
const asAction = (m: Suggestion): Action => (m.kind === 'swap' ? [m.a, m.b] : ['r', m.p]);

function validate(play: PlayRow, actions: Action[]) {
  const r = replay(play.seed, setupOf(play), actions);
  if (r.invalidAt !== -1) fail(422, `Move ${r.invalidAt + 1} isn't a legal move.`);
  if (r.state.hints > play.hints_paid || r.state.places > play.places_paid) fail(422, 'Helper used without being granted.');
  return r.state;
}

app.post('/', async (c) => {
  const user = requireUser(c);
  const b = await body(c);
  const slug = String(b.puzzle ?? '');
  const fresh = !!b.fresh;
  const dailyDay = typeof b.daily === 'string' ? b.daily : null;
  let difficulty = (DIFFICULTIES as string[]).includes(String(b.difficulty)) ? (b.difficulty as Difficulty) : 'easy';
  let mode: Mode = (MODES as string[]).includes(String(b.mode)) ? (b.mode as Mode) : 'classic';

  let puzzle: PuzzleRow | null;
  let seed: number;
  let challenge: ChallengeRow | null = null;
  if (typeof b.challenge === 'string' && b.challenge) {
    // A friend's challenge: their exact board, even if the puzzle is locked for you.
    challenge = await c.env.DB.prepare('SELECT * FROM challenges WHERE id = ?').bind(b.challenge).first<ChallengeRow>();
    if (!challenge) fail(404, 'Challenge not found.');
    puzzle = await c.env.DB.prepare("SELECT * FROM puzzles WHERE id = ? AND status = 'published'").bind(challenge.puzzle_id).first<PuzzleRow>();
    if (!puzzle) fail(404, 'That puzzle is no longer available.');
    seed = challenge.seed;
    difficulty = challenge.difficulty;
    mode = challenge.mode;
  } else if (dailyDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dailyDay)) fail(422, 'Bad day.');
    if (!archiveOpen(dailyDay, dayKey(c.env), isMember(user))) fail(403, 'Older dailies are part of SnapShift Plus.');
    const d = await getDaily(c.env, dailyDay);
    if (!d) fail(404, 'No daily puzzle for that day.');
    puzzle = d.puzzle;
    seed = d.daily.seed;
    difficulty = DAILY_DIFFICULTY;
    mode = 'classic';
  } else {
    puzzle = await c.env.DB.prepare('SELECT * FROM puzzles WHERE slug = ?').bind(slug).first<PuzzleRow>();
    if (!puzzle) fail(404, 'Puzzle not found.');
    if (!(await canPlay(c.env, user, puzzle))) fail(403, 'Unlock this puzzle first.');
    seed = randomSeed();
  }

  // Reopening a puzzle shows its latest game for this difficulty (or day):
  // an unfinished one is resumed, a finished one is shown finished.
  // "fresh" (Play again / Shuffle) starts a new game instead.
  const latest = async (completed: boolean) =>
    challenge
      ? c.env.DB.prepare(
          `SELECT * FROM plays WHERE user_id = ? AND challenge_id = ? AND completed_at IS ${completed ? 'NOT NULL' : 'NULL'}
           ORDER BY ${completed ? 'completed_at' : 'updated_at'} DESC LIMIT 1`,
        )
          .bind(user.id, challenge.id)
          .first<PlayRow>()
      : c.env.DB.prepare(
          `SELECT * FROM plays WHERE user_id = ? AND puzzle_id = ? AND difficulty = ? AND mode = ? AND challenge_id IS NULL
           AND completed_at IS ${completed ? 'NOT NULL' : 'NULL'}
           AND ${dailyDay ? 'daily_day = ?' : 'daily_day IS NULL AND ? IS NULL'}
           ORDER BY ${completed ? 'completed_at' : 'updated_at'} DESC LIMIT 1`,
        )
          .bind(user.id, puzzle.id, difficulty, mode, dailyDay)
          .first<PlayRow>();
  const existing = await latest(false);
  const done = await latest(true);
  if (!fresh) {
    // An untouched game opened after a finish shouldn't hide that finish.
    const untouched = existing && existing.actions === '[]';
    if (existing && !(untouched && done)) {
      return c.json({ play: playView(existing), resumed: true });
    }
    if (done) {
      if (existing) await c.env.DB.prepare('DELETE FROM plays WHERE id = ?').bind(existing.id).run();
      return c.json({ play: playView(done), resumed: false });
    }
  }
  if (existing && fresh) await c.env.DB.prepare('DELETE FROM plays WHERE id = ?').bind(existing.id).run();

  const id = randomId(12);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO plays (id, user_id, puzzle_id, difficulty, mode, engine, hard_mode, daily_day, seed, started_at, updated_at, challenge_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, puzzle.id, difficulty, mode, challenge ? challenge.engine : ENGINE_VERSION, challenge ? null : dailyDay, seed, t, t, challenge?.id ?? null)
    .run();
  const play = await c.env.DB.prepare('SELECT * FROM plays WHERE id = ?').bind(id).first<PlayRow>();
  return c.json({ play: playView(play!), resumed: false });
});

app.get('/:id', async (c) => {
  const play = await loadPlay(c, requireUser(c), c.req.param('id'));
  return c.json({ play: playView(play) });
});

/** Autosave: store the move log after validating it. */
app.put('/:id', async (c) => {
  const user = requireUser(c);
  const play = await loadPlay(c, user, c.req.param('id'));
  if (play.completed_at) return c.json({ ok: true, completed: true });
  const b = await body(c);
  const actions = parseActions(b.actions);
  validate(play, actions);
  const elapsed = Math.min(int(b.elapsedMs), now() - play.started_at);
  await c.env.DB.prepare('UPDATE plays SET actions = ?, elapsed_ms = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(actions), Math.max(0, elapsed), now(), play.id)
    .run();
  return c.json({ ok: true });
});

/** Hint: charge (by difficulty), then reveal the best next move. */
app.post('/:id/hint', async (c) => {
  const user = requireUser(c);
  const play = await loadPlay(c, user, c.req.param('id'));
  if (play.completed_at) fail(409, 'This game is finished.');
  const actions = parseActions((await body(c)).actions);
  const state = validate(play, actions);
  const rules = gameRules(setupOf(play));
  if (play.last_hint_at && now() - play.last_hint_at < rules.hintCooldownMs) {
    fail(429, `Hint ready in ${Math.ceil((rules.hintCooldownMs - (now() - play.last_hint_at)) / 1000)}s.`);
  }
  const move = suggest(state);
  if (!move) fail(409, 'Nothing left to hint.');
  const cost = rules.hintCost;
  if (!(await spend(c.env, user.id, cost, 'hint', play.id))) fail(402, `A hint costs ${cost} points.`);
  const next = [...actions, ['hint'] as Action];
  await c.env.DB.prepare('UPDATE plays SET actions = ?, hints_paid = hints_paid + 1, last_hint_at = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(next), now(), now(), play.id)
    .run();
  return c.json({ move, pair: move.kind === 'swap' ? [move.a, move.b] : null, cost, points: await balance(c.env, user.id), cooldownMs: rules.hintCooldownMs });
});

/** "Place one tile": charge, then the client applies the suggested swap. Not on the daily. */
app.post('/:id/place', async (c) => {
  const user = requireUser(c);
  const play = await loadPlay(c, user, c.req.param('id'));
  if (play.completed_at) fail(409, 'This game is finished.');
  const rules = gameRules(setupOf(play));
  if (!rules.placeAllowed) fail(403, 'Not available on the daily challenge.');
  const actions = parseActions((await body(c)).actions);
  const state = validate(play, actions);
  const move = suggest(state);
  if (!move) fail(409, 'Nothing left to place.');
  const cost = rules.placeCost;
  if (!(await spend(c.env, user.id, cost, 'place', play.id))) fail(402, `Placing a tile costs ${cost} points.`);
  const next = [...actions, ['place'] as Action];
  await c.env.DB.prepare('UPDATE plays SET actions = ?, places_paid = places_paid + 1, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(next), now(), play.id)
    .run();
  return c.json({ move, action: asAction(move), pair: move.kind === 'swap' ? [move.a, move.b] : null, cost, points: await balance(c.env, user.id) });
});

app.post('/:id/complete', async (c) => {
  const user = requireUser(c);
  const play = await loadPlay(c, user, c.req.param('id'));
  if (play.completed_at) fail(409, 'Already finished.');
  const b = await body(c);
  const actions = parseActions(b.actions);
  const state = validate(play, actions);
  if (!isSolved(state)) fail(422, 'The puzzle is not solved yet.');

  const t = now();
  const elapsed = acceptedElapsed(int(b.elapsedMs), t - play.started_at, state.moves);
  const rules = gameRules(setupOf(play));
  const zen = !rules.timed;
  const rating = rate(play.difficulty, state, elapsed);
  const today = dayKey(c.env);
  const isTodaysDaily = play.daily_day === today;

  // Full points the first time a puzzle is finished on a difficulty; a share after that.
  const prior = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM plays WHERE user_id = ? AND puzzle_id = ? AND difficulty = ? AND mode = ? AND completed_at IS NOT NULL',
  )
    .bind(user.id, play.puzzle_id, play.difficulty, play.mode)
    .first<{ n: number }>();
  const firstClear = (prior?.n ?? 0) === 0;
  // Zen pays a small fixed amount the first time and has no medal.
  const base = zen ? ZEN_POINTS : winPoints(play.difficulty, rules, { medal: rating.medal, elapsedMs: elapsed }, play.engine as 1 | 2);
  const points = firstClear ? base : zen ? 0 : Math.floor(base * REPLAY_FACTOR);

  let dailyBonus = 0;
  let countsForDaily = false;
  if (isTodaysDaily) {
    const done = await c.env.DB.prepare('SELECT 1 FROM daily_results WHERE day = ? AND user_id = ?').bind(today, user.id).first();
    countsForDaily = !done;
    if (countsForDaily) dailyBonus = DAILY_BONUS;
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE plays SET actions = ?, elapsed_ms = ?, completed_at = ?, updated_at = ?, moves = ?, score = ?,
       score_pct = ?, medal = ?, points = ? WHERE id = ? AND completed_at IS NULL`,
    ).bind(JSON.stringify(actions), elapsed, t, t, state.moves, state.score, zen ? null : rating.scorePct, zen ? null : rating.medal, points + dailyBonus, play.id),
    ...creditStatements(c.env, user.id, points, 'win', play.id),
  ];
  if (countsForDaily) {
    stmts.push(
      c.env.DB.prepare(
        'INSERT OR IGNORE INTO daily_results (day, user_id, play_id, score_pct, elapsed_ms, moves, medal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(today, user.id, play.id, rating.scorePct, elapsed, state.moves, rating.medal, t),
      ...creditStatements(c.env, user.id, dailyBonus, 'daily', today),
    );
  }
  const results = await c.env.DB.batch(stmts);
  if (!results[0].meta.changes) fail(409, 'Already finished.');

  // Streak milestones (7 / 14 / 30 days, then every 30) pay once per streak.
  let streak = null;
  let milestone = null;
  let frozen: string[] = [];
  if (countsForDaily) {
    if (isMember(user)) frozen = await useStreakFreezes(c.env, user.id, today);
    streak = await dailyStreak(c.env, user.id, today);
    const hit = streakMilestone(streak.current);
    if (hit) {
      const ins = await c.env.DB.prepare('INSERT OR IGNORE INTO streak_rewards (user_id, milestone, day, points) VALUES (?, ?, ?, ?)')
        .bind(user.id, hit.days, today, hit.points)
        .run();
      if (ins.meta.changes) {
        await c.env.DB.batch(creditStatements(c.env, user.id, hit.points, 'streak', `${hit.days}d:${today}`));
        milestone = hit;
      }
    }
  }

  // Friend's challenge: the first finish counts.
  let challengeResult = null;
  const extra: string[] = [];
  if (play.challenge_id) {
    const ch = await c.env.DB.prepare('SELECT c.*, u.username FROM challenges c JOIN users u ON u.id = c.user_id WHERE c.id = ?')
      .bind(play.challenge_id)
      .first<ChallengeRow & { username: string }>();
    if (ch && ch.user_id !== user.id) {
      const mine = { elapsed_ms: elapsed, moves: state.moves };
      const ins = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO challenge_results (challenge_id, user_id, play_id, elapsed_ms, moves, medal, score_pct, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(ch.id, user.id, play.id, elapsed, state.moves, zen ? null : rating.medal, zen ? null : rating.scorePct, t)
        .run();
      const win = beats(mine, ch);
      if (win) extra.push('challenge-win');
      challengeResult = { by: ch.username, theirElapsedMs: ch.elapsed_ms, theirMoves: ch.moves, theirMedal: ch.medal, beat: win, recorded: !!ins.meta.changes };
    }
  }
  const puzzleRow = await c.env.DB.prepare('SELECT category_id FROM puzzles WHERE id = ?').bind(play.puzzle_id).first<{ category_id: string | null }>();
  const collection = play.daily_day ? null : await checkCollection(c.env, user.id, puzzleRow?.category_id ?? null);
  const events = zen || play.daily_day ? [] : await recordEventFinish(c.env, user.id, play.puzzle_id, { scorePct: rating.scorePct, elapsedMs: elapsed, medal: rating.medal });
  if (!zen && rating.moveEffPct >= 100) extra.push('perfect');
  if (streak && streak.current >= 7) extra.push('streak-7');
  if (streak && streak.current >= 30) extra.push('streak-30');
  const achievements = await checkAchievements(c.env, user.id, extra);

  let rank = null;
  if (countsForDaily) {
    const r = await c.env.DB.prepare(
      `SELECT COUNT(*) + 1 AS rank FROM daily_results WHERE day = ?
       AND (score_pct > ? OR (score_pct = ? AND elapsed_ms < ?))`,
    )
      .bind(today, rating.scorePct, rating.scorePct, elapsed)
      .first<{ rank: number }>();
    rank = r?.rank ?? null;
  }

  return c.json({
    rating: zen ? null : rating,
    zen,
    elapsedMs: elapsed,
    moves: state.moves,
    score: state.score,
    points,
    firstClear,
    dailyBonus,
    milestone,
    streak,
    frozen,
    rank,
    challenge: challengeResult,
    collection,
    events,
    achievements,
    balance: await balance(c.env, user.id),
  });
});

/** Puzzle info for the play page, including the image to slice. */
app.get('/:id/puzzle', async (c) => {
  const play = await loadPlay(c, requireUser(c), c.req.param('id'));
  const p = await c.env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(play.puzzle_id).first<PuzzleRow>();
  return c.json({ slug: p!.slug, title: p!.title, ...imageFields(p!) });
});

export default app;
