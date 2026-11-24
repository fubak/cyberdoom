/**
 * Shared separable box blur for the baked-light passes (sprite bloom, texture
 * finish, viewmodel lighting). Running sums with precomputed edge tables, so
 * cost is independent of the radius and there is no per-sample function call.
 * Deterministic: same inputs give the same bytes on every thread.
 */

/** Index table for positions -rad .. n+rad, wrapped or clamped into 0..n-1. */
function edgeTable(n: number, rad: number, wrap: boolean): Int32Array {
  const t = new Int32Array(n + rad * 2 + 1);
  for (let i = 0; i < t.length; i++) {
    const p = i - rad;
    t[i] = wrap ? ((p % n) + n) % n : p < 0 ? 0 : p >= n ? n - 1 : p;
  }
  return t;
}

/** Box blur of `ch` interleaved channels. Each axis either wraps (tiling) or clamps. */
export function boxBlur(src: Float32Array, w: number, h: number, ch: number, rad: number, wrapX = false, wrapY = false): Float32Array {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const k = 1 / (rad * 2 + 1);
  const span = rad * 2 + 1;
  const tx = edgeTable(w, rad, wrapX);
  const ty = edgeTable(h, rad, wrapY);
  for (let c = 0; c < ch; c++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let i = 0; i < span; i++) s += src[(row + tx[i]) * ch + c];
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * ch + c] = s * k;
        s += src[(row + tx[x + span]) * ch + c] - src[(row + tx[x]) * ch + c];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = 0; i < span; i++) s += tmp[(ty[i] * w + x) * ch + c];
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * ch + c] = s * k;
        s += tmp[(ty[y + span] * w + x) * ch + c] - tmp[(ty[y] * w + x) * ch + c];
      }
    }
  }
  return dst;
}

/**
 * Wide, soft glow of an rgb buffer: two box blurs of radius `rad`. When both
 * sides divide by 4 the blur runs on a quarter-size copy and is read back per
 * 4x4 block, which is about 16x cheaper and lines up with the art's own 4 px
 * texel grid; otherwise it falls back to the full-size blur.
 */
export function softGlow(src: Float32Array, w: number, h: number, rad: number, wrapX = false, wrapY = false): Float32Array {
  if (w % 4 !== 0 || h % 4 !== 0) return boxBlur(boxBlur(src, w, h, 3, rad, wrapX, wrapY), w, h, 3, rad, wrapX, wrapY);
  const qw = w / 4, qh = h / 4;
  const small = new Float32Array(qw * qh * 3);
  for (let y = 0; y < h; y++) {
    const qy = y >> 2;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (src[i] === 0 && src[i + 1] === 0 && src[i + 2] === 0) continue;
      const o = (qy * qw + (x >> 2)) * 3;
      small[o] += src[i]; small[o + 1] += src[i + 1]; small[o + 2] += src[i + 2];
    }
  }
  for (let i = 0; i < small.length; i++) small[i] /= 16;
  const r = Math.max(1, Math.round(rad / 4));
  const blurred = boxBlur(boxBlur(small, qw, qh, 3, r, wrapX, wrapY), qw, qh, 3, r, wrapX, wrapY);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const qrow = (y >> 2) * qw;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3, o = (qrow + (x >> 2)) * 3;
      out[i] = blurred[o]; out[i + 1] = blurred[o + 1]; out[i + 2] = blurred[o + 2];
    }
  }
  return out;
}
