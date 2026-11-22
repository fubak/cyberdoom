import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { applySeededPools } from '../src/missions/seed';
import { EventBus } from '../src/core/events';
import { MissionRuntime } from '../src/missions/runtime';

describe('Seeded workstation & phishing evidence pools (C6)', () => {
  it('returns canonical positions unchanged for seed 0', () => {
    for (const m of missionRegistry.all()) {
      const seeded = applySeededPools(m, 0);
      expect(seeded).toBe(m);
    }
  });

  it('keeps every campaign mission valid and winnable across 20 seeds', () => {
    for (const m of missionRegistry.all()) {
      const canonicalCleanTags = m.entities
        .filter((e) => e.kind === 'workstation')
        .map((e) => e.id)
        .sort();
      const canonicalSlots = m.entities
        .filter((e) => e.kind === 'workstation')
        .map((e) => `${e.x},${e.y}`)
        .sort();

      for (let seed = 1; seed <= 20; seed++) {
        const seeded = applySeededPools(m, seed * 7919);
        const rt = new MissionRuntime(m, new EventBus(), 'analyst', seed * 7919);

        // Same entity IDs and exact same set of verified workstation coordinates
        const ws = seeded.entities.filter((e) => e.kind === 'workstation');
        expect(ws.map((e) => e.id).sort()).toEqual(canonicalCleanTags);
        expect(ws.map((e) => `${e.x},${e.y}`).sort()).toEqual(canonicalSlots);

        // All required objectives still have enough matching targets
        for (const obj of rt.objectives) {
          if (obj.def.kind === 'clean' && obj.def.tag) {
            const count = rt.entities.filter((e) => e.def.tags?.includes(obj.def.tag!)).length;
            expect(count, `${m.id} seed ${seed} obj ${obj.def.id}`).toBeGreaterThanOrEqual(obj.def.count ?? 1);
          }
        }
      }
    }
  });

  it('produces varied workstation layouts across different seeds on M04 mailroom', () => {
    const m04 = missionRegistry.get('m04')!;
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const seeded = applySeededPools(m04, seed * 104729);
      const sig = seeded.entities
        .filter((e) => e.kind === 'workstation')
        .map((e) => `${e.id}@${e.x},${e.y}`)
        .join('|');
      layouts.add(sig);
    }
    expect(layouts.size).toBeGreaterThan(1);
  });
});
