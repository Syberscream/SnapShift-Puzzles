// SnapShift Plus: who is a member and the helpers that change it.

import type { Env, User } from '../env';
import { now } from './util';

type MemberFields = Pick<User, 'role' | 'supporter_until' | 'lifetime'>;

/** Members: an active or lifetime membership. Admins get every member perk too. */
export function isMember(u: MemberFields | null | undefined): boolean {
  if (!u) return false;
  return u.role === 'admin' || !!u.lifetime || (!!u.supporter_until && u.supporter_until > now());
}

/** A paying member (not just an admin), used for the badge on leaderboards. */
export function hasPlus(u: Pick<User, 'supporter_until' | 'lifetime'>): boolean {
  return !!u.lifetime || (!!u.supporter_until && u.supporter_until > now());
}

/** SQL expression for "is a paying member" on a users table aliased `alias`. */
export const plusSql = (alias: string, t = now()) => `(${alias}.lifetime = 1 OR COALESCE(${alias}.supporter_until, 0) > ${Math.floor(t)})`;

/** Set when a membership ends (null = not a member). Lifetime members are never changed. */
export async function setMemberUntil(env: Env, userId: number, until: number | null): Promise<void> {
  await env.DB.prepare('UPDATE users SET supporter_until = ? WHERE id = ? AND lifetime = 0').bind(until, userId).run();
}

export async function setLifetime(env: Env, userId: number, on: boolean): Promise<void> {
  await env.DB.prepare('UPDATE users SET lifetime = ? WHERE id = ?').bind(on ? 1 : 0, userId).run();
}

/** "2026-11" in the site timezone, for monthly allowances. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}
