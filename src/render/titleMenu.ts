/**
 * Title menu geometry in 320x200 base units. The stippled menu plate keeps
 * its bottom edge where the original four-entry menu put it (y 186, clear of
 * the fire and the tagline) and grows upward; past four entries the rows
 * tighten from 14 to 12 so six entries still sit below the logo band.
 */
const PLATE_BOTTOM = 186;
const ROOMY_ROWS = 14;
const TIGHT_ROWS = 12;
const ROOMY_MAX = 4;

export interface TitleMenuLayout {
  menuY: number;
  rowH: number;
}

export function titleMenuLayout(count: number): TitleMenuLayout {
  const rowH = count > ROOMY_MAX ? TIGHT_ROWS : ROOMY_ROWS;
  // plate spans menuY - 8 .. menuY + 2 + count * rowH
  return { menuY: PLATE_BOTTOM - 2 - count * rowH, rowH };
}
