/**
 * LOOK: wall-face corner lighting (P1-11 wall seams).
 *
 * A wall face used to carry one flat sector-light value taken from the open
 * tile in front of it, so two collinear faces in front of differently-lit
 * tiles of the same room (lamp pools fall off per tile) met in a hard
 * vertical stripe. Each face now takes its light per edge from the shared
 * grid corner: the mean light of the open cells touching that corner that
 * belong to the face's own sector. Collinear neighbours in one sector read
 * the same value at their shared edge, so the wall gradients across a tile
 * instead of stepping; at an authored sector boundary each side keeps its own
 * level (Doom's hard sector edge). Brightness jitter is keyed to the grid
 * corner too, so it no longer reintroduces a step either.
 *
 * Pure functions, no Three.js — unit-tested in tests/wall-seams.test.ts.
 */
export interface WallLightCtx {
  /** Computed per-tile light (lamp pools etc.). */
  light: (x: number, y: number) => number;
  /** Cells that block light sharing (walls, door slabs, out of map). */
  solid: (x: number, y: number) => boolean;
  /** Authored sector id/level: corners only average within one sector. */
  sector: (x: number, y: number) => number;
}

/**
 * Grid points of a wall face's left and right edges, in the vertex order the
 * renderer's wallFace emits ([l, r]) for wall cell (tx, ty) facing (dx, dz).
 */
export function wallCorners(tx: number, ty: number, dx: number, dz: number): [[number, number], [number, number]] {
  const cx = tx + 0.5 + dx * 0.5;
  const cz = ty + 0.5 + dz * 0.5;
  // right-hand direction along the face: (nz, -nx)
  const rx = dz;
  const rz = -dx;
  return [
    [cx - rx * 0.5, cz - rz * 0.5],
    [cx + rx * 0.5, cz + rz * 0.5],
  ];
}

/**
 * Light at grid corner (vx, vy) seen from a face of `sector`: the mean of the
 * open cells touching the corner that share the sector. `own` (the face's
 * open tile) always touches its own corners, so the mean is never empty.
 */
export function cornerLight(vx: number, vy: number, own: [number, number], ctx: WallLightCtx): number {
  const sector = ctx.sector(own[0], own[1]);
  let sum = 0;
  let n = 0;
  for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const x = vx + ox;
    const y = vy + oy;
    if (ctx.solid(x, y) || ctx.sector(x, y) !== sector) continue;
    sum += Math.abs(ctx.light(x, y));
    n++;
  }
  return n ? sum / n : Math.abs(ctx.light(own[0], own[1]));
}

/** [left, right] edge light of the face of wall cell (tx, ty) facing (dx, dz). */
export function wallFaceLight(tx: number, ty: number, dx: number, dz: number, ctx: WallLightCtx): [number, number] {
  const own: [number, number] = [tx + dx, ty + dz];
  const [l, r] = wallCorners(tx, ty, dx, dz);
  return [cornerLight(l[0], l[1], own, ctx), cornerLight(r[0], r[1], own, ctx)];
}

/**
 * Per-corner brightness jitter (+-7%): the old per-face jitter moved to the
 * grid corner so neighbouring faces still vary without a step between them.
 */
export function cornerJitter(vx: number, vy: number, seed: number): number {
  const h = (Math.imul(vx * 2 + 1, 73856093) ^ Math.imul(vy * 2 + 1, 19349663) ^ Math.imul(31, 83492791) ^ seed) >>> 0;
  return 0.93 + ((h >>> 23) % 15) / 100;
}
