const STORAGE_KEY = 'cyberdoom.progress';

function completedIds(): string[] {
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

export function isUnlocked(id: string, orderedIds: string[]): boolean {
  if (new URLSearchParams(globalThis.location?.search ?? '').get('debug') === '1') return true;
  const index = orderedIds.indexOf(id);
  if (index <= 0) return true;
  return completedIds().includes(orderedIds[index - 1]);
}
