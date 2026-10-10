import { measureBig, measureText } from '../render/font';
import { BASE_H, BASE_STATUS, BASE_W } from '../render/res';

/**
 * LOOK/ARSENAL: pure status-bar text layout in 320x200 base units.
 * `statusBarText` returns every text run the bar draws, positioned and
 * styled — hud.ts renders the list verbatim, and tests/hud-layout.test.ts
 * asserts the boxes never overlap at any scale (layout is scale-free).
 */

export type Panel = [x: number, w: number];
export const P_INT: Panel = [0, 58];
export const P_AMMO: Panel = [58, 42];
export const P_TOOLS: Panel = [100, 50];
export const P_FACE: Panel = [150, 32];
export const P_CRED: Panel = [182, 34];
export const P_RES: Panel = [216, 64];
export const P_OBJ: Panel = [280, 40];
export const BAR_PANELS: Panel[] = [P_INT, P_AMMO, P_TOOLS, P_FACE, P_CRED, P_RES, P_OBJ];

export const RED = ['#ff9a7a', '#ff4a2a', '#e01e10', '#a80c06', '#700604'];
export const AMBER = ['#fff0a0', '#ffd040', '#ffa818', '#d07808', '#8a4804'];
export const GREEN = ['#c8ffb0', '#6aff5a', '#2ad83a', '#14a024', '#0a6014'];
export const RED_HOT = ['#ffffff', '#ffe0d0', '#ff8a6a', '#ff3a1a', '#d01008'];

export type BarFont = 'small' | 'tiny' | 'big' | 'bigfat';
export interface BarText {
  text: string;
  font: BarFont;
  x: number;
  y: number;
  color: string | string[];
  /** text shadow (small/tiny only); undefined = default '#000'. */
  shadow?: string | null;
}
export const BAR_FONT_H: Record<BarFont, number> = { small: 7, tiny: 5, big: 14, bigfat: 14 };

export function barTextW(t: Pick<BarText, 'text' | 'font'>): number {
  switch (t.font) {
    case 'tiny': return measureText(t.text, 'tiny');
    case 'big': return measureBig(t.text);
    case 'bigfat': return measureBig(t.text, true);
    default: return measureText(t.text);
  }
}

/** Bounding box (half-open) of a bar text run. */
export function barTextBox(t: BarText): { x: number; y: number; w: number; h: number } {
  return { x: t.x, y: t.y, w: barTextW(t), h: BAR_FONT_H[t.font] };
}

/** RESOURCES column: one labelled row per ammo type, Doom RES table style. */
export const RES_ROW_TOP = 2;
export const RES_ROW_PITCH = 7;
export function resRowY(i: number): number {
  return BASE_H - BASE_STATUS + RES_ROW_TOP + i * RES_ROW_PITCH;
}

/** Gold plate rect behind the active RES row — every one of the four fits inside the bar. */
export function resRowPlate(i: number): { x: number; y: number; w: number; h: number } {
  return { x: P_RES[0] + 3, y: resRowY(i) - 1, w: P_RES[1] - 6, h: 9 };
}

export interface BarLayoutInput {
  integrity: number;
  /** null = unlimited-ammo tool (READY/BUSY lamp instead of a count). */
  ammo: number | null;
  ammoName: string;
  /** READY lamp state for the unlimited-ammo label. */
  ready: boolean;
  credentials: string;
  /** roleColor(credentials).light — label tint for the CRED panel. */
  credTint: string;
  tool: { slot: number };
  /** all eight slot defs in slot order. */
  tools: { id: string; slot: number }[];
  /** owned tool ids. */
  owned: string[];
  got?: { k: number; slot: number; blink: boolean } | null;
  /** Doom RES table rows (max 4 shown). */
  resources: { label: string; cur: number; max: number; owned: boolean; active: boolean }[];
  objectives: { done: boolean; failed: boolean }[];
  progress?: { done: number; total: number; failed: boolean };
}

export function statusBarText(o: BarLayoutInput, pulse: boolean): BarText[] {
  const by = BASE_H - BASE_STATUS;
  const out: BarText[] = [];
  const push = (text: string, font: BarFont, x: number, y: number, color: string | string[], shadow?: string | null): void => {
    out.push({ text, font, x, y, color, shadow });
  };
  const centered = (text: string, p: Panel, y: number, font: BarFont, color: string | string[]): void => {
    push(text, font, p[0] + Math.round((p[1] - barTextW({ text, font })) / 2), y, color);
  };
  const label = (text: string, p: Panel, y: number, color = '#c8c0b0'): void => {
    const f: BarFont = measureText(text) <= p[1] - 6 ? 'small' : 'tiny';
    centered(text, p, y + (f === 'tiny' ? 1 : 0), f, color);
  };

  // INTEGRITY: big fat digits; <=25% goes white-hot and the label warns.
  const hp = Math.ceil(o.integrity);
  const crit = hp > 0 && hp <= 25;
  centered(`${hp}%`, P_INT, by + 5, 'bigfat', crit && pulse ? RED_HOT : RED);
  label(crit && !pulse ? 'CRITICAL' : 'INTEGRITY', P_INT, by + 20, crit ? '#ff5a3a' : undefined!);

  // AMMO / bandwidth.
  const rr = o.resources.find((r) => r.active);
  const low =
    o.ammo !== null && (o.ammo === 0 || (!!rr && rr.max > 0 && o.ammo <= Math.max(1, Math.floor(rr.max * 0.25))));
  if (o.ammo === null) {
    label(o.ready ? 'READY' : 'BUSY', P_AMMO, by + 20, o.ready ? '#5aff6a' : '#ffc030');
  } else {
    centered(`${o.ammo}`, P_AMMO, by + 5, 'bigfat', low ? (pulse ? RED_HOT : RED) : AMBER);
    label((rr ? rr.label : o.ammoName).toUpperCase().slice(0, 6), P_AMMO, by + 20, low ? '#ff5a3a' : undefined!);
  }

  // TOOLS grid digits (Doom ARMS): lit when owned, boxed when held.
  for (let i = 0; i < 8; i++) {
    const slot = i + 1;
    const t = o.tools.find((tt) => tt.slot === slot);
    const owned = !!t && o.owned.includes(t.id);
    const x = P_TOOLS[0] + 3 + (i % 4) * 11;
    const y = by + 6 + Math.floor(i / 4) * 10;
    const active = !!t && t.slot === o.tool.slot;
    const fresh = !!o.got && o.got.slot === slot && o.got.blink;
    push(`${slot}`, 'small', x + 3, y + 1, fresh ? '#000' : active ? '#fff0a0' : owned ? '#ffa818' : '#3a3e48', fresh ? null : '#000');
  }

  // CRED: current role under the keycard art.
  label(o.credentials.toUpperCase().slice(0, 7), P_CRED, by + 20, o.credTint);

  // RESOURCES: Doom's RES table — one LABEL cur/max row per ammo type.
  // The 3x5 font leaves real whitespace between the four rows (the 5x7
  // font at 7px pitch reads as one overlapping blob); the held tool's
  // row is highlighted in gold on a plate.
  o.resources.slice(0, 4).forEach((r, i) => {
    const ry = resRowY(i) + 1; // tiny glyphs (5px) centred in the 7px row
    const col = !r.owned ? '#4a4e58' : r.cur === 0 ? '#ff4a2a' : r.active ? '#fff0a0' : '#ffa818';
    const lab = r.active ? '#ffd040' : r.owned ? '#c8c0b0' : '#4a4e58';
    push(r.label, 'tiny', P_RES[0] + 4, ry, lab);
    const v = `${r.cur}/${r.max}`;
    push(v, 'tiny', P_RES[0] + P_RES[1] - 4 - measureText(v, 'tiny'), ry, col);
  });

  // OBJECTIVES n/m.
  const done = o.progress?.done ?? o.objectives.filter((x) => x.done).length;
  const total = o.progress?.total ?? o.objectives.length;
  const failed = o.progress?.failed ?? o.objectives.some((x) => x.failed);
  const objectiveCount = `${done}/${total}`;
  if (measureBig(objectiveCount) <= P_OBJ[1] - 6) {
    centered(objectiveCount, P_OBJ, by + 5, 'big', failed ? RED : done === total ? GREEN : GREEN.slice(1));
  } else {
    label(objectiveCount, P_OBJ, by + 6, failed ? RED[0] : done === total ? GREEN[0] : GREEN[1]);
  }
  label(failed ? 'FAIL' : 'OBJ', P_OBJ, by + 20, failed ? '#ff5a3a' : undefined!);
  return out;
}

/** Text runs are laid out in 320x200 base units; the bar occupies this band. */
export const BAR_TOP = BASE_H - BASE_STATUS;
export const BAR_LEFT = 0;
export const BAR_RIGHT = BASE_W;
export const BAR_BOTTOM = BASE_H;
