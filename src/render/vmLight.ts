/**
 * ARSENAL: baked lighting for a painted viewmodel. The painters fill flat
 * shapes; this pass gives every tool the same four cues, once per cached art:
 *  - the art falls off darker toward the bottom of the screen
 *  - skin casts a soft shadow, down and to the right, on whatever it holds
 *  - upper-left silhouette edges catch a key light
 *  - saturated bright texels (screens, LEDs, lit keys) spill onto neighbours
 * Works on raw RGBA so it runs the same in the browser and under FakeCanvas.
 */

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

/** Separable box blur with clamped edges (running sums). */
export function boxBlur(src: Float32Array, w: number, h: number, ch: number, rad: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const k = 1 / (rad * 2 + 1);
  const cx = (x: number): number => (x < 0 ? 0 : x >= w ? w - 1 : x);
  const cy = (y: number): number => (y < 0 ? 0 : y >= h ? h - 1 : y);
  for (let c = 0; c < ch; c++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let d = -rad; d <= rad; d++) s += src[(row + cx(d)) * ch + c];
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * ch + c] = s * k;
        s += src[(row + cx(x + 1 + rad)) * ch + c] - src[(row + cx(x - rad)) * ch + c];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -rad; d <= rad; d++) s += tmp[(cy(d) * w + x) * ch + c];
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * ch + c] = s * k;
        s += tmp[(cy(y + 1 + rad) * w + x) * ch + c] - tmp[(cy(y - rad) * w + x) * ch + c];
      }
    }
  }
  return dst;
}

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
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const sub = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) sub.set(src.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + bw) * 4), y * bw * 4);
  const lit = lightRegion(sub, bw, bh, skin, y0, h);
  for (let y = 0; y < bh; y++) out.set(lit.subarray(y * bw * 4, (y + 1) * bw * 4), ((y0 + y) * w + x0) * 4);
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
  const spill = anyEmis ? boxBlur(boxBlur(emis, w, h, 3, SPILL_BLUR), w, h, 3, SPILL_BLUR) : null;
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
