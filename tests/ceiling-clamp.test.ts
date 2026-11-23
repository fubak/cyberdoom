import { describe, expect, it } from 'vitest';
import { CEIL_MARGIN, ceilingRiseCap, ceilingScaleCap } from '../src/render/melee';

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
