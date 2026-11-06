// Automated puzzle creation.
//
// Every cron tick (and when an admin presses "Run now"):
//   1. plan():   if automatic generation is on and today's quota isn't met, queue jobs
//                for the categories with the fewest puzzles waiting for review.
//   2. submit(): send queued jobs to ElevenLabs.
//   3. poll():   check submitted jobs; download finished images into R2 and add them
//                to the review queue as "pending" puzzles.
// Nothing is published without an admin approving it.

import type { Env } from '../env';
import { rng, randomSeed } from '../../shared/engine';
import { dayKey, getSetting, now, randomId, slugify } from '../lib/util';
import { DAILY_CATEGORY, dailyPoolLeft } from '../lib/catalog';
import { createImage, ElevenLabsError, getImage } from './elevenlabs';
import { pickIdea, uniqueTitle } from './prompts';

export interface GenerationSettings {
  /** Automatic generation on the cron schedule. */
  enabled: boolean;
  /** How many images to generate per 24 hours in total. */
  perDay: number;
  /** Stop generating while this many puzzles are waiting for review. */
  maxPending: number;
  model: string;
  /** Extra model fields sent with every request, e.g. {"aspect_ratio":"16:9","resolution":"2K"}. */
  options: Record<string, unknown>;
  /** Restrict automatic generation to these categories (empty = all with "generate" on). */
  categories: string[];
  /** Keep at least this many unused puzzles ready for the daily challenge (0 = off). */
  dailyPoolTarget: number;
}

export const GENERATION_DEFAULTS: GenerationSettings = {
  enabled: false,
  perDay: 4,
  maxPending: 24,
  model: 'gemini-3-pro-image',
  options: { aspect_ratio: '16:9', resolution: '2K' },
  categories: [],
  dailyPoolTarget: 14,
};

const MAX_ATTEMPTS = 3;
const JOB_TIMEOUT_MS = 2 * 3600_000;

interface JobRow {
  id: string;
  status: string; // queued | submitting | submitted | downloading | done | failed
  category_id: string | null;
  title: string;
  prompt: string;
  model: string;
  options: string;
  remote_id: string | null;
  attempts: number;
  created_at: number;
}

/**
 * Lower-case titles already used in a category: puzzles in any state (published,
 * waiting for review, rejected-but-kept) plus generations that haven't failed.
 */
export async function takenTitles(env: Env, categoryId: string | null): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `SELECT LOWER(title) AS t FROM puzzles WHERE category_id IS ?
     UNION SELECT LOWER(title) FROM generation_jobs WHERE category_id IS ? AND status != 'failed'`,
  )
    .bind(categoryId, categoryId)
    .all<{ t: string }>();
  return new Set(results.map((r) => r.t));
}

/**
 * Queue a generation. Pass `reserved: true` when the title came from pickIdea with a
 * set from takenTitles (already unique); otherwise it's made unique here ("Red Fox 2").
 */
export async function queueJob(
  env: Env,
  settings: GenerationSettings,
  job: { categoryId: string | null; title: string; prompt: string },
  reserved = false,
): Promise<string> {
  if (!reserved) job = { ...job, title: uniqueTitle(job.title, await takenTitles(env, job.categoryId)) };
  const id = randomId(10);
  await env.DB.prepare(
    `INSERT INTO generation_jobs (id, status, category_id, title, prompt, model, options, created_at, updated_at)
     VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, job.categoryId, job.title, job.prompt, settings.model, JSON.stringify(settings.options ?? {}), now(), now())
    .run();
  return id;
}

async function plan(env: Env, s: GenerationSettings, log: string[]): Promise<void> {
  if (!s.enabled) return;
  // perDay is a rolling 24-hour limit.
  const made = await env.DB.prepare('SELECT COUNT(*) AS n FROM generation_jobs WHERE created_at > ? AND status != ?')
    .bind(now() - 86400_000, 'failed')
    .first<{ n: number }>();
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM puzzles WHERE status = 'pending'").first<{ n: number }>();
  const inflight = await env.DB.prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE status IN ('queued','submitting','submitted','downloading')").first<{ n: number }>();
  let room = Math.min(s.perDay - (made?.n ?? 0), s.maxPending - (pending?.n ?? 0) - (inflight?.n ?? 0));
  if (room <= 0) return;

  // Categories with the fewest pending puzzles go first.
  const { results: cats } = await env.DB.prepare(
    `SELECT c.id, c.prompt_hint,
       (SELECT COUNT(*) FROM puzzles p WHERE p.category_id = c.id AND p.status = 'pending') AS pending
     FROM categories c WHERE c.generate = 1 ORDER BY pending ASC, RANDOM()`,
  ).all<{ id: string; prompt_hint: string; pending: number }>();
  const rand = rng(randomSeed());

  // The daily challenge pool comes first: keep dailyPoolTarget unused puzzles ready
  // (counting ones waiting for review and generations already running).
  if (s.dailyPoolTarget > 0) {
    const waiting = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM puzzles WHERE status = 'pending' AND category_id = ?) +
              (SELECT COUNT(*) FROM generation_jobs WHERE category_id = ? AND status IN ('queued','submitting','submitted','downloading')) AS n`,
    )
      .bind(DAILY_CATEGORY, DAILY_CATEGORY)
      .first<{ n: number }>();
    const short = s.dailyPoolTarget - (await dailyPoolLeft(env)) - (waiting?.n ?? 0);
    const hint = cats.find((c) => c.id === DAILY_CATEGORY)?.prompt_hint ?? '';
    const taken = await takenTitles(env, DAILY_CATEGORY);
    for (let i = 0; i < short && room > 0; i++, room--) {
      const idea = pickIdea(DAILY_CATEGORY, rand, hint, taken);
      await queueJob(env, s, { categoryId: DAILY_CATEGORY, ...idea }, true);
      log.push(`queued daily pool: ${idea.title}`);
    }
  }

  const allowed = cats.filter((c) => c.id !== DAILY_CATEGORY && (s.categories.length === 0 || s.categories.includes(c.id)));
  for (const cat of allowed) {
    if (room-- <= 0) break;
    const idea = pickIdea(cat.id, rand, cat.prompt_hint, await takenTitles(env, cat.id));
    await queueJob(env, s, { categoryId: cat.id, ...idea }, true);
    log.push(`queued ${cat.id}: ${idea.title}`);
  }
}

async function submit(env: Env, log: string[]): Promise<void> {
  const { results } = await env.DB.prepare("SELECT * FROM generation_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 5").all<JobRow>();
  for (const job of results) {
    // Claim the job so overlapping runs (cron + "Run now") never submit it twice.
    const claim = await env.DB.prepare("UPDATE generation_jobs SET status = 'submitting', updated_at = ? WHERE id = ? AND status = 'queued'")
      .bind(now(), job.id)
      .run();
    if (!claim.meta.changes) continue;
    try {
      const remoteId = await createImage(env, { model_id: job.model, prompt: job.prompt, ...JSON.parse(job.options || '{}') });
      await env.DB.prepare("UPDATE generation_jobs SET status = 'submitted', remote_id = ?, attempts = attempts + 1, error = NULL, updated_at = ? WHERE id = ?")
        .bind(remoteId, now(), job.id)
        .run();
      log.push(`submitted ${job.id} -> ${remoteId}`);
    } catch (e) {
      const err = e instanceof ElevenLabsError ? e : new ElevenLabsError(String(e), 0, true);
      const giveUp = !err.transient || job.attempts + 1 >= MAX_ATTEMPTS;
      await env.DB.prepare('UPDATE generation_jobs SET status = ?, error = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?')
        .bind(giveUp ? 'failed' : 'queued', err.message, now(), job.id)
        .run();
      log.push(`submit failed ${job.id}: ${err.message}`);
      if (err.status === 401 || err.status === 402 || err.status === 0) break; // account problem: stop this tick
    }
  }
}

async function uniqueSlug(env: Env, title: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await env.DB.prepare('SELECT 1 FROM puzzles WHERE slug = ?').bind(slug).first();
    if (!hit) return slug;
  }
  return `${base}-${randomId(3)}`;
}

/** Store an image as a pending puzzle awaiting review. Shared with manual uploads. */
export async function addPendingPuzzle(
  env: Env,
  p: { title: string; categoryId: string | null; bytes: ArrayBuffer; mimeType: string; source: string; prompt?: string; model?: string },
): Promise<number> {
  const ext = p.mimeType.includes('jpeg') ? 'jpg' : p.mimeType.includes('webp') ? 'webp' : 'png';
  const key = `originals/${dayKey(env)}/${randomId(8)}.${ext}`;
  await env.MEDIA.put(key, p.bytes, { httpMetadata: { contentType: p.mimeType, cacheControl: 'public, max-age=31536000, immutable' } });
  const slug = await uniqueSlug(env, p.title);
  const res = await env.DB.prepare(
    `INSERT INTO puzzles (slug, category_id, title, status, source, original_key, prompt, model, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  )
    .bind(slug, p.categoryId, p.title, p.source, key, p.prompt ?? null, p.model ?? null, now())
    .run();
  return Number(res.meta.last_row_id);
}

async function poll(env: Env, log: string[]): Promise<void> {
  const { results } = await env.DB.prepare("SELECT * FROM generation_jobs WHERE status = 'submitted' ORDER BY updated_at LIMIT 10").all<JobRow>();
  for (const job of results) {
    try {
      const st = await getImage(env, job.remote_id!);
      if (st.state === 'pending') {
        if (now() - job.created_at > JOB_TIMEOUT_MS) {
          await env.DB.prepare("UPDATE generation_jobs SET status = 'failed', error = 'Timed out', updated_at = ? WHERE id = ?").bind(now(), job.id).run();
          log.push(`timed out ${job.id}`);
        }
        continue;
      }
      if (st.state === 'failed') {
        await env.DB.prepare("UPDATE generation_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(st.error, now(), job.id).run();
        log.push(`failed ${job.id}: ${st.error}`);
        continue;
      }
      // Claim before downloading so overlapping runs don't add the image twice.
      const claim = await env.DB.prepare("UPDATE generation_jobs SET status = 'downloading', updated_at = ? WHERE id = ? AND status = 'submitted'")
        .bind(now(), job.id)
        .run();
      if (!claim.meta.changes) continue;
      const img = await fetch(st.url);
      if (!img.ok) throw new ElevenLabsError(`Download failed (${img.status})`, img.status, true);
      const puzzleId = await addPendingPuzzle(env, {
        title: job.title,
        categoryId: job.category_id,
        bytes: await img.arrayBuffer(),
        mimeType: img.headers.get('content-type') || st.mimeType,
        source: 'elevenlabs',
        prompt: job.prompt,
        model: job.model,
      });
      await env.DB.prepare("UPDATE generation_jobs SET status = 'done', puzzle_id = ?, error = NULL, updated_at = ? WHERE id = ?")
        .bind(puzzleId, now(), job.id)
        .run();
      log.push(`done ${job.id} -> puzzle ${puzzleId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Put it back so the next run retries the download (the signed URL lasts about an hour).
      await env.DB.prepare("UPDATE generation_jobs SET status = 'submitted', error = ?, updated_at = ? WHERE id = ? AND status IN ('submitted','downloading')")
        .bind(msg, now(), job.id)
        .run();
      log.push(`poll error ${job.id}: ${msg}`);
    }
  }
}

/** One pipeline tick. Returns a log for the admin "Run now" button. */
export async function runPipeline(env: Env): Promise<string[]> {
  const log: string[] = [];
  const s = await getSetting(env, 'generation', GENERATION_DEFAULTS);
  if (!env.ELEVENLABS_API_KEY) {
    log.push('ELEVENLABS_API_KEY is not set; skipping.');
    return log;
  }
  // Recover jobs left mid-step by a run that crashed or timed out.
  await env.DB.prepare(
    "UPDATE generation_jobs SET status = CASE status WHEN 'submitting' THEN 'queued' ELSE 'submitted' END WHERE status IN ('submitting','downloading') AND updated_at < ?",
  )
    .bind(now() - 10 * 60_000)
    .run();
  await plan(env, s, log);
  await submit(env, log);
  await poll(env, log);
  return log;
}
