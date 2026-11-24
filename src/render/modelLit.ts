/**
 * LOOK: opt-in "lit" resolve for the sprite rasterizer. The raycast in
 * model.ts fills a small G-buffer (albedo, view normal, depth, flags) instead
 * of shading inline; once every row is in, resolveLit() shades the whole
 * frame so each pixel can see its neighbours:
 *  - occlusion between parts from the depth buffer (parts sit ON each other)
 *  - a warm key light with a banded, ordered-dithered ramp that bends cool
 *    violet in shadow and warm in highlight (not a brightness-only ramp)
 *  - a two-step back rim in the threat's accent colour
 *  - emissive parts get a hot core, spill onto the body, and a dithered halo
 * Pure typed-array math, seeded only by pixel position: byte-identical on the
 * main thread, in a generation worker and in tests.
 */

import { boxBlur } from './boxBlur';

type V3 = [number, number, number];

export interface LitOpts {
  /** Rim-light colour, 0..1 per channel (the threat's own colour). */
  accent: V3;
}

export const LIT_HIT = 1;
export const LIT_GLOW = 2;
export const LIT_BOX = 4;
export const LIT_EDGE = 8;

export interface LitBuffers {
  accent: V3;
  /** Albedo rgb, 0..255. */
  alb: Uint8ClampedArray;
  /** View-space unit normal. */
  nrm: Float32Array;
  /** View depth, larger = nearer the camera. */
  z: Float32Array;
  flags: Uint8Array;
  /** Per-texel surface grain, 0..255, stuck to the part's local coords. */
  noise: Uint8Array;
  done: boolean;
}

export interface LitTarget {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  glow: Uint8ClampedArray;
  tint?: V3;
  tt: number;
}

export function createLitBuffers(w: number, h: number, opts: LitOpts): LitBuffers {
  const n = w * h;
  return {
    accent: opts.accent,
    alb: new Uint8ClampedArray(n * 3),
    nrm: new Float32Array(n * 3),
    z: new Float32Array(n),
    flags: new Uint8Array(n),
    noise: new Uint8Array(n),
    done: false,
  };
}

/** Stable 0..255 hash of a part index + quantized local position. */
export function litNoise(part: number, x: number, y: number, z: number): number {
  let hsh = Math.imul((Math.floor(x / 3) + 97 * part) | 0, 374761393) ^ Math.imul(Math.floor(y / 3) | 0, 668265263) ^ Math.imul(Math.floor(z / 3) | 0, 2147483647);
  hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
  return (hsh ^ (hsh >>> 16)) & 255;
}

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const KEY = unit([-0.5, 0.72, 0.55]);
const HALF = unit([KEY[0], KEY[1], KEY[2] + 1]);
const BACK = unit([0.75, 0.45, -0.5]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const BANDS = 7;
const DITHER = 0.6;
const AO_SAMPLES = 16;
const BLOOM_RADIUS = 8;
const RIM_GAIN = 0.78;

/** Golden-angle disc, 3..14 px: the occlusion kernel, as flat [dx, dy] pairs. */
const AO_KERNEL = new Int8Array(AO_SAMPLES * 2);
for (let k = 0; k < AO_SAMPLES; k++) {
  const a = k * 2.399963;
  const r = 3 + 11 * Math.sqrt((k + 0.5) / AO_SAMPLES);
  AO_KERNEL[k * 2] = Math.round(Math.cos(a) * r);
  AO_KERNEL[k * 2 + 1] = Math.round(Math.sin(a) * r);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function occlusion(lit: LitBuffers, w: number, h: number, x: number, y: number): number {
  const i = y * w + x;
  const zi = lit.z[i];
  const flags = lit.flags;
  const z = lit.z;
  let occ = 0;
  for (let k = 0; k < AO_SAMPLES; k++) {
    const xx = x + AO_KERNEL[k * 2];
    const yy = y + AO_KERNEL[k * 2 + 1];
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const j = yy * w + xx;
    if (!(flags[j] & LIT_HIT)) continue;
    const dz = z[j] - zi;
    if (dz <= 1.5) continue;
    const near = dz >= 11.5 ? 1 : (dz - 1.5) / 10;
    occ += dz <= 30 ? near : dz >= 70 ? 0 : near * (1 - (dz - 30) / 40);
  }
  return Math.max(0.3, 1 - 1.75 * (occ / AO_SAMPLES));
}

/** Shade the finished G-buffer into target.rgba / target.glow. Runs once. */
export function resolveLit(target: LitTarget, lit: LitBuffers): void {
  if (lit.done) return;
  lit.done = true;
  const { w, h, rgba, glow } = target;
  const { accent, alb, nrm, flags } = lit;
  const emis = new Float32Array(w * h * 3);
  let anyGlow = false;
  // Occlusion is sampled once per 2x2 block — the same cell the ramp dithers
  // on — from the first body texel met in it: a quarter of the samples.
  const aw = (w + 1) >> 1;
  const aoCell = new Float32Array(aw * ((h + 1) >> 1)).fill(-1);
  for (let y = 0; y < h; y++) {
    const worldY = h - 1 - y + 0.5;
    const ground = 0.62 + 0.38 * clamp01(worldY / (h * 0.2));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const f = flags[i];
      if (!(f & LIT_HIT)) continue;
      const a0 = alb[i * 3], a1 = alb[i * 3 + 1], a2 = alb[i * 3 + 2];
      const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
      const o = i * 4;
      if (f & LIT_GLOW) {
        // hot core on rounded emitters; flat panels keep their painted colour
        const hot = f & LIT_BOX ? 0 : Math.pow(Math.max(0, nz), 2.2) * 0.62;
        rgba[o] = a0 + (255 - a0) * hot;
        rgba[o + 1] = a1 + (255 - a1) * hot;
        rgba[o + 2] = a2 + (250 - a2) * hot;
        rgba[o + 3] = 255;
        glow[o + 3] = 255;
        emis[i * 3] = a0; emis[i * 3 + 1] = a1; emis[i * 3 + 2] = a2;
        anyGlow = true;
        continue;
      }
      const ac = (y >> 1) * aw + (x >> 1);
      if (aoCell[ac] < 0) aoCell[ac] = occlusion(lit, w, h, x, y);
      const ao = aoCell[ac];
      const diff = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
      // x^30 by squaring: the same curve as Math.pow without the call
      const sh1 = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
      const sh2 = sh1 * sh1, sh4 = sh2 * sh2, sh8 = sh4 * sh4, sh16 = sh8 * sh8;
      const spec = sh16 * sh8 * sh4 * sh2 * 0.5;
      let I = (0.2 + 0.82 * diff + 0.1 * Math.max(0, ny)) * ao * ground + spec;
      I *= 0.93 + 0.14 * (lit.noise[i] / 255);
      if (f & LIT_EDGE) I += ny > 0.5 || nx < -0.5 || nz > 0.5 ? 0.16 : -0.08;
      // banded + ordered dither on 2 px cells: a pixel-art ramp, not an airbrush
      const d = BAYER[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] - 0.5;
      const q = clamp01(Math.round((I / 1.25) * BANDS + d * DITHER) / BANDS) * 1.25;
      let r: number, g: number, b: number;
      if (q < 0.62) {
        // shadows bend cool violet
        const t = q / 0.62;
        const s0 = a0 * 0.2 + 8, s1 = a1 * 0.16 + 4, s2 = a2 * 0.3 + 18;
        r = s0 + (a0 - s0) * t; g = s1 + (a1 - s1) * t; b = s2 + (a2 - s2) * t;
      } else {
        // highlights bend warm
        const t = Math.min(1, (q - 0.62) / 0.63);
        r = a0 + (255 - a0) * 0.62 * t; g = a1 + (244 - a1) * 0.58 * t; b = a2 + (214 - a2) * 0.5 * t;
      }
      const facing = Math.max(0, nx * BACK[0] + ny * BACK[1] + 0.35);
      // the rim only clears its lower step where the surface turns well away
      // from the camera, so skip the pow everywhere else (same result)
      const rimRaw = facing > 0 && Math.abs(nz) < 0.6 ? Math.pow(1 - Math.abs(nz), 2.2) * facing * ao : 0;
      const rim = (rimRaw > 0.42 ? 1 : rimRaw > 0.2 ? 0.5 : 0) * RIM_GAIN * 255;
      rgba[o] = r + accent[0] * rim;
      rgba[o + 1] = g + accent[1] * rim;
      rgba[o + 2] = b + accent[2] * rim;
      rgba[o + 3] = 255;
    }
  }
  if (anyGlow) bloom(target, lit, emis);
  const tint = target.tint;
  const tt = target.tt;
  if (tint && tt > 0) {
    for (let o = 0; o < rgba.length; o += 4) {
      if (rgba[o + 3] === 0) continue;
      rgba[o] += (tint[0] - rgba[o]) * tt;
      rgba[o + 1] += (tint[1] - rgba[o + 1]) * tt;
      rgba[o + 2] += (tint[2] - rgba[o + 2]) * tt;
    }
  }
}

/** Emissive spill onto the body, plus a dithered fullbright halo just outside it. */
function bloom(target: LitTarget, lit: LitBuffers, emis: Float32Array): void {
  const { w, h, rgba, glow } = target;
  const bl = boxBlur(emis, w, h, 3, BLOOM_RADIUS);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const br = bl[i * 3], bg = bl[i * 3 + 1], bb = bl[i * 3 + 2];
      const f = lit.flags[i];
      if (f & LIT_HIT) {
        if (f & LIT_GLOW) continue;
        rgba[o] += br * 1.25; rgba[o + 1] += bg * 1.25; rgba[o + 2] += bb * 1.25;
        continue;
      }
      const lum = (br + bg + bb) / 765;
      if (lum <= 0.05 || BAYER[(y & 3) * 4 + (x & 3)] >= lum * 4.2) continue;
      const m = 255 / Math.max(1, br, bg, bb);
      rgba[o] = br * m; rgba[o + 1] = bg * m; rgba[o + 2] = bb * m; rgba[o + 3] = 255;
      glow[o + 3] = 255;
    }
  }
}
