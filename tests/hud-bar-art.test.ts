import { describe, expect, it } from 'vitest';
import { BASE_STATUS } from '../src/render/res';
import { BAR_PLATE_BANDS, plateBand, wellRect } from '../src/ui/barArt';
import { BAR_PANELS, P_CRED, P_RES, statusBarText, barTextBox, BAR_TOP } from '../src/ui/barLayout';
import { sortedTools } from '../src/tools';

/**
 * LOOK: the status bar's static art. The readout wells are painted once, so
 * they have to sit inside their panels and under the text the bar lays out.
 */
describe('status bar readouts', () => {
  it('each well and its one-unit bezel stay inside the panel and the bar', () => {
    for (const p of BAR_PANELS) {
      const r = wellRect(p);
      expect(r.x - 1, `panel ${p[0]}`).toBeGreaterThanOrEqual(p[0]);
      expect(r.x + r.w + 1, `panel ${p[0]}`).toBeLessThanOrEqual(p[0] + p[1]);
      expect(r.y - 1, `panel ${p[0]}`).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h + 1, `panel ${p[0]}`).toBeLessThanOrEqual(BASE_STATUS);
    }
  });

  it('the RES and BADGE readouts are taller than the rest', () => {
    const plain = wellRect(BAR_PANELS[0]).h;
    expect(wellRect(P_RES).h).toBeGreaterThan(plain);
    expect(wellRect(P_CRED).h).toBeGreaterThan(plain);
  });

  it('every bar text run starts inside the well of its panel', () => {
    const tools = sortedTools();
    const texts = statusBarText(
      {
        integrity: 100,
        ammo: 12,
        ammoName: 'scan',
        ready: true,
        credentials: 'staff',
        tool: { slot: 1 },
        tools,
        owned: tools.map((t) => t.id),
        resources: [
          { label: 'SCAN', cur: 12, max: 30, owned: true, active: true },
          { label: 'PCAP', cur: 6, max: 20, owned: true, active: false },
          { label: 'CELL', cur: 2, max: 8, owned: true, active: false },
          { label: 'DISK', cur: 3, max: 6, owned: true, active: false },
        ],
        objectives: [{ done: false, failed: false }, { done: true, failed: false }],
      },
      true,
    );
    for (const t of texts) {
      const box = barTextBox(t);
      const panel = BAR_PANELS.find((p) => box.x >= p[0] && box.x < p[0] + p[1])!;
      const well = wellRect(panel);
      const y = box.y - BAR_TOP;
      expect(box.x, t.text).toBeGreaterThanOrEqual(well.x);
      expect(y, t.text).toBeGreaterThanOrEqual(well.y);
      expect(y + box.h, t.text).toBeLessThanOrEqual(well.y + well.h + 1);
    }
  });
});

describe('status bar plate', () => {
  it('steps down through every band from the top row to the bottom row', () => {
    const rows = 128;
    expect(plateBand(0, rows)).toBe(0);
    expect(plateBand(rows - 1, rows)).toBe(BAR_PLATE_BANDS.length - 1);
    for (let y = 1; y < rows; y++) expect(plateBand(y, rows)).toBeGreaterThanOrEqual(plateBand(y - 1, rows));
  });

  it('bands darken from top to bottom', () => {
    const lum = (c: readonly number[]) => c[0] + c[1] + c[2];
    for (let i = 1; i < BAR_PLATE_BANDS.length; i++) expect(lum(BAR_PLATE_BANDS[i])).toBeLessThan(lum(BAR_PLATE_BANDS[i - 1]));
  });
});
