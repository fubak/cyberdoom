import { describe, expect, it } from 'vitest';
import { CEIL_MARGIN, CEIL_MIN_SCALE_FRAC, ceilingRiseCap, ceilingScaleCap } from '../src/render/melee';

describe('ceilingScaleCap', () => {
  it('caps a 1.45 sprite under a 1.25 ceiling', () => {
    expect(ceilingScaleCap(0, 1.25, 1.45, 1)).toBeCloseTo((1.25 - CEIL_MARGIN) / 1.45, 6);
  });
  it('does not shrink a short sprite', () => {
    expect(ceilingScaleCap(0, 1.25, 0.8, 1)).toBeGreaterThan(1);
  });
  it('a smaller topFrac raises the cap', () => {
    expect(ceilingScaleCap(0, 1.25, 1.45, 0.82)).toBeGreaterThan(ceilingScaleCap(0, 1.25, 1.45, 1));
  });
  it('a raised base lowers the cap', () => {
    expect(ceilingScaleCap(0.3, 1.55, 1.45, 1)).toBeLessThan(ceilingScaleCap(0, 1.55, 1.45, 1));
  });
  it('never goes negative', () => {
    expect(ceilingScaleCap(2, 1.25, 1.45, 1)).toBe(0);
  });
});

describe('CEIL_MIN_SCALE_FRAC', () => {
  it('lets a 2.08-high sprite at per-entity scale 1.35 fit under a 1.25 ceiling', () => {
    // the clamp keeps max(cap, own scale * floor); the needed share is ~0.43 of its own scale,
    // so the floor must sit below that or the boss ends above the ceiling.
    const own = 1.35;
    const cap = ceilingScaleCap(0, 1.25, 2.08, 1);
    const needed = cap / own;
    expect(needed).toBeCloseTo(0.43, 2);
    expect(CEIL_MIN_SCALE_FRAC).toBeLessThanOrEqual(needed);
    const finalScale = Math.min(own, Math.max(cap, own * CEIL_MIN_SCALE_FRAC));
    expect(2.08 * finalScale).toBeLessThanOrEqual(1.25 - CEIL_MARGIN + 1e-9);
  });
});

describe('ceilingRiseCap', () => {
  it('returns the remaining headroom', () => {
    expect(ceilingRiseCap(0, 1.25, 1.0)).toBeCloseTo(1.25 - CEIL_MARGIN - 1.0, 6);
  });
  it('is never negative', () => {
    expect(ceilingRiseCap(0, 1.25, 1.6)).toBe(0);
  });
  it('a raised base reduces headroom', () => {
    expect(ceilingRiseCap(0.2, 1.25, 0.8)).toBeLessThan(ceilingRiseCap(0, 1.25, 0.8));
  });
});
