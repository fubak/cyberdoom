import type { MapDef } from '../core/types';
import { drawText, measureText } from '../render/font';
import { roleColor } from '../render/textures';
import { VIEW3D_H, VIEW_W } from '../render/renderer';
import { RES } from '../render/res';
import { MAP_HINT } from './nav';
import { roleLabel } from '../core/roleLabel';
import {
  AUTOMAP_ZOOM_MAX,
  AUTOMAP_ZOOM_MIN,
  automapBaseCell,
  automapCellIcon,
  automapOrigin,
  avoidBox,
  doorAxis,
  edgeArrow,
  exploredBounds,
  fitExplored,
  partitionObjectivePoints,
  type AutomapIcon,
} from './automapView';
import {
  paintDoor,
  paintExit,
  paintLegendIcon,
  paintLocked,
  paintObjectiveArrow,
  paintObjectiveDiamond,
} from './automapIcons';

/** Footer band height (base px): the key hint row. */
const FOOTER_H = 16;
/** Edge arrows sit this far inside the map frame. */
const ARROW_INSET = 5;

export interface AutomapOverlay {
  objectiveText?: string;
  objectivePoints?: { x: number; y: number }[];
  secrets?: number;
  secretsTotal?: number;
}

export interface AutomapLegendEntry {
  label: string;
  color: string;
  kind: 'player' | 'exit' | 'objective' | 'door' | 'locked' | 'role';
  /** Swatch shape; matches what the map draws for that cell type. */
  icon: AutomapIcon;
}

export function automapDoorStyle(cell: { locked?: boolean; accessRole?: string }): { fill: string; lockedBorder: boolean } {
  if (cell.accessRole) {
    return { fill: roleColor(cell.accessRole).light, lockedBorder: !!cell.locked };
  }
  return { fill: cell.locked ? '#d63025' : '#d9b83f', lockedBorder: false };
}

export function automapLegendEntries(map: MapDef): AutomapLegendEntry[] {
  const entries: AutomapLegendEntry[] = [
    { label: 'YOU', color: '#ffffff', kind: 'player', icon: 'player' },
    { label: 'EXIT', color: '#32d45a', kind: 'exit', icon: 'exit' },
    { label: 'OBJ', color: '#4de8ff', kind: 'objective', icon: 'objective' },
  ];
  const roles = new Set<string>();
  let hasStandardDoor = false;
  let hasLockedDoor = false;
  for (const cell of Object.values(map.legend)) {
    if (cell.kind !== 'door' || cell.secret) continue;
    // a role-gated locked door draws the lock shape too, so LOCK must be explained
    if (cell.locked) hasLockedDoor = true;
    if (cell.accessRole) roles.add(cell.accessRole);
    else if (!cell.locked) hasStandardDoor = true;
  }
  if (hasStandardDoor) entries.push({ label: 'DOOR', color: '#d9b83f', kind: 'door', icon: 'door' });
  if (hasLockedDoor) entries.push({ label: 'LOCK', color: '#d63025', kind: 'locked', icon: 'locked' });
  for (const role of [...roles].sort()) {
    entries.push({ label: roleLabel(role).slice(0, 7), color: roleColor(role).light, kind: 'role', icon: 'door' });
  }
  return entries;
}

const LEGEND_ROW_H = 7;

/** Legend box in the top-right corner, just under the header. */
function legendGeometry(legend: readonly AutomapLegendEntry[], viewW: number, headerH: number) {
  const w = Math.max(...legend.map((e) => measureText(e.label, 'tiny'))) + 15;
  const h = legend.length * LEGEND_ROW_H + 4;
  return { x: viewW - w - 3, y: headerH + 3, w, h };
}

/**
 * Objective diamonds the player may see: only those on tiles they have explored.
 * A diamond out in unexplored black space spoils the route, so unexplored
 * targets get only a direction (an edge arrow, see partitionObjectivePoints).
 */
export function visibleObjectivePoints<T extends { x: number; y: number }>(
  points: readonly T[],
  visited: ReadonlySet<number>,
  mapWidth: number,
): T[] {
  return partitionObjectivePoints(points, visited, mapWidth).explored;
}

export class Automap {
  private readonly context: CanvasRenderingContext2D;
  private open = false;
  /** 1 = fit most of the level on screen; wheel and +/- zoom around the centre. */
  private zoom = 1;
  /** Doom-style follow mode: recentre on the player every frame. Off = free pan. */
  private follow = true;
  private panX = 0;
  private panY = 0;
  /** First open of a level: centre and zoom on the explored area instead of the player. */
  private needsFit = true;

  constructor(canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
  }

  get isOpen(): boolean {
    return this.open;
  }

  get following(): boolean {
    return this.follow;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.follow = true;
  }

  close(): void {
    this.open = false;
  }

  /** New level: the next open auto-fits the explored area again. */
  reset(): void {
    this.open = false;
    this.needsFit = true;
    this.zoom = 1;
    this.follow = true;
  }

  zoomBy(dir: number): void {
    this.zoom = Math.min(AUTOMAP_ZOOM_MAX, Math.max(AUTOMAP_ZOOM_MIN, this.zoom * (dir > 0 ? 1.25 : 0.8)));
  }

  /**
   * Auto-fit on the first open: zoom so the explored box fills the frame and
   * hold the camera on its centre (free-pan mode, so G returns to follow and
   * the arrows / +/- keep working from there).
   */
  private applyFit(visited: ReadonlySet<number>, mapWidth: number, mapHeight: number, view: { w: number; h: number; insetTop: number }): void {
    this.needsFit = false;
    const bounds = exploredBounds(visited, mapWidth, mapHeight);
    if (!bounds) return;
    const fit = fitExplored(bounds, mapWidth, mapHeight, { ...view, insetBottom: FOOTER_H });
    this.zoom = fit.zoom;
    this.follow = false;
    this.panX = fit.centerX;
    this.panY = fit.centerY;
  }

  /** Doom 'F': follow the player or leave the camera where it is. Returns the new mode. */
  toggleFollow(player: { x: number; y: number }): boolean {
    this.follow = !this.follow;
    if (!this.follow) {
      this.panX = player.x;
      this.panY = player.y;
    }
    return this.follow;
  }

  /** Free-pan step in map tiles (no-op while following). */
  pan(dx: number, dy: number): void {
    if (this.follow) return;
    this.panX += dx;
    this.panY += dy;
  }

  draw(
    map: MapDef,
    visited: Set<number>,
    player: { x: number; y: number; angle: number },
    secretDoorRevealed: (doorId: string) => boolean,
    label?: string,
    overlay?: AutomapOverlay,
  ): void {
    if (!this.open) return;
    const g = this.context;
    const mapHeight = map.grid.length;
    const mapWidth = map.grid[0]?.length ?? 0;
    if (!mapWidth || !mapHeight) return;

    const W = VIEW_W / RES;
    const H = VIEW3D_H / RES;
    const headerH = overlay?.objectiveText ? 19 : 11;
    if (this.needsFit) this.applyFit(visited, mapWidth, mapHeight, { w: W, h: H, insetTop: headerH });

    // Fill ~80% of the view at zoom 1; the centre is the player in follow
    // mode (clamped so the map covers the screen) or the free-pan / auto-fit
    // point otherwise (looser clamp, so an explored corner can be centred).
    const cellSize = automapBaseCell({ w: W, h: H }, mapWidth, mapHeight) * this.zoom;
    const center = this.follow ? player : { x: this.panX, y: this.panY };
    const { left, top } = automapOrigin(center, cellSize, mapWidth, mapHeight, { w: W, h: H }, this.follow);

    const point = (x: number, y: number) => [left + x * cellSize, top + y * cellSize] as const;
    const cellAt = (x: number, y: number) => map.legend[map.grid[y]?.[x] ?? ''];

    g.save();
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);

    const exits: [number, number][] = [];
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (!visited.has(y * mapWidth + x)) continue;
        const cell = cellAt(x, y);
        if (!cell) continue;
        const [px, py] = point(x, y);
        if (px > W || py > H || px + cellSize < 0 || py + cellSize < 0) continue;
        const secretHidden = cell.kind === 'door' && cell.secret &&
          !secretDoorRevealed(cell.doorId ?? '');

        if (secretHidden || cell.kind === 'wall') {
          g.fillStyle = '#33200f';
          g.fillRect(px, py, cellSize, cellSize);
          continue;
        }
        const icon = automapCellIcon(cell);
        if (icon === 'exit') {
          paintExit(g, px, py, cellSize);
          exits.push([px + cellSize / 2, py + cellSize / 2]);
          continue;
        }
        if (icon === 'door' || icon === 'locked') {
          // dark floor under the icon so the slab reads as a door in a gap
          g.fillStyle = '#171a1d';
          g.fillRect(px, py, cellSize, cellSize);
          const fill = automapDoorStyle(cell).fill;
          if (icon === 'locked') paintLocked(g, px, py, cellSize, fill);
          else paintDoor(g, px, py, cellSize, fill, doorAxis((nx, ny) => cellAt(nx, ny)?.kind === 'wall', x, y));
          continue;
        }
        g.fillStyle = '#171a1d';
        g.fillRect(px, py, cellSize, cellSize);
        g.strokeStyle = '#c8502e';
        g.lineWidth = 1.5;
        const edges: [number, number, number, number, number, number][] = [
          [x, y - 1, px, py, px + cellSize, py],
          [x + 1, y, px + cellSize, py, px + cellSize, py + cellSize],
          [x, y + 1, px, py + cellSize, px + cellSize, py + cellSize],
          [x - 1, y, px, py, px, py + cellSize],
        ];
        for (const [nx, ny, x1, y1, x2, y2] of edges) {
          if (cellAt(nx, ny)?.kind !== 'wall') continue;
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.stroke();
        }
      }
    }

    // Mark visited exits with an EX tag when cellSize allows.
    for (const [ex, ey] of exits) {
      if (cellSize >= 5) {
        drawText(g, 'E', ex - 2, ey - 3, '#051d0b', 'tiny');
      }
    }

    // Objective targets: a cyan diamond on explored tiles; outside explored
    // space a cyan arrow on the frame border pointing their way (direction
    // only, never the spot). Every target of the overlay is treated the same,
    // so the markers stay as verdict-neutral as lookalikeTargets made them.
    const legend = automapLegendEntries(map);
    const legendBox = legendGeometry(legend, W, headerH);
    const markers = partitionObjectivePoints(overlay?.objectivePoints ?? [], visited, mapWidth);
    for (const pt of markers.explored) {
      const [ox, oy] = point(pt.x, pt.y);
      if (ox < -6 || ox > W + 6 || oy < -6 || oy > H + 6) continue;
      paintObjectiveDiamond(g, ox, oy, Math.max(2.5, Math.min(4.5, cellSize * 0.36)));
    }
    const [cx, cy] = point(player.x, player.y);
    const frame = { left: ARROW_INSET, top: headerH + ARROW_INSET, right: W - ARROW_INSET, bottom: H - FOOTER_H - ARROW_INSET };
    const box = { left: legendBox.x, top: legendBox.y, right: legendBox.x + legendBox.w, bottom: legendBox.y + legendBox.h };
    for (const pt of markers.unexplored) {
      const [tx, ty] = point(pt.x, pt.y);
      const arrow = edgeArrow({ x: cx + cellSize / 2, y: cy + cellSize / 2 }, { x: tx, y: ty }, frame);
      if (arrow) paintObjectiveArrow(g, avoidBox(arrow, box, frame));
    }

    const centerX = cx + cellSize / 2;
    const centerY = cy + cellSize / 2;
    const tipX = centerX + Math.cos(player.angle) * cellSize * 0.42;
    const tipY = centerY + Math.sin(player.angle) * cellSize * 0.42;
    const backX = centerX - Math.cos(player.angle) * cellSize * 0.3;
    const backY = centerY - Math.sin(player.angle) * cellSize * 0.3;
    const sideX = Math.sin(player.angle) * cellSize * 0.25;
    const sideY = -Math.cos(player.angle) * cellSize * 0.25;
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(backX + sideX, backY + sideY);
    g.lineTo(backX - sideX, backY - sideY);
    g.closePath();
    g.fill();

    // Top bar: mission label on left, secrets counter on right.
    const secretsText = overlay?.secretsTotal !== undefined
      ? `SECRETS ${overlay.secrets ?? 0}/${overlay.secretsTotal}`
      : undefined;
    if (label || secretsText || overlay?.objectiveText) {
      g.fillStyle = 'rgba(0,0,0,0.78)';
      g.fillRect(0, 0, W, headerH);
      if (label) {
        drawText(g, label, 4, 3, '#ffd040', 'small', '#000');
      }
      if (secretsText) {
        const sw = measureText(secretsText, 'small');
        drawText(g, secretsText, W - sw - 4, 3, '#7df5a2', 'small', '#000');
      }
      if (overlay?.objectiveText) {
        let objLine = `OBJ: ${overlay.objectiveText}`;
        while (objLine.length > 8 && measureText(`${objLine}…`, 'tiny') > W - 8) {
          objLine = objLine.slice(0, -1);
        }
        if (objLine.length < `OBJ: ${overlay.objectiveText}`.length) objLine += '…';
        drawText(g, objLine, 4, 12, '#4de8ff', 'tiny', '#000');
      }
    }

    // Compact legend box tucked into the top-right below the header.
    const { x: boxX, y: boxY, w: boxW, h: boxH } = legendBox;
    g.fillStyle = 'rgba(0,0,0,0.76)';
    g.fillRect(boxX, boxY, boxW, boxH);
    g.strokeStyle = 'rgba(255,208,64,0.35)';
    g.lineWidth = 0.75;
    g.strokeRect(boxX, boxY, boxW, boxH);
    for (let i = 0; i < legend.length; i++) {
      const entry = legend[i];
      const ry = boxY + 2 + i * LEGEND_ROW_H;
      paintLegendIcon(g, entry.icon, boxX + 3, ry + 1, entry.color);
      drawText(g, entry.label, boxX + 11, ry + 1, '#e6e8ec', 'tiny', '#000');
    }

    g.fillStyle = 'rgba(0,0,0,0.8)';
    g.fillRect(0, H - 16, W, 14);
    // Footer must never clip: pick the font that fits, ellipsize as last
    // resort. The pan/follow state is a G-key chip instead of a bare word so
    // the hint's own 'G FOLLOW' tail isn't duplicated.
    const base = MAP_HINT.replace('G FOLLOW - ', '');
    let hint = `${base} · G:${this.follow ? 'FOLLOW' : 'PAN'}`;
    const font = measureText(hint, 'small') <= W - 8 ? 'small' : 'tiny';
    while (hint.length > 4 && measureText(`${hint}…`, font) > W - 8) hint = hint.slice(0, -1);
    if (hint.length < `${base} · G:${this.follow ? 'FOLLOW' : 'PAN'}`.length) hint += '…';
    drawText(g, hint, 4, H - 14, '#ffd040', font, '#000');
    g.restore();
  }
}
