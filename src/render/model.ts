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

const LIGHT: V3 = norm([-0.45, 0.68, 0.6]);

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

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

interface Prepared {
  p: Prim;
  c: V3;
  yaw: number;
  pitch: number;
  roll: number;
  d: V3;
  bound: number;
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

export function rasterize(w: number, h: number, prims: Prim[], opts: RasterOpts): { rgba: Uint8ClampedArray; glow: Uint8ClampedArray } {
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
