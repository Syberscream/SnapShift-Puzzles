// Game balance. These match the original SnapShift numbers; change them here
// and both the browser and the server pick up the new values.

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface DifficultyRules {
  label: string;
  rows: number;
  cols: number;
  /** Par time per tile, used for the speed part of the medal score. */
  parPerTileMs: number;
  /** Base points for finishing. */
  winBase: number;
  /** Cost of the "place one tile" helper. */
  placeCost: number;
}

export const RULES: Record<Difficulty, DifficultyRules> = {
  easy: { label: 'Easy', rows: 4, cols: 6, parPerTileMs: 5600, winBase: 40, placeCost: 30 },
  medium: { label: 'Medium', rows: 6, cols: 9, parPerTileMs: 6800, winBase: 60, placeCost: 45 },
  hard: { label: 'Hard', rows: 8, cols: 12, parPerTileMs: 8000, winBase: 80, placeCost: 60 },
};

/** Win points also get floor(WIN_TIME_FACTOR / seconds) as a speed bonus. */
export const WIN_TIME_FACTOR = 600;
/** Hard mode hides the "correct tile" glow and multiplies points. */
export const HARD_MODE_MULTIPLIER = 1.45;

/** In-game score: per newly-correct tile, plus a growing streak bonus. */
export const SCORE_PER_CORRECT = 10;
export const SCORE_STREAK_BONUS = 2;
export const SCORE_DOUBLE_BONUS = 5;

/** Medal thresholds on the 0..1 overall score (72% move efficiency, 28% speed). */
export const MEDAL_WEIGHTS = { moves: 0.72, speed: 0.28 };
export const MEDAL_GOLD = 0.9;
export const MEDAL_SILVER = 0.76;

/** Swap hint: free on normal puzzles, costs points on the daily. */
export const SWAP_HINT_COST = 0;
export const DAILY_SWAP_HINT_COST = 60;
export const HINT_COOLDOWN_MS = 15000;

/** Daily challenge: always hard, no place-tile helper, bonus on completion. */
export const DAILY_DIFFICULTY: Difficulty = 'hard';
export const DAILY_BONUS = 50;
export const STREAK_MILESTONES: { days: number; points: number; title: string }[] = [
  { days: 7, points: 250, title: 'Weekly Warrior' },
  { days: 14, points: 600, title: 'Streak Master' },
  { days: 30, points: 1500, title: 'Monthly Legend' },
];

/** Finishing a puzzle again on the same difficulty pays this share of the points. */
export const REPLAY_FACTOR = 0.25;

/** Unlocking: the first puzzle in each category is free, then cost grows with position. */
export const UNLOCK_BASE = 100;
export const UNLOCK_STEP = 40;
export function unlockCost(indexInCategory: number): number {
  return indexInCategory <= 0 ? 0 : UNLOCK_BASE + UNLOCK_STEP * indexInCategory;
}
