import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
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
      skill: 'analyst',
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
      skill: 'commander' as const,
    };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
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
