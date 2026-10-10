import { describe, expect, it } from 'vitest';
import { Audio, VOICE_CAPS, spatialize, voiceCapFor } from '../src/engine/audio';

describe('audio spatialization', () => {
  it('keeps nearby sounds loud and fades out at 19 tiles', () => {
    expect(spatialize(1, 0, 0).gain).toBe(1);
    expect(spatialize(19, 0, 0).gain).toBe(0);
  });

  it('pans the player right for a source on +y and centers a source ahead', () => {
    expect(spatialize(0, 1, 0).pan).toBeGreaterThan(0);
    expect(spatialize(1, 0, 0).pan).toBeCloseTo(0);
  });

  it('does not throw when WebAudio is unavailable', () => {
    expect(() => new Audio().sfx('impact', { x: 1, y: 1 })).not.toThrow();
  });

  it('keeps combat ducking and metering safe without an audio context', () => {
    const audio = new Audio();
    expect(() => audio.setCombat(true)).not.toThrow();
    expect(() => audio.setCombat(false)).not.toThrow();
    expect(audio.meter()).toEqual({ rmsDb: -Infinity, peakDb: -Infinity });
  });

  it('keeps the score controls safe without an audio context', () => {
    const audio = new Audio();
    expect(() => audio.startMusic('early')).not.toThrow();
    expect(() => audio.startMusic('late')).not.toThrow();
    expect(() => audio.setMusicVolume(2)).not.toThrow();
    expect(audio.musicVolume).toBe(1);
    expect(() => audio.setMusicVolume(-1)).not.toThrow();
    expect(audio.musicVolume).toBe(0);
    expect(() => audio.stopMusic()).not.toThrow();
  });
});

describe('per-event voice limiting', () => {
  it('caps every hot combat event to a few concurrent instances', () => {
    // combat sfx that stack densely must be bounded so the mix can't clip
    for (const name of ['bite', 'enemy-pain', 'enemy-fire', 'impact', 'windup']) {
      expect(VOICE_CAPS[name], name).toBeGreaterThanOrEqual(1);
      expect(VOICE_CAPS[name], name).toBeLessThanOrEqual(4);
    }
    // kill punctuation can overlap a second kill but never stacks deep
    expect(VOICE_CAPS['kill']).toBe(2);
    // sight barks never repeat on top of themselves
    for (const name of ['sight-worm', 'sight-trojan', 'sight-ransomware', 'sight-rat', 'sight-rootkit']) {
      expect(VOICE_CAPS[name], name).toBe(1);
    }
  });

  it('shares the family cap across per-type enemy voice names', () => {
    // pain-worm / death-rat / ... must not evade the old 'enemy-pain' style caps
    expect(voiceCapFor('pain-worm')).toBe(VOICE_CAPS['enemy-pain']);
    expect(voiceCapFor('pain-rootkit')).toBe(VOICE_CAPS['enemy-pain']);
    expect(voiceCapFor('death-rat')).toBe(VOICE_CAPS['enemy-death']);
    expect(voiceCapFor('attack-logicbomb')).toBe(VOICE_CAPS['bite']);
    expect(voiceCapFor('fire-trojan')).toBe(VOICE_CAPS['enemy-fire']);
    expect(voiceCapFor('growl-worm')).toBe(VOICE_CAPS['growl']);
    // exact-name caps still win over the family alias
    expect(voiceCapFor('sight-worm')).toBe(1);
    // unrelated names keep the default cap
    expect(voiceCapFor('keyboard')).toBe(3);
  });
});
