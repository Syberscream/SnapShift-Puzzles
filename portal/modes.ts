// Ways to play each picture. Classic, Twist and Slider make up the Trifecta;
// Memory and Time Rush are extra challenges (all five = Grand Slam).

import type { GameRules } from '@shared/rules';

export type ModeId = 'classic' | 'twist' | 'slider' | 'memory' | 'rush';

export interface ModeInfo {
  id: ModeId;
  name: string;
  /** One line on the mode picker. */
  blurb: string;
  /** How to play, shown when the mode unlocks. */
  how: string;
  /** Pictures you need to have finished before this mode opens. */
  unlockAfter: number;
  color: string;
  /** Points per new star. */
  starPoints: number;
}

export const MODES: ModeInfo[] = [
  { id: 'classic', name: 'Classic', blurb: 'Swap tiles to rebuild the picture', how: 'Drag a tile onto another to swap them.', unlockAfter: 0, color: '#a78bfa', starPoints: 50 },
  {
    id: 'twist',
    name: 'Twist',
    blurb: 'Tiles are turned every which way',
    how: 'Every tile is turned a different way. Swap tiles into place, then tap them to turn them upright.',
    unlockAfter: 3,
    color: '#38bdf8',
    starPoints: 75,
  },
  {
    id: 'slider',
    name: 'Slider',
    blurb: 'Slide tiles into the empty square',
    how: 'One square is empty. Tap a tile in the same row or column to slide it across. Work row by row from the top!',
    unlockAfter: 6,
    color: '#34d399',
    starPoints: 100,
  },
  {
    id: 'memory',
    name: 'Memory',
    blurb: 'Rebuild it from memory',
    how: 'Study the picture for a few seconds, then rebuild it without looking. No peeking and no green outlines.',
    unlockAfter: 10,
    color: '#f472b6',
    starPoints: 75,
  },
  {
    id: 'rush',
    name: 'Time Rush',
    blurb: 'Beat the clock',
    how: 'The clock counts down from the start. Finish before it runs out. The more time left, the more stars.',
    unlockAfter: 15,
    color: '#fbbf24',
    starPoints: 75,
  },
];
export const MODE: Record<ModeId, ModeInfo> = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, ModeInfo>;
export const TRIFECTA: ModeId[] = ['classic', 'twist', 'slider'];

/** Bonus points. */
export const TRIFECTA_POINTS = 500;
export const SLAM_POINTS = 1500;
export const REPLAY_POINTS = 10;
export const BADGE_POINTS = [0, 100, 300, 1000];

/** Board size and shuffle for a picture's level number in a mode. */
export interface Shape {
  mode: ModeId;
  rows: number;
  cols: number;
  scramble: 'pairs' | 'mixed' | 'long';
  /** Slider: board is size×size. */
  size?: 3 | 4 | 5;
}

/** Classic grows from 12 tiles to 63. The other modes are sized to feel about as long. */
export function shapeFor(i: number, mode: ModeId): Shape {
  const sizes: [number, number, number][] = [
    // [until level, rows, cols]
    [1, 3, 4],
    [3, 4, 4],
    [6, 4, 5],
    [10, 4, 6],
    [16, 5, 6],
    [24, 5, 7],
    [34, 6, 7],
    [46, 6, 8],
    [9999, 7, 9],
  ];
  const [, rows, cols] = sizes.find(([until]) => i < until)!;
  const scramble = i < 8 ? 'mixed' : 'long';
  switch (mode) {
    case 'twist':
    case 'memory':
      return { mode, rows: Math.max(3, rows - 1), cols: Math.max(3, cols - 1), scramble };
    case 'slider': {
      const size = i < 15 ? 3 : i < 100 ? 4 : 5;
      return { mode, rows: size, cols: size, scramble, size };
    }
    default:
      return { mode, rows, cols, scramble };
  }
}

/** Daily puzzle: a different mode each day, a bit bigger than usual. */
export function dailyShape(dayIndex: number): Shape {
  const order: ModeId[] = ['classic', 'twist', 'slider', 'memory', 'rush'];
  const mode = order[dayIndex % order.length];
  if (mode === 'slider') return { mode, rows: 4, cols: 4, scramble: 'long', size: 4 };
  if (mode === 'twist' || mode === 'memory') return { mode, rows: 4, cols: 6, scramble: 'long' };
  return { mode, rows: 5, cols: 7, scramble: 'long' };
}

export function rulesFor(s: Shape): GameRules {
  const twist = s.mode === 'twist';
  const memory = s.mode === 'memory';
  const slider = s.mode === 'slider';
  return {
    rows: s.rows,
    cols: s.cols,
    lock: !memory && !slider,
    glow: !memory && !slider,
    preview: memory ? 'hidden' : 'always',
    scramble: s.scramble,
    rotation: twist,
    square: twist || slider,
    scoreMultiplier: 1,
    hintCost: 0,
    hintCooldownMs: 0,
    placeAllowed: false,
    placeCost: 0,
    timed: true,
  };
}

/** Moves allowed for 3 and 2 stars. `par` is the fewest moves (swap modes) or a solver's count (slider). */
export function moveGoals(mode: ModeId, par: number): [number, number] {
  if (mode === 'slider') return [Math.round(par * 2), Math.round(par * 3.5)];
  if (mode === 'memory') return [par + Math.max(2, Math.ceil(par * 0.4)), par + Math.max(5, Math.ceil(par * 1.2))];
  return [par + Math.max(1, Math.ceil(par * 0.2)), par + Math.max(3, Math.ceil(par * 0.75))];
}

/** Time Rush: seconds on the clock. */
export function rushSeconds(par: number, tiles: number): number {
  return Math.round(par * 3 + tiles * 0.6 + 10);
}
/** Time Rush stars from the share of time left. */
export function rushStars(leftShare: number): number {
  return leftShare >= 0.45 ? 3 : leftShare >= 0.2 ? 2 : 1;
}
