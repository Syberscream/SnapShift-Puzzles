// Search engines and link previews: /sitemap.xml, and a proper title,
// description and picture on shareable pages (/play, /daily, /event,
// /category, /u, /slider). The page itself is the normal static page;
// only its <head> is filled in for that puzzle, event or player.

import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { DAILY_CATEGORY, EVENT_CATEGORY, getDaily, media, type PuzzleRow } from '../lib/catalog';
import { dayKey } from '../lib/util';

const app = new Hono<AppEnv>();

const SITE = 'SnapShift Puzzles';
const origin = (env: Env, url: string) => (env.DEV_MODE ? new URL(url).origin : (env.APP_URL || new URL(url).origin).replace(/\/$/, ''));
const abs = (base: string, path: string) => (!path ? '' : /^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`);

interface Meta {
  title: string;
  description: string;
  image?: string;
  /** Pixel size, when known (1200×630 share pictures). */
  wide?: boolean;
  url: string;
}

/** The picture for a puzzle's link preview: its 1200×630 JPEG, else the phone copy. */
const puzzleImage = (p: Pick<PuzzleRow, 'share_key' | 'small_key' | 'image_key' | 'original_key'>) =>
  media(p.share_key || p.small_key || p.image_key || p.original_key);

const clip = (s: string, n = 200) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

/** Serve the static page with its <head> filled in. */
async function page(c: { env: Env; req: { url: string; path: string; raw: Request } }, meta: Meta | null): Promise<Response> {
  const assetUrl = new URL(c.req.url);
  assetUrl.search = '';
  const res = await c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
  if (!meta || !res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  const set = (attr: string) => ({
    element: (e: Element) => {
      e.setAttribute('content', attr);
    },
  });
  const extra = [
    `<link rel="canonical" href="${esc(meta.url)}" />`,
    `<meta property="og:url" content="${esc(meta.url)}" />`,
    meta.image ? `<meta name="twitter:image" content="${esc(meta.image)}" />` : '',
    meta.image && meta.wide ? '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />' : '',
  ].join('');
  let rw = new HTMLRewriter()
    .on('title', { element: (e) => void e.setInnerContent(meta.title) })
    .on('meta[name="description"]', set(meta.description))
    .on('meta[property="og:title"]', set(meta.title))
    .on('meta[property="og:description"]', set(meta.description))
    .on('meta[property="og:image:width"]', { element: (e) => void e.remove() })
    .on('meta[property="og:image:height"]', { element: (e) => void e.remove() })
    .on('head', { element: (e) => void e.append(extra, { html: true }) });
  if (meta.image) rw = rw.on('meta[property="og:image"]', set(meta.image));
  const out = rw.transform(res);
  const headers = new Headers(out.headers);
  // The head depends on the query, so don't let it be cached as one page.
  headers.set('cache-control', 'public, max-age=300');
  return new Response(out.body, { status: out.status, headers });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

app.get('/play', async (c) => {
  const base = origin(c.env, c.req.url);
  const slug = c.req.query('p');
  const challengeId = c.req.query('challenge');
  try {
    if (challengeId) {
      const ch = await c.env.DB.prepare(
        `SELECT ch.elapsed_ms, ch.moves, u.username, p.* FROM challenges ch JOIN users u ON u.id = ch.user_id JOIN puzzles p ON p.id = ch.puzzle_id WHERE ch.id = ?`,
      )
        .bind(challengeId)
        .first<PuzzleRow & { elapsed_ms: number; moves: number; username: string }>();
      if (ch) {
        const s = Math.round(ch.elapsed_ms / 1000);
        return page(c, {
          title: `⚔ ${ch.username} challenges you: “${ch.title}” | ${SITE}`,
          description: `Same board, same start. Can you beat ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} in ${ch.moves} moves? Free to play in your browser.`,
          image: abs(base, puzzleImage(ch)),
          wide: !!ch.share_key,
          url: `${base}/play?challenge=${encodeURIComponent(challengeId)}`,
        });
      }
    }
    if (slug) {
      const p = await c.env.DB.prepare(
        "SELECT p.*, c.name AS category_name FROM puzzles p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.status = 'published'",
      )
        .bind(slug)
        .first<PuzzleRow & { category_name: string | null }>();
      if (p && p.category_id !== DAILY_CATEGORY) {
        const cat = p.category_id === EVENT_CATEGORY ? 'event' : (p.category_name || 'picture').toLowerCase();
        return page(c, {
          title: `${p.title}: Free Picture Tile Puzzle | ${SITE}`,
          description: clip(
            `${p.description ? p.description.replace(/\.?$/, '. ') : ''}Rebuild “${p.title}” by swapping the tiles back into place. A free ${cat} puzzle you play right in your browser, no download. Daily challenge, medals and streaks.`,
          ),
          image: abs(base, puzzleImage(p)),
          wide: !!p.share_key,
          url: `${base}/play?p=${encodeURIComponent(p.slug)}`,
        });
      }
    }
  } catch {
    /* fall back to the plain page */
  }
  return page(c, null);
});

app.get('/daily', async (c) => {
  const base = origin(c.env, c.req.url);
  const day = dayKey(c.env);
  const d = await getDaily(c.env, day).catch(() => null);
  const date = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  return page(c, {
    title: `Daily Picture Puzzle for ${date} | ${SITE}`,
    description: 'Today’s free daily picture puzzle: the same board for everyone. Swap the tiles back into place, earn a medal and keep your streak going.',
    image: d ? abs(base, puzzleImage(d.puzzle)) : `${base}/img/share.jpg`,
    wide: d ? !!d.puzzle.share_key : true,
    url: `${base}/daily`,
  });
});

app.get('/slider', async (c) => {
  const base = origin(c.env, c.req.url);
  const slug = c.req.query('p');
  const p = slug ? await c.env.DB.prepare("SELECT * FROM puzzles WHERE slug = ? AND status = 'published'").bind(slug).first<PuzzleRow>() : null;
  const t = await c.env.DB.prepare('SELECT p.* FROM slider_daily s JOIN puzzles p ON p.id = s.puzzle_id WHERE s.day = ?').bind(dayKey(c.env)).first<PuzzleRow>();
  const pic = p ?? t;
  return page(c, {
    title: p ? `${p.title}: Slider Puzzle | ${SITE}` : `Slider Puzzle: a New Sliding Tile Puzzle Every Day | ${SITE}`,
    description: 'Slide the tiles into the empty square to rebuild the picture. A free 4×4 slider every day with a leaderboard, plus 3×3 and 5×5 on any picture.',
    image: pic ? abs(base, puzzleImage(pic)) : `${base}/img/share.jpg`,
    wide: pic ? !!pic.share_key : true,
    url: p ? `${base}/slider?p=${encodeURIComponent(p.slug)}` : `${base}/slider`,
  });
});

app.get('/event', async (c) => {
  const base = origin(c.env, c.req.url);
  const id = c.req.query('e');
  if (id) {
    const e = await c.env.DB.prepare(
      `SELECT e.*, (SELECT COALESCE(p.share_key, p.small_key, p.image_key, p.original_key) FROM event_puzzles ep JOIN puzzles p ON p.id = ep.puzzle_id
         WHERE ep.event_id = e.id AND p.status = 'published' ORDER BY ep.sort, ep.puzzle_id LIMIT 1) AS cover, 
       (SELECT COUNT(*) FROM event_puzzles ep WHERE ep.event_id = e.id) AS n
       FROM events e WHERE e.id = ?`,
    )
      .bind(id)
      .first<{ id: string; title: string; description: string; image_url: string; starts: string; ends: string; cover: string | null; n: number }>();
    if (e) {
      const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return page(c, {
        title: `${e.title}: a Puzzle Event | ${SITE}`,
        description: clip(`${e.description ? e.description.replace(/\.?$/, '. ') : ''}${e.n} free picture puzzles, ${fmt(e.starts)} to ${fmt(e.ends)}. Same boards for everyone, a leaderboard and prizes for the top 3.`),
        image: abs(base, e.image_url || media(e.cover)),
        wide: !e.image_url && !!e.cover?.startsWith('share/'),
        url: `${base}/event?e=${encodeURIComponent(e.id)}`,
      });
    }
  }
  return page(c, {
    title: `Puzzle Events | ${SITE}`,
    description: 'Themed puzzle events with their own leaderboard and prizes. Free for everyone while they run.',
    image: `${base}/img/share.jpg`,
    wide: true,
    url: `${base}/event`,
  });
});

app.get('/category', async (c) => {
  const base = origin(c.env, c.req.url);
  const id = c.req.query('c');
  const cat = id
    ? await c.env.DB.prepare('SELECT id, name, description, tile_url FROM categories WHERE id = ? AND id NOT IN (?, ?)')
        .bind(id, DAILY_CATEGORY, EVENT_CATEGORY)
        .first<{ id: string; name: string; description: string; tile_url: string }>()
    : null;
  if (!cat) return page(c, null);
  const first = await c.env.DB.prepare("SELECT * FROM puzzles WHERE category_id = ? AND status = 'published' ORDER BY sort, id LIMIT 1").bind(cat.id).first<PuzzleRow>();
  return page(c, {
    title: `${cat.name} Picture Puzzles: Free Online Tile Puzzles | ${SITE}`,
    description: clip(`${cat.description ? cat.description.replace(/\.?$/, '. ') : ''}Free ${cat.name.toLowerCase()} picture puzzles you play in your browser. Swap the tiles, earn medals, no download.`),
    image: first ? abs(base, puzzleImage(first)) : abs(base, cat.tile_url),
    wide: !!first?.share_key,
    url: `${base}/category?c=${encodeURIComponent(cat.id)}`,
  });
});

app.get('/u', async (c) => {
  const base = origin(c.env, c.req.url);
  const name = c.req.query('name') || '';
  const u = await c.env.DB.prepare(
    `SELECT u.username,
       (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id AND p.completed_at IS NOT NULL) AS done,
       (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id AND p.medal = 'gold') AS golds,
       (SELECT COUNT(*) FROM user_achievements a WHERE a.user_id = u.id) AS ach
     FROM users u WHERE u.username = ? AND u.profile_public = 1`,
  )
    .bind(name)
    .first<{ username: string; done: number; golds: number; ach: number }>();
  if (!u) return page(c, null);
  return page(c, {
    title: `${u.username} on ${SITE}`,
    description: `${u.done} puzzles finished, ${u.golds} gold medals and ${u.ach} achievements. Play free picture puzzles with a daily challenge.`,
    image: `${base}/img/share.jpg`,
    wide: true,
    url: `${base}/u?name=${encodeURIComponent(u.username)}`,
  });
});

/** Every public page, for search engines. */
app.get('/sitemap.xml', async (c) => {
  const base = origin(c.env, c.req.url);
  const today = dayKey(c.env);
  const urls: { loc: string; lastmod?: string; priority?: string; freq?: string }[] = [
    { loc: '/', priority: '1.0', freq: 'daily' },
    { loc: '/daily', priority: '0.9', freq: 'daily', lastmod: today },
    { loc: '/categories', priority: '0.8', freq: 'daily' },
    { loc: '/slider', priority: '0.7', freq: 'daily', lastmod: today },
    { loc: '/time-attack', priority: '0.7', freq: 'weekly' },
    { loc: '/event', priority: '0.6', freq: 'weekly' },
    { loc: '/leaderboard', priority: '0.5', freq: 'daily' },
    { loc: '/how-to-play', priority: '0.5', freq: 'monthly' },
    { loc: '/faq', priority: '0.4', freq: 'monthly' },
    { loc: '/plus', priority: '0.4', freq: 'monthly' },
    { loc: '/about', priority: '0.3', freq: 'monthly' },
  ];
  const [cats, puzzles, evs] = await Promise.all([
    c.env.DB.prepare('SELECT id FROM categories WHERE id NOT IN (?, ?) AND members_only = 0 ORDER BY sort').bind(DAILY_CATEGORY, EVENT_CATEGORY).all<{ id: string }>(),
    c.env.DB.prepare(
      `SELECT p.slug, p.published_at FROM puzzles p JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'published' AND c.id NOT IN (?, ?) AND c.members_only = 0 ORDER BY p.published_at DESC LIMIT 5000`,
    )
      .bind(DAILY_CATEGORY, EVENT_CATEGORY)
      .all<{ slug: string; published_at: number | null }>(),
    c.env.DB.prepare('SELECT id, starts FROM events WHERE ends >= date(?, ?) ORDER BY starts DESC LIMIT 50').bind(today, '-90 days').all<{ id: string; starts: string }>(),
  ]);
  for (const x of cats.results) urls.push({ loc: `/category?c=${encodeURIComponent(x.id)}`, priority: '0.7', freq: 'weekly' });
  for (const x of evs.results) urls.push({ loc: `/event?e=${encodeURIComponent(x.id)}`, priority: '0.6', freq: 'daily', lastmod: x.starts });
  for (const x of puzzles.results) {
    urls.push({
      loc: `/play?p=${encodeURIComponent(x.slug)}`,
      priority: '0.6',
      freq: 'monthly',
      lastmod: x.published_at ? new Date(x.published_at).toISOString().slice(0, 10) : undefined,
    });
  }
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `  <url><loc>${esc(base + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.freq ? `<changefreq>${u.freq}</changefreq>` : ''}${u.priority ? `<priority>${u.priority}</priority>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n';
  return c.body(body, 200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' });
});

export default app;
