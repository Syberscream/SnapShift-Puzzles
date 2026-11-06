import { describe, expect, it } from 'vitest';
import {
  acceptedElapsed,
  deal,
  isSolved,
  newGame,
  rate,
  replay,
  seedFromString,
  suggestSwap,
  swap,
  winPoints,
  type Action,
} from '../shared/engine';
import { RULES, unlockCost } from '../shared/rules';

/** Solve a board with suggested swaps, returning the move log. */
function solve(seed: number, difficulty: 'easy' | 'medium' | 'hard'): Action[] {
  const g = newGame(seed, difficulty);
  const log: Action[] = [];
  let guard = 0;
  while (!isSolved(g) && guard++ < 1000) {
    const pair = suggestSwap(g)!;
    swap(g, pair[0], pair[1]);
    log.push(pair);
  }
  return log;
}

describe('deal', () => {
  it('is deterministic for a seed and is a permutation', () => {
    const a = deal(123, 4, 6);
    expect(deal(123, 4, 6)).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(deal(124, 4, 6)).not.toEqual(a);
  });

  it('never starts a tile in its correct place', () => {
    for (let seed = 1; seed < 2000; seed++) {
      for (const d of ['easy', 'medium', 'hard'] as const) {
        const { rows, cols } = RULES[d];
        const t = deal(seed, rows, cols);
        expect(t.some((v, i) => v === i)).toBe(false);
      }
    }
  });

  it('gives every player the same daily board', () => {
    expect(seedFromString('2026-11-05')).toBe(seedFromString('2026-11-05'));
    expect(seedFromString('2026-11-05')).not.toBe(seedFromString('2026-11-06'));
  });
});

describe('swap', () => {
  it('locks tiles that land in place and refuses to move them', () => {
    const g = newGame(7, 'easy');
    const pair = suggestSwap(g)!;
    const r = swap(g, pair[0], pair[1]);
    expect(r.ok).toBe(true);
    expect(r.newlyCorrect).toBeGreaterThan(0);
    const lockedPos = g.tiles.findIndex((t, i) => t === i);
    const other = g.locked.findIndex((l) => !l);
    expect(swap(g, lockedPos, other).ok).toBe(false);
  });

  it('rejects out-of-range and same-square swaps', () => {
    const g = newGame(7, 'easy');
    expect(swap(g, 0, 0).ok).toBe(false);
    expect(swap(g, -1, 3).ok).toBe(false);
    expect(swap(g, 0, 24).ok).toBe(false);
    expect(g.moves).toBe(0);
  });

  it('builds a streak and resets it on a miss', () => {
    const g = newGame(99, 'medium');
    const p1 = suggestSwap(g)!;
    swap(g, p1[0], p1[1]);
    const p2 = suggestSwap(g)!;
    swap(g, p2[0], p2[1]);
    expect(g.streak).toBe(2);
    // find a swap that fixes nothing
    const free = g.locked.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
    outer: for (const a of free)
      for (const b of free) {
        if (a >= b) continue;
        if (g.tiles[a] !== b && g.tiles[b] !== a) {
          swap(g, a, b);
          break outer;
        }
      }
    expect(g.streak).toBe(0);
  });

  it('scores hard mode higher', () => {
    const a = newGame(5, 'easy');
    const b = newGame(5, 'easy');
    const p = suggestSwap(a)!;
    const ra = swap(a, p[0], p[1], false);
    const rb = swap(b, p[0], p[1], true);
    expect(rb.gained).toBeGreaterThan(ra.gained);
  });
});

describe('replay', () => {
  it('accepts a real solution for every difficulty', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const log = solve(4242, d);
      const r = replay(4242, d, log);
      expect(r.invalidAt).toBe(-1);
      expect(isSolved(r.state)).toBe(true);
      expect(r.state.moves).toBe(log.length);
    }
  });

  it('applies hint and place actions', () => {
    const r = replay(11, 'easy', [['hint'], ['place'], ['place']]);
    expect(r.invalidAt).toBe(-1);
    expect(r.state.hints).toBe(1);
    expect(r.state.places).toBe(2);
    expect(r.state.moves).toBe(2);
  });

  it('flags the first illegal move', () => {
    const log = solve(3, 'easy');
    const bad: Action[] = [log[0], [log[0][0], log[0][1]] as Action]; // second swap moves a locked tile
    expect(replay(3, 'easy', bad).invalidAt).toBe(1);
    expect(replay(3, 'easy', [['nope'] as unknown as Action]).invalidAt).toBe(0);
  });

  it('rejects moves after the puzzle is solved', () => {
    const log = solve(8, 'easy');
    expect(replay(8, 'easy', [...log, [0, 1]]).invalidAt).toBe(log.length);
  });

  it('is not fooled by a different seed', () => {
    const log = solve(1, 'easy');
    const r = replay(2, 'easy', log);
    expect(r.invalidAt !== -1 || !isSolved(r.state)).toBe(true);
  });
});

describe('scoring', () => {
  it('gives gold for a perfect fast solve and bronze for a sloppy one', () => {
    expect(rate('easy', 24, 12, 20_000).medal).toBe('gold');
    expect(rate('easy', 24, 80, 600_000).medal).toBe('bronze');
  });

  it('matches the original formula', () => {
    const r = rate('easy', 24, 24, 24 * 5600);
    expect(r.moveEffPct).toBe(100);
    expect(r.speedEffPct).toBe(100);
    expect(r.scorePct).toBe(100);
    expect(winPoints('easy', 60_000, false)).toBe(40 + 10);
    expect(winPoints('hard', 60_000, true)).toBe(Math.floor((80 + 10) * 1.45));
  });

  it('clamps elapsed time between a human floor and wall-clock time', () => {
    expect(acceptedElapsed(1000, 60_000, 20)).toBe(5000); // too fast to be real
    expect(acceptedElapsed(90_000, 60_000, 20)).toBe(60_000); // can't exceed wall time
    expect(acceptedElapsed(30_000, 60_000, 20)).toBe(30_000); // paused for a while: fine
  });

  it('prices unlocks by position', () => {
    expect(unlockCost(0)).toBe(0);
    expect(unlockCost(1)).toBe(140);
    expect(unlockCost(5)).toBe(300);
  });
});
