/**
 * ARSENAL: crisp pixel-art primitives for viewmodels and portraits.
 * Everything is integer fillRect spans (no antialiasing) so it stays sharp
 * when the 320x200 HUD canvas is upscaled with nearest-neighbour.
 */

export type Ctx = CanvasRenderingContext2D;

const shadeCache = new Map<string, string>();

/** Multiply a #rrggbb colour by `f` (f > 1 brightens toward white). */
export function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const out = f <= 1 ? v * f : v + (255 - v) * (f - 1);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  const r = ch((n >> 16) & 255);
  const gg = ch((n >> 8) & 255);
  const b = ch(n & 255);
  const s = '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
  shadeCache.set(key, s);
  return s;
}

export function rect(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Filled box with 1px highlight (top/left) and shadow (bottom/right). */
export function bevel(g: Ctx, x: number, y: number, w: number, h: number, c: string, depth = 1): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  rect(g, x, y, w, h, c);
  rect(g, x, y, w, depth, shade(c, 1.35));
  rect(g, x, y, depth, h, shade(c, 1.18));
  rect(g, x, y + h - depth, w, depth, shade(c, 0.55));
  rect(g, x + w - depth, y, depth, h, shade(c, 0.7));
}

/** Scanline polygon fill (crisp, no AA). */
export function poly(g: Ctx, pts: [number, number][], c: string): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  g.fillStyle = c;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) {
        xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.round(xs[i]);
      const b = Math.round(xs[i + 1]);
      if (b > a) g.fillRect(a, y, b - a, 1);
    }
  }
}

/** Scanline ellipse fill. */
export function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, c: string): void {
  g.fillStyle = c;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    const a = Math.round(cx - hw);
    const b = Math.round(cx + hw);
    if (b > a) g.fillRect(a, y, b - a, 1);
  }
}

/** Rounded rectangle (corner pixels knocked out). */
export function pill(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  rect(g, x + 1, y, w - 2, h, c);
  rect(g, x, y + 1, w, h - 2, c);
}

/**
 * Add a dark 1px outline around every opaque pixel of a canvas region —
 * gives Doom-sprite-style readable silhouettes.
 */
export function outlinePass(g: Ctx, w: number, h: number, color = [10, 10, 16]): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i]) continue;
      const n =
        (x > 0 && src[i - 1]) ||
        (x < w - 1 && src[i + 1]) ||
        (y > 0 && src[i - w]) ||
        (y < h - 1 && src[i + w]);
      if (n) {
        d[i * 4] = color[0];
        d[i * 4 + 1] = color[1];
        d[i * 4 + 2] = color[2];
        d[i * 4 + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** Additive radial glow (used for "muzzle flashes"). Not crisp on purpose. */
export function glow(g: Ctx, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb},${a})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  const prev = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = prev;
}

/** Ease helpers for viewmodel animation. */
export const ease = {
  /** 0→1→0 kick over `dur` seconds, peaking at `peak` fraction. */
  kick(t: number, dur: number, peak = 0.25): number {
    if (t < 0 || t >= dur) return 0;
    const u = t / dur;
    return u < peak ? u / peak : 1 - (u - peak) / (1 - peak);
  },
};
