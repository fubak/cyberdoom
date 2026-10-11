import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Gender } from '../../core/types';
import type { SkinTone } from '../../tools/look';
import { ANALYSTS } from '../../tools/look';
import { shade } from '../../tools/pixel';
import {
  clampCurl, defaultCurl, JOINT_LIMITS, PALM_LEN,
  type Curl, type FingerName,
} from '../handrig';

/**
 * LIVE HAND (vm3d): the MIT generic WebXR hand meshes
 * (@webxr-input-profiles/assets, left.glb / right.glb) driven by the same
 * curl solver the old procedural mesh used. Bone map (25 joints):
 *   wrist → <f>-finger-metacarpal → phalanx-proximal → -intermediate
 *         → -distal → -tip        (thumb: metacarpal/proximal/distal/tip)
 * MCP → phalanx-proximal, PIP → phalanx-intermediate, DIP → phalanx-distal,
 * abduction twists phalanx-proximal around its own axis; the thumb maps
 * CMC/MCP/IP onto metacarpal/proximal/distal.
 *
 * The glb is re-framed at load so the hand-local axes match the rig's
 * convention: wrist at the origin, +y along the fingers, −z the palm side,
 * +z dorsal, −x the thumb side for a right hand. Flexion axes are found
 * empirically from the bind pose: rotating joint J around
 * normalize(d × palmIn) — d = direction to the next bone — carries the
 * child toward the palm; the palm-in normal itself is picked by trying a
 * +40° index flexion with each candidate and keeping the sign that moves
 * the tip closer to the palm centre.
 *
 * Units are metres; `size` is the middle-finger length (~0.09 m).
 */

const D2R = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface HandSpec {
  gender: Gender;
  skin: SkinTone;
}

export const HAND_FINGERS: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];

/** glb joint names for a finger: [flex joints..., tip]. */
const FINGER_BONES: Record<FingerName, { flex: string[]; tip: string }> = {
  index: { flex: ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal'], tip: 'index-finger-tip' },
  middle: { flex: ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal'], tip: 'middle-finger-tip' },
  ring: { flex: ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal'], tip: 'ring-finger-tip' },
  pinky: { flex: ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal'], tip: 'pinky-finger-tip' },
  thumb: { flex: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal'], tip: 'thumb-tip' },
};

/* ------------------------------------------------------------------ */
/* Asset loading: both glbs must arrive before LiveHand can be built.   */
/* ------------------------------------------------------------------ */

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';
let loadState: LoadState = 'idle';
const sources: Partial<Record<'L' | 'R', THREE.Object3D>> = {};

export function handAssetsReady(): boolean {
  return !!sources.L && !!sources.R;
}
export function handAssetsFailed(): boolean {
  return loadState === 'failed';
}

/** Start fetching both glbs (idempotent). Failures warn once and fall back
 *  to the sprite viewmodel permanently — never throw. */
export function ensureHandAssets(): void {
  if (loadState !== 'idle') return;
  loadState = 'loading';
  const loader = new GLTFLoader();
  const base = import.meta.env?.BASE_URL ?? '/';
  const one = (side: 'L' | 'R', file: string) =>
    new Promise<void>((resolve, reject) => {
      loader.load(`${base}models/hands/${file}`, (g) => {
        sources[side] = g.scene;
        resolve();
      }, undefined, reject);
    });
  Promise.all([one('L', 'left.glb'), one('R', 'right.glb')])
    .then(() => { loadState = 'ready'; })
    .catch((e) => {
      loadState = 'failed';
      console.warn('[vm3d] hand model load failed; using sprite viewmodel', e);
    });
}

/** Test hook: inject a parsed glb scene directly (Node has no fetch path). */
export function setHandAsset(side: 'L' | 'R', scene: THREE.Object3D): void {
  sources[side] = scene;
  if (sources.L && sources.R) loadState = 'ready';
}

/* ------------------------------------------------------------------ */

interface Joint {
  bone: THREE.Bone;
  /** bind-pose local rotation. */
  q0: THREE.Quaternion;
  /** flexion axis in bone-local space (+ = toward the palm). */
  flexAxis: THREE.Vector3;
  /** abduction/twist axis in bone-local space + sign for +abd → spread. */
  abdAxis: THREE.Vector3;
  abdSign: number;
}

interface Chain {
  /** [MCP-ish, PIP-ish, DIP-ish] joints. */
  joints: Joint[];
  tip: THREE.Bone;
}

const _v2 = new THREE.Vector3();

export class LiveHand {
  /** wrist frame: position = wrist centre, quaternion = palm orientation. */
  readonly group = new THREE.Group();
  readonly side: 'L' | 'R';
  readonly size: number;
  readonly palmW: number;
  readonly palmL: number;
  /** determinant of the wrist-frame basis — +1 for a proper rotation. */
  readonly frameDet: number;
  private readonly spec: HandSpec;
  private readonly chains = {} as Record<FingerName, Chain>;
  private readonly curls = {} as Record<FingerName, Required<Curl>>;
  /** extra CMC rotation pulling the thumb across the palm (deg at thumbOut=0). */
  thumbOut = 1;
  private readonly thumbTuckAxis: THREE.Vector3;
  private readonly thumbOutAxis: THREE.Vector3;
  private readonly thumbOutSign: number;
  private readonly wristBone: THREE.Bone;

  constructor(side: 'L' | 'R', spec: HandSpec, size?: number) {
    const src = sources[side];
    if (!src) throw new Error('vm3d: hand glb not loaded (call ensureHandAssets first)');
    this.side = side;
    this.spec = spec;
    const fem = spec.gender === 'female';
    this.size = size ?? (fem ? 0.082 : 0.09);
    this.palmW = this.size * (fem ? 0.84 : 0.95);
    this.palmL = this.size * PALM_LEN;

    // ---- clone + index the skeleton ----
    const inner = skClone(src) as THREE.Group;
    inner.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    inner.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone); });
    const wrist = bones.get('wrist');
    if (!wrist) throw new Error('vm3d: glb missing wrist bone');
    this.wristBone = wrist;

    // The glb skeleton is FLAT — every bone is a sibling under Armature, so
    // rotating a joint moves nothing. Rebuild the real chain hierarchy with
    // attach() (preserves each bone's bind world transform):
    //   wrist → metacarpal → proximal → intermediate → distal → tip
    for (const f of HAND_FINGERS) {
      const names = FINGER_BONES[f];
      let parent: THREE.Object3D = wrist;
      for (const n of [...names.flex, names.tip]) {
        const b = bones.get(n);
        if (!b) throw new Error(`vm3d: glb missing bone ${n}`);
        parent.attach(b);
        parent = b;
      }
    }
    inner.updateMatrixWorld(true);

    const pos = (n: string) => {
      const b = bones.get(n);
      if (!b) throw new Error(`vm3d: glb missing bone ${n}`);
      return b.getWorldPosition(new THREE.Vector3());
    };
    const midProx = pos('middle-finger-phalanx-proximal');
    const midInter = pos('middle-finger-phalanx-intermediate');
    const wristPos = wrist.getWorldPosition(new THREE.Vector3());

    // ---- reframe: wrist → origin, fingers → +y, index side → −x ----
    const fy = midInter.clone().sub(midProx).normalize();           // along fingers
    const sxRaw = pos('index-finger-metacarpal').sub(pos('pinky-finger-metacarpal')); // thumb→pinky
    const sx = sxRaw.clone().addScaledVector(fy, -sxRaw.dot(fy)).normalize();
    const y = fy.clone();
    const x = sx.clone().negate();                                   // −x = thumb side (right-hand conv)
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    // rows of the world→local rotation
    const R = new THREE.Matrix4().makeBasis(x, y, z).invert();
    const Rinv = new THREE.Matrix4().copy(R).invert();               // local → clone-world
    // R maps world→frame-local: local = R * (p - wristPos)
    const toLocal = (p: THREE.Vector3) => p.clone().sub(wristPos).applyMatrix4(R);
    const toWorldDir = (vLocal: THREE.Vector3) => vLocal.clone().applyMatrix4(Rinv).normalize();

    // ---- bind quaternions (needed before any bone-local conversion) ----
    const bindQuat = new Map<string, THREE.Quaternion>();
    for (const [n, b] of bones) bindQuat.set(n, b.getWorldQuaternion(new THREE.Quaternion()));
    const toBoneLocal = (boneName: string, vLocal: THREE.Vector3) => {
      // world(axis) = Rinv·vLocal ; boneLocal = bindWorldQuat⁻¹·world
      const world = vLocal.clone().applyMatrix4(Rinv);
      return world.applyQuaternion(bindQuat.get(boneName)!.clone().invert()).normalize();
    };

    // ---- palm-in normal (local): the sign that curls toward the palm ----
    const mcpCentre = () => ['index', 'middle', 'ring', 'pinky']
      .map((f) => toLocal(pos(`${f}-finger-metacarpal`)))
      .reduce((a, p) => a.add(p), new THREE.Vector3())
      .divideScalar(4).add(new THREE.Vector3(0, -this.size * 0.45, 0));
    let palmCentre = mcpCentre();
    // candidates are ±z in FRAME-LOCAL space (palm in = −z by convention);
    // the empirical probe picks the sign that actually bends toward the palm
    let palmIn = this.pickPalmIn(bones, pos, toLocal, toBoneLocal, new THREE.Vector3(0, 0, -1), palmCentre);
    // Chirality: the frame must be a proper rotation with palm-in at −z.
    // For a mirrored (left) glb, x = −sx can leave the palm on +z, which
    // corrupts every bone-local conversion. Flip x so the thumb side reads
    // +x on L (−x on R) and palm-in returns to −z for both hands.
    if (palmIn.z > 0) {
      x.negate();
      z.crossVectors(x, y).normalize();
      R.makeBasis(x, y, z).invert();
      Rinv.copy(R).invert();
      palmCentre = mcpCentre();
      palmIn = this.pickPalmIn(bones, pos, toLocal, toBoneLocal, new THREE.Vector3(0, 0, -1), palmCentre);
    }
    this.frameDet = new THREE.Vector3().crossVectors(x, y).dot(z);

    // ---- per-joint flexion axes (bone-local) ----
    const childOf = new Map<string, string>();
    for (const f of HAND_FINGERS) {
      const names = FINGER_BONES[f];
      const seq = [...names.flex, names.tip];
      for (let i = 0; i + 1 < seq.length; i++) childOf.set(seq[i], seq[i + 1]);
    }
    const flexLocal = (jn: string): THREE.Vector3 => {
      const d = toLocal(pos(childOf.get(jn)!)).sub(toLocal(pos(jn))).normalize();
      return new THREE.Vector3().copy(d).cross(palmIn).normalize();
    };

    for (const f of HAND_FINGERS) {
      const names = FINGER_BONES[f];
      const joints: Joint[] = names.flex.map((jn) => {
        const bone = bones.get(jn)!;
        const dL = toLocal(pos(childOf.get(jn)!)).sub(toLocal(pos(jn))).normalize();
        // abduction twists about the bone axis; sign picks +abd = spread
        const abdAxis = dL.clone();
        return {
          bone,
          q0: bone.quaternion.clone(),
          flexAxis: toBoneLocal(jn, flexLocal(jn)),
          abdAxis: toBoneLocal(jn, abdAxis),
          abdSign: 1,
        };
      });
      this.chains[f] = { joints, tip: bones.get(names.tip)! };
    }

    // abduction sign: +abd should move the tip away from the middle finger
    for (const f of ['index', 'ring', 'pinky', 'middle'] as const) {
      const j = this.chains[f].joints[0];
      const s_i = toLocal(pos(`${f}-finger-metacarpal`)).sub(toLocal(pos('middle-finger-metacarpal')));
      s_i.y = 0;
      if (s_i.lengthSq() < 1e-8) s_i.set(f === 'middle' ? -1 : 0, 0, 0);
      s_i.normalize();
      j.abdSign = this.abdSignFor(j, this.chains[f].tip, s_i, toWorldDir);
    }

    // thumb: CMC gets an extra "tuck" axis (toward the palm centre) plus an
    // out axis (thumbOut: 1 = extended sideways, 0 = wrapped around a grip)
    const tMeta = this.chains.thumb.joints[0];
    const tMetaPos = toLocal(pos('thumb-metacarpal'));
    const tChild = toLocal(pos('thumb-phalanx-proximal'));
    const dT = tChild.clone().sub(tMetaPos).normalize();
    const dirPalm = palmCentre.clone().sub(tMetaPos).normalize();
    this.thumbTuckAxis = toBoneLocal('thumb-metacarpal', _v2.copy(dT).cross(dirPalm).normalize().clone());
    this.thumbOutAxis = tMeta.abdAxis.clone();
    // +thumbOut should rotate the tip AWAY from the palm centre: measure it
    this.thumbOutSign = this.abdSignFor(tMeta, this.chains.thumb.tip, palmCentre.clone().sub(tMetaPos).normalize().negate(), toWorldDir);

    // ---- mount: scale → reframe inside `group` (the wrist frame) ----
    const scaleWrap = new THREE.Group();
    const frame = new THREE.Group();
    frame.quaternion.setFromRotationMatrix(R);
    frame.position.copy(wristPos).applyMatrix4(R).negate();
    scaleWrap.add(frame);
    frame.add(inner);
    this.group.add(scaleWrap);
    // match the rig's `size` (middle-finger length) in metres
    inner.updateMatrixWorld(true);
    const midLen = pos('middle-finger-phalanx-proximal').distanceTo(pos('middle-finger-tip'));
    const s = this.size / Math.max(1e-4, midLen);
    scaleWrap.scale.set(s * (fem ? 0.92 : 1), s * (fem ? 0.92 : 1), s * (fem ? 0.92 : 1));
    if (fem) wrist.scale.x *= 0.94; // slimmer palm across the metacarpal fan

    // ---- materials ----
    const skinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.skin.base), roughness: 0.92, metalness: 0,
    });
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh || m.isMesh) {
        m.material = skinMat;
        m.frustumCulled = false;
      }
    });

    // ---- forearm + sleeve cuff parented to the wrist bone ----
    this.buildWristTail(
      (jn, vLocal) => toBoneLocal(jn, vLocal),
      skinMat,
      s,
    );

    for (const f of HAND_FINGERS) this.curls[f] = clampCurl(f, defaultCurl(f));
    this.setCurls({});
  }

  /**
   * Choose the palm-in sign empirically: flex the index MCP ±40° with each
   * candidate normal and keep whichever moves the tip closer to the palm
   * centre. Runs once per hand at construction.
   */
  private pickPalmIn(
    bones: Map<string, THREE.Bone>,
    pos: (n: string) => THREE.Vector3,
    toLocal: (p: THREE.Vector3) => THREE.Vector3,
    toBoneLocal: (boneName: string, vLocal: THREE.Vector3) => THREE.Vector3,
    n0: THREE.Vector3,
    palmCentre: THREE.Vector3,
  ): THREE.Vector3 {
    const jn = 'index-finger-phalanx-proximal';
    const bone = bones.get(jn)!;
    const q0 = bone.quaternion.clone();
    const jPos = toLocal(pos(jn));
    const d = toLocal(pos('index-finger-phalanx-intermediate')).sub(jPos).normalize();
    let best = n0;
    let bestDist = Infinity;
    for (const cand of [n0, n0.clone().negate()]) {
      const axisL = new THREE.Vector3().copy(d).cross(cand).normalize();
      bone.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(toBoneLocal(jn, axisL), 40 * D2R));
      bone.updateMatrixWorld(true);
      const tip = toLocal(bones.get('index-finger-tip')!.getWorldPosition(new THREE.Vector3()));
      const dist = tip.distanceTo(palmCentre);
      if (dist < bestDist) { bestDist = dist; best = cand; }
      bone.quaternion.copy(q0);
      bone.updateMatrixWorld(true);
    }
    void pos;
    return best.normalize();
  }

  /** Sign for a twist axis so +angle moves the tip along `wantLocal`. */
  private abdSignFor(
    j: Joint, tip: THREE.Bone, wantLocal: THREE.Vector3,
    toWorldDir: (v: THREE.Vector3) => THREE.Vector3,
  ): number {
    const want = toWorldDir(wantLocal);
    j.bone.quaternion.copy(j.q0);
    const t0 = tip.getWorldPosition(new THREE.Vector3());
    j.bone.quaternion.copy(j.q0).multiply(new THREE.Quaternion().setFromAxisAngle(j.abdAxis, 8 * D2R));
    j.bone.updateMatrixWorld(true);
    const t1 = tip.getWorldPosition(new THREE.Vector3());
    j.bone.quaternion.copy(j.q0);
    j.bone.updateMatrixWorld(true);
    return t1.sub(t0).dot(want) >= 0 ? 1 : -1;
  }

  /**
   * Wrist tail: a tapered forearm continuing past the wrist plus a dark
   * sleeve cuff over its outer half, so no bare wrist cut is ever visible.
   * Parented to the wrist bone — rides every hand pose.
   */
  private buildWristTail(
    toBoneLocal: (boneName: string, vLocal: THREE.Vector3) => THREE.Vector3,
    skinMat: THREE.Material,
    s: number,
  ): void {
    // arm axis in frame-local space: −y, exactly opposite the finger
    // chain (+y). NOTE: use the inner-space bind quats — the wrist bone's
    // live world quat already contains the frame/scale parents.
    const dirL = new THREE.Vector3(0, -1, 0);
    const boneDir = toBoneLocal('wrist', dirL).normalize();
    const len = 0.40 / s;                    // forearm always exits the frame
    const rw = this.palmW * 0.36 / s;        // wrist cross-section radius

    // tapered forearm: wrist radius at the wrist, +20 % toward the elbow;
    // both end caps are hidden (wrist cap inside the wrist, elbow cap
    // far off-screen)
    // bury the wrist end 8 mm inside the wrist so the cap rim can never
    // peek onto the finger side of the wrist plane
    const foreGeo = new THREE.CylinderGeometry(rw * 1.2, rw, len, 12, 1);
    foreGeo.translate(0, len / 2 + 0.008 / s, 0);
    const fore = new THREE.Mesh(foreGeo, skinMat);
    fore.name = 'vm3d-forearm';
    fore.quaternion.setFromUnitVectors(Y_AXIS, boneDir);

    // open-ended sleeve tube starting 6 cm behind the wrist (never over
    // the hand), radius ≤ 1.3× the forearm radius at that point
    const jacket = ANALYSTS[this.spec.gender].jacket;
    const cuffStart = 0.06 / s;
    const rForeAtStart = rw * (1 + 0.2 * (cuffStart / len));
    const cuffLen = len - cuffStart;
    const cuffGeo = new THREE.CylinderGeometry(rForeAtStart * 1.3, rForeAtStart * 1.22, cuffLen, 12, 1, true);
    cuffGeo.translate(0, cuffStart + cuffLen / 2, 0);
    const cuff = new THREE.Mesh(cuffGeo, new THREE.MeshStandardMaterial({ color: shade(jacket, 0.7), roughness: 0.85, metalness: 0 }));
    cuff.name = 'vm3d-sleeve';
    cuff.quaternion.copy(fore.quaternion);
    this.wristBone.add(fore, cuff);
  }

  /** Apply joint angles for one finger (clamped + DIP coupling). */
  setCurl(f: FingerName, c: Curl): Required<Curl> {
    const cc = clampCurl(f, c);
    this.curls[f] = cc;
    const ch = this.chains[f];
    if (f === 'thumb') {
      // CMC: out-twist (thumbOut) + tuck toward palm + share of mcp flexion
      const m = ch.joints[0];
      m.bone.quaternion.copy(m.q0)
        .multiply(new THREE.Quaternion().setFromAxisAngle(this.thumbOutAxis, this.thumbOutSign * (this.thumbOut - 1) * 45 * D2R))
        .multiply(new THREE.Quaternion().setFromAxisAngle(this.thumbTuckAxis, (1 - this.thumbOut) * 30 * D2R))
        .multiply(new THREE.Quaternion().setFromAxisAngle(m.flexAxis, cc.mcp * 0.55 * D2R));
      ch.joints[1].bone.quaternion.copy(ch.joints[1].q0)
        .multiply(new THREE.Quaternion().setFromAxisAngle(ch.joints[1].flexAxis, cc.mcp * D2R));
      ch.joints[2].bone.quaternion.copy(ch.joints[2].q0)
        .multiply(new THREE.Quaternion().setFromAxisAngle(ch.joints[2].flexAxis, cc.pip * D2R));
      return cc;
    }
    const [mcp, pip, dip] = ch.joints;
    mcp.bone.quaternion.copy(mcp.q0)
      .multiply(new THREE.Quaternion().setFromAxisAngle(mcp.abdAxis, mcp.abdSign * cc.abd * D2R))
      .multiply(new THREE.Quaternion().setFromAxisAngle(mcp.flexAxis, cc.mcp * D2R));
    pip.bone.quaternion.copy(pip.q0)
      .multiply(new THREE.Quaternion().setFromAxisAngle(pip.flexAxis, cc.pip * D2R));
    dip.bone.quaternion.copy(dip.q0)
      .multiply(new THREE.Quaternion().setFromAxisAngle(dip.flexAxis, cc.dip * D2R));
    return cc;
  }

  /** Apply a full per-finger curl set (missing fingers keep their angles). */
  setCurls(curls: Partial<Record<FingerName, Curl>>): void {
    // an unspecified dip is re-derived from pip (the coupling), so a stale
    // dip from a previous pose can never leak into the merge
    for (const f of HAND_FINGERS) this.setCurl(f, { ...this.curls[f], ...curls[f], dip: curls[f]?.dip });
  }

  getCurl(f: FingerName): Required<Curl> {
    return this.curls[f];
  }

  /** Fingertip world position (updates matrices on demand). */
  tipWorld(f: FingerName, out = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.chains[f].tip.getWorldPosition(out);
  }

  /** Joint positions of finger f in world space: [MCP, PIP, DIP, tip]. */
  fingerJointsWorld(f: FingerName): THREE.Vector3[] {
    const ch = this.chains[f];
    this.group.updateWorldMatrix(true, true);
    const pts = [...ch.joints.map((j) => j.bone as THREE.Object3D), ch.tip];
    return pts.map((p) => p.getWorldPosition(new THREE.Vector3()));
  }

  /** Palm-centre world position (used by grip tests). */
  palmCentreWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    // wrist + a bit along +y (toward the MCPs) is the palm's working centre
    return out.copy(this.group.getWorldPosition(new THREE.Vector3()))
      .add(new THREE.Vector3(0, this.palmL * 0.45, 0).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())));
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
    // DLS is start-state sensitive (it can stall at a joint limit from a
    // strongly curled start), so run it from up to two seeds and keep the
    // better end state: the current curl, then a half-extended fallback.
    let best = Infinity;
    let bestCurl: Required<Curl> | null = null;
    for (let seed = 0; seed < 2; seed++) {
      if (seed === 1) {
        const d = defaultCurl(f);
        this.setCurl(f, { mcp: d.mcp * 0.4, pip: d.pip * 0.4, abd: 0 });
      }
      let converged = false;
      for (let iter = 0; iter < 24; iter++) {
        const c0 = read();
        this.tipWorld(f, base);
        err.copy(target).sub(base);
        if (err.length() <= 0.0015) { converged = true; best = err.length(); bestCurl = this.curls[f]; break; }
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
      const d = tip.distanceTo(target);
      if (d < best) { best = d; bestCurl = this.curls[f]; }
      // good enough — no need to burn the fallback seed
      if (converged || d <= 0.008) break;
    }
    if (bestCurl) this.setCurl(f, bestCurl);
    this.tipWorld(f, tip);
    return tip.distanceTo(target);
  }

  /** Reset the chain to a relaxed curl (used on clip/blend resets). */
  relax(): void {
    for (const f of HAND_FINGERS) this.setCurl(f, defaultCurl(f));
  }
}

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


