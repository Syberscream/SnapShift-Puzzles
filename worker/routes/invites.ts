// Invite friends: your link and how your invites are doing.

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireUser } from '../lib/auth';
import { INVITE_FINISHES, INVITE_POINTS } from '../lib/invites';
import { siteUrl } from '../lib/util';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const user = requireUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, u.email_verified, u.created_at,
       (SELECT COUNT(*) FROM plays WHERE user_id = u.id AND completed_at IS NOT NULL) AS finished,
       (SELECT 1 FROM referral_rewards WHERE invitee_id = u.id) AS paid
     FROM users u WHERE u.referred_by = ? ORDER BY u.created_at DESC LIMIT 50`,
  )
    .bind(user.id)
    .all<{ username: string; email_verified: number; created_at: number; finished: number; paid: number | null }>();
  return c.json({
    link: `${siteUrl(c.env, c.req.url)}/?ref=${encodeURIComponent(user.username)}`,
    points: INVITE_POINTS,
    finishes: INVITE_FINISHES,
    friends: results.map((r) => ({
      username: r.username,
      joined: r.created_at,
      verified: !!r.email_verified,
      finished: Math.min(r.finished, INVITE_FINISHES),
      rewarded: !!r.paid,
    })),
    earned: results.filter((r) => r.paid).length * INVITE_POINTS,
  });
});

/** Public: does this invite name belong to a player? (So the welcome note can show it.) */
app.get('/from/:name', async (c) => {
  const u = await c.env.DB.prepare('SELECT username FROM users WHERE username = ?').bind(c.req.param('name')).first<{ username: string }>();
  return c.json({ username: u?.username ?? null, points: INVITE_POINTS, finishes: INVITE_FINISHES });
});

export default app;
