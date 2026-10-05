import * as THREE from 'three';
import { RES } from './res';

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
  s: number;
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
  outlineW?: number;
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
export function paintRaw(
  w: number,
  h: number,
  seed: string,
  painter: Painter,
  s = 1,
  wallGrime = false,
  sprite = false,
): { rgba: Uint8ClampedArray; glow: Uint8ClampedArray } {
  const c = document.createElement('canvas');
  c.width = w * s;
  c.height = h * s;
  const gc = document.createElement('canvas');
  gc.width = w * s;
  gc.height = h * s;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const glow = gc.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  glow.imageSmoothingEnabled = false;
  g.setTransform(s, 0, 0, s, 0, 0);
  glow.setTransform(s, 0, 0, s, 0, 0);
  const rnd = rng(seed);
  painter({ g, glow, w, h, s, rnd });
  const width = w * s;
  const height = h * s;
  const rgba = g.getImageData(0, 0, width, height).data;
  const glowData = glow.getImageData(0, 0, width, height).data;
  const latticeW = Math.ceil(width / 8) + 1;
  const latticeH = Math.ceil(height / 8) + 1;
  const grime = new Float32Array(latticeW * latticeH);
  if (wallGrime) for (let i = 0; i < grime.length; i++) grime[i] = rnd();
  const grain = sprite ? 0.03 : 0.05;
  for (let y = 0; y < height; y++) {
    const gy = y / 8;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const wallFactor = wallGrime ? Math.max(0, Math.min(1, (y / height - 0.75) / 0.25)) : 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 128 || glowData[i + 3] > 0) continue;
      const grainMul = 1 + (rnd() * 2 - 1) * grain;
      let grimeMul = 0;
      if (wallGrime) {
        const gx = x / 8;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const top = grime[y0 * latticeW + x0] * (1 - fx) + grime[y0 * latticeW + x0 + 1] * fx;
        const bottom = grime[(y0 + 1) * latticeW + x0] * (1 - fx) + grime[(y0 + 1) * latticeW + x0 + 1] * fx;
        grimeMul = (top * (1 - fy) + bottom * fy) * wallFactor * 0.14;
      }
      const mul = grainMul * (1 - grimeMul);
      rgba[i] = clamp(rgba[i] * mul);
      rgba[i + 1] = clamp(rgba[i + 1] * mul);
      rgba[i + 2] = clamp(rgba[i + 2] * mul);
    }
  }
  return { rgba, glow: glowData };
}

export function packTexture(
  w: number,
  h: number,
  raw: { rgba: Uint8ClampedArray; glow: Uint8ClampedArray },
  opts: PackOpts = {},
): THREE.DataTexture {
  const { rgba, glow } = raw;
  const src = new Uint8ClampedArray(rgba);
  const outlineW = opts.outlineW ?? (opts.sprite ? Math.max(1, Math.round(0.75 * RES)) : 1);
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 128;
  const distToSolid = new Uint16Array(w * h);
  distToSolid.fill(outlineW + 1);
  for (let i = 0; i < distToSolid.length; i++) if (src[i * 4 + 3] >= 128) distToSolid[i] = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) distToSolid[i] = Math.min(distToSolid[i], distToSolid[i - 1] + 1);
      if (y > 0) {
        if (x > 0) distToSolid[i] = Math.min(distToSolid[i], distToSolid[i - w - 1] + 1);
        distToSolid[i] = Math.min(distToSolid[i], distToSolid[i - w] + 1);
        if (x + 1 < w) distToSolid[i] = Math.min(distToSolid[i], distToSolid[i - w + 1] + 1);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x + 1 < w) distToSolid[i] = Math.min(distToSolid[i], distToSolid[i + 1] + 1);
      if (y + 1 < h) {
        if (x > 0) distToSolid[i] = Math.min(distToSolid[i], distToSolid[i + w - 1] + 1);
        distToSolid[i] = Math.min(distToSolid[i], distToSolid[i + w] + 1);
        if (x + 1 < w) distToSolid[i] = Math.min(distToSolid[i], distToSolid[i + w + 1] + 1);
      }
    }
  }
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
      let a = opts.sprite ? 255 : src[i + 3];
      const isSolid = !opts.sprite || src[i + 3] >= 128;
      if (!isSolid) {
        a = 0;
        if (olc && distToSolid[y * w + sx] <= outlineW) {
          [r, gg, b] = olc;
          a = 255;
        }
      } else {
        if (opts.shade) {
          const dx = opts.mirror ? 1 : -1;
          let lightEdge = false;
          let darkEdge = false;
          for (let d = 1; d <= outlineW && !(lightEdge && darkEdge); d++) {
            lightEdge ||= !solid(sx + dx * d, y) || !solid(sx, y - d);
            darkEdge ||= !solid(sx - dx * d, y) || !solid(sx, y + d);
          }
          if (lightEdge) {
            r = Math.min(255, r * 1.28 + 14);
            gg = Math.min(255, gg * 1.28 + 14);
            b = Math.min(255, b * 1.28 + 14);
          } else if (darkEdge) {
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
  const mipmaps: { data: Uint8Array; width: number; height: number }[] = [];
  let mip = out;
  let mw = w;
  let mh = h;
  while (mw > 1 || mh > 1) {
    const nw = Math.max(1, Math.floor(mw / 2));
    const nh = Math.max(1, Math.floor(mh / 2));
    const next = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const counts = [0, 0, 0];
        const samples: number[] = [];
        const x0 = Math.floor((x + 0.5) * (mw / nw) - 0.5);
        const y0 = Math.floor((y + 0.5) * (mh / nh) - 0.5);
        for (let oy = 0; oy < 2; oy++) {
          for (let ox = 0; ox < 2; ox++) {
            const sx = Math.max(0, Math.min(mw - 1, x0 + ox));
            const sy = Math.max(0, Math.min(mh - 1, y0 + oy));
            const si = (sy * mw + sx) * 4;
            const alpha = mip[si + 3];
            const index = alpha < 64 ? 0 : alpha < 192 ? 1 : 2;
            counts[index]++;
            samples.push(si);
          }
        }
        let picked = 0;
        for (let i = 1; i < 3; i++) {
          if (counts[i] > counts[picked] || (counts[i] === counts[picked] && i > 0 && picked === 0)) picked = i;
        }
        const alpha = [0, 128, 255][picked];
        let r = 0, g = 0, b = 0, n = 0;
        for (const si of samples) {
          const a = mip[si + 3];
          const index = a < 64 ? 0 : a < 192 ? 1 : 2;
          if (index !== picked) continue;
          r += mip[si]; g += mip[si + 1]; b += mip[si + 2]; n++;
        }
        const oi = (y * nw + x) * 4;
        next[oi] = Math.round(r / n);
        next[oi + 1] = Math.round(g / n);
        next[oi + 2] = Math.round(b / n);
        next[oi + 3] = alpha;
      }
    }
    mipmaps.push({ data: next, width: nw, height: nh });
    mip = next;
    mw = nw;
    mh = nh;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = false;
  t.mipmaps = mipmaps;
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
  const s = p.s;
  const px = Math.round(x0 * s), py = Math.round(y0 * s);
  const pw = Math.round(w * s), ph = Math.round(h * s);
  const image = p.g.getImageData(px, py, pw, ph);
  const coarseW = Math.ceil(w / cell);
  const coarseH = Math.ceil(h / cell);
  const coarse = new Float32Array(coarseW * coarseH);
  for (let i = 0; i < coarse.length; i++) {
    coarse[i] = (p.rnd() - 0.5) * vary - (p.rnd() < 0.035 ? vary * 0.9 : 0);
  }
  const cj = vary * 0.3;
  for (let y = 0; y < ph; y++) {
    const cy = Math.min(coarseH - 1, Math.floor(y / (cell * s)));
    for (let x = 0; x < pw; x++) {
      const cx = Math.min(coarseW - 1, Math.floor(x / (cell * s)));
      const v = coarse[cy * coarseW + cx] + (p.rnd() - 0.5) * vary * 0.35;
      const i = (y * pw + x) * 4;
      image.data[i] = clamp(base[0] + v + (p.rnd() - 0.5) * cj);
      image.data[i + 1] = clamp(base[1] + v + (p.rnd() - 0.5) * cj);
      image.data[i + 2] = clamp(base[2] + v + (p.rnd() - 0.5) * cj);
      image.data[i + 3] = 255;
    }
  }
  p.g.putImageData(image, px, py);
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
  const specks = count * p.s * 2;
  const unit = 1 / p.s;
  for (let i = 0; i < specks; i++) {
    const x = x0 + Math.floor(p.rnd() * w * p.s) / p.s;
    const y = y0 + Math.floor(p.rnd() * h * p.s) / p.s;
    const size = p.rnd() < 0.25 ? 2 * unit : unit;
    p.g.fillRect(x, y, size, size);
  }
}
