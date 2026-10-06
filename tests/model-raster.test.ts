import { describe, expect, it } from 'vitest';
import { createRasterJob, rasterize, rasterizeRows, type Prim, type RasterOpts, type V3 } from '../src/render/model';
import { scaleModel, spriteModels } from '../src/render/sprites';
import { TEX } from '../src/render/res';

/**
 * Pins the optimized rasterizer to the pre-optimization implementation.
 * `legacyRasterize` below is the exact row-major per-pixel code that shipped
 * before the perf pass — the optimized path must match it within float
 * reordering tolerance (<=0.1% of pixels, each channel <=2 apart).
 */

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const LIGHT: V3 = norm([-0.45, 0.68, 0.6]);
function hex(c: string): V3 {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function toView(v: V3, yaw: number, pitch: number, roll: number): V3 {
  let [x, y, z] = v;
  let c = Math.cos(roll), s = Math.sin(roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(pitch); s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(yaw); s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}
function toLocal(v: V3, yaw: number, pitch: number, roll: number): V3 {
  let [x, y, z] = v;
  let c = Math.cos(-yaw), s = Math.sin(-yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(-pitch); s = Math.sin(-pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(-roll); s = Math.sin(-roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
interface Prepared {
  p: Prim;
  c: V3;
  yaw: number;
  pitch: number;
  roll: number;
  d: V3;
  bound: number;
}
function ramp(base: V3, q: number): V3 {
  if (q <= 10) {
    const k = 0.1 + (0.9 * q) / 10;
    return [base[0] * k, base[1] * k, base[2] * k];
  }
  const t = ((q - 10) / 5) * 0.42;
  return [base[0] + (255 - base[0]) * t, base[1] + (248 - base[1]) * t, base[2] + (230 - base[2]) * t];
}
function legacyRasterize(w: number, h: number, prims: Prim[], opts: RasterOpts): { rgba: Uint8ClampedArray; glow: Uint8ClampedArray } {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8ClampedArray(w * h * 4);
  const prep: Prepared[] = prims.map((p) => {
    const yaw = (p.yaw ?? 0) - opts.view;
    const pitch = p.pitch ?? 0;
    const roll = p.roll ?? 0;
    const c = toView(p.c, -opts.view, 0, 0);
    const d = toLocal([0, 0, -1], yaw, pitch, roll);
    const bound = p.shape === 'box' ? Math.hypot(p.r[0], p.r[1], p.r[2]) : Math.max(p.r[0], p.r[1], p.r[2]);
    return { p, c, yaw, pitch, roll, d, bound };
  });
  const tint = opts.tint;
  const tt = opts.tintT ?? 0;
  for (let py = 0; py < h; py++) {
    const Y = h - 1 - py + 0.5;
    for (let px = 0; px < w; px++) {
      const X = px - w / 2 + 0.5;
      let best = Infinity;
      let hit: Prepared | null = null;
      let hn: V3 = [0, 0, 1];
      let hl: V3 = [0, 0, 0];
      for (const q of prep) {
        if (Math.abs(X - q.c[0]) > q.bound || Math.abs(Y - q.c[1]) > q.bound) continue;
        const o = toLocal([X - q.c[0], Y - q.c[1], 500 - q.c[2]], q.yaw, q.pitch, q.roll);
        const d = q.d;
        const r = q.p.r;
        let t = Infinity;
        let n: V3 = [0, 0, 1];
        if (q.p.shape === 'ell') {
          const ox = o[0] / r[0], oy = o[1] / r[1], oz = o[2] / r[2];
          const dx = d[0] / r[0], dy = d[1] / r[1], dz = d[2] / r[2];
          const a = dx * dx + dy * dy + dz * dz;
          const b = 2 * (ox * dx + oy * dy + oz * dz);
          const cc = ox * ox + oy * oy + oz * oz - 1;
          const disc = b * b - 4 * a * cc;
          if (disc < 0) continue;
          t = (-b - Math.sqrt(disc)) / (2 * a);
          const lx = o[0] + t * d[0], ly = o[1] + t * d[1], lz = o[2] + t * d[2];
          n = norm([lx / (r[0] * r[0]), ly / (r[1] * r[1]), lz / (r[2] * r[2])]);
        } else {
          let tmin = -Infinity, tmax = Infinity, axis = 0;
          let ok = true;
          for (let k = 0; k < 3; k++) {
            if (Math.abs(d[k]) < 1e-9) {
              if (Math.abs(o[k]) > r[k]) { ok = false; break; }
              continue;
            }
            let t1 = (-r[k] - o[k]) / d[k];
            let t2 = (r[k] - o[k]) / d[k];
            if (t1 > t2) [t1, t2] = [t2, t1];
            if (t1 > tmin) { tmin = t1; axis = k; }
            tmax = Math.min(tmax, t2);
          }
          if (!ok || tmin > tmax) continue;
          t = tmin;
          n = [0, 0, 0];
          n[axis] = d[axis] > 0 ? -1 : 1;
        }
        if (t < best) {
          best = t;
          hit = q;
          hn = n;
          hl = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
        }
      }
      if (!hit) continue;
      const i = (py * w + px) * 4;
      const nv = toView(hn, hit.yaw, hit.pitch, hit.roll);
      const dec = hit.p.decal?.(hl, hn) ?? null;
      const base = hex(dec ?? hit.p.col);
      const isGlow = hit.p.glow || (dec !== null && hit.p.decalGlow);
      let col: V3;
      if (isGlow) {
        const k = 0.78 + 0.22 * Math.max(0, nv[2]);
        col = [base[0] * k, base[1] * k, base[2] * k];
        glow[i + 3] = 255;
      } else {
        const diff = Math.max(0, nv[0] * LIGHT[0] + nv[1] * LIGHT[1] + nv[2] * LIGHT[2]);
        const rim = Math.pow(1 - Math.abs(nv[2]), 3) * 0.18;
        const z = 500 - best;
        const depth = 0.8 + 0.2 * Math.max(0, Math.min(1, (z + 16) / 32));
        const grad = hit.p.shape === 'box' ? 0.1 * (hl[1] / hit.p.r[1]) : 0;
        const I = (0.3 + 0.66 * diff + 0.12 * Math.max(0, nv[1]) + rim + grad) * depth;
        const q = Math.max(0, Math.min(15, Math.round((I / 1.1) * 15)));
        col = ramp(base, q);
      }
      if (tint && tt > 0) col = [col[0] + (tint[0] - col[0]) * tt, col[1] + (tint[1] - col[1]) * tt, col[2] + (tint[2] - col[2]) * tt];
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = 255;
    }
  }
  return { rgba, glow };
}

interface Case {
  name: string;
  prims: Prim[];
  opts: RasterOpts;
}

const W = TEX.monster;
const H = TEX.monster;

/** Representative real models at production resolution. */
const cases: Case[] = [
  { name: 'worm walk2 view2', prims: scaleModel(spriteModels.worm({ kind: 'walk', k: 2 })), opts: { view: Math.PI / 2 } },
  { name: 'trojan attack1 view3', prims: scaleModel(spriteModels.trojan({ kind: 'attack', k: 1 })), opts: { view: (3 * Math.PI) / 4 } },
  { name: 'ransom pain view0 tinted', prims: scaleModel(spriteModels.ransom({ kind: 'pain' })), opts: { view: 0, tint: [255, 120, 80], tintT: 0.2 } },
  {
    name: 'hand-built: ell+box, yaw/pitch/roll, decal+glow, tint',
    prims: [
      { shape: 'ell', c: [0, 30, 0], r: [18, 14, 12], yaw: 0.4, pitch: 0.2, roll: -0.3, col: '#c84040' },
      { shape: 'box', c: [-20, 12, 6], r: [10, 8, 8], yaw: 0.9, pitch: 0.1, roll: 0.5, col: '#4060c0', glow: false },
      {
        shape: 'ell', c: [16, 40, -4], r: [12, 12, 12], yaw: -0.7, pitch: 0.4, roll: 0.2, col: '#40a040', glow: true,
        decal: (l) => (l[1] > 2 ? '#fff020' : null), decalGlow: true,
      },
      { shape: 'box', c: [0, 4, 0], r: [30, 3, 18], col: '#505860' },
    ],
    opts: { view: 0.9, tint: [44, 255, 90], tintT: 0.3 },
  },
];

function diffStats(a: Uint8ClampedArray, b: Uint8ClampedArray): { pixels: number; worst: number } {
  let pixels = 0;
  let worst = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
      Math.abs(a[i + 3] - b[i + 3]),
    );
    if (d > 0) pixels++;
    worst = Math.max(worst, d);
  }
  return { pixels, worst };
}

describe('rasterize parity with the pre-optimization implementation', () => {
  for (const c of cases) {
    it(`${c.name}: output matches within float-reorder tolerance`, () => {
      const expected = legacyRasterize(W, H, c.prims, c.opts);
      const actual = rasterize(W, H, c.prims, c.opts);
      for (const [label, e, a] of [
        ['rgba', expected.rgba, actual.rgba],
        ['glow', expected.glow, actual.glow],
      ] as const) {
        const { pixels, worst } = diffStats(e, a);
        expect(pixels, `${c.name} ${label}: ${pixels}/${W * H} pixels differ`).toBeLessThanOrEqual(Math.ceil(W * H * 0.001));
        expect(worst, `${c.name} ${label}: worst channel diff ${worst}`).toBeLessThanOrEqual(2);
      }
    });
  }

  it('incremental rasterizeRows produces identical output to one-shot rasterize', () => {
    const c = cases[3];
    const expected = rasterize(W, H, c.prims, c.opts);
    const job = createRasterJob(W, H, c.prims, c.opts);
    while (job.next < H) rasterizeRows(job, job.next, Math.min(H, job.next + 7));
    const { pixels, worst } = diffStats(expected.rgba, job.rgba);
    expect(pixels).toBe(0);
    expect(worst).toBe(0);
    expect(diffStats(expected.glow, job.glow).pixels).toBe(0);
  });
});
