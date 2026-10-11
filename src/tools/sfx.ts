import type { Gender } from '../core/types';

/**
 * ARSENAL: procedural tool + analyst-voice sound effects (WebAudio, no
 * binary assets). Each tool has a distinct windup/impact signature so the
 * player can tell what they used with their eyes closed.
 */

export type ToolSound =
  | 'kb-swing' | 'kb-impact' | 'mouse-click' | 'mouse-flag' | 'usb-fire' | 'usb-hit'
  | 'badge-swipe' | 'badge-ok' | 'badge-deny' | 'door-clunk' | 'tap-sweep' | 'edr-charge' | 'edr-blast'
  | 'dry' | 'lower' | 'raise' | 'new-tool' | 'ammo' | 'menu-move' | 'menu-pick' | 'menu-back'
  | 'fizzle' | 'confirm' | 'mfa-beep' | 'patch-insert' | 'patch-fire';

export type VoiceLine = 'pain' | 'grunt' | 'ready' | 'pickup' | 'death';

class Synth {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted || typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.28;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur: number, gain: number, filterHz: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ensure();
    if (!ctx || !this.out || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterHz;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /**
   * Source-filter voice: glottal sawtooth, spectral tilt (lowpass), aspiration
   * noise, then three parallel formant band-passes (F1-F3).
   */
  formantVoice(pitch: number, pitchEnd: number, dur: number, v: VoiceSpec, vowel: Formants, gain: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, t);
    o.frequency.exponentialRampToValueAtTime(pitchEnd, t + dur);
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'lowpass';
    tilt.frequency.value = v.tilt;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(tilt);
    vowel.forEach((fq, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = v.q[i];
      const fg = ctx.createGain();
      fg.gain.value = v.amp[i] * 3;
      tilt.connect(bp).connect(fg).connect(env);
    });
    env.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (v.breath > 0) this.noise(dur, gain * v.breath, vowel[1], 1.2, delay);
  }

  /** Crude formant voice: a buzzy glottal source through two vowel filters. */
  voice(pitch: number, pitchEnd: number, dur: number, f1: number, f2: number, gain: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, t);
    o.frequency.exponentialRampToValueAtTime(pitchEnd, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [fq, q, a] of [[f1, 6, 1], [f2, 9, 0.5]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = a * 3;
      o.connect(bp).connect(fg).connect(env);
    }
    env.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

const synth = new Synth();

export function setMuted(m: boolean): void {
  synth.muted = m;
}

export function playTool(s: ToolSound): void {
  const S = synth;
  switch (s) {
    case 'kb-swing': S.noise(0.12, 0.35, 900, 0.7); break;
    case 'kb-impact':
      S.noise(0.018, 1.0, 7200, 1, 0, 'highpass'); // attack transient: hard crack
      S.noise(0.08, 0.9, 2600, 2);
      for (let i = 0; i < 5; i++) S.tone(1900 + i * 140, 1500, 0.025, 'square', 0.22, i * 0.018);
      S.tone(140, 60, 0.12, 'triangle', 0.7);
      break;
    case 'mouse-click':
      S.noise(0.012, 0.5, 7500, 1, 0, 'highpass');
      S.tone(3200, 2400, 0.018, 'square', 0.35); S.tone(1200, 900, 0.03, 'square', 0.2, 0.06); break;
    case 'mouse-flag': S.tone(880, 880, 0.07, 'square', 0.3); S.tone(1320, 1320, 0.1, 'square', 0.3, 0.08); break;
    case 'usb-fire':
      S.noise(0.022, 0.9, 5200, 1, 0, 'highpass'); // attack transient: scan crack
      S.tone(220, 1400, 0.09, 'sawtooth', 0.45);
      S.noise(0.18, 0.6, 3000, 0.8);
      S.tone(90, 40, 0.2, 'square', 0.6);
      break;
    case 'usb-hit': S.tone(1800, 600, 0.12, 'square', 0.35); S.noise(0.1, 0.5, 5000, 1); break;
    case 'badge-swipe': S.noise(0.09, 0.4, 1500, 3); S.tone(400, 700, 0.06, 'sine', 0.2); break;
    case 'badge-ok': S.tone(988, 988, 0.08, 'square', 0.28, 0.08); S.tone(1319, 1319, 0.14, 'square', 0.28, 0.17); break;
    case 'badge-deny': S.tone(180, 170, 0.32, 'sawtooth', 0.45, 0.08); S.tone(186, 176, 0.32, 'square', 0.3, 0.08); break;
    case 'door-clunk':
      // heavy bolt retracting after the reader accepts — low thud + metallic clack
      S.noise(0.07, 0.8, 900, 1, 0.3, 'lowpass');
      S.tone(110, 48, 0.14, 'triangle', 0.7, 0.3);
      S.noise(0.03, 0.5, 3400, 2, 0.36, 'highpass');
      break;
    case 'tap-sweep':
      S.noise(0.02, 0.55, 6200, 1, 0, 'highpass');
      for (let i = 0; i < 6; i++) S.tone(700 + i * 260, 900 + i * 260, 0.03, 'square', 0.16, i * 0.035);
      S.noise(0.25, 0.25, 6000, 0.5, 0, 'highpass');
      break;
    case 'edr-charge': S.tone(120, 1600, 0.45, 'sawtooth', 0.35); S.tone(60, 800, 0.45, 'sine', 0.4); break;
    case 'edr-blast':
      S.noise(0.03, 1.0, 3800, 1, 0, 'highpass'); // attack transient: discharge crack
      S.noise(0.6, 1.0, 400, 0.6, 0, 'lowpass');
      S.tone(1600, 60, 0.5, 'sawtooth', 0.6);
      S.tone(55, 30, 0.6, 'sine', 0.9);
      break;
    case 'dry': S.tone(260, 200, 0.03, 'square', 0.3); S.noise(0.03, 0.3, 4000, 4); break;
    case 'lower': S.noise(0.06, 0.2, 700, 1); break;
    case 'raise': S.noise(0.05, 0.25, 1400, 1); S.tone(500, 800, 0.04, 'triangle', 0.2); break;
    case 'new-tool':
      S.noise(0.25, 0.3, 3000, 0.6);
      [523, 659, 784, 1047, 1319].forEach((f, i) => S.tone(f, f, i === 4 ? 0.3 : 0.09, 'square', 0.25, i * 0.07));
      break;
    case 'ammo': S.tone(660, 990, 0.06, 'square', 0.25); S.tone(990, 1320, 0.06, 'square', 0.22, 0.06); break;
    case 'menu-move': S.tone(500, 420, 0.04, 'square', 0.2); break;
    case 'menu-pick': S.noise(0.15, 0.5, 900, 0.8); S.tone(110, 55, 0.2, 'square', 0.5); break;
    case 'menu-back': S.tone(300, 200, 0.08, 'square', 0.25); break;
    case 'fizzle': S.tone(600, 150, 0.2, 'sawtooth', 0.2); S.noise(0.15, 0.2, 2500, 1); break;
    case 'mfa-beep': S.tone(1760, 1760, 0.04, 'square', 0.22); S.tone(2349, 2349, 0.07, 'square', 0.2, 0.06); break;
    case 'patch-insert':
      S.noise(0.018, 0.5, 5600, 1, 0, 'highpass');
      S.noise(0.07, 0.35, 1100, 2); S.tone(320, 180, 0.04, 'square', 0.3, 0.06); S.tone(700, 1400, 0.1, 'triangle', 0.2, 0.12); break;
    case 'patch-fire':
      // write-chirp: the imaging head scribbles — four quick rising chirps
      // over a disk clack, landing on a commit thunk. FEEL addition so the
      // patch kit has its own report instead of silence after the insert.
      S.noise(0.015, 0.8, 6400, 1, 0, 'highpass');
      for (let i = 0; i < 4; i++) S.tone(1150 + i * 320, 1900 + i * 320, 0.035, 'square', 0.3, i * 0.04);
      S.noise(0.05, 0.55, 1800, 2, 0.05);
      S.tone(210, 90, 0.14, 'triangle', 0.5, 0.16);
      break;
    case 'confirm': S.tone(1046, 1046, 0.06, 'square', 0.25); S.tone(1568, 1568, 0.12, 'square', 0.22, 0.06); break;
  }
}

/** F1, F2, F3 in Hz. */
export type Formants = [number, number, number];
export type Vowel = 'a' | 'e' | 'o' | 'u';
export interface VoiceSpec {
  pitch: number;
  /** Spectral-tilt lowpass on the glottal source (Hz). */
  tilt: number;
  /** Aspiration noise relative to voicing (breathiness). */
  breath: number;
  q: Formants;
  amp: Formants;
  vowels: Record<Vowel, Formants>;
}

/**
 * Each analyst has their own vocal tract: adult male vs adult female vowel
 * formants (after Peterson & Barney 1952 averages), not one table scaled by
 * a constant. Female voicing is breathier with wider formant bandwidths;
 * male voicing is buzzier with narrower ones.
 */
export const VOICES: Record<Gender, VoiceSpec> = {
  male: {
    pitch: 112, tilt: 3400, breath: 0.06, q: [9, 11, 12], amp: [1, 0.55, 0.3],
    vowels: { a: [730, 1090, 2440], e: [530, 1840, 2480], o: [570, 840, 2410], u: [440, 1020, 2240] },
  },
  female: {
    pitch: 210, tilt: 2700, breath: 0.32, q: [5, 7, 8], amp: [1, 0.7, 0.45],
    vowels: { a: [850, 1220, 2810], e: [610, 2330, 2990], o: [590, 920, 2710], u: [470, 1160, 2680] },
  },
};

/** Analyst voice: same lines, distinct vocal tracts. */
export function playVoice(gender: Gender, line: VoiceLine): void {
  const v = VOICES[gender];
  const p = v.pitch;
  const S = synth;
  switch (line) {
    case 'pain': S.formantVoice(p * 1.25, p * 0.85, 0.22, v, v.vowels.a, 0.5); S.noise(0.12, 0.15, 1800, 1); break;
    case 'grunt': S.formantVoice(p, p * 0.9, 0.14, v, v.vowels.u, 0.4); break;
    case 'pickup': S.formantVoice(p * 1.05, p * 1.25, 0.16, v, v.vowels.e, 0.35); break;
    case 'ready':
      S.formantVoice(p, p * 1.1, 0.12, v, v.vowels.e, 0.38);
      S.formantVoice(p * 1.15, p * 0.95, 0.2, v, v.vowels.o, 0.38, 0.13);
      break;
    case 'death': S.formantVoice(p * 1.3, p * 0.5, 0.8, v, v.vowels.a, 0.55); break;
  }
}
