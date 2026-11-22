import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import {
  CAMPAIGN_EPISODES,
  STORY_BIBLE,
  episodeForMission,
  episodeIntermissionAfter,
  realCaseForMission,
} from '../src/content/story';

describe('campaign story bible & real-world incident basis (C1/C2)', () => {
  it('defines named company, adversary, radio lead, and three episodes', () => {
    expect(STORY_BIBLE.company.length).toBeGreaterThan(5);
    expect(STORY_BIBLE.adversary.length).toBeGreaterThan(3);
    expect(STORY_BIBLE.radioLead.name.length).toBeGreaterThan(3);
    expect(CAMPAIGN_EPISODES.length).toBe(3);
    for (const ep of CAMPAIGN_EPISODES) {
      expect(ep.missions.length).toBe(4);
      expect(ep.intermission.length).toBeGreaterThan(40);
    }
  });

  it('maps every campaign mission to an episode and a documented real-world case', () => {
    for (const m of missionRegistry.all()) {
      const ep = episodeForMission(m.id);
      expect(ep, `${m.id} missing episode`).toBeDefined();
      const rc = realCaseForMission(m.id);
      expect(rc, `${m.id} missing realCase`).toBeDefined();
      expect(rc!.name.length, m.id).toBeGreaterThan(8);
      expect(rc!.year, m.id).toBeGreaterThanOrEqual(1990);
      expect(rc!.year, m.id).toBeLessThanOrEqual(2026);
      expect(rc!.summary.length, m.id).toBeGreaterThan(40);
      expect(rc!.source.length, m.id).toBeGreaterThan(8);
    }
  });

  it('triggers episode intermissions after M04, M08, and M12 only', () => {
    expect(episodeIntermissionAfter('m04')?.number).toBe(1);
    expect(episodeIntermissionAfter('m08')?.number).toBe(2);
    expect(episodeIntermissionAfter('m12')?.number).toBe(3);
    expect(episodeIntermissionAfter('m01')).toBeUndefined();
    expect(episodeIntermissionAfter('m07')).toBeUndefined();
  });
});
