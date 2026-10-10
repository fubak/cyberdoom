import { describe, expect, it } from 'vitest';
import { fracAboveLine, riseBase, spriteScreenRect } from '../src/render/melee';
import { VM_CLEAR } from '../src/tools/anim';

// Mirrors src/render/renderer.ts: EYE_H, camera fov 58, point-blank MIN_D 0.42,
// maxH cap of 65% of the view frustum span.
const EYE_H = 0.6;
const FOV = 58;
const MIN_D = 0.42;

/** Drawn sprite height after the renderer's point-blank height clamp. */
function drawnH(setH: number, dist: number): number {
  const maxH = 0.65 * 2 * dist * Math.tan((FOV * Math.PI) / 360);
  return Math.min(setH, maxH);
}

describe('melee-range silhouette lunge', () => {
  // Floor-height attackers: worm (0.95), rootkit (0.8), logicbomb (worm 0.95 recolor)
  it.each([
    ['worm', 0.95, MIN_D],
    ['worm', 0.95, 0.8],
    ['worm', 0.95, 1.0],
    ['rootkit', 0.8, MIN_D],
    ['rootkit', 0.8, 1.0],
    ['logicbomb', 0.95, MIN_D],
    ['logicbomb', 0.95, 1.0],
  ])('%s at %s tiles: >=60%% of silhouette clears the viewmodel top', (_name, setH, dist) => {
    const h = drawnH(setH, dist);
    const rise = riseBase(h, dist, EYE_H, FOV);
    expect(rise).toBeGreaterThan(0);
    const rect = spriteScreenRect(rise, h, dist, EYE_H, FOV);
    expect(fracAboveLine(rect, VM_CLEAR)).toBeGreaterThanOrEqual(0.6);
  });

  it('without the lunge a floor attacker at contact hides behind the viewmodel', () => {
    // the gap this fix targets: worm flat on the floor at contact range
    const h = drawnH(0.95, 0.7);
    const rect = spriteScreenRect(0, h, 0.7, EYE_H, FOV);
    expect(fracAboveLine(rect, VM_CLEAR)).toBeLessThan(0.6);
  });

  it('does not lift attackers beyond melee range', () => {
    // at 2 tiles a 0.95-height sprite already reads above the viewmodel line
    const h = drawnH(0.95, 2.0);
    expect(riseBase(h, 2.0, EYE_H, FOV)).toBeLessThanOrEqual(0);
  });
});
