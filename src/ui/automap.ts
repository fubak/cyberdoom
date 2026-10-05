import type { MapDef } from '../core/types';
import { roleColor } from '../render/textures';
import { VIEW3D_H, VIEW_W } from '../render/renderer';
import { RES } from '../render/res';

export class Automap {
  private readonly context: CanvasRenderingContext2D;
  private open = false;

  constructor(canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  draw(
    map: MapDef,
    visited: Set<string>,
    player: { x: number; y: number; angle: number },
    secretDoorRevealed: (doorId: string) => boolean,
  ): void {
    if (!this.open) return;
    const g = this.context;
    const mapHeight = map.grid.length;
    const mapWidth = map.grid[0]?.length ?? 0;
    if (!mapWidth || !mapHeight) return;

    const W = VIEW_W / RES;
    const H = VIEW3D_H / RES;
    const cellSize = Math.min(5, (W - 12) / mapWidth, (H - 12) / mapHeight);
    const left = (W - mapWidth * cellSize) / 2;
    const top = (H - mapHeight * cellSize) / 2;
    const point = (x: number, y: number) => [left + x * cellSize, top + y * cellSize] as const;
    const cellAt = (x: number, y: number) => map.legend[map.grid[y]?.[x] ?? ''];

    g.save();
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (!visited.has(`${x},${y}`)) continue;
        const cell = cellAt(x, y);
        if (!cell) continue;
        const [px, py] = point(x, y);
        const secretHidden = cell.kind === 'door' && cell.secret &&
          !secretDoorRevealed(cell.doorId ?? '');

        if (secretHidden || cell.kind === 'wall') {
          g.fillStyle = '#29170f';
          g.fillRect(px, py, cellSize, cellSize);
          continue;
        }
        if (cell.kind === 'exit') {
          g.fillStyle = '#32d45a';
          g.fillRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
          continue;
        }
        if (cell.kind === 'door') {
          g.fillStyle = cell.locked
            ? '#d63025'
            : cell.accessRole
              ? roleColor(cell.accessRole).light
              : '#d9b83f';
          g.fillRect(px + cellSize * 0.2, py + cellSize * 0.2, cellSize * 0.6, cellSize * 0.6);
          continue;
        }
        g.fillStyle = '#171a1d';
        g.fillRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
        g.strokeStyle = '#8c3825';
        g.lineWidth = 1;
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
    g.restore();
  }
}
