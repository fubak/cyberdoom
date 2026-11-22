import { describe, expect, it } from 'vitest';
import { Audio, musicTierForMission } from '../src/engine/audio';
import { peakOf, rmsOf } from '../src/engine/audio/dsp';
import { renderSong } from '../src/engine/audio/render';
import { scheduleSong } from '../src/engine/audio/sequencer';
import { SONGS } from '../src/engine/audio/songs';
import { missionRegistry } from '../src/content/missions';

describe('D7 dynamic music & audio', () => {
  it('assigns four distinct mission music tiers across the 12-mission campaign', () => {
    const missions = missionRegistry.all();
    const tiers = new Set(missions.map((m) => musicTierForMission(m.id, m.difficulty)));
    expect(tiers).toEqual(new Set(['early', 'stealth', 'mid', 'late']));
    expect(musicTierForMission('m01', 1)).toBe('early');
    expect(musicTierForMission('m03', 3)).toBe('stealth');
    expect(musicTierForMission('m04', 4)).toBe('stealth');
    expect(musicTierForMission('m05', 5)).toBe('mid');
    expect(musicTierForMission('m09', 9)).toBe('late');
    expect(musicTierForMission('m10', 10)).toBe('stealth');
    expect(musicTierForMission('m11', 11)).toBe('stealth');
    expect(musicTierForMission('m12', 12)).toBe('late');
  });

  it('stealth and boss songs each provide bed, threat, and combat stems', () => {
    for (const tier of ['stealth', 'boss'] as const) {
      const song = SONGS[tier];
      expect(song, tier).toBeDefined();
      const layers = new Set(scheduleSong(song).map((e) => e.layer));
      expect(layers, tier).toEqual(new Set(['bed', 'threat', 'combat']));
    }
  });

  it('stealth and boss songs render audible, clip-free stems', { timeout: 20000 }, () => {
    for (const tier of ['stealth', 'boss'] as const) {
      const rendered = renderSong(SONGS[tier], 44100, 1);
      for (const layer of ['bed', 'threat', 'combat'] as const) {
        expect(rmsOf(rendered[layer]), `${tier}.${layer} audible`).toBeGreaterThan(0.0005);
        expect(peakOf(rendered[layer]), `${tier}.${layer} clip-free`).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('Audio tracks activeMusicTier across startMusic and stopMusic', () => {
    const audio = new Audio();
    expect(audio.activeMusicTier()).toBeNull();
    audio.startMusic('stealth');
    expect(audio.activeMusicTier()).toBe('stealth');
    audio.startMusic('boss');
    expect(audio.activeMusicTier()).toBe('boss');
    audio.stopMusic();
    expect(audio.activeMusicTier()).toBeNull();
  });
});
