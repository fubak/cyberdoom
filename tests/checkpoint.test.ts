import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Entity } from '../src/core/types';
import { m01 } from '../src/content/missions/m01-patch-tuesday';
import { WorldMap } from '../src/engine/map';
import { Player } from '../src/engine/player';
import { latestRetryCheckpoint, objectiveCheckpointLabel, type Checkpoint } from '../src/missions/checkpoint';
import { MissionRuntime } from '../src/missions/runtime';
import { Arsenal } from '../src/tools/arsenal';
import { toolRegistry } from '../src/tools';

describe('mission checkpoints', () => {
  it('snapshots and restores runtime state, retaining cross-entity identity and supporting repeated restores', () => {
    const runtime = new MissionRuntime(m01, new EventBus());
    const target = runtime.entities[0];
    const internals = runtime as unknown as {
      pendingAccusation: Entity | null;
      inspected: Set<string>;
      callAttempts: Map<string, number>;
    };
    internals.pendingAccusation = target;
    internals.inspected.add(target.def.id);
    internals.callAttempts.set(target.def.id, 2);
    runtime.inventory.add('usb-stick');
    runtime.visited.add('7,8');
    runtime.score = 45;
    runtime.scoreLog.push({ text: 'test', points: 45, good: true, objectives: ['2.1'] });
    runtime.roles.push('itops');
    runtime.objectives[0].progress = 1;
    runtime.finished = 'won';
    const snapshot = runtime.snapshot() as {
      entities: Entity[];
      pendingAccusation: Entity | null;
      inspected: Set<string>;
      callAttempts: Map<string, number>;
      inventory: Set<string>;
      visited: Set<string>;
      score: number;
      scoreLog: unknown[];
      roles: string[];
      objectives: { progress: number }[];
      finished: string | null;
    };
    expect(snapshot.pendingAccusation).toBe(snapshot.entities.find((entity) => entity.def.id === target.def.id));
    expect(snapshot.finished).toBe('won');

    runtime.entities[0].hp = 0;
    runtime.inventory.clear();
    runtime.visited.clear();
    runtime.score = -1;
    runtime.scoreLog = [];
    runtime.roles = [];
    runtime.finished = 'lost';
    runtime.lossReason = 'test loss';
    runtime.lossCause = { kind: 'integrity' };
    runtime.restore(snapshot);

    expect(runtime.entities[0].hp).toBe(snapshot.entities[0].hp);
    expect(runtime.inventory).toEqual(snapshot.inventory);
    expect(runtime.visited).toEqual(snapshot.visited);
    expect(runtime.score).toBe(snapshot.score);
    expect(runtime.scoreLog).toEqual(snapshot.scoreLog);
    expect(runtime.roles).toEqual(snapshot.roles);
    expect(runtime.objectives[0].progress).toBe(snapshot.objectives[0].progress);
    expect(internals.inspected).toEqual(snapshot.inspected);
    expect(internals.callAttempts).toEqual(snapshot.callAttempts);
    expect(internals.pendingAccusation).toBe(runtime.entities.find((entity) => entity.def.id === target.def.id));
    expect(runtime.finished).toBeNull();
    expect(runtime.lossReason).toBeNull();
    expect(runtime.lossCause).toBeNull();

    runtime.entities[0].hp = 1;
    runtime.restore(snapshot);
    expect(runtime.entities[0].hp).toBe(snapshot.entities[0].hp);
    expect(internals.pendingAccusation).toBe(runtime.entities.find((entity) => entity.def.id === target.def.id));
  });

  it('round-trips player gameplay state and resets bob', () => {
    const player = new Player(2, 3, 0.5);
    player.vx = 1.25;
    player.vy = -0.5;
    player.integrity = 61;
    player.hurtT = 0.2;
    player.bob = 7;
    player.bobScale = 0;
    const turning = player as unknown as { turnDir: number; turnHeld: number };
    turning.turnDir = -1;
    turning.turnHeld = 0.12;
    const snapshot = player.snapshot();

    player.x = 8;
    player.y = 9;
    player.angle = 2;
    player.integrity = 1;
    player.restore(snapshot);

    expect([player.x, player.y, player.prevX, player.prevY, player.angle]).toEqual([2, 3, 2, 3, 0.5]);
    expect([player.vx, player.vy, player.integrity, player.hurtT]).toEqual([1.25, -0.5, 61, 0.2]);
    expect([turning.turnDir, turning.turnHeld]).toEqual([-1, 0.12]);
    expect(player.bob).toBe(0);
    expect(player.viewBobZ).toBe(0);
    expect(player.bobPitchDeg).toBe(0);
  });

  it('round-trips arsenal ownership, ammo and selected tool while clearing introductions and flash', () => {
    const bus = new EventBus();
    const messages: string[] = [];
    bus.on('message', ({ text }) => messages.push(text));
    const arsenal = new Arsenal(bus);
    arsenal.reset({ difficulty: 1, loadout: ['keyboard', 'usb'] }, 'male');
    arsenal.ammo.set('usb-charge', 7);
    arsenal.current = toolRegistry.require('usb');
    arsenal.introduce([toolRegistry.require('patch')]);
    const snapshot = arsenal.snapshot();

    arsenal.owned.clear();
    arsenal.ammo.clear();
    arsenal.current = toolRegistry.require('keyboard');
    arsenal.restore(snapshot);
    for (let i = 0; i < 240; i++) arsenal.update(1 / 60, false, false, () => {
      throw new Error('no tool use expected');
    });

    expect([...arsenal.owned]).toEqual(snapshot.owned);
    expect([...arsenal.ammo]).toEqual(snapshot.ammo);
    expect(arsenal.current.id).toBe('usb');
    expect(arsenal.got()).toBeNull();
    expect(messages).toEqual([]);
  });

  it('round-trips door progress including doors that are still opening', () => {
    const map = new WorldMap(m01.map);
    const doorId = Object.values(m01.map.legend).find((cell) => cell.kind === 'door')?.doorId;
    expect(doorId).toBeDefined();
    map.startOpening(doorId!);
    map.updateDoors(0.1);
    const snapshot = map.snapshot();
    map.openDoor(doorId!);
    map.restore(snapshot);
    expect(map.doorFrac(doorId!)).toBeCloseTo(0.1 / 0.55);
    map.updateDoors(0.1);
    expect(map.doorFrac(doorId!)).toBeCloseTo(0.2 / 0.55);
  });

  it('saves objective completions at tick end but not after the runtime finishes', () => {
    const objectives = [{ def: { id: 'clean', text: 'Clean hosts' }, done: true }];
    expect(objectiveCheckpointLabel(new Set(), objectives, false)).toBe('CHECKPOINT: Clean hosts');
    expect(objectiveCheckpointLabel(new Set(), objectives, true)).toBeNull();
    expect(objectiveCheckpointLabel(new Set(['clean']), objectives, false)).toBeNull();
  });

  it('offers the newest eligible retry checkpoint, but not mission start alone', () => {
    const start: Checkpoint = { label: 'MISSION START', runtime: {}, player: {}, arsenal: {}, doors: {}, elapsedAt: 0 };
    const auto: Checkpoint = { ...start, label: 'CHECKPOINT: Clean hosts', elapsedAt: 12 };
    const oldQuick: Checkpoint = { ...start, label: 'QUICKSAVE', elapsedAt: 8 };
    const staleQuick: Checkpoint = { ...start, label: 'QUICKSAVE', elapsedAt: -1 };
    const newQuick: Checkpoint = { ...start, label: 'QUICKSAVE', elapsedAt: 15 };

    expect(latestRetryCheckpoint(start, null)).toBeNull();
    expect(latestRetryCheckpoint(start, staleQuick)).toBeNull();
    expect(latestRetryCheckpoint(start, oldQuick)).toBe(oldQuick);
    expect(latestRetryCheckpoint(auto, oldQuick)).toBe(auto);
    expect(latestRetryCheckpoint(auto, newQuick)).toBe(newQuick);
  });
});
