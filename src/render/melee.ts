import { VM_CLEAR } from '../tools/anim';

/**
 * ENEMIES: melee-contact visibility math.
 *
 * At contact range a floor-height attacker projects entirely inside the band
 * the tool viewmodel owns (below `VM_CLEAR` of the 3D view, centre column), so
 * the player sees only its crown while it drains integrity. During
 * windup/attack we raise the attacker's vertical anchor — the Doom "lunge" —
 * until at least `ABOVE_FRAC` of its projected silhouette sits above the
 * viewmodel top line.
 */

/** Share of the sprite's projected height that must clear the viewmodel line. */
export const RISE_ABOVE_FRAC = 0.6;
/** Distance (tiles) inside which the lunge applies. */
export const RISE_MAX_DIST = 1.35;

/** Screen-space rect of a bottom-anchored sprite, as fractions of view height (0 = top). */
export function spriteScreenRect(
  baseY: number,
  spriteH: number,
  dist: number,
  eyeH: number,
  fovDeg: number,
): { top: number; bottom: number } {
  const span = 2 * dist * Math.tan((fovDeg * Math.PI) / 360);
  const f = (worldY: number) => 0.5 - (worldY - eyeH) / span;
  return { top: f(baseY + spriteH), bottom: f(baseY) };
}

/** Fraction of a projected sprite rect sitting above `lineFrac` (viewmodel top). */
export function fracAboveLine(rect: { top: number; bottom: number }, lineFrac = VM_CLEAR): number {
  const span = rect.bottom - rect.top;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (Math.min(rect.bottom, lineFrac) - rect.top) / span));
}

/**
 * The world-Y the sprite's base must reach so `aboveFrac` of its projected
 * rect clears the viewmodel top line at `dist`. Caller applies
 * `max(0, riseBase(...) - currentBase)` — negative values mean it already reads.
 */
export function riseBase(
  spriteH: number,
  dist: number,
  eyeH: number,
  fovDeg: number,
  lineFrac = VM_CLEAR,
  aboveFrac = RISE_ABOVE_FRAC,
): number {
  const span = 2 * dist * Math.tan((fovDeg * Math.PI) / 360);
  // small margin so the smoothed lift still clears `aboveFrac` between frames
  return eyeH - (lineFrac - 0.5) * span - (1 - aboveFrac - 0.02) * spriteH;
}
