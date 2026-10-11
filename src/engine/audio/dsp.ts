/**
 * AUDIO: deterministic DSP primitives. Every sound in the game — SFX,
 * instruments, stingers — is rendered offline into a mono Float32Array by
 * these functions, so the same code produces identical samples in the
 * browser (cached as AudioBuffers) and in Node (tests + WAV evidence).
 * No Math.random anywhere in the render path: variation comes from seeds.
 */

export type Rng = () => number;

/** mulberry32 — tiny seeded PRNG, deterministic across platforms. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- biquad filters (RBJ cookbook) ----------

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function biquad(type: 'lowpass' | 'highpass' | 'bandpass' | 'notch', f: number, q: number, sr: number): Biquad {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Math.max(0.01, q));
  let b0: number, b1: number, b2: number;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = b0;
      break;
    case 'highpass':
      b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = b0;
      break;
    case 'notch':
      b0 = 1; b1 = -2 * cosw; b2 = 1;
      break;
    default: // bandpass (constant skirt gain, peak gain = Q)
      b0 = sinw / 2; b1 = 0; b2 = -sinw / 2;
      break;
  }
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cosw) / a0, a2: (1 - alpha) / a0 };
}

/** In-place single-channel biquad pass. */
export function filter(x: Float32Array, c: Biquad): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
    x[i] = y0;
  }
}

/** Two cascaded biquads ≈ steeper slope, used where WebAudio would stack filters. */
export function filter2(x: Float32Array, c: Biquad): void {
  filter(x, c);
  filter(x, c);
}

// ---------- oscillator ----------

export type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export function oscSample(type: OscType, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (type) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'triangle':
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    default: // sawtooth (naive; used with a lowpass in most voices)
      return 2 * p - 1;
  }
}

// ---------- layer model ----------

export interface FilterSweep {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
  /** Hz at t0 and at t0+dur. */
  f0: number;
  f1?: number;
  q?: number;
  /** cascade count, default 1 */
  n?: number;
}

/**
 * One additive voice inside a rendered SFX/instrument. `t0`/`dur` seconds,
 * `f0`→`f1` Hz pitch glide, `gain` peak of a linear-attack + exponential-
 * decay envelope (peak at `attack`, release ends -60dB at dur unless
 * `sustain` holds it up).
 */
export interface Layer {
  kind: 'osc' | 'noise' | 'formant' | 'ks';
  t0?: number;
  dur: number;
  gain: number;
  attack?: number;
  /** fraction of dur the envelope holds at gain before decaying (0..0.9) */
  sustain?: number;
  // osc
  type?: OscType;
  f0?: number;
  f1?: number;
  detune?: number; // cents, second osc summed for chorus width
  dist?: number; // tanh drive
  // noise: band of filtered noise; filter sweep comes from `filter`
  // formant: glottal saw through N parallel bandpasses
  formants?: [number, number, number][]; // [freq, q, amp]
  tilt?: number; // lowpass on the glottal source
  breath?: number; // noise mixed in, relative to gain
  // ks (Karplus-Strong pluck): f0 pitch, damp 0..1 (1 = long ring)
  damp?: number;
  filter?: FilterSweep;
}

const T60 = 6.907755; // -60 dB in nepers

function writeEnvelope(out: Float32Array, i0: number, i1: number, attack: number, sustain: number, gain: number): void {
  const n = i1 - i0;
  const a = Math.max(1, Math.floor(attack));
  const holdEnd = i0 + Math.min(n, Math.floor(sustain));
  const decayLen = Math.max(1, i1 - holdEnd);
  for (let i = i0; i < i1; i++) {
    const j = i - i0;
    let e: number;
    if (j < a) e = j / a;
    else if (i < holdEnd) e = 1;
    else e = Math.exp(-T60 * (i - holdEnd) / decayLen);
    out[i] *= e * gain;
  }
}

/** Render one layer into its own buffer segment (returns full-length buffer). */
export function renderLayer(l: Layer, sr: number, rng: Rng, total: number): Float32Array {
  const t0 = l.t0 ?? 0;
  const i0 = Math.floor(t0 * sr);
  const i1 = Math.min(total, Math.floor((t0 + l.dur) * sr));
  const n = Math.max(0, i1 - i0);
  const seg = new Float32Array(n);
  if (n === 0) return seg;

  switch (l.kind) {
    case 'noise': {
      for (let i = 0; i < n; i++) seg[i] = rng() * 2 - 1;
      break;
    }
    case 'osc': {
      const f0 = Math.max(20, l.f0 ?? 440);
      const f1 = Math.max(20, l.f1 ?? f0);
      let p = 0;
      let p2 = 0;
      const det = (l.detune ?? 0) / 1200;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const f = f0 * (f1 / f0) ** t;
        p += f / sr;
        let s = oscSample(l.type ?? 'sine', p);
        if (det !== 0) {
          p2 += (f * 2 ** det) / sr;
          s = (s + oscSample(l.type ?? 'sine', p2)) * 0.5;
        }
        if (l.dist) s = Math.tanh(s * l.dist);
        seg[i] = s;
      }
      break;
    }
    case 'formant': {
      // source: glottal saw (pitch glide), optional spectral tilt + breath
      const f0 = Math.max(40, l.f0 ?? 120);
      const f1 = Math.max(40, l.f1 ?? f0);
      const glot = new Float32Array(n);
      let p = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        p += (f0 * (f1 / f0) ** t) / sr;
        glot[i] = oscSample('sawtooth', p);
      }
      if (l.tilt) filter(glot, biquad('lowpass', l.tilt, 0.7, sr));
      const fmts = l.formants ?? [];
      const outs = fmts.map(([f, q]) => {
        const band = glot.slice();
        filter(band, biquad('bandpass', f, q, sr));
        return band;
      });
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k < outs.length; k++) s += outs[k][i] * (fmts[k][2] ?? 1);
        if (l.breath) s += (rng() * 2 - 1) * l.breath;
        seg[i] = s * 2.5; // formant bank normalization ≈ WebAudio's bandpass gains
      }
      break;
    }
    case 'ks': {
      // Karplus-Strong pluck: noise burst into a feedback delay line.
      const f0 = Math.max(20, l.f0 ?? 220);
      const period = Math.max(2, Math.round(sr / f0));
      const damp = Math.min(0.999, Math.max(0.5, l.damp ?? 0.996));
      const ring = new Float32Array(period);
      for (let i = 0; i < period; i++) ring[i] = rng() * 2 - 1;
      let idx = 0;
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const cur = ring[idx];
        // single-pole lowpass in the loop = string damping
        const next = (cur + prev) * 0.5 * damp;
        ring[idx] = next;
        prev = cur;
        idx = (idx + 1) % period;
        let s = cur;
        if (l.dist) s = Math.tanh(s * l.dist);
        seg[i] = s;
      }
      break;
    }
  }

  if (l.filter) {
    // sweep the filter in small chunks — per-sample coeff interp is overkill
    const chunk = Math.max(16, Math.floor(sr * 0.004));
    const f0 = l.filter.f0;
    const f1 = l.filter.f1 ?? f0;
    for (let s = 0; s < n; s += chunk) {
      const end = Math.min(n, s + chunk);
      const f = f0 * (f1 / f0) ** (s / Math.max(1, n - 1));
      const c = biquad(l.filter.type, f, l.filter.q ?? 1, sr);
      const part = seg.subarray(s, end);
      const passes = l.filter.n ?? 1;
      for (let k = 0; k < passes; k++) filter(part, c);
    }
  }

  const attack = Math.min(n - 1, (l.attack ?? Math.min(0.006, l.dur * 0.2)) * sr);
  const sustain = Math.min(n - 1, (l.sustain ?? 0) * n);
  writeEnvelope(seg, 0, n, attack, sustain, l.gain);

  const out = new Float32Array(total);
  out.set(seg, i0);
  return out;
}

/** Sum layers into a mono buffer of `seconds` length. */
export function renderLayers(layers: Layer[], sr: number, seed: number, seconds?: number): Float32Array {
  const total = Math.ceil((seconds ?? Math.max(...layers.map((l) => (l.t0 ?? 0) + l.dur))) * sr);
  const out = new Float32Array(total);
  layers.forEach((l, i) => {
    const buf = renderLayer(l, sr, mulberry32(seed * 2654435761 + i * 40503), total);
    for (let j = 0; j < total; j++) out[j] += buf[j];
  });
  return out;
}

// ---------- mix utilities ----------

export function mixInto(dst: Float32Array, src: Float32Array, offset: number, gain: number): void {
  const i0 = Math.max(0, Math.floor(offset));
  for (let i = 0; i < src.length && i0 + i < dst.length; i++) dst[i0 + i] += src[i] * gain;
}

/** tanh soft-clip ≈ the limiter's knee; final safety before quantization. */
export function softClip(x: Float32Array, drive = 1, ceiling = 0.98): void {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) * ceiling;
}

/** Hard guarantee for the peak-safety test: scale down only if clipping. */
export function peakNormalize(x: Float32Array, ceiling = 0.98): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) peak = Math.abs(x[i]);
  if (peak > ceiling) {
    const s = ceiling / peak;
    for (let i = 0; i < x.length; i++) x[i] *= s;
    return ceiling;
  }
  return peak;
}

export function peakOf(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) peak = Math.abs(x[i]);
  return peak;
}

export function rmsOf(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, x.length));
}

/**
 * K-weighted loudness approximation (BS.1770 gating skipped; mean-square of
 * the K-filtered signal → LUFS). Good enough for a mix target check.
 */
export function loudnessLufs(x: Float32Array, sr: number): number {
  // stage 1: high shelf +4dB @ ~1.5k, stage 2: highpass @ 38Hz (BS.1770 K)
  const y = x.slice();
  const shelf = biquad('highpass', 40, 0.7, sr);
  filter(y, shelf);
  // crude +4dB high-shelf: add boosted highpassed copy
  const hp = y.slice();
  filter(hp, biquad('highpass', 1500, 0.7, sr));
  let sum = 0;
  for (let i = 0; i < y.length; i++) {
    const v = y[i] + hp[i] * 1.6;
    sum += v * v;
  }
  const ms = sum / Math.max(1, y.length);
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity;
}

/** Encode mono samples as 16-bit PCM WAV bytes. */
export function encodeWav(x: Float32Array, sr: number): Uint8Array {
  const n = x.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  wstr(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}
