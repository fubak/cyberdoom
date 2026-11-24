import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FOV_MAX,
  FOV_MIN,
  FOV_STEPS,
  loadSettings,
  nextStep,
  saveSettings,
  SENS_STEPS,
} from '../src/ui/settings';

function reader(values: Record<string, string | null>): Pick<Storage, 'getItem'> {
  return { getItem: (key) => values[key] ?? null };
}

describe('settings persistence', () => {
  it('uses defaults without storage or a saved settings value', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(reader({}))).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numeric settings to their supported ranges', () => {
    expect(loadSettings(reader({
      'cyberdoom-settings': JSON.stringify({
        sensitivity: 8,
        sfxVol: -1,
        musicVol: 2,
        viewBob: false,
      }),
    }))).toEqual({
      sensitivity: 3,
      sfxVol: 0,
      musicVol: 1,
      viewBob: false,
      colorBlind: false,
      fov: 58,
      reducedFlash: false,
      skill: 'analyst',
      bindings: {},
    });
  });

  it('falls back to defaults for bad JSON and bad field types', () => {
    expect(loadSettings(reader({ 'cyberdoom-settings': '{' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(reader({
      'cyberdoom-settings': JSON.stringify({
        sensitivity: '1.5',
        sfxVol: 0.35,
        musicVol: null,
        viewBob: 'off',
      }),
    }))).toEqual({ ...DEFAULT_SETTINGS, sfxVol: 0.35 });
  });

  it('migrates the legacy music volume only when new settings are missing', () => {
    expect(loadSettings(reader({ 'cyberdoom-music-vol': '0.4' }))).toEqual({
      ...DEFAULT_SETTINGS,
      musicVol: 0.4,
    });
    expect(loadSettings(reader({
      'cyberdoom-settings': JSON.stringify(DEFAULT_SETTINGS),
      'cyberdoom-music-vol': '0.2',
    }))).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const settings = {
      sensitivity: 1.5,
      sfxVol: 0.4,
      musicVol: 0.15,
      viewBob: false,
      colorBlind: true,
      fov: 66,
      reducedFlash: true,
      skill: 'commander' as const,
      bindings: { forward: ['KeyI'], use: [] },
    };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('validates saved bindings while preserving explicit empty actions', () => {
    const settings = loadSettings(reader({
      'cyberdoom-settings': JSON.stringify({
        ...DEFAULT_SETTINGS,
        bindings: {
          forward: ['KeyI', '', 4],
          use: [],
          unknown: ['KeyZ'],
          fire: 'KeyK',
        },
      }),
    }));
    expect(settings.bindings).toEqual({ forward: ['KeyI'], use: [] });
  });

  it('falls back to analyst for an invalid skill id', () => {
    expect(loadSettings(reader({
      'cyberdoom-settings': JSON.stringify({ ...DEFAULT_SETTINGS, skill: 'expert' }),
    })).skill).toBe('analyst');
  });

  it('swallows storage errors when saving', () => {
    expect(() => saveSettings(DEFAULT_SETTINGS, {
      setItem: () => { throw new Error('storage disabled'); },
    })).not.toThrow();
  });
});

describe('settings step ladders', () => {
  it('advances and wraps ascending and descending ladders', () => {
    expect(nextStep(SENS_STEPS, 1)).toBe(1.25);
    expect(nextStep(SENS_STEPS, 1.0005)).toBe(1.25);
    expect(nextStep(SENS_STEPS, 3)).toBe(0.5);
    expect(nextStep([1, 0.7, 0.4, 0.15, 0], 0.7)).toBe(0.4);
    expect(nextStep([1, 0.7, 0.4, 0.15, 0], 0.7005)).toBe(0.4);
    expect(nextStep([1, 0.7, 0.4, 0.15, 0], 0)).toBe(1);
  });
});

describe('phase D settings: fov and reduced flashing', () => {
  it('defaults to the original 58 degree camera and full flashes', () => {
    expect(DEFAULT_SETTINGS.fov).toBe(58);
    expect(DEFAULT_SETTINGS.reducedFlash).toBe(false);
    expect(FOV_STEPS).toContain(DEFAULT_SETTINGS.fov);
  });

  it('clamps a saved fov into the supported range and rejects bad types', () => {
    const load = (value: unknown) => loadSettings(reader({
      'cyberdoom-settings': JSON.stringify({ ...DEFAULT_SETTINGS, fov: value }),
    })).fov;
    expect(load(10)).toBe(FOV_MIN);
    expect(load(170)).toBe(FOV_MAX);
    expect(load(62)).toBe(62);
    expect(load('90')).toBe(58);
    expect(load(Number.NaN)).toBe(58);
  });

  it('only accepts a boolean reducedFlash', () => {
    const load = (value: unknown) => loadSettings(reader({
      'cyberdoom-settings': JSON.stringify({ ...DEFAULT_SETTINGS, reducedFlash: value }),
    })).reducedFlash;
    expect(load(true)).toBe(true);
    expect(load('yes')).toBe(false);
  });

  it('keeps every fov step inside the clamp range, ascending', () => {
    expect([...FOV_STEPS]).toEqual([...FOV_STEPS].sort((a, b) => a - b));
    for (const step of FOV_STEPS) {
      expect(step).toBeGreaterThanOrEqual(FOV_MIN);
      expect(step).toBeLessThanOrEqual(FOV_MAX);
    }
    expect(nextStep(FOV_STEPS, FOV_STEPS[FOV_STEPS.length - 1]!)).toBe(FOV_STEPS[0]);
  });

  it('loads settings saved before phase D with the new defaults', () => {
    const legacy = {
      sensitivity: 1.25, sfxVol: 0.4, musicVol: 0.7, viewBob: true, colorBlind: false, skill: 'analyst', bindings: {},
    };
    const loaded = loadSettings(reader({ 'cyberdoom-settings': JSON.stringify(legacy) }));
    expect(loaded.fov).toBe(58);
    expect(loaded.reducedFlash).toBe(false);
    expect(loaded.sensitivity).toBe(1.25);
  });
});
