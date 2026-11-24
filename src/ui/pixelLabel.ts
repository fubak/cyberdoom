import { canDraw, drawChunky, measureChunky } from '../render/font';
import { RES } from '../render/res';

/**
 * Inline label in the game's chunky pixel face (the HUD/ticker font), drawn to
 * a canvas at an integer CSS scale with a screen-reader copy of the text.
 * Text the bitmap font cannot draw falls back to plain DOM text.
 */
const GLYPH_H = 8;

export function pixelLabel(text: string, ramp: string | string[], scale = 2, cls = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = `cd-pixel-label${cls ? ` ${cls}` : ''}`;
  const upper = text.toUpperCase();
  if (!canDraw(upper, 'small')) {
    span.textContent = text;
    return span;
  }
  const w = measureChunky(upper) + 2;
  const c = document.createElement('canvas');
  c.width = w * RES;
  c.height = GLYPH_H * RES;
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    g.setTransform(RES, 0, 0, RES, 0, 0);
    drawChunky(g, upper, 0, 0, ramp);
  }
  c.setAttribute('aria-hidden', 'true');
  c.style.width = `${w * scale}px`;
  c.style.height = `${GLYPH_H * scale}px`;
  const sr = document.createElement('span');
  sr.className = 'cd-sr-only';
  sr.textContent = text;
  span.append(c, sr);
  return span;
}
