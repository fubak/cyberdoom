import { describe, expect, it } from 'vitest';
import { missionRegistry, teachingRegistry } from '../src/content/missions';
import type { LossCause } from '../src/missions/runtime';
import { failureExplanation } from '../src/ui/failure';
import { DB_TEXT_W, drawable, wrapPixel } from '../src/ui/debrief-layout';

const THREAT_KEYS = ['worm', 'trojan', 'ransomware', 'logicbomb', 'rootkit', 'rat'];

function allStrings(loss: LossCause | null, missionId: string): [string, string][] {
  const fx = failureExplanation(loss, missionId);
  return [
    ['headline', fx.headline],
    ['what', fx.what],
    ['why', fx.why],
    ...fx.next.map((line, i): [string, string] => [`next[${i}]`, line]),
  ];
}

describe('failureExplanation', () => {
  for (const threat of THREAT_KEYS) {
    it(`integrity loss by ${threat} explains itself`, () => {
      const fx = failureExplanation(
        { kind: 'integrity', by: 'Test Unit', threat },
        'm01',
      );
      expect(fx.headline).toBe('INTEGRITY DEPLETED BY TEST UNIT');
      expect(fx.what.length).toBeGreaterThan(0);
      expect(fx.why.length).toBeGreaterThan(0);
      expect(fx.next.length).toBeGreaterThan(0);
    });
  }

  it('unknown threat falls back to a generic lesson', () => {
    const fx = failureExplanation({ kind: 'integrity', threat: 'mystery' }, 'm01');
    expect(fx.headline).toBe('INTEGRITY DEPLETED');
    expect(fx.why.length).toBeGreaterThan(0);
    expect(fx.next.length).toBeGreaterThan(0);
  });

  it('objective loss pulls the registered lesson text', () => {
    const missionId = 'm01';
    const obj = missionRegistry.require(missionId).missionObjectives
      .find((o) => teachingRegistry.get(missionId)?.lessons[o.id]);
    expect(obj).toBeDefined();
    const lesson = teachingRegistry.get(missionId)!.lessons[obj!.id];
    const fx = failureExplanation(
      { kind: 'objective', objectiveId: obj!.id, text: obj!.text, strikes: 1, violations: 1 },
      missionId,
    );
    expect(fx.headline).toBe(`OBJECTIVE FAILED: ${obj!.text.toUpperCase()}`);
    expect(fx.why).toBe(`[${lesson.objective}] ${lesson.missed}`);
    expect(fx.next.length).toBeGreaterThan(0);
  });

  it('objective loss without a lesson uses the fallback why', () => {
    const fx = failureExplanation(
      { kind: 'objective', objectiveId: 'not-a-lesson', text: 'Do the thing', strikes: 2, violations: 2 },
      'm01',
    );
    expect(fx.what).toContain('2 mistakes');
    expect(fx.why).toBe('Breaking this rule is the failure this mission is built to teach.');
    expect(fx.next.length).toBeGreaterThan(0);
  });

  it('null loss still explains the failure', () => {
    const fx = failureExplanation(null, 'm01');
    expect(fx.headline).toBe('MISSION FAILED');
    expect(fx.what.length).toBeGreaterThan(0);
    expect(fx.next.length).toBeGreaterThan(0);
  });
});

describe('failureExplanation text fits the debrief canvas', () => {
  const cases: [string, LossCause | null][] = [
    ...THREAT_KEYS.map((t): [string, LossCause] => [t, { kind: 'integrity', by: 'Unit', threat: t }]),
    ['unknown threat', { kind: 'integrity' }],
    ['objective with lesson', { kind: 'objective', objectiveId: 'no-plug', text: 'Never plug in unknown media', strikes: 1, violations: 1 }],
    ['objective no lesson', { kind: 'objective', objectiveId: 'zzz', text: 'Rule', strikes: 3, violations: 3 }],
    ['null', null],
  ];
  const missionIds = missionRegistry.all().map((m) => m.id);

  it('every string is drawable in the pixel font', () => {
    for (const missionId of missionIds) {
      for (const [name, loss] of cases) {
        const bad = allStrings(loss, missionId).filter(([, text]) => text && !drawable(text));
        expect(bad, `${missionId}/${name}: ${JSON.stringify(bad)}`).toEqual([]);
      }
    }
  });

  it('every string wraps within the text width', () => {
    for (const missionId of missionIds) {
      for (const [name, loss] of cases) {
        for (const [part, text] of allStrings(loss, missionId)) {
          if (!text) continue;
          const lines = wrapPixel(text, DB_TEXT_W);
          expect(lines.length, `${missionId}/${name}/${part}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
