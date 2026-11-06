export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;

  APP_NAME: string;
  APP_URL: string;
  MAIL_FROM: string;
  /** Comma-separated emails that become admins when they sign up or log in. */
  ADMIN_EMAILS: string;
  ELEVENLABS_BASE_URL: string;
  /** IANA timezone that decides when the daily puzzle rolls over. */
  TIMEZONE: string;

  ELEVENLABS_API_KEY?: string;
  RESEND_API_KEY?: string;
  /** "1" in local development: return email links in API responses. */
  DEV_MODE?: string;
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: 'player' | 'admin';
  email_verified: number;
  points: number;
  supporter_until: number | null;
  created_at: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
