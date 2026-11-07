// Admin → Analytics: how the game is being played (from our own database) and,
// when connected, site traffic from Cloudflare Web Analytics.

import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { plusSql } from '../lib/membership';
import { body, dayKey, fail, getSetting, now, putSetting, str } from '../lib/util';

const app = new Hono<AppEnv>();

const DAY = 86400_000;
const RANGES = [7, 30, 90];
const rangeOf = (q: string | undefined) => (RANGES.includes(Number(q)) ? Number(q) : 30);

/** Seconds to add to a UTC timestamp to get local wall-clock time in the site timezone (right now). */
function tzOffsetSec(env: Env, at = now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.TIMEZONE || 'UTC',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((local - at) / 1000 / 60) * 60;
}

/** The last `days` day keys, oldest first, ending today (site timezone). */
function dayList(env: Env, days: number): string[] {
  const t = now();
  return Array.from({ length: days }, (_, i) => dayKey(env, t - (days - 1 - i) * DAY));
}

app.get('/game', async (c) => {
  const env = c.env;
  const days = rangeOf(c.req.query('days'));
  const list = dayList(env, days);
  const from = list[0];
  const off = tzOffsetSec(env);
  // Local day of a ms timestamp column, in SQL.
  const d = (col: string) => `date(${col} / 1000 + ${off}, 'unixepoch')`;
  const since = now() - (days + 1) * DAY; // index-friendly pre-filter; exact range by day key
  const all = <T>(sql: string, ...args: unknown[]) =>
    env.DB.prepare(sql)
      .bind(...args)
      .all<T>()
      .then((r) => r.results);
  const one = <T>(sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(...args).first<T>();

  const [signups, active, finishes, started, dailyPlayers, taRuns, top, cats, difficulty, modes, medals, helpers, points, totals, returning] = await Promise.all([
    all<{ day: string; n: number }>(`SELECT ${d('created_at')} AS day, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY day`, since),
    all<{ day: string; n: number }>(`SELECT ${d('updated_at')} AS day, COUNT(DISTINCT user_id) AS n FROM plays WHERE updated_at > ? GROUP BY day`, since),
    all<{ day: string; n: number }>(`SELECT ${d('completed_at')} AS day, COUNT(*) AS n FROM plays WHERE completed_at > ? GROUP BY day`, since),
    all<{ day: string; n: number }>(`SELECT ${d('started_at')} AS day, COUNT(*) AS n FROM plays WHERE started_at > ? GROUP BY day`, since),
    all<{ day: string; n: number }>('SELECT day, COUNT(*) AS n FROM daily_results WHERE day >= ? GROUP BY day', from),
    all<{ day: string; n: number }>('SELECT day, COUNT(*) AS n FROM time_attack_runs WHERE day >= ? AND finished_at IS NOT NULL GROUP BY day', from),
    all<{ slug: string; title: string; category: string | null; n: number; players: number; avg: number }>(
      `SELECT p.slug, p.title, c.name AS category, COUNT(*) AS n, COUNT(DISTINCT pl.user_id) AS players, ROUND(AVG(pl.score_pct)) AS avg
       FROM plays pl JOIN puzzles p ON p.id = pl.puzzle_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE pl.completed_at > ? AND pl.daily_day IS NULL
       GROUP BY p.id ORDER BY n DESC LIMIT 10`,
      now() - days * DAY,
    ),
    all<{ name: string; n: number }>(
      `SELECT COALESCE(c.name, 'Daily') AS name, COUNT(*) AS n
       FROM plays pl JOIN puzzles p ON p.id = pl.puzzle_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE pl.completed_at > ? GROUP BY name ORDER BY n DESC LIMIT 12`,
      now() - days * DAY,
    ),
    all<{ k: string; n: number }>('SELECT difficulty AS k, COUNT(*) AS n FROM plays WHERE completed_at > ? GROUP BY k ORDER BY n DESC', now() - days * DAY),
    all<{ k: string; n: number }>('SELECT mode AS k, COUNT(*) AS n FROM plays WHERE completed_at > ? GROUP BY k ORDER BY n DESC', now() - days * DAY),
    all<{ k: string; n: number }>('SELECT medal AS k, COUNT(*) AS n FROM plays WHERE completed_at > ? AND medal IS NOT NULL GROUP BY k', now() - days * DAY),
    all<{ k: string; n: number }>("SELECT reason AS k, COUNT(*) AS n FROM points_ledger WHERE created_at > ? AND reason IN ('hint', 'place') GROUP BY k", now() - days * DAY),
    one<{ earned: number; spent: number }>(
      'SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta END), 0) AS earned, COALESCE(-SUM(CASE WHEN delta < 0 THEN delta END), 0) AS spent FROM points_ledger WHERE created_at > ?',
      now() - days * DAY,
    ),
    one<{ users: number; verified: number; plus: number; lifetime: number }>(
      `SELECT COUNT(*) AS users, SUM(email_verified) AS verified, SUM(CASE WHEN ${plusSql('users')} AND role != 'admin' THEN 1 ELSE 0 END) AS plus, SUM(lifetime) AS lifetime FROM users`,
    ),
    // Players active in the range who joined before it.
    one<{ n: number; total: number }>(
      `SELECT SUM(CASE WHEN u.created_at < ? THEN 1 ELSE 0 END) AS n, COUNT(*) AS total
       FROM users u WHERE u.id IN (SELECT DISTINCT user_id FROM plays WHERE updated_at > ?)`,
      now() - days * DAY,
      now() - days * DAY,
    ),
  ]);

  const series = (rows: { day: string; n: number }[]) => {
    const m = new Map(rows.map((r) => [r.day, r.n]));
    return list.map((day) => m.get(day) ?? 0);
  };
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const s = {
    signups: series(signups),
    activePlayers: series(active),
    finishes: series(finishes),
    started: series(started),
    dailyPlayers: series(dailyPlayers),
    timeAttackRuns: series(taRuns),
  };
  const uniqueActive = await one<{ n: number }>('SELECT COUNT(DISTINCT user_id) AS n FROM plays WHERE updated_at > ?', now() - days * DAY);
  const startedN = sum(s.started);
  return c.json({
    days,
    labels: list,
    series: s,
    summary: {
      players: totals?.users ?? 0,
      verified: totals?.verified ?? 0,
      plusMembers: totals?.plus ?? 0,
      lifetime: totals?.lifetime ?? 0,
      newPlayers: sum(s.signups),
      activePlayers: uniqueActive?.n ?? 0,
      returningPlayers: returning?.n ?? 0,
      started: startedN,
      finished: sum(s.finishes),
      finishRate: startedN ? Math.round((sum(s.finishes) / startedN) * 100) : null,
      dailyResults: sum(s.dailyPlayers),
      timeAttackRuns: sum(s.timeAttackRuns),
      pointsEarned: points?.earned ?? 0,
      pointsSpent: points?.spent ?? 0,
    },
    topPuzzles: top,
    categories: cats,
    difficulty,
    modes,
    medals,
    helpers,
  });
});

// ---------- Cloudflare Web Analytics ----------

interface TrafficSettings {
  accountId: string;
  siteTag: string;
}
const TRAFFIC_DEFAULTS: TrafficSettings = { accountId: '', siteTag: '' };
const hex32 = (v: unknown) => {
  const s = str(v, 64).trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(s) ? s : '';
};

app.get('/traffic/settings', async (c) =>
  c.json({ ...(await getSetting<TrafficSettings>(c.env, 'traffic', TRAFFIC_DEFAULTS)), tokenSet: !!c.env.CF_ANALYTICS_TOKEN }),
);

app.put('/traffic/settings', async (c) => {
  const b = await body(c);
  const next = { accountId: hex32(b.accountId), siteTag: hex32(b.siteTag) };
  if ((b.accountId && !next.accountId) || (b.siteTag && !next.siteTag)) fail(422, 'The account ID and site tag are each 32 letters and numbers.');
  await putSetting(c.env, 'traffic', next);
  return c.json({ ...next, tokenSet: !!c.env.CF_ANALYTICS_TOKEN });
});

type Group = { count: number; sum?: { visits: number }; dimensions?: Record<string, string> };

async function rum(env: Env, s: TrafficSettings, from: string, to: string, part: string, noBots = true): Promise<Group[]> {
  // `part` is "limit: N, orderBy: [...] | dimensions { x }" split below.
  const [args, dims] = part.split('|');
  const q = `query($a: String!, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
    viewer { accounts(filter: { accountTag: $a }) { r: rumPageloadEventsAdaptiveGroups(${args}, filter: $f) { count sum { visits } ${dims || ''} } } }
  }`;
  const base = env.CF_API_BASE_URL || 'https://api.cloudflare.com/client/v4';
  const res = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { a: s.accountId, f: { siteTag: s.siteTag, date_geq: from, date_leq: to, ...(noBots ? { bot: 0 } : {}) } } }),
  });
  const j = (await res.json().catch(() => null)) as { data?: { viewer: { accounts: { r: Group[] }[] } }; errors?: { message: string }[] } | null;
  // If this dataset doesn't know the bot filter, ask again without it.
  if (noBots && j?.errors?.some((e) => /\bbot\b/.test(e.message))) return rum(env, s, from, to, part, false);
  if (!res.ok || !j || j.errors?.length) throw new Error(j?.errors?.[0]?.message || `Cloudflare answered ${res.status}`);
  return j.data?.viewer.accounts[0]?.r ?? [];
}

app.get('/traffic', async (c) => {
  const env = c.env;
  const days = Math.min(30, rangeOf(c.req.query('days')));
  const s = await getSetting<TrafficSettings>(env, 'traffic', TRAFFIC_DEFAULTS);
  if (!env.CF_ANALYTICS_TOKEN || !s.accountId || !s.siteTag) return c.json({ connected: false, tokenSet: !!env.CF_ANALYTICS_TOKEN, days });
  const labels = dayList(env, days);
  const from = labels[0];
  const to = labels[labels.length - 1];
  const parts = {
    total: 'limit: 1|',
    days: 'limit: 100, orderBy: [date_ASC]|dimensions { date }',
    pages: 'limit: 10, orderBy: [count_DESC]|dimensions { requestPath }',
    referrers: 'limit: 10, orderBy: [count_DESC]|dimensions { refererHost }',
    countries: 'limit: 10, orderBy: [count_DESC]|dimensions { countryName }',
    devices: 'limit: 5, orderBy: [count_DESC]|dimensions { deviceType }',
  } as const;
  const keys = Object.keys(parts) as (keyof typeof parts)[];
  // Separately, so one failing part doesn't blank the rest.
  const settled = await Promise.allSettled(keys.map((k) => rum(env, s, from, to, parts[k])));
  const out: Record<string, unknown> = { connected: true, days, labels };
  const errors: string[] = [];
  settled.forEach((r, i) => {
    const k = keys[i];
    if (r.status === 'rejected') {
      errors.push(`${k}: ${(r.reason as Error).message}`);
      out[k] = null;
      return;
    }
    const g = r.value;
    if (k === 'total') out.total = { pageViews: g[0]?.count ?? 0, visits: g[0]?.sum?.visits ?? 0 };
    else if (k === 'days') {
      const m = new Map(g.map((x) => [x.dimensions!.date, x]));
      out.series = { pageViews: labels.map((d) => m.get(d)?.count ?? 0), visits: labels.map((d) => m.get(d)?.sum?.visits ?? 0) };
    } else out[k] = g.map((x) => ({ name: Object.values(x.dimensions ?? {})[0] || (k === 'referrers' ? 'Direct / unknown' : '(unknown)'), views: x.count, visits: x.sum?.visits ?? 0 }));
  });
  // The whole query failing the same way usually means a token or ID problem.
  if (errors.length === keys.length) return c.json({ connected: true, error: errors[0].replace(/^\w+: /, ''), days });
  return c.json({ ...out, errors });
});

export default app;
