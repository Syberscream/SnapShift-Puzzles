// Picture pack for the game-portal edition (CrazyGames, Poki, itch.io …).
// The portal build bundles these pictures, so the game runs from the portal's
// own servers; this endpoint is only read when that build is made.

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { HIDDEN_CATEGORIES_SQL, imageFields, media, type PuzzleRow } from '../lib/catalog';
import { int, now } from '../lib/util';

const app = new Hono<AppEnv>();

app.get('/pack', async (c) => {
  const per = Math.max(1, Math.min(10, int(c.req.query('per'), 4)));
  // Oldest pictures first in each category, so Plus members' newest early-access
  // pictures are the last to be used (and a brand-new site still gets a full pack).
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, c.name AS category_name, c.sort AS category_sort FROM puzzles p JOIN categories c ON c.id = p.category_id
     WHERE p.status = 'published' AND p.category_id NOT IN ${HIDDEN_CATEGORIES_SQL} AND COALESCE(c.members_only, 0) = 0
     ORDER BY c.sort, c.name, COALESCE(p.published_at, 0), p.sort, p.id`,
  ).all<PuzzleRow & { category_name: string; category_sort: number }>();
  const taken = new Map<string, number>();
  const puzzles = results.flatMap((p) => {
    const n = taken.get(p.category_id!) ?? 0;
    if (n >= per) return [];
    taken.set(p.category_id!, n + 1);
    const img = imageFields(p);
    return [{ slug: p.slug, title: p.title, category: p.category_name, image: img.imageSmall || img.image, thumb: media(p.thumb_key || p.small_key || p.image_key) }];
  });
  return c.json({ puzzles, made: now() }, 200, { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=600' });
});

export default app;
