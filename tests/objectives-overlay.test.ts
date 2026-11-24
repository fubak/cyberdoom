import { describe, expect, it } from 'vitest';
import {
  OVERLAY_COLS,
  OVERLAY_PAGE_SECONDS,
  layoutObjectivesOverlay,
  overlayPageAt,
} from '../src/ui/objectivesOverlay';
import { BASE_W } from '../src/render/res';
import { measureText } from '../src/render/font';

const obj = (text: string, done = false, failed = false) => ({ text, done, failed });
const LONG =
  'Read every flagged workstation with E, inspect the traffic with the MOUSE, then quarantine only the hosts that show real indicators of compromise and leave the decoy alone';

describe('TAB objectives overlay (Phase F)', () => {
  it('wraps every objective in full: no ellipsis, all words kept', () => {
    const pages = layoutObjectivesOverlay([obj(LONG), obj('Reach the exit')], 18);
    const text = pages.flatMap((p) => p.flatMap((r) => r.lines)).join(' ');
    expect(text).not.toContain('…');
    expect(text).toBe(`${LONG.toUpperCase()} REACH THE EXIT`);
  });

  it('every row fits the overlay width at x=13 in the small font', () => {
    expect(13 + measureText('X'.repeat(OVERLAY_COLS), 'small')).toBeLessThanOrEqual(BASE_W - 2);
    for (const row of layoutObjectivesOverlay([obj(LONG)], 18).flat()) {
      for (const line of row.lines) expect(line.length).toBeLessThanOrEqual(OVERLAY_COLS);
    }
  });

  it('pages when the list is taller than the panel, never splitting an objective', () => {
    const objs = Array.from({ length: 8 }, (_, i) => obj(`${i} ${LONG}`, i < 2));
    const pages = layoutObjectivesOverlay(objs, 18);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.reduce((n, r) => n + r.lines.length, 0)).toBeLessThanOrEqual(18);
    }
    expect(pages.flat().map((r) => r.index)).toEqual(objs.map((_, i) => i));
    expect(pages.flat()[0].settled).toBe(true);
  });

  it('hard-splits a single word longer than a row instead of clipping it', () => {
    const pages = layoutObjectivesOverlay([obj('X'.repeat(OVERLAY_COLS * 2 + 3))], 18);
    const lines = pages[0][0].lines;
    expect(lines.every((l) => l.length <= OVERLAY_COLS)).toBe(true);
    expect(lines.join('')).toBe('X'.repeat(OVERLAY_COLS * 2 + 3));
  });

  it('an objective taller than a whole page still shows every row across pages', () => {
    const pages = layoutObjectivesOverlay([obj(LONG)], 2);
    expect(pages.flat().flatMap((r) => r.lines).join(' ')).toBe(LONG.toUpperCase());
    for (const page of pages) expect(page.reduce((n, r) => n + r.lines.length, 0)).toBeLessThanOrEqual(2);
  });

  it('cycles pages while TAB is held', () => {
    expect(overlayPageAt(0, 3)).toBe(0);
    expect(overlayPageAt(OVERLAY_PAGE_SECONDS + 0.01, 3)).toBe(1);
    expect(overlayPageAt(OVERLAY_PAGE_SECONDS * 3 + 0.01, 3)).toBe(0);
    expect(overlayPageAt(99, 1)).toBe(0);
    expect(overlayPageAt(5, 0)).toBe(0);
  });

  it('does not mutate the objectives', () => {
    const objs = [obj(LONG)];
    const snap = JSON.stringify(objs);
    layoutObjectivesOverlay(objs, 18);
    expect(JSON.stringify(objs)).toBe(snap);
  });
});
