// Invite a friend: when someone who joined through your link has verified their
// email and finished a few puzzles, you both get points (once).

import type { Env } from '../env';
import { creditStatements } from './points';
import { checkAchievements } from './rewards';
import { now } from './util';

export const INVITE_POINTS = 100;
export const INVITE_FINISHES = 3;

/** Pay the invite reward for this player if they've now earned it. */
export async function checkReferral(env: Env, userId: number): Promise<{ inviter: string; points: number } | null> {
  const u = await env.DB.prepare(
    `SELECT u.referred_by, u.email_verified, i.username AS inviter,
       (SELECT COUNT(*) FROM plays WHERE user_id = u.id AND completed_at IS NOT NULL) AS finished,
       (SELECT 1 FROM referral_rewards WHERE invitee_id = u.id) AS paid
     FROM users u JOIN users i ON i.id = u.referred_by WHERE u.id = ?`,
  )
    .bind(userId)
    .first<{ referred_by: number; email_verified: number; inviter: string; finished: number; paid: number | null }>();
  if (!u || u.paid || !u.email_verified || u.finished < INVITE_FINISHES) return null;
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO referral_rewards (invitee_id, inviter_id, points, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, u.referred_by, INVITE_POINTS, now())
    .run();
  if (!ins.meta.changes) return null;
  await env.DB.batch([
    ...creditStatements(env, userId, INVITE_POINTS, 'invited', u.inviter),
    ...creditStatements(env, u.referred_by, INVITE_POINTS, 'invite', String(userId)),
  ]);
  await checkAchievements(env, u.referred_by).catch(() => []);
  return { inviter: u.inviter, points: INVITE_POINTS };
}
