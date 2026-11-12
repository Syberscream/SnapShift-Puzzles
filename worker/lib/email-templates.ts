// Designed emails (HTML with a plain-text twin). Email apps only understand old-
// fashioned HTML: tables for layout, inline styles, no scripts, absolute image
// links. The colours match the site: navy, gold and the orange logo.

export interface Email {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { bg: '#0b1024', card: '#141b3a', line: '#2a3463', ink: '#f1f4ff', soft: '#a8b1d6', gold: '#f5c542', orange: '#ff8a3d' };

/** A big, tappable button that works in every email app (including Outlook). */
function button(href: string, label: string, color = C.orange): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 4px"><tr>
<td align="center" bgcolor="${color}" style="border-radius:14px;background:${color};background-image:linear-gradient(135deg,#ffb347,${color} 55%,#ff5f6d)">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:16px 34px;${FONT};font-size:18px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:14px">${esc(label)}</a>
</td></tr></table>`;
}

/** The shared frame: logo, a card for the content, and a small footer. */
function layout(base: string, preheader: string, body: string, footer: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>SnapShift Puzzles</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td align="center" style="padding:4px 0 18px"><a href="${esc(base)}" target="_blank"><img src="${esc(base)}/img/email-logo.png" width="240" alt="SnapShift Puzzles" style="display:block;width:240px;max-width:70%;height:auto;border:0"></a></td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:26px 24px;${FONT};color:${C.ink}">
${body}
</td></tr>
<tr><td align="center" style="padding:18px 10px 0;${FONT};font-size:12px;line-height:18px;color:${C.soft}">
${footer}<br><a href="${esc(base)}" target="_blank" style="color:${C.soft}">snapshiftpuzzles.com</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

const h1 = (t: string) => `<h1 style="margin:0 0 8px;${FONT};font-size:26px;line-height:32px;font-weight:800;color:${C.ink};text-align:center">${t}</h1>`;
const p = (t: string, extra = '') => `<p style="margin:0 0 14px;${FONT};font-size:16px;line-height:24px;color:${C.soft};text-align:center;${extra}">${t}</p>`;

// ---------------- streak reminder ----------------

export function streakReminderEmail(o: {
  base: string;
  username: string;
  streak: number;
  /** Today's daily: picture and title (optional). */
  puzzle?: { title: string; image: string } | null;
  /** Next streak bonus, if any. */
  next?: { days: number; points: number; title: string } | null;
  unsub: string;
}): Email {
  const { base, streak } = o;
  // Seven slots: the days already played (up to six), then today, waiting.
  const done = Math.min(6, streak);
  const slots = [...Array(7)].map((_, i) => {
    const played = i >= 6 - done && i < 6;
    const today = i === 6;
    const bg = today ? 'transparent' : played ? '#3a2410' : '#1b2348';
    const border = today ? `2px dashed ${C.gold}` : played ? `2px solid ${C.orange}` : `2px solid ${C.line}`;
    const inner = today ? `<span style="font-size:15px;font-weight:800;color:${C.gold}">?</span>` : played ? '🔥' : '';
    return `<td align="center" style="padding:0 3px"><div style="width:38px;height:38px;line-height:38px;border-radius:50%;background:${bg};border:${border};font-size:18px;text-align:center">${inner}</div>
<div style="${FONT};font-size:10px;line-height:16px;color:${today ? C.gold : C.soft};font-weight:${today ? 800 : 500}">${today ? 'Today' : ''}</div></td>`;
  });
  const left = o.next ? o.next.days - streak : 0;
  const pct = o.next ? Math.max(6, Math.min(100, Math.round((streak / o.next.days) * 100))) : 0;
  const play = `${base}/daily`;
  const body = [
    o.puzzle
      ? `<a href="${esc(play)}" target="_blank" style="text-decoration:none"><img src="${esc(o.puzzle.image)}" width="510" alt="Today's puzzle: ${esc(o.puzzle.title)}" style="display:block;width:100%;max-width:510px;height:auto;border-radius:14px;border:0;margin:0 auto 6px"></a>
<p style="margin:0 0 18px;${FONT};font-size:13px;color:${C.soft};text-align:center">Today’s puzzle · <b style="color:${C.ink}">${esc(o.puzzle.title)}</b></p>`
      : '',
    `<div style="text-align:center;${FONT};font-size:44px;line-height:50px;font-weight:900;color:${C.gold}">🔥 ${streak}</div>`,
    `<div style="text-align:center;${FONT};font-size:13px;letter-spacing:2px;font-weight:800;color:${C.soft};text-transform:uppercase;margin-bottom:14px">day streak</div>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px"><tr>${slots.join('')}</tr></table>`,
    h1(`Don’t break it, ${esc(o.username)}!`),
    p('Today’s puzzle is waiting. Play before midnight to keep your streak going.'),
    o.next && left > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;background:#1b2348;border-radius:12px"><tr><td style="padding:12px 14px;${FONT}">
<div style="font-size:14px;color:${C.ink};font-weight:700">${left} more ${left === 1 ? 'day' : 'days'} to <span style="color:${C.gold}">${esc(o.next.title)}</span> · +${o.next.points} points</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr>
<td width="${pct}%" height="8" bgcolor="${C.gold}" style="background:${C.gold};border-radius:4px;font-size:0;line-height:0">&nbsp;</td>
<td height="8" bgcolor="#2a3463" style="background:#2a3463;border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table>
</td></tr></table>`
      : '',
    button(play, '▶  Play today’s puzzle'),
  ].join('\n');
  const footer = `You get this because you turned on streak reminders. <a href="${esc(o.unsub)}" target="_blank" style="color:${C.soft}">Stop them</a>.`;
  return {
    subject: `🔥 Your ${streak}-day SnapShift streak ends at midnight`,
    html: layout(base, `Today’s puzzle${o.puzzle ? `, ${o.puzzle.title},` : ''} is waiting. Keep your ${streak}-day streak alive!`, body, footer),
    text:
      `Hi ${o.username},\n\nYou're on a ${streak}-day daily streak. Today's puzzle${o.puzzle ? ` (${o.puzzle.title})` : ''} is waiting, and the streak resets at midnight.\n\n` +
      (o.next && left > 0 ? `${left} more ${left === 1 ? 'day' : 'days'} to ${o.next.title}: +${o.next.points} points.\n\n` : '') +
      `Play today's daily: ${play}\n\nYou get this because you turned on streak reminders. Stop them: ${o.unsub}\n`,
  };
}

// ---------------- welcome / verify ----------------

export function verifyEmail(o: { base: string; appName: string; link: string }): Email {
  const tile = (icon: string, title: string, sub: string) =>
    `<td width="33%" valign="top" style="padding:0 4px"><div style="background:#1b2348;border:1px solid ${C.line};border-radius:12px;padding:12px 6px;text-align:center;${FONT}">
<div style="font-size:26px;line-height:32px">${icon}</div><div style="font-size:13px;font-weight:800;color:${C.ink}">${title}</div><div style="font-size:11px;line-height:15px;color:${C.soft}">${sub}</div></div></td>`;
  const body = [
    `<div style="text-align:center;font-size:44px;line-height:52px">🧩</div>`,
    h1(`Welcome to ${esc(o.appName)}!`),
    p('One tap to confirm your email, and you’re in: points, streaks, leaderboards and badges.'),
    button(o.link, 'Confirm my email'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px"><tr>
${tile('📅', 'Daily puzzle', 'Same board for everyone')}${tile('🎉', 'Events', 'Free puzzles &amp; prizes')}${tile('⏱️', 'Time Attack', 'Beat the clock')}</tr></table>`,
    p(`Button not working? Copy this link into your browser:<br><a href="${esc(o.link)}" style="color:${C.gold};word-break:break-all">${esc(o.link)}</a>`, 'font-size:12px;line-height:18px;margin-top:14px'),
  ].join('\n');
  return {
    subject: `Verify your ${o.appName} account`,
    html: layout(o.base, 'Confirm your email to start earning points and streaks.', body, 'If you didn’t create this account, you can ignore this email.'),
    text: `Welcome to ${o.appName}!\n\nConfirm your email address:\n${o.link}\n\nIf you didn't create this account, ignore this email.`,
  };
}

// ---------------- password reset ----------------

export function resetEmail(o: { base: string; appName: string; link: string }): Email {
  const body = [
    `<div style="text-align:center;font-size:44px;line-height:52px">🔑</div>`,
    h1('Reset your password'),
    p('Someone (hopefully you) asked to reset your password. This link works for 1 hour.'),
    button(o.link, 'Choose a new password'),
    p(`Button not working? Copy this link into your browser:<br><a href="${esc(o.link)}" style="color:${C.gold};word-break:break-all">${esc(o.link)}</a>`, 'font-size:12px;line-height:18px;margin-top:14px'),
  ].join('\n');
  return {
    subject: `Reset your ${o.appName} password`,
    html: layout(o.base, 'Choose a new password (link valid for 1 hour).', body, 'If this wasn’t you, ignore this email. Your password stays the same.'),
    text: `Someone asked to reset your password.\n\nChoose a new one here (valid for 1 hour):\n${o.link}\n\nIf this wasn't you, ignore this email.`,
  };
}
