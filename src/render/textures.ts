import * as THREE from 'three';
import { Registry } from '../core/registry';
import { drawText, measureText } from './font';
import { registerGenJob } from './gen';
import { deferGenJob, genPoolActive, installGenNow } from './genpool';
import { bevel, grime, noiseFill, packPixels, packTexture, paintRaw, type PaintCtx, type Painter } from './pixel';
import { RES, TEX } from './res';

/**
 * Procedural pixel-art texture atlas (no binary assets).
 * Walls use a 64x80 base layout at 4× native resolution = 1 x WALL_H world
 * units, so one wall cell shows the texture exactly once. Flats are 64x64 base.
 * Anything painted on the glow layer renders FULLBRIGHT.
 */

export const WALL_H = 1.25;
export const WALL_TEX_W = TEX.wallW;
export const WALL_TEX_H = TEX.wallH;

export const textureRegistry = new Registry<THREE.Texture>();

/** When true, builders register gen jobs only (worker startup path). */
let jobsOnly = false;
let textureJobsDone = false;

/**
 * With the worker pool: register a blank DataTexture placeholder and queue the
 * paint job; the worker's pixels fill it in-place when they arrive. Anything
 * that needs the texture now goes through ensureTexture(), which runs the job
 * synchronously — identical pixels either way (the pipeline is seeded).
 */
function makeTexture(id: string, w: number, h: number, painter: Painter, wallGrime = false): void {
  const key = `tex:${id}`;
  registerGenJob(key, { setId: '$tex', first: true }, () =>
    packPixels(w * RES, h * RES, paintRaw(w, h, id, painter, RES, wallGrime)));
  if (jobsOnly) return;
  if (genPoolActive()) {
    const t = new THREE.DataTexture(new Uint8Array(w * RES * h * RES * 4), w * RES, h * RES, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.userData.genKey = key;
    textureRegistry.register(id, t);
    const install = (res: ReturnType<typeof packPixels>) => {
      t.image = { data: res.data, width: res.w, height: res.h };
      t.mipmaps = res.mipmaps;
      t.needsUpdate = true;
    };
    if (!deferGenJob(key, install)) install(packPixels(w * RES, h * RES, paintRaw(w, h, id, painter, RES, wallGrime)));
    return;
  }
  const t = packTexture(w * RES, h * RES, paintRaw(w, h, id, painter, RES, wallGrime));
  textureRegistry.register(id, t);
}

/** Force a pending generated texture to fill now (demand path; no-op when already filled). */
function ensureTexture(t: THREE.Texture): THREE.Texture {
  const key = t.userData?.genKey as string | undefined;
  if (key) installGenNow(key);
  return t;
}

const wall = (id: string, p: Painter) => makeTexture(id, TEX.wallW / RES, TEX.wallH / RES, p, true);
const flat = (id: string, p: Painter) => makeTexture(id, TEX.flat / RES, TEX.flat / RES, p);

/**
 * Per-tile variants: the dominant walls/flats get `VARIANTS` extra baked
 * copies (`<id>:v1..v4`), each repainted with a different seed and one or two
 * mid-frequency wear features on top (patch plates, grime streaks, scuffs,
 * cracks) plus a small hue/brightness wash. The renderer picks a variant per
 * cell/face by hash, so no two adjacent tiles are pixel-identical — the
 * shader cost stays flat (same draw shape, just more texture ids).
 */
const VARIANTS = 4;
const variantWall = new Set<string>();
const variantFlat = new Set<string>();
const wallV = (id: string, p: Painter) => {
  wall(id, p);
  for (let v = 1; v <= VARIANTS; v++) wall(`${id}:v${v}`, (ctx) => { p(ctx); wallWear(ctx); });
  variantWall.add(id);
};
const flatV = (id: string, p: Painter) => {
  flat(id, p);
  for (let v = 1; v <= VARIANTS; v++) flat(`${id}:v${v}`, (ctx) => { p(ctx); flatWear(ctx); });
  variantFlat.add(id);
};
/** How many baked looks a base texture id has (base + variants), 0 if none. */
export function variantCount(id: string): number {
  return variantWall.has(id) || variantFlat.has(id) ? VARIANTS + 1 : 0;
}

/** Mid-frequency wear features layered on a wall variant (64x80 space). */
function wallWear(p: PaintCtx): void {
  const { g } = p;
  const pick = p.rnd();
  if (pick < 0.3) {
    // riveted patch plate: a replaced panel, slightly off the base tone
    const x = 4 + Math.floor(p.rnd() * 32);
    const y = 6 + Math.floor(p.rnd() * 44);
    const w = 14 + Math.floor(p.rnd() * 18);
    const h = 10 + Math.floor(p.rnd() * 20);
    noiseFill(p, [84, 78, 68], 12, 1, x, y, w, h);
    seam(g, x - 1, y - 1, x + w + 1, y - 1);
    seam(g, x - 1, y + h + 1, x + w + 1, y + h + 1);
    seam(g, x - 1, y, x - 1, y + h);
    seam(g, x + w + 1, y, x + w + 1, y + h);
    bolt(g, x + 1, y + 1);
    bolt(g, x + w - 3, y + 1);
    bolt(g, x + 1, y + h - 3);
    bolt(g, x + w - 3, y + h - 3);
  } else if (pick < 0.6) {
    // wide grime streak bleeding down from the top edge
    const x = 6 + Math.floor(p.rnd() * 46);
    vShade(g, 0, 34 + Math.floor(p.rnd() * 26), '12,9,6', 0.42, 0, x, 7 + Math.floor(p.rnd() * 6));
    drip(g, x + 3, 4, 20 + Math.floor(p.rnd() * 30), '10,8,6');
  } else if (pick < 0.85) {
    // impact scuff: dark blot with chipped pale edges
    const cx = 8 + Math.floor(p.rnd() * 48);
    const cy = 12 + Math.floor(p.rnd() * 50);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(10,8,6,${0.35 + p.rnd() * 0.3})`;
      g.fillRect(cx + Math.floor(p.rnd() * 10 - 5), cy + Math.floor(p.rnd() * 8 - 4), 2, 1);
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(225,215,200,0.5)';
      g.fillRect(cx + Math.floor(p.rnd() * 12 - 6), cy + Math.floor(p.rnd() * 8 - 4), 1 / p.s, 1 / p.s);
    }
  } else {
    // long stepped crack
    const cx = 10 + Math.floor(p.rnd() * 44);
    let x = cx;
    for (let y = 8 + Math.floor(p.rnd() * 10); y < 74; y++) {
      if (p.rnd() < 0.25) x += p.rnd() < 0.5 ? -1 : 1;
      g.fillStyle = 'rgba(8,7,6,0.7)';
      g.fillRect(x, y, 1 / p.s, 1 / p.s);
    }
  }
  // faint per-variant hue/brightness wash so same-feature tiles still differ
  const warm = p.rnd() < 0.5;
  g.fillStyle = warm ? `rgba(255,214,170,${0.03 + p.rnd() * 0.05})` : `rgba(170,200,255,${0.03 + p.rnd() * 0.05})`;
  g.fillRect(0, 0, 64, 80);
}

/** Mid-frequency wear features layered on a flat variant (64x64 space). */
function flatWear(p: PaintCtx): void {
  const { g } = p;
  const pick = p.rnd();
  if (pick < 0.35) {
    // spill stain: irregular dark pool with a dried ring
    const cx = 12 + p.rnd() * 40;
    const cy = 12 + p.rnd() * 40;
    for (let i = 0; i < 26; i++) {
      const a = p.rnd() * Math.PI * 2;
      const r = p.rnd() * (4 + p.rnd() * 8);
      g.fillStyle = `rgba(12,9,5,${0.3 + p.rnd() * 0.25})`;
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 2, 1);
    }
    g.fillStyle = 'rgba(30,22,10,0.5)';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.fillRect(cx + Math.cos(a) * 9, cy + Math.sin(a) * 6.5, 1, 1);
    }
  } else if (pick < 0.65) {
    // dragged-equipment scuff: two parallel worn lines with chipped edges
    const y = 8 + p.rnd() * 46;
    const x0 = 4 + p.rnd() * 20;
    const len = 14 + p.rnd() * 30;
    for (let i = 0; i < len; i++) {
      g.fillStyle = `rgba(14,11,8,${0.4 - i / (len * 3)})`;
      g.fillRect(x0 + i, y + (i % 5 === 4 ? 1 : 0), 1, 1);
      g.fillRect(x0 + i, y + 4 + (i % 7 === 5 ? 1 : 0), 1, 1);
    }
  } else if (pick < 0.9) {
    // pale cleaned/repoured patch breaking the tile pattern
    const x = 6 + Math.floor(p.rnd() * 32);
    const y = 6 + Math.floor(p.rnd() * 32);
    const w = 12 + Math.floor(p.rnd() * 16);
    const h = 10 + Math.floor(p.rnd() * 16);
    noiseFill(p, [96, 90, 78], 10, 1, x, y, w, h);
    seam(g, x - 1, y - 1, x + w + 1, y - 1);
    seam(g, x - 1, y + h + 1, x + w + 1, y + h + 1);
  } else {
    // hairline crack across the tile
    let x = 4 + Math.floor(p.rnd() * 20);
    for (let y = 4 + Math.floor(p.rnd() * 8); y < 60; y++) {
      if (p.rnd() < 0.3) x += p.rnd() < 0.5 ? -1 : 1;
      g.fillStyle = 'rgba(8,7,6,0.6)';
      g.fillRect(x, y, 1 / p.s, 1 / p.s);
    }
  }
  const warm = p.rnd() < 0.5;
  g.fillStyle = warm ? `rgba(255,210,165,${0.03 + p.rnd() * 0.05})` : `rgba(165,195,255,${0.03 + p.rnd() * 0.05})`;
  g.fillRect(0, 0, 64, 64);
}

const ROLE_COLORS: Record<string, { stripe: string; dark: string; light: string }> = {
  admin: { stripe: '#c81e14', dark: '#4a0a06', light: '#ff7a5a' },
  analyst: { stripe: '#2458d8', dark: '#0a1a48', light: '#8ab4ff' },
  staff: { stripe: '#d8b81e', dark: '#4a3a06', light: '#fff07a' },
};

export function roleColor(role: string | undefined): { stripe: string; dark: string; light: string } {
  return ROLE_COLORS[role ?? ''] ?? { stripe: '#2aa040', dark: '#0a3010', light: '#8aff9a' };
}

function rivet(g: CanvasRenderingContext2D, x: number, y: number): void {
  const u = 1 / RES;
  g.fillStyle = '#161920';
  g.fillRect(x - u, y - u, 5 * u, 5 * u);
  g.fillStyle = '#687080';
  g.fillRect(x, y, 3 * u, 3 * u);
  g.fillStyle = '#d8e0ec';
  g.fillRect(x, y, 2 * u, u);
  g.fillRect(x, y, u, 2 * u);
  g.fillStyle = '#8a92a0';
  g.fillRect(x + u, y + u, u, u);
  g.fillStyle = '#343a46';
  g.fillRect(x + 2 * u, y + 2 * u, u, u);
}

function steelPanel(p: PaintCtx, x: number, y: number, w: number, h: number, base: [number, number, number]): void {
  noiseFill(p, base, 19, 1, x, y, w, h);
  const { g } = p;
  const u = 1 / p.s;
  // brushed horizontal streaks
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    if (p.rnd() < 0.45) {
      g.fillStyle = `rgba(255,255,255,${0.05 + p.rnd() * 0.07})`;
      g.fillRect(x + 1, yy, w - 2, 1);
    }
    if (p.rnd() < 0.3) {
      g.fillStyle = `rgba(4,5,8,${0.05 + p.rnd() * 0.08})`;
      g.fillRect(x + 1, yy, w - 2, 1);
    }
  }
  // per-texel speckle so the plate never reads flat point-blank
  for (let k = 0; k < w * h * 0.04; k++) {
    const sx = x + 1 + p.rnd() * (w - 2);
    const sy = y + 1 + p.rnd() * (h - 2);
    g.fillStyle = p.rnd() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
    g.fillRect(sx, sy, u, u);
  }
  g.fillStyle = 'rgba(255,255,255,0.42)';
  g.fillRect(x, y, w, u);
  g.fillRect(x, y, u, h);
  g.fillStyle = 'rgba(0,0,0,0.62)';
  g.fillRect(x, y + h - 2 * u, w, 2 * u);
  g.fillRect(x + w - 2 * u, y, 2 * u, h);
  for (const sx of [x + 3, x + w - 5]) {
    rivet(g, sx, y + 3);
    rivet(g, sx, y + h - 5);
  }
  for (let k = 0; k < 9; k++) {
    const sx = x + 5 + p.rnd() * Math.max(1, w - 12);
    const sy = y + 6 + p.rnd() * Math.max(1, h - 12);
    const len = 2 + p.rnd() * 7;
    g.fillStyle = 'rgba(230,235,245,0.28)';
    g.fillRect(sx, sy, len, u);
    g.fillStyle = 'rgba(8,10,14,0.55)';
    g.fillRect(sx, sy + u, len, u);
  }
}

function hazard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical = false): void {
  const u = 1 / RES;
  g.fillStyle = '#d8b018';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#16120a';
  for (let i = -h - w; i < w + h; i += 8) {
    for (let k = 0; k < 4; k++) {
      for (let yy = 0; yy < h; yy++) {
        const xx = vertical ? i + k + (h - yy) : i + k + yy;
        if (xx >= 0 && xx < w) g.fillRect(x + xx, y + yy, 1, 1);
      }
    }
  }
  g.fillStyle = 'rgba(255,236,128,0.55)';
  g.fillRect(x, y, w, u);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(x, y + h - 2 * u, w, 2 * u);
}

/** Scuffed kick plate along the bottom of a wall, with a coloured trim line. */
function kickPlate(g: CanvasRenderingContext2D, trim: string): void {
  const u = 1 / RES;
  g.fillStyle = '#1a1c22';
  g.fillRect(0, 66, 64, 14);
  g.fillStyle = '#343a46';
  g.fillRect(0, 66, 64, u);
  g.fillStyle = trim;
  g.fillRect(0, 68, 64, 2);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 70, 64, u);
  g.fillStyle = '#0c0d10';
  g.fillRect(0, 78, 64, 2);
}

/**
 * Per-texel vertical shade ramp over rows [y0, y1): alpha eases a0→a1.
 * Baked grime/shadow gradients — the 4K read of soot near the ceiling and
 * floor-line dirt that flat noise can't give.
 */
function vShade(g: CanvasRenderingContext2D, y0: number, y1: number, rgb: string, a0: number, a1: number, x0 = 0, w = 64): void {
  const u = 1 / RES;
  for (let y = y0; y < y1 - 1e-6; y += u) {
    const t = (y - y0) / Math.max(1e-6, y1 - y0);
    g.fillStyle = `rgba(${rgb},${(a0 + (a1 - a0) * t).toFixed(3)})`;
    g.fillRect(x0, y, w, u * 1.01);
  }
}

/** Hairline panel seam: a dark 1-texel line with a light edge beside it. */
function seam(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const u = 1 / RES;
  g.fillStyle = 'rgba(8,9,12,0.8)';
  g.fillRect(x0, y0, Math.max(u, x1 - x0), Math.max(u, y1 - y0));
  g.fillStyle = 'rgba(255,255,255,0.15)';
  if (x1 - x0 <= u) g.fillRect(x0 + u, y0, u, y1 - y0);
  else g.fillRect(x0, y0 + u, x1 - x0, u);
}

/** Tiny bolt head: dark rim, steel body, catchlight texel. */
function bolt(g: CanvasRenderingContext2D, x: number, y: number): void {
  const u = 1 / RES;
  g.fillStyle = '#0c0e12';
  g.fillRect(x - u, y - u, 4 * u, 4 * u);
  g.fillStyle = '#6e7684';
  g.fillRect(x, y, 2 * u, 2 * u);
  g.fillStyle = '#ccd4e0';
  g.fillRect(x, y, u, u);
}

/** Rust/dust drip: a jittered, fading vertical streak under a fitting. */
function drip(g: CanvasRenderingContext2D, x: number, y0: number, len: number, rgb = '14,10,8'): void {
  const u = 1 / RES;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    g.fillStyle = `rgba(${rgb},${(0.42 * (1 - t)).toFixed(3)})`;
    g.fillRect(x + (i % 5 === 3 ? u : 0), y0 + i * u, u, u * 1.2);
  }
}

/** Sagging cable span between two clips, then a short drop into a jack. */
function cableDrop(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, sag: number, col: string, drop: number): void {
  const u = 1 / RES;
  for (let x = x0; x <= x1; x += u) {
    const t = (x - x0) / Math.max(1e-6, x1 - x0);
    const yy = y + sag * 4 * t * (1 - t);
    g.fillStyle = col;
    g.fillRect(x, yy, u * 1.2, u * 1.2);
  }
  for (const cx of [x0, x1]) {
    g.fillStyle = '#101318';
    g.fillRect(cx - u, y - 2 * u, 3 * u, 3 * u);
    g.fillStyle = '#5a6270';
    g.fillRect(cx - u, y - 2 * u, 3 * u, u);
  }
  g.fillStyle = col;
  g.fillRect(x1, y, u * 1.2, drop);
  bevel(g, x1 - 2, y + drop, 5, 5, '#2c3038', '#5a6272', '#101218');
  g.fillStyle = '#0c0e12';
  g.fillRect(x1 + 0.5, y + drop + 2, 2 * u, 2 * u);
}

/** Pass jobs=true to register gen jobs only (generation-worker startup). */
export function buildTextures(jobs = false): void {
  if (jobs ? textureJobsDone : textureRegistry.ids().length > 0) return;
  jobsOnly = jobs;
  textureJobsDone ||= jobs;

  // Office tech-panel wall: two steel plates, cable tray, cyan status strip.
  wallV('wall-panel', (p) => {
    const { g } = p;
    noiseFill(p, [52, 46, 40], 10);
    steelPanel(p, 1, 2, 30, 44, [104, 98, 88]);
    steelPanel(p, 33, 2, 30, 44, [98, 92, 84]);
    // vent grille on the right plate
    for (let y = 10; y < 26; y += 2) {
      g.fillStyle = '#1c1f26';
      g.fillRect(38, y, 20, 1);
      g.fillStyle = '#a4acbc';
      g.fillRect(38, y + 1, 20, 1);
      for (let x = 40; x < 58; x += 3) {
        g.fillStyle = '#080a0e';
        g.fillRect(x, y, 1 / p.s, 1 / p.s);
      }
    }
    // label plate on the left plate: etched network id tag
    bevel(g, 6, 10, 24, 9, '#2a2e38', '#5a6070', '#101218', true);
    drawText(g, 'NET-04', 8, 12, '#9ab0c8', 'tiny', null);
    for (const [x, y] of [[3, 4], [27, 4], [3, 42], [27, 42], [35, 4], [59, 4], [35, 42], [59, 42]]) rivet(g, x, y);
    // status light strip (fullbright)
    g.fillStyle = '#0a0c10';
    g.fillRect(0, 47, 64, 5);
    g.fillStyle = '#18d8f0';
    g.fillRect(2, 48, 60, 3);
    p.glow.fillStyle = '#fff';
    p.glow.fillRect(2, 48, 60, 3);
    g.fillStyle = '#b8fcff';
    g.fillRect(2, 49, 60, 1);
    // lower wainscot: dark wood panelling with grain + rust-stained base
    for (let x = 0; x < 64; x += 16) {
      noiseFill(p, [96, 60, 32], 14, 1, x, 52, 16, 26);
      for (let yy = 53; yy < 78; yy++) {
        if (p.rnd() < 0.5) {
          g.fillStyle = `rgba(40,20,6,${0.25 + p.rnd() * 0.25})`;
          g.fillRect(x + 1 + Math.floor(p.rnd() * 14), yy, 1 + Math.floor(p.rnd() * 3), 1);
        }
      }
      bevel(g, x + 2, 55, 12, 20, 'rgba(0,0,0,0)', '#c08a52', '#2e1a0a', true);
      g.fillStyle = '#2e1a0a';
      g.fillRect(x, 52, 1, 26);
    }
    g.fillStyle = '#d8a060';
    g.fillRect(0, 52, 64, 1);
    // fine seams + fasteners: panel split lines, bolt rows, drips under the
    // strip, ceiling soot — reads as authored sheet-metal up close
    seam(g, 17, 3, 17, 45);
    seam(g, 49, 3, 49, 45);
    seam(g, 2, 24, 30, 24);
    seam(g, 34, 24, 62, 24);
    seam(g, 32, 2, 32, 45);
    for (let x = 6; x < 62; x += 7) bolt(g, x, 46.5);
    // inspection tag + pin LEDs: colour accents that read at 4K point-blank
    bevel(g, 50, 12, 11, 6, '#7a5a10', '#ffd040', '#241a04');
    drawText(g, 'QA-1', 51, 13, '#181004', 'tiny', null);
    for (const [lx, lc] of [[22, '#ffb010'], [25, '#2cff5a']] as const) {
      g.fillStyle = '#0a0c10';
      g.fillRect(lx - 1, 34, 3, 3);
      g.fillStyle = lc;
      g.fillRect(lx, 35, 1, 1);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(lx, 35, 1, 1);
    }
    drip(g, 9, 20, 26);
    drip(g, 55, 27, 18, '10,8,6');
    vShade(g, 0, 5, '6,5,4', 0.3, 0);
    grime(p, 'rgba(90,40,10,0.55)', 90, 0, 70, 64, 8);
    g.fillStyle = '#14161c';
    g.fillRect(0, 78, 64, 2);
  });

  // Office utility variant: one tall service plate, conduit column, SVC
  // stencil — the alt family mixed into wall-panel runs.
  wallV('wall-panel2', (p) => {
    const { g, glow } = p;
    const u = 1 / p.s;
    noiseFill(p, [46, 42, 38], 9);
    steelPanel(p, 2, 2, 40, 50, [98, 92, 82]);
    steelPanel(p, 2, 54, 40, 10, [84, 78, 70]);
    seam(g, 2, 52, 42, 52);
    // conduit column on the right: vertical raceway + junction boxes
    noiseFill(p, [60, 58, 52], 10, 1, 46, 2, 16, 62);
    g.fillStyle = '#2a2e36';
    g.fillRect(49, 0, 5, 66);
    g.fillStyle = '#6a7280';
    g.fillRect(49, 0, u, 66);
    g.fillStyle = '#101318';
    g.fillRect(53, 0, u, 66);
    for (const y of [8, 34, 58]) {
      bevel(g, 46, y, 12, 10, '#343a44', '#6a7484', '#0e1014');
      g.fillStyle = '#0c0e12';
      g.fillRect(49, y + 4, 6, 3);
      g.fillStyle = '#ffb010';
      g.fillRect(50, y + 5, 2, 1);
      glow.fillStyle = '#fff';
      glow.fillRect(50, y + 5, 2, 1);
    }
    // stencil service tag on the big plate
    bevel(g, 6, 8, 24, 10, '#262a32', '#545c6a', '#0e1014');
    drawText(g, 'SVC-2', 9, 11, '#b8c4d8', 'tiny', null);
    // low vent band + fasteners
    for (let y = 56; y < 62; y += 2) {
      g.fillStyle = '#14161c';
      g.fillRect(5, y, 34, 1);
      g.fillStyle = '#7a8496';
      g.fillRect(5, y + 1, 34, u);
    }
    for (let x = 6; x < 42; x += 9) bolt(g, x, 4.5);
    for (const y of [22, 40]) {
      bolt(g, 4, y);
      bolt(g, 40, y);
    }
    cableDrop(g, 8, 30, 44, 4, '#c84830', 6);
    drip(g, 24, 19, 30);
    vShade(g, 0, 5, '6,5,4', 0.28, 0);
    vShade(g, 64, 68, '8,6,4', 0, 0.4);
    kickPlate(g, '#5a5040');
    grime(p, 'rgba(70,40,10,0.5)', 90, 0, 66, 64, 12);
    g.fillStyle = '#14161c';
    g.fillRect(0, 78, 64, 2);
  });

  // LEVELS rF4: secret-door tell — the same office panels as 'wall-panel' but
  // deliberately MISALIGNED (right plate slipped 7 px, plate edges don't meet,
  // hairline shadow under the slip and one amber seam marker). At a glance it
  // reads as the wall around it; staring at it, the seam is wrong. Doom's
  // classic "odd texture" secret cue.
  wall('wall-secret', (p) => {
    const { g, glow } = p;
    const u = 1 / p.s;
    noiseFill(p, [52, 46, 40], 10);
    steelPanel(p, 1, 2, 30, 44, [104, 98, 88]);
    steelPanel(p, 33, 9, 30, 44, [98, 92, 84]);
    // exposed slip edge where the right plate dropped
    g.fillStyle = '#0a0c10';
    g.fillRect(33, 2, 30, 7);
    for (let x = 34; x < 62; x += 3) {
      g.fillStyle = '#565e6c';
      g.fillRect(x, 3 + ((x / 3) % 2), 2, u);
    }
    g.fillStyle = '#1c1f26';
    g.fillRect(38, 17, 20, 1);
    g.fillStyle = '#a4acbc';
    g.fillRect(38, 18, 20, 1);
    bevel(g, 6, 10, 20, 9, '#2a2e38', '#5a6070', '#101218', true);
    drawText(g, 'NET', 10, 12, '#9ab0c8', 'tiny', null);
    for (const [x, y] of [[3, 4], [27, 4], [3, 42], [27, 42], [35, 11], [59, 11], [35, 49], [59, 49]]) rivet(g, x, y);
    // status strip: right half dips with the slipped plate, one amber segment
    g.fillStyle = '#0a0c10';
    g.fillRect(0, 47, 64, 5);
    g.fillStyle = '#18d8f0';
    g.fillRect(2, 48, 29, 3);
    g.fillStyle = '#ffb010';
    g.fillRect(33, 55, 29, 3);
    glow.fillStyle = '#fff';
    glow.fillRect(2, 48, 29, 3);
    glow.fillRect(33, 55, 29, 3);
    for (let x = 0; x < 64; x += 16) {
      noiseFill(p, [96, 60, 32], 14, 1, x, 58, 16, 20);
      bevel(g, x + 2, 60, 12, 15, 'rgba(0,0,0,0)', '#c08a52', '#2e1a0a', true);
      g.fillStyle = '#2e1a0a';
      g.fillRect(x, 58, 1, 20);
    }
    seam(g, 17, 3, 17, 45);
    seam(g, 49, 10, 49, 52);
    seam(g, 32, 2, 32, 45);
    for (let x = 6; x < 62; x += 7) bolt(g, x, 46.5);
    drip(g, 9, 20, 26);
    vShade(g, 0, 5, '6,5,4', 0.3, 0);
    grime(p, 'rgba(90,40,10,0.55)', 90, 0, 70, 64, 8);
    g.fillStyle = '#14161c';
    g.fillRect(0, 78, 64, 2);
  });

  // Server rack: dark chassis, 2U units, drive bays, fullbright blinkenlights.
  wallV('wall-server', (p) => {
    const { g, glow } = p;
    noiseFill(p, [22, 24, 30], 8);
    // rails
    for (const x of [0, 58]) {
      g.fillStyle = '#3c414c';
      g.fillRect(x, 0, 6, 80);
      g.fillStyle = '#6c7484';
      g.fillRect(x + 1, 0, 1, 80);
      for (let y = 2; y < 80; y += 4) {
        g.fillStyle = '#0a0b0e';
        g.fillRect(x + 3, y, 2, 2);
      }
    }
    const leds = ['#2cff5a', '#ffb010', '#2ca8ff', '#2cff5a', '#ff3020'];
    for (let y = 2; y < 76; y += 10) {
      bevel(g, 7, y, 50, 9, '#2c3038', '#545a66', '#0c0d10');
      // drive bays
      for (let x = 9; x < 38; x += 7) {
        g.fillStyle = '#16181d';
        g.fillRect(x, y + 2, 6, 5);
        g.fillStyle = '#4a505c';
        g.fillRect(x, y + 2, 6, 1);
        g.fillStyle = '#7c8494';
        g.fillRect(x + 4, y + 5, 1, 1);
      }
      // led cluster
      for (let k = 0; k < 4; k++) {
        const c = leds[Math.floor(p.rnd() * leds.length)];
        if (p.rnd() < 0.8) {
          g.fillStyle = c;
          g.fillRect(41 + k * 4, y + 3, 2, 2);
          glow.fillStyle = '#fff';
          glow.fillRect(41 + k * 4, y + 3, 2, 2);
        } else {
          g.fillStyle = '#101114';
          g.fillRect(41 + k * 4, y + 3, 2, 2);
        }
      }
      g.fillStyle = '#080a0d';
      for (let x = 10; x < 39; x += 7) g.fillRect(x, y + 1, 1 / p.s, 1 / p.s);
      drawText(g, `U${Math.floor(y / 10) + 1}`, 9, y + 2, '#9299a6', 'tiny', '#121418');
      g.fillStyle = '#0e1013';
      g.fillRect(40, y + 6, 16, 1);
      // patch cable runs between bays: colour accents on the dark chassis
      const pc = ['#c84830', '#30a0d8', '#d8b018'][Math.floor(p.rnd() * 3)];
      g.fillStyle = pc;
      g.fillRect(14 + Math.floor(p.rnd() * 8) * 3, y + 7, 8, 1 / p.s);
    }
    for (const [x, y] of [[8, 3], [54, 3], [8, 75], [54, 75]]) rivet(g, x, y);
    grime(p, 'rgba(0,0,0,0.45)', 60);
  });

  // Concrete block corridor wall with a painted stripe.
  wallV('wall-brick', (p) => {
    const { g } = p;
    noiseFill(p, [34, 30, 28], 8);
    for (let row = 0; row < 8; row++) {
      const y = row * 10;
      const off = row % 2 === 0 ? 0 : 16;
      for (let x = -off; x < 64; x += 32) {
        const tint = (p.rnd() - 0.5) * 16;
        const base: [number, number, number] = row >= 5 ? [92 + tint, 52 + tint, 40 + tint] : [104 + tint, 98 + tint, 90 + tint];
        noiseFill(p, base, 18, 1, Math.max(0, x + 1), y + 1, Math.min(30, 64 - Math.max(0, x + 1)), 8);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(Math.max(0, x + 1), y + 1, 30, 1);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(Math.max(0, x + 1), y + 8, 30, 1);
        for (let i = 0; i < 22; i++) {
          g.fillStyle = p.rnd() < 0.6 ? '#483b33' : '#c8bcae';
          g.fillRect(Math.max(1, x + 3 + p.rnd() * 25), y + 3 + p.rnd() * 4, 1 / p.s, 1 / p.s);
        }
      }
    }
    // chipped block edges: dark notch + pale scar, reads point-blank
    for (let k = 0; k < 7; k++) {
      const cx = 3 + Math.floor(p.rnd() * 58);
      const cy = 2 + Math.floor(p.rnd() * 70);
      g.fillStyle = 'rgba(10,8,6,0.7)';
      g.fillRect(cx, cy, 2 / p.s, 2 / p.s);
      g.fillStyle = 'rgba(230,220,205,0.4)';
      g.fillRect(cx, cy + 2 / p.s, 2 / p.s, 1 / p.s);
    }
    // stepped hairline cracks on two blocks + a patched (repointed) block
    for (const [cx, cy] of [[10, 14], [44, 44]] as const) {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = 'rgba(10,8,7,0.75)';
        g.fillRect(cx + Math.floor(i / 3), cy + i, 1 / p.s, 1 / p.s);
      }
    }
    noiseFill(p, [58, 52, 46], 8, 1, 33, 21, 14, 8);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(33, 21, 14, 1 / p.s);
    drip(g, 20, 30, 30);
    drip(g, 52, 12, 20, '10,8,6');
    vShade(g, 0, 4, '8,6,5', 0.28, 0);
    vShade(g, 68, 73, '8,6,4', 0, 0.35);
    // baseboard kick plate: scuffed dark strip along the floor line
    g.fillStyle = '#1c1814';
    g.fillRect(0, 73, 64, 7);
    g.fillStyle = '#3c3228';
    g.fillRect(0, 73, 64, 1);
    for (let x = 0; x < 64; x += 3) {
      if (p.rnd() < 0.4) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(x + Math.floor(p.rnd() * 2), 76 + Math.floor(p.rnd() * 3), 1, 1);
      }
    }
    g.fillStyle = '#0a0908';
    g.fillRect(0, 79, 64, 1);
    grime(p, 'rgba(0,0,0,0.5)', 120);
  });

  // Door tracks (jambs): hazard striped.
  wall('doortrak', (p) => {
    const { g } = p;
    noiseFill(p, [60, 62, 70], 10);
    hazard(g, 0, 0, 64, 80, true);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, 4, 80);
    g.fillRect(60, 0, 4, 80);
    g.fillStyle = 'rgba(255,240,170,0.5)';
    g.fillRect(2, 0, 1 / p.s, 80);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(61, 0, 2 / p.s, 80);
  });

  // Second office family: long horizontal deck plates, cable raceway, kick.
  wallV('wall-tech', (p) => {
    const { g, glow } = p;
    const u = 1 / p.s;
    noiseFill(p, [44, 48, 56], 10);
    steelPanel(p, 1, 2, 62, 17, [88, 94, 106]);
    steelPanel(p, 1, 21, 62, 15, [80, 86, 98]);
    steelPanel(p, 1, 38, 62, 14, [72, 78, 90]);
    // recessed raceway with bundled cables and junction boxes
    g.fillStyle = '#121419';
    g.fillRect(0, 54, 64, 9);
    g.fillStyle = '#3a4048';
    g.fillRect(0, 54, 64, u);
    const cols = ['#c84830', '#30a0d8', '#d8b018', '#40a050'];
    for (let k = 0; k < 4; k++) {
      g.fillStyle = cols[k];
      g.fillRect(2, 56 + k, 60, u);
    }
    for (const x of [13, 45]) {
      bevel(g, x, 55, 8, 7, '#3a4048', '#6a7280', '#101218');
      g.fillStyle = '#ffb010';
      g.fillRect(x + 2, 57, 3, 2);
      glow.fillStyle = '#fff';
      glow.fillRect(x + 2, 57, 3, 2);
    }
    // deck seams + fastener rows + a cable drop from the raceway to a jack
    seam(g, 1, 19, 63, 19);
    seam(g, 1, 36.5, 63, 36.5);
    seam(g, 32, 2, 32, 17);
    seam(g, 16, 21, 16, 36);
    seam(g, 48, 21, 48, 36);
    for (let x = 6; x < 62; x += 11) bolt(g, x, 20.5);
    for (let x = 9; x < 62; x += 14) bolt(g, x, 37.5);
    // rack id tag on the middle deck: etched asset plate
    bevel(g, 23, 39, 19, 7, '#1d232e', '#4a586e', '#0a0c10');
    drawText(g, 'RK-07', 25, 41, '#8fd0ff', 'tiny', null);
    cableDrop(g, 18, 47, 60, 5, '#30a0d8', 8);
    drip(g, 8, 19, 22, '10,12,16');
    vShade(g, 0, 5, '6,8,12', 0.3, 0);
    kickPlate(g, '#4a5470');
    grime(p, 'rgba(0,0,0,0.4)', 80);
  });

  // Industrial family: vertical ribbed plating, conduit run, hazard kick.
  wallV('wall-ribs', (p) => {
    const { g } = p;
    const u = 1 / p.s;
    noiseFill(p, [38, 34, 28], 10);
    for (let x = 0; x < 64; x += 8) {
      noiseFill(p, [74, 66, 54], 12, 1, x + 1, 2, 6, 52);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x + 1, 2, 1, 52);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + 6, 2, 1, 52);
      for (const y of [6, 28, 50]) rivet(g, x + 3, y);
    }
    // horizontal steel pipe with brackets
    g.fillStyle = '#3a3228';
    g.fillRect(0, 12, 64, 5);
    g.fillStyle = '#5e5040';
    g.fillRect(0, 12, 64, u);
    for (let x = 6; x < 64; x += 16) {
      g.fillStyle = '#221c14';
      g.fillRect(x, 11, 3, 7);
      g.fillStyle = '#6a5a44';
      g.fillRect(x, 11, 3, u);
    }
    // weld beads along every other rib seam + drip stains under the rivets
    for (let x = 7; x < 64; x += 16) {
      for (let y = 4; y < 52; y += 3) {
        g.fillStyle = 'rgba(200,190,170,0.4)';
        g.fillRect(x, y, u, u * 1.6);
        g.fillStyle = 'rgba(20,14,8,0.55)';
        g.fillRect(x + u, y, u, u * 1.6);
      }
    }
    // oil-dark half of each rib channel: vertical AO keeps ribs crisp at range
    for (let x = 4; x < 64; x += 8) {
      g.fillStyle = 'rgba(8,6,4,0.3)';
      g.fillRect(x, 2, 2, 52);
    }
    for (const sx of [11, 27, 43, 59]) drip(g, sx, 8, 44);
    drip(g, 18, 18, 26, '30,18,8');
    // green conduit below the ribs
    g.fillStyle = '#1e3a26';
    g.fillRect(0, 58, 64, 4);
    g.fillStyle = '#46e07a';
    g.fillRect(0, 58, 64, u);
    g.fillRect(0, 61, 64, u);
    vShade(g, 62, 66, '6,4,2', 0, 0.3);
    hazard(g, 0, 66, 64, 8);
    g.fillStyle = '#0c0d10';
    g.fillRect(0, 78, 64, 2);
    grime(p, 'rgba(30,16,6,0.5)', 100, 0, 60, 64, 20);
  });

  // Olive utility-brick variant with a painted wayfinding stripe.
  wallV('wall-brick2', (p) => {
    const { g } = p;
    noiseFill(p, [30, 32, 26], 8);
    for (let row = 0; row < 8; row++) {
      const y = row * 10;
      const off = row % 2 === 0 ? 0 : 16;
      for (let x = -off; x < 64; x += 32) {
        const tint = (p.rnd() - 0.5) * 14;
        const base: [number, number, number] = [78 + tint, 82 + tint, 62 + tint];
        noiseFill(p, base, 16, 1, Math.max(0, x + 1), y + 1, Math.min(30, 64 - Math.max(0, x + 1)), 8);
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(Math.max(0, x + 1), y + 1, 30, 1);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(Math.max(0, x + 1), y + 8, 30, 1);
      }
    }
    // painted stripe: age it with speckle so it reads as worn paint
    g.fillStyle = '#b0901c';
    g.fillRect(0, 40, 64, 4);
    g.fillStyle = '#6a5410';
    g.fillRect(0, 43, 64, 1);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(40,42,32,0.7)';
      g.fillRect(Math.floor(p.rnd() * 64), 40 + Math.floor(p.rnd() * 4), 1, 1);
    }
    for (const [cx, cy] of [[18, 12], [50, 52]] as const) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = 'rgba(8,10,6,0.7)';
        g.fillRect(cx + Math.floor(i / 3), cy + i, 1 / p.s, 1 / p.s);
      }
    }
    drip(g, 30, 45, 24, '10,10,6');
    vShade(g, 0, 4, '6,7,4', 0.26, 0);
    g.fillStyle = '#1c1814';
    g.fillRect(0, 73, 64, 7);
    g.fillStyle = '#3c3228';
    g.fillRect(0, 73, 64, 1);
    g.fillStyle = '#0a0908';
    g.fillRect(0, 79, 64, 1);
    grime(p, 'rgba(0,0,0,0.5)', 120);
  });

  // Generic security door + role-coded variants.
  doorTexture('door', undefined);
  for (const role of Object.keys(ROLE_COLORS)) doorTexture(`door:${role}`, role);

  // Raised data-centre floor tiles (2x2 per cell) with perforated panels.
  flatV('floor', (p) => {
    const { g } = p;
    noiseFill(p, [40, 32, 26], 6);
    for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
      const perf = (x + y) % 64 === 0;
      noiseFill(p, perf ? [74, 62, 50] : [104, 84, 62], 12, 1, x + 1, y + 1, 30, 30);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x + 1, y + 1, 30, 1);
      g.fillRect(x + 1, y + 1, 1, 30);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(x + 1, y + 30, 30, 1);
      g.fillRect(x + 30, y + 1, 1, 30);
      if (perf) {
        for (let yy = y + 5; yy < y + 28; yy += 4)
          for (let xx = x + 5; xx < x + 28; xx += 4) {
            g.fillStyle = '#1a1b20';
            g.fillRect(xx, yy, 2, 2);
          }
      }
    }
    for (let i = 0; i < 48; i++) {
      const x = 2 + p.rnd() * 60, y = 2 + p.rnd() * 60;
      g.fillStyle = p.rnd() < 0.5 ? '#6c5a46' : '#211b16';
      g.fillRect(x, y, (p.rnd() < 0.25 ? 2 : 1) / p.s, 1 / p.s);
    }
    // traffic wear path: a polished, slightly darker lane crossing the cell
    // diagonally — mid-frequency floor detail that reads as walked-on at 4K
    {
      const wy = 14 + p.rnd() * 30;
      for (let x = 0; x < 64; x++) {
        const y = Math.round(wy + Math.sin(x / 14) * 3);
        g.fillStyle = `rgba(20,14,8,${0.16 + 0.1 * Math.sin((x + 3) / 9)})`;
        g.fillRect(x, y, 1, 3);
        g.fillStyle = 'rgba(210,190,160,0.10)';
        g.fillRect(x, y - 1, 1, 1);
      }
      // two parallel drag scuffs inside the lane
      for (let x = 8; x < 56; x++) {
        const y = Math.round(wy + Math.sin(x / 14) * 3);
        if (p.rnd() < 0.4) {
          g.fillStyle = 'rgba(12,8,4,0.5)';
          g.fillRect(x, y + 1, 1, 1);
        }
      }
    }
    g.fillStyle = '#16171b';
    g.fillRect(0, 0, 64, 1);
    g.fillRect(0, 0, 1, 64);
    g.fillRect(31, 0, 2, 64);
    g.fillRect(0, 31, 64, 2);
    grime(p, 'rgba(10,6,2,0.45)', 140);
  });

  // Cold machine-room deck: dark steel plates, perforation rows, cable cuts.
  flatV('floor-grid', (p) => {
    const { g } = p;
    noiseFill(p, [26, 30, 38], 8);
    for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
      noiseFill(p, [58, 66, 80], 10, 1, x + 1, y + 1, 30, 30);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x + 1, y + 1, 30, 1);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + 1, y + 30, 30, 1);
      g.fillRect(x + 30, y + 1, 1, 30);
      for (let yy = y + 4; yy < y + 28; yy += 5)
        for (let xx = x + 4; xx < x + 28; xx += 5) {
          g.fillStyle = '#14161d';
          g.fillRect(xx, yy, 2, 2);
        }
      // cable cutout corner on alternating plates
      if ((x + y) % 64 === 0) {
        g.fillStyle = '#0c0e13';
        g.fillRect(x + 22, y + 22, 8, 8);
        g.fillStyle = '#4a5464';
        g.fillRect(x + 22, y + 22, 8, 1);
        g.fillStyle = '#30a0d8';
        g.fillRect(x + 24, y + 25, 4, 1);
        g.fillStyle = '#c84830';
        g.fillRect(x + 24, y + 27, 4, 1);
      }
      // brushed wear arcs per plate: curved scuff fans near panel corners
      // (mid-frequency metal wear — the deck reads walked-on, not noise)
      for (let k = 0; k < 3; k++) {
        const cx = x + 6 + p.rnd() * 18;
        const cy = y + 6 + p.rnd() * 18;
        const r0 = 3 + p.rnd() * 5;
        const a0 = p.rnd() * Math.PI * 2;
        for (let i = 0; i < 9; i++) {
          const a = a0 + (i / 9) * 1.4;
          g.fillStyle = `rgba(180,195,215,${(0.10 + p.rnd() * 0.08).toFixed(2)})`;
          g.fillRect(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, 1, 1);
        }
      }
      // panel lift-hole marks on two plate corners
      for (const [lx, ly] of [[x + 3, y + 27], [x + 27, y + 3]] as const) {
        g.fillStyle = '#0a0c10';
        g.fillRect(lx, ly, 2, 1);
        g.fillStyle = '#8a96a8';
        g.fillRect(lx, ly - 1 / p.s, 2, 1 / p.s);
      }
    }
    g.fillStyle = '#101218';
    g.fillRect(0, 0, 64, 1);
    g.fillRect(0, 0, 1, 64);
    g.fillRect(31, 0, 2, 64);
    g.fillRect(0, 31, 64, 2);
    grime(p, 'rgba(6,8,14,0.5)', 130);
  });

  // Worn industrial concrete: warm brown, expansion joints, oil stains.
  flatV('floor-rust', (p) => {
    const { g } = p;
    noiseFill(p, [72, 54, 36], 14);
    for (let i = 0; i < 60; i++) {
      const x = 2 + p.rnd() * 60, y = 2 + p.rnd() * 60;
      g.fillStyle = p.rnd() < 0.5 ? 'rgba(60,40,20,0.5)' : 'rgba(120,96,60,0.35)';
      g.fillRect(x, y, 1 + Math.floor(p.rnd() * 3), 1);
    }
    // expansion joints at tile edges
    g.fillStyle = '#241a10';
    g.fillRect(0, 0, 64, 1);
    g.fillRect(0, 0, 1, 64);
    g.fillRect(31, 0, 2, 64);
    g.fillRect(0, 31, 64, 2);
    // oil stain blot
    g.fillStyle = 'rgba(16,12,8,0.5)';
    for (let i = 0; i < 18; i++) {
      const a = p.rnd() * Math.PI * 2, r = p.rnd() * 7;
      g.fillRect(46 + Math.cos(a) * r, 20 + Math.sin(a) * r * 0.6, 2, 1);
    }
    grime(p, 'rgba(20,10,4,0.5)', 140);
  });

  // Acoustic ceiling tile + fluorescent light panel variant.
  const ceilBase = (p: PaintCtx) => {
    const { g } = p;
    noiseFill(p, [92, 84, 70], 12);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(40,30,20,0.35)';
      g.fillRect(Math.floor(p.rnd() * 64), Math.floor(p.rnd() * 64), 1, 1);
    }
    for (let y = 4; y < 64; y += 4) for (let x = 4; x < 64; x += 4) {
      g.fillStyle = '#514a3d';
      g.fillRect(x, y, 1 / p.s, 1 / p.s);
      g.fillStyle = '#b3a890';
      g.fillRect(x + 1 / p.s, y, 1 / p.s, 1 / p.s);
    }
    g.fillStyle = '#3a3226';
    g.fillRect(0, 0, 64, 2);
    g.fillRect(0, 0, 2, 64);
    g.fillRect(31, 0, 2, 64);
    g.fillRect(0, 31, 64, 2);
    grime(p, 'rgba(0,0,0,0.35)', 160);
  };
  flatV('ceil', ceilBase);
  flatV('ceil-light', (p) => {
    ceilBase(p);
    const { g, glow } = p;
    g.fillStyle = '#9aa0a8';
    g.fillRect(12, 6, 40, 52);
    g.fillStyle = '#e8f2ff';
    g.fillRect(14, 8, 36, 48);
    g.fillStyle = '#b8d0ec';
    for (let x = 18; x < 50; x += 8) g.fillRect(x, 8, 1, 48);
    glow.fillStyle = '#fff';
    glow.fillRect(14, 8, 36, 48);
  });

  // Cable tray / duct access cell: mixed into plain ceilings so large
  // overhead runs read as authored infrastructure, not a tile wallpaper.
  flat('ceil-duct', (p) => {
    ceilBase(p);
    const { g } = p;
    // recessed tray crossing the cell, with cable bundles and hanger straps
    g.fillStyle = '#12151c';
    g.fillRect(0, 20, 64, 24);
    g.fillStyle = '#2e3540';
    g.fillRect(0, 20, 64, 2);
    g.fillRect(0, 42, 64, 2);
    const cols = ['#c84830', '#30a0d8', '#d8b018', '#40a050', '#8a8f9c'];
    for (let k = 0; k < 5; k++) {
      g.fillStyle = cols[k];
      g.fillRect(0, 24 + k * 3, 64, 2);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(0, 25 + k * 3, 64, 1);
    }
    for (const x of [10, 32, 54]) {
      g.fillStyle = '#0a0c10';
      g.fillRect(x, 19, 3, 26);
      g.fillStyle = '#5a6474';
      g.fillRect(x, 19, 3, 1);
      rivet(g, x + 1, 21);
    }
    grime(p, 'rgba(0,0,0,0.4)', 60);
  });

  // Recessed vent cell: mixed into plain ceilings next to the duct cells so
  // big overhead runs break up with authored fixtures, not tile wallpaper.
  flat('ceil-vent', (p) => {
    ceilBase(p);
    const { g } = p;
    // recessed square grille, off-centre
    g.fillStyle = '#14161c';
    g.fillRect(14, 18, 36, 28);
    g.fillStyle = '#3a3f4a';
    g.fillRect(14, 18, 36, 1);
    g.fillRect(14, 18, 1, 28);
    g.fillStyle = '#08090c';
    g.fillRect(14, 45, 36, 1);
    g.fillRect(49, 18, 1, 28);
    for (let y = 21; y < 44; y += 3) {
      g.fillStyle = '#0a0b0e';
      g.fillRect(16, y, 32, 2);
      g.fillStyle = '#565e6c';
      g.fillRect(16, y, 32, 1);
    }
    for (const [x, y] of [[15, 19], [48, 19], [15, 44], [48, 44]]) rivet(g, x, y);
    drip(g, 20, 47, 12, '20,18,14');
    grime(p, 'rgba(0,0,0,0.4)', 60);
  });

  // Dead fluorescent panel: dusty diffuser, no glow.
  flatV('ceil-light-off', (p) => {
    ceilBase(p);
    const { g } = p;
    g.fillStyle = '#3a3c40';
    g.fillRect(12, 6, 40, 52);
    g.fillStyle = '#56585c';
    g.fillRect(14, 8, 36, 48);
    g.fillStyle = '#44464a';
    for (let x = 18; x < 50; x += 8) g.fillRect(x, 8, 1, 48);
    grime(p, 'rgba(0,0,0,0.5)', 80, 14, 8, 36, 48);
  });

  // Exit pad: green chevrons, fullbright.
  flat('exit', (p) => {
    const { g, glow } = p;
    noiseFill(p, [20, 34, 24], 10);
    hazard(g, 0, 0, 64, 6);
    hazard(g, 0, 58, 64, 6);
    g.fillStyle = '#0c2a12';
    g.fillRect(6, 10, 52, 44);
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 10; i++) {
        g.fillStyle = '#2cff5a';
        g.fillRect(20 + i, 14 + k * 13 + i, 4, 2);
        g.fillRect(44 - i - 4, 14 + k * 13 + i, 4, 2);
        glow.fillStyle = '#fff';
        glow.fillRect(20 + i, 14 + k * 13 + i, 4, 2);
        glow.fillRect(44 - i - 4, 14 + k * 13 + i, 4, 2);
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = 7 + p.rnd() * 50, y = 11 + p.rnd() * 42;
      g.fillStyle = '#405238';
      g.fillRect(x, y, 1 / p.s, 1 / p.s);
    }
  });

  // Wall decals: transparent-background overlays drawn on a quad just off the
  // wall face. Painters only touch the decal region; the rest stays alpha 0
  // and the world shader discards it.
  const decal = (id: string, painter: Painter) => makeTexture(id, TEX.wallW / RES, TEX.wallH / RES, painter, false);

  // Vent grille with frame screws, mid-wall.
  decal('decal-vent', (p) => {
    const { g } = p;
    bevel(g, 14, 22, 36, 20, '#2e323c', '#6a7280', '#0e1014');
    for (let y = 25; y < 40; y += 2) {
      g.fillStyle = '#0a0c10';
      g.fillRect(17, y, 30, 1);
      g.fillStyle = '#8a94a6';
      g.fillRect(17, y + 1, 30, 1);
    }
    for (const [x, y] of [[15, 24], [47, 24], [15, 40], [47, 40]]) rivet(g, x, y);
  });

  // Surface raceway: bundled coloured cables with clips.
  decal('decal-cable', (p) => {
    const { g } = p;
    g.fillStyle = '#22262e';
    g.fillRect(0, 34, 64, 6);
    g.fillStyle = '#4a5260';
    g.fillRect(0, 34, 64, 1);
    const cols = ['#c84830', '#30a0d8', '#d8b018', '#40a050'];
    for (let k = 0; k < 4; k++) {
      g.fillStyle = cols[k];
      g.fillRect(0, 35 + k, 64, 1);
    }
    for (let x = 7; x < 64; x += 16) {
      g.fillStyle = '#10131a';
      g.fillRect(x, 33, 2, 8);
    }
    // drop to a wall jack on the right
    bevel(g, 52, 40, 8, 8, '#2c3038', '#5a6272', '#101218');
    g.fillStyle = '#10131a';
    g.fillRect(55, 43, 2, 2);
  });

  // Warning placard: hazard chevrons + CAUTION word plate.
  decal('decal-haz', (p) => {
    const { g } = p;
    hazard(g, 10, 38, 44, 14);
    g.fillStyle = '#181410';
    g.fillRect(10, 41, 44, 8);
    const w = measureText('CAUTION', 'tiny');
    drawText(g, 'CAUTION', 32 - Math.floor(w / 2), 42, '#ffd040', 'tiny', null);
    bevel(g, 10, 38, 44, 14, 'rgba(0,0,0,0)', '#fff0a0', '#201404');
    for (const [x, y] of [[11, 39], [51, 39], [11, 51], [51, 51]]) rivet(g, x, y);
  });
  jobsOnly = false;
}

function doorTexture(id: string, role: string | undefined): void {
  const rc = role ? roleColor(role) : { stripe: '#5a6070', dark: '#1a1c22', light: '#c0c8d8' };
  wall(id, (p) => {
    const { g, glow } = p;
    const u = 1 / p.s;
    noiseFill(p, [52, 56, 64], 8);
    // two leaves
    steelPanel(p, 2, 2, 29, 70, [96, 100, 112]);
    steelPanel(p, 33, 2, 29, 70, [92, 96, 108]);
    g.fillStyle = '#121418';
    g.fillRect(31, 0, 2, 80);
    // role band across the door
    g.fillStyle = rc.dark;
    g.fillRect(2, 22, 60, 12);
    g.fillStyle = rc.stripe;
    g.fillRect(2, 23, 60, 10);
    g.fillStyle = rc.light;
    g.fillRect(2, 23, 60, u);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(2, 32, 60, 2 * u);
    const label = role ? role.toUpperCase() : 'SECURE';
    const lw = measureText(label, 'tiny');
    drawText(g, label, 32 - Math.floor(lw / 2), 26, '#ffffff', 'tiny', rc.dark);
    // reinforcement bars
    for (const y of [44, 56]) {
      g.fillStyle = '#4a4e58';
      g.fillRect(4, y, 56, 3);
      g.fillStyle = '#a8b0c0';
      g.fillRect(4, y, 56, u);
      g.fillStyle = '#101218';
      g.fillRect(4, y + 2, 56, 2 * u);
    }
    // badge reader (fullbright LED)
    bevel(g, 46, 8, 10, 12, '#1a1c22', '#6a7080', '#08090b');
    g.fillStyle = rc.light;
    g.fillRect(48, 10, 6, 2);
    glow.fillStyle = '#fff';
    glow.fillRect(48, 10, 6, 2);
    g.fillStyle = '#ff3020';
    g.fillRect(50, 15, 2, 2);
    glow.fillRect(50, 15, 2, 2);
    // hazard kick strip
    hazard(g, 2, 72, 60, 6);
    g.fillStyle = '#0c0d10';
    g.fillRect(0, 78, 64, 2);
    for (const x of [5, 27, 35, 57]) rivet(g, x, 6);
  });
}

/** Look up a texture id, falling back to a neutral wall for unknown ids. */
export function textureOr(id: string, fallback = 'wall-panel'): THREE.Texture {
  return ensureTexture(textureRegistry.get(id) ?? textureRegistry.require(fallback));
}

/** Door texture for a door cell; role-coded so access level reads at a glance. */
export function doorTextureFor(tex: string, accessRole: string | undefined): THREE.Texture {
  if (tex === 'door') {
    if (accessRole && !textureRegistry.get(`door:${accessRole}`)) doorTexture(`door:${accessRole}`, accessRole);
    return ensureTexture(textureRegistry.get(accessRole ? `door:${accessRole}` : 'door')!);
  }
  return textureOr(tex, 'door');
}

/**
 * Zone wayfinding placard decal, painted lazily per word. Authored like a
 * real directory sign: a mounted plate with a lit header band carrying the
 * zone code, a room number and a direction chevron, plus the mounting
 * shadow line that throws it off the wall.
 */
function signDecal(word: string): void {
  makeTexture(`decal-sign:${word}`, TEX.wallW / RES, TEX.wallH / RES, (p) => {
    const { g } = p;
    const room = 100 + (hashStr(word) % 400);
    // drop shadow then the plate itself
    g.fillStyle = 'rgba(4,5,8,0.55)';
    g.fillRect(9, 16, 48, 21);
    bevel(g, 8, 14, 48, 21, '#11161e', '#3a4a62', '#05070a');
    // header band: zone code on a lit stripe
    g.fillStyle = '#2a5a94';
    g.fillRect(9, 15, 46, 9);
    g.fillStyle = '#4a8ac8';
    g.fillRect(9, 15, 46, 1);
    const w = measureText(word, 'small');
    if (w <= 44) drawText(g, word, 32 - Math.floor(w / 2), 16, '#e8f2ff', 'small', '#122030');
    else drawText(g, word, 32 - Math.floor(measureText(word, 'tiny') / 2), 17, '#e8f2ff', 'tiny', '#122030');
    // room number row with a direction chevron — reads as a directory plate
    g.fillStyle = '#1a2430';
    g.fillRect(9, 25, 46, 9);
    drawText(g, `RM-${room}`, 12, 26, '#8fb4d8', 'tiny', null);
    const ax = 32 + Math.floor(measureText(`RM-${room}`, 'tiny') / 2) + 8;
    g.fillStyle = '#d8b018';
    for (let i = 0; i < 5; i++) g.fillRect(ax + i, 28 - Math.abs(i - 2), 1, 1 + Math.abs(i - 2) * 2);
    for (const [x, y] of [[9, 15], [54, 15], [9, 33], [54, 33]]) rivet(g, x, y);
  }, false);
}

/**
 * Door jamb number plate, painted lazily per door id so every doorway gets
 * its own deliberate number ('D-214') instead of generic hazard stripes.
 */
function doorPlateDecal(doorId: string): void {
  const num = 100 + (hashStr(doorId) % 800);
  makeTexture(`decal-door:${doorId}`, TEX.wallW / RES, TEX.wallH / RES, (p) => {
    const { g } = p;
    g.fillStyle = 'rgba(4,5,8,0.5)';
    g.fillRect(20, 7, 25, 10);
    bevel(g, 19, 6, 25, 10, '#10141a', '#4a5468', '#05070a');
    drawText(g, `D-${num}`, 22, 8, '#c8d8ec', 'tiny', null);
    rivet(g, 20, 7);
    rivet(g, 42, 7);
  }, false);
}

/**
 * Per-tier status-pip panel decal, painted lazily per theme name: a small
 * wall-mounted indicator strip whose LEDs carry the theme's accent colour
 * (green early, blue mid, red/amber late) on the fullbright glow layer —
 * the little coloured fixtures that break the cyan monotone per mission tier.
 */
function statusDecal(themeName: string): void {
  const accent = THEMES[themeName]?.accent ?? THEMES.office.accent;
  makeTexture(`decal-status:${themeName}`, TEX.wallW / RES, TEX.wallH / RES, (p) => {
    const { g, glow } = p;
    const u = 1 / p.s;
    const [ar, ag, ab] = accent;
    const lit = `rgb(${Math.min(255, ar * 235) | 0},${Math.min(255, ag * 235) | 0},${Math.min(255, ab * 235) | 0})`;
    const dim = `rgb(${Math.min(255, ar * 92) | 0},${Math.min(255, ag * 92) | 0},${Math.min(255, ab * 92) | 0})`;
    // mounting shadow + housing plate with a screw head per corner
    g.fillStyle = 'rgba(4,5,8,0.5)';
    g.fillRect(19, 21, 27, 15);
    bevel(g, 18, 20, 27, 15, '#141820', '#4a5262', '#07080c');
    // label etch on the plate's left half
    g.fillStyle = '#0a0d12';
    g.fillRect(20, 22, 12, 11);
    drawText(g, 'ST', 21, 23, '#7f8a9c', 'tiny', null);
    // three status pips: two lit in the accent colour, one dark
    for (let k = 0; k < 3; k++) {
      const x = 34 + k * 4;
      g.fillStyle = '#06070a';
      g.fillRect(x - u, 23 - u, 3 + 2 * u, 3 + 2 * u);
      const on = k !== 2;
      g.fillStyle = on ? lit : dim;
      g.fillRect(x, 23, 3, 3);
      if (on) {
        g.fillStyle = '#ffffff';
        g.fillRect(x, 23, 1, 1);
        glow.fillStyle = '#fff';
        glow.fillRect(x, 23, 3, 3);
      }
    }
    // thin accent strip under the pips — a lit status bar, not a poster
    g.fillStyle = dim;
    g.fillRect(34, 29, 10, 2);
    g.fillStyle = lit;
    g.fillRect(34, 29, 10, u);
    glow.fillStyle = '#fff';
    glow.fillRect(34, 29, 10, u);
    for (const [x, y] of [[19, 21], [43, 21], [19, 33], [43, 33]]) rivet(g, x, y);
  }, false);
}

/** Security-awareness poster decal: banner word + badge icon + slogan. */
function posterDecal(word: string): void {
  makeTexture(`decal-poster:${word}`, TEX.wallW / RES, TEX.wallH / RES, (p) => {
    const { g } = p;
    bevel(g, 18, 10, 28, 46, '#e4dfd2', '#ffffff', '#847c6c');
    g.fillStyle = '#1c2c48';
    g.fillRect(20, 12, 24, 11);
    const w = measureText(word, 'small');
    if (w <= 22) drawText(g, word, 32 - Math.floor(w / 2), 14, '#ffd040', 'small', null);
    else drawText(g, word, 32 - Math.floor(measureText(word, 'tiny') / 2), 15, '#ffd040', 'tiny', null);
    g.fillStyle = '#c82e20';
    g.fillRect(29, 27, 6, 8);
    g.fillStyle = '#ff6a50';
    g.fillRect(29, 27, 6, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(30, 30, 4, 1);
    g.fillStyle = '#3a4050';
    g.fillRect(20, 42, 24, 10);
    drawText(g, 'REPORT', 32 - Math.floor(measureText('REPORT', 'tiny') / 2), 44, '#9ab0c8', 'tiny', null);
    drawText(g, 'IT', 32 - Math.floor(measureText('IT', 'tiny') / 2), 48, '#9ab0c8', 'tiny', null);
  }, false);
}

/**
 * Lazily materialise a decal overlay texture (themed word decals are painted
 * on first use, like door role variants). Returns null for unknown ids so the
 * caller can just skip the decal quad.
 */
export function decalTexture(id: string): THREE.Texture | null {
  let t = textureRegistry.get(id);
  if (!t) {
    if (id.startsWith('decal-sign:')) signDecal(id.slice(11));
    else if (id.startsWith('decal-poster:')) posterDecal(id.slice(13));
    else if (id.startsWith('decal-status:')) statusDecal(id.slice(13));
    t = textureRegistry.get(id);
  }
  if (!t && id.startsWith('decal-door:')) {
    doorPlateDecal(id.slice(11));
    t = textureRegistry.get(id);
  }
  return t ? ensureTexture(t) : null;
}

/** Wall/flat/decal identity kit for one mission. */
export interface WallTheme {
  /** Alt wall families mixed into the 'wall-panel' variant pool. */
  alts: string[];
  /** Decal overlay ids pooled per wall face (themed sign/poster included). */
  decals: string[];
  /** Hue multiply on world geometry; subtle, keeps the palette read. */
  tint: [number, number, number];
  /** Flat id used wherever a floor cell uses the plain 'floor' texture. */
  floor: string;
  /** Accent colour multiply for emissive fixtures (lit ceiling panels) and
   *  status-pip decals — the per-tier accent that breaks the cyan monotone:
   *  green early, cool blue mid, amber/red alarm late. */
  accent: [number, number, number];
}

const THEMES: Record<string, WallTheme> = {
  // warm office (early tier): beige wainscot walls, PHISH posters, OPS placards,
  // green status lamps — healthy-corporate early-tier accent
  office: { alts: ['wall-tech', 'wall-panel2'], decals: ['decal-vent', 'decal-cable', 'decal-poster:PHISH', 'decal-sign:OPS', 'decal-status:office'], tint: [1.14, 1.0, 0.84], floor: 'floor', accent: [0.62, 1.12, 0.7] },
  // green bullpen (early tier): olive utility brick, SEC placards, 2FA posters
  bullpen: { alts: ['wall-tech', 'wall-panel2', 'wall-brick2'], decals: ['decal-cable', 'decal-vent', 'decal-sign:SEC', 'decal-poster:2FA', 'decal-status:bullpen'], tint: [0.94, 1.08, 0.85], floor: 'floor', accent: [0.6, 1.14, 0.62] },
  // cold machine room (mid tier): ribbed walls, IDC placards, raised deck floor,
  // steel-blue fixture glow
  datacenter: { alts: ['wall-ribs'], decals: ['decal-cable', 'decal-vent', 'decal-sign:IDC', 'decal-poster:SIEM', 'decal-status:datacenter'], tint: [0.82, 0.97, 1.18], floor: 'floor-grid', accent: [0.62, 0.86, 1.22] },
  // violet-tinted SOC/NOC (late tier): SOC placards, SIEM posters, deck floor,
  // red alert lighting
  noc: { alts: ['wall-tech', 'wall-panel2'], decals: ['decal-cable', 'decal-sign:SOC', 'decal-poster:SIEM', 'decal-vent', 'decal-status:noc'], tint: [0.94, 0.9, 1.16], floor: 'floor-grid', accent: [1.24, 0.58, 0.5] },
  // rust-amber plant (mid/late tier): ribbed + utility brick walls, CAUTION placards, worn concrete,
  // amber sodium-vapour fixtures
  industrial: { alts: ['wall-ribs', 'wall-brick2'], decals: ['decal-haz', 'decal-vent', 'decal-sign:SUB', 'decal-poster:LOCK', 'decal-status:industrial'], tint: [1.16, 0.95, 0.74], floor: 'floor-rust', accent: [1.22, 0.9, 0.52] },
  // red-lit secure enclave (late tier): AUTH placards, hazard warnings, red alert glow
  vault: { alts: ['wall-ribs'], decals: ['decal-haz', 'decal-sign:AUTH', 'decal-poster:LOCK', 'decal-vent', 'decal-status:vault'], tint: [1.2, 0.88, 0.9], floor: 'floor-grid', accent: [1.26, 0.56, 0.46] },
};

const THEME_NAMES = Object.keys(THEMES);

const MISSION_THEMES: Record<string, string> = {
  m01: 'office', m02: 'office', m03: 'bullpen', m04: 'bullpen',
  m05: 'datacenter', m06: 'vault', m07: 'industrial', m08: 'datacenter',
  m09: 'vault', m10: 'industrial', m11: 'noc', m12: 'noc',
};

/** Small deterministic string hash (FNV-1a) for seeds. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Resolve the look theme for a mission: an explicit MapDef.look.theme wins,
 * then the mission-id table, then a deterministic pick so unknown ids still
 * get a distinct identity. Mission files need no edits either way.
 */
export function lookTheme(missionId: string | undefined, themeName?: string): WallTheme {
  const name =
    themeName && THEMES[themeName]
      ? themeName
      : missionId && MISSION_THEMES[missionId]
        ? MISSION_THEMES[missionId]
        : THEME_NAMES[hashStr(missionId ?? 'office') % THEME_NAMES.length];
  return THEMES[name];
}
