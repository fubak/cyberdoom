import { describe, expect, it } from 'vitest';
import {
  LOOM_CAP_FRAC,
  LOOM_FILL_FRAC,
  LOOM_MAX_DIST,
  LOOM_MAX_SCALE,
  fracAboveLine,
  loomK,
  loomT,
  loomTargetH,
  riseBase,
  spriteScreenRect,
} from '../src/render/melee';
import { VM_CLEAR } from '../src/tools/anim';

// Mirrors src/render/renderer.ts: EYE_H, camera fov 58, point-blank MIN_D 0.42,
// graded loom cap (0.65 → LOOM_CAP_FRAC) and melee chase swell.
const EYE_H = 0.6;
const FOV = 58;
const MIN_D = 0.42;

/** Drawn sprite height after the renderer's graded-loom height clamp. */
function drawnH(setH: number, dist: number, attacking = false, melee = true, scale = 1): number {
  const loom = loomK(dist, attacking, melee);
  const span = 2 * dist * Math.tan((FOV * Math.PI) / 360);
  const maxH = (0.65 + (LOOM_CAP_FRAC - 0.65) * loom) * span;
  const swell = melee && !attacking ? 0.5 * loomT(dist) : 0;
  const want = Math.max(
    scale * (1 + swell),
    attacking ? Math.min(loomTargetH(dist, FOV) / setH, LOOM_MAX_SCALE) : 0,
  );
  return Math.min(setH * want, maxH);
}

/** Graded lunge lift (renderer: lunge fades in with the loom ramp). */
function lunge(h: number, dist: number, attacking = false, melee = true): number {
  const loom = loomK(dist, attacking, melee);
  return Math.max(0, riseBase(h, dist, EYE_H, FOV)) * Math.min(1, loom * 4);
}

/** Share of the 3D view height the sprite covers above the viewmodel line. */
function viewFillAboveLine(h: number, rise: number, dist: number): number {
  const rect = spriteScreenRect(rise, h, dist, EYE_H, FOV);
  return Math.max(0, Math.min(rect.bottom, VM_CLEAR) - rect.top);
}

describe('melee-range silhouette lunge', () => {
  // Floor-height attackers (F3 world heights): worm, rootkit, logicbomb
  it.each([
    ['worm', 1.3, MIN_D],
    ['worm', 1.3, 0.8],
    ['worm', 1.3, 1.0],
    ['rootkit', 1.35, MIN_D],
    ['rootkit', 1.35, 1.0],
    ['logicbomb', 1.25, MIN_D],
    ['logicbomb', 1.25, 1.0],
  ])('%s at %s tiles: >=60%% of silhouette clears the viewmodel top', (_name, setH, dist) => {
    const h = drawnH(setH, dist, true);
    const rise = lunge(h, dist, true);
    expect(rise).toBeGreaterThan(0);
    const rect = spriteScreenRect(rise, h, dist, EYE_H, FOV);
    expect(fracAboveLine(rect, VM_CLEAR)).toBeGreaterThanOrEqual(0.6);
  });

  it('attacking melee threat fills >=50% of view height at <=1.5 tiles', () => {
    // windup strike at the ~1.5x reared scale: the whole sprite fills the view
    for (const dist of [MIN_D, 0.8, 1.0, 1.2, 1.5]) {
      const h = drawnH(1.3, dist, true, true, 1.5);
      const span = 2 * dist * Math.tan((FOV * Math.PI) / 360);
      expect(h / span).toBeGreaterThanOrEqual(0.5);
      // and enough of it clears the viewmodel to read as the strike
      const rise = lunge(h, dist, true);
      expect(viewFillAboveLine(h, rise, dist)).toBeGreaterThanOrEqual(LOOM_FILL_FRAC - 0.02);
    }
  });

  it('chasing melee threat fills >=40% of view height at 1.5-2 tiles', () => {
    for (const dist of [1.5, 1.7, 2.0]) {
      const h = drawnH(1.3, dist, false, true);
      const span = 2 * dist * Math.tan((FOV * Math.PI) / 360);
      expect(h / span).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('the chase swell ramps smoothly into the loom — no pop at the old boundary', () => {
    // drawn-height share of view is continuous across the ramp band
    const fill = (dist: number, attacking: boolean) => {
      const h = drawnH(1.3, dist, attacking, true);
      return h / (2 * dist * Math.tan((FOV * Math.PI) / 360));
    };
    for (const d of [1.35, 1.5, 1.7, 2.0, 2.2]) {
      expect(Math.abs(fill(d, false) - fill(d + 0.01, false))).toBeLessThan(0.05);
    }
    // the band ends at LOOM_MAX_DIST: beyond it there is no loom at all
    expect(loomT(LOOM_MAX_DIST)).toBe(0);
    expect(loomK(2.5, false, true)).toBe(0);
    expect(loomK(2.5, true, true)).toBe(0);
  });

  it('ranged threats get no chase swell, only the attack loom', () => {
    expect(loomK(1.8, false, false)).toBe(0);
    expect(loomK(1.8, true, false)).toBeGreaterThan(0);
  });

  it('without the lunge a floor attacker at contact hides behind the viewmodel', () => {
    // the gap this fix targets: worm flat on the floor at contact range
    const h = drawnH(1.3, 0.7);
    const rect = spriteScreenRect(0, h, 0.7, EYE_H, FOV);
    expect(fracAboveLine(rect, VM_CLEAR)).toBeLessThan(0.6);
  });

  it('does not lift attackers past the loom band', () => {
    // at 2.5 tiles a 1.3-height sprite already reads over the viewmodel line
    const h = drawnH(1.3, 2.5);
    expect(riseBase(h, 2.5, EYE_H, FOV)).toBeLessThanOrEqual(0);
    expect(lunge(h, 2.5, false, true)).toBe(0);
  });
});
