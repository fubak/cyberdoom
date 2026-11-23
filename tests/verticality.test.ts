import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { MAX_STEP_UP, WorldMap } from '../src/engine/map';

describe('P2.1 playable vertical set-pieces (stairs, lifts, balconies, courtyards)', () => {
  it('blocks direct climb onto a 0.66 balcony ledge while allowing 0.22 stair steps and drop-offs', () => {
    const map = new WorldMap({
      grid: [
        '########',
        '#..12.B#',
        '########',
      ],
      legend: {
        '#': { kind: 'wall', tex: 'wall-panel' },
        '.': { kind: 'floor', tex: 'floor' },
        '1': { kind: 'floor', tex: 'floor', floorHeight: 0.22 },
        '2': { kind: 'floor', tex: 'floor', floorHeight: 0.44 },
        B: { kind: 'floor', tex: 'floor', floorHeight: 0.66 },
      },
      spawn: { x: 1.5, y: 1.5, angle: 0 },
      defaultLight: 0.8,
      lights: {},
    });

    // Stepping from floor (0) onto step 1 (0.22 <= MAX_STEP_UP) succeeds
    const onStep1 = map.resolve(3.3, 1.5, 0.22, 0);
    expect(onStep1.x).toBeCloseTo(3.3, 3);

    // Trying to step from floor (0) at tile 5 directly into B (tile 6, 0.66 > MAX_STEP_UP) is pushed back
    const blocked = map.resolve(5.9, 1.5, 0.22, 0);
    expect(blocked.x).toBeLessThanOrEqual(6.0 - 0.22 + 1e-4);

    // Dropping from B (0.66) down to floor (0) is allowed
    const drop = map.resolve(5.5, 1.5, 0.22, 0.66);
    expect(drop.x).toBeCloseTo(5.5, 3);
  });

  it('cycles lift state through idle-low -> rising -> hold-high -> lowering -> idle-low and persists in snapshot', () => {
    const map = new WorldMap({
      grid: [
        '#####',
        '#.L.#',
        '#####',
      ],
      legend: {
        '#': { kind: 'wall', tex: 'wall-panel' },
        '.': { kind: 'floor', tex: 'floor' },
        L: { kind: 'floor', tex: 'floor', lift: { id: 'main', low: 0, high: 0.66, speed: 1.0, hold: 1.0 } },
      },
      spawn: { x: 1.5, y: 1.5, angle: 0 },
      defaultLight: 0.8,
      lights: {},
    });

    expect(map.floorHeightAt(2, 1)).toBe(0);
    expect(map.stepOnLift(2, 1)).toBe(true);
    expect(map.liftState('main')?.state).toBe('rising');

    map.updateLifts(0.4);
    expect(map.floorHeightAt(2, 1)).toBeCloseTo(0.4, 3);

    const snap = map.snapshot();
    map.updateLifts(0.5);
    expect(map.liftState('main')?.state).toBe('hold-high');
    expect(map.floorHeightAt(2, 1)).toBeCloseTo(0.66, 3);

    map.updateLifts(1.1);
    expect(map.liftState('main')?.state).toBe('lowering');

    map.updateLifts(1.0);
    expect(map.liftState('main')?.state).toBe('idle-low');
    expect(map.floorHeightAt(2, 1)).toBe(0);

    // Restore mid-rise snapshot
    map.restore(snap);
    expect(map.liftState('main')?.state).toBe('rising');
    expect(map.floorHeightAt(2, 1)).toBeCloseTo(0.4, 3);
  });

  it('populates playable stairs, balconies, working lifts, and open-air courtyards across campaign missions', () => {
    let missionsWithStairsAndBalcony = 0;
    let missionsWithLift = 0;
    let missionsWithCourtyard = 0;

    for (const m of missionRegistry.all()) {
      const map = new WorldMap(m.map);
      let stairs = 0;
      let balconies = 0;
      let lifts = 0;
      let skyTiles = 0;

      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const c = map.cellAt(x, y);
          if (!c) continue;
          if (c.lift) {
            lifts++;
            expect(map.ceilHeightAt(x, y)).toBeGreaterThanOrEqual(c.lift.high + 1.18 - 1e-6);
          } else if (c.kind === 'floor') {
            const fh = c.floorHeight ?? 0;
            if (fh >= 0.2 && fh <= 0.5) stairs++;
            if (fh >= 0.6) {
              balconies++;
              expect(map.ceilHeightAt(x, y)).toBeGreaterThanOrEqual(fh + 1.18 - 1e-6);
            }
          }
          if (c.sky) skyTiles++;
        }
      }

      if (stairs >= 2 && balconies >= 2) missionsWithStairsAndBalcony++;
      if (lifts >= 1) missionsWithLift++;
      if (skyTiles >= 9) missionsWithCourtyard++;

      // Vertical BFS reachability: every balcony tile must be reachable from spawn
      // using only <= MAX_STEP_UP transitions or lift bridges
      const sx = Math.floor(m.map.spawn.x);
      const sy = Math.floor(m.map.spawn.y);
      const visited = new Set<string>([`${sx},${sy}`]);
      const queue: [number, number][] = [[sx, sy]];
      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        const cur = map.cellAt(cx, cy);
        const curMaxH = cur?.lift ? cur.lift.high : (cur?.floorHeight ?? 0);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          const next = map.cellAt(nx, ny);
          if (!next || next.kind === 'wall') continue;
          const nextMinH = next.lift ? next.lift.low : (next.floorHeight ?? 0);
          if (nextMinH <= curMaxH + MAX_STEP_UP + 1e-6) {
            visited.add(key);
            queue.push([nx, ny]);
          }
        }
      }

      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const c = map.cellAt(x, y);
          if (c && c.kind === 'floor' && (c.floorHeight ?? 0) >= 0.6) {
            expect(visited.has(`${x},${y}`), `${m.id} balcony (${x},${y}) must be vertically reachable`).toBe(true);
          }
        }
      }
    }

    expect(missionsWithStairsAndBalcony).toBeGreaterThanOrEqual(6);
    expect(missionsWithLift).toBeGreaterThanOrEqual(6);
    expect(missionsWithCourtyard).toBeGreaterThanOrEqual(4);
  });
});
