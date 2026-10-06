/**
 * Tiny software "sprite modeller": monsters are built from shaded 3D
 * primitives (ellipsoids + boxes) and ray-cast orthographically into a pixel
 * canvas from any yaw. That gives every malware class true rotations, 16-tone
 * shading ramps per hue and consistent lighting, all procedurally, with no
 * external art. Output matches paintRaw() so packTexture() can outline it.
 */
export type V3 = [number, number, number];

export interface Prim {
  shape: 'ell' | 'box';
  /** centre in pixels: x right, y up from the feet, z toward the viewer at yaw 0 */
  c: V3;
  /** radii (ellipsoid) or half extents (box) */
  r: V3;
  yaw?: number;
  pitch?: number;
  roll?: number;
  col: string;
  glow?: boolean;
  /** surface pattern in local coords; return a colour to override `col` */
  decal?: (l: V3, n: V3) => string | null;
  /** decal pixels are fullbright */
  decalGlow?: boolean;
}

export interface RasterOpts {
  /** camera orbit around the model, radians (0 = front) */
  view: number;
  /** final colour mix toward `tint` by `tintT` (pain heat / quarantine green) */
  tint?: V3;
  tintT?: number;
}

const LX = -0.45 / Math.hypot(-0.45, 0.68, 0.6);
const LY = 0.68 / Math.hypot(-0.45, 0.68, 0.6);
const LZ = 0.6 / Math.hypot(-0.45, 0.68, 0.6);
const LIGHT: V3 = [LX, LY, LZ];

export function hex(c: string): V3 {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// local → view: Ry(yaw) · Rx(pitch) · Rz(roll)
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

/** 16-tone ramp: deep shadow → base → warm highlight. */
function ramp(base: V3, q: number): V3 {
  if (q <= 10) {
    const k = 0.1 + (0.9 * q) / 10;
    return [base[0] * k, base[1] * k, base[2] * k];
  }
  const t = ((q - 10) / 5) * 0.42;
  return [base[0] + (255 - base[0]) * t, base[1] + (248 - base[1]) * t, base[2] + (230 - base[2]) * t];
}

/** Rotation matrix of toLocal(): Rz(-roll) · Rx(-pitch) · Ry(-yaw). */
function localMatrix(yaw: number, pitch: number, roll: number): number[] {
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
  const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
  const cr = Math.cos(-roll), sr = Math.sin(-roll);
  // Ry: x' = c·x + s·z, z' = -s·x + c·z (matches toLocal)
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  // Rx
  const rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  // Rz
  const rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (a: number[], b: number[]): number[] => {
    const o = new Array<number>(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
      }
    }
    return o;
  };
  return mul(rz, mul(rx, ry));
}

interface Prep {
  shape: 'ell' | 'box';
  // inverse rotation matrix (view → local), row-major
  m0: number; m1: number; m2: number;
  m3: number; m4: number; m5: number;
  m6: number; m7: number; m8: number;
  cx: number; cy: number; cz: number;
  /** view ray dir (0,0,-1) rotated into local space */
  dx: number; dy: number; dz: number;
  rx: number; ry: number; rz: number;
  bound: number;
  /** clamped pixel-space AABB rows [y0,y1) and columns [x0,x1) */
  y0: number; y1: number; x0: number; x1: number;
  base: V3;
  glow: boolean;
  decal?: (l: V3, n: V3) => string | null;
  decalGlow?: boolean;
}

/** A resumable rasterization: `next` is the next row to render. */
export interface RasterJob {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  glow: Uint8ClampedArray;
  /** Next row to render; the job is done when next === h. */
  next: number;
  /** prim indices covering each row */
  rows: number[][];
  preps: Prep[];
  tint?: V3;
  tt: number;
}

export function createRasterJob(w: number, h: number, prims: Prim[], opts: RasterOpts): RasterJob {
  const rows: number[][] = Array.from({ length: h }, () => []);
  const preps: Prep[] = prims.map((p) => {
    const yaw = (p.yaw ?? 0) - opts.view;
    const pitch = p.pitch ?? 0;
    const roll = p.roll ?? 0;
    const c = toView(p.c, -opts.view, 0, 0);
    const m = localMatrix(yaw, pitch, roll);
    const d = toLocal([0, 0, -1], yaw, pitch, roll);
    const bound = p.shape === 'box' ? Math.hypot(p.r[0], p.r[1], p.r[2]) : Math.max(p.r[0], p.r[1], p.r[2]);
    return {
      shape: p.shape,
      m0: m[0], m1: m[1], m2: m[2], m3: m[3], m4: m[4], m5: m[5], m6: m[6], m7: m[7], m8: m[8],
      cx: c[0], cy: c[1], cz: c[2],
      dx: d[0], dy: d[1], dz: d[2],
      rx: p.r[0], ry: p.r[1], rz: p.r[2],
      bound,
      // X spans px - w/2 + 0.5 (px 0..w-1); Y spans h - py - 0.5 (py 0..h-1, flipped)
      x0: Math.max(0, Math.ceil(c[0] - bound + w / 2 - 0.5)),
      x1: Math.min(w, Math.floor(c[0] + bound + w / 2 - 0.5) + 1),
      y0: Math.max(0, Math.ceil(h - (c[1] + bound) - 0.5)),
      y1: Math.min(h, Math.floor(h - (c[1] - bound) - 0.5) + 1),
      base: hex(p.col),
      glow: p.glow ?? false,
      decal: p.decal,
      decalGlow: p.decalGlow,
    };
  });
  preps.forEach((p, i) => {
    for (let y = Math.max(0, p.y0); y < Math.min(h, p.y1); y++) rows[y].push(i);
  });
  return {
    w,
    h,
    rgba: new Uint8ClampedArray(w * h * 4),
    glow: new Uint8ClampedArray(w * h * 4),
    next: 0,
    rows,
    preps,
    tint: opts.tint,
    tt: opts.tintT ?? 0,
  };
}

/** Render pixel rows [y0, y1); updates job.next. Idempotent-safe: only forward progress. */
export function rasterizeRows(job: RasterJob, y0: number, y1: number): void {
  const { w, h, rgba, glow, preps, rows } = job;
  const tint = job.tint;
  const tt = job.tt;
  const yEnd = Math.min(y1, h);
  for (let py = Math.max(y0, job.next); py < yEnd; py++) {
    const Y = h - 1 - py + 0.5;
    const rowPrims = rows[py];
    for (let px = 0; px < w; px++) {
      const X = px - w / 2 + 0.5;
      let best = Infinity;
      let hit: Prep | null = null;
      // hit point in local coords + local-space normal (scalars: no per-pixel allocs)
      let hnx = 0, hny = 0, hnz = 1;
      let hlx = 0, hly = 0, hlz = 0;
      for (let qi = 0; qi < rowPrims.length; qi++) {
        const q = preps[rowPrims[qi]];
        if (px < q.x0 || px >= q.x1) continue;
        if (Math.abs(X - q.cx) > q.bound) continue;
        // origin in local space: M · (X-cx, Y-cy, 500-cz)
        const vx = X - q.cx, vy = Y - q.cy, vz = 500 - q.cz;
        const ox = q.m0 * vx + q.m1 * vy + q.m2 * vz;
        const oy = q.m3 * vx + q.m4 * vy + q.m5 * vz;
        const oz = q.m6 * vx + q.m7 * vy + q.m8 * vz;
        const dx = q.dx, dy = q.dy, dz = q.dz;
        const rx = q.rx, ry = q.ry, rz = q.rz;
        let t = Infinity;
        let nx = 0, ny = 0, nz = 1;
        if (q.shape === 'ell') {
          const ex = ox / rx, ey = oy / ry, ez = oz / rz;
          const ddx = dx / rx, ddy = dy / ry, ddz = dz / rz;
          const a = ddx * ddx + ddy * ddy + ddz * ddz;
          const b = 2 * (ex * ddx + ey * ddy + ez * ddz);
          const cc = ex * ex + ey * ey + ez * ez - 1;
          const disc = b * b - 4 * a * cc;
          if (disc < 0) continue;
          t = (-b - Math.sqrt(disc)) / (2 * a);
          const lx = ox + t * dx, ly = oy + t * dy, lz = oz + t * dz;
          nx = lx / (rx * rx); ny = ly / (ry * ry); nz = lz / (rz * rz);
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
        } else {
          let tmin = -Infinity, tmax = Infinity, axis = 0;
          let ok = true;
          // unrolled 3-axis slab test (same math as the original loop)
          {
            if (Math.abs(dx) < 1e-9) { if (Math.abs(ox) > rx) ok = false; }
            else {
              let t1 = (-rx - ox) / dx, t2 = (rx - ox) / dx;
              if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
              if (t1 > tmin) { tmin = t1; axis = 0; }
              tmax = Math.min(tmax, t2);
            }
          }
          if (ok) {
            if (Math.abs(dy) < 1e-9) { if (Math.abs(oy) > ry) ok = false; }
            else {
              let t1 = (-ry - oy) / dy, t2 = (ry - oy) / dy;
              if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
              if (t1 > tmin) { tmin = t1; axis = 1; }
              tmax = Math.min(tmax, t2);
            }
          }
          if (ok) {
            if (Math.abs(dz) < 1e-9) { if (Math.abs(oz) > rz) ok = false; }
            else {
              let t1 = (-rz - oz) / dz, t2 = (rz - oz) / dz;
              if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
              if (t1 > tmin) { tmin = t1; axis = 2; }
              tmax = Math.min(tmax, t2);
            }
          }
          if (!ok || tmin > tmax) continue;
          t = tmin;
          nx = 0; ny = 0; nz = 0;
          const s = (axis === 0 ? dx : axis === 1 ? dy : dz) > 0 ? -1 : 1;
          if (axis === 0) nx = s; else if (axis === 1) ny = s; else nz = s;
        }
        if (t < best) {
          best = t;
          hit = q;
          hnx = nx; hny = ny; hnz = nz;
          hlx = ox + t * dx; hly = oy + t * dy; hlz = oz + t * dz;
        }
      }
      if (!hit) continue;
      const i = (py * w + px) * 4;
      // normal → view space = transpose(M) · n (M is the inverse rotation)
      const nvx = hit.m0 * hnx + hit.m3 * hny + hit.m6 * hnz;
      const nvy = hit.m1 * hnx + hit.m4 * hny + hit.m7 * hnz;
      const nvz = hit.m2 * hnx + hit.m5 * hny + hit.m8 * hnz;
      const dec = hit.decal?.([hlx, hly, hlz], [hnx, hny, hnz]) ?? null;
      const base = dec !== null ? hex(dec) : hit.base;
      const isGlow = hit.glow || (dec !== null && hit.decalGlow);
      let r: number, gc: number, b: number;
      if (isGlow) {
        const k = 0.78 + 0.22 * Math.max(0, nvz);
        r = base[0] * k; gc = base[1] * k; b = base[2] * k;
        glow[i + 3] = 255;
      } else {
        const diff = Math.max(0, nvx * LIGHT[0] + nvy * LIGHT[1] + nvz * LIGHT[2]);
        const rim = Math.pow(1 - Math.abs(nvz), 3) * 0.18;
        const z = 500 - best;
        const depth = 0.8 + 0.2 * Math.max(0, Math.min(1, (z + 16) / 32));
        const grad = hit.shape === 'box' ? 0.1 * (hly / hit.ry) : 0;
        const I = (0.3 + 0.66 * diff + 0.12 * Math.max(0, nvy) + rim + grad) * depth;
        const q = Math.max(0, Math.min(15, Math.round((I / 1.1) * 15)));
        const col = ramp(base, q);
        r = col[0]; gc = col[1]; b = col[2];
      }
      if (tint && tt > 0) {
        r += (tint[0] - r) * tt;
        gc += (tint[1] - gc) * tt;
        b += (tint[2] - b) * tt;
      }
      rgba[i] = r;
      rgba[i + 1] = gc;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
    job.next = py + 1;
  }
}

export function rasterize(w: number, h: number, prims: Prim[], opts: RasterOpts): { rgba: Uint8ClampedArray; glow: Uint8ClampedArray } {
  const job = createRasterJob(w, h, prims, opts);
  rasterizeRows(job, 0, h);
  return { rgba: job.rgba, glow: job.glow };
}

/** Chain of ellipsoids from a to b: limbs, tails, shackles. */
export function limb(out: Prim[], a: V3, b: V3, rad: number, col: string, extra: Partial<Prim> = {}): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / (rad * 0.9)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push({
      shape: 'ell',
      c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
      r: [rad, rad, rad],
      col,
      ...extra,
    });
  }
}
