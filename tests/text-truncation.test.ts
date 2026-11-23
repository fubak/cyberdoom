import { describe, expect, it } from 'vitest';
import { canDraw, chunkyRows, glyphRows, measureText, wrapText } from '../src/render/font';
import { explanationPages } from '../src/tools/arsenal';
import { sortedTools } from '../src/tools';
import { statusBarText, type BarLayoutInput } from '../src/ui/barLayout';

describe('ellipsis glyph', () => {
  it('is drawable in both fonts and is not the full stop', () => {
    expect(canDraw('…', 'small')).toBe(true);
    expect(canDraw('…', 'tiny')).toBe(true);
    expect(glyphRows('…')).not.toEqual(glyphRows('.'));
    expect(measureText('…', 'tiny')).toBe(measureText('.', 'tiny'));
  });

  it('keeps separate dots in the chunky face (no fused bar)', () => {
    const rows = chunkyRows('…')!;
    const lit = rows.filter((r) => r !== 0);
    expect(lit.length).toBeGreaterThan(0);
    // no two adjacent lit columns in any lit row
    for (const r of lit) expect(r & (r >> 1)).toBe(0);
  });
});

describe('explanationPages', () => {
  const lines = (page: string) => wrapText(page, 52, Infinity).length;

  it('never exceeds three ticker lines per page and loses no words', () => {
    for (const tool of sortedTools()) {
      const text = tool.control?.use;
      if (!text) continue;
      const pages = explanationPages(text);
      for (const page of pages) expect(lines(page), `${tool.id}: ${page}`).toBeLessThanOrEqual(3);
      expect(pages.join(' ').split(/\s+/)).toEqual(text.toUpperCase().trim().split(/\s+/));
    }
  });

  it('ends a page on a sentence boundary whenever the sentence fits a page', () => {
    const pages = explanationPages('Alpha bravo charlie. Delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa. Quebec.');
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.endsWith('.')).toBe(true);
  });

  it('splits only an over-long sentence by lines', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.';
    const pages = explanationPages(long);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(lines(page)).toBeLessThanOrEqual(3);
    expect(pages.join(' ')).toBe(long.toUpperCase());
  });
});

describe('objective counter', () => {
  const input = (done: number, total: number): BarLayoutInput => ({
    integrity: 100, ammo: 8, ammoName: 'SCANNER', ready: true, credentials: 'STAFF', credTint: '#a0c8ff',
    tool: { slot: 1 }, tools: [{ id: 'keyboard', slot: 1, passive: false }], owned: ['keyboard'], got: null,
    resources: [], objectives: [], progress: { done, total, failed: false },
  });
  const texts = (done: number, total: number) => statusBarText(input(done, total), false);

  it('shows n/m in the big numerals when it fits', () => {
    const run = texts(0, 3).find((t) => t.text === '0/3');
    expect(run?.font).toBe('big');
    expect(texts(0, 3).some((t) => t.text === 'OBJ')).toBe(true);
  });

  it('keeps the big numeral for two-digit totals and moves the total to the caption', () => {
    for (const [done, total] of [[0, 11], [10, 12]] as const) {
      const all = texts(done, total);
      expect(all.find((t) => t.text === String(done))?.font, `${done}/${total}`).toBe('big');
      expect(all.some((t) => t.text === `OF ${total}`)).toBe(true);
      expect(all.some((t) => t.text === `${done}/${total}`)).toBe(false);
    }
  });
});

describe('explanationPages on the real tool texts', () => {
  it('keeps every sentence of up to three lines whole on one page', () => {
    for (const tool of sortedTools()) {
      const text = tool.control?.use;
      if (!text) continue;
      const pages = explanationPages(text);
      for (const sentence of text.toUpperCase().trim().split(/(?<=[.!?])\s+/)) {
        if (wrapText(sentence, 52, Infinity).length > 3) continue;
        expect(pages.some((page) => page.includes(sentence)), `${tool.id}: ${sentence}`).toBe(true);
      }
    }
  });
});
