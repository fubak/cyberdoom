import { describe, expect, it } from 'vitest';
import { canDraw, measureText } from '../src/render/font';
import { BASE_H, BASE_STATUS } from '../src/render/res';
import { sortedTools } from '../src/tools';
import { P_TOOLS, RES_EMPTY, resourceLow, resourceRowStyle, visibleResources } from '../src/ui/barLayout';
import {
  BADGE_CAPTION,
  ROLE_HINT_KEY,
  badgeRoleText,
  claimRoleHint,
  privilegeTier,
  roleDenialExplainer,
  tierColor,
} from '../src/ui/roleBadge';
import { slotBoxRect, slotCells, slotDigitPos, SLOT_H, SLOT_W } from '../src/ui/slotStrip';
import { messageLines, TICKER_MAX_ROWS } from '../src/ui/tickerQueue';

const tools = sortedTools().map((t) => ({ id: t.id, slot: t.slot, passive: !!t.passive }));

describe('slot strip', () => {
  const base = { tools, owned: ['keyboard', 'badge'], selectedSlot: 1, got: null };

  it('renders all nine slots with a digit each, passive 4 and 7 included', () => {
    const cells = slotCells(base);
    expect(cells.map((c) => c.digit)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(cells[3].passive).toBe(true);
    expect(cells[6].passive).toBe(true);
  });

  it('selected = boxed and bright, owned = lit, unowned = dim and struck', () => {
    const cells = slotCells(base);
    expect(cells[0].state).toBe('selected');
    expect(cells[0].box).toBeTruthy();
    expect(cells[0].strike).toBeNull();
    expect(cells[3].state).toBe('owned'); // the badge
    expect(cells[3].strike).toBeNull();
    expect(cells[3].foot).toBeTruthy();
    expect(cells[1].state).toBe('unowned');
    expect(cells[1].strike).toBeTruthy();
    expect(cells[1].box).toBeNull();
    expect(new Set([cells[0].digitColor, cells[3].digitColor, cells[1].digitColor]).size).toBe(3);
  });

  it('marks a slot locked only when its tool is truly not owned', () => {
    const all = slotCells({ ...base, owned: tools.map((t) => t.id) });
    expect(all.filter((c) => c.toolId && c.strike)).toHaveLength(0);
  });

  it('a passive slot is never the selected one', () => {
    const cells = slotCells({ ...base, selectedSlot: 4 });
    expect(cells[3].state).toBe('owned');
    expect(cells.some((c) => c.state === 'selected')).toBe(false);
  });

  it('a fresh pickup blinks its slot gold', () => {
    const cells = slotCells({ ...base, got: { slot: 5, blink: true } });
    expect(cells[4].state).toBe('fresh');
    expect(cells[4].digitColor).toBe('#000');
  });

  it('wells, digits and the highlight box stay inside the TOOLS panel and the bar', () => {
    const top = BASE_H - BASE_STATUS;
    const cells = slotCells(base);
    for (const c of cells) {
      const box = slotBoxRect(c);
      expect(box.x).toBeGreaterThanOrEqual(P_TOOLS[0]);
      expect(box.x + box.w).toBeLessThanOrEqual(P_TOOLS[0] + P_TOOLS[1]);
      expect(box.y).toBeGreaterThanOrEqual(top);
      expect(box.y + box.h).toBeLessThanOrEqual(BASE_H);
      const d = slotDigitPos(c);
      expect(d.x + measureText(c.digit)).toBeLessThanOrEqual(c.x + SLOT_W);
      expect(d.y + 7).toBeLessThanOrEqual(c.y + SLOT_H);
    }
  });

  it('the highlight box sits in the gaps: it never covers a neighbouring well', () => {
    const cells = slotCells(base);
    const box = slotBoxRect(cells[0]);
    for (const n of cells.slice(1)) {
      const overlaps = box.x < n.x + SLOT_W && n.x < box.x + box.w && box.y < n.y + SLOT_H && n.y < box.y + box.h;
      expect(overlaps, `slot ${n.slot}`).toBe(false);
    }
  });

  it('slot 1 no longer gets a top bar flush on the digit (the "T" look)', () => {
    const c = slotCells(base)[0];
    // the digit starts one unit below the well's top bevel row
    expect(slotDigitPos(c).y).toBeGreaterThan(c.y);
  });
});

describe('resource rows', () => {
  const row = (cur: number, max: number, owned = true, active = false) => ({ label: 'DISK', cur, max, owned, active });

  it('keeps only owned resources', () => {
    expect(visibleResources([row(1, 6, false), row(2, 6), row(0, 3, false)]).map((r) => r.cur)).toEqual([2]);
  });

  it('greys an empty row and blinks a low (<=25%) row', () => {
    expect(resourceRowStyle(row(0, 6), true)).toEqual({ label: RES_EMPTY, value: RES_EMPTY });
    expect(resourceLow(row(7, 30))).toBe(true);
    expect(resourceLow(row(8, 30))).toBe(false);
    expect(resourceLow(row(1, 6))).toBe(true);
    expect(resourceLow(row(0, 6))).toBe(false);
    expect(resourceRowStyle(row(1, 6), true).value).not.toBe(resourceRowStyle(row(1, 6), false).value);
    expect(resourceRowStyle(row(5, 6), true).value).toBe(resourceRowStyle(row(5, 6), false).value);
  });
});

describe('badge cell', () => {
  it('tiers roles by privilege and colours each tier differently', () => {
    expect(privilegeTier('staff')).toBe('basic');
    expect(privilegeTier('analyst')).toBe('standard');
    expect(privilegeTier('itops')).toBe('elevated');
    expect(privilegeTier('admin')).toBe('admin');
    expect(new Set(['staff', 'analyst', 'itops', 'admin'].map(tierColor)).size).toBe(4);
  });

  it('fits the role word into the cell without an ellipsis', () => {
    for (const role of ['staff', 'analyst', 'itops', 'netops', 'investigator', 'sysadmin', 'admin', 'soc']) {
      const text = badgeRoleText(role, 28);
      expect(measureText(text, 'tiny'), role).toBeLessThanOrEqual(28);
      expect(text).not.toMatch(/…|\.\./);
      expect(canDraw(text, 'tiny')).toBe(true);
    }
    expect(badgeRoleText('itops', 28)).toBe('IT OPS');
    expect(canDraw(BADGE_CAPTION, 'tiny')).toBe(true);
  });

  it('explains a role denial in one ticker message that draws in the tiny font', () => {
    const text = roleDenialExplainer('itops', ['staff']);
    expect(text).toContain('IT OPS');
    expect(text).toContain('STAFF');
    expect(messageLines(text, 'info').length).toBeLessThanOrEqual(TICKER_MAX_ROWS);
    expect(canDraw(text.toUpperCase(), 'tiny')).toBe(true);
    expect(roleDenialExplainer('admin', [])).toContain('NO ROLE');
  });

  it('claims the role hint exactly once per player', () => {
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(claimRoleHint(store)).toBe(true);
    expect(map.get(ROLE_HINT_KEY)).toBe('1');
    expect(claimRoleHint(store)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined };
    expect(claimRoleHint(broken)).toBe(true);
  });
});
