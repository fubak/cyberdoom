import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_SAVE_KEY,
  clearSavedCheckpoints,
  decodeCheckpointSave,
  loadSavedCheckpoints,
  persistCheckpoints,
  resumeCheckpoint,
} from '../src/missions/checkpoint-store';
import { WorldMap } from '../src/engine/map';
import { MissionRuntime } from '../src/missions/runtime';
import { missionRegistry } from '../src/content/missions';
import { EventBus } from '../src/core/events';
import type { Checkpoint } from '../src/missions/checkpoint';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('persistent checkpoints', () => {
  it('round-trips map, runtime and arsenal snapshots including Map/Set state through storage', () => {
    const mission = missionRegistry.get('m01')!;
    const map = new WorldMap(mission.map);
    const runtime = new MissionRuntime(mission, new EventBus(), 'analyst', 42);
    const checkpoint: Checkpoint = {
      label: 'CHECKPOINT: TEST',
      runtime: runtime.snapshot(),
      player: { x: 2.5, y: 3.5, angle: 1, vx: 0, vy: 0, integrity: 77, hurtT: 0, lastHurtFrom: null, turnDir: 0, turnHeld: 0 },
      arsenal: { owned: ['keyboard'], ammo: [['scan', 12]], currentId: 'keyboard' },
      doors: map.snapshot(),
      elapsedAt: 1234.5,
    };
    const storage = memoryStorage();
    expect(persistCheckpoints({ missionId: 'm01', skill: 'analyst', gender: 'female', automatic: checkpoint, quick: null }, storage)).toBe(true);
    const loaded = loadSavedCheckpoints(storage)!;
    expect(loaded.missionId).toBe('m01');
    expect(loaded.gender).toBe('female');
    const doors = loaded.automatic!.doors as ReturnType<WorldMap['snapshot']>;
    expect(doors.doors).toBeInstanceOf(Map);
    expect(doors.openingDoors).toBeInstanceOf(Set);
    expect([...doors.doors.keys()]).toEqual([...map.snapshot().doors.keys()]);
    const restored = new MissionRuntime(mission, new EventBus(), 'analyst', 42);
    restored.restore(loaded.automatic!.runtime);
    expect(restored.snapshot()).toEqual(runtime.snapshot());
    expect((loaded.automatic!.player as { integrity: number }).integrity).toBe(77);
    clearSavedCheckpoints(storage);
    expect(storage.data.has(CHECKPOINT_SAVE_KEY)).toBe(false);
  });

  it('rejects corrupt, empty or wrong-version saves and resumes the newest checkpoint', () => {
    expect(decodeCheckpointSave('{not json')).toBeNull();
    expect(decodeCheckpointSave(JSON.stringify({ version: 99, missionId: 'm01', automatic: {} }))).toBeNull();
    expect(decodeCheckpointSave(JSON.stringify({ version: 1, missionId: 'm01', automatic: null, quick: null }))).toBeNull();
    const a = { label: 'A', elapsedAt: 10 } as Checkpoint;
    const q = { label: 'Q', elapsedAt: 20 } as Checkpoint;
    const base = { version: 1, missionId: 'm01', skill: 'analyst', savedAt: 0 };
    expect(resumeCheckpoint({ ...base, automatic: a, quick: q })?.label).toBe('Q');
    expect(resumeCheckpoint({ ...base, automatic: { ...a, elapsedAt: 30 }, quick: q })?.label).toBe('A');
    expect(resumeCheckpoint({ ...base, automatic: null, quick: q })?.label).toBe('Q');
  });
});
