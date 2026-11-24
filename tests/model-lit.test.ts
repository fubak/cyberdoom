import { describe, expect, it } from 'vitest';
import { createRasterJob, rasterize, rasterizeRows, type Prim, type RasterOpts } from '../src/render/model';
import { packPixels } from '../src/render/pixel';
import { scaleModel, spriteModels } from '../src/render/sprites';

/**
 * LOOK: the opt-in "lit" sprite shading pass (occlusion between parts,
 * hue-shifted banded ramp, accent rim, emissive bloom). The classic path is
 * pinned byte-for-byte by model-raster.test.ts; these pin the new one.
 */

const W = 96;
const H = 96;
const LIT: RasterOpts = { view: 0, lit: { accent: [1, 0.5, 0.2] } };
const px = (d: Uint8ClampedArray | Uint8Array, x: number, y: number) => [d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2], d[(y * W + x) * 4 + 3]];
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const ball: Prim = { shape: 'ell', c: [0, 48, 0], r: [30, 30, 30], col: '#c04030' };

describe('lit sprite shading', () => {
  it('keeps every classic-solid pixel solid, so silhouettes and hitboxes do not shrink', () => {
    const prims = scaleModel(spriteModels.worm({ kind: 'walk', k: 0, n: 4 }));
    const a = rasterize(256, 256, prims, { view: 0 });
    const b = rasterize(256, 256, prims, { view: 0, lit: { accent: [1, 0.5, 0.2] } });
    let missing = 0;
    for (let i = 3; i < a.rgba.length; i += 4) if (a.rgba[i] === 255 && b.rgba[i] !== 255) missing++;
    expect(missing).toBe(0);
  });

  it('is deterministic and identical whether rendered in one call or resumed in row bands', () => {
    const prims = scaleModel(spriteModels.trojan({ kind: 'attack', k: 1 }));
    const whole = rasterize(256, 256, prims, { view: Math.PI / 4, lit: { accent: [0.8, 0.4, 1] } });
    const job = createRasterJob(256, 256, prims, { view: Math.PI / 4, lit: { accent: [0.8, 0.4, 1] } });
    for (let y = 0; y < 256; y += 7) rasterizeRows(job, y, y + 7);
    expect(job.next).toBe(256);
    const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
    expect(same(job.rgba, whole.rgba)).toBe(true);
    expect(same(job.glow, whole.glow)).toBe(true);
  });

  it('darkens a surface where another part sits in front of it (occlusion between parts)', () => {
    const wall: Prim = { shape: 'box', c: [0, 48, -20], r: [44, 44, 4], col: '#808890' };
    const knob: Prim = { shape: 'ell', c: [-20, 48, 0], r: [12, 12, 12], col: '#808890' };
    const alone = rasterize(W, H, [wall], LIT).rgba;
    const both = rasterize(W, H, [wall, knob], LIT).rgba;
    // a wall pixel just right of the knob's edge vs the same pixel with no knob
    const x = W / 2 - 20 + 15;
    const y = H - 48;
    expect(luma(px(both, x, y))).toBeLessThan(luma(px(alone, x, y)) - 6);
    // far from the knob the wall is untouched
    expect(px(both, W / 2 + 34, y)).toEqual(px(alone, W / 2 + 34, y));
  });

  it('shifts shadows cool and highlights warm instead of only scaling brightness', () => {
    const grey: Prim = { ...ball, col: '#808080' };
    const d = rasterize(W, H, [grey], { view: 0, lit: { accent: [0, 0, 0] } }).rgba;
    const shadow = px(d, W / 2 + 14, H - 48 + 18); // lower right, away from the key light
    const light = px(d, W / 2 - 10, H - 48 - 14); // upper left
    expect(shadow[2]).toBeGreaterThan(shadow[0]);
    expect(light[0]).toBeGreaterThan(light[2]);
  });

  it('paints the back rim in the accent colour', () => {
    const grey: Prim = { ...ball, col: '#404040' };
    const red = rasterize(W, H, [grey], { view: 0, lit: { accent: [1, 0, 0] } }).rgba;
    const blue = rasterize(W, H, [grey], { view: 0, lit: { accent: [0, 0, 1] } }).rgba;
    let redder = 0;
    let bluer = 0;
    for (let i = 0; i < red.length; i += 4) {
      if (red[i] > blue[i] + 60) redder++;
      if (blue[i + 2] > red[i + 2] + 60) bluer++;
    }
    expect(redder).toBeGreaterThan(40);
    expect(bluer).toBeGreaterThan(40);
  });

  it('keeps emissive parts on the glow mask and spills their light onto the body', () => {
    const body: Prim = { shape: 'box', c: [0, 48, 0], r: [40, 40, 6], col: '#202028' };
    const eye: Prim = { shape: 'ell', c: [0, 48, 8], r: [6, 6, 4], col: '#ff3010', glow: true };
    const lit = rasterize(W, H, [body, eye], LIT);
    const noEye = rasterize(W, H, [body], LIT);
    expect(lit.glow[((H - 48) * W + W / 2) * 4 + 3]).toBe(255);
    // 10 px left of the eye: body pixel, not glow, but redder than without the eye
    const i = ((H - 48) * W + W / 2 - 10) * 4;
    expect(lit.glow[i + 3]).toBe(0);
    expect(lit.rgba[i]).toBeGreaterThan(noEye.rgba[i] + 8);
  });

  it('still applies the pain / quarantine tint', () => {
    const plain = rasterize(W, H, [ball], LIT).rgba;
    const green = rasterize(W, H, [ball], { ...LIT, tint: [44, 255, 90], tintT: 0.5 }).rgba;
    const i = ((H - 48) * W + W / 2) * 4;
    expect(green[i + 1]).toBeGreaterThan(plain[i + 1] + 30);
  });
});

describe('sprite pack: coloured outline', () => {
  const raw = () => rasterize(W, H, [ball], LIT);
  const at = (d: Uint8Array, x: number, yTop: number) => px(d, x, H - 1 - yTop); // pack flips Y

  it("outline 'auto' takes a dark tone of the body it borders, not flat black", () => {
    const packed = packPixels(W, H, raw(), { sprite: true, outline: 'auto', outlineW: 2 });
    // just left of the ball's left edge at its equator
    const o = at(packed.data, W / 2 - 31, H - 48);
    expect(o[3]).toBe(255);
    expect(o[0]).toBeGreaterThan(o[1]); // red body -> reddish outline
    expect(luma(o)).toBeLessThan(70);
    expect(luma(o)).toBeGreaterThan(8);
  });

  it('default outline stays the flat near-black it always was', () => {
    const packed = packPixels(W, H, raw(), { sprite: true, outlineW: 2 });
    expect(at(packed.data, W / 2 - 31, H - 48).slice(0, 3)).toEqual([7, 7, 11]);
  });

  it('does not ring loose glow pixels with outline when glowOutline is off', () => {
    const r = raw();
    // a lone halo pixel well outside the silhouette
    const i = (4 * W + 4) * 4;
    r.rgba.set([255, 200, 80, 255], i);
    r.glow[i + 3] = 255;
    const ringed = packPixels(W, H, r, { sprite: true, outline: 'auto', outlineW: 2 });
    const clean = packPixels(W, H, r, { sprite: true, outline: 'auto', outlineW: 2, glowOutline: false });
    expect(at(ringed.data, 5, 4)[3]).toBe(255);
    expect(at(clean.data, 5, 4)[3]).toBe(0);
    expect(at(clean.data, 4, 4)[3]).toBe(128); // the glow pixel itself survives, fullbright
  });
});
