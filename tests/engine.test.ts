import { describe, expect, it } from 'vitest';
import {
  acceptedElapsed,
  applySuggestion,
  deal,
  dealShaped,
  isSolved,
  minSwaps,
  newGame,
  rate,
  replay,
  rotate,
  seedFromString,
  suggest,
  swap,
  winPoints,
  type Action,
  type GameState,
} from '../shared/engine';
import { DIFFICULTIES, gameRules, MODES, RULES, streakMilestone, unlockCost, type Difficulty, type GameSetup, type Mode } from '../shared/rules';

const setup = (difficulty: Difficulty, mode: Mode = 'classic', version: 1 | 2 = 2, extra: Partial<GameSetup> = {}): GameSetup => ({
  version,
  difficulty,
  mode,
  daily: false,
  hardMode: false,
  ...extra,
});

/** Solve a board with suggested moves, returning the move log. */
function solve(seed: number, g: GameSetup): { log: Action[]; state: GameState } {
  const s = newGame(seed, g);
  const log: Action[] = [];
  let guard = 0;
  while (!isSolved(s) && guard++ < 2000) {
    const m = suggest(s)!;
    expect(m).not.toBeNull();
    applySuggestion(s, m);
    log.push(m.kind === 'swap' ? [m.a, m.b] : ['r', m.p]);
  }
  return { log, state: s };
}

describe('dealing', () => {
  it('v1 deal is unchanged, deterministic and has no tile in place', () => {
    const a = deal(123, 4, 6);
    expect(deal(123, 4, 6)).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    for (let seed = 1; seed < 500; seed++) expect(deal(seed, 8, 12).some((v, i) => v === i)).toBe(false);
  });

  it('shaped deals are permutations with no tile in place', () => {
    for (const shape of ['pairs', 'mixed', 'long'] as const)
      for (let seed = 1; seed < 400; seed++) {
        const t = dealShaped(seed, 6, 9, shape);
        expect([...t].sort((x, y) => x - y)).toEqual(Array.from({ length: 54 }, (_, i) => i));
        expect(t.some((v, i) => v === i)).toBe(false);
      }
  });

  it('scramble shape changes how many swaps are needed', () => {
    const avg = (shape: 'pairs' | 'mixed' | 'long') => {
      let sum = 0;
      for (let seed = 1; seed <= 200; seed++) sum += minSwaps(dealShaped(seed, 8, 12, shape));
      return sum / 200;
    };
    const pairs = avg('pairs');
    const long = avg('long');
    expect(pairs).toBeLessThan(60); // ~half the 96 tiles: most swaps fix two
    expect(long).toBeGreaterThan(90); // close to the maximum (95)
    expect(avg('mixed')).toBeGreaterThan(pairs);
  });

  it('gives every player the same daily board', () => {
    expect(seedFromString('2026-11-05')).toBe(seedFromString('2026-11-05'));
    expect(seedFromString('2026-11-05')).not.toBe(seedFromString('2026-11-06'));
  });
});

describe('rules per difficulty', () => {
  it('easy locks and glows, hard does neither', () => {
    expect(gameRules(setup('easy'))).toMatchObject({ lock: true, glow: true, preview: 'always' });
    expect(gameRules(setup('medium'))).toMatchObject({ lock: true, glow: false, preview: 'peek' });
    expect(gameRules(setup('hard'))).toMatchObject({ lock: false, glow: false, preview: 'hidden' });
  });

  it('zen is fully assisted and untimed', () => {
    expect(gameRules(setup('hard', 'zen'))).toMatchObject({ lock: true, glow: true, timed: false, hintCost: 0 });
  });

  it('rotation uses square-tile grids', () => {
    const r = gameRules(setup('medium', 'rotation'));
    expect([r.rows, r.cols]).toEqual(RULES.medium.rotationGrid);
    expect(r.square).toBe(true);
  });
});

describe('moves', () => {
  it('locks correct tiles when the rules say so', () => {
    const g = newGame(7, setup('easy'));
    const m = suggest(g)!;
    if (m.kind !== 'swap') throw new Error('expected swap');
    expect(swap(g, m.a, m.b).newlyCorrect).toBeGreaterThan(0);
    const lockedPos = g.locked.findIndex(Boolean);
    const other = g.locked.findIndex((l) => !l);
    expect(swap(g, lockedPos, other).ok).toBe(false);
  });

  it('on hard a correct tile can be moved out again, which breaks the streak', () => {
    const g = newGame(9, setup('hard'));
    const m = suggest(g)!;
    if (m.kind !== 'swap') throw new Error('expected swap');
    swap(g, m.a, m.b);
    const correct = g.tiles.findIndex((t, i) => t === i);
    const other = g.tiles.findIndex((t, i) => t !== i);
    const r = swap(g, correct, other);
    expect(r.ok).toBe(true);
    expect(g.tiles[correct]).not.toBe(correct);
    expect(g.streak).toBe(0);
  });

  it('rejects out-of-range and same-square swaps', () => {
    const g = newGame(7, setup('easy'));
    expect(swap(g, 0, 0).ok).toBe(false);
    expect(swap(g, -1, 3).ok).toBe(false);
    expect(swap(g, 0, 24).ok).toBe(false);
    expect(g.moves).toBe(0);
  });

  it('rotation only works in rotation mode', () => {
    expect(rotate(newGame(3, setup('easy')), 0).ok).toBe(false);
    const g = newGame(3, setup('easy', 'rotation'));
    const before = g.rot[0];
    expect(rotate(g, 0).ok).toBe(true);
    expect(g.rot[0]).toBe((before + 1) % 4);
  });

  it('harder difficulties score more for the same move', () => {
    const score = (d: Difficulty) => {
      const g = newGame(5, setup(d));
      const m = suggest(g)!;
      return applySuggestion(g, m).gained;
    };
    expect(score('medium')).toBeGreaterThan(score('easy'));
  });
});

describe('replay', () => {
  it('accepts a real solution in every difficulty and mode', () => {
    for (const d of DIFFICULTIES)
      for (const mode of MODES) {
        const g = setup(d, mode);
        const { log, state } = solve(4242, g);
        const r = replay(4242, g, log);
        expect(r.invalidAt).toBe(-1);
        expect(isSolved(r.state)).toBe(true);
        expect(r.state.moves).toBe(state.moves);
      }
  });

  it('suggested moves solve a board in exactly par moves for classic', () => {
    for (const d of DIFFICULTIES) {
      const { state } = solve(77, setup(d));
      expect(state.moves).toBe(state.par);
    }
  });

  it('applies hint and place actions', () => {
    const r = replay(11, setup('easy'), [['hint'], ['place'], ['place']]);
    expect(r.invalidAt).toBe(-1);
    expect(r.state.hints).toBe(1);
    expect(r.state.places).toBe(2);
    expect(r.state.moves).toBe(2);
  });

  it('flags illegal moves and moves after the finish', () => {
    const { log } = solve(3, setup('easy'));
    expect(replay(3, setup('easy'), [log[0], log[0]]).invalidAt).toBe(1); // second swap moves a locked tile
    expect(replay(3, setup('easy'), [['nope'] as unknown as Action]).invalidAt).toBe(0);
    expect(replay(3, setup('easy'), [...log, [0, 1]]).invalidAt).toBe(log.length);
    expect(replay(3, setup('easy'), [['r', 0]]).invalidAt).toBe(0); // no rotating in classic
  });

  it('is not fooled by a different seed', () => {
    const { log } = solve(1, setup('easy'));
    const r = replay(2, setup('easy'), log);
    expect(r.invalidAt !== -1 || !isSolved(r.state)).toBe(true);
  });

  it('version 1 games replay exactly as before', () => {
    const v1 = setup('easy', 'classic', 1);
    const s = newGame(4242, v1);
    expect(s.tiles).toEqual(deal(4242, 4, 6));
    expect(s.par).toBe(24);
    const { log } = solve(4242, v1);
    expect(replay(4242, v1, log).invalidAt).toBe(-1);
    // v1 hard mode still multiplies by 1.45
    const hm = newGame(5, setup('easy', 'classic', 1, { hardMode: true }));
    const plain = newGame(5, v1);
    const m = suggest(plain)!;
    expect(applySuggestion(hm, m).gained).toBeGreaterThan(applySuggestion(plain, m).gained);
  });
});

describe('scoring', () => {
  it('perfect fast solve is gold, sloppy slow one bronze', () => {
    const fake = { tiles: new Array(24).fill(0), par: 14, moves: 14 };
    expect(rate('easy', fake, 20_000).medal).toBe('gold');
    expect(rate('easy', { ...fake, moves: 80 }, 600_000).medal).toBe('bronze');
  });

  it('pays win points by difficulty, mode and medal', () => {
    const r = (medal: string) => ({ medal, elapsedMs: 60_000 });
    expect(winPoints('easy', gameRules(setup('easy')), r('bronze'))).toBe(40);
    expect(winPoints('easy', gameRules(setup('easy')), r('gold'))).toBe(60);
    expect(winPoints('medium', gameRules(setup('medium')), r('silver'))).toBe(150);
    expect(winPoints('hard', gameRules(setup('hard')), r('gold'))).toBe(480);
    expect(winPoints('hard', gameRules(setup('hard', 'rotation')), r('gold'))).toBe(600);
  });

  it('keeps the launch formula for engine v1 games', () => {
    const v1 = gameRules({ version: 1, difficulty: 'hard', mode: 'classic', daily: false, hardMode: true });
    expect(winPoints('hard', v1, { medal: 'gold', elapsedMs: 60_000 }, 1)).toBe(Math.floor((80 + 10) * 1.45));
  });

  it('repeats the streak bonus every 30 days after a month', () => {
    expect(streakMilestone(7)?.points).toBe(250);
    expect(streakMilestone(30)?.points).toBe(1500);
    expect(streakMilestone(45)).toBeNull();
    expect(streakMilestone(60)?.points).toBe(1500);
    expect(streakMilestone(90)?.days).toBe(90);
  });

  it('clamps elapsed time between a human floor and wall-clock time', () => {
    expect(acceptedElapsed(1000, 60_000, 20)).toBe(5000);
    expect(acceptedElapsed(90_000, 60_000, 20)).toBe(60_000);
    expect(acceptedElapsed(30_000, 60_000, 20)).toBe(30_000);
  });

  it('prices unlocks by position', () => {
    expect(unlockCost(0)).toBe(0);
    expect(unlockCost(1)).toBe(140);
    expect(unlockCost(10)).toBe(500);
    expect(unlockCost(60)).toBe(500);
  });
});
