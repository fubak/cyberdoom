import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';

/**
 * Reachability guard: a solid entity (workstation/console/npc — the kinds the
 * engine treats as colliders that persist after their objective is done)
 * must never block the path to the exit or to a required-objective target.
 * Mirrors the solidity rule in main.ts: alive enemies move/die, so only the
 * persistent kinds block the BFS.
 */
const SOLID_KINDS = new Set(['workstation', 'console', 'npc']);

function passable(kind: string | undefined): boolean {
  return kind !== undefined && kind !== 'wall';
}

describe('mission reachability', () => {
  for (const m of missionRegistry.all()) {
    it(`${m.id}: exit and required-objective entities are reachable, no doorway blockers`, () => {
      const { grid, legend, spawn } = m.map;
      const h = grid.length;
      const w = grid[0].length;
      const cellKind = (x: number, y: number) =>
        (x < 0 || y < 0 || x >= w || y >= h) ? 'wall' : legend[grid[y][x]]?.kind;

      const blocked = new Set<string>();
      for (const e of m.entities) {
        if (SOLID_KINDS.has(e.kind)) blocked.add(`${Math.floor(e.x)},${Math.floor(e.y)}`);
      }

      // BFS over passable, unblocked cells (doors passable).
      const seen = new Set<string>();
      const q: [number, number][] = [[Math.floor(spawn.x), Math.floor(spawn.y)]];
      seen.add(`${q[0][0]},${q[0][1]}`);
      while (q.length) {
        const [cx, cy] = q.shift()!;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          const key = `${nx},${ny}`;
          if (seen.has(key) || blocked.has(key) || !passable(cellKind(nx, ny))) continue;
          seen.add(key);
          q.push([nx, ny]);
        }
      }

      // Exit reachable.
      let exitCell: [number, number] | null = null;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (cellKind(x, y) === 'exit') exitCell = [x, y];
        }
      }
      expect(exitCell, `${m.id} has an exit cell`).not.toBeNull();
      expect(seen.has(`${exitCell![0]},${exitCell![1]}`), `${m.id} exit reachable`).toBe(true);

      // Required-objective entities: some adjacent passable cell must be reachable.
      const requiredTags = new Set(
        m.missionObjectives.filter((o) => o.kind !== 'avoid').map((o) => o.tag),
      );
      for (const e of m.entities) {
        if (!e.tags?.some((t) => requiredTags.has(t))) continue;
        const ex = Math.floor(e.x);
        const ey = Math.floor(e.y);
        const adjacent = [[ex + 1, ey], [ex - 1, ey], [ex, ey + 1], [ex, ey - 1]];
        const reachable = adjacent.some(
          ([ax, ay]) => passable(cellKind(ax, ay)) && seen.has(`${ax},${ay}`),
        );
        expect(reachable, `${m.id}: ${e.id} at (${e.x},${e.y}) unreachable`).toBe(true);
      }

      // No solid entity on a doorway / 1-wide corridor cell (both opposite
      // neighbours walls).
      for (const e of m.entities) {
        if (!SOLID_KINDS.has(e.kind)) continue;
        const x = Math.floor(e.x);
        const y = Math.floor(e.y);
        const n = cellKind(x, y - 1) === 'wall';
        const s = cellKind(x, y + 1) === 'wall';
        const west = cellKind(x - 1, y) === 'wall';
        const east = cellKind(x + 1, y) === 'wall';
        expect(
          !((n && s) || (west && east)),
          `${m.id}: ${e.id} at (${x},${y}) sits on a doorway/corridor cell`,
        ).toBe(true);
      }
    });
  }
});
