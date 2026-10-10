import { describe, it, expect } from 'vitest';
import { WorldMap } from '../src/engine/map';
import { EYE_HEIGHT, MOVE, Player } from '../src/engine/player';
import type { MapDef } from '../src/core/types';

const def: MapDef = {
  grid: [
    '#####',
    '#...#',
    '#.D.#',
    '#...#',
    '#####',
  ],
  legend: {
    '#': { kind: 'wall', tex: 'wall-panel' },
    '.': { kind: 'floor', tex: 'floor' },
    'D': { kind: 'door', tex: 'door', doorId: 'd1' },
  },
  spawn: { x: 1.5, y: 1.5, angle: 0 },
};

describe('WorldMap', () => {
  it('walls block, floors do not', () => {
    const m = new WorldMap(def);
    expect(m.blocked(0, 0)).toBe(true);
    expect(m.blocked(1, 1)).toBe(false);
    expect(m.blockedF(-1, -1)).toBe(true);
  });
});

describe('doors', () => {
  it('closed door blocks, open door passes', () => {
    const d2: MapDef = { ...def, grid: ['#####', '#...#', '#.D.#', '#...#', '#####'] };
    const m = new WorldMap(d2);
    // cell (2,2) is 'D'
    expect(m.cellAt(2, 2)?.kind).toBe('door');
    expect(m.blocked(2, 2)).toBe(true);
    m.openDoor('d1');
    expect(m.blocked(2, 2)).toBe(false);
  });
  it('animates opening while remaining blocked until the passable threshold', () => {
    const m = new WorldMap(def);
    m.startOpening('d1');
    m.updateDoors(0.1);
    expect(m.doorFrac('d1')).toBeCloseTo(0.1 / 0.55);
    expect(m.blocked(2, 2)).toBe(true);
    m.updateDoors(0.3);
    expect(m.doorFrac('d1')).toBeCloseTo(0.4 / 0.55);
    expect(m.blocked(2, 2)).toBe(false);
    m.updateDoors(0.15);
    expect(m.doorFrac('d1')).toBe(1);
    expect(m.blocked(2, 2)).toBe(false);
  });
});

describe('Player movement', () => {
  it('moves forward along facing', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 1.5, 0); // facing +x
    for (let i = 0; i < 12; i++) p.move(m, 1, 0, false, 0, 1 / 60);
    expect(p.x).toBeGreaterThan(2.7);
  });
  it('reaches run terminal speed and does not tunnel through walls', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 1.5, 0);
    for (let i = 0; i < 300; i++) p.move(m, 1, 0, true, 0, 1 / 60);
    // east wall at x=4; radius keeps player below 4
    expect(p.x).toBeLessThan(4);
    expect(p.x).toBeGreaterThan(3);
  });
  it('reaches the intended run speed in open space', () => {
    const open: MapDef = {
      ...def,
      grid: Array.from({ length: 40 }, (_, y) =>
        y === 0 || y === 39 ? '#'.repeat(40) : `#${'.'.repeat(38)}#`,
      ),
      spawn: { x: 20.5, y: 20.5, angle: 0 },
    };
    const m = new WorldMap(open);
    const walk = new Player(20.5, 20.5, 0);
    const run = new Player(20.5, 20.5, 0);
    expect(EYE_HEIGHT).toBe(0.6);
    for (let i = 0; i < 120; i++) {
      walk.move(m, 1, 0, false, 0, 1 / 60);
      run.move(m, 1, 0, true, 0, 1 / 60);
    }
    expect(Math.hypot(walk.vx, walk.vy) / EYE_HEIGHT).toBeCloseTo(6.95, 1);
    expect(Math.hypot(run.vx, run.vy) / EYE_HEIGHT).toBeCloseTo(13.83, 1);
    expect(MOVE.stopSpeed / EYE_HEIGHT).toBeCloseTo(0.054);
  });
  it('accelerates to 90 percent of run terminal speed in about 0.65 seconds', () => {
    const open: MapDef = {
      ...def,
      grid: Array.from({ length: 40 }, (_, y) =>
        y === 0 || y === 39 ? '#'.repeat(40) : `#${'.'.repeat(38)}#`,
      ),
    };
    const m = new WorldMap(open);
    const p = new Player(20.5, 20.5, 0);
    for (let i = 0; i < 39; i++) p.move(m, 1, 0, true, 0, 1 / 60);
    expect(Math.hypot(p.vx, p.vy) / EYE_HEIGHT).toBeCloseTo(13.83 * 0.9, 1);
    expect(39 / 60).toBeCloseTo(0.65, 1);
  });
  it('slides about 3.9 eye-heights after releasing a full run', () => {
    const open: MapDef = {
      ...def,
      grid: Array.from({ length: 64 }, (_, y) =>
        y === 0 || y === 63 ? '#'.repeat(64) : `#${'.'.repeat(62)}#`,
      ),
    };
    const m = new WorldMap(open);
    const p = new Player(20.5, 20.5, 0);
    for (let i = 0; i < 120; i++) p.move(m, 1, 0, true, 0, 1 / 60);
    const startX = p.x;
    for (let i = 0; i < 105; i++) p.move(m, 0, 0, true, 0, 1 / 60);
    const slideDistance = (p.x - startX) / EYE_HEIGHT;
    expect(slideDistance).toBeGreaterThanOrEqual(3.9 - 0.3);
    expect(slideDistance).toBeLessThanOrEqual(3.9 + 0.3);
    expect(p.vx).toBe(0);
  });
  it('keeps unnormalized SR50 diagonal running speed', () => {
    const open: MapDef = {
      ...def,
      grid: Array.from({ length: 64 }, (_, y) =>
        y === 0 || y === 63 ? '#'.repeat(64) : `#${'.'.repeat(62)}#`,
      ),
      spawn: { x: 10.5, y: 10.5, angle: 0 },
    };
    const m = new WorldMap(open);
    const p = new Player(10.5, 10.5, 0);
    for (let i = 0; i < 120; i++) p.move(m, 1, 1, true, 0, 1 / 60);
    expect(Math.hypot(p.vx, p.vy) / EYE_HEIGHT).toBeCloseTo(13.83 * Math.sqrt(1.64), 1);
  });
  it('slides along the wall when moving diagonally into it', () => {
    const openBeyondEastWall: MapDef = {
      ...def,
      grid: Array.from({ length: 20 }, (_, y) =>
        y === 0 || y === 19 ? '#'.repeat(20) : `#...#${'.'.repeat(14)}#`,
      ),
    };
    const m = new WorldMap(openBeyondEastWall);
    const p = new Player(3.5, 5.5, 0);
    for (let i = 0; i < 36; i++) p.move(m, 1, 1, true, 0, 1 / 60);
    expect(p.x).toBeLessThan(4);
    expect(p.vy).toBeGreaterThan(MOVE.runSpeed * 0.6);
  });
  it('friction stops the player exactly after input ceases', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 2.8, 0);
    for (let i = 0; i < 30; i++) p.move(m, 1, 0, true, 0, 1 / 60);
    for (let i = 0; i < 96; i++) p.move(m, 0, 0, true, 0, 1 / 60);
    expect(Math.hypot(p.vx, p.vy)).toBe(0);
  });
  it('ramps keyboard turning from slow to fast', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 2.5, 0);
    for (let i = 0; i < 6; i++) p.move(m, 0, 0, true, 1, 1 / 60);
    expect(p.angle).toBeCloseTo(0.107, 2);
    for (let i = 6; i < 30; i++) p.move(m, 0, 0, true, 1, 1 / 60);
    const before = p.angle;
    p.move(m, 0, 0, true, 1, 1 / 60);
    expect((p.angle - before) * 60).toBeCloseTo(MOVE.keyTurnRun, 1);
  });
  it('uses the slower terminal keyboard turn rate while walking', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 2.5, 0);
    for (let i = 0; i < 30; i++) p.move(m, 0, 0, false, -1, 1 / 60);
    const before = p.angle;
    p.move(m, 0, 0, false, -1, 1 / 60);
    expect((before - p.angle) * 60).toBeCloseTo(MOVE.keyTurnWalk, 1);
  });
  it('pushes out of solid entities and keeps interpolation state', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 2.5, 0);
    p.move(m, 1, 0, true, 0, 1 / 60, [{ x: 3.3, y: 2.5, r: 0.3 }]);
    expect(Math.hypot(p.x - 3.3, p.y - 2.5)).toBeGreaterThanOrEqual(0.58 - 1e-6);
    p.x = 1.2;
    p.y = 2.3;
    p.snap();
    expect([p.prevX, p.prevY]).toEqual([1.2, 2.3]);
  });
  it('records hurt direction and decays the HUD pain timer', () => {
    const m = new WorldMap(def);
    const p = new Player(2.5, 2.5, 0);
    p.damage(8, 1.5, 2.5);
    expect(p.hurtT).toBe(0.5);
    expect(p.lastHurtFrom).toBeCloseTo(Math.PI);
    p.move(m, 0, 0, false, 0, 0.1);
    expect(p.hurtT).toBeCloseTo(0.4);
  });
});

describe('raycast', () => {
  it('hits the east wall', () => {
    const m = new WorldMap(def);
    const r = m.raycast(1.5, 1.5, 0);
    expect(r.dist).toBeGreaterThan(2);
    expect(r.dist).toBeLessThan(3);
    expect(r.cell?.kind).toBe('wall');
  });
});
