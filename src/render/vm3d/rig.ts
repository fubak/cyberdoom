import * as THREE from 'three';
import type { FingerName } from '../handrig';
import { resolveClip, type Resolved, type ResolvedHand, type VmClip } from './clips';
import { KeyboardRig, keyTopWorld } from './keyboard3d';
import { LiveArm, LiveHand, type HandSpec } from './hand3d';

const D2R = Math.PI / 180;
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * The vm3d rig: board + two live hands + two arms. `root` is the vm-space
 * group the motion layer offsets (sway/bob/lower); it parents the tool. The
 * hands and arms live in `stage` (scene/camera space) and are driven by
 * socket world transforms every frame, so grips track the board rigidly.
 */
export class Vm3dRig {
  readonly root = new THREE.Group();
  readonly stage = new THREE.Group();
  readonly board = new KeyboardRig();
  readonly hands: Record<'L' | 'R', LiveHand>;
  readonly arms: Record<'L' | 'R', LiveArm>;
  readonly spec: HandSpec;

  constructor(spec: HandSpec) {
    this.spec = spec;
    this.hands = { L: new LiveHand('L', spec), R: new LiveHand('R', spec) };
    this.hands.L.thumbOut = 0.35; // gripping hand wraps its thumb around the board end
    this.arms = {
      L: new LiveArm('L', spec, this.hands.L.palmW),
      R: new LiveArm('R', spec, this.hands.R.palmW),
    };
    this.root.add(this.board.group);
    this.stage.add(this.hands.L.group, this.hands.R.group, this.arms.L.group, this.arms.R.group);
  }

  /** Pose everything at clip time t. Returns the resolved frame for tests. */
  solve(clip: VmClip, t: number): Resolved {
    const r = resolveClip(clip, t);
    const b = this.board.group;
    b.position.set(r.rootPos[0], r.rootPos[1], r.rootPos[2]);
    b.rotation.set(r.rootRot[0] * D2R, r.rootRot[1] * D2R, r.rootRot[2] * D2R, 'ZXY');
    for (const k of this.board.keys) {
      let v = 0;
      for (const [name, amt] of Object.entries(r.keys)) {
        if (k.name === name || k.name.startsWith(`${name}.`)) { v = amt; break; }
      }
      k.down = v;
    }
    this.board.update(0);
    this.root.updateMatrixWorld(true);
    this.solveHand('L', r.hands.L);
    this.solveHand('R', r.hands.R);
    return r;
  }

  private solveHand(side: 'L' | 'R', rh: ResolvedHand): void {
    const hand = this.hands[side];
    const targets = rh.wrists.filter((w) => w.socket || w.pos);
    if (targets.length) {
      let wsum = 0;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      for (const w of targets) {
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        if (w.socket) {
          const s = this.board.socket(w.socket);
          if (!s) continue;
          this.board.group.updateWorldMatrix(true, false);
          s.getWorldPosition(p);
          s.getWorldQuaternion(q);
        } else if (w.pos) {
          p.set(w.pos[0], w.pos[1], w.pos[2]);
          this.root.localToWorld(p);
          _e.set((w.rot?.[0] ?? 0) * D2R, (w.rot?.[1] ?? 0) * D2R, (w.rot?.[2] ?? 0) * D2R, 'ZXY');
          q.setFromEuler(_e);
          this.root.getWorldQuaternion(_q);
          q.premultiply(_q);
        }
        const wPrev = wsum;
        wsum += w.weight;
        pos.addScaledVector(p, w.weight);
        quat.slerp(q, wsum > 0 ? w.weight / wsum : 1);
        void wPrev;
      }
      if (wsum > 0) {
        pos.divideScalar(wsum);
        hand.group.position.copy(pos);
        hand.group.quaternion.copy(quat);
      }
    }
    hand.setCurls(rh.curls);
    for (const c of rh.contacts) {
      const target = c.socket.startsWith('key.')
        ? keyTopWorld(this.board, c.socket.slice(4))
        : this.board.socketWorld(c.socket);
      hand.ikTo(c.finger as FingerName, target, c.weight);
    }
    this.stage.updateMatrixWorld(true);
    this.arms[side].update(hand.group.getWorldPosition(_p));
  }
}
