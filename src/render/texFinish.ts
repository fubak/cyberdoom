/**
 * LOOK: baked finish for wall and flat textures, run between paint and pack.
 * The painters draw shapes; this gives every texture the same light:
 *  - one bevel light from the upper left (brightness read as height)
 *  - cavity shade in seams and recesses
 *  - walls darken toward the ceiling and the floor line
 *  - one grain per material family instead of the same noise everywhere
 *  - a cool-shadow / warm-light grade that does not change brightness
 *  - light from glow texels spills onto the surface around them
 * Shading is renormalised so a texture's mean brightness is unchanged: the
 * light gates (tools/look-contrast.mjs) read world luma and must not move.
 * Pure typed-array math, seeded by position only: identical on every thread.
 */

export type FinishKind = 'wall' | 'flat';
export type Grain = 'brushed' | 'blotch' | 'weave' | 'plaster';

export interface FinishOpts {
  kind: FinishKind;
  grain?: Grain;
}

export interface RawTexture {
  rgba: Uint8ClampedArray;
  glow: Uint8ClampedArray;
}

const BEVEL = 1.5;
const BEVEL_MIN = 0.78;
const BEVEL_MAX = 1.3;
const CAVITY = 1.2;
const GRAIN = 0.045;
const SPILL = 2.1;
const SPILL_RADIUS = 14;

/** Material family by texture id (variants `id:vN` share their base's grain). */
export function grainFor(id: string): Grain {
  const base = id.split(':')[0];
  if (/carpet/.test(base)) return 'weave';
  if (/brick|rust|^floor$|^ceil/.test(base)) return 'blotch';
  if (/office|quack|devs/.test(base)) return 'plaster';
  return 'brushed';
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise on a `cell`-px lattice, 0..1. */
function valueNoise(x: number, y: number, cell: number): number {
  const gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Per-texel grain multiplier offset, roughly -1..1, by material family. */
function grainAt(grain: Grain, x: number, y: number): number {
  if (grain === 'brushed') return hash2(Math.floor(x / 28) + 11 * y, y) * 2 - 1; // long horizontal streaks, row by row
  if (grain === 'weave') return ((x >> 1) + (y >> 1)) % 2 === 0 ? hash2(x >> 1, y) - 0.2 : hash2(x, y >> 1) - 0.8;
  if (grain === 'plaster') return valueNoise(x, y, 5) * 2 - 1;
  return valueNoise(x, y, 14) * 2 - 1;
}

/** Separable box blur over `ch` channels (running sums); x always wraps (walls tile), y wraps for flats. */
function blur(src: Float32Array, w: number, h: number, ch: number, rad: number, wrapY: boolean): Float32Array {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const k = 1 / (rad * 2 + 1);
  const wx = (x: number): number => ((x % w) + w) % w;
  const wy = (y: number): number => (wrapY ? ((y % h) + h) % h : y < 0 ? 0 : y >= h ? h - 1 : y);
  for (let c = 0; c < ch; c++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let d = -rad; d <= rad; d++) s += src[(row + wx(d)) * ch + c];
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * ch + c] = s * k;
        s += src[(row + wx(x + 1 + rad)) * ch + c] - src[(row + wx(x - rad)) * ch + c];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -rad; d <= rad; d++) s += tmp[(wy(d) * w + x) * ch + c];
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * ch + c] = s * k;
        s += tmp[(wy(y + 1 + rad) * w + x) * ch + c] - tmp[(wy(y - rad) * w + x) * ch + c];
      }
    }
  }
  return dst;
}

/** Returns a finished copy of `raw`; the input is not modified. */
export function finishTexture(raw: RawTexture, w: number, h: number, opts: FinishOpts): RawTexture {
  const n = w * h;
  const src = raw.rgba;
  const out = new Uint8ClampedArray(src);
  const wrapY = opts.kind === 'flat';
  const body = new Uint8Array(n);
  const lum = new Float32Array(n);
  const emis = new Float32Array(n * 3);
  let anyGlow = false;
  let before = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const l = luma(src[o], src[o + 1], src[o + 2]);
    lum[i] = l / 255;
    if (src[o + 3] < 128) continue;
    if (raw.glow[o + 3] > 0) {
      emis[i * 3] = src[o]; emis[i * 3 + 1] = src[o + 1]; emis[i * 3 + 2] = src[o + 2];
      anyGlow = true;
      continue;
    }
    body[i] = 1;
    before += l;
    count++;
  }
  if (count === 0) return { rgba: out, glow: raw.glow };

  const near = blur(lum, w, h, 1, 2, wrapY);
  const wide = blur(lum, w, h, 1, 9, wrapY);
  const shade = new Float32Array(n * 3);
  let after = 0;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const edge = opts.kind === 'wall' ? 0.84 + 0.16 * clamp01(t / 0.14) - 0.12 * clamp01((t - 0.84) / 0.16) : 1;
    const yu = wrapY ? (y - 2 + h) % h : Math.max(0, y - 2);
    const yd = wrapY ? (y + 2) % h : Math.min(h - 1, y + 2);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!body[i]) continue;
      // brightness as height: slopes facing up-left catch the light
      const gx = near[y * w + ((x + 2) % w)] - near[y * w + ((x - 2 + w) % w)];
      const gy = near[yd * w + x] - near[yu * w + x];
      const bevel = Math.max(BEVEL_MIN, Math.min(BEVEL_MAX, 1 + (gx + gy) * BEVEL));
      const cavity = 1 - Math.max(0, wide[i] - lum[i]) * CAVITY;
      const grain = opts.grain ? 1 + grainAt(opts.grain, x, y) * GRAIN : 1;
      const k = Math.max(0.35, bevel * cavity * edge * grain);
      const o = i * 4;
      const r = src[o] * k, g = src[o + 1] * k, b = src[o + 2] * k;
      shade[i * 3] = r; shade[i * 3 + 1] = g; shade[i * 3 + 2] = b;
      after += luma(r, g, b);
    }
  }
  // hold the texture's mean brightness where the painter put it
  const hold = after > 0 ? Math.max(0.8, Math.min(1.3, before / after)) : 1;
  const spill = anyGlow ? blur(blur(emis, w, h, 3, SPILL_RADIUS, wrapY), w, h, 3, SPILL_RADIUS, wrapY) : null;
  for (let i = 0; i < n; i++) {
    if (!body[i]) continue;
    let r = shade[i * 3] * hold, g = shade[i * 3 + 1] * hold, b = shade[i * 3 + 2] * hold;
    // split tone: cool shadows, warm lights, brightness untouched
    const l = luma(r, g, b) / 255;
    const dr = (l - 0.42) * 24, dg = (l - 0.42) * 6, db = (0.42 - l) * 22;
    const dl = luma(dr, dg, db);
    r += dr - dl; g += dg - dl; b += db - dl;
    if (spill) { r += spill[i * 3] * SPILL; g += spill[i * 3 + 1] * SPILL; b += spill[i * 3 + 2] * SPILL; }
    const o = i * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  return { rgba: out, glow: raw.glow };
}
