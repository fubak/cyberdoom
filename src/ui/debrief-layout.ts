import { canDraw, measureChunky, measureText } from '../render/font';

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
  /** Body font: 'small' is the tiny caps-adjacent font; 'chunky' is the big round
   * Doom-style font used for quiz/feedback body text. */
  font?: 'small' | 'chunky';
  /** Drawn at the left margin before `text` (e.g. an option number). */
  prefix?: string;
  prefixColor?: string;
  /** Clickable row: index handed to the view's hit handler. */
  hit?: number;
  /** A heading row: never the last row of a page; it moves to the next page with its content. */
  keepWithNext?: boolean;
}

const SUBST: Record<string, string> = { '✓': '+', '✗': 'X', '▸': '>', '☣': '!', '→': '->', '←': '<-', '≥': '>=', '≤': '<=' };

/** Replace the few UI symbols the bitmap font lacks; content itself is tested to be drawable. */
export function pixelSafe(text: string): string {
  return [...text].map((ch) => SUBST[ch] ?? ch).join('');
}

/** Word-wrap by measured pixel width; hard-splits tokens longer than a line. Lossless. */
export function wrapPixel(text: string, maxW: number = DB_TEXT_W, font: 'small' | 'chunky' = 'small'): string[] {
  const width = Math.max(6, maxW);
  const measure = font === 'chunky' ? measureChunky : measureText;
  const lines: string[] = [];
  for (const paragraph of pixelSafe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      if (measure(word) <= width) {
        line = word;
        continue;
      }
      for (const ch of word) {
        if (line && measure(line + ch) > width) {
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
  opts: {
    indent?: number;
    prefix?: string;
    prefixColor?: string;
    hit?: number;
    maxW?: number;
    font?: 'small' | 'chunky';
    keepWithNext?: boolean;
  } = {},
): PLine[] {
  const indent = opts.prefix !== undefined ? DB_HANG + (opts.indent ?? 0) : (opts.indent ?? 0);
  const maxW = (opts.maxW ?? DB_TEXT_W) - indent;
  return wrapPixel(text, maxW, opts.font ?? 'small').map((t, i) => ({
    text: t,
    color,
    font: opts.font,
    indent,
    prefix: i === 0 ? opts.prefix : undefined,
    prefixColor: opts.prefixColor,
    hit: opts.hit,
    ...(opts.keepWithNext ? { keepWithNext: true } : {}),
  }));
}

/** A section heading: a block that paginate keeps on the same page as the block after it. */
export function heading(text: string, color: string, opts: { font?: 'small' | 'chunky' } = {}): PLine[] {
  return block(text, color, { ...opts, keepWithNext: true });
}

/**
 * Pack blocks into pages of `rows` lines, with one blank row between blocks.
 * A block that fits on a page is never split; a longer one continues on the next.
 * A heading block (keepWithNext) is packed together with the block after it, and
 * a heading row never ends a page: it moves on with at least one row of its content.
 */
export function paginate(blocks: PLine[][], rows: number = DB_BODY_ROWS): PLine[][] {
  const pages: PLine[][] = [];
  let cur: PLine[] = [];
  const flush = () => {
    if (cur.length) pages.push(cur);
    cur = [];
  };
  for (const unit of joinHeadings(blocks.filter((b) => b.length))) {
    const gap = cur.length ? 1 : 0;
    if (cur.length + gap + unit.length > rows && unit.length <= rows) flush();
    if (cur.length >= rows) flush();
    if (cur.length) cur.push(spacer());
    unit.forEach((line, i) => {
      if (line === SPACER) {
        if (cur.length && cur.length < rows) cur.push(spacer());
        return;
      }
      const need = line.keepWithNext ? rowsToContent(unit, i) : 1;
      if (cur.length + need > rows || cur.length >= rows) flush();
      cur.push(line);
    });
  }
  flush();
  return pages.length ? pages : [[]];
}

/** Sentinel for the blank row joining a heading to its block (dropped at a page top). */
const SPACER: PLine = Object.freeze({ text: '', color: '#000' }) as PLine;
const spacer = (): PLine => ({ text: '', color: '#000' });

/** Merge each heading block with the block that follows it (chains of headings too). */
function joinHeadings(blocks: PLine[][]): PLine[][] {
  const units: PLine[][] = [];
  let pending: PLine[] | null = null;
  for (const b of blocks) {
    const unit: PLine[] = pending ? [...pending, SPACER, ...b] : b;
    pending = b[b.length - 1]?.keepWithNext ? unit : null;
    if (!pending) units.push(unit);
  }
  if (pending) units.push(pending);
  return units;
}

/** Rows from unit[i] through the first content row after its heading run (spacers included). */
function rowsToContent(unit: PLine[], i: number): number {
  for (let j = i + 1; j < unit.length; j++) {
    if (unit[j] !== SPACER && !unit[j].keepWithNext) return j - i + 1;
  }
  return 1;
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

/** Doom intermission parity: percentages for kills/secrets, time vs par. */
export function statsSegments(stats: IntermissionStats): { text: string; overPar: boolean }[] {
  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return [
    { text: `KILLS ${pct(stats.kills, stats.killsTotal)}%`, overPar: false },
    { text: `SECRETS ${pct(stats.secrets, stats.secretsTotal)}%`, overPar: false },
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
