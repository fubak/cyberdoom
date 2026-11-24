import type { AutomapIcon, EdgeArrow } from './automapView';

/**
 * Canvas painters for automap cell icons, objective markers and the matching
 * legend swatches. Door, lock and exit differ by shape as well as colour:
 * door = slab across the passage, locked = boxed X, exit = framed square.
 */

const LOCK_RED = '#d63025';
const OBJECTIVE_STROKE = '#4de8ff';
const OBJECTIVE_FILL = 'rgba(77,232,255,0.28)';

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
