/**
 * AUDIO: the runtime facade. Every SFX event name maps to a layered recipe
 * in audio/sfxdef.ts that is rendered ONCE into an AudioBuffer (offline,
 * deterministic — see audio/dsp.ts) and replayed through the shared bus
 * graph, so a "fire" call costs one buffer source instead of a dozen live
 * oscillators. Music is a deterministic score (audio/songs.ts) rendered
 * per layer ('bed' | 'threat' | 'combat') and mixed live for adaptive
 * intensity: exploration bed → threat swells when voices wake → full combat
 * stack while setCombat(true).
 *
 * Bus graph:
 *   sfx voices  → sfxBus → [quant grit → 5.5k LP] ─┬─→ master
 *                (positional pan/gain per voice)   └─→ reverb send ─┐
 *   ambience    → ambBus ──────────────────────────→ master          │
 *   music layers→ layerGains → musicDuck ──→ musicBus ─→ master      │
 *                        └──────────→ reverb send ────→ convolver ───┘
 *   master → glue comp → brickwall limiter → analyser → destination
 */

import { mulberry32 } from './audio/dsp';
import { renderSfx, SFX_DEFS, sfxVariantCount, type SfxVariant } from './audio/sfxdef';
import { renderSong, renderSting } from './audio/render';
import { SONGS, STINGS } from './audio/songs';
import type { MusicLayer } from './audio/sequencer';

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

/** One playing SFX instance: a single buffer source plus its steal-fade gain. */
interface Voice {
  source: AudioBufferSourceNode;
  env: GainNode;
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
  kill: 2,
  win: 1,
  lose: 1,
  alarm: 1,
};
const VOICE_CAP_DEFAULT = 3;

/** Per-type enemy voice names (pain-worm, fire-rat, ...) share the cap of their event family. */
const VOICE_CAP_ALIAS: Record<string, string> = {
  pain: 'enemy-pain',
  death: 'enemy-death',
  attack: 'bite',
  fire: 'enemy-fire',
  growl: 'growl',
  idle: 'growl',
};

export function voiceCapFor(name: string): number {
  const family = /^([a-z]+)-/.exec(name)?.[1];
  return VOICE_CAPS[name] ?? VOICE_CAPS[VOICE_CAP_ALIAS[family ?? ''] ?? ''] ?? VOICE_CAP_DEFAULT;
}

/** Background-score identity: mission tiers plus the screen beds and the RICKROLL egg. */
export type MusicTier = 'early' | 'mid' | 'late' | 'rick' | 'title' | 'briefing' | 'debrief';

/** Music-bus send: the score sits ~-18..-20 dB RMS under the sfx bus. */
const MUSIC_SEND = 1.2;

const MUSIC_LAYERS: MusicLayer[] = ['bed', 'threat', 'combat'];

/** How long the threat layer keeps swelling after the last hostile voice. */
const THREAT_LINGER_S = 3.5;

export class Audio {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterSamples: Float32Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private convolver: ConvolverNode | null = null;
  private roomSizeBucket = -1;
  private activeVoices = 0;
  private lastPlayed = new Map<string, number>();
  private listenerX = 0;
  private listenerY = 0;
  private listenerAngle = 0;
  private unlocked = false;
  private muted = false;
  private combat = false;
  private ambienceRequested = false;
  private ambience: { sources: AudioScheduledSourceNode[]; nodes: AudioNode[] } | null = null;
  private musicRequested: MusicTier | null = null;
  private musicPlaying: MusicTier | null = null;
  private musicVol = 0.7;
  private layerGains: Record<MusicLayer, GainNode> | null = null;
  private musicSources: AudioBufferSourceNode[] = [];
  private threatUntil = 0;
  private gender: SfxVariant = 'male';
  private sfxCache = new Map<string, AudioBuffer>();
  private songCache = new Map<string, AudioBuffer[]>();
  private stingCache = new Map<string, AudioBuffer>();
  private variantPick = new Map<string, number>();
  private voices = new Map<string, Voice[]>();

  private ensure(): AudioContext | null {
    if (!this.unlocked || this.muted) return null;
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const ctx = this.ctx;
      this.sfxBus = ctx.createGain();
      // lo-fi grit shared by every sfx voice: subtle 32-step quantization
      // plus a 5.5 kHz lowpass keeps hits crunchy but tamed
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
      this.sfxBus.connect(shaper).connect(gritLowpass).connect(gritGain);

      this.ambBus = ctx.createGain();
      this.musicDuck = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVol * MUSIC_SEND;
      this.master = ctx.createGain();
      // pre-limiter headroom so stacked combat hits glue, not digital clip
      this.master.gain.value = 0.45;
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

      // synthesized room reverb: one deterministic IR regenerated on room
      // size change; sfx get the bigger send, the score a touch for space
      this.convolver = ctx.createConvolver();
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.3;
      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.12;
      this.setRoomSize(this.roomSizeBucket < 0 ? 0.5 : this.roomSizeBucket / 10);

      gritGain.connect(this.master);
      gritGain.connect(sfxSend).connect(this.convolver);
      this.ambBus.connect(this.master);
      this.musicBus.connect(this.musicDuck).connect(this.master);
      this.musicDuck.connect(musicSend).connect(this.convolver);
      this.convolver.connect(this.master);
      this.master.connect(compressor).connect(limiter).connect(ctx.destination);
      this.limiter = limiter;

      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      const rng = mulberry32(0x5eed);
      for (let i = 0; i < samples.length; i++) samples[i] = rng() * 2 - 1;
    }
    return this.ctx;
  }

  unlock(): void {
    this.unlocked = true;
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
    if (this.ambienceRequested) this.startAmbience();
    if (this.musicRequested) this.startMusic(this.musicRequested);
  }

  /** tools/sfx.ts mute flag (menu sounds off while tests drive the game). */
  setMuted(m: boolean): void {
    this.muted = m;
  }

  setListener(x: number, y: number, angle: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerAngle = angle;
  }

  /**
   * Room-scale reverb: `size` 0..1 maps to a ~0.4-2.6 s synthesized impulse
   * response (decaying noise + a few early taps). Quantized to 0.1 buckets so
   * per-frame callers never rebuild the IR.
   */
  setRoomSize(size: number): void {
    const bucket = Math.round(Math.max(0, Math.min(1, size)) * 10);
    if (bucket === this.roomSizeBucket && this.convolver?.buffer) return;
    this.roomSizeBucket = bucket;
    if (!this.ctx || !this.convolver) return;
    const sr = this.ctx.sampleRate;
    const seconds = 0.4 + (bucket / 10) * 2.2;
    const n = Math.floor(seconds * sr);
    const ir = this.ctx.createBuffer(2, n, sr);
    const rng = mulberry32(0xc0ffee + bucket * 977);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] = (rng() * 2 - 1) * Math.exp((-3 * t) / seconds) * (1 - t / seconds);
      }
      // sparse early reflections so small rooms still read as rooms
      for (const tap of [0.021, 0.037, 0.052]) {
        const i = Math.floor(tap * sr);
        if (i < n) d[i] += (rng() - 0.5) * 0.5;
      }
    }
    this.convolver.buffer = ir;
  }

  setCombat(active: boolean): void {
    this.combat = active;
    if (!this.ctx) return;
    this.ambBus?.gain.setTargetAtTime(active ? 10 ** (-8 / 20) : 1, this.ctx.currentTime, 0.3);
    // the score ducks under combat sfx so hits/kills still read on top
    this.musicDuck?.gain.setTargetAtTime(active ? 10 ** (-7 / 20) : 1, this.ctx.currentTime, 0.25);
    this.applyLayerTargets();
  }

  private applyLayerTargets(): void {
    const ctx = this.ctx;
    const gains = this.layerGains;
    if (!ctx || !gains) return;
    const now = ctx.currentTime;
    const threatened = this.combat || now < this.threatUntil;
    gains.bed.gain.setTargetAtTime(1, now, 0.8);
    gains.threat.gain.setTargetAtTime(this.combat ? 0.85 : threatened ? 0.55 : 0.04, now, 0.9);
    gains.combat.gain.setTargetAtTime(this.combat ? 1 : 0, now, this.combat ? 0.35 : 1.2);
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

  setVoice(gender: 'male' | 'female'): void {
    this.gender = gender;
  }

  // ---------- sfx buffers ----------

  /**
   * Resolve a played name to its registry key: `<kind>-<anything>` without a
   * recipe falls back to the shared family voice (what the old switch did for
   * unknown threats), everything else stays silent.
   */
  private resolveName(name: string): string | null {
    if (SFX_DEFS[name]) return name;
    const m = /^(growl|idle|pain|death|attack|fire)-/.exec(name);
    if (!m) return null;
    const fallback = { growl: 'growl', idle: 'growl', pain: 'enemy-pain', death: 'enemy-death', attack: 'bite', fire: 'enemy-fire' }[m[1]];
    return fallback && SFX_DEFS[fallback] ? fallback : null;
  }

  private bufferFor(name: string): AudioBuffer | null {
    const spec = SFX_DEFS[name];
    const ctx = this.ctx;
    if (!spec || !ctx) return null;
    const variants = sfxVariantCount(name);
    const pick = variants > 1 ? (this.variantPick.get(name) ?? 0) % variants : 0;
    if (variants > 1) this.variantPick.set(name, pick + 1);
    const key = spec.gendered ? `${name}|${this.gender}` : variants > 1 ? `${name}|${pick}` : name;
    let buf = this.sfxCache.get(key);
    if (!buf) {
      const data = renderSfx(name, ctx.sampleRate, this.gender, pick);
      if (!data) return null;
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.sfxCache.set(key, buf);
    }
    return buf;
  }

  private allow(name: string, ctx: AudioContext): boolean {
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < 0.05) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  /** Past the per-name cap, fade the oldest instance out over ~15 ms and steal it. */
  private limitVoices(name: string, ctx: AudioContext): void {
    const list = this.voices.get(name);
    if (!list) return;
    while (list.length >= voiceCapFor(name)) {
      const oldest = list.shift()!;
      oldest.env.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.012);
      try {
        oldest.source.stop(ctx.currentTime + 0.06);
      } catch {
        // already stopped
      }
    }
  }

  sfx(name: string, opts: SpatialPosition = {}): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const resolved = this.resolveName(name);
    if (!resolved || !this.allow(resolved, ctx)) return;
    const buffer = this.bufferFor(resolved);
    if (!buffer) return;
    this.limitVoices(resolved, ctx);

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
    // `idle-<threat>` is the growl timbre dropped to mutter level
    if (name.startsWith('idle-')) gain *= 0.55;
    if (gain <= 0 || this.activeVoices >= 24) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (opts.dur !== undefined && SFX_DEFS[resolved]?.truncatable && opts.dur > 0.05) {
      source.playbackRate.value = Math.max(0.5, Math.min(3, buffer.duration / opts.dur));
    }
    const env = ctx.createGain();
    env.gain.value = gain;
    const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(env).connect(panner).connect(this.sfxBus);
    } else {
      source.connect(env).connect(this.sfxBus);
    }

    this.activeVoices++;
    const voice: Voice = { source, env };
    source.onended = () => {
      source.disconnect();
      env.disconnect();
      panner?.disconnect();
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      const list = this.voices.get(resolved);
      const i = list?.indexOf(voice) ?? -1;
      if (list && i >= 0) list.splice(i, 1);
    };
    let list = this.voices.get(resolved);
    if (!list) this.voices.set(resolved, (list = []));
    list.push(voice);
    source.start();

    // hostile voices swell the threat music layer even before combat engages
    if (/^(growl|idle|pain|death|attack|fire|sight)-/.test(name)) {
      this.threatUntil = ctx.currentTime + THREAT_LINGER_S;
      this.applyLayerTargets();
    }
  }

  // ---------- ambience ----------

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
        // a source may already have been stopped by the audio context
      }
    }
  }

  // ---------- procedural score ----------

  /**
   * Render (once, cached) and loop the named score. Safe before the audio
   * context exists — the request replays on unlock — and idempotent per tier.
   */
  startMusic(tier: MusicTier): void {
    this.musicRequested = tier;
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.musicPlaying === tier && this.musicSources.length > 0) return;
    const song = SONGS[tier];
    if (!song) return;
    this.stopMusicSources();

    let layers = this.songCache.get(tier);
    if (!layers) {
      const rendered = renderSong(song, ctx.sampleRate, 0xdec0de + tier.length * 131);
      layers = MUSIC_LAYERS.map((l) => {
        const buf = ctx.createBuffer(1, rendered[l].length, ctx.sampleRate);
        buf.copyToChannel(rendered[l] as Float32Array<ArrayBuffer>, 0);
        return buf;
      });
      this.songCache.set(tier, layers);
    }
    if (!this.layerGains) {
      this.layerGains = {
        bed: ctx.createGain(),
        threat: ctx.createGain(),
        combat: ctx.createGain(),
      };
      for (const l of MUSIC_LAYERS) this.layerGains[l].connect(this.musicDuck!);
    }
    const now = ctx.currentTime;
    this.layerGains.bed.gain.setValueAtTime(0.0001, now);
    this.layerGains.threat.gain.setValueAtTime(0.04, now);
    this.layerGains.combat.gain.setValueAtTime(0, now);
    this.musicSources = MUSIC_LAYERS.map((l, i) => {
      const src = ctx.createBufferSource();
      src.buffer = layers![i];
      src.loop = true;
      src.connect(this.layerGains![l]);
      src.start();
      return src;
    });
    this.musicPlaying = tier;
    this.applyLayerTargets();
  }

  private stopMusicSources(): void {
    const ctx = this.ctx;
    for (const src of this.musicSources) {
      try {
        if (ctx) src.stop(ctx.currentTime + 0.1);
        else src.stop();
      } catch {
        // already stopped
      }
      src.onended = () => src.disconnect();
    }
    this.musicSources = [];
    this.musicPlaying = null;
  }

  stopMusic(): void {
    this.musicRequested = null;
    this.musicPlaying = null;
    const ctx = this.ctx;
    if (ctx && this.layerGains) {
      // quick fade so loops don't click on the way out
      for (const l of MUSIC_LAYERS) this.layerGains[l].gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    }
    this.stopMusicSources();
  }

  /** User music volume 0-1 (0 = muted); applied live and persisted by the game. */
  setMusicVolume(v: number): void {
    this.musicVol = Math.max(0, Math.min(1, v));
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.musicVol * MUSIC_SEND, this.ctx.currentTime, 0.05);
    }
  }

  get musicVolume(): number {
    return this.musicVol;
  }

  /**
   * One-shot stingers (win / lose / death / boss) played through the music
   * duck so they sit with the score, not on the sfx bus.
   */
  playSting(name: string): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicDuck || !STINGS[name]) return;
    let buf = this.stingCache.get(name);
    if (!buf) {
      const data = renderSting(name, ctx.sampleRate, 0x5711a + name.length * 137);
      if (!data) return;
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.stingCache.set(name, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(this.musicDuck);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start();
  }
}
