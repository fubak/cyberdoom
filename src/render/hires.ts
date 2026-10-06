import { RES } from './res';

/**
 * LOOK: native-resolution (RES x) pixel painting for hands and portraits.
 * Art is authored in base units like everything else, but every coordinate
 * snaps to the native pixel (1/RES of a unit), so shading bands, nails,
 * creases and fabric weave get RES times the detail of the base grid.
 * Painted once into cached offscreen canvases and blitted with
 * nearest-neighbour, so per-frame cost is one drawImage per part.
 */
export interface Painter {
  /** native pixels per unit */
  k: number;
  g: CanvasRenderingContext2D;
  c: HTMLCanvasElement;
  rect(x: number, y: number, w: number, h: number, col: string): void;
  ell(cx: number, cy: number, rx: number, ry: number, col: string): void;
  poly(pts: [number, number][], col: string): void;
  /** stipple: each native pixel in the box is painted with probability `p` (deterministic). */
  dots(x: number, y: number, w: number, h: number, col: string, p: number, seed?: number): void;
  /** 1-native-pixel-wide polyline (a crease, lash or stitch). */
  line(pts: [number, number][], col: string, width?: number): void;
}

export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** An offscreen canvas `w x h` units big at `k` native px per unit (default RES). */
export function painter(w: number, h: number, k = RES): Painter {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * k);
  c.height = Math.ceil(h * k);
  const g = c.getContext('2d')!;
  const R = (v: number) => Math.round(v * k);
  const span = (y: number, a: number, b: number) => {
    if (b > a) g.fillRect(a, y, b - a, 1);
  };
  return {
    k,
    g,
    c,
    rect(x, y, w2, h2, col) {
      const x0 = R(x), y0 = R(y), x1 = R(x + w2), y1 = R(y + h2);
      if (x1 <= x0 || y1 <= y0) return;
      g.fillStyle = col;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    },
    ell(cx, cy, rx, ry, col) {
      g.fillStyle = col;
      const CX = cx * k, CY = cy * k, RX = rx * k, RY = ry * k;
      for (let y = Math.floor(CY - RY); y <= Math.ceil(CY + RY); y++) {
        const dy = (y + 0.5 - CY) / RY;
        if (Math.abs(dy) >= 1) continue;
        const hw = RX * Math.sqrt(1 - dy * dy);
        span(y, Math.round(CX - hw), Math.round(CX + hw));
      }
    },
    poly(pts, col) {
      g.fillStyle = col;
      const P = pts.map(([x, y]) => [x * k, y * k] as const);
      let minY = Infinity, maxY = -Infinity;
      for (const [, y] of P) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      const xs: number[] = [];
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const sy = y + 0.5;
        xs.length = 0;
        for (let i = 0; i < P.length; i++) {
          const [x1, y1] = P[i];
          const [x2, y2] = P[(i + 1) % P.length];
          if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) span(y, Math.round(xs[i]), Math.round(xs[i + 1]));
      }
    },
    dots(x, y, w2, h2, col, p, seed = 0) {
      g.fillStyle = col;
      for (let yy = R(y); yy < R(y + h2); yy++)
        for (let xx = R(x); xx < R(x + w2); xx++) if (hash2(xx, yy, seed) < p) g.fillRect(xx, yy, 1, 1);
    },
    line(pts, col, width = 1) {
      g.fillStyle = col;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = [pts[i][0] * k, pts[i][1] * k];
        const [bx, by] = [pts[i + 1][0] * k, pts[i + 1][1] * k];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
        for (let s = 0; s <= n; s++) {
          const t = s / n;
          g.fillRect(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), width, width);
        }
      }
    },
  };
}

/**
 * Dark silhouette outline `px` native pixels thick around every opaque pixel
 * (the Doom-sprite readability pass, at native resolution).
 */
export function outlineNative(g: CanvasRenderingContext2D, w: number, h: number, px: number, rgb: [number, number, number] = [8, 6, 10]): number {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const out = new Uint8ClampedArray(d);
  let top = h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) { if (y < top) top = y; continue; }
      let near = false;
      for (let dy = -px; dy <= px && !near; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const span = px - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && solid[yy * w + xx]) { near = true; break; }
        }
      }
      if (near) {
        out[i * 4] = rgb[0];
        out[i * 4 + 1] = rgb[1];
        out[i * 4 + 2] = rgb[2];
        out[i * 4 + 3] = 255;
        if (y < top) top = y;
      }
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
  return top;
}

/** Tone across a lit cylinder (light from the upper left): t 0..1 left→right. */
export function cylTone(ramp: readonly string[], t: number, flip = false): string {
  const u = flip ? 1 - t : t;
  // ramp: [highlight, base, shadow, deep]
  if (u < 0.08) return ramp[2];
  if (u < 0.34) return ramp[0];
  if (u < 0.72) return ramp[1];
  if (u < 0.9) return ramp[2];
  return ramp[3];
}

/** Small LRU-ish cache for painted parts. */
export class PartCache<T> {
  private m = new Map<string, T>();
  constructor(private limit = 256) {}
  get(key: string, make: () => T): T {
    let v = this.m.get(key);
    if (v === undefined) {
      v = make();
      if (this.m.size >= this.limit) this.m.delete(this.m.keys().next().value as string);
      this.m.set(key, v);
    }
    return v;
  }
}

/** Darken opaque pixels of a box in a sparse diagonal twill (fabric weave) without touching transparency. */
export function weaveOpaque(P: Painter, x: number, y: number, w: number, h: number, amt = 0.8): void {
  const k = P.k;
  const X = Math.max(0, Math.round(x * k)), Y = Math.max(0, Math.round(y * k));
  const W = Math.min(P.c.width - X, Math.round(w * k)), H = Math.min(P.c.height - Y, Math.round(h * k));
  if (W <= 0 || H <= 0) return;
  const img = P.g.getImageData(X, Y, W, H);
  const d = img.data;
  for (let yy = 0; yy < H; yy++)
    for (let xx = 0; xx < W; xx++) {
      const i = (yy * W + xx) * 4;
      if (d[i + 3] === 0 || (X + xx + (Y + yy) * 3) % 7 !== 0) continue;
      d[i] *= amt;
      d[i + 1] *= amt;
      d[i + 2] *= amt;
    }
  P.g.putImageData(img, X, Y);
}
