import type { Gender } from '../core/types';

/**
 * ARSENAL: analyst appearance (chosen on the character-select screen).
 * Gender comes from the core state; skin tone is an independent choice so
 * every player can see themselves in the analyst's hands and portrait.
 */

export interface SkinTone {
  id: string;
  label: string;
  base: string;
  shadow: string;
  highlight: string;
}

export const SKIN_TONES: SkinTone[] = [
  { id: 's1', label: 'Light', base: '#f2cfac', shadow: '#c99a76', highlight: '#fde6cf' },
  { id: 's2', label: 'Medium-light', base: '#ddaa7c', shadow: '#ad7a52', highlight: '#efc59c' },
  { id: 's3', label: 'Medium', base: '#b98455', shadow: '#8a5c35', highlight: '#d29f6f' },
  { id: 's4', label: 'Medium-dark', base: '#8c5a35', shadow: '#653c20', highlight: '#a87149' },
  { id: 's5', label: 'Dark', base: '#5e3a22', shadow: '#3f2414', highlight: '#7a4e31' },
];

export interface AnalystProfile {
  gender: Gender;
  name: string;
  callsign: string;
  /** Jacket / sleeve colour. */
  jacket: string;
  /** Accent colour (cuff stripe, headset light). */
  accent: string;
  hair: string;
  bio: string;
}

export const ANALYSTS: Record<Gender, AnalystProfile> = {
  male: {
    gender: 'male',
    name: 'RAY OKAFOR',
    callsign: 'RAY',
    jacket: '#2b3f73',
    accent: '#ff8a1e',
    hair: '#2a1d14',
    bio: 'Ex-helpdesk lead. Reads logs like comics.',
  },
  female: {
    gender: 'female',
    name: 'VEGA MORALES',
    callsign: 'VEGA',
    jacket: '#1f5f5c',
    accent: '#3ee8d0',
    hair: '#3a1f12',
    bio: 'Ex-network engineer. Never trusts a default.',
  },
};

const KEY = 'cyberdoom.skin';
let skinId: string = readSkin();

function readSkin(): string {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v && SKIN_TONES.some((s) => s.id === v)) return v;
  } catch {
    /* storage unavailable */
  }
  return 's2';
}

export function currentSkin(): SkinTone {
  return SKIN_TONES.find((s) => s.id === skinId) ?? SKIN_TONES[1];
}

export function setSkin(id: string): void {
  if (!SKIN_TONES.some((s) => s.id === id)) return;
  skinId = id;
  try {
    globalThis.localStorage?.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function skinTriple(s: SkinTone = currentSkin()): [string, string, string] {
  return [s.base, s.shadow, s.highlight];
}
