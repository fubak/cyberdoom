export interface SpatialPosition {
  x?: number;
  y?: number;
  gain?: number;
  pan?: number;
  dur?: number;
}

export function spatialize(
  dx: number,
  dy: number,
  listenerAngle: number,
): { gain: number; pan: number } {
  const dist = Math.hypot(dx, dy);
  const gain = dist <= 2.5 ? 1 : Math.max(0, 1 - (dist - 2.5) / 16.5);
  const rel = Math.atan2(dy, dx) - listenerAngle;
  return { gain, pan: Math.sin(rel) * 0.75 };
}

interface VoiceRoute {
  output: AudioNode;
  gain: number;
  pan: number;
}

/** Sources + envelopes scheduled by one sfx() call, so a whole event can be stolen. */
interface VoiceGroup {
  sources: AudioScheduledSourceNode[];
  envs: (GainNode | undefined)[];
}

/** Max concurrent instances of one SFX event; the oldest is faded+stolen past the cap. */
export const VOICE_CAPS: Record<string, number> = {
  step: 4,
  bite: 2,
  'enemy-pain': 3,
  'enemy-fire': 2,
  'enemy-death': 2,
  impact: 2,
  growl: 2,
  hurt: 2,
  spawn: 2,
  windup: 3,
  'sight-worm': 1,
  'sight-trojan': 1,
  'sight-ransomware': 1,
  'sight-rat': 1,
  'sight-rootkit': 1,
  'sight-logicbomb': 1,
  death: 1,
  win: 1,
  lose: 1,
};
const VOICE_CAP_DEFAULT = 3;

/** Per-type enemy voice names (pain-worm, fire-rat, ...) share the cap of their event family. */
const VOICE_CAP_ALIAS: Record<string, string> = {
  pain: 'enemy-pain',
  death: 'enemy-death',
  attack: 'bite',
  fire: 'enemy-fire',
  growl: 'growl',
};

export function voiceCapFor(name: string): number {
  const family = /^([a-z]+)-/.exec(name)?.[1];
  return VOICE_CAPS[name] ?? VOICE_CAPS[VOICE_CAP_ALIAS[family ?? ''] ?? ''] ?? VOICE_CAP_DEFAULT;
}

interface FilterSpec {
  type: BiquadFilterType;
  frequency: number;
  q?: number;
}

interface OscOptions {
  attack?: number;
  delay?: number;
  detune?: number;
  pitchRange?: number;
  filter?: FilterSpec;
  distortion?: boolean;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterSamples: Float32Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices = 0;
  private lastPlayed = new Map<string, number>();
  private listenerX = 0;
  private listenerY = 0;
  private listenerAngle = 0;
  private unlocked = false;
  private combat = false;
  private combatGainApplied = false;
  private ambienceRequested = false;
  private ambience: { sources: AudioScheduledSourceNode[]; nodes: AudioNode[] } | null = null;
  private voiceGroups = new Map<string, VoiceGroup[]>();
  /** Group collecting sources scheduled by the sfx() call currently dispatching. */
  private group: VoiceGroup | null = null;

  private ensure(): AudioContext | null {
    if (!this.unlocked) return null;
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const ctx = this.ctx;
      this.sfxBus = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(64);
      for (let i = 0; i < curve.length; i++) {
        const value = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.round((value + 1) * 31.5) / 31.5 - 1;
      }
      shaper.curve = curve;
      const gritLowpass = ctx.createBiquadFilter();
      gritLowpass.type = 'lowpass';
      gritLowpass.frequency.value = 5500;
      const gritGain = ctx.createGain();
      gritGain.gain.value = 1;
      this.sfxBus.connect(shaper).connect(gritLowpass).connect(gritGain);

      this.ambBus = ctx.createGain();
      this.master = ctx.createGain();
      // Pre-limiter gain kept low so stacked combat sfx hit the glue compressor
      // and brick-wall limiter with headroom instead of clipping digitally.
      this.master.gain.value = 0.45;
      // Glue compressor: evens the mix but a 4ms attack lets hit transients
      // through so loud events still punch over the bed. The limiter after it
      // is a brick wall for stacked combat sfx so they can't clip.
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 6;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.15;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.08;
      gritGain.connect(this.master);
      this.ambBus.connect(this.master);
      this.master.connect(compressor).connect(limiter).connect(ctx.destination);
      this.limiter = limiter;

      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    return this.ctx;
  }

  unlock(): void {
    this.unlocked = true;
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
    if (this.ambienceRequested) this.startAmbience();
  }

  setListener(x: number, y: number, angle: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerAngle = angle;
  }

  setCombat(active: boolean): void {
    if (active !== this.combat) this.combatGainApplied = false;
    this.combat = active;
    this.applyCombatGain();
  }

  private applyCombatGain(): void {
    if (!this.ctx || !this.ambBus || this.combatGainApplied) return;
    this.ambBus.gain.setTargetAtTime(this.combat ? 10 ** (-8 / 20) : 1, this.ctx.currentTime, 0.3);
    this.combatGainApplied = true;
  }

  meter(): { rmsDb: number; peakDb: number } {
    const ctx = this.ensure();
    if (!ctx || !this.limiter) return { rmsDb: -Infinity, peakDb: -Infinity };
    if (!this.analyser) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      this.limiter.disconnect(ctx.destination);
      this.limiter.connect(analyser).connect(ctx.destination);
      this.analyser = analyser;
      this.meterSamples = new Float32Array(analyser.fftSize);
    }
    const samples = this.meterSamples!;
    this.analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    let peak = 0;
    for (const sample of samples) {
      const magnitude = Math.abs(sample);
      sum += sample * sample;
      if (magnitude > peak) peak = magnitude;
    }
    const rms = Math.sqrt(sum / samples.length);
    return {
      rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
      peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    };
  }

  setVoice(_gender: 'male' | 'female'): void {
    this.voicePitch = _gender === 'female' ? 1.45 : 1;
  }

  private voicePitch = 1;

  private route(opts: SpatialPosition, context: AudioContext): VoiceRoute | null {
    let gain = opts.gain ?? 1;
    let pan = opts.pan ?? 0;
    if (opts.x !== undefined || opts.y !== undefined) {
      const position = spatialize(
        (opts.x ?? this.listenerX) - this.listenerX,
        (opts.y ?? this.listenerY) - this.listenerY,
        this.listenerAngle,
      );
      gain *= position.gain;
      pan += position.pan;
    }
    if (gain <= 0 || this.activeVoices >= 24) return null;
    const panner = typeof context.createStereoPanner === 'function'
      ? context.createStereoPanner()
      : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(this.sfxBus!);
    }
    return { output: panner ?? this.sfxBus!, gain, pan };
  }

  private scheduleVoice(
    source: OscillatorNode | AudioBufferSourceNode,
    route: VoiceRoute,
    duration: number,
    delay: number,
    nodes: AudioNode[],
    bufferOffset?: number,
    envelope?: GainNode,
  ): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + delay;
    const end = start + duration;
    this.activeVoices++;
    const grp = this.group;
    if (grp) {
      grp.sources.push(source);
      grp.envs.push(envelope);
    }
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
      if (route.output !== this.sfxBus) route.output.disconnect();
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      if (grp) {
        const i = grp.sources.indexOf(source);
        if (i >= 0) {
          grp.sources.splice(i, 1);
          grp.envs.splice(i, 1);
        }
      }
    };
    if (source instanceof AudioBufferSourceNode && bufferOffset !== undefined) {
      source.start(start, bufferOffset);
    } else {
      source.start(start);
    }
    source.stop(end + 0.005);
  }

  private oscillator(
    type: OscillatorType,
    f0: number,
    f1: number,
    duration: number,
    gain: number,
    opts: SpatialPosition = {},
    options: OscOptions = {},
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const route = this.route(opts, ctx);
    if (!route) return;
    const source = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = ctx.currentTime + (options.delay ?? 0);
    const attack = Math.min(duration, options.attack ?? Math.min(0.008, duration * 0.2));
    const pitch = 1 + (Math.random() - 0.5) * (options.pitchRange ?? 0.1);
    source.type = type;
    source.frequency.setValueAtTime(Math.max(20, f0 * pitch), now);
    source.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), now + duration);
    if (options.detune !== undefined) source.detune.setValueAtTime(options.detune, now);
    const nodes: AudioNode[] = [envelope];
    let chain: AudioNode = source;
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filter.type;
      filter.frequency.value = options.filter.frequency;
      filter.Q.value = options.filter.q ?? 1;
      chain.connect(filter);
      chain = filter;
      nodes.push(filter);
    }
    if (options.distortion) {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 5);
      }
      shaper.curve = curve;
      chain.connect(shaper);
      chain = shaper;
      nodes.push(shaper);
    }
    chain.connect(envelope);
    envelope.connect(route.output);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(Math.max(0.0002, gain * route.gain), now + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    this.scheduleVoice(source, route, duration, options.delay ?? 0, nodes, undefined, envelope);
  }

  private noise(
    filterType: BiquadFilterType,
    f0: number,
    f1: number,
    duration: number,
    q: number,
    gain: number,
    opts: SpatialPosition = {},
    delay = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer || !this.sfxBus) return;
    const route = this.route(opts, ctx);
    if (!route) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    const now = ctx.currentTime + delay;
    filter.frequency.setValueAtTime(Math.max(20, f0), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + duration);
    filter.Q.value = q;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(Math.max(0.0002, gain * route.gain), now + Math.min(0.006, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(envelope);
    this.scheduleVoice(
      source,
      route,
      duration,
      delay,
      [filter, envelope],
      Math.random() * Math.max(0, this.noiseBuffer.duration - duration),
      envelope,
    );
  }

  private formant(
    f0: number,
    f1: number,
    duration: number,
    gain: number,
    opts: SpatialPosition,
  ): void {
    const voice = this.voicePitch;
    this.oscillator('sawtooth', f0 * voice, f1 * voice, duration, gain * 0.7, opts,
      { filter: { type: 'bandpass', frequency: 700, q: 6 }, pitchRange: 0.05 });
    this.oscillator('sawtooth', f0 * voice, f1 * voice, duration, gain * 0.45, opts,
      { filter: { type: 'bandpass', frequency: 1200, q: 6 }, pitchRange: 0.05 });
    this.noise('bandpass', 1800, 1100, Math.min(duration, 0.18), 1.2, gain * 0.12, opts);
  }

  /** Short crack + low thump so impacts read as hits, not dull thuds. */
  private impactLayer(opts: SpatialPosition, gain: number, delay = 0): void {
    this.noise('highpass', 2400, 900, 0.035, 0.9, gain * 0.9, opts, delay);
    this.oscillator('sine', 85, 36, 0.11, gain, opts, {
      attack: 0.004,
      distortion: true,
      pitchRange: 0.02,
      delay,
    });
  }

  private body(
    freqStart: number,
    freqEnd: number,
    duration: number,
    gain: number,
    opts: SpatialPosition,
  ): void {
    this.oscillator('sine', freqStart, freqEnd, duration, gain, opts,
      { attack: Math.min(0.012, duration * 0.15), distortion: true, pitchRange: 0.01 });
  }

  /**
   * ENEMIES: per-type threat voices. Names arrive as `<kind>-<threat>`
   * (kind: growl | pain | death | attack | fire) from the combat wiring in
   * main.ts. Each threat gets a signature timbre so pain/death/attack read
   * by ear alone; unknown threats fall back to the shared voices.
   */
  private enemyVoice(kind: 'growl' | 'pain' | 'death' | 'attack' | 'fire', threat: string, o: SpatialPosition): void {
    switch (threat) {
      case 'worm':
        // high chittering parasite
        if (kind === 'growl') {
          this.noise('bandpass', 2400, 1600, 0.3, 2, 0.14, o);
          [0, 0.09, 0.2].forEach((d, i) => this.oscillator('square', 900 - i * 140, 700 - i * 140, 0.05, 0.1, o, { delay: d }));
        } else if (kind === 'pain') {
          this.formant(620, 380, 0.18, 0.7, o);
          this.noise('bandpass', 2800, 1900, 0.12, 2.5, 0.16, o);
        } else if (kind === 'death') {
          this.formant(540, 90, 0.65, 0.9, o);
          this.noise('lowpass', 900, 200, 0.5, 1, 0.3, o, 0.08);
        } else if (kind === 'attack') {
          this.noise('highpass', 2400, 1100, 0.06, 1, 0.3, o);
          this.body(160, 60, 0.14, 0.5, o);
        } else {
          this.noise('bandpass', 2000, 1200, 0.14, 2, 0.2, o);
          this.oscillator('sawtooth', 700, 240, 0.16, 0.2, o);
        }
        return;
      case 'trojan':
        // servo-driven gift box: robotic garble + mechanism clacks
        if (kind === 'growl') {
          [0, 0.07, 0.16, 0.24].forEach((d, i) => this.oscillator('square', 320 + i * 60, 240, 0.045, 0.09, o, { delay: d }));
          this.noise('bandpass', 1400, 1000, 0.3, 3, 0.08, o);
        } else if (kind === 'pain') {
          this.oscillator('square', 480, 170, 0.14, 0.42, o, { pitchRange: 0.3 });
          this.noise('bandpass', 2200, 1500, 0.1, 3, 0.12, o);
        } else if (kind === 'death') {
          this.oscillator('square', 420, 38, 0.8, 0.5, o, { pitchRange: 0.06 });
          this.noise('bandpass', 1800, 300, 0.6, 1.6, 0.28, o, 0.1);
          this.body(90, 40, 0.55, 0.5, o);
        } else if (kind === 'attack') {
          this.noise('highpass', 1600, 700, 0.1, 1, 0.32, o);
          this.oscillator('square', 220, 90, 0.12, 0.4, o);
        } else {
          this.noise('bandpass', 2600, 1400, 0.16, 2, 0.26, o);
          this.oscillator('square', 800, 300, 0.12, 0.24, o, { delay: 0.03 });
        }
        return;
      case 'ransomware':
        // heavy padlock brute: metallic clangs, chains, deep slam
        if (kind === 'growl') {
          this.oscillator('sawtooth', 95, 65, 0.5, 0.3, o, { filter: { type: 'lowpass', frequency: 500 } });
          this.noise('bandpass', 900, 500, 0.4, 4, 0.14, o, 0.06);
        } else if (kind === 'pain') {
          this.oscillator('square', 180, 90, 0.16, 0.5, o, { filter: { type: 'bandpass', frequency: 1200, q: 4 } });
          this.noise('bandpass', 1500, 800, 0.14, 4, 0.2, o);
        } else if (kind === 'death') {
          this.body(95, 30, 0.9, 0.85, o);
          this.noise('bandpass', 1200, 250, 0.7, 3, 0.34, o, 0.05);
          this.oscillator('square', 160, 45, 0.5, 0.3, o, { delay: 0.12 });
        } else if (kind === 'attack') {
          this.impactLayer(o, 0.55);
          this.oscillator('sawtooth', 140, 50, 0.22, 0.42, o);
        } else {
          this.noise('lowpass', 1400, 300, 0.3, 0.8, 0.34, o);
          this.body(110, 50, 0.26, 0.5, o);
        }
        return;
      case 'logicbomb':
        // countdown device: error beeps → detonation
        if (kind === 'growl') {
          [0, 0.12].forEach((d) => this.oscillator('square', 1180, 1180, 0.05, 0.12, o, { delay: d }));
        } else if (kind === 'pain') {
          [0, 0.07, 0.14].forEach((d, i) => this.oscillator('square', 980 - i * 180, 980 - i * 180, 0.045, 0.3, o, { delay: d }));
        } else if (kind === 'death' || kind === 'attack') {
          this.impactLayer(o, 0.85);
          this.noise('lowpass', 2400, 90, 0.8, 0.7, 0.5, o, 0.02);
          this.body(120, 28, 0.75, 0.8, o);
        } else {
          this.oscillator('square', 880, 660, 0.08, 0.3, o);
          this.noise('bandpass', 1600, 900, 0.1, 2, 0.2, o);
        }
        return;
      case 'rat':
        // quick chittering remote agent
        if (kind === 'growl') {
          [0, 0.06, 0.13, 0.21].forEach((d, i) => this.oscillator('square', 1500 - i * 110, 1300 - i * 110, 0.035, 0.09, o, { delay: d }));
        } else if (kind === 'pain') {
          [0, 0.05, 0.1].forEach((d, i) => this.oscillator('square', 1600 - i * 160, 1150 - i * 160, 0.04, 0.28, o, { delay: d }));
        } else if (kind === 'death') {
          this.noise('highpass', 2600, 900, 0.3, 1, 0.32, o);
          this.oscillator('square', 1400, 150, 0.35, 0.34, o);
          this.body(200, 60, 0.3, 0.4, o);
        } else if (kind === 'attack') {
          this.noise('highpass', 3000, 1600, 0.05, 1, 0.3, o);
          this.oscillator('square', 1300, 500, 0.09, 0.34, o, { delay: 0.015 });
        } else {
          this.noise('bandpass', 3200, 2000, 0.1, 2.5, 0.28, o);
          this.oscillator('square', 1500, 800, 0.08, 0.22, o, { delay: 0.02 });
        }
        return;
      case 'rootkit':
        // sub-bass burrower: groans, scrapes, rumbles
        if (kind === 'growl') {
          this.oscillator('sine', 70, 48, 0.6, 0.4, o, { distortion: true });
          this.noise('lowpass', 400, 150, 0.55, 1, 0.2, o);
        } else if (kind === 'pain') {
          this.oscillator('sine', 85, 48, 0.28, 0.6, o, { distortion: true });
          this.noise('bandpass', 700, 350, 0.2, 2, 0.2, o);
        } else if (kind === 'death') {
          this.noise('lowpass', 1200, 120, 0.9, 1, 0.42, o);
          this.body(75, 26, 0.95, 0.8, o);
        } else if (kind === 'attack') {
          this.noise('bandpass', 900, 300, 0.22, 2.5, 0.4, o);
          this.body(110, 45, 0.2, 0.55, o);
        } else {
          this.noise('lowpass', 800, 200, 0.3, 1, 0.32, o);
          this.oscillator('sawtooth', 110, 55, 0.28, 0.34, o, { distortion: true });
        }
        return;
      default:
        // unknown threat → shared voices
        if (kind === 'pain') this.sfx('enemy-pain', o);
        else if (kind === 'death') this.sfx('enemy-death', o);
        else if (kind === 'attack') this.sfx('bite', o);
        else if (kind === 'fire') this.sfx('enemy-fire', o);
        else this.sfx('growl', o);
    }
  }

  private allow(name: string, ctx: AudioContext): boolean {
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < 0.05) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  /**
   * Per-event voice limiting: past the per-name cap, the oldest instance is
   * faded out over ~15 ms and its sources stopped, so stacked combat sfx
   * stay clean instead of summing into clipping.
   */
  private limitVoices(name: string, ctx: AudioContext): void {
    const groups = this.voiceGroups.get(name);
    if (!groups) return;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].sources.length === 0) groups.splice(i, 1);
    }
    const cap = voiceCapFor(name);
    while (groups.length >= cap) {
      const oldest = groups.shift()!;
      for (let i = 0; i < oldest.sources.length; i++) {
        const env = oldest.envs[i];
        if (env) env.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.012);
        try {
          oldest.sources[i].stop(ctx.currentTime + 0.06);
        } catch {
          // already stopped
        }
      }
    }
  }

  sfx(name: string, opts: SpatialPosition = {}): void {
    const ctx = this.ensure();
    if (!ctx || !this.allow(name, ctx)) return;
    this.limitVoices(name, ctx);
    const grp: VoiceGroup = { sources: [], envs: [] };
    this.group = grp;
    const o = opts;
    const dur = opts.dur;
    try {
    const voice = /^(growl|pain|death|attack|fire)-([a-z]+)$/.exec(name);
    if (voice) {
      this.enemyVoice(voice[1] as 'growl' | 'pain' | 'death' | 'attack' | 'fire', voice[2], o);
    } else {
    switch (name) {
      case 'fire':
        this.noise('highpass', 1800, 900, 0.11, 0.8, 0.38, o);
        this.oscillator('sawtooth', 180, 75, 0.13, 0.32, o);
        break;
      case 'keyboard':
        for (let i = 0; i < 3; i++) this.noise('highpass', 1800 + i * 250, 1100, 0.025, 0.7, 0.24, o, i * 0.025);
        this.oscillator('square', 1450, 1150, 0.035, 0.12, o, { delay: 0.018 });
        break;
      case 'scan':
        this.oscillator('square', 880, 220, 0.14, 0.5, o);
        this.noise('bandpass', 2600, 1300, 0.06, 1, 0.45, o);
        this.oscillator('sine', 120, 50, 0.1, 0.42, o);
        break;
      case 'clean':
        [620, 830, 1100].forEach((f, i) => this.oscillator('sine', f, f * 1.08, 0.22, 0.35, o, { delay: i * 0.105 }));
        break;
      case 'door':
        this.noise('lowpass', 200, 600, 0.75, 0.7, 0.38, o, 0.05);
        this.oscillator('sawtooth', 55, 80, 0.75, 0.28, o, { delay: 0.05 });
        this.noise('lowpass', 400, 100, 0.1, 0.8, 0.38, o);
        this.oscillator('square', 110, 45, 0.09, 0.2, o, { delay: 0.8 });
        break;
      case 'denied':
        this.oscillator('square', 140, 120, 0.15, 0.32, o);
        this.oscillator('square', 140, 110, 0.17, 0.32, o, { delay: 0.18 });
        break;
      case 'hurt':
        this.formant(150, 95, 0.22, 1.15, o);
        this.body(68, 45, 0.24, 0.58, o);
        break;
      case 'pickup':
        this.oscillator('square', 660, 660, 0.05, 0.28, o);
        this.oscillator('square', 990, 990, 0.08, 0.32, o, { delay: 0.055 });
        break;
      case 'inspect':
        [880, 1320, 1760].forEach((f, i) => this.oscillator('square', f, f, 0.04, 0.2, o, { delay: i * 0.04 }));
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.oscillator('square', f, f, 0.2, 0.24, o, { delay: i * 0.12 }));
        break;
      case 'lose':
        this.oscillator('sawtooth', 300, 70, 0.7, 0.55, o);
        this.noise('lowpass', 600, 120, 0.55, 1, 0.14, o);
        break;
      case 'click':
        this.oscillator('square', 900, 720, 0.035, 0.16, o);
        break;
      case 'oof':
        this.formant(180, 105, 0.12, 0.52, o);
        break;
      case 'death':
        this.formant(300, 80, 0.9, 1.25, o);
        this.noise('bandpass', 1400, 500, 0.82, 1.3, 0.38, o);
        this.body(68, 42, 0.88, 0.72, o);
        break;
      case 'badge':
        this.oscillator('square', 1800, 1800, 0.07, 0.2, o);
        break;
      case 'mouse':
        this.noise('highpass', 1800, 900, 0.035, 0.8, 0.2, o);
        this.noise('highpass', 1800, 900, 0.035, 0.8, 0.2, o, 0.09);
        break;
      case 'switch':
        this.noise('bandpass', 900, 300, 0.12, 1, 0.28, o);
        this.oscillator('square', 170, 75, 0.09, 0.3, o, { delay: 0.06 });
        break;
      case 'sight-worm':
        this.oscillator('sawtooth', 200, 900, 0.24, 0.3, o, { filter: { type: 'bandpass', frequency: 850, q: 4 } });
        break;
      case 'sight-trojan':
        this.roboticGarble(o);
        break;
      case 'sight-ransomware':
        this.oscillator('sawtooth', 60, 110, 0.6, 0.65, o, {
          filter: { type: 'lowpass', frequency: 420, q: 1 }, distortion: true,
        });
        break;
      case 'sight-logicbomb':
        // fuse hiss + a rising charge whine
        this.noise('bandpass', 1200, 3200, 0.3, 1, 0.3, o);
        this.oscillator('square', 300, 1400, 0.35, 0.2, o, { delay: 0.08 });
        break;
      case 'sight-rat':
        // chittering bursts: short high blips + a scrape
        for (let i = 0; i < 4; i++) {
          this.oscillator('square', 1400 - i * 150, 1100 - i * 120, 0.05, 0.26, o, { delay: i * 0.055 });
        }
        this.noise('bandpass', 2400, 1600, 0.12, 1.4, 0.3, o, 0.1);
        break;
      case 'sight-rootkit':
        // sub-bass throb surfacing out of a hiss — something was under the floor
        this.oscillator('sine', 55, 90, 0.5, 0.6, o, { distortion: true });
        this.noise('bandpass', 400, 900, 0.4, 1, 0.2, o, 0.1);
        break;
      case 'growl':
        // low hunting rumble, positional; wobbles like breathing
        this.oscillator('sawtooth', 70, 95, 0.5, 0.3, o, {
          filter: { type: 'lowpass', frequency: 300, q: 2 }, distortion: true, pitchRange: 0.06,
        });
        this.noise('lowpass', 350, 150, 0.4, 1, 0.14, o);
        break;
      case 'seal':
        // padlock slam: metallic clack + dead-bolt thud
        this.noise('bandpass', 700, 1800, 0.07, 1.6, 0.5, o);
        this.oscillator('square', 220, 90, 0.12, 0.42, o, { delay: 0.04 });
        this.body(65, 42, 0.16, 0.5, o);
        break;
      case 'unseal':
        [880, 1100].forEach((f, i) => this.oscillator('square', f, f, 0.07, 0.24, o, { delay: i * 0.08 }));
        break;
      case 'spawn':
        // teleport-fog whoosh + materialise thump
        this.noise('bandpass', 300, 2800, 0.36, 1, 0.72, o);
        this.oscillator('sine', 90, 320, 0.32, 0.5, o);
        this.oscillator('square', 1600, 400, 0.14, 0.24, o, { delay: 0.05 });
        this.body(80, 50, 0.3, 0.4, o);
        break;
      case 'windup':
        this.oscillator('sine', 300, 1200, Math.max(0.1, dur ?? 0.5), 0.32, o);
        break;
      case 'bite':
        this.noise('highpass', 2600, 1100, 0.035, 0.8, 0.75, o);
        this.noise('lowpass', 1600, 180, 0.14, 0.7, 0.85, o);
        this.oscillator('square', 150, 65, 0.07, 0.42, o);
        this.body(70, 48, 0.14, 0.45, o);
        break;
      case 'enemy-fire':
        this.noise('bandpass', 400, 1500, 0.25, 1, 0.68, o);
        this.oscillator('square', 110, 55, 0.24, 0.42, o);
        this.body(70, 46, 0.24, 0.42, o);
        break;
      case 'impact':
        this.impactLayer(o, 0.85);
        this.noise('lowpass', 1500, 200, 0.3, 0.8, 0.76, o);
        this.oscillator('sine', 90, 40, 0.25, 0.68, o);
        this.body(70, 45, 0.28, 0.62, o);
        break;
      case 'enemy-pain':
        this.noise('highpass', 2200, 1000, 0.03, 0.9, 0.5, o);
        this.formant(640, 300, 0.2, 0.95, o);
        this.body(75, 45, 0.14, 0.5, o);
        break;
      case 'enemy-death':
        this.impactLayer(o, 0.9);
        this.noise('bandpass', 1400, 220, 0.45, 1, 0.95, o);
        this.oscillator('sawtooth', 400, 60, 0.5, 0.78, o, { filter: { type: 'lowpass', frequency: 900, q: 1 } });
        this.body(70, 45, 0.5, 0.72, o);
        break;
      case 'step':
        this.noise('lowpass', 320, 180, 0.06, 0.8, 0.09, o);
        this.oscillator('sine', 90, 60, 0.06, 0.09, o, { pitchRange: 0.08 });
        this.noise('bandpass', 1500, 850, 0.018, 1.2, 0.045, o);
        break;
      default:
        break;
    }
    }
    } finally {
      this.group = null;
    }
    if (grp.sources.length > 0) {
      const groups = this.voiceGroups.get(name) ?? [];
      groups.push(grp);
      this.voiceGroups.set(name, groups);
    }
  }

  private roboticGarble(opts: SpatialPosition): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const route = this.route(opts, ctx);
    if (!route) return;
    const carrier = ctx.createOscillator();
    carrier.type = 'square';
    carrier.frequency.value = 190;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 23;
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain).connect(carrier.frequency);
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(0.3 * route.gain, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    carrier.connect(envelope).connect(route.output);
    this.activeVoices++;
    const grp = this.group;
    if (grp) {
      grp.sources.push(carrier);
      grp.envs.push(envelope);
    }
    carrier.onended = () => {
      carrier.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      envelope.disconnect();
      if (route.output !== this.sfxBus) route.output.disconnect();
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      if (grp) {
        const i = grp.sources.indexOf(carrier);
        if (i >= 0) {
          grp.sources.splice(i, 1);
          grp.envs.splice(i, 1);
        }
      }
    };
    lfo.start(now);
    lfo.stop(now + 0.41);
    carrier.start(now);
    carrier.stop(now + 0.405);
  }

  startAmbience(): void {
    this.ambienceRequested = true;
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer || !this.ambBus || this.ambience) return;
    this.setCombat(this.combat);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 180;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.04;
    lowpass.connect(humGain).connect(this.ambBus);
    const hum1 = ctx.createOscillator();
    hum1.type = 'sawtooth';
    hum1.frequency.value = 50;
    const hum2 = ctx.createOscillator();
    hum2.type = 'sawtooth';
    hum2.frequency.value = 100.5;
    hum2.detune.value = 5;
    hum1.connect(lowpass);
    hum2.connect(lowpass);

    const fan = ctx.createBufferSource();
    fan.buffer = this.noiseBuffer;
    fan.loop = true;
    const fanFilter = ctx.createBiquadFilter();
    fanFilter.type = 'bandpass';
    fanFilter.frequency.value = 800;
    fanFilter.Q.value = 0.7;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.015;
    fan.connect(fanFilter).connect(fanGain).connect(this.ambBus);

    const sources: AudioScheduledSourceNode[] = [hum1, hum2, fan];
    const nodes: AudioNode[] = [lowpass, humGain, fanFilter, fanGain];
    this.ambience = { sources, nodes };
    const cleanup = () => {
      for (const source of sources) source.disconnect();
      for (const node of nodes) node.disconnect();
      this.ambience = null;
    };
    hum1.onended = cleanup;
    hum2.onended = cleanup;
    fan.onended = cleanup;
    for (const source of sources) source.start();
  }

  stopAmbience(): void {
    this.ambienceRequested = false;
    if (!this.ambience || !this.ctx) return;
    const { sources } = this.ambience;
    const stopAt = this.ctx.currentTime + 0.02;
    for (const source of sources) {
      try {
        source.stop(stopAt);
      } catch {
        // A source may already have been stopped by the audio context.
      }
    }
  }
}
