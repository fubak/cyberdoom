import { drawText, measureText } from '../render/font';
import { BASE_W, RES } from '../render/res';
import type { PlateRect } from './overlayArt';

/**
 * LOOK: boss encounter health bar at the top centre of the 3D view: a glass
 * panel with a coloured trim and steel corner brackets, the boss name and hit
 * points, a recessed trough with a banded health fill and phase dividers, and
 * an optional telegraph or phase line underneath.
 */

const U = 1 / RES;

export interface BossBarInput {
  name: string;
  hp: number;
  maxHp: number;
  phase?: number;
  phaseCount?: number;
  phaseLabel?: string;
  telegraph?: string | null;
}

/**
 * A boss shows its bar once the fight is on: it has seen the player or taken
 * a hit. (The bar used to wait for a flag the AI never set, so it never showed.)
 */
export function bossEngaged(state: Readonly<Record<string, unknown>>): boolean {
  return state.sighted === true || state.aggroed === true;
}

export const BOSS_BAR_W = 164;
export const BOSS_BAR_H = 6;
/** Below the pinned objective and a full three-row ticker (which end at y 30). */
export const BOSS_BAR_Y = 42;
const PAD_X = 3;
const HEAD_H = 9;

/** Fill ramps: dark base, body, lit band, specular. */
export const BOSS_FILL = {
  normal: ['#7a1410', '#e03028', '#ff7a68', '#ffd8d0'],
  low: ['#8a4a08', '#ff9820', '#ffc468', '#fff0c8'],
  final: ['#5a1880', '#c840ff', '#e89aff', '#f8e0ff'],
} as const;

export interface BossBarLayout {
  /** Glass panel behind everything. */
  box: PlateRect;
  /** Health trough (the fill grows from its left edge). */
  bar: PlateRect;
  fillW: number;
  ramp: readonly string[];
  /** x of each phase divider. */
  dividers: number[];
  label: string;
  sub: string | null;
  alert: boolean;
}

export function bossBarLayout(boss: BossBarInput): BossBarLayout {
  const x = Math.round((BASE_W - BOSS_BAR_W) / 2);
  const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const phase = boss.phase ?? 1;
  const phaseCount = Math.max(1, boss.phaseCount ?? 1);
  const alert = typeof boss.telegraph === 'string' && boss.telegraph.length > 0;
  const phaseLabel = typeof boss.phaseLabel === 'string' && boss.phaseLabel.length > 0 ? boss.phaseLabel : null;
  const sub = alert ? `! ${(boss.telegraph as string).toUpperCase()} !` : phaseLabel ? phaseLabel.toUpperCase() : null;
  const phaseTag = phaseCount > 1 ? ` P${phase}/${phaseCount}` : '';
  const dividers = Array.from({ length: phaseCount - 1 }, (_, i) => x + Math.round((BOSS_BAR_W * (i + 1)) / phaseCount));
  return {
    box: { x: x - PAD_X, y: BOSS_BAR_Y - HEAD_H, w: BOSS_BAR_W + PAD_X * 2, h: BOSS_BAR_H + (sub ? 21 : 13) },
    bar: { x, y: BOSS_BAR_Y, w: BOSS_BAR_W, h: BOSS_BAR_H },
    fillW: Math.round(BOSS_BAR_W * frac),
    ramp: phase >= 3 ? BOSS_FILL.final : frac > 0.35 ? BOSS_FILL.normal : BOSS_FILL.low,
    dividers,
    label: `${boss.name.toUpperCase()}${phaseTag}  ${Math.ceil(boss.hp)}/${Math.ceil(boss.maxHp)}`,
    sub,
    alert,
  };
}

/** Text y for the damage alert while the bar is up: two units under the panel. */
export function bossAlertY(boss: BossBarInput): number {
  const { box } = bossBarLayout(boss);
  return box.y + box.h + 3;
}

function paintPanel(g: CanvasRenderingContext2D, r: PlateRect, alert: boolean): void {
  g.fillStyle = 'rgba(10,12,18,0.88)';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let sy = r.y + 1 + 2 * U; sy < r.y + r.h - U / 2; sy += 2 * U) g.fillRect(r.x, sy, r.w, U);
  // trim: one unit of colour with a lit upper half
  g.fillStyle = alert ? '#c88410' : '#a82430';
  g.fillRect(r.x, r.y, r.w, 1);
  g.fillStyle = alert ? '#ffd65a' : '#ff6858';
  g.fillRect(r.x, r.y, r.w, 2 * U);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(r.x, r.y + r.h - U, r.w, U);
  // steel brackets on the two lower corners
  g.fillStyle = '#8a909c';
  for (const bx of [r.x, r.x + r.w - 4]) g.fillRect(bx, r.y + r.h - 2 * U, 4, U);
  g.fillRect(r.x, r.y + r.h - 3, U, 3 - U);
  g.fillRect(r.x + r.w - U, r.y + r.h - 3, U, 3 - U);
}

function paintTrough(g: CanvasRenderingContext2D, b: PlateRect): void {
  // recessed: dark upper lip, lit lower lip
  g.fillStyle = '#000';
  g.fillRect(b.x - 2 * U, b.y - 2 * U, b.w + 4 * U, b.h + 4 * U);
  g.fillStyle = '#6a707c';
  g.fillRect(b.x - 2 * U, b.y + b.h + U, b.w + 4 * U, U);
  g.fillRect(b.x + b.w + U, b.y - U, U, b.h + 2 * U);
  g.fillStyle = '#241418';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(b.x, b.y, b.w, 2 * U);
}

function paintFill(g: CanvasRenderingContext2D, b: PlateRect, w: number, ramp: readonly string[]): void {
  if (w <= 0) return;
  g.fillStyle = ramp[1];
  g.fillRect(b.x, b.y, w, b.h);
  g.fillStyle = ramp[2];
  g.fillRect(b.x, b.y + 2 * U, w, 1.5);
  g.fillStyle = ramp[3];
  g.fillRect(b.x, b.y + 3 * U, w, U);
  g.fillStyle = ramp[0];
  g.fillRect(b.x, b.y + b.h - 1.5, w, 1.5);
  // cell ticks, then a hot leading edge
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (let tx = b.x + 4; tx < b.x + w; tx += 4) g.fillRect(tx - U, b.y, U, b.h);
  g.fillStyle = ramp[3];
  g.fillRect(b.x + w - Math.min(w, 2 * U), b.y, Math.min(w, 2 * U), b.h);
}

export function drawBossBar(g: CanvasRenderingContext2D, boss: BossBarInput): void {
  const l = bossBarLayout(boss);
  const centre = (text: string): number => Math.round(BASE_W / 2 - measureText(text, 'tiny') / 2);
  paintPanel(g, l.box, l.alert);
  drawText(g, l.label, centre(l.label), l.bar.y - 7, l.alert ? '#ffd65a' : '#ff6858', 'tiny', null);
  paintTrough(g, l.bar);
  paintFill(g, l.bar, l.fillW, l.ramp);
  // phase thresholds, so players anticipate phase shifts
  for (const dx of l.dividers) {
    g.fillStyle = '#0a0c12';
    g.fillRect(dx, l.bar.y, 1, l.bar.h);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(dx + 1, l.bar.y, U, l.bar.h);
  }
  if (l.sub) drawText(g, l.sub, centre(l.sub), l.bar.y + l.bar.h + 2, l.alert ? '#ffe066' : '#b8b8c8', 'tiny', null);
}
