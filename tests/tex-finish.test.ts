import { describe, expect, it } from 'vitest';
import { finishTexture, grainFor } from '../src/render/texFinish';
import { buildPalette } from '../src/render/palette';

/** LOOK: the baked texture finish (one bevel light, cavity shade, wall-edge
 *  darkening, emissive spill, cool/warm grade) and the bent palette ramps. */

const W = 64;
const H = 80;
type Raw = { rgba: Uint8ClampedArray; glow: Uint8ClampedArray };

function make(paint: (x: number, y: number) => [number, number, number], glowAt?: (x: number, y: number) => boolean, w = W, h = H): Raw {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const c = paint(x, y);
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    if (glowAt?.(x, y)) glow[i + 3] = 255;
  }
  return { rgba, glow };
}
const at = (r: Raw, x: number, y: number, w = W) => [r.rgba[(y * w + x) * 4], r.rgba[(y * w + x) * 4 + 1], r.rgba[(y * w + x) * 4 + 2]];
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function meanLuma(r: Raw, w = W, h = H): number {
  let s = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (r.glow[i * 4 + 3] > 0) continue;
    s += luma([r.rgba[i * 4], r.rgba[i * 4 + 1], r.rgba[i * 4 + 2]]);
    n++;
  }
  return s / n;
}
// a mid-grey field with one raised lighter block in the middle
const block = (x: number, y: number): [number, number, number] => (x >= 24 && x < 40 && y >= 30 && y < 46 ? [150, 150, 150] : [90, 90, 90]);

describe('finishTexture', () => {
  it('does not mutate its input', () => {
    const raw = make(block);
    const before = raw.rgba.slice();
    finishTexture(raw, W, H, { kind: 'flat' });
    expect(raw.rgba).toEqual(before);
  });

  it('keeps the mean brightness of a texture (the light gates read world luma)', () => {
    for (const kind of ['wall', 'flat'] as const) {
      const raw = make((x, y) => [60 + ((x * 7 + y * 13) % 90), 70 + ((x * 3 + y * 5) % 60), 80 + ((x + y) % 50)]);
      const out = finishTexture(raw, W, H, { kind, grain: 'brushed' });
      expect(Math.abs(meanLuma(out) - meanLuma(raw))).toBeLessThan(1.5);
    }
  });

  it('lights every raised edge from the upper left', () => {
    const out = finishTexture(make(block), W, H, { kind: 'flat' });
    const topLeft = luma(at(out, 25, 31));
    const bottomRight = luma(at(out, 38, 44));
    expect(topLeft).toBeGreaterThan(bottomRight + 10);
  });

  it('darkens the top and bottom of walls, not of flats', () => {
    const flatGrey = () => make(() => [120, 120, 120]);
    const wall = finishTexture(flatGrey(), W, H, { kind: 'wall' });
    const flat = finishTexture(flatGrey(), W, H, { kind: 'flat' });
    expect(luma(at(wall, 32, 1))).toBeLessThan(luma(at(wall, 32, 40)) - 12);
    expect(luma(at(wall, 32, H - 2))).toBeLessThan(luma(at(wall, 32, 40)) - 8);
    expect(Math.abs(luma(at(flat, 32, 1)) - luma(at(flat, 32, 40)))).toBeLessThan(3);
  });

  it('leaves glow texels exactly as painted and spills their colour onto neighbours', () => {
    const strip = (_x: number, y: number) => y >= 38 && y < 42;
    const raw = make((x, y) => (strip(x, y) ? [0, 230, 255] : [60, 60, 60]), strip);
    const out = finishTexture(raw, W, H, { kind: 'flat' });
    expect(at(out, 10, 40)).toEqual([0, 230, 255]);
    expect(out.glow).toEqual(raw.glow);
    const near = at(out, 10, 44);
    const far = at(out, 10, 10);
    expect(near[2]).toBeGreaterThan(far[2] + 12);
    expect(near[2]).toBeGreaterThan(near[0] + 12); // cyan spill, not grey
  });

  it('tiles: the left and right edges of a horizontally periodic texture match', () => {
    const period = (x: number, y: number): [number, number, number] => {
      const v = 80 + Math.round(40 * Math.sin((x / W) * Math.PI * 4)) + (y % 16 < 2 ? -30 : 0);
      return [v, v, v];
    };
    const out = finishTexture(make(period), W, H, { kind: 'wall' });
    // period is W/2: column 0 and column W/2 must finish identically, which only holds if blurs wrap in x
    for (const y of [5, 30, 60]) expect(at(out, 0, y)).toEqual(at(out, W / 2, y));
  });

  it('skips transparent texels (decals stay cut out)', () => {
    const raw = make(block);
    raw.rgba[(10 * W + 10) * 4 + 3] = 0;
    const out = finishTexture(raw, W, H, { kind: 'wall' });
    expect(out.rgba[(10 * W + 10) * 4 + 3]).toBe(0);
    expect(at(out, 10, 10)).toEqual(at(raw, 10, 10));
  });

  it('is deterministic', () => {
    const a = finishTexture(make(block), W, H, { kind: 'wall', grain: 'blotch' });
    const b = finishTexture(make(block), W, H, { kind: 'wall', grain: 'blotch' });
    expect(a.rgba).toEqual(b.rgba);
  });

  it('gives each material family its own grain', () => {
    expect(grainFor('wall-panel')).toBe('brushed');
    expect(grainFor('wall-server:v2')).toBe('brushed');
    expect(grainFor('wall-brick')).toBe('blotch');
    expect(grainFor('floor-carpet')).toBe('weave');
    expect(grainFor('wall-office3')).toBe('plaster');
    const flatGrey = () => make(() => [120, 120, 120]);
    const brushed = finishTexture(flatGrey(), W, H, { kind: 'flat', grain: 'brushed' });
    // brushed steel: neighbours along a row agree far more than neighbours down a column
    let along = 0, down = 0;
    for (let y = 8; y < 60; y++) for (let x = 8; x < 50; x++) {
      along += Math.abs(luma(at(brushed, x, y)) - luma(at(brushed, x + 1, y)));
      down += Math.abs(luma(at(brushed, x, y)) - luma(at(brushed, x, y + 1)));
    }
    expect(down).toBeGreaterThan(along * 2);
  });
});

describe('palette ramps', () => {
  const pal = buildPalette();
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  it('still has 256 entries, each ramp rising in brightness', () => {
    expect(pal).toHaveLength(256);
    for (let r = 0; r < 16; r++) for (let i = 1; i < 16; i++) expect(lum(pal[r * 16 + i])).toBeGreaterThanOrEqual(lum(pal[r * 16 + i - 1]) - 0.5);
  });

  it('bends the neutral ramp cool in its mid-darks and warm in its lights', () => {
    const dark = pal[6];
    const light = pal[12];
    expect(dark[2]).toBeGreaterThan(dark[0]);
    expect(light[0]).toBeGreaterThan(light[2]);
  });

  it('leaves the darkest entries of every ramp as authored (gloom gate)', () => {
    // neutral ramp runs straight from [0,0,0] to [118,118,122] over its first half
    for (let i = 0; i <= 3; i++) {
      const k = (i / 15) * 2;
      expect(pal[i]).toEqual([Math.round(118 * k), Math.round(118 * k), Math.round(122 * k)]);
    }
  });

  it('keeps pure black and pure white', () => {
    expect(pal[0]).toEqual([0, 0, 0]);
    expect(pal[15]).toEqual([255, 255, 255]);
  });
});
