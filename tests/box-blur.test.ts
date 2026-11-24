import { describe, expect, it } from 'vitest';
import { boxBlur, softGlow } from '../src/render/boxBlur';

/** PERF: the shared running-sum blur must equal a plain box average. */

function naive(src: Float32Array, w: number, h: number, ch: number, rad: number, wrapX: boolean, wrapY: boolean): Float32Array {
  const ix = (x: number) => (wrapX ? ((x % w) + w) % w : Math.max(0, Math.min(w - 1, x)));
  const iy = (y: number) => (wrapY ? ((y % h) + h) % h : Math.max(0, Math.min(h - 1, y)));
  const tmp = new Float32Array(src.length), dst = new Float32Array(src.length);
  const n = rad * 2 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
    let s = 0;
    for (let d = -rad; d <= rad; d++) s += src[(y * w + ix(x + d)) * ch + c];
    tmp[(y * w + x) * ch + c] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
    let s = 0;
    for (let d = -rad; d <= rad; d++) s += tmp[(iy(y + d) * w + x) * ch + c];
    dst[(y * w + x) * ch + c] = s / n;
  }
  return dst;
}
const field = (w: number, h: number, ch: number) => Float32Array.from({ length: w * h * ch }, (_, i) => ((i * 2654435761) >>> 0) % 251);
const maxDiff = (a: Float32Array, b: Float32Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

describe('boxBlur', () => {
  it('matches a plain box average with clamped edges', () => {
    const src = field(23, 17, 3);
    expect(maxDiff(boxBlur(src, 23, 17, 3, 4), naive(src, 23, 17, 3, 4, false, false))).toBeLessThan(0.01);
  });

  it('matches with wrapping on either axis, including radii larger than the image', () => {
    const src = field(12, 10, 1);
    expect(maxDiff(boxBlur(src, 12, 10, 1, 3, true, false), naive(src, 12, 10, 1, 3, true, false))).toBeLessThan(0.01);
    expect(maxDiff(boxBlur(src, 12, 10, 1, 14, true, true), naive(src, 12, 10, 1, 14, true, true))).toBeLessThan(0.01);
  });

  it('does not modify its input', () => {
    const src = field(8, 8, 1);
    const copy = src.slice();
    boxBlur(src, 8, 8, 1, 2);
    expect(src).toEqual(copy);
  });
});

describe('softGlow', () => {
  it('keeps the total light of a small emitter to within a few percent', () => {
    const w = 64, h = 64;
    const src = new Float32Array(w * h * 3);
    for (let y = 30; y < 34; y++) for (let x = 30; x < 34; x++) src[(y * w + x) * 3 + 1] = 200;
    const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
    const out = softGlow(src, w, h, 8);
    expect(sum(out) / sum(src)).toBeGreaterThan(0.95);
    expect(sum(out) / sum(src)).toBeLessThan(1.05);
    // light falls off with distance and never leaks into other channels
    expect(out[(32 * w + 36) * 3 + 1]).toBeGreaterThan(out[(32 * w + 52) * 3 + 1]);
    expect(out[(32 * w + 36) * 3]).toBe(0);
  });

  it('falls back to the full-size blur when a side does not divide by 4', () => {
    const w = 30, h = 22;
    const src = new Float32Array(w * h * 3);
    src[(10 * w + 15) * 3] = 255;
    const full = boxBlur(boxBlur(src, w, h, 3, 3), w, h, 3, 3);
    expect(softGlow(src, w, h, 3)).toEqual(full);
  });
});
