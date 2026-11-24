import { describe, expect, it } from 'vitest';
import { playableCoverageLine } from '../src/content/curriculum';
import { missionRegistry, teachingRegistry } from '../src/content/missions';
import { objectiveById } from '../src/content/objectives';
import { measureText } from '../src/render/font';
import { DB_BODY_ROWS, DB_HANG, DB_TEXT_W, block, drawable, heading, paginate, wrapPixel } from '../src/ui/debrief-layout';
import { briefingDetailBlocks } from '../src/ui/briefingDetails';

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

describe('paginate keep-with-next', () => {
  const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ text: `${tag}${i}`, color: '#fff' }));
  const lastText = (page: { text: string }[]) => [...page].reverse().find((l) => l.text !== '')?.text ?? '';

  it('never leaves a heading as the last row of a page', () => {
    // filler leaves exactly one free row before the heading would land on the last row
    for (let fill = 1; fill <= DB_BODY_ROWS - 1; fill++) {
      const pages = paginate([lines(fill, 'f'), heading('HEAD', '#fff'), lines(4, 'b')]);
      for (const p of pages) expect(lastText(p), `fill ${fill}`).not.toBe('HEAD');
      const all = pages.flat().filter((l) => l.text !== '').map((l) => l.text);
      expect(all, `fill ${fill}`).toEqual([...lines(fill, 'f').map((l) => l.text), 'HEAD', 'b0', 'b1', 'b2', 'b3']);
    }
  });

  it('moves the heading with a following block that fits on one page', () => {
    const pages = paginate([lines(DB_BODY_ROWS - 4, 'f'), heading('HEAD', '#fff'), lines(5, 'b')]);
    const headPage = pages.findIndex((p) => p.some((l) => l.text === 'HEAD'));
    expect(pages[headPage].some((l) => l.text === 'b0')).toBe(true);
    expect(pages[headPage].some((l) => l.text === 'b4')).toBe(true);
  });

  it('keeps at least one body row with a heading whose block is longer than a page', () => {
    for (let fill = 1; fill <= DB_BODY_ROWS - 1; fill++) {
      const pages = paginate([lines(fill, 'f'), heading('HEAD', '#fff'), lines(DB_BODY_ROWS + 3, 'b')]);
      const headPage = pages.find((p) => p.some((l) => l.text === 'HEAD'))!;
      const at = headPage.findIndex((l) => l.text === 'HEAD');
      expect(headPage.slice(at + 1).some((l) => l.text.startsWith('b')), `fill ${fill}`).toBe(true);
      for (const p of pages) expect(p.length).toBeLessThanOrEqual(DB_BODY_ROWS);
    }
  });

  it('never starts a page with a blank spacer row', () => {
    for (let fill = 1; fill <= DB_BODY_ROWS; fill++) {
      const pages = paginate([lines(fill, 'f'), heading('HEAD', '#fff'), lines(6, 'b'), heading('NEXT', '#fff'), lines(2, 'c')]);
      for (const p of pages.slice(1)) expect(p[0]?.text, `fill ${fill}`).not.toBe('');
    }
  });

  it('does not mutate the blocks it is given', () => {
    const blocks = [lines(3, 'f'), heading('HEAD', '#fff'), lines(2, 'b')];
    const snapshot = JSON.stringify(blocks);
    paginate(blocks);
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });
});

describe('briefing details pages', () => {
  const palette = { gold: '#g', text: '#t', orange: '#o', dim: '#d' };
  const headings = new Set(['SITUATION', 'ALL ORDERS', 'SY0-701 OBJECTIVES', 'KEY TERMS']);

  it('no section heading or glossary term ends a page, for every mission', () => {
    for (const m of missionRegistry.all()) {
      const teach = teachingRegistry.get(m.id);
      const terms = new Set((teach?.keyTerms ?? []).map((t) => t));
      const pages = paginate(briefingDetailBlocks(m, palette, () => '#x'));
      pages.forEach((p, i) => {
        const rows = p.filter((l) => l.text !== '');
        const last = rows[rows.length - 1];
        if (!last) return;
        expect(headings.has(last.text), `${m.id} page ${i + 1} ends on heading ${last.text}`).toBe(false);
        expect(last.keepWithNext ?? false, `${m.id} page ${i + 1} ends on ${last.text}`).toBe(false);
        expect(terms.has(last.text) && last.color === palette.orange, `${m.id} page ${i + 1} ends on term ${last.text}`).toBe(false);
      });
    }
  });

  it('keeps each glossary term on the same page as its whole definition', () => {
    for (const m of missionRegistry.all()) {
      const pages = paginate(briefingDetailBlocks(m, palette, () => '#x'));
      for (const p of pages) {
        const rows = p.filter((l) => l.text !== '');
        // a definition row (dim) at the top of a page means its term was left behind
        if (pages.indexOf(p) > 0) expect(rows[0]?.color === palette.dim, `${m.id}: definition split from term`).toBe(false);
      }
    }
  });
});
