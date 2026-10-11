/**
 * AUDIO: instrument voices. Each scheduled note event renders into a mono
 * buffer through these builders — the same function serves the runtime
 * AudioBuffer cache and the offline WAV renderer, so what the tests
 * measure is exactly what plays.
 */

import { renderLayers, mulberry32, type Layer } from './dsp';
import type { InstName } from './sequencer';

const osc = (type: Layer['type'], f0: number, f1: number, dur: number, gain: number, t0 = 0, extra: Partial<Layer> = {}): Layer =>
  ({ kind: 'osc', type, f0, f1, dur, gain, t0, ...extra });

const nz = (f0: number, f1: number, type: 'lowpass' | 'highpass' | 'bandpass', dur: number, gain: number, t0 = 0, q = 1): Layer =>
  ({ kind: 'noise', dur, gain, t0, filter: { type, f0, f1, q } });

const ks = (f0: number, dur: number, gain: number, t0 = 0, damp = 0.994, extra: Partial<Layer> = {}): Layer =>
  ({ kind: 'ks', f0, dur, gain, t0, damp, ...extra });

/** Layers for one instrument note. freq in Hz, dur in seconds. */
export function instLayers(inst: InstName, freq: number, dur: number, gain: number): Layer[] {
  switch (inst) {
    case 'kick':
      return [
        osc('sine', 150, 44, Math.max(0.12, dur), gain, 0, { attack: 0.002, dist: 2 }),
        nz(3000, 1200, 'highpass', 0.015, gain * 0.4),
      ];
    case 'snare':
      return [
        nz(1900, 900, 'bandpass', Math.max(0.09, dur), gain, 0, 1.1),
        osc('triangle', 210, 130, 0.07, gain * 0.7),
      ];
    case 'hat':
      return [nz(8000, 6000, 'highpass', Math.min(0.045, dur), gain)];
    case 'ohat':
      return [nz(7500, 5000, 'highpass', Math.max(0.1, dur), gain)];
    case 'bass':
      return [
        osc('sawtooth', freq, freq, dur, gain * 0.8, 0, { filter: { type: 'lowpass', f0: freq * 6 }, dist: 1.4, sustain: 0.55 }),
        osc('square', freq / 2, freq / 2, dur, gain * 0.5, 0, { filter: { type: 'lowpass', f0: freq * 3 }, sustain: 0.55 }),
      ];
    case 'gtr': {
      // palm-muted power chord: root + fifth through a short Karplus-Strong
      // pluck, hard clip, cabinet lowpass — Doom's chug, original or not
      const fifth = freq * 1.4983;
      const d = Math.min(dur, 0.24);
      return [
        ks(freq, d, gain * 0.55, 0, 0.82, { dist: 4, filter: { type: 'lowpass', f0: 3400, n: 2 } }),
        ks(fifth, d, gain * 0.4, 0, 0.8, { dist: 4, filter: { type: 'lowpass', f0: 3400, n: 2 } }),
        osc('sawtooth', freq, freq, d, gain * 0.18, 0, { dist: 5, filter: { type: 'lowpass', f0: 3000 } }),
      ];
    }
    case 'pad':
      return [
        osc('sawtooth', freq, freq, dur, gain * 0.6, 0, { detune: 9, attack: Math.min(0.3, dur * 0.2), sustain: 0.7, filter: { type: 'lowpass', f0: freq * 4 } }),
        osc('sawtooth', freq * 1.007, freq * 1.007, dur, gain * 0.5, 0, { attack: Math.min(0.3, dur * 0.2), sustain: 0.7, filter: { type: 'lowpass', f0: freq * 3 } }),
      ];
    case 'lead':
      return [
        osc('square', freq, freq, dur, gain * 0.6, 0, { attack: 0.01, sustain: 0.6 }),
        osc('sawtooth', freq * 1.006, freq * 1.006, dur, gain * 0.5, 0, { attack: 0.01, sustain: 0.6 }),
      ];
    case 'stab':
      return [
        osc('sawtooth', freq, freq, dur, gain * 0.6, 0, { detune: 12, sustain: 0.3, filter: { type: 'lowpass', f0: freq * 5 } }),
      ];
    case 'arp':
      return [
        osc('square', freq, freq, Math.min(dur, 0.12), gain, 0, { attack: 0.003 }),
        osc('sine', freq * 2, freq * 2, Math.min(dur, 0.1), gain * 0.3),
      ];
    case 'bell':
      return [
        osc('sine', freq, freq, dur, gain),
        osc('sine', freq * 2.99, freq * 2.99, dur * 0.6, gain * 0.28),
        osc('sine', freq * 5.01, freq * 5.01, dur * 0.3, gain * 0.1),
      ];
    case 'sub':
      return [
        osc('sine', freq, freq, dur, gain, 0, { attack: Math.min(0.4, dur * 0.2), sustain: 0.75 }),
        osc('triangle', freq * 2, freq * 2, dur, gain * 0.3, 0, { sustain: 0.75 }),
      ];
    default:
      return [];
  }
}

/** Render a note event into a mono buffer. Deterministic per (inst, freq, dur, seed). */
export function renderNote(inst: InstName, freq: number, dur: number, gain: number, sr: number, seed: number): Float32Array {
  const layers = instLayers(inst, freq, dur, gain);
  return renderLayers(layers, sr, seed);
}
