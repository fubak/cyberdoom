import { describe, expect, it } from 'vitest';
import { LOOM_CAP_FRAC, LOOM_FILL_FRAC, LOOM_MAX_SCALE, fracAboveLine, loomTargetH, riseBase, spriteScreenRect } from '../src/render/melee';
import { VM_CLEAR } from '../src/tools/anim';

// Mirrors src/render/renderer.ts: EYE_H, camera fov 58, point-blank MIN_D 0.42,
// maxH cap of 65% of the view frustum span (LOOM_CAP_FRAC while lunging).
const EYE_H = 0.6;
const FOV = 58;
const MIN_D = 0.42;

/** Drawn sprite height after the renderer's point-blank height clamp. */
function drawnH(setH: number, dist: number, lunging = false): number {
  const span = 2 * dist * Math.tan((FOV * Math.PI) / 360);
  const maxH = (lunging ? LOOM_CAP_FRAC : 0.65) * span;
  const want = lunging ? Math.min(loomTargetH(dist, FOV), LOOM_MAX_SCALE * setH) : setH;
  return Math.min(want, maxH);
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
    const h = drawnH(setH, dist);
    const rise = riseBase(h, dist, EYE_H, FOV);
    expect(rise).toBeGreaterThan(0);
    const rect = spriteScreenRect(rise, h, dist, EYE_H, FOV);
    expect(fracAboveLine(rect, VM_CLEAR)).toBeGreaterThanOrEqual(0.6);
  });

  it('lunging worm fills ~40-50% of view height at <=1.2 tiles', () => {
    for (const dist of [MIN_D, 0.8, 1.0, 1.2]) {
      const h = drawnH(1.3, dist, true);
      const rise = riseBase(h, dist, EYE_H, FOV);
      const rect = spriteScreenRect(rise, h, dist, EYE_H, FOV);
      const span = 2 * dist * Math.tan((FOV * Math.PI) / 360);
      // view-height share of the sprite that clears the viewmodel line
      const frac = rect.bottom - rect.top > 0 ? fracAboveLine(rect, VM_CLEAR) * (h / span) : 0;
      expect(frac).toBeGreaterThanOrEqual(LOOM_FILL_FRAC - 0.02);
    }
  });

  it('without the lunge a floor attacker at contact hides behind the viewmodel', () => {
    // the gap this fix targets: worm flat on the floor at contact range
    const h = drawnH(1.3, 0.7);
    const rect = spriteScreenRect(0, h, 0.7, EYE_H, FOV);
    expect(fracAboveLine(rect, VM_CLEAR)).toBeLessThan(0.6);
  });

  it('does not lift attackers beyond melee range', () => {
    // at 2 tiles a 1.3-height sprite already reads above the viewmodel line
    const h = drawnH(1.3, 2.0);
    expect(riseBase(h, 2.0, EYE_H, FOV)).toBeLessThanOrEqual(0);
  });
});
