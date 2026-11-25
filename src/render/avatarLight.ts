/**
 * LOOK: lighting pass for the analyst avatars. The portrait painter lays down
 * flat polygons; this reads the silhouette back and adds what a lit bust has:
 * a key light from the upper left in stepped bands, a warm catch-light along
 * the lit edge, a cool core shadow on the far edge, and a dark outline so the
 * figure separates from its backdrop. Pure pixel maths, no canvas.
 */

export interface AvatarLightOpts {
  /** Pixels per portrait unit: scales the rim, shadow and outline widths. */
  k: number;
}

/** Light bands from shadow to highlight. Multipliers on the painted colour. */
export const AVATAR_BANDS = [0.8, 0.9, 1, 1.08, 1.16] as const;
/** Colour pushed into the lit edge and the shadow edge, at full strength. */
export const AVATAR_RIM: readonly [number, number, number] = [255, 232, 190];
export const AVATAR_CORE: readonly [number, number, number] = [14, 18, 44];
export const AVATAR_OUTLINE: readonly [number, number, number] = [8, 9, 16];
const RIM_STRENGTH = 0.42;
const CORE_STRENGTH = 0.46;

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Which band a pixel falls in: position inside the figure's box, measured along the light direction. */
export function avatarBand(nx: number, ny: number): number {
  // nx, ny in -1..1 across the figure; the light comes from the upper left
  const lit = 0.5 - 0.3 * nx - 0.26 * ny;
  const i = Math.floor(lit * AVATAR_BANDS.length);
  return i < 0 ? 0 : i >= AVATAR_BANDS.length ? AVATAR_BANDS.length - 1 : i;
}

/**
 * Light an RGBA image of a figure on a transparent ground, in place.
 * Returns the same array.
 */
export function lightAvatar(px: Uint8ClampedArray, w: number, h: number, opts: AvatarLightOpts): Uint8ClampedArray {
  const n = w * h;
  const solid = new Uint8Array(n);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] >= 128) {
      solid[i] = 1;
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return px;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.max(1, (x1 - x0) / 2);
  const ry = Math.max(1, (y1 - y0) / 2);
  const reach = Math.max(2, Math.round(opts.k * 0.9));
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : solid[y * w + x]);
  /** How close open air is in direction (dx, dy): 1 = adjacent, 0 = none within reach. */
  const edge = (x: number, y: number, dx: number, dy: number): number => {
    for (let d = 1; d <= reach; d++) if (!at(x + dx * d, y + dy * d)) return 1 - (d - 1) / reach;
    return 0;
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      const o = i * 4;
      const band = AVATAR_BANDS[avatarBand((x - cx) / rx, (y - cy) / ry)];
      let r = px[o] * band;
      let g = px[o + 1] * band;
      let b = px[o + 2] * band;
      // hue shift with the light: highlights warm, shadows cool
      if (band > 1) {
        r += (band - 1) * 60;
        g += (band - 1) * 24;
      } else if (band < 1) {
        b += (1 - band) * 46;
        r -= (1 - band) * 18;
      }
      const rim = Math.max(edge(x, y, -1, -1), edge(x, y, 0, -1) * 0.6) * RIM_STRENGTH;
      if (rim > 0) {
        r += (AVATAR_RIM[0] - r) * rim;
        g += (AVATAR_RIM[1] - g) * rim;
        b += (AVATAR_RIM[2] - b) * rim;
      }
      const core = Math.max(edge(x, y, 1, 1), edge(x, y, 1, 0) * 0.7) * CORE_STRENGTH;
      if (core > 0) {
        r += (AVATAR_CORE[0] - r) * core;
        g += (AVATAR_CORE[1] - g) * core;
        b += (AVATAR_CORE[2] - b) * core;
      }
      px[o] = clamp255(r);
      px[o + 1] = clamp255(g);
      px[o + 2] = clamp255(b);
      px[o + 3] = 255;
    }
  }
  // outline: open pixels that touch the figure go dark and solid
  const ow = Math.max(1, Math.round(opts.k * 0.25));
  for (let y = Math.max(0, y0 - ow); y <= Math.min(h - 1, y1 + ow); y++) {
    for (let x = Math.max(0, x0 - ow); x <= Math.min(w - 1, x1 + ow); x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      let near = false;
      for (let dy = -ow; dy <= ow && !near; dy++) for (let dx = -ow; dx <= ow && !near; dx++) if (at(x + dx, y + dy)) near = true;
      const o = i * 4;
      if (near) {
        px[o] = AVATAR_OUTLINE[0];
        px[o + 1] = AVATAR_OUTLINE[1];
        px[o + 2] = AVATAR_OUTLINE[2];
        px[o + 3] = 255;
      } else px[o + 3] = 0;
    }
  }
  return px;
}
