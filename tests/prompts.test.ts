import { describe, expect, it } from 'vitest';
import { pickIdea, uniqueTitle } from '../worker/pipeline/prompts';
import { rng } from '../shared/engine';

describe('pickIdea', () => {
  it('never repeats a title within a category', () => {
    for (const cat of ['animals', 'space', 'fractals', 'daily']) {
      const taken = new Set<string>();
      const rand = rng(7);
      const titles = Array.from({ length: 150 }, () => pickIdea(cat, rand, '', taken).title.toLowerCase());
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('skips titles that already exist', () => {
    const taken = new Set(['red fox', 'snow leopard']);
    const rand = rng(1);
    for (let i = 0; i < 20; i++) {
      const t = pickIdea('animals', rand, '', taken).title;
      expect(['Red Fox', 'Snow Leopard']).not.toContain(t);
    }
  });

  it('uses plain subjects first, then subject + mood', () => {
    const taken = new Set<string>();
    const rand = rng(3);
    const first = Array.from({ length: 16 }, () => pickIdea('animals', rand, '', taken).title);
    expect(first.every((t) => !t.includes(','))).toBe(true);
    expect(pickIdea('animals', rand, '', taken).title).toMatch(/, /);
  });
});

describe('uniqueTitle', () => {
  it('numbers repeats', () => {
    const taken = new Set(['red fox', 'red fox 2']);
    expect(uniqueTitle('Red Fox', taken)).toBe('Red Fox 3');
    expect(uniqueTitle('Barn Owl', taken)).toBe('Barn Owl');
  });
});
