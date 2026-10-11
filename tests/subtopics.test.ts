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

/** Count distinct catalog terms named in one text (substring match like coverage). */
function termHits(text: string): number {
  const t = text.toLowerCase();
  let n = 0;
  for (const s of Object.values(SUBTOPICS)) {
    for (const term of s.terms) {
      const needles = [term.term, ...(term.aka ?? [])].map((x) => x.toLowerCase());
      if (needles.some((x) => t.includes(x))) n++;
    }
  }
  return n;
}

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

  it('keeps world artifacts short: <=6 catalog terms per log or inspect detail', () => {
    const cram: string[] = [];
    for (const m of missionRegistry.all()) {
      for (const e of m.entities) {
        if (e.log) {
          const n = termHits(e.log);
          if (n > 6) cram.push(`${m.id}/${e.id} log names ${n} catalog terms`);
        }
        if (e.inspect?.detail) {
          const n = termHits(e.inspect.detail);
          if (n > 6) cram.push(`${m.id}/${e.id} inspect detail names ${n} catalog terms`);
        }
      }
    }
    expect(cram, `${cram.length} keyword-cram artifact(s)`).toEqual([]);
  });

  it('teaches on assessed surfaces: <=15% of terms appear ONLY in entity logs/inspect', () => {
    // Assessed surfaces: briefings, debrief/ARC question text, teaching records.
    const assessed: string[] = [];
    for (const m of missionRegistry.all()) {
      assessed.push(m.briefing);
      for (const q of m.debriefQuestions ?? []) {
        assessed.push(q.prompt);
        for (const o of q.options) assessed.push(o.text, o.explanation ?? '');
      }
    }
    for (const t of teachingRegistry.all()) {
      assessed.push(t.tagline, t.situation, t.examTip);
      for (const o of t.orders) assessed.push(o.text);
      for (const l of Object.values(t.lessons)) assessed.push(l.done, l.missed);
    }
    for (const qs of Object.values(ARC_QUESTIONS)) {
      for (const q of qs) {
        assessed.push(q.prompt);
        for (const o of q.options) assessed.push(o.text, o.explanation ?? '');
      }
    }
    const assessedText = assessed.join('\n').toLowerCase();
    const onlyInLogs: string[] = [];
    let total = 0;
    for (const [objective, s] of Object.entries(SUBTOPICS)) {
      for (const t of s.terms) {
        total++;
        const needles = [t.term, ...(t.aka ?? [])].map((n) => n.toLowerCase());
        if (!needles.some((n) => assessedText.includes(n))) {
          onlyInLogs.push(`${objective}: "${t.term}"`);
        }
      }
    }
    const share = onlyInLogs.length / total;
    expect(
      share,
      `${onlyInLogs.length}/${total} terms (${(share * 100).toFixed(1)}%) only in entity logs/inspect:\n${onlyInLogs.join('\n')}`,
    ).toBeLessThanOrEqual(0.15);
  });
});
