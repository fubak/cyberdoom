const STORAGE_KEY = 'cyberdoom.progress';

export function completedIds(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function markCompleted(id: string): void {
  const ids = completedIds();
  if (ids.includes(id)) return;
  ids.push(id);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage is optional in tests and privacy-restricted browser contexts.
  }
}

export function isCompleted(id: string): boolean {
  return completedIds().includes(id);
}

export function isUnlocked(id: string, orderedIds: string[]): boolean {
  if (new URLSearchParams(globalThis.location?.search ?? '').get('debug') === '1') return true;
  if (cheatUnlocked()) return true;
  const index = orderedIds.indexOf(id);
  if (index <= 0) return true;
  return completedIds().includes(orderedIds[index - 1]);
}

const CHEAT_KEY = 'cyberdoom.konami';

/** EGGS: the title-screen Konami code persists an unlock-everything flag. */
export function cheatUnlocked(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHEAT_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockEverything(): void {
  try {
    globalThis.localStorage?.setItem(CHEAT_KEY, '1');
  } catch {
    // Storage is optional.
  }
}

export type MissionRowState = 'cleared' | 'next' | 'open' | 'locked';

/** Per-row state for the mission select screen: cleared first, then the first
 *  unlocked-but-uncleared row is NEXT; anything locked is LOCKED. */
export function missionRowStates(orderedIds: string[]): Map<string, MissionRowState> {
  const completed = new Set(completedIds());
  let nextAssigned = false;
  const states = new Map<string, MissionRowState>();
  for (const id of orderedIds) {
    if (completed.has(id)) {
      states.set(id, 'cleared');
      continue;
    }
    if (!isUnlocked(id, orderedIds)) {
      states.set(id, 'locked');
      continue;
    }
    if (!nextAssigned) {
      states.set(id, 'next');
      nextAssigned = true;
    } else {
      states.set(id, 'open');
    }
  }
  return states;
}
