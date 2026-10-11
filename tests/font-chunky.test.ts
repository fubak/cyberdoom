import { describe, expect, it } from 'vitest';
import { chunkyRows, glyphRows } from '../src/render/font';

/** Count runs of lit pixels in a glyph row of the given bit width. */
function runs(bits: number, width: number): number {
  let n = 0;
  let lit = false;
  for (let x = 0; x < width; x++) {
    const bit = (bits >> (width - 1 - x)) & 1;
    if (bit && !lit) n += 1;
    lit = bit === 1;
  }
  return n;
}

const GLYPH_CHARS = (() => {
  let s = '';
  for (let i = 33; i < 127; i++) s += String.fromCharCode(i);
  return s + '✓✗·→∞—–…’‘“”×';
})();

describe('chunky font (6-wide embolden)', () => {
  it('keeps each source row\'s run count and stays within 6 bits', () => {
    const bad: string[] = [];
    for (const ch of GLYPH_CHARS) {
      const src = glyphRows(ch);
      const fat = chunkyRows(ch);
      if (!src) {
        expect(fat, `chunky rows for ${JSON.stringify(ch)} with no source glyph`).toBeUndefined();
        continue;
      }
      expect(fat, `no chunky rows for ${JSON.stringify(ch)}`).toBeDefined();
      expect(fat!.length, `row count for ${JSON.stringify(ch)}`).toBe(src.length);
      src.forEach((b, i) => {
        if (fat![i] > 0b111111) {
          bad.push(`${JSON.stringify(ch)} row ${i}: ${fat![i]} wider than 6 bits`);
        }
        const want = runs(b, 5);
        const got = runs(fat![i], 6);
        if (got !== want) {
          bad.push(`${JSON.stringify(ch)} row ${i}: ${b} (${want} run${want === 1 ? '' : 's'}) -> ${fat![i]} (${got} run${got === 1 ? '' : 's'}), runs merged`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
