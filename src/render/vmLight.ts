/**
 * ARSENAL: baked lighting for a painted viewmodel. The painters fill flat
 * shapes; this pass gives every tool the same four cues, once per cached art:
 *  - the art falls off darker toward the bottom of the screen
 *  - skin casts a soft shadow, down and to the right, on whatever it holds
 *  - upper-left silhouette edges catch a key light
 *  - saturated bright texels (screens, LEDs, lit keys) spill onto neighbours
 * Works on raw RGBA so it runs the same in the browser and under FakeCanvas.
 */

import { boxBlur, softGlow } from './boxBlur';

export type RGB = [number, number, number];

const FALLOFF_TOP = 1.08;
const FALLOFF_DROP = 0.42;
const CAST_DX = 6;
const CAST_DY = 8;
const CAST_BLUR = 4;
const CAST_DARK = 0.42;
const EDGE_REACH = 4;
const SPILL_BLUR = 14;
const SPILL_GAIN = 2.2;

/**
 * Light painted viewmodel pixels. `skin` lists the exact skin fills used by
 * the painter, so hands can be told from the tool. Returns new pixels; alpha
 * is never changed.
 */
export function lightViewmodel(src: Uint8ClampedArray, w: number, h: number, skin: readonly RGB[]): Uint8ClampedArray {
  // work inside the opaque bounding box only: the art fills a fraction of its canvas
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (src[(y * w + x) * 4 + 3] <= 40) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const out = new Uint8ClampedArray(src);
  if (x1 < x0) return out;
  // snap the crop to the art's 4 px texel grid so the quarter-size glow lines up with it
  x0 &= ~3;
  y0 &= ~3;
  const bw = (x1 - x0 + 4) & ~3, bh = (y1 - y0 + 4) & ~3;
  const cw = Math.min(bw, w - x0), chh = Math.min(bh, h - y0);
  const sub = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < chh; y++) sub.set(src.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * bw * 4);
  const lit = lightRegion(sub, bw, bh, skin, y0, h);
  for (let y = 0; y < chh; y++) out.set(lit.subarray(y * bw * 4, (y * bw + cw) * 4), ((y0 + y) * w + x0) * 4);
  return out;
}

/** Light a tight crop; offY/fullH place it in the full canvas for the vertical falloff. */
function lightRegion(src: Uint8ClampedArray, w: number, h: number, skin: readonly RGB[], offY: number, fullH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const n = w * h;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 40;
  const isSkin = new Uint8Array(n);
  const skinF = new Float32Array(n);
  const emis = new Float32Array(n * 3);
  let anyEmis = false;
  let anySkin = false;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (src[o + 3] <= 40) continue;
    const r = src[o], g = src[o + 1], b = src[o + 2];
    if (skin.some((s) => Math.abs(s[0] - r) + Math.abs(s[1] - g) + Math.abs(s[2] - b) <= 6)) {
      isSkin[i] = 1;
      skinF[i] = 1;
      anySkin = true;
      continue;
    }
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 200 && (mx - mn) / mx > 0.5) {
      emis[i * 3] = r; emis[i * 3 + 1] = g; emis[i * 3 + 2] = b;
      anyEmis = true;
    }
  }
  const cast = anySkin ? boxBlur(skinF, w, h, 1, CAST_BLUR) : null;
  const spill = anyEmis ? softGlow(emis, w, h, SPILL_BLUR) : null;
  for (let y = 0; y < h; y++) {
    const fall = FALLOFF_TOP - FALLOFF_DROP * Math.pow((y + offY) / fullH, 1.6);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (src[o + 3] <= 40) continue;
      let r = src[o], g = src[o + 1], b = src[o + 2];
      // the dark outline stays an outline
      if (r + g + b < 54) continue;
      let k = fall;
      if (cast && !isSkin[i]) {
        const sx = Math.max(0, x - CAST_DX), sy = Math.max(0, y - CAST_DY);
        k *= 1 - CAST_DARK * cast[sy * w + sx];
      }
      r *= k; g *= k * 0.985; b *= k * 1.03;
      const lit = !solid(x - EDGE_REACH, y) || !solid(x, y - EDGE_REACH) || !solid(x - 3, y - 3);
      if (lit) { r += 54; g += 52; b += 44; }
      else if (!solid(x + EDGE_REACH, y) || !solid(x + 3, y - 3)) { r += 12; g += 34; b += 46; }
      if (spill && (emis[i * 3] + emis[i * 3 + 1] + emis[i * 3 + 2]) === 0) {
        r += spill[i * 3] * SPILL_GAIN; g += spill[i * 3 + 1] * SPILL_GAIN; b += spill[i * 3 + 2] * SPILL_GAIN;
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
    }
  }
  return out;
}
