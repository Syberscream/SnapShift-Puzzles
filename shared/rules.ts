// Game balance. Change numbers here and both the browser and the server pick them up.

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export type Mode = 'classic' | 'zen' | 'rotation' | 'timeattack';
/** Modes you can pick on a puzzle's page (Time Attack has its own page). */
export const MODES: Mode[] = ['classic', 'zen', 'rotation'];
export const MODE_LABELS: Record<Mode, string> = { classic: 'Classic', zen: 'Zen', rotation: 'Rotation', timeattack: 'Time Attack' };

/**
 * Engine version stored with every game so old games keep replaying the same way.
 *   1 – launch rules: random deal, tiles always lock, optional "hard mode" ×1.45.
 *   2 – per-difficulty rules below, shaped scrambles, Zen and Rotation modes.
 */
export type EngineVersion = 1 | 2;
export const ENGINE_VERSION: EngineVersion = 2;

export interface DifficultyRules {
  label: string;
  rows: number;
  cols: number;
  /** Rotation mode uses square tiles; the picture is centre-cropped to this grid. */
  rotationGrid: [rows: number, cols: number];
  /** Par time per tile, used for the speed part of the medal score. */
  parPerTileMs: number;
  /** Base points for finishing (before the multiplier). */
  winBase: number;
  /** Points multiplier for finishing and for the in-game score. */
  multiplier: number;
  /** Correct tiles lock in place. If false they can be swapped out again. */
  lock: boolean;
  /** Green outline on tiles that are in the right place. */
  glow: boolean;
  /** Finished picture: always shown, peek on demand, or hidden after a short look at the start. */
  preview: 'always' | 'peek' | 'hidden';
  /** How the board is shuffled: pairs (many swaps fix two tiles), mixed, or long chains. */
  scramble: 'pairs' | 'mixed' | 'long';
  /** Swap hint cost and cooldown. */
  hintCost: number;
  hintCooldownMs: number;
  /** Cost of the "place one tile" helper. */
  placeCost: number;
}

export const RULES: Record<Difficulty, DifficultyRules> = {
  easy: {
    label: 'Easy', rows: 4, cols: 6, rotationGrid: [4, 7], parPerTileMs: 5600, winBase: 40, multiplier: 1,
    lock: true, glow: true, preview: 'always', scramble: 'pairs', hintCost: 0, hintCooldownMs: 10_000, placeCost: 30,
  },
  medium: {
    label: 'Medium', rows: 6, cols: 9, rotationGrid: [6, 10], parPerTileMs: 6800, winBase: 60, multiplier: 2,
    lock: true, glow: false, preview: 'peek', scramble: 'mixed', hintCost: 25, hintCooldownMs: 15_000, placeCost: 45,
  },
  hard: {
    label: 'Hard', rows: 8, cols: 12, rotationGrid: [8, 14], parPerTileMs: 8000, winBase: 80, multiplier: 4,
    lock: false, glow: false, preview: 'hidden', scramble: 'long', hintCost: 60, hintCooldownMs: 30_000, placeCost: 60,
  },
};

/** How long the finished picture is shown before a new board is shuffled. */
export const MEMORIZE_MS = 2500;
/** Medium's "peek" shows the picture for this long, then needs this cooldown. */
export const PEEK_MS = 2000;
export const PEEK_COOLDOWN_MS = 10_000;

/** Zen: no timer, score or medal; everything assisted; a small reward the first time. */
export const ZEN_POINTS = 10;
/** Rotation mode pays a bit more. Rotating a tile counts as a move. */
export const ROTATION_BONUS = 1.25;

/** Time Attack: as many small puzzles as you can in the time limit. */
export const TIME_ATTACK = {
  durationMs: 180_000,
  rows: 3,
  cols: 4,
  /** Puzzles handed out per run (more than anyone can solve in time). */
  puzzles: 40,
  /** Score per solved puzzle, plus up to `efficiencyBonus` for using few moves. */
  perSolve: 100,
  efficiencyBonus: 50,
  /** Points added to the player's balance per solved puzzle, capped per day. */
  pointsPerSolve: 5,
  dailyPointsCap: 100,
  /** Extra time allowed for the finish request to arrive. */
  graceMs: 20_000,
};

/** Score for one solved Time Attack puzzle: base plus a bonus for using few moves. */
export function timeAttackScore(par: number, moves: number): number {
  return TIME_ATTACK.perSolve + Math.round(TIME_ATTACK.efficiencyBonus * Math.min(1, Math.max(1, par) / Math.max(1, moves)));
}

/** Win points = base × difficulty multiplier × medal factor (Classic/Rotation). */
export const MEDAL_POINTS: Record<'gold' | 'silver' | 'bronze', number> = { gold: 1.5, silver: 1.25, bronze: 1 };
/** Engine v1 only: win points also got floor(WIN_TIME_FACTOR / seconds) as a speed bonus. */
export const WIN_TIME_FACTOR = 600;

/** In-game score: per newly-correct tile, plus a growing streak bonus. */
export const SCORE_PER_CORRECT = 10;
export const SCORE_STREAK_BONUS = 2;
export const SCORE_DOUBLE_BONUS = 5;

/** Medal thresholds on the 0..1 overall score (72% move efficiency, 28% speed). */
export const MEDAL_WEIGHTS = { moves: 0.72, speed: 0.28 };
export const MEDAL_GOLD = 0.9;
export const MEDAL_SILVER = 0.76;

/** Daily challenge: always Hard classic, no place-tile helper, bonus on completion. */
export const DAILY_DIFFICULTY: Difficulty = 'hard';
export const DAILY_BONUS = 50;
export const STREAK_MILESTONES: { days: number; points: number; title: string }[] = [
  { days: 7, points: 250, title: 'Weekly Warrior' },
  { days: 14, points: 600, title: 'Streak Master' },
  { days: 30, points: 1500, title: 'Monthly Legend' },
];
/** After 30 days the Monthly Legend bonus repeats every 30 days (60, 90, …). */
export function streakMilestone(days: number): { days: number; points: number; title: string } | null {
  const fixed = STREAK_MILESTONES.find((m) => m.days === days);
  if (fixed) return fixed;
  const last = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
  return days > last.days && days % last.days === 0 ? { days, points: last.points, title: `${days}-Day Legend` } : null;
}

/** Finishing a puzzle again on the same difficulty pays this share of the points. */
export const REPLAY_FACTOR = 0.25;

/** Unlocking: the first puzzle in each category is free, then cost grows with position. */
export const UNLOCK_BASE = 100;
export const UNLOCK_STEP = 40;
/** Unlocks never cost more than this, however many puzzles a category has. */
export const UNLOCK_MAX = 500;
export function unlockCost(indexInCategory: number): number {
  return indexInCategory <= 0 ? 0 : Math.min(UNLOCK_MAX, UNLOCK_BASE + UNLOCK_STEP * indexInCategory);
}

// ---- Engine version 1 (launch) values, kept so older games replay and score the same ----
export const V1_HARD_MODE_MULTIPLIER = 1.45;
export const V1_SWAP_HINT_COST = 0;
export const V1_DAILY_SWAP_HINT_COST = 60;
export const V1_HINT_COOLDOWN_MS = 15_000;

/** Everything about how a game plays, worked out from its settings. */
export interface GameSetup {
  version: EngineVersion;
  difficulty: Difficulty;
  mode: Mode;
  daily: boolean;
  /** v1 only: the old "hard mode" toggle. */
  hardMode: boolean;
}

export interface GameRules {
  rows: number;
  cols: number;
  lock: boolean;
  glow: boolean;
  preview: DifficultyRules['preview'];
  scramble: DifficultyRules['scramble'] | 'random';
  rotation: boolean;
  /** Square tiles: the picture is centre-cropped to cols:rows. */
  square: boolean;
  scoreMultiplier: number;
  hintCost: number;
  hintCooldownMs: number;
  placeAllowed: boolean;
  placeCost: number;
  timed: boolean;
}

export const TIME_ATTACK_SETUP: GameSetup = { version: 2, difficulty: 'easy', mode: 'timeattack', daily: false, hardMode: false };

export function gameRules(g: GameSetup): GameRules {
  const r = RULES[g.difficulty];
  if (g.version === 1) {
    return {
      rows: r.rows, cols: r.cols, lock: true, glow: !g.hardMode, preview: 'always', scramble: 'random', rotation: false, square: false,
      scoreMultiplier: g.hardMode ? V1_HARD_MODE_MULTIPLIER : 1,
      hintCost: g.daily ? V1_DAILY_SWAP_HINT_COST : V1_SWAP_HINT_COST, hintCooldownMs: V1_HINT_COOLDOWN_MS,
      placeAllowed: !g.daily, placeCost: r.placeCost, timed: true,
    };
  }
  if (g.mode === 'timeattack') {
    return {
      rows: TIME_ATTACK.rows, cols: TIME_ATTACK.cols, lock: true, glow: true, preview: 'always', scramble: 'mixed', rotation: false, square: false,
      scoreMultiplier: 1, hintCost: 0, hintCooldownMs: 0, placeAllowed: false, placeCost: 0, timed: true,
    };
  }
  const zen = g.mode === 'zen';
  const rotation = g.mode === 'rotation';
  const [rows, cols] = rotation ? r.rotationGrid : [r.rows, r.cols];
  return {
    rows,
    cols,
    lock: zen ? true : r.lock,
    glow: zen ? true : r.glow,
    preview: zen ? 'always' : r.preview,
    scramble: zen ? 'pairs' : r.scramble,
    rotation,
    square: rotation,
    scoreMultiplier: r.multiplier * (rotation ? ROTATION_BONUS : 1),
    hintCost: zen ? 0 : r.hintCost,
    hintCooldownMs: zen ? 3_000 : r.hintCooldownMs,
    placeAllowed: !g.daily,
    placeCost: zen ? 0 : r.placeCost,
    timed: !zen,
  };
}
