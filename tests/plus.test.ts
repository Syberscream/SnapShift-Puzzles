import { describe, expect, it } from 'vitest';
import { periodEnd, signStripePayload, verifyStripeSignature } from '../worker/lib/stripe';
import { access, earlyUntil, type PuzzleRow, type Viewer } from '../worker/lib/catalog';
import { PLUS } from '../shared/rules';

const free: Viewer = { user: null, member: false, admin: false };
const member: Viewer = { user: null, member: true, admin: false };
const puzzle = (publishedAgoMs: number) => ({ published_at: Date.now() - publishedAgoMs }) as PuzzleRow;
const old = puzzle(5 * 86400_000);
const fresh = puzzle(3600_000);

describe('stripe webhooks', () => {
  it('accepts a correct signature and rejects tampering, wrong secrets and old timestamps', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    const sig = await signStripePayload('whsec_a', body);
    expect(await verifyStripeSignature('whsec_a', body, sig)).toBe(true);
    expect(await verifyStripeSignature('whsec_a', body + ' ', sig)).toBe(false);
    expect(await verifyStripeSignature('whsec_b', body, sig)).toBe(false);
    const stale = await signStripePayload('whsec_a', body, Math.floor(Date.now() / 1000) - 3600);
    expect(await verifyStripeSignature('whsec_a', body, stale)).toBe(false);
    expect(await verifyStripeSignature('whsec_a', body, '')).toBe(false);
  });

  it('reads the period end from either API shape', () => {
    expect(periodEnd({ id: 's', status: 'active', customer: 'c', current_period_end: 100 })).toBe(100_000);
    expect(periodEnd({ id: 's', status: 'active', customer: 'c', items: { data: [{ current_period_end: 200 }] } })).toBe(200_000);
  });
});

describe('puzzle access', () => {
  it('free players: first puzzle free, others by points, members gallery locked', () => {
    expect(access(old, 0, free, false, false)).toMatchObject({ unlocked: true });
    expect(access(old, 3, free, false, false)).toMatchObject({ unlocked: false, lock: 'points' });
    expect(access(old, 3, free, false, true)).toMatchObject({ unlocked: true });
    expect(access(old, 0, free, true, false)).toMatchObject({ unlocked: false, lock: 'members' });
  });

  it('new puzzles are members-first for 48 hours, except the free first one', () => {
    expect(access(fresh, 3, free, false, true)).toMatchObject({ unlocked: false, lock: 'early' });
    expect(access(fresh, 0, free, false, false)).toMatchObject({ unlocked: true });
    expect(earlyUntil(fresh)! - Date.now()).toBeGreaterThan(PLUS.earlyAccessMs - 2 * 3600_000);
    expect(earlyUntil(old)).toBeNull();
  });

  it('members get everything', () => {
    for (const [p, i, mo] of [[old, 5, false], [fresh, 5, false], [old, 0, true]] as const) {
      expect(access(p, i, member, mo, false).unlocked).toBe(true);
    }
  });
});
