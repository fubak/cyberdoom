import { describe, expect, it } from 'vitest';
import { rasterize, type Prim } from '../src/render/model';
import { scaleModel } from '../src/render/sprites';
import { bone, chargeModel, medkitModel, personModel, serverRackModel, workstationModel, type PersonLook } from '../src/render/propModels';

/** LOOK: props, pickups and people as models, and the camera tilt they are shot with. */

const RES = 4;
const solidAt = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3] === 255;

describe('rasterizer camera tilt', () => {
  const slab: Prim = { shape: 'box', c: [0, 20, 0], r: [10, 5, 10], col: '#808080' };
  const W = 64;
  const H = 64;
  const top = (d: Uint8ClampedArray) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solidAt(d, W, x, y)) return y; return H; };

  it('shows the top face of a box when the camera tilts down', () => {
    const level = rasterize(W, H, [slab], { view: 0 }).rgba;
    const tilted = rasterize(W, H, [slab], { view: 0, tilt: 0.4 }).rgba;
    // level: the silhouette is just the 10-unit-tall front face; tilted: the top face adds height
    const height = (d: Uint8ClampedArray) => { let n = 0; for (let y = 0; y < H; y++) if (solidAt(d, W, W / 2, y)) n++; return n; };
    expect(height(level)).toBe(10);
    expect(height(tilted)).toBeGreaterThan(14);
  });

  it('lift raises the whole model by that many pixels', () => {
    const a = rasterize(W, H, [slab], { view: 0, tilt: 0.4 }).rgba;
    const b = rasterize(W, H, [slab], { view: 0, tilt: 0.4, lift: 6 }).rgba;
    expect(top(a) - top(b)).toBe(6);
  });

  it('tilt 0 is the level camera', () => {
    const a = rasterize(W, H, [slab], { view: 0.3 }).rgba;
    const b = rasterize(W, H, [slab], { view: 0.3, tilt: 0 }).rgba;
    expect(b).toEqual(a);
  });
});

describe('bone', () => {
  it('lays one stretched ellipsoid along the segment', () => {
    const out: Prim[] = [];
    bone(out, [0, 10, 0], [20, 30, 0], 2, '#fff');
    expect(out).toHaveLength(1);
    const d = rasterize(64, 64, out, { view: 0 }).rgba;
    // on the segment: solid; mirrored across it: empty
    expect(solidAt(d, 64, 32 + 10, 63 - 20)).toBe(true);
    expect(solidAt(d, 64, 32 - 10, 63 - 20)).toBe(false);
    expect(solidAt(d, 64, 32 + 17, 63 - 27)).toBe(true);
  });

  it('follows a limb that leans toward the viewer', () => {
    const out: Prim[] = [];
    bone(out, [0, 10, 0], [0, 30, 12], 2, '#fff');
    // seen from the side (quarter orbit) the lean shows as a slant
    const d = rasterize(64, 64, out, { view: Math.PI / 2 }).rgba;
    let lo = 0, hi = 0, nLo = 0, nHi = 0;
    for (let x = 0; x < 64; x++) {
      if (solidAt(d, 64, x, 63 - 14)) { lo += x; nLo++; }
      if (solidAt(d, 64, x, 63 - 26)) { hi += x; nHi++; }
    }
    expect(nLo).toBeGreaterThan(0);
    expect(nHi).toBeGreaterThan(0);
    expect(Math.abs(hi / nHi - lo / nLo)).toBeGreaterThan(4);
  });
});

describe('model sets fit their sprite canvas', () => {
  const NPC: PersonLook = { shirt: '#3a6ad0', pants: '#2f3442', skin: '#e0a878', hair: '#4a3020', longHair: false, lanyard: '#ffb020', headset: true, tablet: true };
  const grow = (prims: Prim[], k: number): Prim[] => prims.map((p) => ({ ...p, c: [p.c[0] * k, p.c[1] * k, p.c[2] * k], r: [p.r[0] * k, p.r[1] * k, p.r[2] * k] }));
  // [name, prims, canvas w, canvas h, raster options] — the options mirror buildSprites()
  const cases: [string, Prim[], number, number, { view?: number; tilt?: number; lift?: number }][] = [
    ['workstation', workstationModel(false), 64, 64, { view: -0.5, tilt: 0.3, lift: 6 }],
    ['workstation infected', workstationModel(true, 1), 64, 64, { view: -0.5, tilt: 0.3, lift: 6 }],
    ['server rack', grow(serverRackModel(0), 0.93), 48, 64, { view: -0.55, tilt: 0.12, lift: 2 }],
    ['medkit', medkitModel(), 32, 32, { view: -0.6, tilt: 0.3, lift: 3 }],
    ['charge', chargeModel(1), 32, 32, { view: 0.4, tilt: 0.3, lift: 3 }],
    ['person front', personModel(NPC, Math.PI / 2), 32, 64, {}],
    ['person side', personModel(NPC, Math.PI / 2), 32, 64, { view: Math.PI / 2 }],
  ];
  for (const [name, prims, cw, ch, o] of cases) {
    it(`${name}: nothing is cut off at the top or sides, and it fills a fair share of the canvas`, () => {
      const W = cw * RES, H = ch * RES;
      const d = rasterize(W, H, scaleModel(prims), { view: o.view ?? 0, tilt: o.tilt, lift: (o.lift ?? 0) * RES }).rgba;
      let count = 0;
      for (let x = 0; x < W; x++) expect(solidAt(d, W, x, 0)).toBe(false);
      for (let y = 0; y < H; y++) {
        expect(solidAt(d, W, 0, y)).toBe(false);
        expect(solidAt(d, W, W - 1, y)).toBe(false);
        for (let x = 0; x < W; x++) if (solidAt(d, W, x, y)) count++;
      }
      expect(count / (W * H)).toBeGreaterThan(0.12);
    });
  }
});

describe('people', () => {
  const base: PersonLook = { shirt: '#3a6ad0', pants: '#2f3442', skin: '#e0a878', hair: '#4a3020', longHair: false, lanyard: '#ffb020' };
  it('adds the role props asked for', () => {
    const plain = personModel(base).length;
    expect(personModel({ ...base, headset: true }).length).toBeGreaterThan(plain);
    expect(personModel({ ...base, longHair: true }).length).toBe(plain + 1);
    expect(personModel({ ...base, tie: '#a01818' }).length).toBe(plain + 1);
    expect(personModel({ ...base, tablet: true }).some((p) => p.glow)).toBe(true);
    expect(personModel(base).some((p) => p.glow)).toBe(false);
  });

  it('moves the legs with the walk phase', () => {
    const stand = JSON.stringify(personModel(base, 0).map((p) => p.c));
    const step = JSON.stringify(personModel(base, Math.PI / 2).map((p) => p.c));
    expect(step).not.toBe(stand);
  });
});
