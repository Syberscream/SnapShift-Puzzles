import type { Env } from '../env';
import { now } from './util';

/** Statements that add points and record why. Run them in a batch with related writes. */
export function creditStatements(env: Env, userId: number, delta: number, reason: string, ref: string | null): D1PreparedStatement[] {
  if (delta === 0) return [];
  return [
    env.DB.prepare('UPDATE users SET points = points + ? WHERE id = ?').bind(delta, userId),
    env.DB.prepare('INSERT INTO points_ledger (user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)').bind(
      userId,
      delta,
      reason,
      ref,
      now(),
    ),
  ];
}

/**
 * Spend points if the balance allows it. Returns false (and changes nothing)
 * when the player can't afford it.
 */
export async function spend(env: Env, userId: number, cost: number, reason: string, ref: string | null): Promise<boolean> {
  if (cost <= 0) return true;
  const res = await env.DB.prepare('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?').bind(cost, userId, cost).run();
  if (!res.meta.changes) return false;
  await env.DB.prepare('INSERT INTO points_ledger (user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, -cost, reason, ref, now())
    .run();
  return true;
}

export async function balance(env: Env, userId: number): Promise<number> {
  const r = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first<{ points: number }>();
  return r?.points ?? 0;
}
