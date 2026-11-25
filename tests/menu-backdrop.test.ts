import { describe, expect, it } from 'vitest';
import { BACKDROP_KEEP_CENTRE, BACKDROP_KEEP_EDGE, BACKDROP_RINGS, ringAlpha } from '../src/ui/menuBackdrop';
import { bands } from '../src/ui/characterSelect';

/**
 * LOOK: the menus share one darkened corridor backdrop, and panels use
 * banded fills so gradients stay pixel art.
 */
describe('menu backdrop darkening', () => {
  it('keeps the centre dim enough for body text and the edge darker still', () => {
    expect(BACKDROP_KEEP_CENTRE).toBeLessThanOrEqual(0.55);
    expect(BACKDROP_KEEP_CENTRE).toBeGreaterThanOrEqual(0.3);
    expect(BACKDROP_KEEP_EDGE).toBeLessThan(BACKDROP_KEEP_CENTRE / 2);
  });

  it('the ring passes take the edge from the centre level down to the edge level', () => {
    const a = ringAlpha();
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(BACKDROP_KEEP_CENTRE * Math.pow(1 - a, BACKDROP_RINGS)).toBeCloseTo(BACKDROP_KEEP_EDGE, 6);
  });
});

describe('banded fill', () => {
  const record = () => {
    const rects: { style: string; y: number; h: number; x: number; w: number }[] = [];
    const g = {
      fillStyle: '',
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ style: this.fillStyle, x, y, w, h });
      },
    };
    return { g: g as unknown as CanvasRenderingContext2D, rects };
  };

  it('covers the whole height with no gap or overlap, one band per colour, in order', () => {
    for (const h of [5, 22, 60, 61, 124]) {
      const { g, rects } = record();
      const colors = ['#111', '#222', '#333', '#444', '#555'];
      bands(g, 3, 10, 40, h, colors);
      expect(rects.map((r) => r.style)).toEqual(colors);
      let y = 10;
      for (const r of rects) {
        expect(r.y).toBe(y);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x).toBe(3);
        expect(r.w).toBe(40);
        y += r.h;
      }
      expect(y).toBe(10 + h);
    }
  });
});
