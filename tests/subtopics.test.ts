import { describe, expect, it } from 'vitest';
import { missionRegistry, teachingRegistry } from '../src/content/missions';
import { ARC_QUESTIONS } from '../src/content/arc-questions';
import { SUBTOPICS } from '../src/content/subtopics';
import { OBJECTIVES } from '../src/content/objectives';

/**
 * Every official SY0-701 sub-topic term must be TAUGHT on a content surface
 * the player actually reads. Surfaces scanned:
 *   - mission briefing text
 *   - entity inspect labels + case-file details + console logs (dossier)
 *   - debrief question prompts, option text, and per-option explanations
 *   - teaching records: tagline, situation, orders, per-objective lessons, exam tip
 *   - ARC knowledge-check questions
 * Deliberately NOT counted: objectives.ts and glossary.ts (definitions, not teaching).
 */
function playerFacingText(): string {
  const parts: string[] = [];
  for (const m of missionRegistry.all()) {
    parts.push(m.briefing);
    for (const e of m.entities) {
      if (e.inspect) parts.push(e.inspect.label, e.inspect.detail);
      if (e.log) parts.push(e.log);
    }
    for (const q of m.debriefQuestions ?? []) {
      parts.push(q.prompt);
      for (const o of q.options) parts.push(o.text, o.explanation ?? '');
    }
  }
  for (const t of teachingRegistry.all()) {
    parts.push(t.tagline, t.situation, t.examTip);
    for (const o of t.orders) parts.push(o.text);
    for (const l of Object.values(t.lessons)) parts.push(l.done, l.missed);
  }
  for (const qs of Object.values(ARC_QUESTIONS)) {
    for (const q of qs) {
      parts.push(q.prompt);
      for (const o of q.options) parts.push(o.text, o.explanation ?? '');
    }
  }
  return parts.join('\n').toLowerCase();
}

const OBJECTIVE_IDS = new Set(OBJECTIVES.map((o) => o.id));

describe('subtopics (official SY0-701 scope)', () => {
  it('covers all 28 catalog objectives', () => {
    for (const id of Object.keys(SUBTOPICS)) {
      expect(OBJECTIVE_IDS.has(id), `subtopics key ${id} is not a catalog objective`).toBe(true);
    }
    expect(Object.keys(SUBTOPICS)).toHaveLength(OBJECTIVES.length);
  });

  it('teaches every official sub-topic on a player-facing surface', () => {
    const text = playerFacingText();
    const missing: string[] = [];
    for (const [objective, s] of Object.entries(SUBTOPICS)) {
      for (const t of s.terms) {
        const needles = [t.term, ...(t.aka ?? [])].map((n) => n.toLowerCase());
        if (!needles.some((n) => text.includes(n))) {
          missing.push(`${objective}: "${t.term}"`);
        }
      }
    }
    expect(missing, `${missing.length} sub-topics taught nowhere`).toEqual([]);
  });
});
