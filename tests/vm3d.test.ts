import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { JOINT_LIMITS, type FingerName } from '../src/render/handrig';
import { CLIPS, resolveClip } from '../src/render/vm3d/clips';
import { Vm3dRig } from '../src/render/vm3d/rig';
import { keyTopWorld } from '../src/render/vm3d/keyboard3d';
import { HAND_FINGERS } from '../src/render/vm3d/hand3d';
import { SKIN_TONES } from '../src/tools/look';

const spec = { gender: 'male' as const, skin: SKIN_TONES[1] };
const MM = 0.001;

const LIMITS: Record<FingerName, { mcp: [number, number]; pip: [number, number]; dip?: [number, number]; abd?: [number, number] }> = {
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
