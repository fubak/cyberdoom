import type { MapDef } from '../core/types';
import { drawText, measureText } from '../render/font';
import { roleColor } from '../render/textures';
import { VIEW3D_H, VIEW_W } from '../render/renderer';
import { RES } from '../render/res';
import { MAP_HINT } from './nav';

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
}

export function automapDoorStyle(cell: { locked?: boolean; accessRole?: string }): { fill: string; lockedBorder: boolean } {
  if (cell.accessRole) {
    return { fill: roleColor(cell.accessRole).light, lockedBorder: !!cell.locked };
  }
  return { fill: cell.locked ? '#d63025' : '#d9b83f', lockedBorder: false };
}

export function automapLegendEntries(map: MapDef): AutomapLegendEntry[] {
  const entries: AutomapLegendEntry[] = [
    { label: 'YOU', color: '#ffffff', kind: 'player' },
    { label: 'EXIT', color: '#32d45a', kind: 'exit' },
    { label: 'OBJ', color: '#4de8ff', kind: 'objective' },
  ];
  const roles = new Set<string>();
  let hasStandardDoor = false;
  let hasLockedDoor = false;
  for (const cell of Object.values(map.legend)) {
    if (cell.kind !== 'door' || cell.secret) continue;
    if (cell.accessRole) roles.add(cell.accessRole);
    else if (cell.locked) hasLockedDoor = true;
    else hasStandardDoor = true;
  }
  if (hasStandardDoor) entries.push({ label: 'DOOR', color: '#d9b83f', kind: 'door' });
  if (hasLockedDoor) entries.push({ label: 'LOCK', color: '#d63025', kind: 'locked' });
  for (const role of [...roles].sort()) {
    entries.push({ label: role.toUpperCase().slice(0, 7), color: roleColor(role).light, kind: 'role' });
  }
  return entries;
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

  zoomBy(dir: number): void {
    this.zoom = Math.min(4, Math.max(0.4, this.zoom * (dir > 0 ? 1.25 : 0.8)));
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
    visited: Set<string>,
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

    // Fill ~80% of the view at zoom 1; the centre is the player in follow
    // mode or the free-pan point otherwise, clamped so the map covers the
    // screen rather than floating in a black void.
    const cellSize = Math.max((W * 0.8) / mapWidth, (H * 0.8) / mapHeight) * this.zoom;
    const mapPixW = mapWidth * cellSize;
    const mapPixH = mapHeight * cellSize;
    const center = this.follow ? player : { x: this.panX, y: this.panY };
    let left = W / 2 - center.x * cellSize;
    let top = H / 2 - center.y * cellSize;
    if (mapPixW <= W) left = (W - mapPixW) / 2;
    else left = Math.min(0, Math.max(W - mapPixW, left));
    if (mapPixH <= H) top = (H - mapPixH) / 2;
    else top = Math.min(0, Math.max(H - mapPixH, top));

    const point = (x: number, y: number) => [left + x * cellSize, top + y * cellSize] as const;
    const cellAt = (x: number, y: number) => map.legend[map.grid[y]?.[x] ?? ''];

    g.save();
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);

    const exits: [number, number][] = [];
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (!visited.has(`${x},${y}`)) continue;
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
        if (cell.kind === 'exit') {
          g.fillStyle = '#32d45a';
          g.fillRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
          g.strokeStyle = '#d8ffe2';
          g.lineWidth = 1;
          g.strokeRect(px + 1, py + 1, Math.max(1, cellSize - 2), Math.max(1, cellSize - 2));
          exits.push([px + cellSize / 2, py + cellSize / 2]);
          continue;
        }
        if (cell.kind === 'door') {
          const style = automapDoorStyle(cell);
          g.fillStyle = style.fill;
          const dx = px + cellSize * 0.18;
          const dy = py + cellSize * 0.18;
          const dw = cellSize * 0.64;
          g.fillRect(dx, dy, dw, dw);
          if (style.lockedBorder) {
            g.strokeStyle = '#d63025';
            g.lineWidth = 1;
            g.strokeRect(dx, dy, dw, dw);
          }
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

    // Mark current objective target(s) as cyan diamond beacons.
    for (const pt of overlay?.objectivePoints ?? []) {
      const [ox, oy] = point(pt.x, pt.y);
      if (ox < -6 || ox > W + 6 || oy < -6 || oy > H + 6) continue;
      const r = Math.max(2.5, Math.min(4.5, cellSize * 0.36));
      g.strokeStyle = '#4de8ff';
      g.fillStyle = 'rgba(77,232,255,0.28)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ox, oy - r);
      g.lineTo(ox + r, oy);
      g.lineTo(ox, oy + r);
      g.lineTo(ox - r, oy);
      g.closePath();
      g.fill();
      g.stroke();
    }

    const [cx, cy] = point(player.x, player.y);
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
    const headerH = overlay?.objectiveText ? 19 : 11;
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
    const legend = automapLegendEntries(map);
    const rowH = 7;
    const boxW = Math.max(...legend.map((e) => measureText(e.label, 'tiny'))) + 13;
    const boxH = legend.length * rowH + 4;
    const boxX = W - boxW - 3;
    const boxY = headerH + 3;
    g.fillStyle = 'rgba(0,0,0,0.76)';
    g.fillRect(boxX, boxY, boxW, boxH);
    g.strokeStyle = 'rgba(255,208,64,0.35)';
    g.lineWidth = 0.75;
    g.strokeRect(boxX, boxY, boxW, boxH);
    for (let i = 0; i < legend.length; i++) {
      const entry = legend[i];
      const ry = boxY + 2 + i * rowH;
      g.fillStyle = entry.color;
      if (entry.kind === 'objective') {
        g.beginPath();
        g.moveTo(boxX + 5, ry + 1);
        g.lineTo(boxX + 7, ry + 3);
        g.lineTo(boxX + 5, ry + 5);
        g.lineTo(boxX + 3, ry + 3);
        g.closePath();
        g.fill();
      } else {
        g.fillRect(boxX + 3, ry + 1, 4, 4);
      }
      drawText(g, entry.label, boxX + 9, ry + 1, '#e6e8ec', 'tiny', '#000');
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
