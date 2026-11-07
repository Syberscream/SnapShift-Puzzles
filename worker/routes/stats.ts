import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { publicUser, requireUser } from '../lib/auth';
import { archiveOpen, dailyStreak, DAILY_CATEGORY, freezesLeft, getDaily, media, imageFields } from '../lib/catalog';
import { isMember, plusSql } from '../lib/membership';
import { addDays, dayKey, fail, int, msUntilNextDay } from '../lib/util';
import { PLUS } from '../../shared/rules';
import { ACHIEVEMENTS } from '../../shared/achievements';

const app = new Hono<AppEnv>();

app.get('/daily/today', async (c) => {
  const user = c.get('user');
  const today = dayKey(c.env);
  const d = await getDaily(c.env, today);
  let result = null;
  let streak = null;
  if (user) {
    result = await c.env.DB.prepare('SELECT score_pct, elapsed_ms, moves, medal FROM daily_results WHERE day = ? AND user_id = ?')
      .bind(today, user.id)
      .first();
    streak = await dailyStreak(c.env, user.id, today);
  }
  const players = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM daily_results WHERE day = ?').bind(today).first<{ n: number }>();
  return c.json({
    day: today,
    nextDailyInMs: msUntilNextDay(c.env),
    puzzle: d
      ? { slug: d.puzzle.slug, title: d.puzzle.title, thumb: media(d.puzzle.thumb_key || d.puzzle.image_key || d.puzzle.original_key) }
      : null,
    result,
    streak,
    players: players?.n ?? 0,
  });
});

/** One day's daily puzzle (today or earlier). The seed is public: everyone gets the same board. */
app.get('/daily/day/:day', async (c) => {
  const day = c.req.param('day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(422, 'Use YYYY-MM-DD.');
  if (!archiveOpen(day, dayKey(c.env), isMember(c.get('user')))) fail(403, 'Older dailies are part of SnapShift Plus.');
  const d = await getDaily(c.env, day);
  if (!d) fail(404, 'No daily puzzle for that day.');
  const cat = d.puzzle.category_id
    ? await c.env.DB.prepare('SELECT id, name FROM categories WHERE id = ?').bind(d.puzzle.category_id).first<{ id: string; name: string }>()
    : null;
  return c.json({
    day,
    isToday: day === dayKey(c.env),
    seed: d.daily.seed,
    puzzle: {
      slug: d.puzzle.slug,
      title: d.puzzle.title,
      ...imageFields(d.puzzle),
      thumb: media(d.puzzle.thumb_key || d.puzzle.image_key || d.puzzle.original_key),
    },
    category: cat,
  });
});

/** Past dailies, newest first, 30 per page. */
app.get('/daily/archive', async (c) => {
  const user = c.get('user');
  const member = isMember(user);
  const today = dayKey(c.env);
  const before = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('before') || '') ? c.req.query('before')! : addDays(today, 1);
  const { results } = await c.env.DB.prepare(
    `SELECT d.day, p.slug, p.title, p.thumb_key, p.image_key, p.original_key, p.category_id,
       (SELECT COUNT(*) FROM daily_results r WHERE r.day = d.day) AS players
     FROM daily_puzzles d JOIN puzzles p ON p.id = d.puzzle_id
     WHERE d.day < ? AND d.day <= ? ORDER BY d.day DESC LIMIT 30`,
  )
    .bind(before, today)
    .all<Record<string, string | number>>();
  let mine = new Map<string, Record<string, unknown>>();
  if (user && results.length) {
    const r = await c.env.DB.prepare(
      `SELECT day, medal, score_pct, elapsed_ms FROM daily_results WHERE user_id = ? AND day IN (${results.map(() => '?').join(',')})`,
    )
      .bind(user.id, ...results.map((x) => x.day))
      .all<Record<string, unknown>>();
    mine = new Map(r.results.map((x) => [String(x.day), x]));
  }
  return c.json({
    days: results.map((r) => ({
      day: r.day,
      slug: r.slug,
      title: r.title,
      categoryId: r.category_id,
      thumb: media(String(r.thumb_key || r.image_key || r.original_key)),
      players: r.players,
      mine: mine.get(String(r.day)) ?? null,
      locked: !archiveOpen(String(r.day), today, member),
    })),
    freeDays: member ? null : PLUS.freeArchiveDays,
  });
});

app.get('/leaderboard/daily', async (c) => {
  const user = c.get('user');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('day') || '') ? c.req.query('day')! : dayKey(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, r.score_pct, r.elapsed_ms, r.moves, r.medal, r.user_id, ${plusSql('u')} AS plus
     FROM daily_results r JOIN users u ON u.id = r.user_id
     WHERE r.day = ? ORDER BY r.score_pct DESC, r.elapsed_ms ASC, r.created_at ASC LIMIT 50`,
  )
    .bind(day)
    .all<{ username: string; score_pct: number; elapsed_ms: number; moves: number; medal: string; user_id: number; plus: number }>();
  let me = null;
  if (user) {
    const mine = await c.env.DB.prepare('SELECT score_pct, elapsed_ms, moves, medal FROM daily_results WHERE day = ? AND user_id = ?')
      .bind(day, user.id)
      .first<{ score_pct: number; elapsed_ms: number; moves: number; medal: string }>();
    if (mine) {
      const r = await c.env.DB.prepare(
        'SELECT COUNT(*) + 1 AS rank FROM daily_results WHERE day = ? AND (score_pct > ? OR (score_pct = ? AND elapsed_ms < ?))',
      )
        .bind(day, mine.score_pct, mine.score_pct, mine.elapsed_ms)
        .first<{ rank: number }>();
      me = { ...mine, rank: r?.rank ?? null };
    }
  }
  return c.json({
    day,
    rows: results.map((r, i) => ({ rank: i + 1, username: r.username, scorePct: r.score_pct, elapsedMs: r.elapsed_ms, moves: r.moves, medal: r.medal, plus: !!r.plus, isMe: r.user_id === user?.id })),
    me,
  });
});

/** All-time: points earned from playing (spending doesn't lower your rank). */
app.get('/leaderboard/points', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, u.id, SUM(l.delta) AS earned, ${plusSql('u')} AS plus,
       (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id AND p.medal = 'gold') AS golds
     FROM points_ledger l JOIN users u ON u.id = l.user_id
     WHERE l.reason IN ('win', 'daily', 'streak', 'timeattack')
     GROUP BY u.id ORDER BY earned DESC LIMIT 50`,
  ).all<{ username: string; id: number; earned: number; golds: number; plus: number }>();
  return c.json({ rows: results.map((r, i) => ({ rank: i + 1, username: r.username, earned: r.earned, golds: r.golds, plus: !!r.plus, isMe: r.id === user?.id })) });
});

app.get('/me/summary', async (c) => {
  const user = requireUser(c);
  const today = dayKey(c.env);
  const [ledger, medals, streak] = await Promise.all([
    c.env.DB.prepare('SELECT delta, reason, ref, created_at FROM points_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 40').bind(user.id).all(),
    c.env.DB.prepare(
      `SELECT medal, COUNT(*) AS n FROM plays WHERE user_id = ? AND completed_at IS NOT NULL GROUP BY medal`,
    )
      .bind(user.id)
      .all<{ medal: string; n: number }>(),
    dailyStreak(c.env, user.id, today),
  ]);
  const m = Object.fromEntries(medals.results.map((r) => [r.medal, r.n]));
  return c.json({
    user: publicUser(user),
    streak,
    medals: { gold: m.gold ?? 0, silver: m.silver ?? 0, bronze: m.bronze ?? 0 },
    completed: (m.gold ?? 0) + (m.silver ?? 0) + (m.bronze ?? 0),
    freezesLeft: isMember(user) ? await freezesLeft(c.env, user.id, today) : null,
    ledger: ledger.results,
  });
});

app.get('/me/ledger', async (c) => {
  const user = requireUser(c);
  const before = int(c.req.query('before'), 0) || Number.MAX_SAFE_INTEGER;
  const { results } = await c.env.DB.prepare(
    'SELECT id, delta, reason, ref, created_at FROM points_ledger WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT 50',
  )
    .bind(user.id, before)
    .all();
  if (!results) fail(500, 'Could not load history.');
  return c.json({ rows: results });
});

/** All achievements, with when you earned each one. */
app.get('/me/achievements', async (c) => {
  const user = requireUser(c);
  const { results } = await c.env.DB.prepare('SELECT achievement, earned_at FROM user_achievements WHERE user_id = ?').bind(user.id).all<{ achievement: string; earned_at: number }>();
  const got = new Map(results.map((r) => [r.achievement, r.earned_at]));
  return c.json({ achievements: ACHIEVEMENTS.map((a) => ({ ...a, earnedAt: got.get(a.id) ?? null })) });
});

/** Public profile: medals, streaks, achievements and recent finishes. */
app.get('/profile/:name', async (c) => {
  const viewer = c.get('user');
  const u = await c.env.DB.prepare(
    `SELECT id, username, created_at, profile_public, frame, ${plusSql('users')} AS plus FROM users WHERE username = ?`,
  )
    .bind(c.req.param('name'))
    .first<{ id: number; username: string; created_at: number; profile_public: number; frame: string; plus: number }>();
  const self = !!viewer && viewer.id === u?.id;
  if (!u || (!u.profile_public && !self && viewer?.role !== 'admin')) fail(404, 'No public profile with that name.');
  const today = dayKey(c.env);
  const [medals, ach, ta, recent, daily, streak] = await Promise.all([
    c.env.DB.prepare('SELECT medal, COUNT(*) AS n FROM plays WHERE user_id = ? AND completed_at IS NOT NULL AND challenge_id IS NULL GROUP BY medal')
      .bind(u.id)
      .all<{ medal: string; n: number }>(),
    c.env.DB.prepare('SELECT achievement, earned_at FROM user_achievements WHERE user_id = ? ORDER BY earned_at DESC').bind(u.id).all<{ achievement: string; earned_at: number }>(),
    c.env.DB.prepare('SELECT MAX(score) AS best, COUNT(*) AS runs FROM time_attack_runs WHERE user_id = ? AND finished_at IS NOT NULL').bind(u.id).first<{ best: number | null; runs: number }>(),
    c.env.DB.prepare(
      `SELECT p.slug, p.title, p.thumb_key, p.image_key, p.original_key, p.category_id, pl.medal, pl.difficulty, pl.completed_at
       FROM plays pl JOIN puzzles p ON p.id = pl.puzzle_id
       WHERE pl.user_id = ? AND pl.completed_at IS NOT NULL AND pl.daily_day IS NULL AND pl.challenge_id IS NULL AND p.category_id != ?
       ORDER BY pl.completed_at DESC LIMIT 40`,
    )
      .bind(u.id, DAILY_CATEGORY)
      .all<Record<string, string | number>>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n, SUM(medal = \'gold\') AS golds FROM daily_results WHERE user_id = ?').bind(u.id).first<{ n: number; golds: number | null }>(),
    dailyStreak(c.env, u.id, today),
  ]);
  const { results: evs } = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.ends, (SELECT place FROM event_prizes p WHERE p.event_id = e.id AND p.user_id = ?1) AS place,
       EXISTS (SELECT 1 FROM event_rewards r WHERE r.event_id = e.id AND r.user_id = ?1) AS completed
     FROM events e
     WHERE EXISTS (SELECT 1 FROM event_rewards r WHERE r.event_id = e.id AND r.user_id = ?1)
        OR EXISTS (SELECT 1 FROM event_prizes p WHERE p.event_id = e.id AND p.user_id = ?1)
     ORDER BY e.ends DESC LIMIT 30`,
  )
    .bind(u.id)
    .all<{ id: string; title: string; ends: string; place: number | null; completed: number }>();
  const m = Object.fromEntries(medals.results.map((r) => [r.medal, r.n]));
  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  return c.json({
    username: u.username,
    joined: u.created_at,
    plus: !!u.plus,
    frame: u.plus ? u.frame : '',
    isPublic: !!u.profile_public,
    self,
    medals: { gold: m.gold ?? 0, silver: m.silver ?? 0, bronze: m.bronze ?? 0 },
    completed: (m.gold ?? 0) + (m.silver ?? 0) + (m.bronze ?? 0),
    streak: { current: streak.current, best: streak.best },
    dailies: { played: daily?.n ?? 0, golds: daily?.golds ?? 0 },
    timeAttack: { best: ta?.best ?? null, runs: ta?.runs ?? 0 },
    achievements: ach.results.flatMap((r) => {
      const a = byId.get(r.achievement);
      return a ? [{ id: a.id, icon: a.icon, title: a.title, description: a.description, earnedAt: r.earned_at }] : [];
    }),
    achievementsTotal: ACHIEVEMENTS.length,
    eventBadges: evs.map((e) => ({ id: e.id, title: e.title, year: e.ends.slice(0, 4), place: e.place, completed: !!e.completed })),
    // One card per picture (its latest finish).
    recent: recent.results.filter((r, i, all) => all.findIndex((x) => x.slug === r.slug) === i).slice(0, 8).map((r) => ({
      slug: r.slug,
      title: r.title,
      thumb: media(String(r.thumb_key || r.image_key || r.original_key)),
      medal: r.medal,
      difficulty: r.difficulty,
      at: r.completed_at,
    })),
  });
});

export default app;
