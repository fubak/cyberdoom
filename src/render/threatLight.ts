/**
 * LOOK: how hard a threat sprite is lifted in a dark sector.
 *
 * The threat gain multiplies the sprite's texels, then the shader clamps by
 * the brightest channel. Any texel whose peak channel times the gain reaches
 * 1 flattens to one saturated tone, so a gain far above 1/peak erases the
 * sprite's own shading. The readability gate (tools/look-contrast.mjs) scores
 * the MEDIAN sprite pixel against the backdrop, so the smallest gain that
 * still saturates the median body texel keeps the gate's reading while every
 * texel darker than the median shows its shading again.
 */

/** Gain the lift eases toward where the room is lit (sprite shows as painted). */
export const LIT_ROOM_GAIN = 1.3;
/** Head-room over the exact median so a clear majority of body texels saturate. */
export const MID_MARGIN = 1.12;

/**
 * Median peak channel (0..1) over a packed sprite frame's solid body texels.
 * Packed alpha: 0 = transparent, 128 = glow (fullbright, excluded), 255 = body.
 * Returns 0 when the frame has no body texels.
 */
export function midPeak(data: ArrayLike<number>, w: number, h: number): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    if (data[i + 3] !== 255) continue;
    hist[Math.max(data[i], data[i + 1], data[i + 2])]++;
    n++;
  }
  if (n === 0) return 0;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc * 2 >= n) return v / 255;
  }
  return 1;
}

/**
 * Dark-sector gain for a set: just enough to saturate its median body texel,
 * never above the set's authored gain and never below the lit-room gain.
 * An unmeasured set (mid <= 0) keeps its authored gain.
 */
export function darkGain(setGain: number, mid: number): number {
  if (!(mid > 0)) return setGain;
  return Math.max(LIT_ROOM_GAIN, Math.min(setGain, MID_MARGIN / mid));
}
