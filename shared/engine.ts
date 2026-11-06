// SnapShift game engine: pure functions, no DOM. The same code runs in the
// browser (to play) and in the Worker (to replay and validate a move log).

import {
  type Difficulty,
  RULES,
  HARD_MODE_MULTIPLIER,
  MEDAL_GOLD,
  MEDAL_SILVER,
  MEDAL_WEIGHTS,
  SCORE_DOUBLE_BONUS,
  SCORE_PER_CORRECT,
  SCORE_STREAK_BONUS,
  WIN_TIME_FACTOR,
} from './rules';

/** One entry in the move log. */
export type Action =
  | [number, number] // swap the tiles at two board positions
  | ['hint'] // swap hint was revealed (costs points on the daily)
  | ['place']; // "place one tile" helper: applies the best suggested swap

export interface GameState {
  rows: number;
  cols: number;
  /** tiles[position] = id of the tile at that position. Solved when tiles[i] === i. */
  tiles: number[];
  locked: boolean[];
  moves: number;
  streak: number;
  score: number;
  hints: number;
  places: number;
}

export interface SwapResult {
  ok: boolean;
  newlyCorrect: number;
  gained: number;
}

/** Deterministic PRNG (mulberry32) so a seed always deals the same board. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] || 1;
}

/** Seed for a day's daily challenge, the same for every player. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

/** Deal a board where no tile starts in its correct place. */
export function deal(seed: number, rows: number, cols: number): number[] {
  const n = rows * cols;
  const tiles = Array.from({ length: n }, (_, i) => i);
  const rand = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  // Remove fixed points by rotating them among themselves (or with a neighbour).
  const fixed = tiles.map((t, i) => (t === i ? i : -1)).filter((i) => i >= 0);
  if (fixed.length === 1) {
    const i = fixed[0];
    const j = (i + 1) % n;
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  } else if (fixed.length > 1) {
    const first = tiles[fixed[0]];
    for (let k = 0; k < fixed.length - 1; k++) tiles[fixed[k]] = tiles[fixed[k + 1]];
    tiles[fixed[fixed.length - 1]] = first;
  }
  return tiles;
}

export function newGame(seed: number, difficulty: Difficulty): GameState {
  const { rows, cols } = RULES[difficulty];
  const tiles = deal(seed, rows, cols);
  return {
    rows,
    cols,
    tiles,
    locked: tiles.map((t, i) => t === i),
    moves: 0,
    streak: 0,
    score: 0,
    hints: 0,
    places: 0,
  };
}

export function isSolved(s: GameState): boolean {
  return s.tiles.every((t, i) => t === i);
}

export function correctCount(s: GameState): number {
  return s.tiles.reduce((n, t, i) => n + (t === i ? 1 : 0), 0);
}

/** Swap two positions. Locked (already correct) tiles can't move. */
export function swap(s: GameState, a: number, b: number, hardMode = false): SwapResult {
  const n = s.tiles.length;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 || a >= n || b >= n) {
    return { ok: false, newlyCorrect: 0, gained: 0 };
  }
  if (s.locked[a] || s.locked[b]) return { ok: false, newlyCorrect: 0, gained: 0 };

  [s.tiles[a], s.tiles[b]] = [s.tiles[b], s.tiles[a]];
  s.moves++;

  let newlyCorrect = 0;
  for (const p of [a, b]) {
    if (s.tiles[p] === p) {
      s.locked[p] = true;
      newlyCorrect++;
    }
  }

  let gained = 0;
  if (newlyCorrect > 0) {
    s.streak++;
    const raw =
      newlyCorrect * (SCORE_PER_CORRECT + s.streak * SCORE_STREAK_BONUS) +
      (newlyCorrect >= 2 ? newlyCorrect * SCORE_DOUBLE_BONUS : 0);
    gained = Math.floor(raw * (hardMode ? HARD_MODE_MULTIPLIER : 1));
    s.score += gained;
  } else {
    s.streak = 0;
  }
  return { ok: true, newlyCorrect, gained };
}

/**
 * The best next swap: one that fixes two tiles at once if possible,
 * otherwise one that puts a tile in its correct place.
 */
export function suggestSwap(s: GameState): [number, number] | null {
  let single: [number, number] | null = null;
  for (let p = 0; p < s.tiles.length; p++) {
    if (s.locked[p]) continue;
    const t = s.tiles[p]; // tile at p belongs at position t
    if (t === p || s.locked[t]) continue;
    if (s.tiles[t] === p) return [p, t]; // swapping fixes both
    if (!single) single = [p, t];
  }
  return single;
}

export interface ReplayResult {
  state: GameState;
  /** Index of the first invalid action, or -1 if all were valid. */
  invalidAt: number;
}

/** Rebuild a game from its seed and move log. Used by the server to validate. */
export function replay(seed: number, difficulty: Difficulty, actions: Action[], hardMode = false): ReplayResult {
  const s = newGame(seed, difficulty);
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    if (!Array.isArray(act)) return { state: s, invalidAt: i };
    if (act[0] === 'hint') {
      s.hints++;
      continue;
    }
    if (act[0] === 'place') {
      const pair = suggestSwap(s);
      if (!pair) return { state: s, invalidAt: i };
      swap(s, pair[0], pair[1], hardMode);
      s.places++;
      continue;
    }
    const [a, b] = act as [number, number];
    if (!swap(s, a, b, hardMode).ok) return { state: s, invalidAt: i };
    if (isSolved(s) && i < actions.length - 1) return { state: s, invalidAt: i + 1 };
  }
  return { state: s, invalidAt: -1 };
}

export interface Rating {
  medal: 'gold' | 'silver' | 'bronze';
  stars: 1 | 2 | 3;
  scorePct: number;
  moveEffPct: number;
  speedEffPct: number;
}

/** Medal from move efficiency (72%) and speed against par (28%). */
export function rate(difficulty: Difficulty, totalTiles: number, moves: number, elapsedMs: number): Rating {
  const total = Math.max(1, totalTiles);
  const m = Math.max(1, moves);
  const elapsed = Math.max(1000, elapsedMs);
  const moveEff = Math.min(1, total / m);
  const speedEff = Math.min(1, (total * RULES[difficulty].parPerTileMs) / elapsed);
  const score = Math.max(0, Math.min(1, moveEff * MEDAL_WEIGHTS.moves + speedEff * MEDAL_WEIGHTS.speed));
  const medal = score >= MEDAL_GOLD ? 'gold' : score >= MEDAL_SILVER ? 'silver' : 'bronze';
  return {
    medal,
    stars: medal === 'gold' ? 3 : medal === 'silver' ? 2 : 1,
    scorePct: Math.round(score * 100),
    moveEffPct: Math.round(moveEff * 100),
    speedEffPct: Math.round(speedEff * 100),
  };
}

/** Points for finishing: base + speed bonus, times the hard-mode multiplier. */
export function winPoints(difficulty: Difficulty, elapsedMs: number, hardMode: boolean): number {
  const secs = Math.max(0.1, elapsedMs / 1000);
  const raw = RULES[difficulty].winBase + Math.floor(WIN_TIME_FACTOR / secs);
  return Math.floor(raw * (hardMode ? HARD_MODE_MULTIPLIER : 1));
}

/**
 * The elapsed time the server accepts: the client's figure (it excludes pauses),
 * but never more than the wall-clock time since the play started and never less
 * than a humanly possible 250 ms per move.
 */
export function acceptedElapsed(clientMs: number, wallMs: number, moves: number): number {
  const floor = moves * 250;
  const c = Number.isFinite(clientMs) ? clientMs : wallMs;
  return Math.max(floor, Math.min(Math.max(0, c), Math.max(floor, wallMs)));
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100));
  const tenths = total % 10;
  const secs = Math.floor(total / 10) % 60;
  const mins = Math.floor(total / 600);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}
