import { describe, expect, it } from 'vitest';
import { installFakeCanvas } from './fakecanvas';
installFakeCanvas();
import { clampCurl, fingerJoints, handJoints, FINGER_LEN, PHALANX, JOINT_LIMITS, bakeRig, type Place, type FingerName } from '../src/render/handrig';
import { POSES, TOOL_HANDS } from '../src/render/handposes';
import { SKIN_TONES } from '../src/tools/look';
import { rasterize, type Prim } from '../src/render/model';
import { RES } from '../src/render/res';
import { vmLine } from '../src/tools/anim';
import { drawToolViewmodel } from '../src/render/viewmodels';
import { toolRegistry } from '../src/tools';
import { FakeCanvas } from './fakecanvas';
import type { Gender } from '../src/core/types';

const skin = SKIN_TONES[1];
const eq = (x: Uint8ClampedArray, y: Uint8ClampedArray) => x.length === y.length && x.every((v, i) => v === y[i]);

/** fingertip in viewmodel units (x rel centre, y above the status-bar line) */
function vmTip(pose: string, handIdx: number, finger: FingerName, gender: Gender = 'male'): [number, number] {
  const fr = POSES[pose];
  const cx = (fr.w / 2) * RES;
  const p = fr.hands[handIdx];
  const q: Place = {
    ...p,
    wrist: [p.wrist[0] * RES - cx, p.wrist[1] * RES, p.wrist[2] * RES],
    size: p.size * RES,
  };
  const j = handJoints(q, { gender, skin })[finger][3];
  const tool = pose.split('.')[0] === 'kbd' ? 'keyboard' : pose.split('.')[0];
  const at = TOOL_HANDS[tool].at;
  return [at[0] + j[0] / RES, at[1] + j[1] / RES];
}

describe('hand rig joint limits + DIP coupling', () => {
  it('clamps every joint to its limit', () => {
    const c = clampCurl('index', { abd: 60, mcp: 120, pip: 200, dip: 200 });
    expect(c.abd).toBe(JOINT_LIMITS.abd[1]);
    expect(c.mcp).toBe(JOINT_LIMITS.mcp[1]);
    expect(c.pip).toBe(JOINT_LIMITS.pip[1]);
    expect(c.dip).toBe(JOINT_LIMITS.dip[1]);
    const lo = clampCurl('index', { abd: -60, mcp: -60, pip: -60, dip: -60 });
    expect(lo.abd).toBe(JOINT_LIMITS.abd[0]);
    expect(lo.mcp).toBe(JOINT_LIMITS.mcp[0]);
    expect(lo.pip).toBe(JOINT_LIMITS.pip[0]);
    expect(lo.dip).toBe(JOINT_LIMITS.dip[0]);
  });

  it('DIP defaults to 2/3 of PIP and thumb uses its own limits', () => {
    const c = clampCurl('middle', { mcp: 50, pip: 60 });
    expect(c.dip).toBeCloseTo(40);
    const t = clampCurl('thumb', { mcp: 90, pip: 120 });
    expect(t.mcp).toBe(JOINT_LIMITS.thumbMcp[1]);
    expect(t.pip).toBe(JOINT_LIMITS.thumbIp[1]);
  });
});

describe('anthropometric finger lengths', () => {
  it('matches the anatomical ratios: index .96, ring .95, pinky .79 of middle', () => {
    expect(FINGER_LEN.index).toBeCloseTo(0.96, 2);
    expect(FINGER_LEN.middle).toBeCloseTo(1.0, 2);
    expect(FINGER_LEN.ring).toBeCloseTo(0.95, 2);
    expect(FINGER_LEN.pinky).toBeCloseTo(0.79, 2);
    // phalanx 1 : 0.62 : 0.45
    expect(PHALANX[1] / PHALANX[0]).toBeCloseTo(0.62, 2);
    expect(PHALANX[2] / PHALANX[0]).toBeCloseTo(0.45, 2);
  });

  it('finger chain tip = base + phalanx lengths along the curl', () => {
    const jp = fingerJoints('middle', { abd: 0, mcp: 0, pip: 0, dip: 0 }, 10, false, 9, 11);
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(d(jp[1], jp[0])).toBeCloseTo(10 * PHALANX[0], 5);
    expect(d(jp[2], jp[1])).toBeCloseTo(10 * PHALANX[1], 5);
    expect(d(jp[3], jp[2])).toBeCloseTo(10 * PHALANX[2], 5);
  });
});

describe('keystroke frames put the striking fingertip on a keycap', () => {
  // the keyboard's home-row band in viewmodel units (art rows 5-24, centred)
  const KEY = { x0: -36, x1: 36, y0: 10, y1: 34 };
  const strikes: [string, number, FingerName][] = [
    ['kbd.typeA', 0, 'index'],
    ['kbd.typeB', 1, 'middle'],
    ['kbd.enter', 1, 'ring'],
  ];
  for (const [pose, hand, finger] of strikes) {
    for (const gender of ['male', 'female'] as Gender[]) {
      it(`${pose} ${gender} ${finger} lands inside the key zone`, () => {
        const [x, y] = vmTip(pose, hand, finger, gender);
        expect(x).toBeGreaterThanOrEqual(KEY.x0);
        expect(x).toBeLessThanOrEqual(KEY.x1);
        expect(y).toBeGreaterThanOrEqual(KEY.y0);
        expect(y).toBeLessThanOrEqual(KEY.y1);
      });
    }
  }
});

describe('mouse click keeps the index fingertip over the left button', () => {
  const BTN = { x0: -10, x1: 0, y0: 16, y1: 30 };
  for (const pose of ['mouse.rest', 'mouse.click']) {
    for (const gender of ['male', 'female'] as Gender[]) {
      it(`${pose} ${gender} index over the left button`, () => {
        const [x, y] = vmTip(pose, 0, 'index', gender);
        expect(x).toBeGreaterThanOrEqual(BTN.x0);
        expect(x).toBeLessThanOrEqual(BTN.x1);
        expect(y).toBeGreaterThanOrEqual(BTN.y0);
        expect(y).toBeLessThanOrEqual(BTN.y1);
      });
    }
  }
});

describe('rasterizer perspective option', () => {
  const scene: Prim[] = [
    { shape: 'ell', c: [10, 20, 0], r: [14, 18, 10], col: '#c8ccd8' },
    { shape: 'ell', c: [-16, 30, -10], r: [8, 8, 8], col: '#8a92a8' },
    { shape: 'box', c: [0, 10, 4], r: [12, 6, 6], yaw: 20, col: '#5a6070' },
  ];
  it('is deterministic and byte-identical between unset and persp:0', () => {
    const a = rasterize(96, 64, scene, { view: 0 });
    const b = rasterize(96, 64, scene, { view: 0 });
    const c = rasterize(96, 64, scene, { view: 0, persp: 0 });
    expect(eq(a.rgba, b.rgba)).toBe(true);
    expect(eq(a.rgba, c.rgba)).toBe(true);
  });
  it('perspective changes the image (near prims foreshorten)', () => {
    const a = rasterize(96, 64, scene, { view: 0 });
    const p = rasterize(96, 64, scene, { view: 0, persp: 420 });
    expect(eq(a.rgba, p.rgba)).toBe(false);
  });
});

describe('baked hand sprites stay under the clearance line', () => {
  it('bakeRig produces opaque art cached per (pose, gender, skin)', () => {
    const fr = POSES['kbd.rest'];
    const a = bakeRig('kbd.rest', fr, { gender: 'male', skin });
    const b = bakeRig('kbd.rest', fr, { gender: 'male', skin });
    expect(a.c).toBe(b.c); // PartCache hit
    expect(a.top).toBeLessThan(fr.h * RES);
    expect(a.bot).toBeGreaterThan(a.top);
  });

  it('every tool\u2019s rest pose keeps all opaque pixels below the VM line', () => {
    const W = 320, H = 168;
    for (const tool of toolRegistry.all()) {
      const c = new FakeCanvas();
      c.width = W * RES;
      c.height = H * RES;
      const g = c.getContext();
      g.scale(RES, RES);
      drawToolViewmodel(g as any, tool, W, H, 0, 'female', 0, 9, {
        sinceUse: 9, sinceConfirm: 9, confirmGood: true, time: 9, ammo: 3,
        skin: ['#c8885a', '#9a6038', '#e8b080'], lower: 0,
      });
      const line = Math.floor(vmLine(H) * RES);
      const d = g.getImageData(0, 0, W * RES, H * RES).data;
      let bad = 0;
      for (let y = 0; y < line; y++)
        for (let x = 0; x < W * RES; x++) if (d[(y * W * RES + x) * 4 + 3] > 40) bad++;
      expect(bad).toBe(0);
    }
  });
});
