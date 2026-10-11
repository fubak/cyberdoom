import type { Gender } from '../core/types';
import type { Audio } from '../engine/audio';
import { VOICES } from '../engine/audio/voicebank';
import type { Formants, Vowel, VoiceSpec } from '../engine/audio/voicebank';

/**
 * ARSENAL: tool + analyst-voice sound effects. As of the audio overhaul
 * these are thin delegates onto the shared Audio engine: every name below
 * has a layered recipe in src/engine/audio/sfxdef.ts rendered once into a
 * buffer and replayed through the game's master bus, so tool reports share
 * the mixer's headroom/limiter instead of running a second AudioContext.
 *
 * `bindAudio()` is called once from main.ts before any play path runs.
 */

export type ToolSound =
  | 'kb-swing' | 'kb-impact' | 'mouse-click' | 'mouse-flag' | 'usb-fire' | 'usb-hit'
  | 'badge-swipe' | 'badge-ok' | 'badge-deny' | 'door-clunk' | 'tap-sweep' | 'edr-charge' | 'edr-blast'
  | 'dry' | 'lower' | 'raise' | 'new-tool' | 'ammo' | 'menu-move' | 'menu-pick' | 'menu-back'
  | 'fizzle' | 'confirm' | 'mfa-beep' | 'patch-insert' | 'patch-fire';

export type VoiceLine = 'pain' | 'grunt' | 'ready' | 'pickup' | 'death';

export type { Formants, Vowel, VoiceSpec };
export { VOICES };

let bound: Audio | null = null;

/** Wire the game's shared Audio instance (called once by main.ts). */
export function bindAudio(audio: Audio): void {
  bound = audio;
}

export function setMuted(m: boolean): void {
  bound?.setMuted(m);
}

export function playTool(s: ToolSound): void {
  bound?.sfx(s);
}

/** Analyst voice: same lines, distinct vocal tracts (rendered per gender). */
export function playVoice(gender: Gender, line: VoiceLine): void {
  if (!bound) return;
  bound.setVoice(gender);
  bound.sfx(`vox-${line}`);
}
