import type { Entity } from '../core/types';
import type { WorldMap } from './map';

/**
 * Edge-triggered exit detection: emit reach-exit when the player steps ONTO an
 * exit cell (not while standing on it, and again after leaving and returning).
 */
export function exitEdge(wasOnExit: boolean, onExit: boolean, finished: boolean): boolean {
  return onExit && !wasOnExit && !finished;
}

/**
 * Nearest alive enemy standing in the aim corridor while a workstation/console
 * lies beyond it on the same ray — i.e. the enemy is blocking the educational
 * target (inspect/patch/scan reads as a silent miss otherwise).
 */
export function enemyInTheWay(
  entities: Entity[],
  px: number,
  py: number,
  angle: number,
  map: WorldMap,
  range = 1.8,
): Entity | null {
  let enemy: Entity | null = null;
  let enemyDist = range;
  for (const e of entities) {
    if (!e.alive || e.def.kind !== 'enemy') continue;
    const dx = e.x - px;
    const dy = e.y - py;
    const d = Math.hypot(dx, dy);
    if (d >= enemyDist) continue;
    const da = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
    if (Math.abs(da) > 0.5) continue;
    if (map.raycast(px, py, angle, d).dist < d - 0.3) continue;
    enemy = e;
    enemyDist = d;
  }
  if (!enemy) return null;
  // A workstation or console just beyond the enemy on the same ray means it
  // is genuinely in the way of that target.
  for (const e of entities) {
    if (!e.alive || e === enemy) continue;
    if (e.def.kind !== 'workstation' && e.def.kind !== 'console') continue;
    const dx = e.x - px;
    const dy = e.y - py;
    const d = Math.hypot(dx, dy);
    if (d <= enemyDist || d > enemyDist + 1.4) continue;
    const da = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
    if (Math.abs(da) > 0.5) continue;
    if (map.raycast(px, py, angle, d).dist >= enemyDist - 0.3) return enemy;
  }
  return null;
}
