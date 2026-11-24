import { describe, expect, it } from 'vitest';
import { LIT_ROOM_GAIN, MID_MARGIN, darkGain, midPeak } from '../src/render/threatLight';
import { rasterize } from '../src/render/model';
import { packPixels } from '../src/render/pixel';
import { scaleModel, spriteModels } from '../src/render/sprites';

/** LOOK: dark-sector threat lift is sized to each sprite's own median tone. */

const texels = (rows: [number, number, number, number][]) => new Uint8Array(rows.flat());

describe('midPeak', () => {
  it('is the median peak channel of solid body texels only', () => {
    const d = texels([
      [10, 20, 30, 255],
      [200, 40, 40, 255],
      [90, 100, 80, 255],
      [255, 255, 255, 128], // glow: excluded
      [255, 255, 255, 0], // transparent: excluded
    ]);
    // body peaks: 30, 200, 100 -> median 100
    expect(midPeak(d, 5, 1)).toBeCloseTo(100 / 255, 5);
  });

  it('is 0 for a frame with no body texels', () => {
    expect(midPeak(texels([[9, 9, 9, 0], [255, 0, 0, 128]]), 2, 1)).toBe(0);
  });

  it('reads a real lit enemy frame as a mid-tone, not near black or white', () => {
    const raw = rasterize(256, 256, scaleModel(spriteModels.worm({ kind: 'walk', k: 0, n: 4 })), { view: 0, lit: { accent: [1, 0.55, 0.2] } });
    const p = packPixels(256, 256, raw, { sprite: true, outline: 'auto', glowOutline: false });
    const m = midPeak(p.data, 256, 256);
    expect(m).toBeGreaterThan(0.3);
    expect(m).toBeLessThan(0.95);
  });
});

describe('darkGain', () => {
  it('saturates the median texel with a small margin', () => {
    const g = darkGain(2.7, 0.5);
    expect(g).toBeCloseTo(MID_MARGIN / 0.5, 5);
    expect(0.5 * g).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds the authored gain: dark-toned sprites keep their full lift', () => {
    expect(darkGain(2.6, 0.2)).toBe(2.6);
  });

  it('never drops under the lit-room gain for bright sprites', () => {
    expect(darkGain(2.7, 0.98)).toBe(LIT_ROOM_GAIN);
  });

  it('keeps the authored gain until the frame has been measured', () => {
    expect(darkGain(3.8, 0)).toBe(3.8);
  });
});
