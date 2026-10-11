import { describe, expect, it } from 'vitest';
import {
  BAR_PANELS,
  BAR_BOTTOM,
  BAR_LEFT,
  BAR_RIGHT,
  BAR_TOP,
  barTextBox,
  resRowPlate,
  statusBarText,
  type BarLayoutInput,
} from '../src/ui/barLayout';

/**
 * Status-bar text must never overlap — at any scale, since the layout is in
 * 320x200 base units (1x/2x/3x and fractional 4K all share it). Boxes are
 * half-open [x, x+w) x [y, y+h); touching edges do not count as overlap.
 */

const TOOLS = Array.from({ length: 8 }, (_, i) => ({ id: `tool-${i + 1}`, slot: i + 1 }));

function worstCase(): BarLayoutInput {
  return {
    integrity: 12, // CRITICAL label + low-ammo alarm + red rows all at once
    ammo: 30,
    ammoName: 'SCANNER',
    ready: true,
    credentials: 'SYSADMIN', // 7-char label, widest the CRED panel shows
    credTint: '#a0c8ff',
    tool: { slot: 3 },
    tools: TOOLS,
    owned: TOOLS.map((t) => t.id),
    got: { k: 1, slot: 3, blink: true },
    resources: [
      { label: 'SCAN', cur: 30, max: 30, owned: true, active: true },
      { label: 'PCAP', cur: 12, max: 12, owned: true, active: false },
      { label: 'CELL', cur: 0, max: 3, owned: true, active: false },
      { label: 'DISK', cur: 3, max: 6, owned: false, active: false },
    ],
    objectives: [{ done: true, failed: false }, { done: false, failed: false }],
    progress: { done: 12, total: 14, failed: false },
  };
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('statusBarText layout', () => {
  for (const pulse of [false, true]) {
    it(`no two text boxes intersect (pulse=${pulse})`, () => {
      const boxes = statusBarText(worstCase(), pulse).map((t) => ({ ...barTextBox(t), t: t.text }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap(boxes[i], boxes[j]), `"${boxes[i].t}" x "${boxes[j].t}"`).toBe(false);
        }
      }
    });

    it(`every text run stays inside the status bar and its own panel (pulse=${pulse})`, () => {
      for (const t of statusBarText(worstCase(), pulse)) {
        const b = barTextBox(t);
        expect(b.x).toBeGreaterThanOrEqual(BAR_LEFT);
        expect(b.x + b.w).toBeLessThanOrEqual(BAR_RIGHT);
        expect(b.y).toBeGreaterThanOrEqual(BAR_TOP);
        expect(b.y + b.h).toBeLessThanOrEqual(BAR_BOTTOM);
        const inside = BAR_PANELS.some(([px, pw]) => b.x >= px && b.x + b.w <= px + pw);
        expect(inside, `"${t.text}" at x=${b.x}..${b.x + b.w} escapes its panel`).toBe(true);
      }
    });
  }

  it('all four RES rows — plate and text — fit inside the bar (DISK must not clip)', () => {
    const texts = statusBarText(worstCase(), false).map((t) => ({ ...barTextBox(t), t: t.text }));
    for (let i = 0; i < 4; i++) {
      const p = resRowPlate(i);
      expect(p.y).toBeGreaterThanOrEqual(BAR_TOP);
      expect(p.y + p.h).toBeLessThanOrEqual(BAR_BOTTOM);
      expect(p.x).toBeGreaterThanOrEqual(BAR_LEFT);
      expect(p.x + p.w).toBeLessThanOrEqual(BAR_RIGHT);
      // every row, plate included, clears the well's bottom bevel (>=6px of bar edge)
      expect(p.y + p.h).toBeLessThanOrEqual(BAR_BOTTOM - 6);
      // and the row's text run sits inside its plate, not under the bottom bevel
      const label = ['SCAN', 'PCAP', 'CELL', 'DISK'][i];
      const row = texts.find((t) => t.t === label && t.x === 220)!; // RES label column
      expect(row.y).toBeGreaterThanOrEqual(p.y);
      expect(row.y + row.h).toBeLessThanOrEqual(p.y + p.h);
      // text plus its 1px shadow keeps >=7px of margin to the bar edge, so the
      // last row (DISK) reads as inside the panel at every scale
      expect(row.y + row.h + 1).toBeLessThanOrEqual(BAR_BOTTOM - 7);
    }
  });

  it('resources render as one labelled row each: label left, cur/max right-aligned', () => {
    const texts = statusBarText(worstCase(), false);
    const rows = texts.filter((t) => ['SCAN', 'PCAP', 'CELL', 'DISK'].includes(t.text) && t.x === 220);
    const values = texts.filter((t) => ['30/30', '12/12', '0/3', '3/6'].includes(t.text));
    expect(rows).toHaveLength(4);
    expect(values).toHaveLength(4);
    for (const [i, row] of rows.entries()) {
      // each label shares its row with exactly one value, to its right
      const v = values.find((v) => Math.abs(v.y - row.y) < 0.5);
      expect(v, `${row.text} has a value on its row`).toBeTruthy();
      expect(v!.x).toBeGreaterThan(row.x);
      expect(i === 0 || row.y > rows[i - 1].y).toBe(true);
    }
  });
});
