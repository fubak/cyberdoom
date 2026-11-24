import { BASE_H, BASE_STATUS } from '../render/res';

/**
 * TOOLS slot strip (pure, unit-tested): nine uniform wells, every one with
 * its digit — passive slots (badge 4, MFA 7) included — in two rows of 5+4
 * inside the 50-unit TOOLS panel.
 *
 * States: selected (gold box around the well, bright digit), owned (amber
 * digit), unowned (dim digit struck through: the "locked" mark only appears
 * when the slot's tool is genuinely not owned), fresh (just picked up: gold
 * well, black digit). Owned passive slots carry a coloured foot stripe so the
 * automatic badge/token read differently from tools you fire.
 */

export const SLOT_COUNT = 9;
export const SLOT_COLS = 5;
export const SLOT_W = 8;
export const SLOT_H = 9;
export const SLOT_PITCH_X = 9;
export const SLOT_PITCH_Y = 10;
export const SLOT_LEFT = 102;
export const SLOT_TOP_OFFSET = 6;

export type SlotState = 'selected' | 'owned' | 'unowned' | 'fresh';

export interface SlotCell {
  slot: number;
  x: number;
  y: number;
  state: SlotState;
  passive: boolean;
  toolId: string | null;
  digit: string;
  digitColor: string;
  digitShadow: string | null;
  well: string;
  bevel: string;
  /** 1px highlight outline around the well (selected / fresh only). */
  box: string | null;
  /** Dim strike through the digit: the slot's tool is not owned. */
  strike: string | null;
  /** Owned passive slot foot stripe. */
  foot: string | null;
}

export interface SlotStripInput {
  tools: readonly { id: string; slot: number; passive?: boolean }[];
  owned: readonly string[];
  selectedSlot: number;
  got?: { slot: number; blink: boolean } | null;
}

const PASSIVE_FOOT: Readonly<Record<string, string>> = { badge: '#4a9ae8', mfa: '#c6a23e' };

export function slotOrigin(slot: number): { x: number; y: number } {
  const i = slot - 1;
  return {
    x: SLOT_LEFT + (i % SLOT_COLS) * SLOT_PITCH_X,
    y: BASE_H - BASE_STATUS + SLOT_TOP_OFFSET + Math.floor(i / SLOT_COLS) * SLOT_PITCH_Y,
  };
}

function stateOf(o: SlotStripInput, slot: number, tool: SlotStripInput['tools'][number] | undefined): SlotState {
  if (o.got && o.got.slot === slot && o.got.blink) return 'fresh';
  const owned = !!tool && o.owned.includes(tool.id);
  if (owned && !tool.passive && tool.slot === o.selectedSlot) return 'selected';
  return owned ? 'owned' : 'unowned';
}

export function slotCells(o: SlotStripInput): SlotCell[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const slot = i + 1;
    const tool = o.tools.find((t) => t.slot === slot);
    const { x, y } = slotOrigin(slot);
    const state = stateOf(o, slot, tool);
    const passive = !!tool?.passive;
    const base = { slot, x, y, state, passive, toolId: tool?.id ?? null, digit: `${slot}` };
    switch (state) {
      case 'fresh':
        return { ...base, digitColor: '#000', digitShadow: null, well: '#ffd040', bevel: '#fff0a0', box: '#fff0a0', strike: null, foot: null };
      case 'selected':
        return { ...base, digitColor: '#fff0a0', digitShadow: '#000', well: '#3a3010', bevel: '#ffd040', box: '#ffd040', strike: null, foot: null };
      case 'owned':
        return {
          ...base, digitColor: '#ffa818', digitShadow: '#000', well: '#0c0e12', bevel: '#2a2e38', box: null, strike: null,
          foot: passive ? PASSIVE_FOOT[tool!.id] ?? '#8a90a0' : null,
        };
      default:
        return { ...base, digitColor: '#4a505c', digitShadow: null, well: '#08090c', bevel: '#1a1d24', box: null, strike: '#4a505c', foot: null };
    }
  });
}

/** Outline rect of a highlight box: one unit outside the well, inside the gaps between wells. */
export function slotBoxRect(c: Pick<SlotCell, 'x' | 'y'>): { x: number; y: number; w: number; h: number } {
  return { x: c.x - 1, y: c.y - 1, w: SLOT_W + 2, h: SLOT_H + 2 };
}

/** Digit position (small 5x7 glyph) centred in the well with a 1-unit top margin. */
export function slotDigitPos(c: Pick<SlotCell, 'x' | 'y'>): { x: number; y: number } {
  return { x: c.x + 2, y: c.y + 1 };
}
