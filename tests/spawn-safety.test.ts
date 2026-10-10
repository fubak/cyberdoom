import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { WorldMap } from '../src/engine/map';
import { MissionRuntime } from '../src/missions/runtime';
import { EventBus } from '../src/core/events';
import { difficultyScale } from '../src/missions/difficulty';

/**
 * Doom-safe starts, for every mission:
 *  - no non-dormant, aggro-capable enemy within 8 tiles of the player start;
 *  - none with a clear line of sight to the start;
 *  - live enemies carry a ~3 s opening grace so they cannot aggro on frame 1;
 *  - effective aggro radius is capped (~10 tiles) so un-sighted enemies never
 *    spot the player across half the map.
 */
const AGGRO_KINDS = new Set(['chase', 'wander', 'patrol']);
const ordered = missionRegistry.all().sort((a, b) => a.id.localeCompare(b.id));

describe('spawn safety', () => {
  for (const m of ordered) {
    it(`${m.id}: live aggro-capable enemies are >=8 tiles away and out of sight`, () => {
      const world = new WorldMap(m.map);
      const { x: sx, y: sy } = m.map.spawn;
      const live = m.entities.filter(
        (e) => e.kind === 'enemy' && !e.dormant && AGGRO_KINDS.has(e.ai ?? ''),
      );
      expect(live.length, `${m.id} has no live enemies to check`).toBeGreaterThanOrEqual(1);
      for (const e of live) {
        const dist = Math.hypot(e.x - sx, e.y - sy);
        const sightLine = world.raycast(sx, sy, Math.atan2(e.y - sy, e.x - sx), dist).dist >= dist - 0.2;
        expect(
          dist >= 8 && !sightLine,
          `${m.id}:${e.id} at (${e.x},${e.y}) is ${dist.toFixed(1)} tiles from spawn, LOS=${sightLine}`,
        ).toBe(true);
      }
    });

    it(`${m.id}: live enemies spawn with an opening aggro grace`, () => {
      const rt = new MissionRuntime(m, new EventBus());
      const live = rt.entities.filter(
        (e) => e.alive && e.def.kind === 'enemy' && AGGRO_KINDS.has(e.def.ai ?? ''),
      );
      for (const e of live) {
        expect(
          (e.state.spawnGrace as number | undefined) ?? 0,
          `${m.id}:${e.def.id} has no opening grace`,
        ).toBeGreaterThanOrEqual(2.5);
      }
    });
  }

  it('caps effective aggro radius at ~10 tiles for un-sighted enemies', () => {
    for (let d = 1; d <= 12; d++) {
      expect(difficultyScale(d).aggro, `d${d} aggro exceeds the cap`).toBeLessThanOrEqual(10.1);
    }
  });
});
