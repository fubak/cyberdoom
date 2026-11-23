import type { Checkpoint } from './checkpoint';

export const CHECKPOINT_SAVE_KEY = 'cyberdoom.checkpoints.v1';
const SAVE_VERSION = 1;

export interface CheckpointSave {
  version: number;
  missionId: string;
  skill: string;
  gender?: string;
  savedAt: number;
  automatic: Checkpoint | null;
  quick: Checkpoint | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** JSON with tagged Map/Set so map/runtime snapshots round-trip. */
export function encodeCheckpointSave(save: CheckpointSave): string {
  return JSON.stringify(save, (_key, value: unknown) => {
    if (value instanceof Map) return { __t: 'Map', v: [...value.entries()] };
    if (value instanceof Set) return { __t: 'Set', v: [...value.values()] };
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { __t: 'Num', v: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Inf' : '-Inf' };
    }
    return value;
  });
}

export function decodeCheckpointSave(raw: string | null): CheckpointSave | null {
  if (!raw) return null;
  try {
    const save = JSON.parse(raw, (_key, value: unknown) => {
      if (value && typeof value === 'object' && '__t' in value && 'v' in value) {
        const tagged = value as { __t: string; v: unknown };
        if (tagged.__t === 'Map' && Array.isArray(tagged.v)) return new Map(tagged.v as [unknown, unknown][]);
        if (tagged.__t === 'Set' && Array.isArray(tagged.v)) return new Set(tagged.v);
        if (tagged.__t === 'Num') {
          return tagged.v === 'NaN' ? NaN : tagged.v === 'Inf' ? Infinity : -Infinity;
        }
      }
      return value;
    }) as CheckpointSave;
    if (!save || save.version !== SAVE_VERSION || typeof save.missionId !== 'string') return null;
    if (!save.automatic && !save.quick) return null;
    return save;
  } catch {
    return null;
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function persistCheckpoints(
  data: Omit<CheckpointSave, 'version' | 'savedAt'>,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      CHECKPOINT_SAVE_KEY,
      encodeCheckpointSave({ ...data, version: SAVE_VERSION, savedAt: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadSavedCheckpoints(storage: StorageLike | null = defaultStorage()): CheckpointSave | null {
  if (!storage) return null;
  try {
    return decodeCheckpointSave(storage.getItem(CHECKPOINT_SAVE_KEY));
  } catch {
    return null;
  }
}

export function clearSavedCheckpoints(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(CHECKPOINT_SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Most recent checkpoint to resume from after a reload. */
export function resumeCheckpoint(save: CheckpointSave): Checkpoint | null {
  const { automatic, quick } = save;
  if (automatic && quick) return quick.elapsedAt > automatic.elapsedAt ? quick : automatic;
  return quick ?? automatic;
}
