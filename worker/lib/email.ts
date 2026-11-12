import type { Env } from '../env';

/**
 * Sends an email through Resend (https://resend.com) when RESEND_API_KEY is set.
 * Returns false if it couldn't send; callers decide what to tell the player.
 */
export async function sendEmail(env: Env, to: string, subject: string, text: string, headers?: Record<string, string>, html?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email not configured] to=${to} subject=${subject}\n${text}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // The designed HTML version, with the plain text for apps that want it.
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}), ...(headers ? { headers } : {}) }),
  });
  if (!res.ok) console.log('[email failed]', res.status, await res.text());
  return res.ok;
}
