import { describe, expect, it } from 'vitest';
import { missionById } from '../src/content/missions';
import { WorldMap } from '../src/engine/map';
import { openerStats } from '../src/render/probe';
import { computeSectorLight } from '../src/render/sectorLight';

describe('opener probe statistics', () => {
  const view = (w: number, h: number, px: (x: number, y: number) => number) => {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = px(x, y);
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    return { w, h, data };
  };

  it('a pure-black view is all void', () => {
    const s = openerStats(view(30, 30, () => 0));
    expect(s.darkFrac).toBe(1);
    expect(s.mean).toBe(0);
  });

  it('splits ceiling and floor bands', () => {
    // bright top third, black elsewhere
    const s = openerStats(view(30, 30, (_x, y) => (y < 10 ? 200 : 0)));
    expect(s.ceil).toBeCloseTo(200, 0);
    expect(s.floor).toBe(0);
    expect(s.darkFrac).toBeCloseTo(2 / 3, 2);
  });
});

describe('M12 opener lighting (P1-12)', () => {
  const m12 = missionById('m12')!;
  const map = new WorldMap(m12.map);
  const lit = computeSectorLight(map, m12.map, m12.entities, 'm12');
  const at = (x: number, y: number) => lit.light[y * map.w + x];

  it('raises the world ambient floor above the default 0.038', () => {
    expect(m12.map.look?.ambient ?? 0).toBeGreaterThanOrEqual(0.06);
  });

  it('the spawn hall and the route strip to the SECURE door read lit', () => {
    const sx = Math.floor(m12.map.spawn.x);
    const sy = Math.floor(m12.map.spawn.y);
    expect(map.lightAt(sx, sy)).toBeGreaterThanOrEqual(0.9);
    for (let y = 21; y <= 26; y++) expect(at(19, y), `strip 19,${y}`).toBeGreaterThan(0.6);
  });

  it('keeps the mid/late-mission strobing sectors (look gate: m04+)', () => {
    expect(lit.strobeCount).toBeGreaterThanOrEqual(1);
  });
});
