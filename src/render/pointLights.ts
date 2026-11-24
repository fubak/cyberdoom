/**
 * LOOK: small moving lights. Projectiles and spawn columns glow, so the walls
 * and floor they pass should catch that colour. The world shader takes a
 * fixed handful of point lights; this picks which ones matter this frame.
 * Pure data, no rendering: the renderer copies the result into its uniforms.
 */

export type LightColour = [number, number, number];

export interface PointLight {
  /** Map position (tiles). */
  x: number;
  y: number;
  /** Reach in tiles; the light is zero at this distance. */
  radius: number;
  /** Strength at the centre, 0..~1.5. */
  intensity: number;
  col: LightColour;
}

/** How many point lights the world shader evaluates per texel. */
export const MAX_POINT_LIGHTS = 4;

/** A hostile payload: a hot orange orb. */
export const PAYLOAD_LIGHT = { radius: 2.8, intensity: 0.9, col: [1, 0.45, 0.15] as LightColour };
/** The player's scan charge: cyan. */
export const SCAN_LIGHT = { radius: 2.3, intensity: 0.7, col: [0.3, 0.85, 1] as LightColour };
/** A threat materialising: a wide cyan-white flash that dies with the column. */
export const SPAWN_LIGHT = { radius: 4.6, intensity: 1.3, col: [0.55, 0.9, 1] as LightColour };

/** Light of an effect that fades over its life: full at birth, zero at `dur`. */
export function fadingLight(base: { radius: number; intensity: number; col: LightColour }, x: number, y: number, t: number, dur: number): PointLight {
  const left = dur > 0 ? Math.max(0, Math.min(1, 1 - t / dur)) : 0;
  return { x, y, radius: base.radius, intensity: base.intensity * left, col: base.col };
}

/**
 * The lights that matter most to the camera: strong and near first. Dead
 * lights (no intensity or no reach) are dropped. Never returns more than `max`.
 */
export function pickPointLights(sources: readonly PointLight[], camX: number, camY: number, max = MAX_POINT_LIGHTS): PointLight[] {
  const scored = sources
    .filter((s) => s.intensity > 0.01 && s.radius > 0)
    .map((s) => {
      const d2 = (s.x - camX) ** 2 + (s.y - camY) ** 2;
      return { s, score: s.intensity / (1 + d2 * 0.05) };
    });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((e) => e.s);
}
