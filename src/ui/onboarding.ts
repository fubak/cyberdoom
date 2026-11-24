/**
 * First-run onboarding gate. The opening mission adds a few control tips to
 * the arsenal's ticker pages (no overlay, no modal) the first time a new
 * player deploys; a persisted `seen` flag and any saved progress skip it for
 * returning players. Storage is optional (private mode, tests): every access
 * is guarded and a failure only means the tips may show again.
 */
export const ONBOARDING_KEY = 'cyberdoom.onboarding.seen';
/** The mission that teaches the controls. */
export const ONBOARDING_MISSION = 'm01';

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KeyStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function onboardingSeen(store: KeyStore | null = defaultStore()): boolean {
  try {
    return store?.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(store: KeyStore | null = defaultStore()): void {
  try {
    store?.setItem(ONBOARDING_KEY, '1');
  } catch {
    // storage blocked: the tips may repeat next run, which is harmless
  }
}

/** Show the first-run tips: opening mission, never seen, and no cleared missions yet. */
export function shouldOnboard(
  missionId: string,
  completed: readonly string[],
  store: KeyStore | null = defaultStore(),
): boolean {
  return missionId === ONBOARDING_MISSION && completed.length === 0 && !onboardingSeen(store);
}
