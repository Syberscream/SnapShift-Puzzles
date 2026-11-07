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

describe('photo-realistic prompts', () => {
  it('asks for real photographs except for art and fractals', () => {
    const rand = rng(5);
    for (const cat of ['animals', 'landscapes', 'cities', 'space', 'scifi']) {
      expect(pickIdea(cat, rand).prompt).toMatch(/photo/i);
      expect(pickIdea(cat, rand).prompt).toMatch(/Not an illustration/);
    }
    expect(pickIdea('art', rand).prompt).toMatch(/oil painting/);
  });

  it('gives space pictures space moods', () => {
    const rand = rng(9);
    for (let i = 0; i < 20; i++) expect(pickIdea('space', rand).prompt).not.toMatch(/spring bloom|after rain|autumn|winter day/);
  });
});

describe('mix of looks', () => {
  it('follows the photo-realistic share', () => {
    const count = (share: number) => {
      const rand = rng(11);
      let photos = 0;
      for (let i = 0; i < 400; i++) if (/photo/i.test(pickIdea('animals', rand, '', new Set(), share).prompt)) photos++;
      return photos;
    };
    expect(count(100)).toBe(400);
    expect(count(0)).toBe(0);
    expect(count(60)).toBeGreaterThan(200);
    expect(count(60)).toBeLessThan(280);
  });

  it('keeps Art painted', () => {
    const rand = rng(4);
    for (let i = 0; i < 30; i++) expect(pickIdea('art', rand, '', new Set(), 0).prompt).toMatch(/oil painting/);
  });
});
