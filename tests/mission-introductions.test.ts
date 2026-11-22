import { describe, expect, it } from 'vitest';
import { bonusMissions, missionRegistry, newToolsFor } from '../src/content/missions';

const missions = [...missionRegistry.all(), ...Object.values(bonusMissions)];

describe('mission tool introductions', () => {
  it('introduces m01 loadout tools first', () => {
    expect(newToolsFor('m01')).toEqual(missionRegistry.get('m01')?.loadout);
  });

  it('introduces each tool only on its first loadout appearance', () => {
    const expected: Record<string, string[]> = {
      m01: ['keyboard', 'mouse', 'usb', 'badge'],
      m02: ['mfa'],
      m03: ['tap'],
      m04: [],
      m05: ['patch'],
      m06: [],
      m07: [],
      m08: ['edr'],
      m09: [],
      m10: [],
      m11: [],
      m12: [],
      m13: [],
    };
    expect(Object.fromEntries(missions.map((mission) => [mission.id, newToolsFor(mission.id)]))).toEqual(expected);
  });

  it('only returns tools in each mission loadout', () => {
    for (const mission of missions) {
      for (const id of newToolsFor(mission.id)) {
        expect(mission.loadout ?? [], `${mission.id}/${id}`).toContain(id);
      }
    }
  });

  it('treats every arc loadout as earlier than bonus missions', () => {
    for (const mission of Object.values(bonusMissions)) {
      expect(newToolsFor(mission.id), mission.id).toEqual([]);
    }
  });

  it('keeps briefings short and free of tool slot markers', () => {
    for (const mission of missions) {
      expect(mission.briefing.length, mission.id).toBeLessThanOrEqual(300);
      expect(mission.briefing, mission.id).not.toMatch(/\([1-8]\)/);
    }
  });
});
