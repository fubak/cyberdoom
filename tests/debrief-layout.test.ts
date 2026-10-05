import { describe, expect, it } from 'vitest';
import { playableCoverageLine } from '../src/content/curriculum';
import { missionRegistry, teachingRegistry } from '../src/content/missions';
import { objectiveById } from '../src/content/objectives';
import { measureText } from '../src/render/font';
import { DB_BODY_ROWS, DB_HANG, DB_TEXT_W, block, drawable, paginate, wrapPixel } from '../src/ui/debrief-layout';

function debriefTexts(): [string, string][] {
  const out: [string, string][] = [['coverage', playableCoverageLine()]];
  for (const m of missionRegistry.all()) {
    for (const o of m.missionObjectives) out.push([`${m.id}:${o.id}`, o.text]);
    const t = teachingRegistry.get(m.id);
    if (t) {
      out.push([`${m.id}:examTip`, t.examTip]);
      for (const [id, l] of Object.entries(t.lessons)) out.push([`${m.id}:${id}:done`, l.done], [`${m.id}:${id}:missed`, l.missed]);
    }
    for (const q of m.debriefQuestions) {
      out.push([`${m.id}:${q.id}`, q.prompt]);
      for (const id of q.objectives) out.push([`${m.id}:${q.id}:tag`, `${id} ${objectiveById(id)?.title ?? ''}`]);
      for (const o of q.options) out.push([`${m.id}:${q.id}:${o.id}`, o.text], [`${m.id}:${q.id}:${o.id}:why`, o.explanation]);
    }
  }
  return out;
}

describe('pixel debrief layout', () => {
  it('every debrief string uses only glyphs the bitmap font can draw', () => {
    const bad = debriefTexts().filter(([, text]) => !drawable(text));
    expect(bad).toEqual([]);
  });

  it('wraps every debrief string within the page width, losslessly', () => {
    for (const [, text] of debriefTexts()) {
      for (const maxW of [DB_TEXT_W, DB_TEXT_W - DB_HANG - 14]) {
        const lines = wrapPixel(text, maxW);
        for (const line of lines) expect(measureText(line)).toBeLessThanOrEqual(maxW);
        expect(lines.join('').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, '').replace(/[✓✗▸]/g, (c) => ({ '✓': '+', '✗': 'X', '▸': '>' })[c]!));
      }
    }
  });

  it('paginates into fixed-height pages without dropping lines', () => {
    const blocks = Array.from({ length: 9 }, (_, i) => block(`Block ${i} `.repeat(40 + i * 7), '#fff'));
    const pages = paginate(blocks);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(DB_BODY_ROWS);
    const total = blocks.reduce((n, b) => n + b.length, 0);
    expect(pages.flat().filter((l) => l.text !== '').length).toBe(total);
  });

  it('keeps a whole question with its four answers on one page', () => {
    for (const m of missionRegistry.all()) {
      for (const q of m.debriefQuestions) {
        const pages = paginate([
          block(q.objectives.join(' / '), '#fff'),
          block(q.prompt, '#fff'),
          ...q.options.map((o, j) => block(o.text, '#fff', { prefix: String(j + 1) })),
          block('PRESS 1-4 OR CLICK AN ANSWER.', '#fff'),
        ]);
        expect(pages.length, `${m.id}:${q.id}`).toBeLessThanOrEqual(2);
      }
    }
  });
});
