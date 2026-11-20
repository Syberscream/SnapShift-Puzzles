// Admin → Etsy prep. The heavy work (upscaling, crops, listing photos, the zip)
// happens in the admin's browser; the server keeps the listing text, the status
// and the room mockups, and asks Cloudflare's AI to write listing text.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { media, type PuzzleRow } from '../lib/catalog';
import { body, fail, int, now, randomId, str } from '../lib/util';
import { cleanTags, draftListing, ETSY, type EtsyStatus } from '../../shared/etsy';

const app = new Hono<AppEnv>();

interface ItemRow {
  puzzle_id: number;
  status: EtsyStatus;
  title: string | null;
  intro: string | null;
  tags: string | null;
  focus: number | null;
  etsy_url: string | null;
  prepared_at: number | null;
  updated_at: number;
  mockups: string | null;
  fit: number | null;
}
interface UploadRow {
  id: number;
  name: string;
  original_key: string;
  image_key: string;
  thumb_key: string;
  width: number;
  height: number;
  created_at: number;
}
interface MockupRow {
  id: number;
  name: string;
  image_key: string;
  width: number;
  height: number;
  corners: string | null;
  active: number;
  created_at: number;
}

const mockupView = (m: MockupRow) => ({
  id: m.id,
  name: m.name,
  image: media(m.image_key),
  width: m.width,
  height: m.height,
  corners: m.corners ? (JSON.parse(m.corners) as [number, number][]) : null,
  active: !!m.active,
});

/** A picture's Etsy details (or a first draft) in the shape the admin page uses. */
function itemView(
  base: { id: number; slug: string; name: string; category: string | null; original: string; image: string; thumb: string; upload: boolean; description?: string | null },
  e: ItemRow | undefined,
) {
  const draft = draftListing({ title: base.name, description: base.description ?? undefined, category: base.upload ? null : base.category });
  return {
    id: base.id,
    slug: base.slug,
    name: base.name,
    category: base.category,
    original: base.original,
    image: base.image,
    thumb: base.thumb,
    upload: base.upload,
    status: e?.status ?? 'none',
    title: e?.title ?? draft.title,
    intro: e?.intro ?? draft.intro,
    tags: e?.tags ? (JSON.parse(e.tags) as string[]) : draft.tags,
    written: !!e?.title,
    focus: e?.focus ?? 0.5,
    // Uploads (posters, blueprints…) keep their whole picture unless told otherwise.
    fit: e?.fit == null ? base.upload : !!e.fit,
    etsyUrl: e?.etsy_url ?? null,
    mockupIds: e?.mockups ? (JSON.parse(e.mockups) as number[]) : [],
    preparedAt: e?.prepared_at ?? null,
  };
}

const uploadBase = (u: UploadRow) => ({
  id: -u.id,
  slug: '',
  name: u.name,
  category: 'My uploads',
  original: media(u.original_key),
  image: media(u.image_key),
  thumb: media(u.thumb_key),
  upload: true,
});

/** Every published picture and every upload with its Etsy details, plus the mockups. */
app.get('/', async (c) => {
  const [p, items, cats, mocks, ups] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM puzzles WHERE status = 'published' ORDER BY id DESC").all<PuzzleRow>(),
    c.env.DB.prepare('SELECT * FROM etsy_items').all<ItemRow>(),
    c.env.DB.prepare('SELECT id, name FROM categories').all<{ id: string; name: string }>(),
    c.env.DB.prepare('SELECT * FROM etsy_mockups ORDER BY id').all<MockupRow>(),
    c.env.DB.prepare('SELECT * FROM etsy_uploads ORDER BY id DESC').all<UploadRow>(),
  ]);
  const byId = new Map(items.results.map((x) => [x.puzzle_id, x]));
  const catName = new Map(cats.results.map((x) => [x.id, x.name]));
  return c.json({
    puzzles: [
      ...ups.results.map((u) => itemView(uploadBase(u), byId.get(-u.id))),
      ...p.results.map((x) =>
        itemView(
          {
            id: x.id,
            slug: x.slug,
            name: x.title,
            description: x.description,
            category: x.category_id ? (catName.get(x.category_id) ?? null) : null,
            original: media(x.original_key),
            image: media(x.image_key || x.original_key),
            thumb: media(x.thumb_key || x.image_key || x.original_key),
            upload: false,
          },
          byId.get(x.id),
        ),
      ),
    ],
    mockups: mocks.results.map(mockupView),
    ai: !!c.env.AI,
  });
});

/** Up to 7 mockups per listing (Etsy allows 10 photos; 3 are the sizes chart, close-up and download card). */
export const MAX_MOCKUPS = ETSY.photos - 3;
function mockupIds(v: unknown): number[] {
  const out: number[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  if (out.length > MAX_MOCKUPS) fail(422, `Pick at most ${MAX_MOCKUPS} mockups for one listing.`);
  return out;
}

async function save(c: { env: AppEnv['Bindings'] }, id: number, b: Record<string, unknown>) {
  // Uploads use negative ids (-1 is upload 1).
  const p = id < 0
    ? await c.env.DB.prepare('SELECT id FROM etsy_uploads WHERE id = ?').bind(-id).first()
    : await c.env.DB.prepare("SELECT id FROM puzzles WHERE id = ? AND status = 'published'").bind(id).first();
  if (!p) fail(404, 'Picture not found.');
  const cur = await c.env.DB.prepare('SELECT * FROM etsy_items WHERE puzzle_id = ?').bind(id).first<ItemRow>();
  const status = (['none', 'prepared', 'listed'] as const).includes(b.status as EtsyStatus) ? (b.status as EtsyStatus) : (cur?.status ?? 'none');
  const url = b.etsyUrl !== undefined ? str(b.etsyUrl, 300) : (cur?.etsy_url ?? '');
  if (url && !/^https:\/\/([a-z0-9-]+\.)*etsy\.com\//i.test(url)) fail(422, 'That doesn’t look like an Etsy link (it should start with https://www.etsy.com/).');
  const row = {
    status,
    title: b.title !== undefined ? str(b.title, ETSY.titleMax) : (cur?.title ?? null),
    intro: b.intro !== undefined ? str(b.intro, 3000) : (cur?.intro ?? null),
    tags: b.tags !== undefined ? JSON.stringify(cleanTags(b.tags)) : (cur?.tags ?? null),
    focus: b.focus !== undefined ? Math.max(0, Math.min(1, Number(b.focus) || 0.5)) : (cur?.focus ?? null),
    etsy_url: url || null,
    mockups: b.mockupIds !== undefined ? JSON.stringify(mockupIds(b.mockupIds)) : (cur?.mockups ?? null),
    fit: b.fit !== undefined ? (b.fit ? 1 : 0) : (cur?.fit ?? null),
    prepared_at: status === 'prepared' && cur?.status !== 'prepared' ? now() : (cur?.prepared_at ?? null),
  };
  await c.env.DB.prepare(
    `INSERT INTO etsy_items (puzzle_id, status, title, intro, tags, focus, etsy_url, prepared_at, mockups, fit, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(puzzle_id) DO UPDATE SET status = excluded.status, title = excluded.title, intro = excluded.intro, tags = excluded.tags,
       focus = excluded.focus, etsy_url = excluded.etsy_url, prepared_at = excluded.prepared_at, mockups = excluded.mockups, fit = excluded.fit, updated_at = excluded.updated_at`,
  )
    .bind(id, row.status, row.title, row.intro, row.tags, row.focus, row.etsy_url, row.prepared_at, row.mockups, row.fit, now())
    .run();
  return {
    ...row,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : null,
    mockupIds: row.mockups ? (JSON.parse(row.mockups) as number[]) : [],
    fit: row.fit == null ? id < 0 : !!row.fit,
  };
}

app.put('/items/:id', async (c) => c.json(await save(c, int(c.req.param('id')), await body(c))));

/** The same mockups for several pictures at once. */
app.put('/items-mockups', async (c) => {
  const b = await body<{ ids?: unknown; mockupIds?: unknown }>(c);
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n !== 0).slice(0, 500);
  if (!ids.length) fail(422, 'Select some pictures first.');
  const m = mockupIds(b.mockupIds);
  for (const id of ids) await save(c, id, { mockupIds: m });
  return c.json({ ok: true, count: ids.length, mockupIds: m });
});

// ---------- AI listing text ----------

const AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

const PROMPT = `You write Etsy listings for printable digital wall art (instant download).
Look at the picture and reply with ONLY a JSON object, no other text:
{"title": "...", "intro": "...", "tags": ["...", ...]}
Rules:
- title: at most 140 characters. Start with the main subject, then 3 to 5 search phrases buyers would type, separated by commas (style, colours, room or theme), ending with "Digital Download". No ALL CAPS, no emoji.
- intro: two short paragraphs, warm and specific about what is IN the picture (subject, setting, colours, mood), then which rooms it suits and who it would make a nice gift for. Under 90 words. Don't mention sizes, files, AI or printing.
- tags: exactly 13, lower case, each at most 20 characters including spaces, no repeats, phrases buyers search for (subject, style, colours, room, occasion).`;

app.post('/items/:id/write', async (c) => {
  const id = int(c.req.param('id'));
  const b = await body<{ image?: string; name?: string; category?: string }>(c);
  if (!c.env.AI) fail(503, 'Cloudflare AI isn’t set up for this site yet.');
  const image = str(b.image, 2_000_000);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) fail(422, 'Send the picture as an image.');
  const hint = `Picture name: "${str(b.name, 80)}"${b.category ? `. Category: ${str(b.category, 40)}` : ''}.`;
  let text = '';
  try {
    const r = (await c.env.AI.run(AI_MODEL as never, {
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: [{ type: 'text', text: hint }, { type: 'image_url', image_url: { url: image } }] },
      ],
      max_tokens: 900,
      temperature: 0.6,
    } as never)) as { response?: unknown };
    text = typeof r?.response === 'string' ? r.response : JSON.stringify(r?.response ?? '');
  } catch (e) {
    fail(502, `The AI couldn’t write this one (${String((e as Error)?.message ?? e).slice(0, 120)}).`);
  }
  const m = text.match(/\{[\s\S]*\}/);
  let out: { title?: unknown; intro?: unknown; tags?: unknown } = {};
  try {
    out = JSON.parse(m ? m[0] : text);
  } catch {
    fail(502, 'The AI’s answer wasn’t in the right shape. Try again.');
  }
  const title = str(out.title, 400).replace(/\s+/g, ' ');
  const intro = str(out.intro, 3000);
  const tags = cleanTags(out.tags);
  if (!title || !intro || tags.length < 5) fail(502, 'The AI’s answer was incomplete. Try again.');
  // Trim a long title at the last comma that fits.
  const fit = title.length <= ETSY.titleMax ? title : title.slice(0, ETSY.titleMax).replace(/,[^,]*$/, '');
  return c.json(await save(c, id, { title: fit, intro, tags }));
});

// ---------- your own pictures ----------

const IMG_TYPES = /^image\/(png|jpeg|webp)$/;
const ext = (type: string) => type.split('/')[1].replace('jpeg', 'jpg');

/** One picture (a poster, a blueprint…) with a preview and a thumbnail the browser made. */
app.post('/uploads', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  const preview = form.get('preview');
  const thumb = form.get('thumb');
  if (!(file instanceof File)) fail(422, 'Choose a picture.');
  if (!(preview instanceof File) || !(thumb instanceof File)) fail(422, 'The preview images are missing. Reload the page and try again.');
  if (file.size > 60 * 1024 * 1024) fail(422, 'Pictures must be under 60 MB.');
  if (!IMG_TYPES.test(file.type)) fail(422, 'Use PNG, JPEG or WebP.');
  if (preview.size > 8 * 1024 * 1024 || thumb.size > 2 * 1024 * 1024 || preview.type !== 'image/jpeg' || thumb.type !== 'image/jpeg') fail(422, 'The preview images are the wrong kind.');
  const w = int(form.get('width'));
  const h = int(form.get('height'));
  if (Math.min(w, h) < 1000) fail(422, 'That picture is too small to print well. Use one at least 2000 pixels on its short side.');
  const base = `etsy/uploads/${randomId(8)}`;
  const meta = (type: string) => ({ httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  const keys = { original: `${base}.${ext(file.type)}`, image: `${base}-preview.jpg`, thumb: `${base}-thumb.jpg` };
  await Promise.all([
    c.env.MEDIA.put(keys.original, await file.arrayBuffer(), meta(file.type)),
    c.env.MEDIA.put(keys.image, await preview.arrayBuffer(), meta('image/jpeg')),
    c.env.MEDIA.put(keys.thumb, await thumb.arrayBuffer(), meta('image/jpeg')),
  ]);
  const name = str(form.get('name'), 80) || file.name.replace(/\.[^.]+$/, '') || 'Untitled';
  const r = await c.env.DB.prepare('INSERT INTO etsy_uploads (name, original_key, image_key, thumb_key, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(name, keys.original, keys.image, keys.thumb, w, h, now())
    .first<UploadRow>();
  return c.json(itemView(uploadBase(r!), undefined));
});

app.put('/uploads/:id', async (c) => {
  const id = int(c.req.param('id'));
  const b = await body<{ name?: string }>(c);
  const name = str(b.name, 80);
  if (!name) fail(422, 'Give the picture a name.');
  const r = await c.env.DB.prepare('UPDATE etsy_uploads SET name = ? WHERE id = ? RETURNING id').bind(name, id).first();
  if (!r) fail(404, 'Picture not found.');
  return c.json({ ok: true, name });
});

app.delete('/uploads/:id', async (c) => {
  const u = await c.env.DB.prepare('SELECT * FROM etsy_uploads WHERE id = ?').bind(int(c.req.param('id'))).first<UploadRow>();
  if (!u) fail(404, 'Picture not found.');
  await c.env.MEDIA.delete([u.original_key, u.image_key, u.thumb_key]);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM etsy_uploads WHERE id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM etsy_items WHERE puzzle_id = ?').bind(-u.id),
  ]);
  return c.json({ ok: true });
});

// ---------- mockups ----------

app.post('/mockups', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) fail(422, 'Choose a mockup picture.');
  if (file.size > 25 * 1024 * 1024) fail(422, 'Mockups must be under 25 MB.');
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) fail(422, 'Use PNG, JPEG or WebP.');
  const w = int(form.get('width'));
  const h = int(form.get('height'));
  if (w < 400 || h < 300) fail(422, 'That mockup is too small. Use one at least 2000 pixels wide.');
  const key = `etsy/mockups/${randomId(8)}.${ext(file.type)}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  const name = str(form.get('name'), 60) || file.name.replace(/\.[^.]+$/, '');
  // The first few uploads become the defaults; later ones are picked per picture.
  const defaults = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM etsy_mockups WHERE active = 1').first<{ n: number }>())?.n ?? 0;
  const r = await c.env.DB.prepare('INSERT INTO etsy_mockups (name, image_key, width, height, active, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(name, key, w, h, defaults < MAX_MOCKUPS ? 1 : 0, now())
    .first<MockupRow>();
  return c.json(mockupView(r!));
});

app.put('/mockups/:id', async (c) => {
  const id = int(c.req.param('id'));
  const b = await body<{ name?: string; corners?: unknown; active?: boolean }>(c);
  const m = await c.env.DB.prepare('SELECT * FROM etsy_mockups WHERE id = ?').bind(id).first<MockupRow>();
  if (!m) fail(404, 'Mockup not found.');
  let corners = m.corners;
  if (b.corners !== undefined) {
    const k = b.corners as unknown[];
    const ok = Array.isArray(k) && k.length === 4 && k.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= -0.05 && v <= 1.05));
    if (!ok) fail(422, 'Mark the four corners of the frame.');
    corners = JSON.stringify(k);
  }
  await c.env.DB.prepare('UPDATE etsy_mockups SET name = ?, corners = ?, active = ? WHERE id = ?')
    .bind(b.name !== undefined ? str(b.name, 60) || m.name : m.name, corners, b.active === undefined ? m.active : b.active ? 1 : 0, id)
    .run();
  return c.json(mockupView({ ...m, name: b.name !== undefined ? str(b.name, 60) || m.name : m.name, corners, active: b.active === undefined ? m.active : b.active ? 1 : 0 }));
});

app.delete('/mockups/:id', async (c) => {
  const m = await c.env.DB.prepare('SELECT * FROM etsy_mockups WHERE id = ?').bind(int(c.req.param('id'))).first<MockupRow>();
  if (!m) fail(404, 'Mockup not found.');
  await c.env.MEDIA.delete(m.image_key);
  await c.env.DB.prepare('DELETE FROM etsy_mockups WHERE id = ?').bind(m.id).run();
  return c.json({ ok: true });
});

export default app;
