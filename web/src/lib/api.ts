export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (data instanceof FormData) init.body = data;
  else if (data !== undefined) {
    init.body = JSON.stringify(data);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch('/api' + path, init);
  } catch {
    throw new ApiError("Can't reach SnapShift right now. Check your connection.", 0);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error || `Request failed (${res.status}).`;
    throw new ApiError(msg, res.status);
  }
  return json as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, d?: unknown) => request<T>('POST', p, d ?? {}),
  put: <T>(p: string, d?: unknown) => request<T>('PUT', p, d ?? {}),
  patch: <T>(p: string, d?: unknown) => request<T>('PATCH', p, d ?? {}),
  del: <T>(p: string) => request<T>('DELETE', p),
};

export interface Me {
  id: number;
  username: string;
  email: string;
  role: 'player' | 'admin';
  emailVerified: boolean;
  points: number;
  supporter: boolean;
  /** SnapShift Plus (admins count as members). */
  member: boolean;
  memberUntil: number | null;
  lifetime: boolean;
  /** Has a Stripe billing account (can open the billing portal). */
  billing: boolean;
  frame: string;
  remindStreak: boolean;
  profilePublic: boolean;
}

export interface PuzzleView {
  id: number;
  slug: string;
  title: string;
  description: string;
  categoryId: string | null;
  index: number;
  image: string;
  thumb: string;
  unlockCost: number;
  unlocked: boolean;
  lock: 'points' | 'members' | 'early' | 'event' | null;
  publicAt: number | null;
  bestMedal: string | null;
  inProgress: boolean;
  finished?: boolean;
  inEvent?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  tile: string;
  count: number;
  membersOnly?: boolean;
  /** Puzzles you've finished in it. */
  done?: number;
}
