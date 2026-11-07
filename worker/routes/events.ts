// Themed events: a set of puzzles, open to everyone while the event runs, with
// their own leaderboard (puzzles finished, then total score).

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { activeEventPuzzleIds, categoryIndexes, media, membersOnlyCategories, toView, userPuzzleState, viewerOf, type PuzzleRow, imageFields } from '../lib/catalog';
import { eventImage, EVENTS_WITH_COVER, type EventRow } from '../lib/rewards';
import { dayKey, fail, msUntilNextDay, addDays } from '../lib/util';
import { plusSql } from '../lib/membership';

const app = new Hono<AppEnv>();

const view = (e: EventRow, today: string) => ({
  id: e.id,
  title: e.title,
  description: e.description,
  image: eventImage(e),
  starts: e.starts,
  ends: e.ends,
  bonus: e.bonus,
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
  const { results: board } = await c.env.DB.prepare(
    `SELECT u.username, r.user_id, COUNT(*) AS done, SUM(r.score_pct) AS total, SUM(r.elapsed_ms) AS time, ${plusSql('u')} AS plus
     FROM event_results r JOIN users u ON u.id = r.user_id WHERE r.event_id = ?
     GROUP BY r.user_id ORDER BY done DESC, total DESC, time ASC LIMIT 50`,
  )
    .bind(e.id)
    .all<{ username: string; user_id: number; done: number; total: number; time: number; plus: number }>();
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
  });
});

export default app;
