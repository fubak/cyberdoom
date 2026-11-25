import { drawText, measureText } from '../render/font';
import { alertView, edgeBand, edgeIndicator, type DamageAlertState } from './damageAlert';
import { RES } from '../render/res';
import { slotBoxRect, SLOT_H, SLOT_W, type SlotCell } from './slotStrip';

/**
 * Canvas painters for the Phase C HUD pieces. Geometry and state come from
 * the pure, unit-tested modules (slotStrip, damageAlert); these only draw.
 */

/** One native pixel in base units. */
const U = 1 / RES;

export const LAMP_W = 20;
export const LAMP_H = 12;

/**
 * READY/BUSY lamp for tools with no ammo count: a housed indicator with a
 * lit lens, a specular bar and a dark lower half. Green = ready, amber = busy.
 */
export function drawStatusLamp(g: CanvasRenderingContext2D, x: number, y: number, ready: boolean): void {
  const lens = ready ? ['#0a5a18', '#18b030', '#5aff78', '#d8ffe0'] : ['#4a3004', '#b87810', '#ffc040', '#fff0c0'];
  // glow on the glass around the housing
  g.fillStyle = ready ? 'rgba(40,220,90,0.07)' : 'rgba(255,170,40,0.07)';
  for (const d of [3, 2, 1]) g.fillRect(x - d * 1.5, y - d, LAMP_W + d * 3, LAMP_H + d * 2);
  // housing: keyline, steel rim lit from the top
  g.fillStyle = '#000';
  g.fillRect(x, y, LAMP_W, LAMP_H);
  g.fillStyle = '#5a606c';
  g.fillRect(x + U, y + U, LAMP_W - 2 * U, LAMP_H - 2 * U);
  g.fillStyle = '#b4bac6';
  g.fillRect(x + U, y + U, LAMP_W - 2 * U, U);
  g.fillStyle = '#0a0b0e';
  g.fillRect(x + 1, y + 1, LAMP_W - 2, LAMP_H - 2);
  // lens: dark base, lit body, hot upper band, specular bar
  g.fillStyle = lens[0];
  g.fillRect(x + 1 + U, y + 1 + U, LAMP_W - 2 - 2 * U, LAMP_H - 2 - 2 * U);
  g.fillStyle = lens[1];
  g.fillRect(x + 1 + U, y + 1 + U, LAMP_W - 2 - 2 * U, LAMP_H - 5);
  g.fillStyle = lens[2];
  g.fillRect(x + 2, y + 2, LAMP_W - 4, 3);
  g.fillStyle = lens[3];
  g.fillRect(x + 2.5, y + 2.25, LAMP_W - 9, 2 * U);
  g.fillRect(x + LAMP_W - 5, y + 2.25, 2, 2 * U);
  // ribs across the lens
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let rx = x + 5; rx < x + LAMP_W - 2; rx += 4) g.fillRect(rx, y + 1 + U, U, LAMP_H - 2 - 2 * U);
}

/**
 * Keycard under the BADGE caption: a lit white card with a lanyard slot, a
 * role-coloured header band, a photo, a gold chip and two text rules.
 */
export function drawKeycard(g: CanvasRenderingContext2D, x: number, y: number, stripe: string, light: string): void {
  const W = 16;
  const H = 12;
  g.fillStyle = 'rgba(0,0,0,0.7)';
  g.fillRect(x + 1, y + 1, W, H);
  g.fillStyle = '#7a8090';
  g.fillRect(x, y, W, H);
  g.fillStyle = '#e4e8ee';
  g.fillRect(x, y, W - U, H - U);
  g.fillStyle = '#ffffff';
  g.fillRect(x, y, W - U, U);
  g.fillRect(x, y, U, H - U);
  // lanyard slot
  g.fillStyle = '#2a2e36';
  g.fillRect(x + 6, y + 0.5, 4, 0.75);
  // header band in the role colour
  g.fillStyle = stripe;
  g.fillRect(x, y + 2, W - U, 3);
  g.fillStyle = light;
  g.fillRect(x, y + 2, W - U, 1);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x, y + 5 - U, W - U, U);
  // photo: backing, head and shoulders
  g.fillStyle = '#8a94a8';
  g.fillRect(x + 2, y + 6, 5, 5);
  g.fillStyle = '#c8d0dc';
  g.fillRect(x + 2, y + 6, 5, U);
  g.fillStyle = '#3a4250';
  g.fillRect(x + 3.5, y + 7, 2, 2);
  g.fillRect(x + 2.75, y + 9.25, 3.5, 1.75);
  // chip
  g.fillStyle = '#b88a18';
  g.fillRect(x + 9, y + 6, 4, 2.5);
  g.fillStyle = '#ffe08a';
  g.fillRect(x + 9, y + 6, 4, U);
  g.fillStyle = '#7a5a10';
  g.fillRect(x + 11 - U, y + 6, U, 2.5);
  g.fillRect(x + 9, y + 7.25, 4, U);
  // text rules
  g.fillStyle = '#3a404c';
  g.fillRect(x + 9, y + 9.5, 5, 0.5);
  g.fillRect(x + 9, y + 10.5, 4, 0.5);
}

/** Slot wells, highlight boxes and passive foot stripes (drawn under the digits). */
export function drawSlotWells(g: CanvasRenderingContext2D, cells: readonly SlotCell[]): void {
  for (const c of cells) {
    if (c.box) {
      const b = slotBoxRect(c);
      g.fillStyle = c.box;
      g.fillRect(b.x, b.y, b.w, 1);
      g.fillRect(b.x, b.y + b.h - 1, b.w, 1);
      g.fillRect(b.x, b.y, 1, b.h);
      g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    }
    g.fillStyle = c.well;
    g.fillRect(c.x, c.y, SLOT_W, SLOT_H);
    g.fillStyle = c.bevel;
    g.fillRect(c.x, c.y, SLOT_W, 1);
    // native-resolution depth: a shadow under the bevel and a lit bottom lip
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(c.x, c.y + 1, SLOT_W, U);
    g.fillRect(c.x, c.y + 1, U, SLOT_H - 1);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(c.x + U, c.y + SLOT_H - U, SLOT_W - U, U);
    if (c.foot) {
      g.fillStyle = c.foot;
      g.fillRect(c.x + 1, c.y + SLOT_H - 1, SLOT_W - 2, 1);
    }
  }
}

/** Strike mark through the digit of every slot whose tool is not owned (drawn over the digits). */
export function drawSlotStrikes(g: CanvasRenderingContext2D, cells: readonly SlotCell[]): void {
  for (const c of cells) {
    if (!c.strike) continue;
    g.fillStyle = c.strike;
    g.fillRect(c.x + 1, c.y + 4, SLOT_W - 2, 1);
  }
}

const EDGE_RGB = '255,48,24';
/** The alert sits under the top-left ticker block and above the aim point. */
const ALERT_Y = 34;

/**
 * Directional hurt tint on the attacker's side of the 3D view plus the timed
 * "SOURCE - N TILES BEARING" alert. Both are steady while damage continues
 * and fade out afterwards (no strobing; see damageAlert.ts).
 */
export function drawDamageOverlay(
  g: CanvasRenderingContext2D,
  s: DamageAlertState | null,
  now: number,
  reducedFlash: boolean,
  viewW: number,
  viewH: number,
): void {
  const edge = edgeIndicator(s, now, reducedFlash);
  if (edge) {
    const b = edgeBand(edge.bearing, viewW, viewH);
    const horizontal = edge.bearing === 'LEFT' || edge.bearing === 'RIGHT';
    const fromStart = edge.bearing === 'LEFT' || edge.bearing === 'AHEAD';
    const grad = horizontal
      ? g.createLinearGradient(b.x, 0, b.x + b.w, 0)
      : g.createLinearGradient(0, b.y, 0, b.y + b.h);
    const strong = `rgba(${EDGE_RGB},${edge.alpha.toFixed(3)})`;
    const clear = `rgba(${EDGE_RGB},0)`;
    grad.addColorStop(0, fromStart ? strong : clear);
    grad.addColorStop(1, fromStart ? clear : strong);
    g.fillStyle = grad;
    g.fillRect(b.x, b.y, b.w, b.h);
  }
  const alert = alertView(s, now);
  if (!alert) return;
  const font = measureText(alert.text, 'small') <= viewW - 16 ? 'small' : 'tiny';
  const w = measureText(alert.text, font);
  const h = font === 'small' ? 9 : 7;
  const x = Math.round((viewW - w) / 2);
  g.save();
  g.globalAlpha = alert.alpha;
  g.fillStyle = 'rgba(40,4,2,0.82)';
  g.fillRect(x - 4, ALERT_Y - 1, w + 8, h);
  g.fillStyle = '#ff4a2a';
  g.fillRect(x - 4, ALERT_Y - 1, 2, h);
  drawText(g, alert.text, x, ALERT_Y, '#ffd0c0', font, null);
  g.restore();
}
