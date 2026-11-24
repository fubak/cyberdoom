/**
 * Geometry for the `[E]` / `[LMB]` key plates in the HUD prompt band.
 *
 * Each prompt row is drawn at `y` on a dark backing plate spanning y-1..y+7. The
 * key plate fills that full height and the 5x7 key glyph sits at `y`, on the
 * same baseline as the prompt text, so every glyph row (E's bottom bar
 * included) lands on the amber plate. The old 7px plate with the glyph 1px
 * low dropped E's bottom row onto the dark plate, and E read as F.
 */

/** The prompt row's dark backing plate, relative to the row's text y. */
export const PROMPT_ROW_PLATE = { dy: -1, h: 9 } as const;

const KEY_PAD_X = 2;

export interface KeyPlateRect {
  x: number;
  y: number;
  w: number;
  h: number;
  glyphX: number;
  glyphY: number;
}

/** Plate rect and glyph origin for a key label `keyW` px wide, at row text position (x, y). */
export function keyPlateRect(x: number, y: number, keyW: number): KeyPlateRect {
  return {
    x,
    y: y + PROMPT_ROW_PLATE.dy,
    w: keyW + KEY_PAD_X * 2,
    h: PROMPT_ROW_PLATE.h,
    glyphX: x + KEY_PAD_X,
    glyphY: y,
  };
}
