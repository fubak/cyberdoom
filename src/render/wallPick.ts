import { OFFICE_WALL_ALTS } from './texturesOffice';

/**
 * Deterministic per-face wall texture + decal pick (pure; unit-tested).
 * `h` is the renderer's per-face hash; the bit slices are unchanged from the
 * original inline pick so missions without office walls render exactly as
 * before.
 */

/** Wall families flat enough to carry a decal plate overlay. */
export const DECALABLE = new Set([
  'wall-panel', 'wall-brick', 'wall-tech', 'wall-ribs', 'wall-brick2', 'wall-panel2',
  // office runs (P1-11): the base, the notice board and the service column;
  // the hose cabinet already fills its face
  'wall-office', 'wall-office2', 'wall-office4',
]);

/** Fixed alternate families mixed into a base wall family's runs (1 in 4 faces). */
const FAMILY_ALTS: Record<string, readonly string[]> = {
  'wall-office': OFFICE_WALL_ALTS,
};

/** Decal rate per family: 1 face in N carries a decal (default 3). */
const DECAL_EVERY: Record<string, number> = {
  'wall-office': 5,
  'wall-office2': 5,
  'wall-office4': 5,
};

export interface WallPickTheme {
  alts: string[];
  decals: string[];
}

export interface WallPick {
  /** Texture id (may carry a `:vN` baked-variant suffix). */
  tex: string;
  /** Decal overlay id, or null. */
  decal: string | null;
}

export function pickWallFace(baseTex: string, h: number, theme: WallPickTheme, variantCount: (id: string) => number): WallPick {
  let texId = baseTex;
  const fam = FAMILY_ALTS[texId];
  if (texId === 'wall-panel' && h % 4 === 0) texId = theme.alts[(h >>> 4) % theme.alts.length];
  else if (texId === 'wall-brick' && h % 6 === 0) texId = 'wall-brick2';
  // high bits: the low bits of this hash are biased (~40% hit h % 4 === 0)
  else if (fam && (h >>> 20) % 4 === 0) texId = fam[(h >>> 4) % fam.length];
  const family = texId;
  const nv = variantCount(texId);
  if (nv > 1 && (h >>> 16) % nv > 0) texId = `${texId}:v${(h >>> 16) % nv}`;
  const every = DECAL_EVERY[family] ?? 3;
  const decal = DECALABLE.has(family) && theme.decals.length > 0 && (h >>> 8) % every === 0
    ? theme.decals[(h >>> 12) % theme.decals.length]
    : null;
  return { tex: texId, decal };
}
