import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { missionRegistry } from '../src/content/missions';
import { WorldMap } from '../src/engine/map';
import { MissionRuntime } from '../src/missions/runtime';
import { walkthroughs, type WalkStep } from '../src/missions/walkthroughs';

type Player = { x: number; y: number; angle: number; integrity: number };
type Point = [number, number];

function tile(point: Point): string {
  return `${point[0]},${point[1]}`;
}

function reachable(map: WorldMap, from: Point, to: Point): boolean {
  const queue: Point[] = [from];
  const seen = new Set([tile(from)]);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === to[0] && y === to[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next: Point = [x + dx, y + dy];
      if (next[0] < 0 || next[1] < 0 || next[0] >= map.w || next[1] >= map.h) continue;
      if (map.blocked(...next) || seen.has(tile(next))) continue;
      seen.add(tile(next));
      queue.push(next);
    }
  }
  return false;
}

function playerTile(player: Player): Point {
  return [Math.floor(player.x), Math.floor(player.y)];
}

function updateThree(rt: MissionRuntime, map: WorldMap, player: Player, use = false): void {
  rt.update(0.05, { player, map, use, openDoor: (doorId) => map.openDoor(doorId) });
}

function runStep(step: WalkStep, rt: MissionRuntime, map: WorldMap, player: Player, bus: EventBus): void {
  if ('goto' in step) {
    const destination = step.goto;
    expect(reachable(map, playerTile(player), destination), `goto ${tile(destination)} from ${tile(playerTile(player))}; done=${rt.objectives.filter((o) => o.done).map((o) => o.def.id).join(",")}`).toBe(true);
    player.x = destination[0] + 0.5;
    player.y = destination[1] + 0.5;
    updateThree(rt, map, player);
    updateThree(rt, map, player);
    updateThree(rt, map, player);
    const cell = map.cellAt(...destination);
    if (cell?.kind === 'exit') bus.emit('reach-exit', {});
    return;
  }
  if ('use' in step) {
    const [tx, ty] = step.use;
    player.angle = Math.atan2(ty + 0.5 - player.y, tx + 0.5 - player.x);
    updateThree(rt, map, player, true);
    return;
  }
  if ('badge' in step) {
    const [tx, ty] = step.badge;
    const cell = map.cellAt(tx, ty);
    expect(cell?.kind).toBe('door');
    player.angle = Math.atan2(ty + 0.5 - player.y, tx + 0.5 - player.x);
    const allowed = cell?.accessRole === undefined || rt.roles.includes(cell.accessRole);
    bus.emit('badge-door', {
      doorId: cell?.doorId ?? '',
      accessRole: cell?.accessRole,
      allowed,
    });
    if (allowed) map.openDoor(cell?.doorId ?? '');
    return;
  }
  if ('interact' in step) {
    const entity = rt.byId(step.interact);
    expect(entity?.alive).toBe(true);
    expect(entity && Math.hypot(entity.x - player.x, entity.y - player.y)).toBeLessThanOrEqual(1.5);
    bus.emit('interact', { entityId: step.interact });
    return;
  }
  if ('inspect' in step) {
    const entity = rt.byId(step.inspect);
    expect(entity?.alive).toBe(true);
    bus.emit('inspect', { entityId: step.inspect });
    return;
  }
  if ('clean' in step) {
    const entity = rt.byId(step.clean);
    expect(entity?.alive).toBe(true);
    expect(entity?.infected).toBe(true);
    expect(entity && reachable(map, playerTile(player), [Math.floor(entity.x), Math.floor(entity.y)])).toBe(true);
    bus.emit('cleaned', { entityId: step.clean });
    return;
  }
  if ('patch' in step) {
    const entity = rt.byId(step.patch);
    expect(entity?.alive).toBe(true);
    expect(entity?.def.kind).toBe('workstation');
    expect(entity && Math.hypot(entity.x - player.x, entity.y - player.y)).toBeLessThanOrEqual(2.5);
    entity!.state.patched = true;
    bus.emit('tool-hit', { toolId: 'patch', entityId: step.patch, good: true });
    return;
  }
  for (let elapsed = 0; elapsed < step.wait; elapsed += 0.05) {
    updateThree(rt, map, player);
  }
}

describe('mission walkthroughs', () => {
  for (const mission of missionRegistry.all()) {
    it(`${mission.id} can be completed`, () => {
      const steps = walkthroughs[mission.id];
      expect(steps, `missing walkthrough for ${mission.id}`).toBeDefined();
      const bus = new EventBus();
      const rt = new MissionRuntime(mission, bus);
      const map = new WorldMap(mission.map);
      const player = {
        x: mission.map.spawn.x,
        y: mission.map.spawn.y,
        angle: mission.map.spawn.angle,
        integrity: 100,
      };
      for (const step of steps ?? []) {
        if (rt.finished) break;
        runStep(step, rt, map, player, bus);
      }
      expect(rt.finished).toBe('won');
      expect(rt.objectives.some((objective) => objective.failed)).toBe(false);
    });
  }
});
