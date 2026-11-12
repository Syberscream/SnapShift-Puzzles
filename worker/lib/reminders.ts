// Streak reminder emails: in the evening (site time), players who asked for them,
// kept a streak going yesterday and haven't played today's daily get one email.

import type { Env } from '../env';
import { dailyStreak, getDaily, media } from './catalog';
import { sendEmail } from './email';
import { streakReminderEmail } from './email-templates';
import { STREAK_MILESTONES } from '../../shared/rules';
import { addDays, dayKey } from './util';

/** Reminders go out from this hour (site timezone) until midnight. */
export const REMINDER_FROM_HOUR = 18;
const PER_RUN = 40;

export function localHour(env: Env, at = Date.now()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: env.TIMEZONE || 'UTC', hour: 'numeric', hourCycle: 'h23' }).format(new Date(at)));
}

/** The next streak bonus at or after `days` (7, 14, 30, then every 30 days). */
export function nextMilestone(days: number): { days: number; points: number; title: string } | null {
  const fixed = STREAK_MILESTONES.find((m) => m.days >= days);
  if (fixed) return fixed;
  const last = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
  const at = Math.ceil(days / last.days) * last.days;
  return { days: at, points: last.points, title: `${at}-Day Legend` };
}

export async function sendStreakReminders(env: Env, at = Date.now(), force = false): Promise<string[]> {
  const log: string[] = [];
  if (!force && localHour(env, at) < REMINDER_FROM_HOUR) return log;
  const today = dayKey(env, at);
  const yesterday = addDays(today, -1);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.unsub_token FROM users u
     WHERE u.remind_streak = 1 AND u.email_verified = 1 AND COALESCE(u.reminded_day, '') != ?
       AND EXISTS (SELECT 1 FROM daily_results r WHERE r.user_id = u.id AND r.day = ?)
       AND NOT EXISTS (SELECT 1 FROM daily_results r WHERE r.user_id = u.id AND r.day = ?)
     LIMIT ?`,
  )
    .bind(today, yesterday, today, PER_RUN)
    .all<{ id: number; email: string; username: string; unsub_token: string | null }>();
  const base = env.APP_URL.replace(/\/$/, '');
  // Today's puzzle picture for the email (the same for everyone).
  const daily = results.length ? await getDaily(env, today).catch(() => null) : null;
  const picPath = daily ? media(daily.puzzle.small_key || daily.puzzle.image_key || daily.puzzle.original_key) : '';
  const puzzle = daily && picPath ? { title: daily.puzzle.title, image: picPath.startsWith('http') ? picPath : base + picPath } : null;
  for (const u of results) {
    // Mark first so a slow or failed send never turns into repeated emails.
    await env.DB.prepare('UPDATE users SET reminded_day = ? WHERE id = ?').bind(today, u.id).run();
    const streak = await dailyStreak(env, u.id, today);
    if (streak.current < 2) continue;
    const unsub = `${base}/api/auth/unsubscribe?u=${u.id}&t=${encodeURIComponent(u.unsub_token ?? '')}`;
    const mail = streakReminderEmail({ base, username: u.username, streak: streak.current, puzzle, next: nextMilestone(streak.current + 1), unsub });
    const ok = await sendEmail(env, u.email, mail.subject, mail.text, { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, mail.html);
    log.push(`${ok ? 'sent' : 'failed'} streak reminder to user ${u.id} (${streak.current} days)`);
  }
  return log;
}
