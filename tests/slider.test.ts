import { describe, expect, it } from 'vitest';
import { lineSteps, slide, sliderNew, sliderReplay, sliderSolved, sliderSolve, sliderMedal, distance, SLIDER_SIZES } from '../shared/slider';

describe('slider', () => {
  it('scrambles deterministically and never starts solved', () => {
    for (const n of SLIDER_SIZES) {
      const a = sliderNew(123, n);
      const b = sliderNew(123, n);
      expect(a.tiles).toEqual(b.tiles);
      expect(sliderSolved(a)).toBe(false);
      expect(distance(a)).toBeGreaterThanOrEqual(n * n * 1.5);
      expect([...a.tiles].sort((x, y) => x - y)).toEqual(Array.from({ length: n * n }, (_, i) => i));
    }
  });
  it('only slides tiles next to the empty square', () => {
    const s = sliderNew(5, 3);
    const far = [...Array(9).keys()].find((p) => p !== s.blank && Math.abs(p - s.blank) !== 1 && Math.abs(p - s.blank) !== 3)!;
    expect(slide(s, far)).toBe(false);
  });
  it('line taps become single steps', () => {
    const s = sliderNew(9, 4);
    const row = Math.floor(s.blank / 4);
    const target = row * 4 + (s.blank % 4 === 0 ? 3 : 0);
    const steps = lineSteps(s, target);
    expect(steps.length).toBe(Math.abs((target % 4) - (s.blank % 4)));
    for (const q of steps) expect(slide(s, q)).toBe(true);
    expect(s.blank).toBe(target);
  });
  it('solves a 3×3 and the replay agrees', () => {
    for (const seed of [1, 2, 3, 77]) {
      const s = sliderNew(seed, 3);
      const moves = sliderSolve(s)!;
      expect(moves).not.toBeNull();
      const r = sliderReplay(seed, 3, moves);
      expect(r.invalidAt).toBe(-1);
      expect(sliderSolved(r.state)).toBe(true);
    }
  });
  it('rejects illegal moves on replay', () => {
    expect(sliderReplay(1, 3, [99]).invalidAt).toBe(0);
  });
  it('medals by time', () => {
    expect(sliderMedal(3, 30_000)).toBe('gold');
    expect(sliderMedal(3, 60_000)).toBe('silver');
    expect(sliderMedal(3, 200_000)).toBe('bronze');
  });
});
