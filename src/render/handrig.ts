import type { Gender } from '../core/types';
import type { SkinTone } from '../tools/look';
import { ANALYSTS } from '../tools/look';
import { shade } from '../tools/pixel';
import { PartCache } from './hires';
import { limb, rasterize, type Prim, type V3 } from './model';
import { RES } from './res';

/**
 * HAND RIG: an articulated analyst hand built from the same shaded 3D
 * primitives as the monsters (src/render/model.ts). One skeleton — wrist,
 * palm, five fingers of three phalanges each (thumb CMC/MCP/IP) — posed by
 * joint angles, ray-cast to a pixel sprite and cached. Poses are authored in
 * bake pixels; every (pose, gender, skin) frame bakes once, lazily, so no
 * raymarch ever runs inside the frame loop.
 *
 * Anthropometrics (fractions of middle-finger length, after Drillis & Contini
 * / NASA-STD-3000 proportions):
 *   index .96, ring .95, pinky .79; phalanges proximal : middle : distal
 *   ≈ 1 : .62 : .45; palm length ≈ 1.1× middle finger; fingers taper ~15%.
 * Joint limits (deg): MCP flex -10..90, abduction ±15, PIP 0..110, DIP 0..80;
 * DIP couples to PIP at 2/3 unless a pose overrides it (Snell's rule).
 */

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

/** Joint angles in degrees for one finger (thumb reuses mcp/pip as MCP/IP). */
export interface Curl {
  /** spread sideways at the MCP joint */
  abd?: number;
  mcp: number;
  pip: number;
  /** defaults to 2/3 of pip */
  dip?: number;
}

/** A placed hand in a bake frame. Units are bake pixels; +y is up, +z toward the viewer. */
export interface Place {
  /** true = left hand (right hand is the default). */
  mirror?: boolean;
  /** wrist-centre position in bake px. */
  wrist: V3;
  /** palm orientation: Ry(yaw) · Rx(pitch) · Rz(roll), degrees. */
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** middle-finger length in bake px (drives every proportion). */
  size: number;
  fingers?: Partial<Record<FingerName, Curl>>;
  /**
   * Forearm from the wrist toward this bake-space point; the outer ~60%
   * becomes the jacket sleeve. Omit for a wrist that exits the frame.
   */
  arm?: V3;
  /** Extra thumb-only orientation: rotate the whole thumb chain this far toward the palm. */
  thumbTuck?: number;
}

export interface RigFrame {
  /** canvas size in base units (bakes at ×RES). */
  w: number;
  h: number;
  hands: Place[];
  /** perspective focal length in px (0 = orthographic). */
  persp?: number;
}

// —— anthropometric constants (fractions of middle-finger length) ————————————

export const FINGER_LEN: Record<Exclude<FingerName, 'thumb'>, number> = {
  index: 0.96,
  middle: 1.0,
  ring: 0.95,
  pinky: 0.79,
};
/** proximal : middle : distal ≈ 1 : .62 : .45, normalised. */
export const PHALANX = [1 / 2.07, 0.62 / 2.07, 0.45 / 2.07];
const PALM_LEN = 1.1;
/** metacarpal-base x offset as a fraction of palm width (right hand; thumb side −x). */
const MCP_X: Record<Exclude<FingerName, 'thumb'>, number> = {
  index: -0.32,
  middle: -0.11,
  ring: 0.11,
  pinky: 0.29,
};
/** thumb metacarpal base: [x×palmW, y×palmLen, z] — the thenar eminence. */
const THUMB_BASE: V3 = [-0.42, 0.34, 0.1];
const THUMB_LEN = 0.62;

export const JOINT_LIMITS = {
  mcp: [-10, 90],
  abd: [-15, 15],
  pip: [0, 110],
  dip: [0, 80],
  thumbMcp: [-10, 60],
  thumbIp: [-15, 80],
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Apply the joint limits + the 2/3 DIP coupling. Exported for tests. */
export function clampCurl(f: FingerName, c: Curl): Required<Curl> {
  const abd = clamp(c.abd ?? 0, JOINT_LIMITS.abd[0], JOINT_LIMITS.abd[1]);
  const isThumb = f === 'thumb';
  const mlim = isThumb ? JOINT_LIMITS.thumbMcp : JOINT_LIMITS.mcp;
  const mcp = clamp(c.mcp, mlim[0], mlim[1]);
  const plim = isThumb ? JOINT_LIMITS.thumbIp : JOINT_LIMITS.pip;
  const pip = clamp(c.pip, plim[0], plim[1]);
  const dip = clamp(c.dip ?? (pip * 2) / 3, JOINT_LIMITS.dip[0], JOINT_LIMITS.dip[1]);
  return { abd, mcp, pip, dip };
}

// —— small local rot helpers (degrees; match model.ts's Ry·Rx·Rz order) ——————

const D2R = Math.PI / 180;

function rotX(v: V3, deg: number): V3 {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rotY(v: V3, deg: number): V3 {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function rotZ(v: V3, deg: number): V3 {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}
/** Palm orientation applied to a hand-local point. */
function orient(v: V3, yaw: number, pitch: number, roll: number): V3 {
  return rotZ(rotX(rotY(v, yaw), pitch), roll);
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** World-space joints of one finger: [mcpBase, pip, dip, tip]. Exported for tests. */
export function fingerJoints(f: FingerName, c: Curl, size: number, mirror: boolean, palmW: number, palmL: number): V3[] {
  const cc = clampCurl(f, c);
  const mx = mirror ? -1 : 1;
  let base: V3;
  let len: number;
  if (f === 'thumb') {
    base = [THUMB_BASE[0] * palmW * mx, THUMB_BASE[1] * palmL, THUMB_BASE[2] * palmW];
    len = THUMB_LEN * size;
  } else {
    base = [MCP_X[f] * palmW * mx, palmL * 0.88, 0];
    len = FINGER_LEN[f] * size;
  }
  // direction of each phalanx: curl rotates about x toward the palm (-z);
  // abduction spreads about z in the palm plane
  const dir = (theta: number): V3 => {
    const d = rotX([0, 1, 0], -theta);
    return rotZ(d, cc.abd * mx);
  };
  const l1 = len * PHALANX[0], l2 = len * PHALANX[1], l3 = len * PHALANX[2];
  if (f === 'thumb') {
    // thumb: metacarpal points out/forward, MCP + IP flex draw it across the
    // object's near side (toward -x and slightly back toward the palm)
    const d0 = norm([-0.72 * mx, 0.18, 0.66]);
    const d1 = norm([d0[0] + (cc.mcp / 60) * 0.85 * mx, d0[1] - cc.mcp / 110, d0[2] - (cc.mcp / 60) * 0.3]);
    const d2 = norm([d1[0] + (cc.pip / 80) * 0.65 * mx, d1[1] - cc.pip / 120, d1[2] - (cc.pip / 80) * 0.35]);
    const p1 = add(base, mul(d0, l1));
    const p2 = add(p1, mul(d1, l2));
    const p3 = add(p2, mul(d2, l3));
    return [base, p1, p2, p3];
  }
  const p1 = add(base, mul(dir(cc.mcp), l1));
  const p2 = add(p1, mul(dir(cc.mcp + cc.pip), l2));
  const p3 = add(p2, mul(dir(cc.mcp + cc.pip + cc.dip), l3));
  return [base, p1, p2, p3];
}

export interface HandMeta {
  /** joints per finger in bake px (y up). */
  joints: Record<FingerName, V3[]>;
  palmW: number;
  palmL: number;
  size: number;
}

function skinRamp(tone: SkinTone): { hi: string; base: string; sh: string; deep: string } {
  return { hi: tone.highlight, base: tone.base, sh: tone.shadow, deep: shade(tone.shadow, 0.72) };
}

/**
 * Prims for one placed hand. `size` = middle-finger length in bake px;
 * all other proportions derive. Vega's hand is ~12% narrower and finer.
 */
export function handPrims(
  p: Place,
  spec: { gender: Gender; skin: SkinTone },
  meta?: HandMeta,
): Prim[] {
  const fem = spec.gender === 'female';
  const sk = skinRamp(spec.skin);
  const size = p.size;
  const palmW = size * (fem ? 0.84 : 0.95);
  const palmL = size * PALM_LEN;
  const palmT = size * (fem ? 0.24 : 0.3);
  const mx = p.mirror ? -1 : 1;
  const yaw = p.yaw ?? 0;
  const pitch = p.pitch ?? 0;
  const roll = p.roll ?? 0;
  const put = (v: V3): V3 => add(orient(v, yaw, pitch, roll), p.wrist);

  const out: Prim[] = [];
  const r0 = size * (fem ? 0.062 : 0.075);

  // palm: a rounded box + thenar (thumb-side) and hypothenar bulges
  const palmC = put([0, palmL * 0.46, 0]);
  out.push({
    shape: 'box',
    c: palmC,
    r: [palmW / 2, palmL * 0.48, palmT / 2],
    yaw: -yaw, pitch: -pitch, roll: -roll,
    col: sk.base,
  });
  const thenar = put([THUMB_BASE[0] * palmW * mx * 0.9, palmL * 0.22, palmT * 0.18]);
  out.push({ shape: 'ell', c: thenar, r: [palmW * 0.22, palmL * 0.3, palmT * 0.62], col: sk.base });
  const hypo = put([palmW * 0.36 * mx, palmL * 0.3, 0]);
  out.push({ shape: 'ell', c: hypo, r: [palmW * 0.18, palmL * 0.3, palmT * 0.5], col: sk.base });

  // tendons on the back of the hand: three faint ridges fanning to the knuckles
  for (const fx of [-0.2, 0.02, 0.22]) {
    const a = put([fx * palmW * mx, palmL * 0.32, palmT * 0.5]);
    const b = put([(fx * 1.6) * palmW * mx, palmL * 0.88, palmT * 0.52]);
    limb(out, a, b, size * 0.016, sk.sh);
  }

  // wrist + forearm
  const wristC = put([0, -size * 0.04, 0]);
  out.push({ shape: 'ell', c: wristC, r: [palmW * 0.42, size * 0.14, palmT * 0.55], col: sk.base });
  if (p.arm) {
    const to = p.arm;
    const dir = norm([to[0] - wristC[0], to[1] - wristC[1], to[2] - wristC[2]]);
    const len = Math.hypot(to[0] - wristC[0], to[1] - wristC[1], to[2] - wristC[2]);
    const skinEnd = add(wristC, mul(dir, len * 0.3));
    const jacket = ANALYSTS[spec.gender].jacket;
    // skin wrist, then sleeve widening toward the elbow
    limb(out, wristC, skinEnd, palmW * 0.38, sk.base);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = 0.28 + (i / n) * 0.72;
      const c = add(wristC, mul(dir, len * t));
      const r = palmW * (0.42 + t * 0.3);
      out.push({ shape: 'ell', c, r: [r, r * 0.95, r * 0.8], col: t < 0.42 ? shade(jacket, 1.15) : jacket });
    }
    // cuff: darker band + Ray's hi-vis stripe, Vega's smartwatch
    const cuffC = add(wristC, mul(dir, len * 0.3));
    const cr = palmW * 0.52;
    out.push({ shape: 'ell', c: cuffC, r: [cr, cr * 0.9, cr * 0.75], col: shade(jacket, 0.7) });
    if (spec.gender === 'male') {
      const st = add(wristC, mul(dir, len * 0.34));
      out.push({ shape: 'ell', c: st, r: [cr * 1.02, cr * 0.92, cr * 0.77], col: ANALYSTS.male.accent });
      const st2 = add(wristC, mul(dir, len * 0.37));
      out.push({ shape: 'ell', c: st2, r: [cr * 1.03, cr * 0.93, cr * 0.78], col: jacket });
    } else {
      // smartwatch: dark band + face + accent line
      const wc = add(wristC, mul(dir, len * 0.2));
      const wr = palmW * 0.46;
      out.push({ shape: 'ell', c: wc, r: [wr, wr * 0.9, wr * 0.7], col: '#14161c' });
      const wf = add(wc, mul(dir, len * 0.055));
      out.push({ shape: 'box', c: add(wf, [0, 0, wr * 0.5]), r: [size * 0.09, size * 0.11, size * 0.03], col: '#0b2a2a' });
      out.push({ shape: 'box', c: add(wf, [size * 0.03, 0, wr * 0.56]), r: [size * 0.015, size * 0.07, size * 0.02], col: ANALYSTS.female.accent, glow: true });
    }
  }

  // fingers
  const fingers: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];
  const nail = fem ? '#c83a6a' : shade(sk.hi, 1.04);
  const joints: Record<FingerName, V3[]> = {} as Record<FingerName, V3[]>;
  for (const f of fingers) {
    const curl = clampCurl(f, p.fingers?.[f] ?? defaultCurl(f));
    const jp = fingerJoints(f, curl, size, !!p.mirror, palmW, palmL);
    // hand-local → bake space
    const wj = jp.map(put);
    joints[f] = wj;
    const fr = f === 'thumb' ? r0 * 1.25 : r0;
    const radii = [fr, fr * 0.93, fr * 0.85];
    for (let s = 0; s < 3; s++) {
      limb(out, wj[s], wj[s + 1], radii[s], sk.base);
      // knuckle bump + dorsal crease shadow
      if (s < 2) out.push({ shape: 'ell', c: wj[s + 1], r: [radii[s] * 1.06, radii[s] * 1.06, radii[s] * 1.06], col: sk.base });
    }
    // nail: small flattened box on the distal phalanx dorsal face
    const tipDir = norm([wj[3][0] - wj[2][0], wj[3][1] - wj[2][1], wj[3][2] - wj[2][2]]);
    const dorsal = put2Dorsal(put, f === 'thumb' ? [0, 0.3, 1] : [0, -0.15, 1]);
    const nailC = add(add(wj[3], mul(tipDir, -size * 0.045)), mul(dorsal, radii[2] * 0.55));
    out.push({
      shape: 'box',
      c: nailC,
      r: [radii[2] * 0.55, radii[2] * 0.42, radii[2] * 0.16],
      col: nail,
    });
  }
  if (meta) {
    meta.joints = joints;
    meta.palmW = palmW;
    meta.palmL = palmL;
    meta.size = size;
  }
  return out;
}

/** World-space joints per finger for a placed hand (same math as handPrims). */
export function handJoints(p: Place, spec: { gender: Gender; skin: SkinTone }): Record<FingerName, V3[]> {
  const fem = spec.gender === 'female';
  const palmW = p.size * (fem ? 0.84 : 0.95);
  const palmL = p.size * PALM_LEN;
  const yaw = p.yaw ?? 0;
  const pitch = p.pitch ?? 0;
  const roll = p.roll ?? 0;
  const put = (v: V3): V3 => add(orient(v, yaw, pitch, roll), p.wrist);
  const joints = {} as Record<FingerName, V3[]>;
  for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as FingerName[]) {
    const curl = clampCurl(f, p.fingers?.[f] ?? defaultCurl(f));
    joints[f] = fingerJoints(f, curl, p.size, !!p.mirror, palmW, palmL).map(put);
  }
  return joints;
}

/** Approx dorsal direction: rotate a small normal-ish vector by the palm orient only. */
function put2Dorsal(put: (v: V3) => V3, local: V3): V3 {
  // put() applies orient+translate; subtract the translate to get the direction
  const a = put(local);
  const o = put([0, 0, 0]);
  return norm([a[0] - o[0], a[1] - o[1], a[2] - o[2]]);
}

/** Neutral relaxed curl per finger — a loose resting hand. */
export function defaultCurl(f: FingerName): Curl {
  switch (f) {
    case 'thumb': return { abd: 8, mcp: 18, pip: 20 };
    case 'index': return { abd: 6, mcp: 42, pip: 46 };
    case 'middle': return { abd: 0, mcp: 48, pip: 50 };
    case 'ring': return { abd: -6, mcp: 54, pip: 56 };
    case 'pinky': return { abd: -12, mcp: 62, pip: 64 };
  }
}

// —— bake cache ————————————————————————————————————————————————————————————

export interface HandSprite {
  c: HTMLCanvasElement;
  /** first / last opaque row, native px. */
  top: number;
  bot: number;
}

const bakes = new PartCache<HandSprite>(384);
let bakeMsTotal = 0;
let bakeCount = 0;

/**
 * Bake a rig frame (one or two hands, authored in base units where +y is up
 * from the canvas bottom) to a native-res canvas. Deterministic per id —
 * callers key it by (tool, pose, gender, skin).
 */
export function bakeRig(id: string, frame: RigFrame, spec: { gender: Gender; skin: SkinTone }): HandSprite {
  const key = `${id}|${spec.gender}|${spec.skin.id}`;
  return bakes.get(key, () => {
    const t0 = performance.now();
    const W = Math.round(frame.w * RES);
    const H = Math.round(frame.h * RES);
    const prims: Prim[] = [];
    // raster x is centered on the frame, y is from the bottom
    const cx = (frame.w / 2) * RES;
    for (const p of frame.hands) {
      const q: Place = {
        ...p,
        wrist: [p.wrist[0] * RES - cx, p.wrist[1] * RES, p.wrist[2] * RES],
        size: p.size * RES,
        arm: p.arm ? [p.arm[0] * RES - cx, p.arm[1] * RES, p.arm[2] * RES] : undefined,
      };
      prims.push(...handPrims(q, spec));
    }
    const { rgba } = rasterize(W, H, prims, { view: 0, persp: frame.persp ?? 0 });
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    img.data.set(rgba);
    g.putImageData(img, 0, 0);
    bakeMsTotal += performance.now() - t0;
    bakeCount++;
    let top = H;
    let bot = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (rgba[(y * W + x) * 4 + 3] > 0) {
          if (y < top) top = y;
          if (y > bot) bot = y;
        }
      }
    }
    return { c, top, bot: bot + 1 };
  });
}

/** Bake-time telemetry for the round report. */
export function bakeStats(): { frames: number; ms: number } {
  return { frames: bakeCount, ms: Math.round(bakeMsTotal * 10) / 10 };
}
