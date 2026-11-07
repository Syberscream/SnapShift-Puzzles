// Site-wide settings edited in Admin → Site settings: text, look & feel, banners.

import type { Env } from '../env';
import { dayKey, getSetting, str } from './util';

export const BANNER_PAGES = ['all', 'home', 'categories', 'category', 'play', 'daily', 'leaderboard', 'account', 'info'] as const;
export type BannerPage = (typeof BANNER_PAGES)[number];

export interface Banner {
  id: string;
  image: string;
  href: string;
  alt: string;
  /** Pages it shows on ("all" = every page). */
  pages: BannerPage[];
  /** Above or below the page content. */
  position: 'top' | 'bottom';
  enabled: boolean;
  /** "free": an ad, hidden from SnapShift Plus members. */
  audience: 'all' | 'free';
  /** Optional YYYY-MM-DD dates (inclusive) in the site timezone. */
  start: string;
  end: string;
}

export interface Theme {
  backgroundImage: string;
  /** 0–1: how visible the background picture is over the dark base colour. */
  backgroundOpacity: number;
  backgroundFit: 'cover' | 'contain' | 'repeat';
  backgroundBlur: number; // px
  /** 0–1: how solid the panels and cards are (lower = more see-through). */
  panelOpacity: number;
  baseColor: string;
  panelColor: string;
  pillColor: string;
  buttonColor: string;
  accentColor: string;
}

export interface SiteSettings {
  announcement: string;
  supporterMonthlyUrl: string;
  supporterYearlyUrl: string;
  contactEmail: string;
  /** Cloudflare Web Analytics site token (empty = off). */
  analyticsToken: string;
  /** Android app (Google Play): its package name and signing-key fingerprints, for /.well-known/assetlinks.json. */
  androidPackage: string;
  androidFingerprints: string;
  /** Google Play listing link; once set, the site offers the app to Android visitors. */
  androidPlayUrl: string;
  theme: Theme;
  banners: Banner[];
}

export const THEME_DEFAULTS: Theme = {
  backgroundImage: '/img/background.jpg',
  backgroundOpacity: 0.16,
  backgroundFit: 'cover',
  backgroundBlur: 0,
  panelOpacity: 0.86,
  baseColor: '#05080f',
  panelColor: '#0f172a',
  pillColor: '#01461e',
  buttonColor: '#092c4e',
  accentColor: '#7cc4ff',
};

export const SITE_DEFAULTS: SiteSettings = {
  announcement: '',
  supporterMonthlyUrl: '',
  supporterYearlyUrl: '',
  contactEmail: 'contact@snapshiftpuzzles.com',
  analyticsToken: '',
  androidPackage: 'com.snapshiftpuzzles.app',
  androidFingerprints: '',
  androidPlayUrl: '',
  theme: THEME_DEFAULTS,
  banners: [],
};

export async function getSite(env: Env): Promise<SiteSettings> {
  const s = await getSetting(env, 'site', SITE_DEFAULTS);
  return { ...SITE_DEFAULTS, ...s, theme: { ...THEME_DEFAULTS, ...(s.theme ?? {}) }, banners: Array.isArray(s.banners) ? s.banners : [] };
}

const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
/** Site-relative paths (/media/..., /img/...) or https links only. */
const url = (v: unknown, max = 500) => {
  const s = str(v, max);
  return s.startsWith('/') && !s.startsWith('//') ? s : /^https:\/\//i.test(s) ? s : '';
};
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function cleanTheme(t: Partial<Theme> | undefined, cur: Theme): Theme {
  const v = t ?? {};
  return {
    backgroundImage: v.backgroundImage !== undefined ? url(v.backgroundImage) : cur.backgroundImage,
    backgroundOpacity: num(v.backgroundOpacity, 0, 1, cur.backgroundOpacity),
    backgroundFit: ['cover', 'contain', 'repeat'].includes(String(v.backgroundFit)) ? (v.backgroundFit as Theme['backgroundFit']) : cur.backgroundFit,
    backgroundBlur: num(v.backgroundBlur, 0, 30, cur.backgroundBlur),
    panelOpacity: num(v.panelOpacity, 0.3, 1, cur.panelOpacity),
    baseColor: color(v.baseColor, cur.baseColor),
    panelColor: color(v.panelColor, cur.panelColor),
    pillColor: color(v.pillColor, cur.pillColor),
    buttonColor: color(v.buttonColor, cur.buttonColor),
    accentColor: color(v.accentColor, cur.accentColor),
  };
}

/** SHA-256 signing fingerprints: 32 hex pairs separated by colons, one per line. */
export function cleanFingerprints(v: unknown): string {
  return str(v, 2000)
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))
    .slice(0, 5)
    .join('\n');
}

export function cleanBanners(list: unknown): Banner[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).flatMap((b): Banner[] => {
    const image = url(b?.image);
    if (!image) return [];
    const pages = (Array.isArray(b.pages) ? b.pages : []).filter((p: string) => (BANNER_PAGES as readonly string[]).includes(p));
    return [
      {
        id: str(b.id, 40) || Math.random().toString(36).slice(2, 10),
        image,
        href: url(b.href),
        alt: str(b.alt, 140),
        pages: pages.length ? pages : ['all'],
        position: b.position === 'bottom' ? 'bottom' : 'top',
        enabled: b.enabled !== false,
        audience: b.audience === 'free' ? 'free' : 'all',
        start: date(b.start),
        end: date(b.end),
      },
    ];
  });
}

/** What players get: settings with only the banners that are on today. */
export async function publicSite(env: Env, member = false) {
  const s = await getSite(env);
  const today = dayKey(env);
  return {
    announcement: s.announcement,
    supporterMonthlyUrl: s.supporterMonthlyUrl,
    supporterYearlyUrl: s.supporterYearlyUrl,
    contactEmail: s.contactEmail,
    analyticsToken: s.analyticsToken,
    androidPlayUrl: s.androidPlayUrl,
    theme: s.theme,
    banners: s.banners.filter((b) => b.enabled && !(member && b.audience === 'free') && (!b.start || b.start <= today) && (!b.end || b.end >= today)),
  };
}

