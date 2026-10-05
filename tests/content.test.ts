import { describe, it, expect } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { objectiveById, OBJECTIVES } from '../src/content/objectives';
import type { Mission } from '../src/core/types';

/** BFS reachability from spawn to an exit tile. */
function reachableExit(m: Mission): boolean {
  const grid = m.map.grid;
  const h = grid.length;
  const w = grid[0].length;
  const passable = (x: number, y: number) => {
    const c = m.map.legend[grid[y][x]];
    return c && c.kind !== 'wall';
  };
  const sx = Math.floor(m.map.spawn.x);
  const sy = Math.floor(m.map.spawn.y);
  const seen = new Set<string>([`${sx},${sy}`]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const cell = m.map.legend[grid[y][x]];
    if (cell?.kind === 'exit') return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seen.has(`${nx},${ny}`) || !passable(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return false;
}

/** Protected gates deliberately keep the critical path inaccessible without a badge. */
function reachableGatedExit(m: Mission): boolean {
  const grid = m.map.grid;
  const h = grid.length;
  const w = grid[0].length;
  const passable = (x: number, y: number) => {
    const c = m.map.legend[grid[y][x]];
    return c && c.kind !== 'wall' &&
      !(c.kind === 'door' && (c.locked || (c.accessRole && !c.secret)));
  };
  const sx = Math.floor(m.map.spawn.x);
  const sy = Math.floor(m.map.spawn.y);
  const seen = new Set<string>([`${sx},${sy}`]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (m.map.legend[grid[y][x]]?.kind === 'exit') return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seen.has(`${nx},${ny}`) || !passable(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return false;
}

function reachableArea(m: Mission, area: [number, number, number, number]): boolean {
  const grid = m.map.grid;
  const h = grid.length;
  const w = grid[0].length;
  const sx = Math.floor(m.map.spawn.x);
  const sy = Math.floor(m.map.spawn.y);
  const seen = new Set<string>([`${sx},${sy}`]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x >= area[0] && x <= area[2] && y >= area[1] && y <= area[3]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const cell = m.map.legend[grid[ny][nx]];
      if (seen.has(`${nx},${ny}`) || cell?.kind === 'wall') continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return false;
}

describe('objective catalog', () => {
  it('covers all 5 domains', () => {
    for (let d = 1; d <= 5; d++) {
      expect(OBJECTIVES.some((o) => o.domain === d)).toBe(true);
    }
  });
  it('ids are unique', () => {
    const ids = OBJECTIVES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('missions', () => {
  const missions = missionRegistry.all();
  it('has at least 4 missions', () => {
    expect(missions.length).toBeGreaterThanOrEqual(4);
  });
  it('difficulty increases', () => {
    const d = missions.map((m) => m.difficulty);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  for (const m of missions) {
    describe(m.id, () => {
      it('references valid objective ids', () => {
        for (const id of m.objectives) {
          expect(objectiveById(id), `unknown objective ${id}`).toBeDefined();
        }
      });
      it('map is rectangular and wall-enclosed', () => {
        const grid = m.map.grid;
        const w = grid[0].length;
        for (const row of grid) expect(row.length).toBe(w);
        for (let x = 0; x < w; x++) {
          expect(m.map.legend[grid[0][x]]?.kind).toBe('wall');
          expect(m.map.legend[grid[grid.length - 1][x]]?.kind).toBe('wall');
        }
        for (const row of grid) {
          expect(m.map.legend[row[0]]?.kind).toBe('wall');
          expect(m.map.legend[row[w - 1]]?.kind).toBe('wall');
        }
      });
      it('exit is reachable from spawn', () => {
        expect(reachableExit(m)).toBe(true);
      });
      it('critical path is gated', () => {
        expect(reachableGatedExit(m)).toBe(false);
      });
      it('has two reachable secrets with doors open', () => {
        const secrets = m.script?.secrets ?? [];
        expect(secrets.length).toBeGreaterThanOrEqual(2);
        for (const secret of secrets.slice(0, 2)) {
          expect(reachableArea(m, secret.area)).toBe(true);
        }
      });
      it('is at least 40 by 28 tiles', () => {
        expect(m.map.grid[0].length).toBeGreaterThanOrEqual(40);
        expect(m.map.grid.length).toBeGreaterThanOrEqual(28);
      });
      it('entities sit on non-wall cells inside the map', () => {
        for (const e of m.entities) {
          const cell = m.map.legend[m.map.grid[Math.floor(e.y)]?.[Math.floor(e.x)] ?? ''];
          expect(cell, `${e.id} at ${e.x},${e.y}`).toBeDefined();
          expect(cell!.kind).not.toBe('wall');
        }
      });
      it('every question has exactly one correct option and explanations for all options', () => {
        for (const q of m.debriefQuestions) {
          expect(q.options.filter((o) => o.correct).length).toBe(1);
          for (const o of q.options) {
            expect(o.explanation.trim().length, `${q.id}/${o.id}`).toBeGreaterThan(10);
          }
        }
      });
    });
  }
});
