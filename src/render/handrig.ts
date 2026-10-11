import type { Gender } from '../core/types';
import type { SkinTone } from '../tools/look';
import { ANALYSTS } from '../tools/look';
import { shade } from '../tools/pixel';
import { PartCache } from './hires';
import { bakeHands } from './handmesh';
import { rasterize, type Prim, type V3 } from './model';
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

/**
 * Joint angles in degrees for one finger. For the thumb the fields carry the
 * spec's four DOFs: `abd` = cmcAbd (palmar abduction 0..60),
 * `cmcFlex` = opposition sweep across the palm (0..45), `mcp`, `pip` = IP.
 */
export interface Curl {
  /** spread sideways at the MCP joint (thumb: palmar abduction) */
  abd?: number;
  /** thumb only: opposition sweep across the palm (0..45) */
  cmcFlex?: number;
  mcp: number;
  pip: number;
  /** defaults to 2/3 of pip (spec: use 0.4·pip for a finger touching a surface) */
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

// —— anthropometric constants (fractions of middle-finger length M) —————————
// Spec §3 proportions, per analyst.

export interface HandProp {
  fingerLen: Record<Exclude<FingerName, 'thumb'>, number>;
  /** proximal : middle : distal, normalised. */
  phalanx: [number, number, number];
  /** wrist crease → MCP row, ×M. */
  palmL: number;
  /** palm width at the MCP row, ×M. */
  palmW: number;
  /** palm thickness, ×M. */
  palmT: number;
  /** proximal phalanx diameter ×M, per finger. */
  diam: Record<Exclude<FingerName, 'thumb'>, number>;
  /** thumb diameter ×M. */
  thumbD: number;
  /** distal⌀ / proximal⌀. */
  taper: number;
  /** fingertip cap radius as a fraction of distal diameter. */
  tipCap: number;
  /** MCP knuckle bump: radius ×prox⌀, lift above dorsum ×r. */
  knuckle: { r: number; lift: number };
  /** PIP bump radius ×local⌀ (shown when pip ≥ 30). */
  pipBump: number;
  /** nail size in 1× px at L=190: [w,h] fingers, [w,h] pinky. */
  nail: { w: number; h: number; pw: number; ph: number };
  /** wrist diameter ×M. */
  wristD: number;
}

export const PROP: Record<Gender, HandProp> = {
  male: {
    fingerLen: { index: 0.95, middle: 1.0, ring: 0.96, pinky: 0.78 },
    phalanx: [1 / 2.06, 0.62 / 2.06, 0.44 / 2.06],
    palmL: 1.05,
    palmW: 0.88,
    palmT: 0.30,
    diam: { index: 0.21, middle: 0.21, ring: 0.19, pinky: 0.17 },
    thumbD: 0.26,
    taper: 0.78,
    tipCap: 0.85,
    knuckle: { r: 0.62, lift: 0.25 },
    pipBump: 0.56,
    nail: { w: 2, h: 3, pw: 2, ph: 2 },
    wristD: 0.62,
  },
  female: {
    fingerLen: { index: 0.96, middle: 1.0, ring: 0.95, pinky: 0.76 },
    phalanx: [1 / 2.08, 0.63 / 2.08, 0.45 / 2.08],
    palmL: 1.0,
    palmW: 0.76,
    palmT: 0.24,
    diam: { index: 0.17, middle: 0.17, ring: 0.16, pinky: 0.14 },
    thumbD: 0.21,
    taper: 0.72,
    tipCap: 1.0,
    knuckle: { r: 0.45, lift: 0.15 },
    pipBump: 0.48,
    nail: { w: 2, h: 4, pw: 2, ph: 2 },
    wristD: 0.52,
  },
};

/** Back-compat constants (male values). */
export const FINGER_LEN = PROP.male.fingerLen;
export const PHALANX = PROP.male.phalanx;
export const PALM_LEN = PROP.male.palmL;

/** metacarpal-base x offset as a fraction of palm width (right hand; thumb side −x). */
export const MCP_X: Record<Exclude<FingerName, 'thumb'>, number> = {
  index: -0.32,
  middle: -0.11,
  ring: 0.11,
  pinky: 0.29,
};
/** thumb metacarpal base: [x×palmW, y×palmLen, z] — the thenar eminence. */
export const THUMB_BASE: V3 = [-0.32, 0.16, 0.1];
export const THUMB_LEN = 0.62;

/**
 * `Place.size` is the middle-finger length M for the MALE hand; the female
 * hand is scaled so both reach the spec's wrist→tip length L at the same
 * anchor (male L = 2.05·M, female = 2.00·M).
 */
export function sizeForGender(size: number, gender: Gender): number {
  return size * ((1 + PROP.male.palmL) / (1 + PROP[gender].palmL));
}

export const JOINT_LIMITS = {
  mcp: [-10, 90],
  abd: [-15, 15],
  pip: [0, 110],
  dip: [0, 80],
  thumbAbd: [0, 60],
  thumbFlex: [0, 45],
  thumbMcp: [-10, 60],
  thumbIp: [-15, 80],
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Apply the joint limits + the 2/3 DIP coupling. Exported for tests. */
export function clampCurl(f: FingerName, c: Curl): Required<Curl> {
  const isThumb = f === 'thumb';
  const alim = isThumb ? JOINT_LIMITS.thumbAbd : JOINT_LIMITS.abd;
  const abd = clamp(c.abd ?? 0, alim[0], alim[1]);
  const cmcFlex = clamp(c.cmcFlex ?? 0, JOINT_LIMITS.thumbFlex[0], JOINT_LIMITS.thumbFlex[1]);
  const mlim = isThumb ? JOINT_LIMITS.thumbMcp : JOINT_LIMITS.mcp;
  const mcp = clamp(c.mcp, mlim[0], mlim[1]);
  const plim = isThumb ? JOINT_LIMITS.thumbIp : JOINT_LIMITS.pip;
  const pip = clamp(c.pip, plim[0], plim[1]);
  const dip = clamp(c.dip ?? (pip * 2) / 3, JOINT_LIMITS.dip[0], JOINT_LIMITS.dip[1]);
  return { abd, cmcFlex, mcp, pip, dip };
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

/**
 * Densely-overlapped tapered ellipsoid chain: spheres step at ~0.4×radius so
 * the segment reads as ONE smooth form (no beading) and tapers r0 → r1.
 */
function capsule(out: Prim[], a: V3, b: V3, r0: number, r1: number, col: string): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / (Math.min(r0, r1) * 0.38)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const r = r0 + (r1 - r0) * t;
    out.push({
      shape: 'ell',
      c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
      r: [r, r, r * 0.94],
      col,
    });
  }
}

/**
 * Shared thumb-chain math (spec: cmcAbd palmar abduction 0..60, cmcFlex
 * opposition 0..45, mcp, ip). At cmcAbd 0 the metacarpal hugs the radial
 * palm edge alongside the index; abduction lifts it toward the viewer (+z)
 * and drops it; opposition sweeps it across the palm centre (+x for the
 * right hand). mcp/ip flex draws the chain back toward the palm.
 */
export function thumbChain(palmW: number, palmL: number, mx: number, cc: Required<Curl>): { base: V3; d0: V3; d1: V3; d2: V3 } {
  const a = cc.abd / 60; // palmar abduction 0..1
  const f = cc.cmcFlex / 45; // opposition 0..1
  const base: V3 = [THUMB_BASE[0] * palmW * mx, THUMB_BASE[1] * palmL, THUMB_BASE[2] * palmW];
  const d0 = norm([
    -0.30 * mx + f * 0.45 * mx,
    0.34 - 0.62 * a - 0.22 * f,
    0.08 + 0.30 * a + 0.15 * f,
  ]);
  const d1 = norm([d0[0] + (cc.mcp / 60) * 1.35 * mx, d0[1] - cc.mcp / 70, d0[2] - (cc.mcp / 60) * 0.4]);
  const d2 = norm([d1[0] + (cc.pip / 80) * 0.85 * mx, d1[1] - cc.pip / 100, d1[2] - (cc.pip / 80) * 0.35]);
  return { base, d0, d1, d2 };
}

/** World-space joints of one finger: [mcpBase, pip, dip, tip]. Exported for tests. */
export function fingerJoints(f: FingerName, c: Curl, size: number, mirror: boolean, prop: HandProp): V3[] {
  const cc = clampCurl(f, c);
  const mx = mirror ? -1 : 1;
  const palmW = size * prop.palmW;
  const palmL = size * prop.palmL;
  let base: V3;
  let len: number;
  if (f === 'thumb') {
    const tg = thumbChain(palmW, palmL, mx, cc);
    const ls = [THUMB_LEN * size * prop.phalanx[0], THUMB_LEN * size * prop.phalanx[1], THUMB_LEN * size * prop.phalanx[2]];
    const p1 = add(tg.base, mul(tg.d0, ls[0]));
    const p2 = add(p1, mul(tg.d1, ls[1]));
    const p3 = add(p2, mul(tg.d2, ls[2]));
    return [tg.base, p1, p2, p3];
  }
  base = [MCP_X[f] * palmW * mx, palmL * 0.88, 0];
  len = prop.fingerLen[f] * size;
  // direction of each phalanx: curl rotates about x toward the palm (-z);
  // abduction spreads about z in the palm plane
  const dir = (theta: number): V3 => {
    const d = rotX([0, 1, 0], -theta);
    return rotZ(d, cc.abd * mx);
  };
  const l1 = len * prop.phalanx[0], l2 = len * prop.phalanx[1], l3 = len * prop.phalanx[2];
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
  const prop = PROP[spec.gender];
  const sk = skinRamp(spec.skin);
  const size = sizeForGender(p.size, spec.gender);
  const palmW = size * prop.palmW;
  const palmL = size * prop.palmL;
  const palmT = size * prop.palmT;
  const mx = p.mirror ? -1 : 1;
  const yaw = p.yaw ?? 0;
  const pitch = p.pitch ?? 0;
  const roll = p.roll ?? 0;
  const put = (v: V3): V3 => add(orient(v, yaw, pitch, roll), p.wrist);

  const out: Prim[] = [];

  // palm: ONE solid volume — a rounded slab plus thenar/hypothenar bulges and
  // a continuous knuckle ridge the fingers grow out of
  const palmC = put([0, palmL * 0.44, 0]);
  out.push({
    shape: 'box',
    c: palmC,
    r: [palmW / 2, palmL * 0.46, palmT / 2],
    yaw: -yaw, pitch: -pitch, roll: -roll,
    col: sk.base,
  });
  const thenar = put([THUMB_BASE[0] * palmW * mx * 0.9, palmL * 0.22, palmT * 0.18]);
  out.push({ shape: 'ell', c: thenar, r: [palmW * 0.24, palmL * 0.3, palmT * 0.62], col: sk.base });
  const hypo = put([palmW * 0.36 * mx, palmL * 0.3, 0]);
  out.push({ shape: 'ell', c: hypo, r: [palmW * 0.2, palmL * 0.3, palmT * 0.52], col: sk.base });
  // knuckle ridge: fills the gaps between the metacarpal bases so the fingers
  // don't look like separate pegs stuck on the palm edge
  out.push({
    shape: 'ell',
    c: put([0, palmL * 0.84, 0]),
    r: [palmW * 0.44, palmL * 0.14, palmT * 0.52],
    col: sk.base,
  });
  out.push({
    shape: 'ell',
    c: put([0, palmL * 0.86, palmT * 0.14]),
    r: [palmW * 0.4, palmL * 0.1, palmT * 0.44],
    col: shade(sk.base, 1.08),
  });

  // wrist + forearm
  const wristC = put([0, -size * 0.04, 0]);
  out.push({ shape: 'ell', c: wristC, r: [palmW * 0.42, size * 0.14, palmT * 0.55], col: sk.base });
  if (p.arm) {
    const to = p.arm;
    const dir = norm([to[0] - wristC[0], to[1] - wristC[1], to[2] - wristC[2]]);
    const len = Math.hypot(to[0] - wristC[0], to[1] - wristC[1], to[2] - wristC[2]);
    const skinEnd = add(wristC, mul(dir, len * 0.3));
    const jacket = ANALYSTS[spec.gender].jacket;
    // skin wrist, then ONE smooth tapered sleeve toward the elbow
    capsule(out, wristC, skinEnd, palmW * 0.42, palmW * 0.38, sk.base);
    capsule(out, skinEnd, to, palmW * 0.5, palmW * 0.74, jacket);
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
    const jp = fingerJoints(f, curl, size, !!p.mirror, prop);
    // hand-local → bake space
    const wj = jp.map(put);
    joints[f] = wj;
    const fd = f === 'thumb' ? prop.thumbD : prop.diam[f as keyof typeof prop.diam];
    const fr = Math.max(1.7, (size * fd) / 2);
    const t3 = Math.pow(prop.taper, 1 / 3);
    const radii = [fr, fr * t3, fr * t3 * t3, fr * prop.taper * prop.tipCap];
    for (let s = 0; s < 3; s++) {
      capsule(out, wj[s], wj[s + 1], radii[s], radii[s + 1], sk.base);
      // knuckle bump where two phalanges meet
      if (s < 2) out.push({ shape: 'ell', c: wj[s + 1], r: [radii[s] * 1.05, radii[s] * 1.05, radii[s] * 1.05], col: sk.base });
    }
    // nail: small flattened box on the distal phalanx dorsal face
    const tipDir = norm([wj[3][0] - wj[2][0], wj[3][1] - wj[2][1], wj[3][2] - wj[2][2]]);
    const dorsal = put2Dorsal(put, f === 'thumb' ? [0, 0.3, 1] : [0, -0.15, 1]);
    const nailC = add(add(wj[3], mul(tipDir, -size * 0.045)), mul(dorsal, radii[3] * 0.55));
    out.push({
      shape: 'box',
      c: nailC,
      r: [radii[3] * 0.55, radii[3] * 0.42, Math.max(0.9, radii[3] * 0.2)],
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
  const prop = PROP[spec.gender];
  const size = sizeForGender(p.size, spec.gender);
  const yaw = p.yaw ?? 0;
  const pitch = p.pitch ?? 0;
  const roll = p.roll ?? 0;
  const put = (v: V3): V3 => add(orient(v, yaw, pitch, roll), p.wrist);
  const joints = {} as Record<FingerName, V3[]>;
  for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as FingerName[]) {
    const curl = clampCurl(f, p.fingers?.[f] ?? defaultCurl(f));
    joints[f] = fingerJoints(f, curl, size, !!p.mirror, prop).map(put);
  }
  return joints;
}

// —— pose blending (spec §5.3) ————————————————————————————————————————————

/** Partial hand deltas applied on top of a rest pose (angles are targets). */
export interface HandDelta {
  wrist?: V3; /** additive offset in bake px */
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** multiply `size` (anticipation/recession scale moves). */
  sizeMul?: number;
  fingers?: Partial<Record<FingerName, Partial<Curl>>>;
}

/** Blend one Place toward a delta: scalars move by u, curls lerp to targets. */
export function blendPlace(p: Place, d: HandDelta, u: number): Place {
  const q: Place = { ...p, wrist: [...p.wrist] as V3, fingers: { ...p.fingers } };
  if (d.wrist) q.wrist = [q.wrist[0] + d.wrist[0] * u, q.wrist[1] + d.wrist[1] * u, q.wrist[2] + d.wrist[2] * u];
  if (d.yaw) q.yaw = (q.yaw ?? 0) + d.yaw * u;
  if (d.pitch) q.pitch = (q.pitch ?? 0) + d.pitch * u;
  if (d.roll) q.roll = (q.roll ?? 0) + d.roll * u;
  if (d.sizeMul) q.size = q.size * (1 + (d.sizeMul - 1) * u);
  if (d.fingers) {
    for (const [f, t] of Object.entries(d.fingers) as [FingerName, Partial<Curl>][]) {
      const base = q.fingers?.[f] ?? defaultCurl(f);
      const c: Curl = { ...base };
      for (const k of ['abd', 'cmcFlex', 'mcp', 'pip', 'dip'] as const) {
        if (t[k] !== undefined) c[k] = (base[k] ?? (k === 'dip' ? (base.pip * 2) / 3 : 0)) + (t[k]! - (base[k] ?? (k === 'dip' ? (base.pip * 2) / 3 : 0))) * u;
      }
      q.fingers![f] = c;
    }
  }
  return q;
}

/** Blend a whole frame: per-hand deltas applied at blend factor u. */
export function blendFrame(frame: RigFrame, deltas: (HandDelta | undefined)[], u: number): RigFrame {
  return {
    ...frame,
    hands: frame.hands.map((h, i) => (deltas[i] ? blendPlace(h, deltas[i]!, u) : h)),
  };
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
    case 'thumb': return { abd: 30, cmcFlex: 10, mcp: 8, pip: 12 };
    case 'index': return { abd: 6, mcp: 26, pip: 30, dip: 12 };
    case 'middle': return { abd: 0, mcp: 30, pip: 34, dip: 14 };
    case 'ring': return { abd: -6, mcp: 38, pip: 44, dip: 18 };
    case 'pinky': return { abd: -12, mcp: 46, pip: 52, dip: 22 };
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
    // Mesh path (browser): real toon-shaded meshes baked to pixels.
    // Node/test fallback: the prim raster still exercises the same rig math.
    let rgba: Uint8ClampedArray | Uint8Array;
    let meshResult: ReturnType<typeof bakeHands> = null;
    try {
      meshResult = bakeHands(
        W, H,
        frame.hands.map((p) => ({
          ...p,
          wrist: [p.wrist[0] * RES - cx, p.wrist[1] * RES, p.wrist[2] * RES],
          size: p.size * RES,
          arm: p.arm ? [p.arm[0] * RES - cx, p.arm[1] * RES, p.arm[2] * RES] : undefined,
        })),
        spec,
        frame.persp ?? 0,
      );
    } catch {
      meshResult = null;
    }
    if (meshResult) {
      ({ rgba } = meshResult);
    } else {
      ({ rgba } = rasterize(W, H, prims, { view: 0, persp: frame.persp ?? 0 }));
    }
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
