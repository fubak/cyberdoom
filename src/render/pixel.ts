import * as THREE from 'three';

/**
 * Procedural pixel-art painting helpers shared by textures and sprites.
 * Painters draw onto a colour canvas plus a "glow" canvas (anything drawn on
 * glow is FULLBRIGHT: ignores sector light / distance diminishing, like Doom's
 * lamps and screens). The result is packed into a DataTexture where
 * alpha 0 = transparent, 128 = fullbright, 255 = lit.
 */

export type Rng = () => number;

export interface PaintCtx {
  g: CanvasRenderingContext2D;
  glow: CanvasRenderingContext2D;
  w: number;
  h: number;
  rnd: Rng;
}

export type Painter = (p: PaintCtx) => void;

export function rng(seed: string | number): Rng {
  let h = typeof seed === 'number' ? seed : 2166136261;
  if (typeof seed === 'string') for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PackOpts {
  /** Treat as a sprite: alpha cutout, optional outline + auto-shading. */
  sprite?: boolean;
  /** Dark 1px silhouette outline (sprites). */
  outline?: string | null;
  /** Auto rim-light top-left / shadow bottom-right edges (sprites). */
  shade?: boolean;
  /** Mirror horizontally (for side rotations). */
  mirror?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

/** Paint into fresh canvases and return the raw RGBA + glow masks. */
export function paintRaw(w: number, h: number, seed: string, painter: Painter): { rgba: Uint8ClampedArray; glow: Uint8ClampedArray } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const gc = document.createElement('canvas');
  gc.width = w;
  gc.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const glow = gc.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  glow.imageSmoothingEnabled = false;
  painter({ g, glow, w, h, rnd: rng(seed) });
  return { rgba: g.getImageData(0, 0, w, h).data, glow: glow.getImageData(0, 0, w, h).data };
}

export function packTexture(
  w: number,
  h: number,
  raw: { rgba: Uint8ClampedArray; glow: Uint8ClampedArray },
  opts: PackOpts = {},
): THREE.DataTexture {
  const { rgba, glow } = raw;
  const src = new Uint8ClampedArray(rgba);
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 128;
  const out = new Uint8Array(w * h * 4);
  const ol = opts.outline === undefined ? '#07070b' : opts.outline;
  const olc = ol ? hexToRgb(ol) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = opts.mirror ? w - 1 - x : x;
      const i = (y * w + sx) * 4;
      // flip Y so canvas top = texture v=1
      const o = ((h - 1 - y) * w + x) * 4;
      let r = src[i];
      let gg = src[i + 1];
      let b = src[i + 2];
      let a = 255;
      const isSolid = !opts.sprite || src[i + 3] >= 128;
      if (!isSolid) {
        a = 0;
        if (olc && (solid(sx - 1, y) || solid(sx + 1, y) || solid(sx, y - 1) || solid(sx, y + 1))) {
          [r, gg, b] = olc;
          a = 255;
        }
      } else {
        if (opts.shade) {
          const dx = opts.mirror ? 1 : -1;
          if (!solid(sx + dx, y) || !solid(sx, y - 1)) {
            r = Math.min(255, r * 1.28 + 14);
            gg = Math.min(255, gg * 1.28 + 14);
            b = Math.min(255, b * 1.28 + 14);
          } else if (!solid(sx - dx, y) || !solid(sx, y + 1)) {
            r *= 0.62;
            gg *= 0.62;
            b *= 0.62;
          }
        }
        if (glow[i + 3] > 0) a = 128;
      }
      out[o] = r;
      out[o + 1] = gg;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Noise fill in `cell`-sized blocks around a base colour. */
export function noiseFill(
  p: PaintCtx,
  base: [number, number, number],
  vary: number,
  cell = 1,
  x0 = 0,
  y0 = 0,
  w = p.w,
  h = p.h,
): void {
  for (let y = y0; y < y0 + h; y += cell) {
    for (let x = x0; x < x0 + w; x += cell) {
      const v = (p.rnd() - 0.5) * vary;
      p.g.fillStyle = `rgb(${clamp(base[0] + v)},${clamp(base[1] + v)},${clamp(base[2] + v)})`;
      p.g.fillRect(x, y, cell, cell);
    }
  }
}

export function clamp(v: number): number {
  return Math.max(0, Math.min(255, v | 0));
}

/** Bevelled rectangle: fill + highlight top/left + shadow bottom/right. */
export function bevel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  hi: string,
  lo: string,
  inset = false,
): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.fillStyle = inset ? lo : hi;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillStyle = inset ? hi : lo;
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, h);
}

/** Pixel ellipse fill (no anti-aliasing). */
export function pxEllipse(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  g.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry + 0.0001);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t));
    g.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1);
  }
}

/** Speckle grime / wear. */
export function grime(p: PaintCtx, color: string, count: number, x0 = 0, y0 = 0, w = p.w, h = p.h): void {
  p.g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    p.g.fillRect(x0 + Math.floor(p.rnd() * w), y0 + Math.floor(p.rnd() * h), 1, 1);
  }
}
