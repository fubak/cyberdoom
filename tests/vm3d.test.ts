import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { JOINT_LIMITS, type FingerName } from '../src/render/handrig';
import { CLIPS, resolveClip } from '../src/render/vm3d/clips';
import { Vm3dRig } from '../src/render/vm3d/rig';
import { keyTopWorld } from '../src/render/vm3d/keyboard3d';
import { HAND_FINGERS, setHandAsset } from '../src/render/vm3d/hand3d';
import { SKIN_TONES } from '../src/tools/look';

const spec = { gender: 'male' as const, skin: SKIN_TONES[1] };
const MM = 0.001;

/** Parse the real glb files and register them — no mocked skeleton.
 *  (node builtins have no types here — the tsconfig ships DOM types only) */
beforeAll(async () => {
  // 'node:fs' has no types here (DOM-only tsconfig); keep the specifier
  // dynamic so tsc doesn't try to resolve it.
  const fsSpecifier = 'node:fs';
  const { readFileSync } = await import(fsSpecifier) as { readFileSync(p: string): Uint8Array };
  const loader = new GLTFLoader();
  for (const [side, file] of [['L', 'left.glb'], ['R', 'right.glb']] as const) {
    const buf = readFileSync(`public/models/hands/${file}`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const gltf = await new Promise<{ scene: THREE.Object3D }>((res, rej) =>
      loader.parse(ab, '', res, rej));
    setHandAsset(side, gltf.scene);
  }
});

const LIMITS: Record<FingerName, { mcp: readonly [number, number]; pip: readonly [number, number]; dip?: readonly [number, number]; abd?: readonly [number, number] }> = {
  index: JOINT_LIMITS,
  middle: JOINT_LIMITS,
  ring: JOINT_LIMITS,
  pinky: JOINT_LIMITS,
  thumb: { mcp: JOINT_LIMITS.thumbMcp, pip: JOINT_LIMITS.thumbIp },
};

function withinLimits(c: { mcp: number; pip: number; dip?: number; abd?: number }, f: FingerName): boolean {
  const l = LIMITS[f];
  if (c.mcp < l.mcp[0] - 1e-6 || c.mcp > l.mcp[1] + 1e-6) return false;
  if (c.pip < l.pip[0] - 1e-6 || c.pip > l.pip[1] + 1e-6) return false;
  if (l.dip && c.dip !== undefined && (c.dip < l.dip[0] - 1e-6 || c.dip > l.dip[1] + 1e-6)) return false;
  if (l.abd && c.abd !== undefined && (c.abd < l.abd[0] - 1e-6 || c.abd > l.abd[1] + 1e-6)) return false;
  return true;
}

/** Test a world-space point against the board's solid AABB in BOARD-LOCAL
 *  space (the world AABB of a rotated box over-covers the hand hover zone). */
function insideBoard(rig: Vm3dRig, world: THREE.Vector3, margin: number): boolean {
  const local = world.clone();
  rig.board.group.updateWorldMatrix(true, true);
  local.applyMatrix4(rig.board.group.matrixWorld.clone().invert());
  const bb = rig.board.solidAABB(new THREE.Box3());
  bb.expandByScalar(-margin);
  return bb.containsPoint(local);
}

describe('vm3d clip contacts (plan §5)', () => {
  for (const name of ['kbd.idle', 'kbd.type', 'kbd.swing']) {
    const clip = CLIPS[name];
    it(`${name}: fingertip→socket < 2 mm at every declared contact keyframe`, () => {
      const rig = new Vm3dRig(spec);
      for (const k of clip.keys) {
        rig.solve(clip, k.t);
        const r = resolveClip(clip, k.t);
        for (const side of ['L', 'R'] as const) {
          for (const c of r.hands[side].contacts) {
            if (c.weight < 0.8) continue; // blended-in contacts are asserted on their own key
            const target = c.socket.startsWith('key.')
              ? keyTopWorld(rig.board, c.socket.slice(4))
              : rig.board.socketWorld(c.socket);
            const tip = rig.hands[side].tipWorld(c.finger);
            expect(
              tip.distanceTo(target),
              `${name}@${k.t}s ${side}.${c.finger} → ${c.socket}`,
            ).toBeLessThan(2 * MM);
          }
        }
      }
    });

    it(`${name}: every joint stays inside JOINT_LIMITS`, () => {
      const rig = new Vm3dRig(spec);
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clip.duration;
        rig.solve(clip, t);
        for (const side of ['L', 'R'] as const) {
          for (const f of HAND_FINGERS) {
            const c = rig.hands[side].getCurl(f);
            expect(withinLimits(c, f), `${name}@${t.toFixed(3)} ${side}.${f} ${JSON.stringify(c)}`).toBe(true);
          }
        }
      }
    });

    it(`${name}: tool stays rigid to its grip socket (wrist rides the socket)`, () => {
      const rig = new Vm3dRig(spec);
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clip.duration;
        const r = rig.solve(clip, t);
        for (const side of ['L', 'R'] as const) {
          for (const w of r.hands[side].wrists) {
            if (!w.socket || w.weight < 0.9) continue;
            const sp = rig.board.socketWorld(w.socket);
            const wp = rig.hands[side].group.getWorldPosition(new THREE.Vector3());
            // blended wrist: allow the interpolation offset against the socket
            expect(wp.distanceTo(sp), `${name}@${t.toFixed(3)} ${side} wrist → ${w.socket}`).toBeLessThan(30 * MM);
          }
        }
      }
    });

    it(`${name}: no forearm/sleeve vertex sits on the finger side of the wrist`, () => {
      const rig = new Vm3dRig(spec);
      const steps = 20;
      const inv = new THREE.Matrix4();
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clip.duration;
        rig.solve(clip, t);
        for (const side of ['L', 'R'] as const) {
          const hand = rig.hands[side];
          hand.group.updateWorldMatrix(true, true);
          inv.copy(hand.group.matrixWorld).invert();
          // wrist plane: through the wrist, normal along wrist → middle MCP
          const n = hand.fingerJointsWorld('middle')[0]
            .applyMatrix4(inv).normalize();
          // every non-skin mesh under the hand (forearm, sleeve, any stray
          // arm geometry) must stay on the arm side of the wrist plane
          const meshes: THREE.Mesh[] = [];
          hand.group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(m);
          });
          expect(meshes.length, `${side} has arm-tail meshes`).toBeGreaterThan(0);
          for (const mesh of meshes) {
            const posAttr = mesh.geometry.getAttribute('position');
            const v = new THREE.Vector3();
            for (let vi = 0; vi < posAttr.count; vi++) {
              v.fromBufferAttribute(posAttr, vi);
              mesh.localToWorld(v).applyMatrix4(inv);
              expect(
                v.dot(n),
                `${name}@${t.toFixed(3)} ${side}.${mesh.name} vertex on finger side`,
              ).toBeLessThan(0.001);
            }
          }
        }
      }
    });

    it(`${name}: hand frames are proper rotations and forearms point away from the fingers`, () => {
      const rig = new Vm3dRig(spec);
      const steps = 10;
      const inv = new THREE.Matrix4();
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clip.duration;
        rig.solve(clip, t);
        for (const side of ['L', 'R'] as const) {
          const hand = rig.hands[side];
          expect(hand.frameDet, `${side} wrist-frame determinant`).toBeCloseTo(1, 5);
          hand.group.updateWorldMatrix(true, true);
          inv.copy(hand.group.matrixWorld).invert();
          const n = hand.fingerJointsWorld('middle')[0].applyMatrix4(inv).normalize();
          // forearm tube axis: from the vertex nearest the wrist to the
          // farthest vertex (the elbow end) — must point away from the MCP
          const fore = hand.group.getObjectByName('vm3d-forearm') as THREE.Mesh;
          const posAttr = fore.geometry.getAttribute('position');
          const v = new THREE.Vector3();
          const near = new THREE.Vector3();
          const far = new THREE.Vector3();
          let dNear = Infinity;
          let dFar = -1;
          for (let vi = 0; vi < posAttr.count; vi++) {
            v.fromBufferAttribute(posAttr, vi);
            fore.localToWorld(v).applyMatrix4(inv);
            const d = v.length();
            if (d < dNear) { dNear = d; near.copy(v); }
            if (d > dFar) { dFar = d; far.copy(v); }
          }
          const axis = far.sub(near).normalize();
          expect(axis.dot(n), `${name}@${t.toFixed(3)} ${side} forearm axis toward fingers`).toBeLessThan(-0.5);
        }
      }
    });

    it(`${name}: no hand joint sits inside the board's solid AABB`, () => {
      const rig = new Vm3dRig(spec);
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clip.duration;
        rig.solve(clip, t);
        for (const side of ['L', 'R'] as const) {
          for (const f of HAND_FINGERS) {
            for (const p of rig.hands[side].fingerJointsWorld(f)) {
              expect(insideBoard(rig, p, 0.002), `${name}@${t.toFixed(3)} ${side}.${f} ${p.toArray().map((v) => v.toFixed(3))}`).toBe(false);
            }
          }
        }
      }
    });
  }

  it('TYPE depresses keycaps below the deck and returns them', () => {
    const rig = new Vm3dRig(spec);
    rig.solve(CLIPS['kbd.type'], 0.06);
    const i = rig.board.keyIndex('j');
    expect(rig.board.keys[i].down).toBeGreaterThan(0.5);
    rig.solve(CLIPS['kbd.type'], 0.62);
    expect(rig.board.keys[i].down).toBeLessThan(0.05);
  });

  it('SWING winds up by the 60 ms windup and is home by the 600 ms cooldown', () => {
    const r60 = resolveClip(CLIPS['kbd.swing'], 0.06);
    // windup pose is up-right of home and rolled
    expect(r60.rootRot[2]).toBeLessThan(-25);
    const r600 = resolveClip(CLIPS['kbd.swing'], 0.6);
    expect(r600.rootPos[0]).toBeCloseTo(0.012, 3);
    expect(r600.rootPos[1]).toBeCloseTo(-0.148, 3);
    expect(r600.rootRot[0]).toBeCloseTo(24, 3);
  });

  it('SWING: both fists wrap the board end (tips below the top near the end plane)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const inv = new THREE.Matrix4();
    // gripped span: after the grab blend completes (~40 ms) until the
    // regrip begins
    for (let t = 0.05; t <= 0.30 + 1e-9; t += 1 / 120) {
      rig.solve(clip, t);
      rig.board.group.updateWorldMatrix(true, false);
      inv.copy(rig.board.group.matrixWorld).invert();
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        // dorsum direction (frame +z) in board-local space
        const dorsW = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(hand.group.getWorldQuaternion(new THREE.Quaternion()));
        const dorsB = dorsW.clone().transformDirection(inv);
        // both fists wrap the end face palm-in (+x): dorsum points outboard
        // (−x), opposite the fingertips curled under the board
        expect(dorsB.x, `swing@${t.toFixed(3)} ${side} dorsum`).toBeLessThan(-0.3);
        for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
          const tip = hand.tipWorld(f).applyMatrix4(inv);
          expect(
            tip.y,
            `swing@${t.toFixed(3)} ${side}.${f} tip above board top`,
          ).toBeLessThan(-0.0005);
          expect(
            Math.abs(tip.x + 0.14),
            `swing@${t.toFixed(3)} ${side}.${f} tip away from the end plane`,
          ).toBeLessThan(0.015);
        }
      }
    }
  });

  it('SWING: gripped fingers stay in a fist (PIP >= 80, thumb MCP/IP >= 35)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    for (let t = 0.035; t <= 0.30 + 1e-9; t += 1 / 120) {
      rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
          expect(
            hand.getCurl(f).pip,
            `swing@${t.toFixed(3)} ${side}.${f} PIP opens`,
          ).toBeGreaterThanOrEqual(80);
        }
        const th = hand.getCurl('thumb');
        expect(th.mcp, `swing@${t.toFixed(3)} ${side}.thumb MCP`).toBeGreaterThanOrEqual(35);
        expect(th.pip, `swing@${t.toFixed(3)} ${side}.thumb IP`).toBeGreaterThanOrEqual(35);
      }
    }
  });

  it('SWING: the two fists are stacked without overlap (palm centres apart)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    for (let t = 0.035; t <= 0.30 + 1e-9; t += 1 / 60) {
      rig.solve(clip, t);
      const palm = (side: 'L' | 'R') => {
        const c = new THREE.Vector3();
        for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
          c.add(rig.hands[side].fingerJointsWorld(f)[0]);
        }
        return c.divideScalar(4);
      };
      const wL = rig.hands.L.fingerJointsWorld('index')[0]
        .distanceTo(rig.hands.L.fingerJointsWorld('pinky')[0]);
      const wR = rig.hands.R.fingerJointsWorld('index')[0]
        .distanceTo(rig.hands.R.fingerJointsWorld('pinky')[0]);
      const sep = palm('L').distanceTo(palm('R'));
      expect(
        sep,
        `swing@${t.toFixed(3)} palm centres ${(sep * 1000).toFixed(1)}mm apart`,
      ).toBeGreaterThanOrEqual(1.0 * (wL + wR) / 2);
    }
  });

  it('SWING: thumb lies across the flexed index/middle phalanges (power grip)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const seg = new THREE.Line3();
    const cp = new THREE.Vector3();
    const distSeg = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
      seg.set(a, b);
      seg.closestPointToPoint(p, true, cp);
      return p.distanceTo(cp);
    };
    for (let t = 0.05; t <= 0.30 + 1e-9; t += 1 / 120) {
      rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        const thumb = hand.tipWorld('thumb');
        const ij = hand.fingerJointsWorld('index');
        const mj = hand.fingerJointsWorld('middle');
        // pad must land on the index/middle proximal or intermediate
        // phalanx (segments MCP→PIP), never pinch the index tip (no OK loop)
        const dProx = Math.min(
          distSeg(thumb, ij[0], ij[1]),
          distSeg(thumb, ij[1], ij[2]),
          distSeg(thumb, mj[0], mj[1]),
          distSeg(thumb, mj[1], mj[2]),
        );
        const dITip = thumb.distanceTo(ij[3]);
        expect(dProx, `swing@${t.toFixed(3)} ${side} thumb on index/middle phalanx`).toBeLessThan(12 * MM);
        expect(dITip, `swing@${t.toFixed(3)} ${side} thumb near index tip (OK loop)`).toBeGreaterThanOrEqual(18 * MM);
      }
    }
  });

  it('SWING: the board end sits inside each fist trough', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const inv = new THREE.Matrix4();
    for (let t = 0.035; t <= 0.30 + 1e-9; t += 1 / 120) {
      rig.solve(clip, t);
      rig.board.group.updateWorldMatrix(true, false);
      inv.copy(rig.board.group.matrixWorld).invert();
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        // AABB spanning palm centre + index/middle/ring proximal joints + tips
        const box = new THREE.Box3();
        const pcB = hand.palmCentreWorld(new THREE.Vector3()).applyMatrix4(inv);
        box.expandByPoint(pcB);
        for (const f of ['index', 'middle', 'ring'] as const) {
          for (const p of hand.fingerJointsWorld(f)) box.expandByPoint(p.applyMatrix4(inv));
        }
        for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
          box.expandByPoint(hand.tipWorld(f).applyMatrix4(inv));
        }
        // board-edge reference point: the end face centre at the hand's
        // own z — must sit inside the palm/finger bounded volume
        const edge = new THREE.Vector3(-0.14, -0.0085, pcB.z);
        expect(box.containsPoint(edge), `swing@${t.toFixed(3)} ${side} board edge outside the fist`).toBe(true);
        // the palm hugs the end region: within 15 mm of the end-face
        // vertical centre and within 5 cm outboard of the end face
        expect(Math.abs(pcB.y + 0.0085), `swing@${t.toFixed(3)} ${side} palm off the end-face height`).toBeLessThan(15 * MM);
        expect(pcB.x, `swing@${t.toFixed(3)} ${side} palm detached from the board end`).toBeGreaterThan(-0.19);
      }
    }
  });

  it('IDLE: left hand holds the board end (tips below the top, palm facing down)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.idle'];
    const inv = new THREE.Matrix4();
    for (const t of [0, 1.6, 3.19]) {
      rig.solve(clip, t);
      rig.board.group.updateWorldMatrix(true, false);
      inv.copy(rig.board.group.matrixWorld).invert();
      const palmN = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(rig.hands.L.group.getWorldQuaternion(new THREE.Quaternion()))
        .transformDirection(inv);
      // palm faces the end face (+x): the end face is inside the grip, not
      // an open palm to the camera
      expect(palmN.x, `idle@${t} L palm faces the board's end face`).toBeGreaterThan(0.5);
      for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
        const tip = rig.hands.L.tipWorld(f).applyMatrix4(inv);
        expect(tip.y, `idle@${t} L.${f} tip above board top`).toBeLessThan(-0.0005);
        expect(Math.abs(tip.x + 0.14), `idle@${t} L.${f} tip away from the end plane`).toBeLessThan(0.015);
      }
    }
  });

  it('SWING: each palm centre stays within 1 cm of its board-end grip socket', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const dt = 1 / 240;
    for (let t = 0; t <= clip.duration + 1e-9; t += dt) {
      const r = rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        for (const w of r.hands[side].wrists) {
          // mid-blend frames interpolate between sockets legitimately;
          // only assert rigidity when the grip socket dominates (≥0.9)
          if (!w.socket || !w.socket.startsWith('grip') || w.weight < 0.9) continue;
          const socket = rig.board.socketWorld(w.socket);
          const palm = rig.hands[side].group.getWorldPosition(new THREE.Vector3());
          expect(
            palm.distanceTo(socket),
            `swing@${t.toFixed(4)} ${side} palm → ${w.socket}`,
          ).toBeLessThan(10 * MM);
        }
      }
    }
  });

  it('IDLE/TYPE: right-hand fingertips rest within 3 mm of a keycap top', () => {
    const rig = new Vm3dRig(spec);
    // resting contact keys: home row under the four fingers
    const restKeys: Partial<Record<FingerName, string>> = {
      index: 'j', middle: 'k', ring: 'l', pinky: 'enter',
    };
    for (const t of [0, 0.62]) {
      rig.solve(CLIPS['kbd.type'], t);
      for (const [f, key] of Object.entries(restKeys) as [FingerName, string][]) {
        const tip = rig.hands.R.tipWorld(f);
        // nearest keycap top surface in the home row area
        let best = Infinity;
        for (const k of rig.board.keys) {
          const top = keyTopWorld(rig.board, k.name);
          const dxz = Math.hypot(top.x - tip.x, top.z - tip.z);
          if (dxz < 0.012) best = Math.min(best, Math.abs(top.y - tip.y));
          void key;
        }
        expect(best, `type@${t} R.${f} tip → keycap top`).toBeLessThan(3 * MM);
      }
    }
  });

  it('IDLE/TYPE: no right-hand fingertip points above its MCP joint', () => {
    const rig = new Vm3dRig(spec);
    for (const clipName of ['kbd.idle', 'kbd.type'] as const) {
      const clip = CLIPS[clipName];
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clip.duration;
        rig.solve(clip, t);
        for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
          const joints = rig.hands.R.fingerJointsWorld(f);
          const mcp = joints[0];
          const tip = joints[joints.length - 1];
          // camera-space "up" is +y in vm space; a tip may rise at most a
          // fingertip's height (5 mm) above its knuckle — never above it
          expect(
            tip.y - mcp.y,
            `${clipName}@${t.toFixed(3)} R.${f} tip above MCP`,
          ).toBeLessThan(5 * MM);
        }
      }
    }
  });

  it('works on the female spec (slimmer hand, all clips)', () => {
    const rig = new Vm3dRig({ gender: 'female', skin: SKIN_TONES[1] });
    for (const name of ['kbd.idle', 'kbd.type', 'kbd.swing']) {
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * CLIPS[name].duration;
        rig.solve(CLIPS[name], t);
        for (const side of ['L', 'R'] as const) {
          for (const f of HAND_FINGERS) {
            expect(withinLimits(rig.hands[side].getCurl(f), f)).toBe(true);
          }
        }
      }
    }
  });
});
