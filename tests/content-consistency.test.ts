import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { m01 } from '../src/content/missions/m01-patch-tuesday';
import { m05 } from '../src/content/missions/m05-change-freeze';
import { ENEMY_PROFILES } from '../src/engine/ai';
import { WorldMap } from '../src/engine/map';
import type { Mission } from '../src/core/types';

/** Malware-family sprite ids: base sets plus the recoloured threatSprites sets. */
const FAMILIES = Object.keys(ENEMY_PROFILES);

/** 'Logic bomb' should match 'logicbomb': compare letters only, case-insensitive. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const namesFamily = (text: string, family: string): boolean =>
  squash(text).includes(squash(family));

describe('malware family consistency', () => {
  const missions: Mission[] = missionRegistry.all();

  it('every enemy whose sprite is a malware family names that family in its inspect label', () => {
    const violations: string[] = [];
    for (const m of missions) {
      for (const e of m.entities) {
        if (e.kind !== 'enemy' || !FAMILIES.includes(e.sprite)) continue;
        if (!namesFamily(e.inspect?.label ?? '', e.sprite)) {
          violations.push(
            `${m.id}: enemy '${e.id}' sprite '${e.sprite}' has inspect.label '${e.inspect?.label ?? '(none)'}'`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('any trigger message naming a family spawns at least one entity of that family', () => {
    const violations: string[] = [];
    for (const m of missions) {
      for (const trigger of m.script?.triggers ?? []) {
        if (!trigger.message) continue;
        for (const family of FAMILIES) {
          // 'rat' and 'worm' match inside other words ('operations', 'classroom') — require a
          // standalone-word match only for the short names.
          const named = family.length <= 4
            ? new RegExp(`\\b${family}s?\\b`, 'i').test(trigger.message)
            : namesFamily(trigger.message, family);
          if (!named) continue;
          const spawnsFamily = (trigger.spawn ?? []).some((id) =>
            m.entities.some((e) => e.id === id && e.sprite === family),
          );
          if (!spawnsFamily) {
            violations.push(
              `${m.id}: trigger '${trigger.id}' mentions '${family}' but spawns none`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('M05 combat economy', () => {
  it('has at least five integrity medkits on floor cells', () => {
    const medkits = m05.entities.filter(
      (e) => e.sprite === 'medkit' && e.grants?.resource === 'integrity',
    );
    expect(medkits.length).toBeGreaterThanOrEqual(5);
    for (const kit of medkits) {
      const cell = m05.map.legend[m05.map.grid[Math.floor(kit.y)]?.[Math.floor(kit.x)] ?? ' '];
      expect(cell?.kind, `${kit.id} at ${kit.x},${kit.y}`).toBe('floor');
      expect(kit.grants?.amount).toBe(25);
    }
  });

  it('splits the northeast wave into two area triggers', () => {
    const wave4 = m05.entities.filter((e) => e.id.startsWith('rootkit-4-')).map((e) => e.id);
    const triggers = m05.script?.triggers ?? [];
    const spawns = new Set(
      triggers.flatMap((t) => t.spawn ?? []).filter((id) => wave4.includes(id)),
    );
    expect(spawns.size).toBe(wave4.length); // all of wave 4 still spawns, across the two triggers
    expect(triggers.some((t) => t.id === 'change-ambush-northeast-deep')).toBe(true);
  });
});
describe('debrief question answer balance', () => {
  const missions = missionRegistry.all();

  it('limits uniquely longest correct answers to 35% per mission', () => {
    for (const mission of missions) {
      const questions = mission.debriefQuestions;
      const longestCorrect = questions.filter((question) => {
        const correct = question.options.find((option) => option.correct);
        expect(correct, `${mission.id}/${question.id} correct option`).toBeDefined();
        if (!correct) return false;
        const longest = Math.max(...question.options.map((option) => option.text.length));
        return correct.text.length === longest
          && question.options.filter((option) => option.text.length === longest).length === 1;
      }).length;
      expect(longestCorrect, mission.id).toBeLessThanOrEqual(Math.floor(0.35 * questions.length));
    }
  });

  it('balances correct answer positions across all missions', () => {
    const questions = missions.flatMap((mission) => mission.debriefQuestions);
    for (let index = 0; index < 4; index++) {
      const count = questions.filter(
        (question) => question.options.findIndex((option) => option.correct) === index,
      ).length;
      expect(count, `correct option position ${index}`).toBeGreaterThanOrEqual(Math.ceil(0.15 * questions.length));
      expect(count, `correct option position ${index}`).toBeLessThanOrEqual(Math.floor(0.35 * questions.length));
    }
  });
});

describe('M01 spawn lighting', () => {
  it('keeps the spawn tile and the next five tiles facing forward well lit', () => {
    const map = new WorldMap(m01.map);
    const { spawn } = m01.map;
    const dx = Math.cos(spawn.angle);
    const dy = Math.sin(spawn.angle);

    for (let step = 0; step <= 5; step++) {
      const tx = Math.floor(spawn.x + dx * step);
      const ty = Math.floor(spawn.y + dy * step);
      expect(map.lightAt(tx, ty), `spawn lane tile ${tx},${ty}`).toBeGreaterThanOrEqual(0.7);
    }
  });
});
