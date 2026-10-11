import { VM_CLEAR } from '../tools/anim';

/**
 * ENEMIES: melee-contact visibility math.
 *
 * At contact range a floor-height attacker projects entirely inside the band
 * the tool viewmodel owns (below `VM_CLEAR` of the 3D view, centre column), so
 * the player sees only its crown while it drains integrity. During
 * windup/attack we raise the attacker's vertical anchor — the Doom "lunge" —
 * until at least `ABOVE_FRAC` of its projected silhouette sits above the
 * viewmodel top line. F4 adds a graded ramp: melee threats start swelling and
 * lifting as they close so the strike never pops in from nothing.
 */

/** Share of the sprite's projected height that must clear the viewmodel line. */
export const RISE_ABOVE_FRAC = 0.6;
/** Distance (tiles) inside which the full lunge applies. */
export const RISE_MAX_DIST = 1.35;
/**
 * Doom pinky loom: during windup/attack the sprite may fill this much of
 * the view (past the normal 0.65 near-plane cap), so the read above the
 * viewmodel reaches ~LOOM_FILL_FRAC of view height.
 */
export const LOOM_CAP_FRAC = 0.8;
/** Share of view height the lunging silhouette should occupy. */
export const LOOM_FILL_FRAC = 0.47;
/** Hard bound on the loom scale-up so tiny sprites don't explode at contact. */
export const LOOM_MAX_SCALE = 2.2;

/**
 * Graded loom band (F4): the boost is 1 inside LOOM_FULL_DIST and
 * smooth-decays to 0 at LOOM_MAX_DIST, so a melee attacker swells toward the
 * lunge as it closes instead of popping at the old 1.35-tile boundary.
 * CHASE_BOOST is the share of the full loom a merely-chasing melee attacker
 * gets; windup/recover always get the full loomT.
 */
export const LOOM_FULL_DIST = 1.5;
export const LOOM_MAX_DIST = 2.4;
export const CHASE_BOOST = 0.62;

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** 1 inside LOOM_FULL_DIST, smooth-decays to 0 at LOOM_MAX_DIST. */
export const loomT = (dist: number): number =>
  smoothstep((LOOM_MAX_DIST - dist) / (LOOM_MAX_DIST - LOOM_FULL_DIST));

/** Graded loom factor for this sprite this frame (0 = baseline sprite). */
export const loomK = (dist: number, attacking: boolean, melee: boolean): number =>
  attacking ? loomT(dist) : melee ? CHASE_BOOST * loomT(dist) : 0;

/**
 * ENEMIES F5 range compensation: past FAR0 a threat's drawn sprite grows
 * with distance so its silhouette keeps a Doom-like share of the view
 * (~12%+ at 10 tiles) instead of collapsing into a speck. Purely visual —
 * collision radii, AI and hit tests are unchanged; the melee loom handles
 * the near end, so the two boosts never stack.
 */
export const FAR0 = 5.5;
export const FAR_SCALE_CAP = 1.45;
export const farScale = (dist: number): number =>
  Math.min(FAR_SCALE_CAP, 1 + 0.035 * Math.max(0, dist - FAR0));

/**
 * Drawn world height a lunging attacker wants at `dist` so that, once the
 * rise pushes `RISE_ABOVE_FRAC` of it over the viewmodel line, the visible
 * loom is ~LOOM_FILL_FRAC of the view. The renderer clamps this to
 * LOOM_CAP_FRAC of the frustum span.
 */
export function loomTargetH(dist: number, fovDeg: number): number {
  const span = 2 * dist * Math.tan((fovDeg * Math.PI) / 360);
  return (LOOM_FILL_FRAC / RISE_ABOVE_FRAC) * span;
}

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
