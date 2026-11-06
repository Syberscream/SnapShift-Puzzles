// Minimal client for the ElevenLabs Image API (Flows).
//   POST /v1/flows/image            -> { id, status: "pending" }
//   GET  /v1/flows/image/{id}       -> { id, status: pending|generating|completed|failed,
//                                        content_url?, content_mime_type?, failure_reason?, error_message? }
// content_url is a signed URL that expires after about an hour, so finished
// images are downloaded into R2 straight away. Image & Video needs a Pro plan.

import type { Env } from '../env';

export interface CreateImageRequest {
  model_id: string;
  prompt: string;
  /** Model-specific; unknown fields are rejected by the API, so only send what's set. */
  [field: string]: unknown;
}

export type GenerationStatus =
  | { state: 'pending' }
  | { state: 'completed'; url: string; mimeType: string }
  | { state: 'failed'; error: string };

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    public status: number,
    /** true when retrying later may succeed (rate limit, server error). */
    public transient: boolean,
  ) {
    super(message);
  }
}

function base(env: Env) {
  return (env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, '');
}

function headers(env: Env) {
  if (!env.ELEVENLABS_API_KEY) throw new ElevenLabsError('ELEVENLABS_API_KEY is not set.', 0, false);
  return { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' };
}

async function errorFrom(res: Response): Promise<ElevenLabsError> {
  let detail = '';
  try {
    const j = (await res.json()) as { detail?: unknown; message?: string };
    detail = typeof j.detail === 'string' ? j.detail : j.message || JSON.stringify(j.detail ?? j);
  } catch {
    detail = res.statusText;
  }
  const hint = res.status === 402 ? ' (Image generation needs an ElevenLabs Pro plan or higher, or the quota is used up.)' : '';
  return new ElevenLabsError(`ElevenLabs ${res.status}: ${detail}${hint}`.slice(0, 500), res.status, res.status === 429 || res.status >= 500);
}

export async function createImage(env: Env, req: CreateImageRequest): Promise<string> {
  const res = await fetch(`${base(env)}/v1/flows/image`, { method: 'POST', headers: headers(env), body: JSON.stringify(req) });
  if (!res.ok) throw await errorFrom(res);
  const j = (await res.json()) as { id?: string };
  if (!j.id) throw new ElevenLabsError('ElevenLabs did not return a generation id.', res.status, false);
  return j.id;
}

export async function getImage(env: Env, id: string): Promise<GenerationStatus> {
  const res = await fetch(`${base(env)}/v1/flows/image/${encodeURIComponent(id)}`, { headers: headers(env) });
  if (!res.ok) throw await errorFrom(res);
  const j = (await res.json()) as {
    status?: string;
    content_url?: string;
    content_mime_type?: string;
    failure_reason?: string;
    error_message?: string;
  };
  if (j.status === 'completed' && j.content_url) return { state: 'completed', url: j.content_url, mimeType: j.content_mime_type || 'image/png' };
  if (j.status === 'failed') return { state: 'failed', error: [j.failure_reason, j.error_message].filter(Boolean).join(': ') || 'Generation failed.' };
  return { state: 'pending' };
}
