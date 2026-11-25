import { RES } from '../render/res';
import type { AutomapIcon, EdgeArrow } from './automapView';

/**
 * Canvas painters for automap cell icons, objective markers and the matching
 * legend swatches. Door, lock and exit differ by shape as well as colour:
 * door = slab across the passage, locked = boxed X, exit = framed square.
 */

const LOCK_RED = '#d63025';
const OBJECTIVE_STROKE = '#4de8ff';
const OBJECTIVE_FILL = 'rgba(77,232,255,0.28)';

const U = 1 / RES;

/** Map colours. */
export const MAP_BG = '#04060a';
export const MAP_WALL = '#2c1c0f';
export const MAP_FLOOR = '#171a1d';
export const MAP_EDGE = '#c8502e';
/** Backdrop grid pitch, in map tiles. */
export const GRID_TILES = 4;

/** Screen positions of the backdrop grid lines along one axis of length `span`. */
export function gridLines(origin: number, pitch: number, span: number): number[] {
  if (pitch <= 0) return [];
  const lines: number[] = [];
  for (let p = origin - Math.ceil(origin / pitch) * pitch; p < span; p += pitch) lines.push(p);
  return lines;
}

/** Blueprint backdrop: near-black with a faint grid locked to every fourth map tile. */
export function paintBackdrop(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  left: number,
  top: number,
  cell: number,
): void {
  g.fillStyle = MAP_BG;
  g.fillRect(0, 0, w, h);
  const pitch = cell * GRID_TILES;
  if (pitch < 6) return;
  g.fillStyle = 'rgba(70,120,170,0.11)';
  for (const x of gridLines(left, pitch, w)) g.fillRect(x, 0, U, h);
  for (const y of gridLines(top, pitch, h)) g.fillRect(0, y, w, U);
}

/** Wall tile: dark brick with a lit upper-left edge, so wall mass reads as blocks. */
export function paintWall(g: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  g.fillStyle = MAP_WALL;
  g.fillRect(px, py, size, size);
  if (size < 3) return;
  g.fillStyle = 'rgba(255,170,110,0.09)';
  g.fillRect(px, py, size, U);
  g.fillRect(px, py, U, size);
}

/** Floor tile: dark slab with a faint seam on its lower-right edge. */
export function paintFloor(g: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  g.fillStyle = MAP_FLOOR;
  g.fillRect(px, py, size, size);
  if (size < 3) return;
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.fillRect(px, py + size - U, size, U);
  g.fillRect(px + size - U, py, U, size);
}

/** Wall face along a floor edge: a soft glow under a crisp orange line. */
export function paintWallEdge(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const passes: readonly (readonly [string, number])[] = [['rgba(255,110,60,0.22)', 3.5], [MAP_EDGE, 1.5], ['#ff9a70', U]];
  for (const [color, width] of passes) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
}

/** Half-angle of the player's view cone on the map (radians). */
export const PLAYER_CONE = Math.PI / 5;

/** Player marker at (cx, cy): a faint view cone, a halo and an outlined white arrow. */
export function paintPlayer(g: CanvasRenderingContext2D, cx: number, cy: number, angle: number, cell: number): void {
  g.fillStyle = 'rgba(255,255,255,0.09)';
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, cell * 2.4, angle - PLAYER_CONE, angle + PLAYER_CONE);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  g.arc(cx, cy, cell * 0.62, 0, Math.PI * 2);
  g.fill();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  g.beginPath();
  g.moveTo(cx + c * cell * 0.46, cy + s * cell * 0.46);
  g.lineTo(cx - c * cell * 0.32 + s * cell * 0.28, cy - s * cell * 0.32 - c * cell * 0.28);
  g.lineTo(cx - c * cell * 0.12, cy - s * cell * 0.12);
  g.lineTo(cx - c * cell * 0.32 - s * cell * 0.28, cy - s * cell * 0.32 + c * cell * 0.28);
  g.closePath();
  g.strokeStyle = '#000';
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = '#fff';
  g.fill();
}

/** Door slab: a bar across the cell, thick enough to read at small zoom. */
export function paintDoor(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  fill: string,
  axis: 'h' | 'v',
): void {
  const thick = Math.max(1.5, size * 0.34);
  const inset = size * 0.06;
  g.fillStyle = fill;
  if (axis === 'h') g.fillRect(px + inset, py + (size - thick) / 2, size - inset * 2, thick);
  else g.fillRect(px + (size - thick) / 2, py + inset, thick, size - inset * 2);
}

/** Locked door: filled square crossed by a dark X, red rim. */
export function paintLocked(g: CanvasRenderingContext2D, px: number, py: number, size: number, fill: string): void {
  const d = size * 0.14;
  const s = size - d * 2;
  g.fillStyle = fill;
  g.fillRect(px + d, py + d, s, s);
  g.strokeStyle = '#1a0604';
  g.lineWidth = Math.max(0.75, size * 0.12);
  g.beginPath();
  g.moveTo(px + d + s * 0.22, py + d + s * 0.22);
  g.lineTo(px + d + s * 0.78, py + d + s * 0.78);
  g.moveTo(px + d + s * 0.78, py + d + s * 0.22);
  g.lineTo(px + d + s * 0.22, py + d + s * 0.78);
  g.stroke();
  g.strokeStyle = LOCK_RED;
  g.lineWidth = 1;
  g.strokeRect(px + d, py + d, s, s);
}

/** Exit: full green cell with a pale inner frame. */
export function paintExit(g: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  g.fillStyle = '#32d45a';
  g.fillRect(px + 0.5, py + 0.5, size - 1, size - 1);
  g.strokeStyle = '#d8ffe2';
  g.lineWidth = 1;
  g.strokeRect(px + 1, py + 1, Math.max(1, size - 2), Math.max(1, size - 2));
}

/** Objective diamond on an explored tile. */
export function paintObjectiveDiamond(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.strokeStyle = OBJECTIVE_STROKE;
  g.fillStyle = OBJECTIVE_FILL;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  g.fill();
  g.stroke();
}

/** Objective outside explored space: same cyan, as an arrowhead on the frame border. */
export function paintObjectiveArrow(g: CanvasRenderingContext2D, arrow: EdgeArrow, size = 4.5): void {
  const c = Math.cos(arrow.angle);
  const s = Math.sin(arrow.angle);
  const back = size * 1.1;
  const half = size * 0.75;
  g.strokeStyle = OBJECTIVE_STROKE;
  g.fillStyle = OBJECTIVE_FILL;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(arrow.x, arrow.y);
  g.lineTo(arrow.x - c * back - s * half, arrow.y - s * back + c * half);
  g.lineTo(arrow.x - c * back + s * half, arrow.y - s * back - c * half);
  g.closePath();
  g.fill();
  g.stroke();
}

/** 5x5 legend swatch at (x, y) in the same shape the map uses. */
export function paintLegendIcon(g: CanvasRenderingContext2D, icon: AutomapIcon, x: number, y: number, color: string): void {
  if (icon === 'door') {
    paintDoor(g, x, y, 5, color, 'h');
  } else if (icon === 'locked') {
    paintLocked(g, x - 0.5, y - 0.5, 6, color);
  } else if (icon === 'exit') {
    paintExit(g, x, y, 5);
  } else if (icon === 'objective') {
    paintObjectiveDiamond(g, x + 2.5, y + 2.5, 2.2);
  } else {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x + 5, y + 2.5);
    g.lineTo(x, y);
    g.lineTo(x, y + 5);
    g.closePath();
    g.fill();
  }
}
