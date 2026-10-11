import * as THREE from 'three';
import type { Gender } from '../../core/types';
import type { SkinTone } from '../../tools/look';
import { ANALYSTS } from '../../tools/look';
import { shade } from '../../tools/pixel';
import {
  clampCurl, defaultCurl, FINGER_LEN, JOINT_LIMITS, MCP_X, PALM_LEN,
  PHALANX, THUMB_BASE, THUMB_LEN,
  type Curl, type FingerName,
} from '../handrig';
import { thumbGeom } from '../handmesh';

/**
 * LIVE HAND (vm3d): the handrig skeleton and anthropometrics as a persistent
 * Object3D joint hierarchy — wrist → palm → MCP/PIP/DIP (CMC/MCP/IP on the
 * thumb) — re-posed from joint angles EVERY frame, never baked. Joint limits
 * and the 2/3 DIP coupling come straight from handrig.clampCurl so tests can
 * verify limits on the same numbers the renderer uses.
 *
 * Scene units are metres: `size` is the middle-finger length (~0.09 m).
 * Hand-local axes match the rig: +y along the fingers, -z out of the palm,
 * +z the dorsal (nail) side; mx=-1 mirrors the right-hand layout for lefts.
 */

const D2R = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function std(col: string, rough = 0.6): THREE.MeshStandardMaterial {
  const key = `${col}/${rough}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: Math.max(rough, 0.78), metalness: 0, side: THREE.DoubleSide });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

function ellipsoid(c: [number, number, number], r: [number, number, number], col: string): THREE.Mesh {
  const m = new THREE.Mesh(geo('sph', () => new THREE.SphereGeometry(1, 12, 9)), std(col));
  m.position.set(c[0], c[1], c[2]);
  m.scale.set(r[0], r[1], r[2]);
  return m;
}

/**
 * Rounded-trapezoid palm slab: a rounded-rect outline (wider at the MCP
 * line, tapering toward the wrist) extruded through the palm thickness with
 * a bevel, so the hand reads as a slab with a dorsal side and a palm side —
 * not a blob. Palm-local: +y toward the fingers, +z dorsal, x across.
 */
function palmSlabGeo(w: number, l: number, t: number): THREE.BufferGeometry {
  const topW = w * 0.47;       // half-width at the MCP line
  const botW = w * 0.34;       // half-width at the wrist
  const r = w * 0.085;
  const s = new THREE.Shape();
  s.moveTo(-botW + r, 0);
  s.lineTo(botW - r, 0);
  s.quadraticCurveTo(botW, 0, botW, r);
  s.lineTo(topW, l - r * 1.7);
  s.quadraticCurveTo(topW, l - r * 0.15, topW - r * 1.5, l);
  s.lineTo(-topW + r * 1.5, l);
  s.quadraticCurveTo(-topW, l - r * 0.15, -topW, l - r * 1.7);
  s.lineTo(-botW, r);
  s.quadraticCurveTo(-botW, 0, -botW + r, 0);
  const depth = Math.max(0.002, t - r * 1.6);
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: r * 0.8, bevelSize: r * 0.72,
    bevelSegments: 3, curveSegments: 10, steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/**
 * Phalanx segment along +y, joint at y=0. Lathe profile thicker near both
 * ends (condyles) and slimmer mid-shaft — reads as a finger, not a tube.
 * r0 = radius at this joint, r1 = radius at the next joint.
 */
function phalanxGeo(len: number, r0: number, r1: number): THREE.BufferGeometry {
  const key = `ph:${len.toFixed(4)}:${r0.toFixed(4)}:${r1.toFixed(4)}`;
  return geo(key, () => {
    const pts: THREE.Vector2[] = [];
    const prof: [number, number][] = [
      [0.55, 0.0], [0.98, 0.05], [1.0, 0.18], [0.9, 0.5],
      [0.86, 0.78], [0.94, 0.94], [0.6, 1.0], [0.15, 1.01],
    ];
    for (const [rf, ty] of prof) {
      pts.push(new THREE.Vector2(Math.max(0.0008, (r0 + (r1 - r0) * ty) * rf), ty * len));
    }
    const g = new THREE.LatheGeometry(pts, 10);
    g.computeVertexNormals();
    return g;
  });
}

/** Unit-length lathe tube (tapered, rounded ends) along +y; caller scales y. */
function unitTube(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, -0.55)];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = 0.75 + (1.0 - 0.75) * t;
    pts.push(new THREE.Vector2(Math.max(0.001, r - 0.25 * Math.cos((t - 0.5) * Math.PI)), t * 1.1 - 0.55));
  }
  pts.push(new THREE.Vector2(0.001, 0.55));
  return geo('unitTube', () => new THREE.LatheGeometry(pts, 10));
}

export interface HandSpec {
  gender: Gender;
  skin: SkinTone;
}

interface Seg { joint: THREE.Group; child: THREE.Group }
interface Chain { base: THREE.Group; segs: Seg[]; tip: THREE.Object3D }

export const HAND_FINGERS: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];

export class LiveHand {
  /** wrist frame: position = wrist centre, quaternion = palm orientation. */
  readonly group = new THREE.Group();
  /** L hands are a true mirror of R geometry (scale.x = -1) so the thumb
   *  lands on the correct side with consistent curl chirality. */
  private readonly core = new THREE.Group();
  readonly palm = new THREE.Group();
  readonly side: 'L' | 'R';
  readonly size: number;
  readonly palmW: number;
  readonly palmL: number;
  private readonly mx: number;
  private readonly spec: HandSpec;
  private readonly chains = {} as Record<FingerName, Chain>;
  private readonly curls = {} as Record<FingerName, Required<Curl>>;
  thumbOut = 1;
  private readonly lens = {} as Record<FingerName, number[]>;
  /** nail darkening per gender (fem: painted). */
  private readonly nailCol: string;
  private readonly skinCol: string;
  private readonly creaseCol: string;

  constructor(side: 'L' | 'R', spec: HandSpec, size?: number) {
    this.side = side;
    this.spec = spec;
    this.mx = 1; // geometry is always built right-handed; L mirrors via `core`
    this.core.scale.x = side === 'L' ? -1 : 1;
    const fem = spec.gender === 'female';
    this.size = size ?? (fem ? 0.082 : 0.09);
    this.palmW = this.size * (fem ? 0.84 : 0.95);
    this.palmL = this.size * PALM_LEN;
    this.skinCol = spec.skin.base;
    this.creaseCol = shade(spec.skin.shadow, 0.8);
    this.nailCol = fem ? '#c83a6a' : shade(spec.skin.highlight, 0.98);
    this.group.add(this.core);
    this.core.add(this.palm);
    this.buildPalm();
    for (const f of HAND_FINGERS) {
      this.curls[f] = clampCurl(f, defaultCurl(f));
      this.chains[f] = this.buildFinger(f);
    }
  }

  private buildPalm(): void {
    const { palmW, palmL, mx } = this;
    const fem = this.spec.gender === 'female';
    const palmT = this.size * (fem ? 0.26 : 0.32);
    const skin = this.skinCol;
    // the slab itself: rounded trapezoid, dorsal dome slightly fuller than the palm side
    const slab = new THREE.Mesh(palmSlabGeo(palmW * 0.96, palmL * 0.97, palmT), std(skin, 0.84));
    this.palm.add(slab);
    // dorsal dome: a shallow swell over the back so the top surface catches the key light
    this.palm.add(ellipsoid([0, palmL * 0.5, palmT * 0.3], [palmW * 0.4, palmL * 0.36, palmT * 0.2], shade(skin, 1.04)));
    // palm-side hollow pads: heel pads frame a shallow centre
    this.palm.add(ellipsoid([palmW * 0.2 * mx, palmL * 0.5, -palmT * 0.28], [palmW * 0.24, palmL * 0.3, palmT * 0.16], shade(skin, 0.97)));
    // thenar mass (thumb side, lower radial) — big, merges into the thumb root
    this.palm.add(ellipsoid(
      [THUMB_BASE[0] * palmW * mx, palmL * 0.26, palmT * 0.05],
      [palmW * 0.21, palmL * 0.3, palmT * 0.56], shade(skin, 1.02)));
    // hypothenar mass (ulnar edge, smaller)
    this.palm.add(ellipsoid([palmW * 0.36 * mx, palmL * 0.28, -palmT * 0.02], [palmW * 0.15, palmL * 0.26, palmT * 0.5], skin));
    // knuckle line bulge along the MCP edge on the dorsal side
    this.palm.add(ellipsoid([0, palmL * 0.92, palmT * 0.22], [palmW * 0.42, palmL * 0.1, palmT * 0.34], skin));
    // wrist: tapers narrower and thinner than the palm
    this.palm.add(ellipsoid([0, -this.size * 0.03, 0], [palmW * 0.33, this.size * 0.15, palmT * 0.42], skin));
    this.palm.add(ellipsoid([0, -this.size * 0.12, 0], [palmW * 0.3, this.size * 0.12, palmT * 0.38], shade(skin, 0.99)));
    // interdigital webs: thin skin filling the gaps between finger roots
    const webX = [-0.215, 0, 0.2]; // between index/middle, middle/ring, ring/pinky
    for (const wx of webX) {
      this.palm.add(ellipsoid([wx * palmW * mx, palmL * 0.95, -palmT * 0.1],
        [palmW * 0.09, palmL * 0.12, palmT * 0.34], skin));
    }
  }

  private buildFinger(f: FingerName): Chain {
    const fem = this.spec.gender === 'female';
    const size = this.size;
    const isThumb = f === 'thumb';
    const len = (isThumb ? THUMB_LEN : FINGER_LEN[f as keyof typeof FINGER_LEN]) * size;
    const ls = [len * PHALANX[0], len * PHALANX[1], len * PHALANX[2]];
    this.lens[f] = ls;
    const r0 = Math.max(0.0036, size * (fem ? 0.062 : 0.075)); // slimmer on the female hand
    const fr = isThumb ? r0 * 1.24 : r0;
    // proximal > middle > distal, tip narrows fastest
    const radii = [fr, fr * 0.9, fr * 0.8, fr * 0.55];
    const base = new THREE.Group();
    const chain: Chain = { base, segs: [], tip: new THREE.Object3D() };
    let parent = base;
    for (let s = 0; s < 3; s++) {
      const joint = new THREE.Group();
      joint.add(new THREE.Mesh(phalanxGeo(ls[s], radii[s], radii[s + 1]), std(this.skinCol, 0.8)));
      const child = new THREE.Group();
      child.position.y = ls[s];
      if (s < 2) {
        // knuckle: flattened bump on the dorsal side only
        child.add(ellipsoid([0, radii[s + 1] * 0.1, radii[s + 1] * 0.45],
          [radii[s + 1] * 1.15, radii[s + 1] * 0.62, radii[s + 1] * 0.55], this.skinCol));
        // flexion crease tucked under the joint on the palm side
        child.add(ellipsoid([0, radii[s + 1] * 0.08, -radii[s + 1] * 0.6],
          [radii[s + 1] * 0.6, radii[s + 1] * 0.14, radii[s + 1] * 0.42], this.creaseCol));
      }
      joint.add(child);
      parent.add(joint);
      chain.segs.push({ joint, child });
      parent = child;
    }
    chain.tip.position.y = 0;
    chain.segs[2].child.add(chain.tip);
    // nail: flat plate on the distal dorsal side
    const nail = ellipsoid([0, ls[2] * 0.6, radii[3] * 0.62],
      [radii[3] * 0.8, radii[3] * 0.55, radii[3] * 0.2], this.nailCol);
    nail.material = std(this.nailCol, 0.45);
    chain.segs[2].joint.add(nail);
    this.palm.add(base);
    return chain;
  }

  /** Apply joint angles for one finger (clamped + DIP coupling). */
  setCurl(f: FingerName, c: Curl): Required<Curl> {
    const cc = clampCurl(f, c);
    this.curls[f] = cc;
    const ch = this.chains[f];
    if (f === 'thumb') {
      const tg = thumbGeom(
        { wrist: [0, 0, 0], size: this.size, mirror: false, thumbOut: this.thumbOut },
        this.palmW, this.palmL, this.mx, cc.mcp, cc.pip,
      );
      ch.base.position.set(tg.base[0], tg.base[1], tg.base[2]);
      const qs = [
        new THREE.Quaternion().setFromUnitVectors(Y_AXIS, tg.d0),
        new THREE.Quaternion().setFromUnitVectors(tg.d0, tg.d1),
        new THREE.Quaternion().setFromUnitVectors(tg.d1, tg.d2),
      ];
      for (let s = 0; s < 3; s++) ch.segs[s].joint.quaternion.copy(qs[s]);
      return cc;
    }
    const base = this.fingerBase(f);
    ch.base.position.set(base[0], base[1], base[2]);
    const abdQ = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, cc.abd * this.mx * D2R);
    const fq = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -cc.mcp * D2R);
    ch.segs[0].joint.quaternion.copy(abdQ.multiply(fq));
    ch.segs[1].joint.quaternion.setFromAxisAngle(X_AXIS, -cc.pip * D2R);
    ch.segs[2].joint.quaternion.setFromAxisAngle(X_AXIS, -cc.dip * D2R);
    return cc;
  }

  /**
   * MCP (knuckle) line: arched — middle sits highest, pinky lowest, and the
   * outer fingers wrap a little toward the palm side; roots sink into the
   * slab so no gap shows between finger and palm.
   */
  private fingerBase(f: Exclude<FingerName, 'thumb'>): [number, number, number] {
    const x = MCP_X[f] * this.palmW * this.mx;
    const archY = { index: -0.003, middle: 0, ring: -0.004, pinky: -0.012 }[f];
    const wrap = -Math.abs(MCP_X[f]) * this.palmW * 0.05; // slight curl toward -z at the edges
    return [x, this.palmL * 0.93 + archY, wrap];
  }

  /** Apply a full per-finger curl set (missing fingers keep their angles). */
  setCurls(curls: Partial<Record<FingerName, Curl>>): void {
    for (const f of HAND_FINGERS) this.setCurl(f, { ...this.curls[f], ...curls[f] });
  }

  getCurl(f: FingerName): Required<Curl> {
    return this.curls[f];
  }

  /** Fingertip world position (updates matrices on demand). */
  tipWorld(f: FingerName, out = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.chains[f].tip.getWorldPosition(out);
  }

  /** All joint positions of finger f in world space: [base, j1, j2, tip]. */
  fingerJointsWorld(f: FingerName): THREE.Vector3[] {
    const ch = this.chains[f];
    this.group.updateWorldMatrix(true, true);
    const pts = [ch.base, ch.segs[0].child, ch.segs[1].child, ch.segs[2].child];
    return pts.map((p) => p.getWorldPosition(new THREE.Vector3()));
  }

  /**
   * Numeric damped-IK: pull finger f's tip to `target`. Non-thumb fingers get
   * three dof (mcp/pip/abd — dip rides the coupling); the thumb gets mcp/pip.
   * ≤ 24 iterations, ≤ 2 mm residual for reachable targets — the contact-test
   * budget. Returns the final tip→target distance in metres.
   */
  ikTo(f: FingerName, target: THREE.Vector3, weight = 1): number {
    const lim = f === 'thumb'
      ? { mcp: JOINT_LIMITS.thumbMcp, pip: JOINT_LIMITS.thumbIp, abd: [0, 0] as [number, number] }
      : { mcp: JOINT_LIMITS.mcp, pip: JOINT_LIMITS.pip, abd: JOINT_LIMITS.abd };
    const params = (f === 'thumb' ? ['mcp', 'pip'] : ['mcp', 'pip', 'abd']) as ('mcp' | 'pip' | 'abd')[];
    const lims: Record<string, readonly [number, number]> = { mcp: lim.mcp, pip: lim.pip, abd: lim.abd };
    const n = params.length;
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    const err = new THREE.Vector3();
    const jac = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const h = 0.5; // degrees for the finite difference
    const read = () => ({ mcp: this.curls[f].mcp, pip: this.curls[f].pip, abd: this.curls[f].abd ?? 0 });
    for (let iter = 0; iter < 24; iter++) {
      const c0 = read();
      this.tipWorld(f, base);
      err.copy(target).sub(base);
      if (err.length() <= 0.0015) return err.length();
      for (let i = 0; i < n; i++) {
        const c = { ...c0 };
        c[params[i]] += h;
        this.setCurl(f, c);
        this.tipWorld(f, tip);
        jac[i].copy(tip).sub(base).divideScalar(h);
      }
      this.setCurl(f, c0);
      // damped least squares via the normal equations (≤3×3)
      const A: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const b: number[] = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) A[i][j] = jac[i].dot(jac[j]);
        b[i] = jac[i].dot(err);
      }
      const lam = Math.max(1e-9, (A[0][0] + A[1][1] + A[2][2]) * 1e-3);
      for (let i = 0; i < n; i++) A[i][i] += lam;
      const dx = solve3(A, b);
      const c = { ...c0 };
      for (let i = 0; i < n; i++) {
        c[params[i]] = clampN(c0[params[i]] + clampN(dx[i] * weight, -40, 40), lims[params[i]][0], lims[params[i]][1]);
      }
      this.setCurl(f, c);
    }
    this.tipWorld(f, tip);
    return tip.distanceTo(target);
  }

  /** Reset the chain to a relaxed curl (used on clip/blend resets). */
  relax(): void {
    for (const f of HAND_FINGERS) this.setCurl(f, defaultCurl(f));
  }
}

const _tv = new THREE.Vector3();
const _tv2 = new THREE.Vector3();
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Gaussian-elimination solve of a ≤3×3 system (normal equations for the IK). */
function solve3(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c] || 1e-12;
    for (let j = c; j <= n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let j = c; j <= n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row[n]);
}

/**
 * Two-bone arm: shoulder anchor (off-screen) → elbow → wrist, solved
 * analytically with a preferred pole direction (elbows sag down/out).
 * The sleeve jacket tube runs shoulder→wrist with a skin stub at the wrist.
 */
export class LiveArm {
  readonly group = new THREE.Group();
  private readonly upper = new THREE.Mesh(unitTube(), std('#000'));
  private readonly fore = new THREE.Mesh(unitTube(), std('#000'));
  private readonly cuff = new THREE.Mesh(geo('sph', () => new THREE.SphereGeometry(1, 12, 9)), std('#000'));
  private readonly skinStub = new THREE.Mesh(unitTube(), std('#000'));
  private readonly shoulder = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly l1: number;
  private readonly l2: number;
  private readonly rw: number;

  constructor(side: 'L' | 'R', spec: HandSpec, palmW: number) {
    const jacket = ANALYSTS[spec.gender].jacket;
    this.upper.material = std(jacket, 0.75);
    this.fore.material = std(jacket, 0.75);
    this.cuff.material = std(shade(jacket, 0.7), 0.8);
    this.skinStub.material = std(spec.skin.base);
    const s = side === 'L' ? -1 : 1;
    this.shoulder.set(0.34 * s, -0.42, -0.28);
    this.pole.set(0.7 * s, -0.55, -0.45).normalize();
    this.l1 = 0.24;
    this.l2 = 0.24;
    this.rw = palmW * 0.5;
    this.group.add(this.upper, this.fore, this.cuff, this.skinStub);
  }

  /** Re-pose the arm so the forearm ends at `wrist` (world space). */
  update(wrist: THREE.Vector3): void {
    const S = this.shoulder;
    const d = Math.min(S.distanceTo(wrist), this.l1 + this.l2 - 1e-4);
    const dir = _tv.copy(wrist).sub(S).divideScalar(Math.max(1e-6, S.distanceTo(wrist)));
    const a = (this.l1 * this.l1 - this.l2 * this.l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.l1 * this.l1 - a * a));
    const pole = _tv2.copy(this.pole).addScaledVector(dir, -this.pole.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    this.layTube(this.upper, S, elbow, this.rw * 1.5);
    this.layTube(this.fore, elbow, wrist, this.rw * 1.12);
    // cuff just short of the wrist + skin stub into the palm
    const skinEnd = wrist.clone().addScaledVector(dir, -this.rw * 1.6);
    this.layTube(this.skinStub, skinEnd, wrist, this.rw * 0.82);
    this.cuff.position.copy(skinEnd);
    this.cuff.scale.setScalar(this.rw * 1.15);
  }

  private layTube(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const len = Math.max(1e-4, a.distanceTo(b));
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(Y_AXIS, _tv.copy(b).sub(a).divideScalar(len));
    m.scale.set(r, len, r);
  }
}
