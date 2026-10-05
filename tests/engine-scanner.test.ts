import { describe, expect, it } from 'vitest';
import type { Entity, MapDef, Projectile, ToolUseContext } from '../src/core/types';
import { EventBus } from '../src/core/events';
import { Arsenal } from '../src/tools/arsenal';
import { damageEntity, traceShot, updateProjectiles } from '../src/engine/ai';
import { WorldMap } from '../src/engine/map';

const dt = 1 / 60;
const mapDef: MapDef = {
  grid: [
    '#########',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#########',
  ],
  legend: {
    '#': { kind: 'wall', tex: 'wall' },
    '.': { kind: 'floor', tex: 'floor' },
  },
  spawn: { x: 2.5, y: 2.5, angle: 0 },
};

function enemy(id: string, x: number, y: number): Entity {
  return {
    def: { id, kind: 'enemy', sprite: 'worm', ai: 'chase', x, y },
    x,
    y,
    hp: 2,
    alive: true,
    infected: true,
    state: {},
  };
}

describe('USB scanner trace', () => {
  it('hits the nearest alive entity along the unobstructed ray', () => {
    const near = enemy('near', 4, 2.5);
    const far = enemy('far', 6, 2.5);
    const shot = traceShot(2.5, 2.5, 1, 0, 5, [far, near], new WorldMap(mapDef));
    expect(shot.hit).toBe(near);
    expect(shot.dist).toBeCloseTo(1.5);
    expect(shot.x).toBeCloseTo(4);
    expect(shot.y).toBeCloseTo(2.5);
  });

  it('ignores entities behind walls, outside the hit radius, and beyond range', () => {
    const wallMap = new WorldMap({
      ...mapDef,
      grid: ['#########', '#.......#', '#...#...#', '#.......#', '#.......#', '#########'],
    });
    const behindWall = traceShot(2.5, 2.5, 1, 0, 5, [enemy('behind', 5.5, 2.5)], wallMap);
    expect(behindWall.hit).toBeNull();
    expect(behindWall.dist).toBeCloseTo(1.5);
    expect(behindWall.x).toBeCloseTo(4);

    const offRay = traceShot(2.5, 2.5, 1, 0, 5, [enemy('off-ray', 4, 3)], new WorldMap(mapDef));
    expect(offRay.hit).toBeNull();
    expect(offRay.dist).toBeCloseTo(5);

    const outOfRange = traceShot(2.5, 2.5, 1, 0, 1.4, [enemy('far', 4, 2.5)], new WorldMap(mapDef));
    expect(outOfRange.hit).toBeNull();
    expect(outOfRange.dist).toBeCloseTo(1.4);
    expect(Math.hypot(outOfRange.x - 2.5, outOfRange.y - 2.5)).toBeCloseTo(1.4);
  });

  it('keeps cosmetic tracer projectiles from damaging or emitting impacts', () => {
    const target = enemy('target', 3.5, 2.5);
    const cosmetic: Projectile = {
      x: 2.5,
      y: 2.5,
      dx: 1,
      dy: 0,
      speed: 60,
      range: 10,
      traveled: 0,
      source: 'usb-scanner',
      alive: true,
      cosmetic: true,
    };
    expect(updateProjectiles([cosmetic], [target], new WorldMap(mapDef), dt)).toEqual([]);
    expect(target.hp).toBe(2);
    expect(cosmetic.alive).toBe(true);

    const shortTracer = { ...cosmetic, range: 0.5, traveled: 0, alive: true };
    expect(updateProjectiles([shortTracer], [target], new WorldMap(mapDef), dt)).toEqual([]);
    expect(shortTracer.alive).toBe(false);
    expect(target.hp).toBe(2);
  });

  it('fires and traces through the real Arsenal within the scanner windup budget', () => {
    const bus = new EventBus();
    const arsenal = new Arsenal(bus);
    arsenal.reset({ difficulty: 1 }, 'female');
    arsenal.select(3);
    const target = enemy('target', 7, 2.5);
    let tick = 0;
    let hitTick = -1;
    const context = (): ToolUseContext => ({
      playerX: 2.5,
      playerY: 2.5,
      playerAngle: 0,
      entities: [target],
      projectiles: [],
      wallDistance: 6,
      isDoorAhead: () => null,
      openDoor: () => {},
      bus,
      fireProjectile: (proj) => {
        const shot = traceShot(proj.x, proj.y, proj.dx, proj.dy, proj.range, [target], new WorldMap(mapDef));
        if (shot.hit) {
          damageEntity(shot.hit, 1, proj.dx, proj.dy);
          hitTick = tick;
        }
      },
      aimEntity: () => target,
      authorizedRoles: [],
      role: 'analyst',
    });
    for (tick = 0; tick < 40; tick++) arsenal.update(dt, false, false, context);
    expect(arsenal.current.id).toBe('usb');

    for (tick = 0; tick < 9 && hitTick < 0; tick++) {
      arsenal.update(dt, true, tick === 0, context);
    }
    expect(hitTick).toBeGreaterThanOrEqual(0);
    expect(hitTick).toBeLessThanOrEqual(Math.ceil(0.12 / dt));
    expect(target.hp).toBe(1);
  });
});
