import { describe, expect, it } from 'vitest';
import { applySuggestion, isSolved, newGame, replay, suggest, type Action } from '../shared/engine';
import { TIME_ATTACK, TIME_ATTACK_SETUP, gameRules, timeAttackScore } from '../shared/rules';
import { weekOf } from '../worker/lib/util';

describe('time attack', () => {
  it('uses small locking boards with no helpers', () => {
    const r = gameRules(TIME_ATTACK_SETUP);
    expect([r.rows, r.cols]).toEqual([TIME_ATTACK.rows, TIME_ATTACK.cols]);
    expect(r.lock && r.glow).toBe(true);
    expect(r.placeAllowed).toBe(false);
    expect(r.rotation).toBe(false);
  });

  it('boards are shuffled and solvable by replay', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newGame(seed, TIME_ATTACK_SETUP);
      expect(isSolved(s)).toBe(false);
      const log: Action[] = [];
      for (let m = suggest(s); m && !isSolved(s); m = suggest(s)) {
        if (m.kind !== 'swap') throw new Error('unexpected rotate');
        log.push([m.a, m.b]);
        applySuggestion(s, m);
      }
      const r = replay(seed, TIME_ATTACK_SETUP, log);
      expect(r.invalidAt).toBe(-1);
      expect(isSolved(r.state)).toBe(true);
      expect(timeAttackScore(r.state.par, r.state.moves)).toBe(TIME_ATTACK.perSolve + TIME_ATTACK.efficiencyBonus);
    }
  });

  it('scores fewer bonus points for extra moves', () => {
    expect(timeAttackScore(6, 6)).toBe(150);
    expect(timeAttackScore(6, 12)).toBe(125);
    expect(timeAttackScore(6, 600)).toBe(101);
  });

  it('weeks start on Monday', () => {
    expect(weekOf('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekOf('2026-11-05')).toBe('2026-11-02'); // Thursday
    expect(weekOf('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(weekOf('2026-11-09')).toBe('2026-11-09');
  });
});
