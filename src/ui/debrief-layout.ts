import { canDraw, measureText } from '../render/font';

/**
 * CURRICULUM: pure layout for the pixel-font debrief. The debrief renders on a
 * fixed 400x250 logical canvas (Doom-intermission style) with the bitmap font,
 * so every text block is wrapped by measured pixel width and paginated into
 * fixed-height pages: nothing scrolls and nothing is cut off.
 */
export const DB_W = 400;
export const DB_H = 250;
export const DB_X = 16;
export const DB_TEXT_W = 368;
export const DB_LINE = 9;
export const DB_BODY_TOP = 47;
export const DB_BODY_ROWS = 19;
export const DB_HANG = 14;

export interface PLine {
  text: string;
  color: string;
  indent?: number;
  /** Drawn at the left margin before `text` (e.g. an option number). */
  prefix?: string;
  prefixColor?: string;
  /** Clickable row: index handed to the view's hit handler. */
  hit?: number;
}

const SUBST: Record<string, string> = { '✓': '+', '✗': 'X', '▸': '>', '☣': '!', '→': '->', '←': '<-', '≥': '>=', '≤': '<=' };

/** Replace the few UI symbols the bitmap font lacks; content itself is tested to be drawable. */
export function pixelSafe(text: string): string {
  return [...text].map((ch) => SUBST[ch] ?? ch).join('');
}

/** Word-wrap by measured pixel width; hard-splits tokens longer than a line. Lossless. */
export function wrapPixel(text: string, maxW: number = DB_TEXT_W): string[] {
  const width = Math.max(6, maxW);
  const lines: string[] = [];
  for (const paragraph of pixelSafe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      if (measureText(word) <= width) {
        line = word;
        continue;
      }
      for (const ch of word) {
        if (line && measureText(line + ch) > width) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** One wrapped text block. With `prefix`, the text hangs at DB_HANG after it. */
export function block(
  text: string,
  color: string,
  opts: { indent?: number; prefix?: string; prefixColor?: string; hit?: number; maxW?: number } = {},
): PLine[] {
  const indent = opts.prefix !== undefined ? DB_HANG + (opts.indent ?? 0) : (opts.indent ?? 0);
  const maxW = (opts.maxW ?? DB_TEXT_W) - indent;
  return wrapPixel(text, maxW).map((t, i) => ({
    text: t,
    color,
    indent,
    prefix: i === 0 ? opts.prefix : undefined,
    prefixColor: opts.prefixColor,
    hit: opts.hit,
  }));
}

/**
 * Pack blocks into pages of `rows` lines, with one blank row between blocks.
 * A block that fits on a page is never split; a longer one continues on the next.
 */
export function paginate(blocks: PLine[][], rows: number = DB_BODY_ROWS): PLine[][] {
  const pages: PLine[][] = [];
  let cur: PLine[] = [];
  const flush = () => {
    if (cur.length) pages.push(cur);
    cur = [];
  };
  for (const b of blocks) {
    if (!b.length) continue;
    const gap = cur.length ? 1 : 0;
    if (cur.length + gap + b.length > rows && b.length <= rows) flush();
    if (cur.length) cur.push({ text: '', color: '#000' });
    for (const line of b) {
      if (cur.length >= rows) flush();
      cur.push(line);
    }
  }
  flush();
  return pages.length ? pages : [[]];
}

export function drawable(text: string): boolean {
  return canDraw(pixelSafe(text), 'small');
}

/**
 * Intermission tallies line drawn on the tally page. Y sits below the
 * ~30px title block and above the first tally row (y=56), so it never
 * overlaps even when all six tally rows are shown.
 */
export const STATS_Y = 42;

export interface IntermissionStats {
  kills: number;
  killsTotal: number;
  secrets: number;
  secretsTotal: number;
  time: number;
  par: number;
}

export function formatStatsTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function statsSegments(stats: IntermissionStats): { text: string; overPar: boolean }[] {
  return [
    { text: `KILLS ${stats.kills}/${stats.killsTotal}`, overPar: false },
    { text: `SECRETS ${stats.secrets}/${stats.secretsTotal}`, overPar: false },
    { text: `TIME ${formatStatsTime(stats.time)} / PAR ${formatStatsTime(stats.par)}`, overPar: stats.time > stats.par },
  ];
}

export function statsLine(stats: IntermissionStats): string {
  return statsSegments(stats).map((s) => s.text).join('   ');
}

/**
 * An 'avoid' objective is upheld unless it was actually violated — on a loss
 * for another reason (e.g. integrity depleted) it must not render as missed.
 */
export function avoidViolated(o: { failed: boolean; violations?: number }): boolean {
  return o.failed || (o.violations ?? 0) > 0;
}
