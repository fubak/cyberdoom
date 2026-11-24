/**
 * Photosensitivity policy for full-screen flashes (fire flood, landed-hit
 * bloom, pain wash, pickup glow). The default budget is the WCAG 2.3.1
 * three-per-second ceiling; the REDUCED FLASHING option drops it to one per
 * second and dims whatever still fires.
 */
const NORMAL_BUDGET = 3;
const REDUCED_BUDGET = 1;
const REDUCED_STRENGTH = 0.35;

/** Max full-screen flashes per second for the FlashRateLimiter. */
export function flashBudget(reduced: boolean): number {
  return reduced ? REDUCED_BUDGET : NORMAL_BUDGET;
}

/** Multiplier for flash intensity (light floods, wash peak, glow). */
export function flashStrength(reduced: boolean): number {
  return reduced ? REDUCED_STRENGTH : 1;
}
