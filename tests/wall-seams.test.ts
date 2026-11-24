import { describe, expect, it } from 'vitest';
import { missionById } from '../src/content/missions';
import { WorldMap } from '../src/engine/map';
import { computeSectorLight } from '../src/render/sectorLight';
import { cornerJitter, wallCorners, wallFaceLight, type WallLightCtx } from '../src/render/wallLight';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A tiny map: one straight north wall over a 4-tile corridor. */
function corridor(light: number[], sector: number[]): WallLightCtx {
  // row 0 = wall, row 1 = open tiles 0..3, row 2 = wall
  return {
    light: (x, y) => (y === 1 && x >= 0 && x < 4 ? light[x] : 0),
    solid: (x, y) => y !== 1 || x < 0 || x >= 4,
    sector: (x, y) => (y === 1 && x >= 0 && x < 4 ? sector[x] : -1),
  };
}

describe('wall corner light (P1-11 seams)', () => {
  it('wallCorners returns the face edge grid points in wallFace vertex order', () => {
    // east-facing face of wall (5,5): x = 6, from z = 6 (left) to z = 5 (right)
    expect(wallCorners(5, 5, 1, 0)).toEqual([[6, 6], [6, 5]]);
    // south-facing face: z = 6, from x = 5 (left) to x = 6 (right)
    expect(wallCorners(5, 5, 0, 1)).toEqual([[5, 6], [6, 6]]);
    expect(wallCorners(5, 5, -1, 0)).toEqual([[5, 5], [5, 6]]);
    expect(wallCorners(5, 5, 0, -1)).toEqual([[6, 5], [5, 5]]);
  });

  it('adjacent faces of one sector agree at their shared corner (no hard step)', () => {
    const ctx = corridor([0.9, 0.3, 0.3, 0.9], [0.6, 0.6, 0.6, 0.6]);
    // north wall cells (x, 0) face south (0, 1) into (x, 1)
    const a = wallFaceLight(0, 0, 0, 1, ctx);
    const b = wallFaceLight(1, 0, 0, 1, ctx);
    // a's right edge and b's left edge are the same grid point x = 1
    expect(a[1]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo((0.9 + 0.3) / 2, 9);
  });

  it('keeps the authored step at a sector boundary', () => {
    const ctx = corridor([0.9, 0.9, 0.2, 0.2], [0.9, 0.9, 0.2, 0.2]);
    const a = wallFaceLight(1, 0, 0, 1, ctx);
    const b = wallFaceLight(2, 0, 0, 1, ctx);
    expect(a[1]).toBeCloseTo(0.9, 9);
    expect(b[0]).toBeCloseTo(0.2, 9);
  });

  it('cornerJitter is deterministic and within +-7%', () => {
    for (let i = 0; i < 200; i++) {
      const j = cornerJitter(i, i * 3 + 1, 12345);
      expect(j).toBe(cornerJitter(i, i * 3 + 1, 12345));
      expect(j).toBeGreaterThanOrEqual(0.93);
      expect(j).toBeLessThanOrEqual(1.07);
    }
  });

  it('M01: no light discontinuity across shared corners of same-sector collinear wall faces', () => {
    const mission = missionById('m01')!;
    const map = new WorldMap(mission.map);
    const lit = computeSectorLight(map, mission.map, mission.entities, 'm01');
    const ctx: WallLightCtx = {
      light: (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? 0 : lit.light[y * map.w + x]),
      solid: (x, y) => {
        const k = map.cellAt(x, y)?.kind;
        return k === undefined || k === 'wall' || k === 'door';
      },
      sector: (x, y) => map.lightAt(x, y),
    };
    const seed = 777;
    // corner key (grid point + face normal) -> values seen from each face there
    const seen = new Map<string, { v: number; sector: number }[]>();
    let faces = 0;
    let oldMaxStep = 0;
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        if (map.cellAt(tx, ty)?.kind !== 'wall') continue;
        for (const [dx, dz] of DIRS) {
          const n = map.cellAt(tx + dx, ty + dz);
          if (!n || n.kind === 'wall' || n.kind === 'door') continue;
          faces++;
          const [l, r] = wallFaceLight(tx, ty, dx, dz, ctx);
          const [cl, cr] = wallCorners(tx, ty, dx, dz);
          const sector = map.lightAt(tx + dx, ty + dz);
          for (const [[vx, vy], v] of [[cl, l * cornerJitter(cl[0], cl[1], seed)], [cr, r * cornerJitter(cr[0], cr[1], seed)]] as const) {
            const key = `${vx},${vy},${dx},${dz}`;
            const list = seen.get(key) ?? [];
            seen.set(key, [...list, { v, sector }]);
          }
          // the previous per-face shading: one flat value per face
          const along = [dz, -dx];
          const next = map.cellAt(tx + dx + along[0], ty + dz + along[1]);
          const nextWall = map.cellAt(tx + along[0], ty + along[1]);
          if (next && next.kind !== 'wall' && next.kind !== 'door' && nextWall?.kind === 'wall' && map.lightAt(tx + dx + along[0], ty + dz + along[1]) === sector) {
            oldMaxStep = Math.max(oldMaxStep, Math.abs(ctx.light(tx + dx, ty + dz) - ctx.light(tx + dx + along[0], ty + dz + along[1])));
          }
        }
      }
    }
    expect(faces).toBeGreaterThan(100);
    // the M01 lamp pools do vary tile to tile: the old flat shading stepped
    expect(oldMaxStep).toBeGreaterThan(0.1);
    let shared = 0;
    for (const list of seen.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].sector !== list[j].sector) continue;
          shared++;
          expect(Math.abs(list[i].v - list[j].v)).toBeLessThan(1e-9);
        }
      }
    }
    expect(shared).toBeGreaterThan(50);
  });
});
