import { SKILLS, type SkillId } from '../missions/difficulty';
import { ACTION_LABELS, type Action } from '../engine/bindings';

export interface Settings {
  sensitivity: number;
  sfxVol: number;
  musicVol: number;
  viewBob: boolean;
  skill: SkillId;
  bindings: Partial<Record<Action, string[]>>;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  sfxVol: 1,
  musicVol: 0.7,
  viewBob: true,
  skill: 'analyst',
  bindings: {},
};

export const SENS_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

const SETTINGS_KEY = 'cyberdoom-settings';
const LEGACY_MUSIC_KEY = 'cyberdoom-music-vol';

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && SKILLS.some((skill) => skill.id === value);
}

function readBindings(value: unknown): Partial<Record<Action, string[]>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const saved = value as Record<string, unknown>;
  const bindings: Partial<Record<Action, string[]>> = {};
  for (const action of Object.keys(ACTION_LABELS) as Action[]) {
    const codes = saved[action];
    if (Array.isArray(codes)) {
      bindings[action] = codes.filter(
        (code): code is string => typeof code === 'string' && code.length > 0,
      );
    }
  }
  return bindings;
}

export function loadSettings(
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): Settings {
  const defaults = { ...DEFAULT_SETTINGS };
  if (!storage) return defaults;

  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return defaults;
  }

  if (raw === null) {
    try {
      const legacy = storage.getItem(LEGACY_MUSIC_KEY);
      if (legacy !== null) {
        const value = Number(legacy);
        if (Number.isFinite(value)) defaults.musicVol = clamp(value, 0, 1);
      }
    } catch {
      return defaults;
    }
    return defaults;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;

  const values = parsed as Record<string, unknown>;
  return {
    sensitivity: readNumber(values.sensitivity, defaults.sensitivity, 0.25, 3),
    sfxVol: readNumber(values.sfxVol, defaults.sfxVol, 0, 1),
    musicVol: readNumber(values.musicVol, defaults.musicVol, 0, 1),
    viewBob: typeof values.viewBob === 'boolean' ? values.viewBob : defaults.viewBob,
    skill: isSkillId(values.skill) ? values.skill : defaults.skill,
    bindings: readBindings(values.bindings),
  };
}

export function saveSettings(
  settings: Settings,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private or restricted storage should not prevent play.
  }
}

export function nextStep(steps: readonly number[], cur: number): number {
  if (!steps.length) return cur;
  const first = steps[0]!;
  const currentIndex = steps.findIndex((step) => Math.abs(step - cur) < 0.001);
  if (currentIndex >= 0) return steps[(currentIndex + 1) % steps.length]!;
  if (steps.length === 1) return first;
  const ascending = steps[steps.length - 1]! >= first;
  return steps.find((step) => ascending ? step > cur : step < cur) ?? first;
}
