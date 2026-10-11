/**
 * AUDIO: analyst vocal-tract data for the formant voice lines.
 * Lives beside the DSP so both the engine (buffer rendering) and
 * src/tools/sfx.ts (public re-export for the arsenal tests) share it.
 * Formant sets are after Peterson & Barney (1952) vowel averages.
 */

export type Formants = [number, number, number]; // F1, F2, F3 in Hz
export type Vowel = 'a' | 'e' | 'o' | 'u';

export interface VoiceSpec {
  /** Glottal pitch Hz. */
  pitch: number;
  /** Spectral-tilt lowpass on the glottal source (Hz). */
  tilt: number;
  /** Aspiration noise relative to voicing (breathiness). */
  breath: number;
  q: Formants;
  amp: Formants;
  vowels: Record<Vowel, Formants>;
}

export const VOICES: Record<'male' | 'female', VoiceSpec> = {
  male: {
    pitch: 112, tilt: 3400, breath: 0.06, q: [9, 11, 12], amp: [1, 0.55, 0.3],
    vowels: { a: [730, 1090, 2440], e: [530, 1840, 2480], o: [570, 840, 2410], u: [440, 1020, 2240] },
  },
  female: {
    pitch: 210, tilt: 2700, breath: 0.32, q: [5, 7, 8], amp: [1, 0.7, 0.45],
    vowels: { a: [850, 1220, 2810], e: [610, 2330, 2990], o: [590, 920, 2710], u: [470, 1160, 2680] },
  },
};

/** [freq, q, amp] triples for the formant layer renderer. */
export function formantBank(gender: 'male' | 'female', vowel: Vowel): [number, number, number][] {
  const v = VOICES[gender];
  return v.vowels[vowel].map((f, i) => [f, v.q[i], v.amp[i] * 3] as [number, number, number]);
}
