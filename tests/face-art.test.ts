import { describe, expect, it } from 'vitest';
import { EYE_X, EYE_Y, HEAD_FEMALE, HEAD_MALE, skinRamp } from '../src/tools/faceArt';
import { SKIN_TONES } from '../src/tools/look';

/**
 * LOOK: the redrawn analyst heads. The eye, mouth and damage overlays in
 * portrait.ts are positioned on fixed landmarks, so the new head shapes have
 * to keep those landmarks on skin.
 */
type Pt = [number, number];

function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const lum = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
};

describe('head outlines', () => {
  const heads: [string, Pt[]][] = [['male', HEAD_MALE], ['female', HEAD_FEMALE]];

  it('fit the 24-unit portrait and are symmetric about its centre line', () => {
    for (const [name, head] of heads) {
      for (const [x, y] of head) {
        expect(x, name).toBeGreaterThanOrEqual(5);
        expect(x, name).toBeLessThanOrEqual(19);
        expect(y, name).toBeGreaterThanOrEqual(2);
        expect(y, name).toBeLessThanOrEqual(19);
      }
      const xs = head.map((p) => p[0]);
      expect(Math.min(...xs) + Math.max(...xs), name).toBeCloseTo(24, 5);
    }
  });

  it('keep the eyes, nose, mouth and the damage overlay anchors on skin', () => {
    const anchors: Pt[] = [
      [EYE_X[0], EYE_Y], [EYE_X[1], EYE_Y], // eyes
      [12, 13.6], // nose tip
      [12, 16], [10.2, 16], [13.8, 16], // mouth and its corners
      [8, 7.2], [14.5, 5], // brow nick and hairline cut
      [15.9, 13.2], [8.6, 12.6], // cheek bruise and cut
      [7.5, 13], [16.5, 12], // cheek runnels
    ];
    for (const [name, head] of heads) {
      for (const [x, y] of anchors) expect(inside(head, x, y), `${name} ${x},${y}`).toBe(true);
    }
  });

  it('the female head is the narrower of the two', () => {
    const width = (h: Pt[]) => Math.max(...h.map((p) => p[0])) - Math.min(...h.map((p) => p[0]));
    expect(width(HEAD_FEMALE)).toBeLessThan(width(HEAD_MALE));
  });

  it('eyes sit level and evenly about the centre line', () => {
    expect(EYE_X[0] + EYE_X[1]).toBeCloseTo(24, 5);
    expect(EYE_Y).toBeGreaterThan(9);
    expect(EYE_Y).toBeLessThan(12);
  });
});

describe('skin ramp', () => {
  it('runs from deep shadow to highlight for every skin tone', () => {
    for (const tone of SKIN_TONES) {
      const r = skinRamp(tone.base);
      const steps = [r.dd, r.d, r.m, r.b, r.l, r.h].map(lum);
      for (let i = 1; i < steps.length; i++) expect(steps[i], `${tone.id} step ${i}`).toBeGreaterThan(steps[i - 1]);
      expect(r.b).toBe(tone.base);
    }
  });
});
