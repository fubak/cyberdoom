import { RES } from '../render/res';
import type { PlateRect } from './overlayArt';

/**
 * LOOK: opaque panel art shared by the objective strip, the TAB objectives
 * overlay and the automap chrome (header, footer, legend). Like overlayArt,
 * every painter stays inside the rect it is given.
 */

/** One native pixel in base units. */
const U = 1 / RES;

export interface Trim {
  /** Trim body colour and its lit edge. */
  color: string;
  light: string;
}

export const TRIM_AMBER: Trim = { color: '#a87a10', light: '#ffd040' };
export const TRIM_GREEN: Trim = { color: '#14a024', light: '#5aff6a' };
export const TRIM_RED: Trim = { color: '#a80c06', light: '#ff5a3a' };

/** Band body, top to bottom: three near-black steel steps. */
export const BAND_STEPS = ['#0d1016', '#090b10', '#05070a'] as const;

/**
 * Full-width band (strip, header or footer): stepped near-black body with
 * scanlines and a one-unit trim on the edge that faces the 3D view, lit on
 * its inner side. `opacity` below 1 lets the map show through faintly.
 */
export function drawBand(
  g: CanvasRenderingContext2D,
  r: PlateRect,
  trim: Trim,
  edge: 'top' | 'bottom' = 'bottom',
  opacity = 1,
): void {
  if (r.w <= 0 || r.h <= 0) return;
  const prev = g.globalAlpha;
  g.globalAlpha = prev * opacity;
  const step = r.h / BAND_STEPS.length;
  BAND_STEPS.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(r.x, r.y + i * step, r.w, step);
  });
  g.globalAlpha = prev;
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let sy = r.y + U; sy < r.y + r.h - U / 2; sy += 2 * U) g.fillRect(r.x, sy, r.w, U);
  const ty = edge === 'bottom' ? r.y + r.h - 1 : r.y;
  g.fillStyle = trim.color;
  g.fillRect(r.x, ty, r.w, 1);
  g.fillStyle = trim.light;
  g.fillRect(r.x, edge === 'bottom' ? ty : ty + 1 - U, r.w, U);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(r.x, edge === 'bottom' ? ty + 1 - U : ty, r.w, U);
}

/** Lamp ramps: dark base, body, lit. */
export const LAMP = {
  open: ['#7a5a08', '#ffd040', '#fff4b0'],
  done: ['#0a6a18', '#2ad83a', '#c8ffd0'],
  failed: ['#6a0c06', '#e01e10', '#ffb0a0'],
} as const;

export type LampState = keyof typeof LAMP;

/**
 * Square status lamp of side `size`: black housing, lit lens with a specular
 * corner and a shaded lower third.
 */
export function drawLamp(g: CanvasRenderingContext2D, x: number, y: number, size: number, state: LampState): void {
  const [dark, body, lit] = LAMP[state];
  const inner = size - 2;
  g.fillStyle = '#000';
  g.fillRect(x, y, size, size);
  g.fillStyle = body;
  g.fillRect(x + 1, y + 1, inner, inner);
  g.fillStyle = dark;
  g.fillRect(x + 1, y + 1 + inner * 0.68, inner, inner * 0.32);
  g.fillStyle = lit;
  g.fillRect(x + 1, y + 1, inner, U);
  g.fillRect(x + 1 + U, y + 1 + 2 * U, inner * 0.35, inner * 0.25);
}

/**
 * Boxed panel (the automap legend): dark glass with scanlines, a lit trim
 * along the top, dim side and bottom keylines and steel corner ticks.
 */
export function drawPanel(g: CanvasRenderingContext2D, r: PlateRect, trim: Trim): void {
  if (r.w <= 0 || r.h <= 0) return;
  g.fillStyle = 'rgba(4,6,10,0.86)';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let sy = r.y + 3 * U; sy < r.y + r.h - U / 2; sy += 2 * U) g.fillRect(r.x, sy, r.w, U);
  g.fillStyle = trim.color;
  g.fillRect(r.x, r.y, r.w, 2 * U);
  g.fillStyle = trim.light;
  g.fillRect(r.x, r.y, r.w, U);
  g.fillStyle = 'rgba(255,208,64,0.28)';
  g.fillRect(r.x, r.y + 2 * U, U, r.h - 2 * U);
  g.fillRect(r.x + r.w - U, r.y + 2 * U, U, r.h - 2 * U);
  g.fillRect(r.x, r.y + r.h - U, r.w, U);
  g.fillStyle = '#9aa0ac';
  const tick = Math.min(2, r.w / 2);
  g.fillRect(r.x, r.y + r.h - U, tick, U);
  g.fillRect(r.x + r.w - tick, r.y + r.h - U, tick, U);
}
