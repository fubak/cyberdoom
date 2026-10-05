import { RES } from './res';

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
  '\\': [16, 16, 8, 4, 2, 1, 1], '~': [0, 0, 9, 22, 0, 0, 0],
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
type Mask = { bits: Uint8Array; w: number; h: number };

function epx(src: Mask): Mask {
  const w = src.w * 2, h = src.h * 2;
  const bits = new Uint8Array(w * h);
  const at = (x: number, y: number) => x < 0 || y < 0 || x >= src.w || y >= src.h ? 0 : src.bits[y * src.w + x];
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const e = at(x, y), b = at(x, y - 1), d = at(x - 1, y), f = at(x + 1, y), h0 = at(x, y + 1);
    bits[(y * 2) * w + x * 2] = d === b && b !== f && d !== h0 ? d : e;
    bits[(y * 2) * w + x * 2 + 1] = b === f && b !== d && f !== h0 ? f : e;
    bits[(y * 2 + 1) * w + x * 2] = d === h0 && d !== b && h0 !== f ? d : e;
    bits[(y * 2 + 1) * w + x * 2 + 1] = h0 === f && d !== h0 && b !== f ? f : e;
  }
  return { bits, w, h };
}

function maskFromRows(rows: number[], width: number, baseScale: number): Mask {
  const src: Mask = { w: width * baseScale, h: rows.length * baseScale, bits: new Uint8Array(width * baseScale * rows.length * baseScale) };
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < width; x++) {
    if (!(rows[y] & (1 << (width - 1 - x)))) continue;
    for (let sy = 0; sy < baseScale; sy++) for (let sx = 0; sx < baseScale; sx++) {
      src.bits[(y * baseScale + sy) * src.w + x * baseScale + sx] = 1;
    }
  }
  return epx(epx(src));
}

type Color = [number, number, number, number];
const colorCache = new Map<string, Color>();
let colorContext: CanvasRenderingContext2D | null = null;

function rgb(color: string): Color {
  const cached = colorCache.get(color);
  if (cached) return cached;
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color)?.[1];
  let parsed: Color;
  if (hex) {
    const channels = hex.length <= 4
      ? [...hex].map((channel) => parseInt(channel + channel, 16))
      : hex.match(/.{2}/g)!.map((channel) => parseInt(channel, 16));
    parsed = [channels[0], channels[1], channels[2], channels[3] ?? 255];
  } else if (typeof document !== 'undefined') {
    if (!colorContext) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      colorContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (colorContext) {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = 'rgba(0,0,0,0)';
      colorContext.fillStyle = color;
      colorContext.fillRect(0, 0, 1, 1);
      const pixel = colorContext.getImageData(0, 0, 1, 1).data;
      parsed = [pixel[0], pixel[1], pixel[2], pixel[3]];
    } else {
      parsed = [0, 0, 0, 255];
    }
  } else {
    parsed = [0, 0, 0, 255];
  }
  colorCache.set(color, parsed);
  return parsed;
}

function tone(color: Color, amount: number): string {
  const c = color.map((v) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)))));
  return `rgba(${c[0]},${c[1]},${c[2]},${color[3] / 255})`;
}

function nativeGlyph(
  key: string,
  rows: number[],
  width: number,
  baseScale: number,
  ramp: string[],
  bevel = true,
): HTMLCanvasElement {
  const cacheKey = `${key}|${rows.join(',')}|${ramp.join(',')}|${bevel}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const mask = maskFromRows(rows, width, baseScale);
  const c = document.createElement('canvas');
  c.width = mask.w;
  c.height = mask.h;
  const g = c.getContext('2d')!;
  const colors = ramp.map(rgb);
  const colorAt = (y: number) => colors[Math.min(colors.length - 1, Math.floor((y * colors.length) / mask.h))];
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
    const i = y * mask.w + x;
    if (!mask.bits[i]) continue;
    const edgeHi = x === 0 || y === 0 || !mask.bits[i - 1] || !mask.bits[i - mask.w];
    const edgeLo = x === mask.w - 1 || y === mask.h - 1 || !mask.bits[i + 1] || !mask.bits[i + mask.w];
    const base = colorAt(y);
    g.fillStyle = bevel && edgeHi ? tone(base, 0.32) : bevel && edgeLo ? tone(base, -0.38) : tone(base, 0);
    g.fillRect(x, y, 1, 1);
  }
  cache.set(cacheKey, c);
  return c;
}

function glyphCanvas(font: FontId, ch: string, color: string): HTMLCanvasElement | null {
  const spec = FONTS[font];
  const rows = spec.glyphs[ch];
  if (!rows) return null;
  return nativeGlyph(`${font}|${ch}`, rows, spec.w, 1, [color]);
}

export function fontHeight(font: FontId): number {
  return FONTS[font].h;
}

export function canDraw(text: string, font: FontId = 'small'): boolean {
  const { glyphs } = FONTS[font];
  return [...text].every((raw) => {
    const ch = norm(raw);
    return ch === ' ' || ch === '\n' || !!glyphs[ch];
  });
}

export function measureText(text: string, font: FontId = 'small'): number {
  const n = [...text].length;
  return n === 0 ? 0 : n * FONTS[font].adv - 1;
}

/** Draw pixel text; returns the base-unit advance width. */
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
        if (s) g.drawImage(s, cx + 0.5, cy + 0.5, s.width / RES, s.height / RES);
      }
      const gc = glyphCanvas(font, ch, color);
      if (gc) g.drawImage(gc, cx, cy, gc.width / RES, gc.height / RES);
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
  fat = false,
): number {
  const spec = { w: fat ? 6 : 5 };
  let cx = Math.round(x);
  for (const raw of text) {
    const ch = norm(raw);
    const src = FONTS.small.glyphs[ch];
    const rows = src && fat ? fatRows(src) : src;
    if (rows) {
      const w = spec.w;
      const glyph = nativeGlyph(`big${fat}|${ch}`, rows, w, 2, ramp);
      if (shadow) {
        const shade = nativeGlyph(`big-shadow${fat}|${ch}`, rows, w, 2, [shadow], false);
        g.drawImage(shade, cx + 0.5, y + 0.5, shade.width / RES, shade.height / RES);
      }
      g.drawImage(glyph, cx, y, glyph.width / RES, glyph.height / RES);
    }
    cx += fat ? 13 : 12;
  }
  return cx - Math.round(x);
}

export function measureBig(text: string, fat = false): number {
  const n = [...text].length;
  return n === 0 ? 0 : fat ? n * 13 - 1 : n * 12 - 2;
}

/** 5-wide glyph rows emboldened to 6 columns (each lit pixel also lights its right neighbour). */
const fatRows = (rows: number[]) => rows.map((b) => (b << 1) | b);

/**
 * Chunky HUD font (ticker, banners, panel labels): the 5x7 glyphs emboldened
 * to 6x7, with a top→bottom colour ramp and a hard 1px drop shadow. 7px advance.
 */
export function drawChunky(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  ramp: string | string[],
  shadow: string | null = '#000',
): number {
  const rs = typeof ramp === 'string' ? [ramp] : ramp;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const raw of text) {
    const rows = FONTS.small.glyphs[norm(raw)];
    if (rows) {
      const fr = fatRows(rows);
      const glyph = nativeGlyph(`chunky|${norm(raw)}`, fr, 6, 1, rs);
      if (shadow) {
        const shade = nativeGlyph(`chunky-shadow|${norm(raw)}`, fr, 6, 1, [shadow], false);
        g.drawImage(shade, cx + 0.5, cy + 0.5, shade.width / RES, shade.height / RES);
      }
      g.drawImage(glyph, cx, cy, glyph.width / RES, glyph.height / RES);
    }
    cx += 7;
  }
  return cx - Math.round(x);
}

export function measureChunky(text: string): number {
  const n = [...text].length;
  return n === 0 ? 0 : n * 7 - 1;
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

/** Raw 5x7 glyph rows (bit 4 = leftmost pixel) for custom renderers like the title logo. */
export function glyphRows(ch: string): number[] | undefined {
  return FONTS.small.glyphs[norm(ch)];
}
