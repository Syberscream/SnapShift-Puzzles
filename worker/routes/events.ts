// Themed events: a set of puzzles, open to everyone while the event runs, with
// their own leaderboard (puzzles finished, then total score).

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { activeEventPuzzleIds, categoryIndexes, media, membersOnlyCategories, toView, userPuzzleState, viewerOf, type PuzzleRow, imageFields } from '../lib/catalog';
import { eventImage, eventLeaderboard, eventPrizes, EVENTS_WITH_COVER, settleEventPrizes, type EventRow } from '../lib/rewards';
import { dayKey, fail, msUntilNextDay, addDays, daysBetween } from '../lib/util';

const app = new Hono<AppEnv>();

const view = (e: EventRow, today: string) => ({
  id: e.id,
  title: e.title,
  description: e.description,
  image: eventImage(e),
  starts: e.starts,
  ends: e.ends,
  bonus: e.bonus,
  difficulty: e.difficulty ?? 'medium',
  mode: e.mode ?? 'classic',
  prizes: eventPrizes(e),
  status: e.starts > today ? 'upcoming' : e.ends < today ? 'ended' : 'live',
});

/** Live and upcoming events, plus the last few that ended. */
app.get('/', async (c) => {
  const today = dayKey(c.env);
  const { results } = await c.env.DB.prepare(`${EVENTS_WITH_COVER} WHERE e.ends >= ? ORDER BY e.starts LIMIT 20`).bind(addDays(today, -30)).all<EventRow>();
  return c.json({ today, events: results.map((e) => view(e, today)) });
});

app.get('/:id', async (c) => {
  const user = c.get('user');
  const today = dayKey(c.env);
  await settleEventPrizes(c.env, today);
  const e = await c.env.DB.prepare(`${EVENTS_WITH_COVER} WHERE e.id = ?`).bind(c.req.param('id')).first<EventRow>();
  if (!e) fail(404, 'Event not found.');
  const { results: rows } = await c.env.DB.prepare(
    `SELECT p.* FROM event_puzzles ep JOIN puzzles p ON p.id = ep.puzzle_id WHERE ep.event_id = ? AND p.status = 'published' ORDER BY ep.sort, p.id`,
  )
    .bind(e.id)
    .all<PuzzleRow>();
  const state = await userPuzzleState(c.env, user, rows.map((p) => p.id));
  const eventIds = await activeEventPuzzleIds(c.env, today);
  const membersCats = await membersOnlyCategories(c.env);
  const indexes = new Map<number, number>();
  for (const p of rows) indexes.set(p.id, (await categoryIndexes(c.env, p.category_id ?? '')).get(p.id) ?? 0);
  const mineRows = user
    ? (
        await c.env.DB.prepare('SELECT puzzle_id, score_pct, medal, elapsed_ms FROM event_results WHERE event_id = ? AND user_id = ?')
          .bind(e.id, user.id)
          .all<{ puzzle_id: number; score_pct: number; medal: string | null; elapsed_ms: number }>()
      ).results
    : [];
  const mine = new Map(mineRows.map((r) => [r.puzzle_id, r]));
  const board = await eventLeaderboard(c.env, e.id, 50);
  const { results: winners } = await c.env.DB.prepare(
    'SELECT u.username, p.place, p.points FROM event_prizes p JOIN users u ON u.id = p.user_id WHERE p.event_id = ? ORDER BY p.place',
  )
    .bind(e.id)
    .all<{ username: string; place: number; points: number }>();
  return c.json({
    event: view(e, today),
    nextDayInMs: msUntilNextDay(c.env),
    puzzles: rows.map((p) => ({
      ...toView(p, indexes.get(p.id) ?? 0, state, viewerOf(user), membersCats.has(p.category_id ?? ''), eventIds),
      ...imageFields(p),
      eventResult: mine.get(p.id) ? { scorePct: mine.get(p.id)!.score_pct, medal: mine.get(p.id)!.medal } : null,
    })),
    leaderboard: board.map((r, i) => ({ rank: i + 1, username: r.username, done: r.done, total: r.total, plus: !!r.plus, isMe: r.user_id === user?.id })),
    me: user ? { done: mine.size, total: rows.length } : null,
    winners,
    // Days until it starts (upcoming events): for the countdown.
    startsInMs: e.starts > today ? msUntilNextDay(c.env) + (daysBetween(today, e.starts) - 1) * 86400_000 : null,
  });
});

export default app;
