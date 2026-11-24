/**
 * Pure automap view math (UX plan Phase F #27): auto-fit to the explored area,
 * edge arrows for objective targets outside explored space, and the icon shape
 * per door / lock / exit cell. Nothing here touches a canvas or mutates input.
 */

export const AUTOMAP_ZOOM_MIN = 0.4;
export const AUTOMAP_ZOOM_MAX = 4;
/** Tiles of breathing room around the explored box when auto-fitting. */
const FIT_MARGIN = 1;

export interface TileBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface AutomapFrame {
  /** View size in base pixels. */
  readonly w: number;
  readonly h: number;
  /** Rows covered by the header (top) and footer (bottom) bands. */
  readonly insetTop: number;
  readonly insetBottom: number;
}

export interface AutomapFit {
  readonly zoom: number;
  /** Map-tile point drawn at the centre of the view. */
  readonly centerX: number;
  readonly centerY: number;
}

/** Cell size at zoom 1: ~80% of the view along the map's tighter axis. */
export function automapBaseCell(view: { w: number; h: number }, mapW: number, mapH: number): number {
  return Math.max((view.w * 0.8) / Math.max(1, mapW), (view.h * 0.8) / Math.max(1, mapH));
}

/** Bounding box of explored tiles (`visited` holds y * mapW + x), or null if none. */
export function exploredBounds(visited: ReadonlySet<number>, mapW: number, mapH: number): TileBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const index of visited) {
    if (index < 0 || index >= mapW * mapH) continue;
    const x = index % mapW;
    const y = Math.floor(index / mapW);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * Zoom and centre so the explored box (plus a tile of margin) fills the band
 * between the header and footer. The draw code puts `center` at the middle of
 * the raw view, so the centre is shifted to land the box mid-band instead.
 */
export function fitExplored(bounds: TileBounds, mapW: number, mapH: number, view: AutomapFrame): AutomapFit {
  const bandH = Math.max(1, view.h - view.insetTop - view.insetBottom);
  const boxW = bounds.maxX - bounds.minX + 1 + FIT_MARGIN * 2;
  const boxH = bounds.maxY - bounds.minY + 1 + FIT_MARGIN * 2;
  const wanted = Math.min(view.w / boxW, bandH / boxH);
  const zoom = Math.min(AUTOMAP_ZOOM_MAX, Math.max(AUTOMAP_ZOOM_MIN, wanted / automapBaseCell(view, mapW, mapH)));
  const cell = automapBaseCell(view, mapW, mapH) * zoom;
  const bandMid = view.insetTop + bandH / 2;
  return {
    zoom,
    centerX: (bounds.minX + bounds.maxX + 1) / 2,
    centerY: (bounds.minY + bounds.maxY + 1) / 2 - (bandMid - view.h / 2) / cell,
  };
}

/**
 * Top-left screen position of map tile (0, 0) with `center` drawn mid-view.
 * Follow mode keeps the old tight clamp (the map covers the screen, no black
 * void past its edge). Free pan, where the auto-fit lands, may slide the map
 * edge up to mid-view so an explored corner can be centred too.
 */
export function automapOrigin(
  center: { x: number; y: number },
  cell: number,
  mapW: number,
  mapH: number,
  view: { w: number; h: number },
  follow: boolean,
): { left: number; top: number } {
  const axis = (c: number, tiles: number, span: number) => {
    const size = tiles * cell;
    const raw = span / 2 - c * cell;
    if (follow) return size <= span ? (span - size) / 2 : clamp(raw, span - size, 0);
    return clamp(raw, span / 2 - size, span / 2);
  };
  return { left: axis(center.x, mapW, view.w), top: axis(center.y, mapH, view.h) };
}

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface EdgeArrow {
  readonly x: number;
  readonly y: number;
  /** Direction the arrow points (radians, screen space, 0 = right). */
  readonly angle: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Arrow on the frame border for a target outside explored space. It sits where
 * the ray from `origin` (the player, clamped into the frame) toward the target
 * meets the border, so it gives a direction but never the exact spot, even
 * when the target's tile happens to be on screen. Null when there is no
 * direction (target on the origin).
 */
export function edgeArrow(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  rect: ScreenRect,
): EdgeArrow | null {
  const ox = clamp(origin.x, rect.left, rect.right);
  const oy = clamp(origin.y, rect.top, rect.bottom);
  const dx = target.x - ox;
  const dy = target.y - oy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const tx = dx > 0 ? (rect.right - ox) / dx : dx < 0 ? (rect.left - ox) / dx : Infinity;
  const ty = dy > 0 ? (rect.bottom - oy) / dy : dy < 0 ? (rect.top - oy) / dy : Infinity;
  const t = Math.min(tx, ty);
  return {
    x: clamp(ox + dx * t, rect.left, rect.right),
    y: clamp(oy + dy * t, rect.top, rect.bottom),
    angle: Math.atan2(dy, dx),
  };
}

/**
 * Slide a border arrow out from under a box glued to the frame (the legend):
 * down past it on a side border, sideways past it on the top/bottom border.
 */
export function avoidBox(arrow: EdgeArrow, box: ScreenRect, rect: ScreenRect, gap = 4): EdgeArrow {
  const inside = arrow.x >= box.left - gap && arrow.x <= box.right + gap &&
    arrow.y >= box.top - gap && arrow.y <= box.bottom + gap;
  if (!inside) return arrow;
  const onSide = Math.abs(arrow.x - rect.left) < 1e-6 || Math.abs(arrow.x - rect.right) < 1e-6;
  return onSide
    ? { ...arrow, y: clamp(box.bottom + gap, rect.top, rect.bottom) }
    : { ...arrow, x: clamp(box.left - gap, rect.left, rect.right) };
}

/**
 * Objective markers split by exploration: explored ones draw as diamonds in
 * place, unexplored ones as edge arrows. Every point lands in exactly one list,
 * so the marker set stays as verdict-neutral as the overlay that supplied it.
 */
export function partitionObjectivePoints<T extends { x: number; y: number }>(
  points: readonly T[],
  visited: ReadonlySet<number>,
  mapW: number,
): { explored: T[]; unexplored: T[] } {
  const isExplored = (p: T) => visited.has(Math.floor(p.y) * mapW + Math.floor(p.x));
  return { explored: points.filter(isExplored), unexplored: points.filter((p) => !isExplored(p)) };
}

export type AutomapIcon = 'player' | 'exit' | 'objective' | 'door' | 'locked';

/**
 * Shape for a map cell, so doors, locks and exits differ by more than colour:
 * door = slab across the passage, locked = boxed X, exit = framed square.
 */
export function automapCellIcon(cell: { kind: string; locked?: boolean; accessRole?: string }): AutomapIcon | null {
  if (cell.kind === 'exit') return 'exit';
  if (cell.kind !== 'door') return null;
  return cell.locked ? 'locked' : 'door';
}

/** 'h' = slab lies horizontal (walls left and right, passage runs north-south). */
export function doorAxis(isWall: (x: number, y: number) => boolean, x: number, y: number): 'h' | 'v' {
  if (isWall(x - 1, y) && isWall(x + 1, y)) return 'h';
  if (isWall(x, y - 1) && isWall(x, y + 1)) return 'v';
  return 'h';
}
