import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { ENEMY_PROFILES } from '../src/engine/ai';
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
