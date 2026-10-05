/**
 * Original bitmap fonts for the HUD, ticker and texture lettering.
 * SMALL = 5x7 (6px advance), TINY = 3x5 (4px advance). Uppercase only, like
 * Doom's HUD font. Glyphs are cached per colour as tiny canvases.
 */

const SMALL: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
  "'": [12, 4, 8, 0, 0, 0, 0], '"': [10, 10, 10, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '+': [0, 4, 4, 31, 4, 4, 0], '/': [1, 1, 2, 4, 8, 16, 16], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '%': [24, 25, 2, 4, 8, 19, 3], '[': [14, 8, 8, 8, 8, 8, 14],
  ']': [14, 2, 2, 2, 2, 2, 14], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8],
  _: [0, 0, 0, 0, 0, 0, 31], '=': [0, 0, 31, 0, 31, 0, 0], '#': [10, 10, 31, 10, 31, 10, 10],
  '*': [0, 4, 21, 14, 21, 4, 0], '&': [12, 18, 20, 8, 21, 18, 13], '@': [14, 17, 1, 13, 21, 21, 14],
  $: [4, 15, 20, 14, 5, 30, 4], '✓': [0, 1, 2, 2, 20, 8, 0], '✗': [0, 17, 10, 4, 10, 17, 0],
  '·': [0, 0, 0, 12, 12, 0, 0], '→': [0, 4, 2, 31, 2, 4, 0], '∞': [0, 0, 10, 21, 10, 0, 0],
};

const TINY: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [6, 1, 2, 4, 7], '3': [6, 1, 2, 1, 6],
  '4': [5, 5, 7, 1, 1], '5': [7, 4, 6, 1, 6], '6': [3, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 6],
  '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0], '-': [0, 0, 7, 0, 0],
  '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4], '%': [5, 1, 2, 4, 5], '!': [2, 2, 2, 0, 2],
  '?': [6, 1, 2, 0, 2], '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], "'": [2, 2, 0, 0, 0],
  '[': [3, 2, 2, 2, 3], ']': [6, 2, 2, 2, 6], '=': [0, 7, 0, 7, 0], '>': [4, 2, 1, 2, 4],
  '<': [1, 2, 4, 2, 1], '✓': [0, 1, 1, 6, 2], '✗': [0, 5, 2, 5, 0], '·': [0, 0, 2, 0, 0],
  '#': [5, 7, 5, 7, 5], '"': [5, 5, 0, 0, 0], '&': [2, 5, 2, 5, 3], '*': [0, 5, 2, 5, 0],
};

export type FontId = 'small' | 'tiny';

interface FontSpec {
  glyphs: Record<string, number[]>;
  w: number;
  h: number;
  adv: number;
}

const FONTS: Record<FontId, FontSpec> = {
  small: { glyphs: SMALL, w: 5, h: 7, adv: 6 },
  tiny: { glyphs: TINY, w: 3, h: 5, adv: 4 },
};

const ALIASES: Record<string, string> = { '—': '-', '–': '-', '…': '.', '’': "'", '‘': "'", '“': '"', '”': '"', '×': 'X' };

function norm(ch: string): string {
  const a = ALIASES[ch] ?? ch;
  return a.toUpperCase();
}

const cache = new Map<string, HTMLCanvasElement>();

function glyphCanvas(font: FontId, ch: string, color: string): HTMLCanvasElement | null {
  const spec = FONTS[font];
  const rows = spec.glyphs[ch];
  if (!rows) return null;
  const key = `${font}|${ch}|${color}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = spec.w;
  c.height = spec.h;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  rows.forEach((bits, y) => {
    for (let x = 0; x < spec.w; x++) if (bits & (1 << (spec.w - 1 - x))) g.fillRect(x, y, 1, 1);
  });
  cache.set(key, c);
  return c;
}

export function fontHeight(font: FontId): number {
  return FONTS[font].h;
}

export function measureText(text: string, font: FontId = 'small'): number {
  const n = [...text].length;
  return n === 0 ? 0 : n * FONTS[font].adv - 1;
}

/** Draw pixel text; returns the advance width. `shadow` draws a 1px drop shadow. */
export function drawText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: FontId = 'small',
  shadow: string | null = '#000',
): number {
  const spec = FONTS[font];
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const raw of text) {
    const ch = norm(raw);
    if (ch !== ' ') {
      if (shadow) {
        const s = glyphCanvas(font, ch, shadow);
        if (s) g.drawImage(s, cx + 1, cy + 1);
      }
      const gc = glyphCanvas(font, ch, color);
      if (gc) g.drawImage(gc, cx, cy);
    }
    cx += spec.adv;
  }
  return cx - Math.round(x);
}

/**
 * Big status-bar numerals: 5x7 glyphs at 2x with a vertical colour ramp
 * (top → bottom) and a dark bevel, Doom-status-bar style.
 */
export function drawBigText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  ramp: string[],
  shadow = '#120808',
): number {
  const spec = FONTS.small;
  let cx = Math.round(x);
  for (const raw of text) {
    const ch = norm(raw);
    const rows = spec.glyphs[ch];
    if (rows) {
      for (let pass = 0; pass < 2; pass++) {
        rows.forEach((bits, ry) => {
          for (let rx = 0; rx < spec.w; rx++) {
            if (!(bits & (1 << (spec.w - 1 - rx)))) continue;
            if (pass === 0) {
              g.fillStyle = shadow;
              g.fillRect(cx + rx * 2 + 1, y + ry * 2 + 1, 2, 2);
            } else {
              g.fillStyle = ramp[Math.min(ramp.length - 1, Math.floor((ry * 2 * ramp.length) / 14))];
              g.fillRect(cx + rx * 2, y + ry * 2, 2, 1);
              g.fillStyle = ramp[Math.min(ramp.length - 1, Math.floor(((ry * 2 + 1) * ramp.length) / 14))];
              g.fillRect(cx + rx * 2, y + ry * 2 + 1, 2, 1);
            }
          }
        });
      }
    }
    cx += 12;
  }
  return cx - Math.round(x);
}

export function measureBig(text: string): number {
  const n = [...text].length;
  return n === 0 ? 0 : n * 12 - 2;
}

/** Word-wrap to a max character count. */
export function wrapText(text: string, maxChars: number, maxLines = 4): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    if ((cur ? cur.length + 1 : 0) + w.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const out = lines.slice(0, maxLines);
    out[maxLines - 1] = out[maxLines - 1].slice(0, maxChars - 1) + '…';
    return out;
  }
  return lines;
}
