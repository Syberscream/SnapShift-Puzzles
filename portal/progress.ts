// Saved progress (on the player's device), points, Trifectas and badges.

import { BADGE_POINTS, MODES, REPLAY_POINTS, SLAM_POINTS, TRIFECTA, TRIFECTA_POINTS, type ModeId } from './modes';

export interface Progress {
  v: 3;
  /** stars[level][mode] = best stars (1–3). */
  stars: Record<number, Partial<Record<ModeId, number>>>;
  /** best[`${level}:${mode}`] */
  best: Record<string, { moves: number; ms: number }>;
  points: number;
  /** Badge id -> tier reached (1 bronze, 2 silver, 3 gold). */
  badges: Record<string, number>;
  /** Badges earned since the trophy room was last opened. */
  newBadges: number;
  stats: {
    wins: Record<ModeId, number>;
    /** Classic/Twist wins in the fewest possible moves. */
    perfect: number;
    maxCombo: number;
    /** Wins on 30+ tile boards without a hint. */
    clean: number;
    trifectas: number;
    slams: number;
    dailies: number;
  };
  daily: { day: string; stars: number; streak: number; lastDone: string };
  /** Modes the player has been told about. */
  modesSeen: ModeId[];
}

const empty = (): Progress => ({
  v: 3,
  stars: {},
  best: {},
  points: 0,
  badges: {},
  newBadges: 0,
  stats: { wins: { classic: 0, twist: 0, slider: 0, memory: 0, rush: 0 }, perfect: 0, maxCombo: 0, clean: 0, trifectas: 0, slams: 0, dailies: 0 },
  daily: { day: '', stars: 0, streak: 0, lastDone: '' },
  modesSeen: ['classic'],
});

const KEY = 'ssp_progress_v3';
function read(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function loadProgress(): Progress {
  const base = empty();
  const v3 = read(KEY) as Partial<Progress> | null;
  if (v3) return { ...base, ...v3, stats: { ...base.stats, ...v3.stats, wins: { ...base.stats.wins, ...v3.stats?.wins } }, daily: { ...base.daily, ...v3.daily } };
  // Earlier version: one star count per level (all Classic).
  const v2 = read('ssp_progress_v2') as { stars?: Record<number, number>; best?: Record<number, { moves: number; ms: number }>; daily?: Progress['daily'] } | null;
  if (v2?.stars) {
    for (const [i, n] of Object.entries(v2.stars)) if (n) base.stars[+i] = { classic: n };
    for (const [i, b] of Object.entries(v2.best ?? {})) base.best[`${i}:classic`] = b;
    if (v2.daily) base.daily = { ...base.daily, ...v2.daily };
    base.stats.wins.classic = Object.keys(base.stars).length;
    base.points = Object.values(v2.stars).reduce((a, n) => a + (n || 0) * 50, 0);
  }
  return base;
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: progress lasts this session */
  }
}

export const levelDone = (p: Progress, i: number) => Object.values(p.stars[i] ?? {}).some((n) => (n ?? 0) > 0);
export const levelStars = (p: Progress, i: number) => Object.values(p.stars[i] ?? {}).reduce((a: number, n) => a + (n ?? 0), 0);
export const totalStars = (p: Progress) => Object.keys(p.stars).reduce((a, i) => a + levelStars(p, +i), 0);
export const hasTrifecta = (p: Progress, i: number) => TRIFECTA.every((m) => p.stars[i]?.[m] === 3);
export const hasSlam = (p: Progress, i: number) => MODES.every((m) => p.stars[i]?.[m.id] === 3);
export const levelsDone = (p: Progress) => Object.keys(p.stars).filter((i) => levelDone(p, +i)).length;

// ---------- badges ----------

export interface BadgeDef {
  id: string;
  name: string;
  /** Icon key (main.ts draws it). */
  icon: string;
  /** Bronze, silver, gold. */
  tiers: [number, number, number];
  /** "Finish {n} Slider puzzles" */
  text: string;
  value: (p: Progress, ctx: BadgeContext) => number;
}
export interface BadgeContext {
  worldsDone: number;
}

export const BADGES: BadgeDef[] = [
  { id: 'stars', name: 'Star Collector', icon: 'star', tiers: [25, 150, 500], text: 'Collect {n} stars', value: (p) => totalStars(p) },
  { id: 'trifecta', name: 'Trifecta', icon: 'trifecta', tiers: [1, 10, 40], text: 'Get 3 stars in Classic, Twist and Slider on {n} pictures', value: (p) => p.stats.trifectas },
  { id: 'slam', name: 'Grand Slam', icon: 'crown', tiers: [1, 5, 20], text: 'Get 3 stars in all five modes on {n} pictures', value: (p) => p.stats.slams },
  { id: 'classic', name: 'Puzzler', icon: 'swap', tiers: [10, 50, 150], text: 'Finish {n} Classic puzzles', value: (p) => p.stats.wins.classic },
  { id: 'twist', name: 'Twister', icon: 'rotate', tiers: [5, 25, 75], text: 'Finish {n} Twist puzzles', value: (p) => p.stats.wins.twist },
  { id: 'slider', name: 'Slide Master', icon: 'slider', tiers: [5, 25, 75], text: 'Finish {n} Slider puzzles', value: (p) => p.stats.wins.slider },
  { id: 'memory', name: 'Total Recall', icon: 'brain', tiers: [3, 15, 50], text: 'Finish {n} Memory puzzles', value: (p) => p.stats.wins.memory },
  { id: 'rush', name: 'Speed Demon', icon: 'bolt', tiers: [3, 15, 50], text: 'Beat the clock {n} times in Time Rush', value: (p) => p.stats.wins.rush },
  { id: 'perfect', name: 'Flawless', icon: 'target', tiers: [1, 10, 40], text: 'Finish {n} puzzles in the fewest possible moves', value: (p) => p.stats.perfect },
  { id: 'combo', name: 'Combo King', icon: 'flame', tiers: [8, 20, 40], text: 'Place tiles {n} moves in a row without a miss', value: (p) => p.stats.maxCombo },
  { id: 'clean', name: 'No Help Needed', icon: 'shield', tiers: [5, 25, 75], text: 'Finish {n} puzzles of 30+ tiles without a hint', value: (p) => p.stats.clean },
  { id: 'daily', name: 'Daily Devotion', icon: 'cal', tiers: [3, 7, 30], text: 'Reach a {n}-day daily streak', value: (p) => p.daily.streak },
  { id: 'explorer', name: 'Explorer', icon: 'globe', tiers: [1, 4, 12], text: 'Finish every picture in {n} worlds', value: (_, c) => c.worldsDone },
];

export const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold'];

export interface Earned {
  badge: BadgeDef;
  tier: number;
  points: number;
}

/** Award any badge tiers newly reached. Adds their points. */
export function checkBadges(p: Progress, ctx: BadgeContext): Earned[] {
  const out: Earned[] = [];
  for (const b of BADGES) {
    const v = b.value(p, ctx);
    const had = p.badges[b.id] ?? 0;
    let tier = had;
    while (tier < 3 && v >= b.tiers[tier]) tier++;
    for (let t = had + 1; t <= tier; t++) out.push({ badge: b, tier: t, points: BADGE_POINTS[t] });
    if (tier > had) p.badges[b.id] = tier;
  }
  for (const e of out) p.points += e.points;
  p.newBadges += out.length;
  return out;
}

export interface WinResult {
  stars: number;
  prevStars: number;
  points: number;
  trifecta: boolean;
  slam: boolean;
  /** Points breakdown for the win screen. */
  lines: { label: string; points: number }[];
}

/** Record a level win: stars, best, stats, points, Trifecta and Grand Slam. */
export function recordWin(
  p: Progress,
  level: number,
  mode: ModeId,
  stars: number,
  info: { moves: number; ms: number; perfect: boolean; clean: boolean; starPoints: number },
): WinResult {
  const cur = (p.stars[level] ??= {});
  const prevStars = cur[mode] ?? 0;
  const hadTri = hasTrifecta(p, level);
  const hadSlam = hasSlam(p, level);
  if (stars > prevStars) cur[mode] = stars;
  const key = `${level}:${mode}`;
  const b = p.best[key];
  if (!b || info.moves < b.moves) p.best[key] = { moves: info.moves, ms: info.ms };
  p.stats.wins[mode]++;
  if (info.perfect) p.stats.perfect++;
  if (info.clean) p.stats.clean++;
  const lines: WinResult['lines'] = [];
  const newStars = Math.max(0, stars - prevStars);
  if (newStars) lines.push({ label: `${newStars} new star${newStars > 1 ? 's' : ''}`, points: newStars * info.starPoints });
  else lines.push({ label: 'Played again', points: REPLAY_POINTS });
  const trifecta = !hadTri && hasTrifecta(p, level);
  const slam = !hadSlam && hasSlam(p, level);
  if (trifecta) {
    p.stats.trifectas++;
    lines.push({ label: 'Trifecta!', points: TRIFECTA_POINTS });
  }
  if (slam) {
    p.stats.slams++;
    lines.push({ label: 'Grand Slam!', points: SLAM_POINTS });
  }
  const points = lines.reduce((a, l) => a + l.points, 0);
  p.points += points;
  return { stars, prevStars, points, trifecta, slam, lines };
}

/** Record a daily puzzle win. */
export function recordDaily(p: Progress, stars: number, today: string, yesterday: string): WinResult {
  const d = p.daily;
  const lines: WinResult['lines'] = [];
  if (d.lastDone !== today) {
    d.streak = d.lastDone === yesterday ? d.streak + 1 : 1;
    d.lastDone = today;
    p.stats.dailies++;
    lines.push({ label: 'Daily puzzle', points: 100 }, { label: `${d.streak}-day streak`, points: Math.min(200, d.streak * 20) });
  } else lines.push({ label: 'Played again', points: REPLAY_POINTS });
  const prevStars = d.day === today ? d.stars : 0;
  d.day = today;
  d.stars = Math.max(prevStars, stars);
  const points = lines.reduce((a, l) => a + l.points, 0);
  p.points += points;
  return { stars, prevStars, points, trifecta: false, slam: false, lines };
}
