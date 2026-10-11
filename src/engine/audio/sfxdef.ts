/**
 * AUDIO: the SFX registry. Every sound name used by the game maps to a
 * deterministic layered recipe rendered once into a buffer (see dsp.ts).
 * Each recipe is transient + body + tail so hits punch like Doom's;
 * variants keep repeated pain/attack calls from sounding sampled.
 *
 * Name space:
 *   engine events     fire, keyboard, scan, clean, door, denied, hurt,
 *                     pickup, inspect, win, lose, click, oof, death, badge,
 *                     mouse, switch, growl, seal, unseal, spawn, windup,
 *                     bite, enemy-fire, impact, enemy-pain, enemy-death,
 *                     kill, step, evidence, objective, alarm
 *   enemy voices      <growl|idle|pain|death|attack|fire>-<threat>
 *   threat sightings  sight-<threat>
 *   tool sounds       kb-*, mouse-*, usb-*, badge-*, tap-*, edr-*, dry,
 *                     lower, raise, new-tool, ammo, menu-*, fizzle,
 *                     confirm, mfa-beep, patch-*
 *   analyst voices    vox-<pain|grunt|ready|pickup|death> (per gender)
 */

import { renderLayers, type Layer, type OscType } from './dsp';
import { formantBank, VOICES, type Vowel } from './voicebank';

const osc = (type: OscType, f0: number, f1: number, dur: number, gain: number, t0 = 0, extra: Partial<Layer> = {}): Layer =>
  ({ kind: 'osc', type, f0, f1, dur, gain, t0, ...extra });

/** filtered noise: nz(f0, f1, filterType, dur, gain, t0, q) */
const nz = (f0: number, f1: number, type: 'lowpass' | 'highpass' | 'bandpass' | 'notch', dur: number, gain: number, t0 = 0, q = 1, extra: Partial<Layer> = {}): Layer =>
  ({ kind: 'noise', dur, gain, t0, filter: { type, f0, f1, q }, ...extra });

/** creature/analyst voice: glottal pitch glide through formant bandpasses. */
const fm = (f0: number, f1: number, dur: number, gain: number, t0: number, formants: [number, number, number][], extra: Partial<Layer> = {}): Layer =>
  ({ kind: 'formant', f0, f1, dur, gain, t0, formants, ...extra });

/** creature voice shorthand: two fixed monster formants. */
const monster = (f0: number, f1: number, dur: number, gain: number, t0 = 0, extra: Partial<Layer> = {}): Layer =>
  fm(f0, f1, dur, gain, t0, [[700, 6, 1], [1250, 6, 0.55]], { breath: 0.12, ...extra });

/** Karplus-Strong pluck/metallic hit. */
const ks = (f0: number, dur: number, gain: number, t0 = 0, damp = 0.994, extra: Partial<Layer> = {}): Layer =>
  ({ kind: 'ks', f0, dur, gain, t0, damp, ...extra });

/** shared impact skeleton: high crack + distorted sub thump. */
const impact = (gain: number, t0 = 0): Layer[] => [
  nz(2400, 900, 'highpass', 0.035, gain * 0.9, t0, 0.9),
  osc('sine', 85, 36, 0.11, gain, t0, { attack: 0.004, dist: 3 }),
];

export type SfxVariant = 'male' | 'female';

export interface SfxSpec {
  /** Build the layer list; `variant` is 0..variants-1 for anti-fatigue tweaks. */
  layers: (v: SfxVariant, variant: number) => Layer[];
  /** gendered analyst voice: pick the layer set by current voice */
  gendered?: boolean;
  /** how many deterministic variants to pre-render (round-robin at play) */
  variants?: number;
  /** playable at any dur: the buffer is truncated/released early at runtime */
  truncatable?: boolean;
}

const one = (layers: (variant: number) => Layer[], opts: Partial<SfxSpec> = {}): SfxSpec =>
  ({ layers: (_v, variant) => layers(variant), ...opts });

const perThreat = (build: (kind: string, threat: string) => Layer[]): void => {
  for (const threat of THREATS) {
    for (const kind of ['growl', 'idle', 'pain', 'death', 'attack', 'fire']) {
      // `idle` is the threat's growl timbre — the Audio layer plays it quieter
      SFX_DEFS[`${kind}-${threat}`] = {
        layers: () => build(kind === 'idle' ? 'growl' : kind, threat),
        variants: kind === 'pain' ? 2 : 1,
      };
    }
  }
};

const THREATS = ['worm', 'trojan', 'ransomware', 'logicbomb', 'rat', 'rootkit'];

export const SFX_DEFS: Record<string, SfxSpec> = {
  // ---------- engine events ----------
  fire: one(() => [
    nz(1800, 900, 'highpass', 0.11, 0.38),
    osc('sawtooth', 180, 75, 0.13, 0.32),
    osc('sine', 95, 40, 0.12, 0.3, 0, { dist: 3 }),
  ]),
  keyboard: one(() => [
    nz(1800, 1100, 'highpass', 0.025, 0.24),
    nz(2050, 1200, 'highpass', 0.025, 0.24, 0.025),
    nz(2300, 1300, 'highpass', 0.025, 0.24, 0.05),
    osc('square', 1450, 1150, 0.035, 0.12, 0.018),
  ]),
  scan: one(() => [
    osc('square', 880, 220, 0.14, 0.5),
    nz(2600, 1300, 'bandpass', 0.06, 0.45),
    osc('sine', 120, 50, 0.1, 0.42),
  ]),
  clean: one(() => [
    osc('sine', 620, 670, 0.22, 0.35),
    osc('sine', 830, 896, 0.22, 0.35, 0.105),
    osc('sine', 1100, 1188, 0.28, 0.35, 0.21),
    nz(5000, 6500, 'highpass', 0.2, 0.08, 0.21),
  ]),
  door: one(() => [
    nz(200, 600, 'lowpass', 0.75, 0.38, 0.05, 0.7),
    osc('sawtooth', 55, 80, 0.75, 0.28, 0.05),
    nz(400, 100, 'lowpass', 0.1, 0.38, 0, 0.8),
    osc('square', 110, 45, 0.09, 0.2, 0.8),
  ]),
  denied: one(() => [
    osc('square', 140, 120, 0.15, 0.32),
    osc('square', 140, 110, 0.17, 0.32, 0.18),
  ]),
  hurt: one(() => [
    fm(150, 95, 0.22, 0.55, 0, [[760, 8, 1], [1400, 9, 0.5]], { tilt: 3400, breath: 0.1 }),
    osc('sine', 68, 45, 0.24, 0.58, 0, { dist: 3 }),
    nz(1800, 700, 'bandpass', 0.06, 0.2, 0, 1.2),
  ]),
  pickup: one(() => [
    osc('square', 660, 660, 0.05, 0.28),
    osc('square', 990, 990, 0.08, 0.32, 0.055),
    osc('sine', 1980, 1980, 0.1, 0.08, 0.055),
  ]),
  inspect: one(() => [
    osc('square', 880, 880, 0.04, 0.2),
    osc('square', 1320, 1320, 0.04, 0.2, 0.04),
    osc('square', 1760, 1760, 0.05, 0.2, 0.08),
  ]),
  win: one(() => [
    osc('square', 523, 523, 0.2, 0.24),
    osc('square', 659, 659, 0.2, 0.24, 0.12),
    osc('square', 784, 784, 0.2, 0.24, 0.24),
    osc('square', 1047, 1047, 0.34, 0.26, 0.36),
    osc('sine', 2093, 2093, 0.3, 0.08, 0.36),
  ]),
  lose: one(() => [
    osc('sawtooth', 300, 70, 0.7, 0.55),
    nz(600, 120, 'lowpass', 0.55, 0.14),
    osc('sine', 55, 30, 0.65, 0.35, 0, { dist: 2 }),
  ]),
  click: one(() => [osc('square', 900, 720, 0.035, 0.16)]),
  oof: one(() => [fm(180, 105, 0.12, 0.5, 0, [[500, 8, 1], [1100, 9, 0.5]], { tilt: 3400 })]),
  death: one(() => [
    fm(300, 80, 0.9, 0.62, 0, [[760, 8, 1], [1500, 9, 0.55]], { tilt: 3200, breath: 0.14 }),
    nz(1400, 500, 'bandpass', 0.82, 0.38, 0, 1.3),
    osc('sine', 68, 42, 0.88, 0.72, 0, { attack: 0.012, dist: 3 }),
  ]),
  badge: one(() => [osc('square', 1800, 1800, 0.07, 0.2)]),
  mouse: one(() => [
    nz(1800, 900, 'highpass', 0.035, 0.2),
    nz(1800, 900, 'highpass', 0.035, 0.2, 0.09),
  ]),
  switch: one(() => [
    nz(900, 300, 'bandpass', 0.12, 0.28),
    osc('square', 170, 75, 0.09, 0.3, 0.06),
  ]),
  growl: one((s) => [
    osc('sawtooth', 70 + s * 10, 95, 0.5, 0.3, 0, { filter: { type: 'lowpass', f0: 300, q: 2 }, dist: 2 }),
    nz(350, 150, 'lowpass', 0.4, 0.14),
  ]),
  seal: one(() => [
    nz(700, 1800, 'bandpass', 0.07, 0.5, 0, 1.6),
    osc('square', 220, 90, 0.12, 0.42, 0.04),
    osc('sine', 65, 42, 0.16, 0.5, 0, { dist: 3 }),
    ks(340, 0.2, 0.2, 0.03, 0.985),
  ]),
  unseal: one(() => [
    osc('square', 880, 880, 0.07, 0.24),
    osc('square', 1100, 1100, 0.07, 0.24, 0.08),
    nz(1200, 400, 'bandpass', 0.12, 0.15, 0, 2),
  ]),
  spawn: one(() => [
    nz(300, 2800, 'bandpass', 0.36, 0.72),
    osc('sine', 90, 320, 0.32, 0.5),
    osc('square', 1600, 400, 0.14, 0.24, 0.05),
    osc('sine', 80, 50, 0.3, 0.4, 0, { dist: 3 }),
  ]),
  windup: {
    layers: () => [osc('sine', 300, 1400, 1.2, 0.32, 0, { sustain: 0.8 })],
    truncatable: true,
  },
  bite: one(() => [
    nz(2600, 1100, 'highpass', 0.035, 0.75),
    nz(1600, 180, 'lowpass', 0.14, 0.85),
    osc('square', 150, 65, 0.07, 0.42),
    osc('sine', 70, 48, 0.14, 0.45, 0, { dist: 3 }),
  ]),
  'enemy-fire': one(() => [
    nz(400, 1500, 'bandpass', 0.25, 0.68),
    osc('square', 110, 55, 0.24, 0.42),
    osc('sine', 70, 46, 0.24, 0.42, 0, { dist: 3 }),
  ]),
  impact: one(() => [
    ...impact(0.85),
    nz(1500, 200, 'lowpass', 0.3, 0.76, 0, 0.8),
    osc('sine', 90, 40, 0.25, 0.68),
    osc('sine', 70, 45, 0.28, 0.62, 0, { dist: 3 }),
  ]),
  'enemy-pain': one(() => [
    nz(2200, 1000, 'highpass', 0.03, 0.5, 0, 0.9),
    monster(640, 300, 0.2, 0.55),
    osc('sine', 75, 45, 0.14, 0.5, 0, { dist: 3 }),
  ]),
  'enemy-death': one(() => [
    ...impact(0.9),
    nz(1400, 220, 'bandpass', 0.45, 0.95),
    osc('sawtooth', 400, 60, 0.5, 0.78, 0, { filter: { type: 'lowpass', f0: 900, q: 1 } }),
    osc('sine', 70, 45, 0.5, 0.72, 0, { dist: 3 }),
  ]),
  kill: one(() => [
    ...impact(1.0),
    nz(1600, 420, 'bandpass', 0.2, 0.5, 0, 1.2),
    nz(2200, 160, 'lowpass', 0.45, 0.68, 0, 0.8),
    osc('sine', 110, 30, 0.5, 0.85, 0, { dist: 3 }),
    osc('sawtooth', 210, 48, 0.3, 0.4, 0, { dist: 3 }),
  ]),
  step: one((s) => [
    nz(320, 180, 'lowpass', 0.06, 0.09),
    osc('sine', 90 - s * 8, 60, 0.06, 0.09),
    nz(1500, 850, 'bandpass', 0.018, 0.045, 0, 1.2),
  ], { variants: 2 }),
  // new coverage: evidence write, objective fanfare, threat alarm
  evidence: one(() => [
    nz(3200, 2400, 'bandpass', 0.09, 0.22, 0, 2.5), // pen scratch
    nz(3400, 2600, 'bandpass', 0.07, 0.18, 0.1, 2.5),
    osc('sine', 1560, 1560, 0.07, 0.14, 0.19), // stamp tick
    osc('sine', 1040, 1040, 0.12, 0.12, 0.26),
  ]),
  objective: one(() => [
    osc('square', 784, 784, 0.07, 0.2),
    osc('square', 1175, 1175, 0.09, 0.2, 0.08),
    osc('sine', 1568, 1568, 0.22, 0.14, 0.17),
    osc('sine', 392, 392, 0.3, 0.1, 0.17),
  ]),
  alarm: one(() => [
    osc('square', 620, 620, 0.14, 0.16),
    osc('square', 466, 466, 0.14, 0.16, 0.16),
    nz(2000, 800, 'bandpass', 0.28, 0.06, 0, 3),
  ]),

  // ---------- threat sightings ----------
  'sight-worm': one(() => [
    osc('sawtooth', 200, 900, 0.24, 0.3, 0, { filter: { type: 'bandpass', f0: 850, q: 4 } }),
    nz(2400, 1700, 'bandpass', 0.2, 0.16, 0.02, 2),
  ]),
  'sight-trojan': one(() => [
    // robotic garble: quantized pitch steps approximating the old LFO wobble
    ...[0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((t, i) =>
      osc('square', 190 + (i % 2 ? 80 : -40), 190 + (i % 2 ? 80 : -40), 0.05, 0.28, t)),
    nz(1400, 900, 'bandpass', 0.3, 0.1, 0, 3),
  ]),
  'sight-ransomware': one(() => [
    osc('sawtooth', 60, 110, 0.6, 0.65, 0, { filter: { type: 'lowpass', f0: 420, q: 1 }, dist: 4 }),
    ks(180, 0.4, 0.18, 0.1, 0.99), // chain rattle
  ]),
  'sight-logicbomb': one(() => [
    nz(1200, 3200, 'bandpass', 0.3, 0.3),
    osc('square', 300, 1400, 0.35, 0.2, 0.08),
    osc('square', 1180, 1180, 0.05, 0.14, 0.36), // the beep before the bang
  ]),
  'sight-rat': one(() => [
    ...[0, 0.055, 0.11, 0.165].map((t, i) => osc('square', 1400 - i * 150, 1100 - i * 120, 0.05, 0.26, t)),
    nz(2400, 1600, 'bandpass', 0.12, 0.3, 0.1, 1.4),
  ]),
  'sight-rootkit': one(() => [
    osc('sine', 55, 90, 0.5, 0.6, 0, { dist: 4 }),
    nz(400, 900, 'bandpass', 0.4, 0.2, 0.1),
  ]),

  // ---------- tool sounds (from src/tools/sfx.ts, now on the shared bus) ----------
  'kb-swing': one(() => [nz(900, 500, 'bandpass', 0.12, 0.35, 0, 0.7)]),
  'kb-impact': one(() => [
    nz(7200, 4000, 'highpass', 0.018, 1.0),
    nz(2600, 1200, 'bandpass', 0.08, 0.9, 0, 2),
    ...[0, 0.018, 0.036, 0.054, 0.072].map((t, i) => osc('square', 1900 + i * 140, 1500, 0.025, 0.22, t)),
    osc('triangle', 140, 60, 0.12, 0.7),
  ]),
  'mouse-click': one(() => [
    nz(7500, 4000, 'highpass', 0.012, 0.5),
    osc('square', 3200, 2400, 0.018, 0.35),
    osc('square', 1200, 900, 0.03, 0.2, 0.06),
  ]),
  'mouse-flag': one(() => [
    osc('square', 880, 880, 0.07, 0.3),
    osc('square', 1320, 1320, 0.1, 0.3, 0.08),
  ]),
  'usb-fire': one(() => [
    nz(5200, 2600, 'highpass', 0.022, 0.9),
    osc('sawtooth', 220, 1400, 0.09, 0.45),
    nz(3000, 1400, 'bandpass', 0.18, 0.6, 0, 0.8),
    osc('square', 90, 40, 0.2, 0.6),
  ]),
  'usb-hit': one(() => [
    osc('square', 1800, 600, 0.12, 0.35),
    nz(5000, 2400, 'bandpass', 0.1, 0.5),
  ]),
  'badge-swipe': one(() => [
    nz(1500, 900, 'bandpass', 0.09, 0.4, 0, 3),
    osc('sine', 400, 700, 0.06, 0.2),
  ]),
  'badge-ok': one(() => [
    osc('square', 988, 988, 0.08, 0.28, 0.08),
    osc('square', 1319, 1319, 0.14, 0.28, 0.17),
  ]),
  'badge-deny': one(() => [
    osc('sawtooth', 180, 170, 0.32, 0.45, 0.08),
    osc('square', 186, 176, 0.32, 0.3, 0.08),
  ]),
  'tap-sweep': one(() => [
    nz(6200, 3400, 'highpass', 0.02, 0.55),
    ...[0, 1, 2, 3, 4, 5].map((i) => osc('square', 700 + i * 260, 900 + i * 260, 0.03, 0.16, i * 0.035)),
    nz(6000, 3000, 'highpass', 0.25, 0.25, 0, 0.5),
  ]),
  'edr-charge': one(() => [
    osc('sawtooth', 120, 1600, 0.45, 0.35),
    osc('sine', 60, 800, 0.45, 0.4),
  ]),
  'edr-blast': one(() => [
    nz(3800, 1600, 'highpass', 0.03, 1.0),
    nz(400, 90, 'lowpass', 0.6, 1.0, 0, 0.6),
    osc('sawtooth', 1600, 60, 0.5, 0.6),
    osc('sine', 55, 30, 0.6, 0.9),
  ]),
  dry: one(() => [
    osc('square', 260, 200, 0.03, 0.3),
    nz(4000, 2000, 'bandpass', 0.03, 0.3, 0, 4),
  ]),
  lower: one(() => [nz(700, 350, 'bandpass', 0.06, 0.2)]),
  raise: one(() => [
    nz(1400, 700, 'bandpass', 0.05, 0.25),
    osc('triangle', 500, 800, 0.04, 0.2),
  ]),
  'new-tool': one(() => [
    nz(3000, 1500, 'bandpass', 0.25, 0.3, 0, 0.6),
    ...[523, 659, 784, 1047, 1319].map((f, i) => osc('square', f, f, i === 4 ? 0.3 : 0.09, 0.25, i * 0.07)),
  ]),
  ammo: one(() => [
    osc('square', 660, 990, 0.06, 0.25),
    osc('square', 990, 1320, 0.06, 0.22, 0.06),
  ]),
  'menu-move': one(() => [osc('square', 500, 420, 0.04, 0.2)]),
  'menu-pick': one(() => [
    nz(900, 450, 'bandpass', 0.15, 0.5, 0, 0.8),
    osc('square', 110, 55, 0.2, 0.5),
  ]),
  'menu-back': one(() => [osc('square', 300, 200, 0.08, 0.25)]),
  fizzle: one(() => [
    osc('sawtooth', 600, 150, 0.2, 0.2),
    nz(2500, 1200, 'bandpass', 0.15, 0.2),
  ]),
  'mfa-beep': one(() => [
    osc('square', 1760, 1760, 0.04, 0.22),
    osc('square', 2349, 2349, 0.07, 0.2, 0.06),
  ]),
  'patch-insert': one(() => [
    nz(5600, 3000, 'highpass', 0.018, 0.5),
    nz(1100, 600, 'bandpass', 0.07, 0.35, 0, 2),
    osc('square', 320, 180, 0.04, 0.3, 0.06),
    osc('triangle', 700, 1400, 0.1, 0.2, 0.12),
  ]),
  'patch-fire': one(() => [
    nz(6400, 3200, 'highpass', 0.015, 0.8),
    ...[0, 1, 2, 3].map((i) => osc('square', 1150 + i * 320, 1900 + i * 320, 0.035, 0.3, i * 0.04)),
    nz(1800, 900, 'bandpass', 0.05, 0.55, 0.05, 2),
    osc('triangle', 210, 90, 0.14, 0.5, 0.16),
  ]),
  confirm: one(() => [
    osc('square', 1046, 1046, 0.06, 0.25),
    osc('square', 1568, 1568, 0.12, 0.22, 0.06),
  ]),
};

// ---------- per-threat enemy voices ----------
perThreat((kind, threat) => {
  switch (threat) {
    case 'worm':
      switch (kind) {
        case 'growl': return [
          nz(2400, 1600, 'bandpass', 0.3, 0.14, 0, 2),
          ...[0, 0.09, 0.2].map((t, i) => osc('square', 900 - i * 140, 700 - i * 140, 0.05, 0.1, t)),
        ];
        case 'pain': return [
          monster(620 + V * 80, 380 - V * 80, 0.18 - V * 0.04, 0.55),
          nz(2800, 1900, 'bandpass', 0.12, 0.16, 0, 2.5),
        ];
        case 'death': return [
          ...impact(0.5),
          monster(540, 90, 0.65, 0.6),
          nz(900, 200, 'lowpass', 0.5, 0.32, 0.08),
        ];
        case 'attack': return [
          nz(2400, 1100, 'highpass', 0.06, 0.3),
          osc('sine', 160, 60, 0.14, 0.5, 0, { dist: 3 }),
        ];
        default: return [ // fire: spit squirt
          nz(2000, 1200, 'bandpass', 0.14, 0.2, 0, 2),
          osc('sawtooth', 700, 240, 0.16, 0.2),
        ];
      }
    case 'trojan':
      switch (kind) {
        case 'growl': return [
          ...[0, 0.07, 0.16, 0.24].map((t, i) => osc('square', 320 + i * 60, 240, 0.045, 0.09, t)),
          nz(1400, 1000, 'bandpass', 0.3, 0.08, 0, 3),
        ];
        case 'pain': return [
          osc('square', 480 + V * 80, 170 - V * 30, 0.14 - V * 0.03, 0.45, 0, { dist: 1.5 }),
          nz(2200, 1500, 'bandpass', 0.1, 0.12, 0, 3),
        ];
        case 'death': return [
          ...impact(0.55),
          osc('square', 420, 38, 0.8, 0.55),
          nz(1800, 300, 'bandpass', 0.6, 0.3, 0.1, 1.6),
          osc('sine', 90, 40, 0.55, 0.55, 0, { dist: 3 }),
        ];
        case 'attack': return [
          nz(1600, 700, 'highpass', 0.1, 0.32),
          osc('square', 220, 90, 0.12, 0.4),
        ];
        default: return [
          nz(2600, 1400, 'bandpass', 0.16, 0.26, 0, 2),
          osc('square', 800, 300, 0.12, 0.24, 0.03),
        ];
      }
    case 'ransomware':
      switch (kind) {
        case 'growl': return [
          osc('sawtooth', 95, 65, 0.5, 0.3, 0, { filter: { type: 'lowpass', f0: 500 } }),
          nz(900, 500, 'bandpass', 0.4, 0.14, 0.06, 4),
        ];
        case 'pain': return [
          osc(V ? 'sawtooth' : 'square', V ? 230 : 180, V ? 70 : 90, V ? 0.14 : 0.16, 0.5,
            0, { filter: { type: 'bandpass', f0: V ? 1000 : 1200, q: 4 } }),
          nz(1500, 800, 'bandpass', 0.14, 0.2, 0, 4),
        ];
        case 'death': return [
          ...impact(0.6),
          osc('sine', 95, 30, 0.9, 0.9, 0, { dist: 3 }),
          nz(1200, 250, 'bandpass', 0.7, 0.36, 0.05, 3),
          osc('square', 160, 45, 0.5, 0.34, 0.12),
          ks(220, 0.5, 0.2, 0.1, 0.99),
        ];
        case 'attack': return [
          ...impact(0.55),
          osc('sawtooth', 140, 50, 0.22, 0.42),
        ];
        default: return [
          nz(1400, 300, 'lowpass', 0.3, 0.34, 0, 0.8),
          osc('sine', 110, 50, 0.26, 0.5, 0, { dist: 3 }),
        ];
      }
    case 'logicbomb':
      switch (kind) {
        case 'growl': return [
          osc('square', 1180, 1180, 0.05, 0.12),
          osc('square', 1180, 1180, 0.05, 0.12, 0.12),
        ];
        case 'pain': return [
          ...[0, 0.07, 0.14].map((t, i) => osc('square', (980 + V * 200) - i * 180, (980 + V * 200) - i * 180, 0.045, 0.32, t)),
        ];
        case 'death': case 'attack': return [
          ...impact(0.85),
          nz(2400, 90, 'lowpass', 0.8, 0.5, 0.02, 0.7),
          osc('sine', 120, 28, 0.75, 0.8, 0, { dist: 3 }),
        ];
        default: return [
          osc('square', 880, 660, 0.08, 0.3),
          nz(1600, 900, 'bandpass', 0.1, 0.2, 0, 2),
        ];
      }
    case 'rat':
      switch (kind) {
        case 'growl': return [
          ...[0, 0.06, 0.13, 0.21].map((t, i) => osc('square', 1500 - i * 110, 1300 - i * 110, 0.035, 0.09, t)),
        ];
        case 'pain': return [
          ...[0, 0.05, 0.1].map((t, i) => osc('square', (1600 + V * 200) - i * 160, (1600 + V * 200) - i * 320, 0.04, 0.3, t)),
        ];
        case 'death': return [
          ...impact(0.5),
          nz(2600, 900, 'highpass', 0.3, 0.34),
          osc('square', 1400, 150, 0.35, 0.36),
          osc('sine', 200, 60, 0.3, 0.45, 0, { dist: 3 }),
        ];
        case 'attack': return [
          nz(3000, 1600, 'highpass', 0.05, 0.3),
          osc('square', 1300, 500, 0.09, 0.34, 0.015),
        ];
        default: return [
          nz(3200, 2000, 'bandpass', 0.1, 0.28, 0, 2.5),
          osc('square', 1500, 800, 0.08, 0.22, 0.02),
        ];
      }
    default: // rootkit
      switch (kind) {
        case 'growl': return [
          osc('sine', 70, 48, 0.6, 0.4, 0, { dist: 4 }),
          nz(400, 150, 'lowpass', 0.55, 0.2),
        ];
        case 'pain': return [
          osc('sine', V ? 100 : 85, V ? 40 : 48, V ? 0.22 : 0.28, 0.6, 0, { dist: 4 }),
          nz(700, 350, 'bandpass', 0.2, 0.2, 0, 2),
        ];
        case 'death': return [
          ...impact(0.55),
          nz(1200, 120, 'lowpass', 0.9, 0.44),
          osc('sine', 75, 26, 0.95, 0.85, 0, { dist: 3 }),
        ];
        case 'attack': return [
          nz(900, 300, 'bandpass', 0.22, 0.4, 0, 2.5),
          osc('sine', 110, 45, 0.2, 0.55, 0, { dist: 3 }),
        ];
        default: return [
          nz(800, 200, 'lowpass', 0.3, 0.32),
          osc('sawtooth', 110, 55, 0.28, 0.34, 0, { dist: 3 }),
        ];
      }
  }
});

// pain variant marker: the layer builders close over V = variant index 0/1
let V = 0;
export function sfxVariantCount(name: string): number {
  return SFX_DEFS[name]?.variants ?? 1;
}

// ---------- analyst voice lines ----------
for (const line of ['pain', 'grunt', 'ready', 'pickup', 'death'] as const) {
  SFX_DEFS[`vox-${line}`] = {
    gendered: true,
    layers: (v) => {
      const spec = VOICES[v];
      const p = spec.pitch;
      const vowel = (vw: Vowel, f0: number, f1: number, dur: number, gain: number, t0 = 0): Layer[] => [
        fm(p * f0, p * f1, dur, gain, t0, formantBank(v, vw), { tilt: spec.tilt, breath: spec.breath }),
      ];
      switch (line) {
        case 'pain': return [...vowel('a', 1.25, 0.85, 0.22, 0.5), nz(1800, 900, 'bandpass', 0.12, 0.15)];
        case 'grunt': return vowel('u', 1, 0.9, 0.14, 0.4);
        case 'pickup': return vowel('e', 1.05, 1.25, 0.16, 0.35);
        case 'ready': return [...vowel('e', 1, 1.1, 0.12, 0.38), ...vowel('o', 1.15, 0.95, 0.2, 0.38, 0.13)];
        default: return vowel('a', 1.3, 0.5, 0.8, 0.55);
      }
    },
  };
}

/** Render the named SFX to a mono buffer (used by the Audio cache + tests + tools). */
export function renderSfx(name: string, sr: number, gender: SfxVariant = 'male', variant = 0): Float32Array | null {
  const spec = SFX_DEFS[name];
  if (!spec) return null;
  V = variant;
  try {
    const seed = hashName(name) + variant * 7919;
    return renderLayers(spec.layers(gender, variant), sr, seed);
  } finally {
    V = 0;
  }
}

export function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
