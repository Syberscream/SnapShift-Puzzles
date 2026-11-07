// Slider Puzzle: one empty square; slide tiles into it to rebuild the picture.
// Shared by the browser and the server (the server replays every game).
//
// Board: n×n positions, tiles[pos] = the tile there (tile t belongs at pos t).
// The last tile (n*n - 1) is the empty square and belongs bottom-right.
// An action is the position of a tile next to the empty square, which slides into it.

import { rng } from './engine';

export const SLIDER_SIZES = [3, 4, 5] as const;
export type SliderSize = (typeof SLIDER_SIZES)[number];
export const isSliderSize = (n: unknown): n is SliderSize => SLIDER_SIZES.includes(n as SliderSize);

export const SLIDER = {
  /** Today's shared slider is always this size, free for everyone. */
  dailySize: 4 as SliderSize,
  /** 5×5 is for SnapShift Plus members. */
  membersSize: 5 as SliderSize,
  labels: { 3: 'Easy 3×3', 4: 'Medium 4×4', 5: 'Hard 5×5' } as Record<SliderSize, string>,
  /** Balance points for a finished slider (signed in), capped per day. */
  points: { 3: 5, 4: 15, 5: 30 } as Record<SliderSize, number>,
  dailyBonus: 20,
  dailyPointsCap: 100,
  /** Medal times: gold under the first, silver under the second, otherwise bronze. */
  medalMs: { 3: [45_000, 90_000], 4: [150_000, 300_000], 5: [360_000, 720_000] } as Record<SliderSize, [number, number]>,
  /** Moves can't come faster than this on average (line slides move several tiles at once). */
  minMsPerMove: 35,
};

export interface SliderState {
  n: SliderSize;
  tiles: number[];
  blank: number;
  moves: number;
}

const blankTile = (n: number) => n * n - 1;

export function sliderNeighbors(n: number, p: number): number[] {
  const r = Math.floor(p / n);
  const c = p % n;
  const out: number[] = [];
  if (r > 0) out.push(p - n);
  if (r < n - 1) out.push(p + n);
  if (c > 0) out.push(p - 1);
  if (c < n - 1) out.push(p + 1);
  return out;
}

export function sliderSolved(s: SliderState): boolean {
  return s.tiles.every((t, p) => t === p);
}

export function sliderCorrect(s: SliderState): number {
  return s.tiles.reduce((k, t, p) => k + (t === p && t !== blankTile(s.n) ? 1 : 0), 0);
}

/** Slide the tile at p into the empty square (it must be next to it). */
export function slide(s: SliderState, p: number): boolean {
  if (!Number.isInteger(p) || p < 0 || p >= s.tiles.length) return false;
  if (!sliderNeighbors(s.n, s.blank).includes(p)) return false;
  s.tiles[s.blank] = s.tiles[p];
  s.tiles[p] = blankTile(s.n);
  s.blank = p;
  s.moves++;
  return true;
}

/**
 * Tapping a tile in the same row or column as the empty square slides every
 * tile between them. Returns the single steps (as actions), nearest first.
 */
export function lineSteps(s: SliderState, p: number): number[] {
  const n = s.n;
  if (p === s.blank || p < 0 || p >= n * n) return [];
  const [br, bc, pr, pc] = [Math.floor(s.blank / n), s.blank % n, Math.floor(p / n), p % n];
  if (br !== pr && bc !== pc) return [];
  const step = br === pr ? Math.sign(pc - bc) : Math.sign(pr - br) * n;
  const out: number[] = [];
  for (let q = s.blank + step; ; q += step) {
    out.push(q);
    if (q === p) break;
  }
  return out;
}

/** A solvable scramble: a long random walk of the empty square from the solved board. */
export function sliderNew(seed: number, n: SliderSize): SliderState {
  const rand = rng(seed);
  const s: SliderState = { n, tiles: Array.from({ length: n * n }, (_, i) => i), blank: n * n - 1, moves: 0 };
  const walk = n * n * 60;
  let prev = -1;
  for (let i = 0; i < walk || distance(s) < n * n * 1.5; i++) {
    const options = sliderNeighbors(n, s.blank).filter((q) => q !== prev);
    const q = options[Math.floor(rand() * options.length)];
    prev = s.blank;
    slide(s, q);
    if (i > walk * 4) break;
  }
  s.moves = 0;
  return s;
}

/** Sum of how far each tile is from home (a lower bound on moves needed). */
export function distance(s: SliderState): number {
  let d = 0;
  s.tiles.forEach((t, p) => {
    if (t === blankTile(s.n)) return;
    d += Math.abs(Math.floor(t / s.n) - Math.floor(p / s.n)) + Math.abs((t % s.n) - (p % s.n));
  });
  return d;
}

export function sliderReplay(seed: number, n: SliderSize, actions: unknown[]): { state: SliderState; invalidAt: number } {
  const state = sliderNew(seed, n);
  for (let i = 0; i < actions.length; i++) {
    if (!slide(state, actions[i] as number)) return { state, invalidAt: i };
  }
  return { state, invalidAt: -1 };
}

export function sliderMedal(n: SliderSize, ms: number): 'gold' | 'silver' | 'bronze' {
  const [g, s] = SLIDER.medalMs[n];
  return ms <= g ? 'gold' : ms <= s ? 'silver' : 'bronze';
}

/** Solve by search (tests and the hint): moves for small boards via IDA*. Null if it gives up. */
export function sliderSolve(s0: SliderState, budget = 2_000_000): number[] | null {
  const s: SliderState = { ...s0, tiles: [...s0.tiles] };
  let bound = distance(s);
  const path: number[] = [];
  let nodes = 0;
  const search = (g: number, prev: number): number => {
    const h = distance(s);
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) return -1;
    if (++nodes > budget) return Infinity;
    let min = Infinity;
    for (const q of sliderNeighbors(s.n, s.blank)) {
      if (q === prev) continue;
      const from = s.blank;
      slide(s, q);
      path.push(q);
      const t = search(g + 1, from);
      if (t === -1) return -1;
      if (t < min) min = t;
      path.pop();
      slide(s, from);
    }
    return min;
  };
  for (;;) {
    const t = search(0, -1);
    if (t === -1) return path;
    if (t === Infinity) return null;
    bound = t;
  }
}
