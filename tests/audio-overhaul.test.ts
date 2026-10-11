import { describe, expect, it } from 'vitest';
import { loudnessLufs, peakOf, rmsOf, softClip } from '../src/engine/audio/dsp';
import { renderSfx, SFX_DEFS, sfxVariantCount } from '../src/engine/audio/sfxdef';
import { renderSong, renderSting } from '../src/engine/audio/render';
import { scheduleSong, songLength } from '../src/engine/audio/sequencer';
import { SONGS, STINGS } from '../src/engine/audio/songs';

const SR = 44100;
const THREATS = ['worm', 'trojan', 'ransomware', 'logicbomb', 'rat', 'rootkit'];
const VOICE_KINDS = ['growl', 'idle', 'pain', 'death', 'attack', 'fire'];

describe('audio overhaul: deterministic sequencer', () => {
  it('schedules identical note events across calls', () => {
    for (const tier of Object.keys(SONGS)) {
      const a = scheduleSong(SONGS[tier]);
      const b = scheduleSong(SONGS[tier]);
      expect(a.length, `${tier} has notes`).toBeGreaterThan(0);
      expect(a).toEqual(b);
    }
  });

  it('renders byte-identical buffers for the same seed', { timeout: 20000 }, () => {
    const a = renderSong(SONGS.early, SR, 1);
    const b = renderSong(SONGS.early, SR, 1);
    for (const layer of ['bed', 'threat', 'combat'] as const) {
      expect(a[layer]).toEqual(b[layer]);
      expect(rmsOf(a[layer]), `early ${layer} layer is audible`).toBeGreaterThan(0.0005);
    }
    // different seed → same score, different noise tails
    const c = renderSong(SONGS.early, SR, 2);
    expect(c.bed).not.toEqual(a.bed);
  });

  it('songs loop with real length and layered instrumentation', () => {
    for (const [name, song] of Object.entries(SONGS)) {
      const len = songLength(song);
      expect(len, name).toBeGreaterThan(1);
      expect(len, name).toBeLessThan(60);
      const layers = new Set(scheduleSong(song).map((e) => e.layer));
      expect(layers.has('bed'), `${name} has a bed layer`).toBe(true);
    }
  });
});

describe('audio overhaul: sfx registry coverage', () => {
  // every literal sfx('...') / playTool('...') / playVoice(..., '...') call in src/
  const sources = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const srcNames = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/\.sfx\('([a-z0-9-]+)'/g)) srcNames.add(m[1]);
    for (const m of text.matchAll(/playTool\('([a-z0-9-]+)'/g)) srcNames.add(m[1]);
    for (const m of text.matchAll(/playVoice\([^,]+,\s*'([a-z-]+)'\)/g)) srcNames.add(`vox-${m[1]}`);
  }

  it('every literal sound name used in code has a registry recipe', () => {
    const missing = [...srcNames].filter((n) => !SFX_DEFS[n]);
    expect(missing).toEqual([]);
    expect(srcNames.size).toBeGreaterThan(30);
  });

  it('every threat voice + sighting name resolves', () => {
    for (const t of THREATS) {
      for (const k of VOICE_KINDS) expect(SFX_DEFS[`${k}-${t}`], `${k}-${t}`).toBeTruthy();
      expect(SFX_DEFS[`sight-${t}`], `sight-${t}`).toBeTruthy();
    }
  });

  it('every recipe renders a non-silent, clip-free buffer', { timeout: 30000 }, () => {
    for (const name of Object.keys(SFX_DEFS)) {
      for (let variant = 0; variant < sfxVariantCount(name); variant++) {
        const buf = renderSfx(name, SR, 'male', variant);
        expect(buf, name).not.toBeNull();
        expect(buf!.length, name).toBeGreaterThan(100);
        expect(rmsOf(buf!), `${name} is audible`).toBeGreaterThan(0.0005);
        expect(peakOf(buf!), `${name} must not clip`).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('variants actually differ (no replayed-sample fatigue)', () => {
    const a = renderSfx('pain-worm', SR, 'male', 0)!;
    const b = renderSfx('pain-worm', SR, 'male', 1)!;
    expect(a).not.toEqual(b);
  });

  it('gendered analyst voices differ across vocal tracts', () => {
    const m = renderSfx('vox-ready', SR, 'male')!;
    const f = renderSfx('vox-ready', SR, 'female')!;
    expect(m).not.toEqual(f);
  });
});

describe('audio overhaul: mix safety', () => {
  it('a worst-case stack soft-clips inside the headroom budget', () => {
    // sum the loudest events as if every cap fired in the same instant
    const worst = new Float32Array(SR);
    for (const name of ['kill', 'enemy-death', 'edr-blast', 'impact', 'bite', 'alarm']) {
      const buf = renderSfx(name, SR, 'male')!;
      for (let i = 0; i < buf.length && i < SR; i++) worst[i] += buf[i];
    }
    expect(peakOf(worst)).toBeGreaterThan(0.5);
    softClip(worst, 1, 0.98);
    expect(peakOf(worst)).toBeLessThanOrEqual(0.98);
  });

  it('song mixes sit at broadcast-safe loudness, never above digital full scale', { timeout: 30000 }, () => {
    for (const [name, song] of Object.entries(SONGS)) {
      const layers = renderSong(song, SR, 1);
      const total = Math.max(...Object.values(layers).map((l) => l.length));
      const mix = new Float32Array(total);
      for (const layer of Object.values(layers)) {
        for (let i = 0; i < layer.length; i++) mix[i] += layer[i];
      }
      expect(peakOf(mix), `${name} full mix peak`).toBeLessThanOrEqual(1.6);
      const lufs = loudnessLufs(mix, SR);
      expect(lufs, `${name} loudness`).toBeGreaterThan(-32);
      expect(lufs, `${name} loudness`).toBeLessThan(-8);
    }
  });

  it('every sting renders non-silent', () => {
    for (const name of Object.keys(STINGS)) {
      const buf = renderSting(name, SR, 1)!;
      expect(rmsOf(buf), name).toBeGreaterThan(0.001);
      expect(peakOf(buf), name).toBeLessThanOrEqual(1.6);
    }
  });
});
