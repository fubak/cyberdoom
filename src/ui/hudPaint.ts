import { drawText, measureText } from '../render/font';
import { alertView, edgeBand, edgeIndicator, type DamageAlertState } from './damageAlert';
import { slotBoxRect, SLOT_H, SLOT_W, type SlotCell } from './slotStrip';

/**
 * Canvas painters for the Phase C HUD pieces. Geometry and state come from
 * the pure, unit-tested modules (slotStrip, damageAlert); these only draw.
 */

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
