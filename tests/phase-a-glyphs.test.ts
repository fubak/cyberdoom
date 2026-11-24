import { describe, expect, it } from 'vitest';
import { canDraw, fontHeight, glyphMask, measureText } from '../src/render/font';
import { keyPlateRect, PROMPT_ROW_PLATE } from '../src/ui/keyPlate';

/** Count pixels that differ between two same-size masks. */
function diff(a: { bits: Uint8Array }, b: { bits: Uint8Array }): number {
  let n = 0;
  for (let i = 0; i < a.bits.length; i++) if (a.bits[i] !== b.bits[i]) n++;
  return n;
}

describe('TINY font: D reads as D, not O (EDR / DISK)', () => {
  const d = glyphMask('tiny', 'D')!;
  const o = glyphMask('tiny', 'O')!;

  it('keeps the 3x5 metrics, so every tiny layout stays put', () => {
    expect(d.w).toBe(o.w);
    expect(d.h).toBe(o.h);
    expect(measureText('DISK', 'tiny')).toBe(15);
    expect(measureText('EDR', 'tiny')).toBe(11);
  });

  it('draws D with a full, square-cornered left stem', () => {
    for (let y = 0; y < d.h; y++) expect(d.bits[y * d.w], `row ${y}`).toBe(1);
    expect(d.bits[0]).toBe(1); // top-left corner
    expect(d.bits[(d.h - 1) * d.w]).toBe(1); // bottom-left corner
  });

  it('leaves O round on the left, so the two shapes differ clearly', () => {
    expect(o.bits[0]).toBe(0);
    expect(o.bits[(o.h - 1) * o.w]).toBe(0);
    // the left corner cells (one source pixel = 4x4 rendered) are solid on D, mostly empty on O
    const cell = (m: typeof d, top: boolean) => {
      let n = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) n += m.bits[(top ? y : m.h - 1 - y) * m.w + x];
      return n;
    };
    for (const top of [true, false]) {
      expect(cell(d, top)).toBe(16);
      expect(cell(o, top)).toBeLessThanOrEqual(8);
    }
    expect(diff(d, o)).toBeGreaterThan(0);
  });
});

describe('prompt key plates hold the whole key glyph', () => {
  const glyphH = fontHeight('small');

  for (const key of ['E', 'F', 'Q', 'LMB', 'TOOL']) {
    it(`[${key}] plate covers every glyph row, including E's bottom bar`, () => {
      const y = 150;
      const kw = measureText(key, 'small');
      const r = keyPlateRect(4, y, kw);
      expect(r.glyphY).toBeGreaterThanOrEqual(r.y);
      expect(r.glyphY + glyphH).toBeLessThanOrEqual(r.y + r.h);
      expect(r.glyphX - r.x).toBe(2);
      expect(r.w).toBe(kw + 4);
      // the key plate stays inside the row's dark backing plate
      expect(r.y).toBeGreaterThanOrEqual(y + PROMPT_ROW_PLATE.dy);
      expect(r.y + r.h).toBeLessThanOrEqual(y + PROMPT_ROW_PLATE.dy + PROMPT_ROW_PLATE.h);
      // the key glyph shares the line's baseline with the prompt text drawn at y
      expect(r.glyphY).toBe(y);
    });
  }
});

describe('page arrows are drawable', () => {
  it('the small font has a left arrow to pair with the right arrow', () => {
    expect(canDraw('←/→', 'small')).toBe(true);
  });
});
