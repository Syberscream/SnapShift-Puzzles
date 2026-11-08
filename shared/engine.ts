// SnapShift game engine: pure functions, no DOM. The same code runs in the
// browser (to play) and in the Worker (to replay and validate a move log).

import {
  type Difficulty,
  type GameRules,
  type GameSetup,
  gameRules,
  MEDAL_GOLD,
  MEDAL_SILVER,
  MEDAL_WEIGHTS,
  RULES,
  SCORE_DOUBLE_BONUS,
  SCORE_PER_CORRECT,
  SCORE_STREAK_BONUS,
  WIN_TIME_FACTOR,
  MEDAL_POINTS,
  type EngineVersion,
} from './rules';

/** One entry in the move log. */
export type Action =
  | [number, number] // swap the tiles at two board positions
  | ['r', number] // rotate the tile at a position a quarter turn clockwise (rotation mode)
  | ['hint'] // swap hint was revealed (may cost points)
  | ['place']; // "place one tile" helper: applies the best suggested move

export interface GameState {
  rows: number;
  cols: number;
  /** tiles[position] = id of the tile at that position. */
  tiles: number[];
  /** rot[position] = quarter turns clockwise of the tile at that position (0 = upright). */
  rot: number[];
  /** Tiles that can no longer move (only when the rules lock correct tiles). */
  locked: boolean[];
  rules: GameRules;
  /** Fewest moves that could solve the starting board (swaps + rotations). */
  par: number;
  moves: number;
  streak: number;
  score: number;
  hints: number;
  places: number;
}

export interface MoveResult {
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

/** v1 deal: a random shuffle with any tiles that landed in place moved on. */
export function deal(seed: number, rows: number, cols: number): number[] {
  const n = rows * cols;
  const tiles = Array.from({ length: n }, (_, i) => i);
  const rand = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
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

/**
 * v2 deal: the board is built from cycles so difficulty is controlled.
 * A cycle of length k needs k-1 swaps; a 2-cycle is one swap that fixes two tiles.
 *   pairs – mostly 2-cycles (easy to read, lots of double fixes)
 *   mixed – cycles of 2 to 6
 *   long  – a few long cycles (few double fixes, close to the most swaps possible)
 * No tile ever starts in its correct place.
 */
export function dealShaped(seed: number, rows: number, cols: number, shape: 'pairs' | 'mixed' | 'long'): number[] {
  const n = rows * cols;
  const rand = rng(seed ^ 0x9e3779b9);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    let k: number;
    if (shape === 'pairs') k = rand() < 0.8 ? 2 : 3;
    else if (shape === 'mixed') k = 2 + Math.floor(rand() * 5);
    else k = Math.max(8, Math.floor(n / (2 + Math.floor(rand() * 2))));
    if (left - k === 1) k += 1; // never leave a single tile (it would start in place)
    k = Math.min(k, left);
    sizes.push(k);
    left -= k;
  }
  const tiles = new Array<number>(n);
  let at = 0;
  for (const k of sizes) {
    const cyc = order.slice(at, at + k);
    at += k;
    for (let i = 0; i < k; i++) tiles[cyc[i]] = cyc[(i + 1) % k];
  }
  return tiles;
}

/** Fewest swaps to sort a board = tiles out of place minus cycles. */
export function minSwaps(tiles: number[]): number {
  const seen = new Array<boolean>(tiles.length).fill(false);
  let swaps = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (seen[i] || tiles[i] === i) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = tiles[j]) {
      seen[j] = true;
      len++;
    }
    swaps += len - 1;
  }
  return swaps;
}

/** Fewest clockwise quarter turns to set a tile upright. */
const turnsToUpright = (r: number) => (4 - (r % 4)) % 4;

export function newGame(seed: number, setup: GameSetup): GameState {
  return newGameWithRules(seed, gameRules(setup), setup.version);
}

/** A new board from explicit rules (custom grid sizes, e.g. the portal edition's levels). */
export function newGameWithRules(seed: number, rules: GameRules, version: EngineVersion = 2): GameState {
  const { rows, cols } = rules;
  const tiles = rules.scramble === 'random' ? deal(seed, rows, cols) : dealShaped(seed, rows, cols, rules.scramble);
  const n = tiles.length;
  const rot = new Array<number>(n).fill(0);
  if (rules.rotation) {
    const rand = rng(seed ^ 0x51ed270b);
    for (let i = 0; i < n; i++) rot[i] = rand() < 0.25 ? 0 : 1 + Math.floor(rand() * 3);
  }
  const s: GameState = {
    rows,
    cols,
    tiles,
    rot,
    locked: new Array<boolean>(n).fill(false),
    rules,
    par: 0,
    moves: 0,
    streak: 0,
    score: 0,
    hints: 0,
    places: 0,
  };
  // v1 scored efficiency against one move per tile; v2 uses the real minimum.
  s.par = version === 1 ? n : minSwaps(tiles) + rot.reduce((t, r) => t + turnsToUpright(r), 0);
  return s;
}

export function isCorrect(s: GameState, p: number): boolean {
  return s.tiles[p] === p && s.rot[p] === 0;
}

export function isSolved(s: GameState): boolean {
  return s.tiles.every((_, p) => isCorrect(s, p));
}

export function correctCount(s: GameState): number {
  return s.tiles.reduce((n, _, p) => n + (isCorrect(s, p) ? 1 : 0), 0);
}

function award(s: GameState, before: boolean[], positions: number[]): MoveResult {
  s.moves++;
  let newlyCorrect = 0;
  let lost = false;
  for (const p of positions) {
    const now = isCorrect(s, p);
    if (now && !before[p]) newlyCorrect++;
    if (!now && before[p]) lost = true;
    if (now && s.rules.lock) s.locked[p] = true;
  }
  let gained = 0;
  if (newlyCorrect > 0 && !lost) {
    s.streak++;
    const raw =
      newlyCorrect * (SCORE_PER_CORRECT + s.streak * SCORE_STREAK_BONUS) + (newlyCorrect >= 2 ? newlyCorrect * SCORE_DOUBLE_BONUS : 0);
    gained = Math.floor(raw * s.rules.scoreMultiplier);
    s.score += gained;
  } else {
    s.streak = 0;
  }
  return { ok: true, newlyCorrect, gained };
}

const valid = (s: GameState, p: number) => Number.isInteger(p) && p >= 0 && p < s.tiles.length;

/** Swap two positions (tiles keep their rotation). Locked tiles can't move. */
export function swap(s: GameState, a: number, b: number): MoveResult {
  if (!valid(s, a) || !valid(s, b) || a === b || s.locked[a] || s.locked[b]) return { ok: false, newlyCorrect: 0, gained: 0 };
  const before = s.tiles.map((_, p) => isCorrect(s, p));
  [s.tiles[a], s.tiles[b]] = [s.tiles[b], s.tiles[a]];
  [s.rot[a], s.rot[b]] = [s.rot[b], s.rot[a]];
  return award(s, before, [a, b]);
}

/** Rotate the tile at a position a quarter turn clockwise (rotation mode only). */
export function rotate(s: GameState, p: number): MoveResult {
  if (!s.rules.rotation || !valid(s, p) || s.locked[p]) return { ok: false, newlyCorrect: 0, gained: 0 };
  const before = s.tiles.map((_, q) => isCorrect(s, q));
  s.rot[p] = (s.rot[p] + 1) % 4;
  return award(s, before, [p]);
}

export type Suggestion = { kind: 'swap'; a: number; b: number } | { kind: 'rotate'; p: number };

/**
 * The best next move: a swap that fixes two tiles, else a swap that fixes one,
 * else (rotation mode) a turn toward upright for a tile already in place.
 * In rotation mode a swap only "fixes" a tile if it lands upright, so swaps that
 * put a tile in its place are preferred, then it gets rotated.
 */
export function suggest(s: GameState): Suggestion | null {
  let single: Suggestion | null = null;
  let placeOnly: Suggestion | null = null;
  for (let p = 0; p < s.tiles.length; p++) {
    if (s.locked[p] || s.tiles[p] === p) continue;
    const t = s.tiles[p]; // tile at p belongs at position t
    if (s.locked[t]) continue;
    if (s.tiles[t] === p) {
      if (!s.rules.rotation || (s.rot[p] === 0 && s.rot[t] === 0)) return { kind: 'swap', a: p, b: t };
      placeOnly ??= { kind: 'swap', a: p, b: t };
    }
    if (!single) {
      if (!s.rules.rotation || s.rot[p] === 0) single = { kind: 'swap', a: p, b: t };
      else placeOnly ??= { kind: 'swap', a: p, b: t };
    }
  }
  if (single) return single;
  if (s.rules.rotation) {
    for (let p = 0; p < s.tiles.length; p++) if (s.tiles[p] === p && s.rot[p] !== 0 && !s.locked[p]) return { kind: 'rotate', p };
  }
  return placeOnly;
}

/** v1-compatible helper: the suggested swap as a pair (null if the best move is a rotation). */
export function suggestSwap(s: GameState): [number, number] | null {
  const m = suggest(s);
  return m && m.kind === 'swap' ? [m.a, m.b] : null;
}

export function applySuggestion(s: GameState, m: Suggestion): MoveResult {
  return m.kind === 'swap' ? swap(s, m.a, m.b) : rotate(s, m.p);
}

export interface ReplayResult {
  state: GameState;
  /** Index of the first invalid action, or -1 if all were valid. */
  invalidAt: number;
}

/** Rebuild a game from its seed and move log. Used by the server to validate. */
export function replay(seed: number, setup: GameSetup, actions: Action[]): ReplayResult {
  const s = newGame(seed, setup);
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    if (!Array.isArray(act)) return { state: s, invalidAt: i };
    if (isSolved(s)) return { state: s, invalidAt: i }; // nothing allowed after the finish
    if (act[0] === 'hint') {
      s.hints++;
      continue;
    }
    if (act[0] === 'place') {
      const m = suggest(s);
      if (!m) return { state: s, invalidAt: i };
      applySuggestion(s, m);
      s.places++;
      continue;
    }
    if (act[0] === 'r') {
      if (!rotate(s, act[1] as number).ok) return { state: s, invalidAt: i };
      continue;
    }
    const [a, b] = act as [number, number];
    if (!swap(s, a, b).ok) return { state: s, invalidAt: i };
  }
  return { state: s, invalidAt: -1 };
}

export type Medal = 'gold' | 'silver' | 'bronze';

export interface Rating {
  medal: Medal;
  stars: 1 | 2 | 3;
  scorePct: number;
  moveEffPct: number;
  speedEffPct: number;
}

/** Medal from move efficiency (72%, against par) and speed against par time (28%). */
export function rate(difficulty: Difficulty, s: Pick<GameState, 'tiles' | 'par' | 'moves'>, elapsedMs: number): Rating {
  const total = Math.max(1, s.tiles.length);
  const par = Math.max(1, s.par);
  const m = Math.max(1, s.moves);
  const elapsed = Math.max(1000, elapsedMs);
  const moveEff = Math.min(1, par / m);
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

/**
 * Points for finishing. Engine v2: base × multiplier × medal factor.
 * Engine v1 games keep the launch formula: (base + speed bonus) × multiplier.
 */
export function winPoints(
  difficulty: Difficulty,
  rules: Pick<GameRules, 'scoreMultiplier'>,
  result: { medal: Medal | string | null; elapsedMs: number },
  version: EngineVersion = 2,
): number {
  if (version === 1) {
    const secs = Math.max(0.1, result.elapsedMs / 1000);
    return Math.floor((RULES[difficulty].winBase + Math.floor(WIN_TIME_FACTOR / secs)) * rules.scoreMultiplier);
  }
  const factor = MEDAL_POINTS[result.medal as Medal] ?? 1;
  return Math.floor(RULES[difficulty].winBase * rules.scoreMultiplier * factor);
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
