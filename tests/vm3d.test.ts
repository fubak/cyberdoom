import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { JOINT_LIMITS, type FingerName } from '../src/render/handrig';
import { CLIPS, resolveClip, type V3 } from '../src/render/vm3d/clips';
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
      const steps = 60; // 10 ms sampling across the whole clip
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

  it('SWING winds up by 100 ms, strikes through the crosshair ~150 ms, home by 600 ms', () => {
    const clip = CLIPS['kbd.swing'];
    const cam = new THREE.PerspectiveCamera(54, 1280 / 672, 0.01, 5);
    const rig = new Vm3dRig(spec);
    const world = (local: V3) => rig.board.group.localToWorld(new THREE.Vector3(...local));
    const ndc = (t: number, local: V3) => {
      rig.solve(clip, t);
      rig.board.group.updateWorldMatrix(true, false);
      return world(local).project(cam);
    };
    const END: V3 = [-0.14, -0.0085, 0];
    const FREE: V3 = [0.14, -0.0085, 0];
    // wind-up (spec C): held end carried to the lower-right, free end
    // rising up-LEFT and back over the right shoulder
    const e100 = ndc(0.10, END), f100 = ndc(0.10, FREE);
    expect(e100.x, 'windup grip not to the right').toBeGreaterThan(0.05);
    expect(f100.x, 'windup tip not left of the fists').toBeLessThan(e100.x);
    expect(f100.y, 'windup tip not above the fists').toBeGreaterThan(e100.y);
    // impact: the free end reaches the crosshair, long axis into the screen
    const e150 = ndc(0.15, END), f150 = ndc(0.15, FREE);
    expect(Math.abs(f150.x), 'impact tip off the crosshair').toBeLessThan(0.2);
    expect(f150.y, 'impact tip short of the crosshair').toBeGreaterThan(-0.2);
    expect(e150.y, 'impact hands not lower-centre').toBeLessThan(-0.55);
    // the board may ride into the cleared band only while it is in
    // flight: the strike window where the board may cross VM_CLEAR (0.10–0.25)
    for (let t = 0; t <= clip.duration + 1e-9; t += 0.005) {
      const f = ndc(t, FREE);
      const clearNdc = t >= 0.10 && t <= 0.25 ? 0.16 : -0.24;
      expect(f.y, `swing@${t.toFixed(3)} board above VM_CLEAR outside the strike window`).toBeLessThan(clearNdc + 0.06);
    }
    const r600 = resolveClip(clip, 0.6);
    expect(r600.rootPos[0]).toBeCloseTo(0.012, 3);
    expect(r600.rootPos[1]).toBeCloseTo(-0.148, 3);
    expect(r600.rootRot[0]).toBeCloseTo(24, 3);
  });

  it('SWING: both fists wrap the board end (L end-face hold, R top wrap)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const inv = new THREE.Matrix4();
    // rigid hold: from the grab completing (~40 ms) until the release (0.30)
    for (let t = 0.04; t <= 0.30 + 1e-9; t += 1 / 120) {
      rig.solve(clip, t);
      rig.board.group.updateWorldMatrix(true, false);
      inv.copy(rig.board.group.matrixWorld).invert();
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        const dorsB = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(hand.group.getWorldQuaternion(new THREE.Quaternion()))
          .transformDirection(inv);
        const pcB = hand.palmCentreWorld(new THREE.Vector3()).applyMatrix4(inv);
        if (side === 'R') {
          // R wraps the top face just inboard of L: dorsum up, palm on the
          // deck over the left quarter
          expect(dorsB.y, `swing@${t.toFixed(3)} R dorsum not up`).toBeGreaterThan(0.6);
          expect(pcB.y, `swing@${t.toFixed(3)} R palm not on the deck`).toBeGreaterThan(0.004);
          expect(pcB.x, `swing@${t.toFixed(3)} R palm off the left end`).toBeLessThan(-0.02);
          expect(pcB.x, `swing@${t.toFixed(3)} R palm off the left end`).toBeGreaterThan(-0.165);
        } else {
          // L holds the end face itself (nearer the end): dorsum out the
          // end (-x), palm against the face
          expect(dorsB.x, `swing@${t.toFixed(3)} L dorsum not out the end`).toBeLessThan(-0.6);
          expect(pcB.x, `swing@${t.toFixed(3)} L palm not on the end face`).toBeLessThan(-0.15);
          expect(pcB.y, `swing@${t.toFixed(3)} L palm too high on the end`).toBeLessThan(0.005);
        }
        for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
          const tip = hand.tipWorld(f).applyMatrix4(inv);
          // every fingertip wraps around the case: under the bottom face,
          // behind the back face, or (L only) around the end face —
          // never resting inside the case volume
          const wrapped = tip.y < -0.015 || tip.z < -0.054 || (side === 'L' && tip.x < -0.14);
          expect(
            wrapped,
            `swing@${t.toFixed(3)} ${side}.${f} tip not wrapped (${tip.toArray().map((v) => v.toFixed(3))})`,
          ).toBe(true);
        }
      }
    }
  });

  it('SWING: gripped fingers stay wrapped (PIP >= 75, thumb MCP/IP >= 35)', () => {
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
          ).toBeGreaterThanOrEqual(75);
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

  it('SWING: the board passes through each fist trough (no gap)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const inv = new THREE.Matrix4();
    for (let t = 0.04; t <= 0.30 + 1e-9; t += 1 / 120) {
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
        // the back edge of the case under this palm must sit inside the
        // palm/finger bounded volume — the fist wraps around it
        const edge = new THREE.Vector3(pcB.x, -0.0085, -0.056);
        expect(box.containsPoint(edge), `swing@${t.toFixed(3)} ${side} board edge outside the fist`).toBe(true);
        // the palm hugs the top of the deck (within 25 mm of it) over the
        // board's left quarter
        expect(pcB.y, `swing@${t.toFixed(3)} ${side} palm floated off the deck`).toBeLessThan(0.025);
        expect(pcB.x, `swing@${t.toFixed(3)} ${side} palm off the left quarter`).toBeLessThan(-0.02);
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

  it('SWING: each palm centre stays within 1 cm of its grip socket (10 ms, 0–0.30 s)', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    for (let t = 0; t <= 0.30 + 1e-9; t += 0.01) {
      const r = rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        for (const w of r.hands[side].wrists) {
          // mid-blend frames interpolate between sockets legitimately;
          // only assert rigidity when a grip socket dominates (≥0.9)
          if (!w.socket || !(w.socket.startsWith('grip') || w.socket.startsWith('bat')) || w.weight < 0.9) continue;
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

  it('SWING: both wrists project inside the viewport every 10 ms', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const cam = new THREE.PerspectiveCamera(54, 1280 / 672, 0.01, 5);
    for (let t = 0; t <= clip.duration + 1e-9; t += 0.01) {
      rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        const n = rig.hands[side].group.getWorldPosition(new THREE.Vector3()).project(cam);
        expect(Math.abs(n.x) < 1 && n.y > -1 && n.y < 1, `swing@${t.toFixed(3)} ${side} wrist off-screen (${n.x.toFixed(2)},${n.y.toFixed(2)})`).toBe(true);
      }
    }
  });

  it('SWING: ≥60% of each hand stays on screen every 10 ms', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const cam = new THREE.PerspectiveCamera(54, 1280 / 672, 0.01, 5);
    for (let t = 0; t <= clip.duration + 1e-9; t += 0.01) {
      rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        const pts = [hand.group.getWorldPosition(new THREE.Vector3()), hand.palmCentreWorld(new THREE.Vector3())];
        for (const f of HAND_FINGERS) pts.push(...hand.fingerJointsWorld(f));
        let inside = 0;
        for (const p of pts) {
          const n = p.clone().project(cam);
          if (Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) inside++;
        }
        expect(
          inside / pts.length,
          `swing@${t.toFixed(3)} ${side} hand ${(100 * inside / pts.length).toFixed(0)}% on screen`,
        ).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it('SWING: no arm/hand vertex comes within 15 cm of the camera; arm covers ≤20% of the viewport', () => {
    const rig = new Vm3dRig(spec);
    const clip = CLIPS['kbd.swing'];
    const cam = new THREE.PerspectiveCamera(54, 1280 / 672, 0.01, 5);
    const v = new THREE.Vector3();
    for (let t = 0; t <= clip.duration + 1e-9; t += 0.01) {
      rig.solve(clip, t);
      for (const side of ['L', 'R'] as const) {
        const hand = rig.hands[side];
        hand.group.updateWorldMatrix(true, true);
        // every joint (inside the skin surface) at least 15 cm out
        for (const f of HAND_FINGERS) {
          for (const p of hand.fingerJointsWorld(f)) {
            expect(p.length(), `swing@${t.toFixed(3)} ${side}.${f} joint at camera`).toBeGreaterThanOrEqual(0.15);
          }
        }
        const meshes: THREE.Mesh[] = [];
        hand.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) meshes.push(m);
        });
        // raster estimate of forearm/sleeve coverage: barycentric-subdivide
        // each tube triangle and stamp the samples onto a 96×96 NDC grid
        const grid = new Uint8Array(96 * 96);
        for (const m of meshes) {
          const pos = m.geometry.getAttribute('position');
          const idx = m.geometry.getIndex();
          const isArm = /forearm|sleeve|forecap|sleevecap/.test(m.name);
          const nVerts = pos.count;
          for (let i = 0; i < nVerts; i++) {
            if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
              (m as THREE.SkinnedMesh).applyBoneTransform(i, v.fromBufferAttribute(pos, i));
            } else {
              v.fromBufferAttribute(pos, i);
            }
            m.localToWorld(v);
            if (v.length() < 0.15) {
              throw new Error(`swing@${t.toFixed(3)} ${side}.${m.name} vertex ${v.length().toFixed(3)}m from camera`);
            }
          }
          if (!isArm) continue;
          const tri = (k: number) => (idx ? idx.getX(k) : k);
          const nTris = (idx ? idx.count : nVerts) / 3;
          const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), p = new THREE.Vector3();
          for (let i = 0; i < nTris; i++) {
            va.fromBufferAttribute(pos, tri(i * 3)); m.localToWorld(va);
            vb.fromBufferAttribute(pos, tri(i * 3 + 1)); m.localToWorld(vb);
            vc.fromBufferAttribute(pos, tri(i * 3 + 2)); m.localToWorld(vc);
            for (let a = 0; a < 8; a++) for (let b = 0; b < 8 - a; b++) {
              const u = a / 8, w = b / 8;
              p.set(
                va.x + (vb.x - va.x) * u + (vc.x - va.x) * w,
                va.y + (vb.y - va.y) * u + (vc.y - va.y) * w,
                va.z + (vb.z - va.z) * u + (vc.z - va.z) * w,
              );
              if (p.z > -0.01) continue;
              const n = p.clone().project(cam);
              if (Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) {
                const gx = Math.min(95, Math.max(0, Math.round((n.x + 1) / 2 * 95)));
                const gy = Math.min(95, Math.max(0, Math.round((n.y + 1) / 2 * 95)));
                grid[gy * 96 + gx] = 1;
              }
            }
          }
        }
        let armCells = 0;
        for (const c of grid) armCells += c;
        expect(armCells / grid.length, `swing@${t.toFixed(3)} ${side} arm covers ${(100 * armCells / grid.length).toFixed(1)}% of view`).toBeLessThanOrEqual(0.2);
      }
    }
  });

  // --- review spec E: pure-math projection checks for A-C, 10 ms, both
  // analysts' scales ----------------------------------------------------
  const ARM_RE = /forearm|sleeve|forecap|sleevecap/;
  function armVerts(hand: { group: THREE.Object3D }): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    hand.group.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    hand.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !ARM_RE.test(m.name)) return;
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        m.localToWorld(v);
        pts.push(v.clone());
      }
    });
    return pts;
  }
  function handPoints(hand: { group: THREE.Object3D; palmCentreWorld(out: THREE.Vector3): THREE.Vector3; fingerJointsWorld(f: string): THREE.Vector3[] }): THREE.Vector3[] {
    const pts = [hand.group.getWorldPosition(new THREE.Vector3()), hand.palmCentreWorld(new THREE.Vector3())];
    for (const f of HAND_FINGERS) pts.push(...hand.fingerJointsWorld(f));
    return pts;
  }

  for (const gender of ['male', 'female'] as const) {
    const aSpec = { gender, skin: SKIN_TONES[1] };
    const cam = new THREE.PerspectiveCamera(54, 1280 / 672, 0.01, 5);

    it(`SWING ${gender}: each sleeve exits through its own side/bottom, spans \u226435% of frame width, arms never cross`, () => {
      const rig = new Vm3dRig(aSpec);
      const clip = CLIPS['kbd.swing'];
      const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));
      for (let t = 0.115; t <= 0.18 + 1e-9; t += 0.01) {
        rig.solve(clip, t);
        const ends: Record<string, { x: number; y: number; span: number; cx: number }> = {};
        for (const side of ['L', 'R'] as const) {
          const verts = armVerts(rig.hands[side]);
          const wrist = rig.hands[side].group.getWorldPosition(new THREE.Vector3());
          let far = verts[0], farD = -1;
          let x0 = 1e9, x1 = -1e9, sx = 0;
          for (const p of verts) {
            const d = p.distanceToSquared(wrist);
            if (d > farD) { farD = d; far = p; }
            const n = p.clone().project(cam);
            x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); sx += n.x;
          }
          const e = far.clone().project(cam);
          ends[side] = { x: e.x, y: e.y, span: clamp1(x1) - clamp1(x0), cx: sx / verts.length };
        }
        // the tube's free end must leave through the bottom edge or the
        // lower 35% of its own half of the frame
        // a bottom-edge exit is always allowed; only an arm whose tube
        // end lands inside the frame must stay on its own half — that is
        // the 'horizontal log crossing the body' defect A forbids
        if (ends.L.y >= -0.55) {
          expect(ends.L.x, `swing@${t.toFixed(2)} L sleeve ends in the right half`).toBeLessThan(0);
        }
        if (ends.R.y >= -0.55) {
          expect(ends.R.x, `swing@${t.toFixed(2)} R sleeve ends in the left half`).toBeGreaterThan(0);
        }
        for (const side of ['L', 'R'] as const) {
          const e = ends[side];
          const lowOrOut = e.y < -0.3 || e.y <= -1;
          expect(lowOrOut, `swing@${t.toFixed(2)} ${side} sleeve exits mid-frame (x ${e.x.toFixed(2)} y ${e.y.toFixed(2)})`).toBe(true);
          expect(e.span, `swing@${t.toFixed(2)} ${side} sleeve spans ${(50 * e.span).toFixed(0)}% of frame width`).toBeLessThanOrEqual(0.7);
        }
        expect(ends.L.cx, `swing@${t.toFixed(2)} arms cross`).toBeLessThan(ends.R.cx + 0.10);
      }
    });

    it(`SWING ${gender}: board keeps \u22656% visible area t .10-.24, keycap face camera-facing at .13/.15`, () => {
      const rig = new Vm3dRig(aSpec);
      const clip = CLIPS['kbd.swing'];
      const N = 64;
      // deck-top corners in board-local space
      const corners = [[-0.14, 0, -0.056], [0.14, 0, -0.056], [0.14, 0, 0.056], [-0.14, 0, 0.056]]
        .map((c) => new THREE.Vector3(...(c as [number, number, number])));
      for (let t = 0.10; t <= 0.24 + 1e-9; t += 0.01) {
        rig.solve(clip, t);
        rig.board.group.updateWorldMatrix(true, false);
        const q = corners.map((c) => c.clone().applyMatrix4(rig.board.group.matrixWorld).project(cam));
        // hand bboxes in ndc
        const boxes = (['L', 'R'] as const).map((side) => {
          const b = new THREE.Box2();
          for (const p of handPoints(rig.hands[side])) {
            const n = p.project(cam);
            b.expandByPoint(new THREE.Vector2(n.x, n.y));
          }
          return b;
        });
        // raster: board quad minus hand bboxes
        const pt = new THREE.Vector2();
        const edge = (a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector2) =>
          (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        let cells = 0;
        for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
          pt.set((gx + 0.5) / N * 2 - 1, (gy + 0.5) / N * 2 - 1);
          const s0 = edge(q[0], q[1], pt);
          const insideQuad = edge(q[1], q[2], pt) * s0 >= 0 && edge(q[2], q[3], pt) * s0 >= 0 && edge(q[3], q[0], pt) * s0 >= 0;
          if (!insideQuad) continue;
          if (boxes.some((b) => b.containsPoint(pt))) continue;
          cells++;
        }
        expect(cells / (N * N), `swing@${t.toFixed(2)} board visible ${(100 * cells / (N * N)).toFixed(1)}% of viewport`).toBeGreaterThanOrEqual(0.06);
        if (t === 0.13 || Math.abs(t - 0.15) < 1e-9) {
          const nrm = new THREE.Vector3(0, 1, 0).transformDirection(rig.board.group.matrixWorld);
          expect(nrm.z, `swing@${t.toFixed(2)} keycap face off-camera (dot ${nrm.z.toFixed(2)})`).toBeGreaterThanOrEqual(0.25);
        }
      }
    });

    it(`SWING ${gender}: impact free end projects within 0.12 frame-width of the crosshair`, () => {
      const rig = new Vm3dRig(aSpec);
      rig.solve(CLIPS['kbd.swing'], 0.15);
      rig.board.group.updateWorldMatrix(true, false);
      const tip = new THREE.Vector3(0.14, -0.0085, 0)
        .applyMatrix4(rig.board.group.matrixWorld).project(cam);
      expect(Math.abs(tip.x), `tip ${tip.x.toFixed(2)} off crosshair x`).toBeLessThanOrEqual(0.24);
      expect(Math.abs(tip.y), `tip ${tip.y.toFixed(2)} off crosshair y`).toBeLessThanOrEqual(0.26);
    });

    it(`SWING ${gender}: fist centroid bands - windup lower-right, impact lower-centre, follow lower-left`, () => {
      const rig = new Vm3dRig(aSpec);
      const clip = CLIPS['kbd.swing'];
      const centroid = () => {
        rig.board.group.updateWorldMatrix(true, false);
        const a = rig.hands.L.palmCentreWorld(new THREE.Vector3());
        const b = rig.hands.R.palmCentreWorld(new THREE.Vector3());
        return a.add(b).multiplyScalar(0.5).project(cam);
      };
      for (let t = 0.05; t <= 0.10 + 1e-9; t += 0.01) {
        rig.solve(clip, t);
        const c = centroid();
        const fx = (c.x + 1) / 2, fy = (1 - c.y) / 2;
        expect(fx, `windup@${t.toFixed(2)} fist x ${fx.toFixed(2)}`).toBeGreaterThanOrEqual(0.60);
        expect(fx, `windup@${t.toFixed(2)} fist x ${fx.toFixed(2)}`).toBeLessThanOrEqual(0.80);
        expect(fy, `windup@${t.toFixed(2)} fist y ${fy.toFixed(2)}`).toBeGreaterThanOrEqual(0.70);
      }
      {
        rig.solve(clip, 0.15);
        const c = centroid();
        const fx = (c.x + 1) / 2;
        expect(fx, `impact fist x ${fx.toFixed(2)}`).toBeGreaterThanOrEqual(0.40);
        expect(fx, `impact fist x ${fx.toFixed(2)}`).toBeLessThanOrEqual(0.60);
      }
      for (let t = 0.24; t <= 0.30 + 1e-9; t += 0.01) {
        rig.solve(clip, t);
        const c = centroid();
        const fx = (c.x + 1) / 2;
        expect(fx, `follow@${t.toFixed(2)} fist x ${fx.toFixed(2)}`).toBeGreaterThanOrEqual(0.20);
        expect(fx, `follow@${t.toFixed(2)} fist x ${fx.toFixed(2)}`).toBeLessThanOrEqual(0.40);
      }
    });
  }

  // round-3: one continuous authored arc — sampled every 5 ms over 0–0.60 s
  for (const gender of ['male', 'female'] as const) {
    const aSpec = { gender, skin: SKIN_TONES[1] };
    const cam = new THREE.PerspectiveCamera(54, 1280 / 672, 0.01, 5);

    it(`SWING ${gender}: root angular speed stays under 2000 deg/s (5 ms samples)`, () => {
      const clip = CLIPS['kbd.swing'];
      let prev: THREE.Quaternion | null = null;
      let prevT = 0;
      for (let t = 0; t <= 0.6 + 1e-9; t += 0.005) {
        const r = resolveClip(clip, t);
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(r.rootRot[0] * Math.PI / 180, r.rootRot[1] * Math.PI / 180, r.rootRot[2] * Math.PI / 180, 'ZXY'));
        if (prev) {
          const degPerSec = prev.angleTo(q) * 180 / Math.PI / (t - prevT);
          expect(degPerSec, `swing@${t.toFixed(3)} root speed ${degPerSec.toFixed(0)} deg/s`).toBeLessThanOrEqual(2000);
        }
        prev = q;
        prevT = t;
      }
    });

    it(`SWING ${gender}: forearm tail direction changes at most 20 deg per 5 ms`, () => {
      const clip = CLIPS['kbd.swing'];
      for (const side of ['L', 'R'] as const) {
        let prev: THREE.Vector3 | null = null;
        for (let t = 0; t <= 0.6 + 1e-9; t += 0.005) {
          const r = resolveClip(clip, t);
          const td = r.hands[side].tailDir;
          if (!td) { prev = null; continue; }
          const v = new THREE.Vector3(...td).normalize();
          if (prev) {
            const deg = prev.angleTo(v) * 180 / Math.PI;
            expect(deg, `swing@${t.toFixed(3)} ${side} tail step ${deg.toFixed(1)} deg`).toBeLessThanOrEqual(20);
          }
          prev = v;
        }
      }
    });

    it(`SWING ${gender}: fist centroid x is monotone non-increasing apex to follow-through`, () => {
      const rig = new Vm3dRig(aSpec);
      const clip = CLIPS['kbd.swing'];
      let prevFx = Infinity;
      for (let t = 0.10; t <= 0.30 + 1e-9; t += 0.005) {
        rig.solve(clip, t);
        const a = rig.hands.L.palmCentreWorld(new THREE.Vector3());
        const b = rig.hands.R.palmCentreWorld(new THREE.Vector3());
        const c = a.add(b).multiplyScalar(0.5).project(cam);
        const fx = (c.x + 1) / 2;
        if (prevFx !== Infinity) {
          expect(fx - prevFx, `swing@${t.toFixed(3)} centroid x reversal ${(fx - prevFx).toFixed(3)}`).toBeLessThanOrEqual(0.01);
        }
        prevFx = fx;
      }
    });

    it(`SWING ${gender}: hands stay 0.30 m+ from camera, each under 30% of view width, no cap faces camera`, () => {
      const rig = new Vm3dRig(aSpec);
      const clip = CLIPS['kbd.swing'];
      for (let t = 0; t <= 0.6 + 1e-9; t += 0.005) {
        rig.solve(clip, t);
        for (const side of ['L', 'R'] as const) {
          const box = new THREE.Box2();
          for (const p of handPoints(rig.hands[side])) {
            expect(p.length(), `swing@${t.toFixed(3)} ${side} hand ${p.z.toFixed(2)} m from camera`).toBeGreaterThanOrEqual(0.30);
            const n = p.clone().project(cam);
            box.expandByPoint(new THREE.Vector2(n.x, n.y));
          }
          expect(box.max.x - box.min.x, `swing@${t.toFixed(3)} ${side} hand spans ${(50 * (box.max.x - box.min.x)).toFixed(0)}% width`).toBeLessThanOrEqual(0.6);
          const td = rig.hands[side].tailDir;
          if (td) {
            // forearm cap normal is the tail direction; it must not face the camera
            const capDot = -td.z;
            expect(capDot, `swing@${t.toFixed(3)} ${side} cap normal to camera ${capDot.toFixed(2)}`).toBeLessThan(0.2);
          }
        }
      }
    });
  }

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
