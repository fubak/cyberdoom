/**
 * TAB objectives overlay layout (UX plan Phase F; Phase C noted it could cut
 * text with '…'). Pure: every objective is wrapped in full at OVERLAY_COLS
 * small-font columns and the list is split into pages that fit the panel; the
 * HUD cycles pages while TAB is held. Nothing is ever ellipsized.
 */

/** Small-font columns that fit from x=13 to the right edge (13 + 50*6 - 1 = 312 <= 318). */
export const OVERLAY_COLS = 50;
/** Seconds each page stays up while TAB is held. */
export const OVERLAY_PAGE_SECONDS = 3;

export type ObjectiveStatus = 'open' | 'done' | 'failed';

export interface OverlayRow {
  /** Index of the objective in the input list. */
  readonly index: number;
  readonly status: ObjectiveStatus;
  readonly settled: boolean;
  /** Wrapped upper-case rows of this objective on this page. */
  readonly lines: readonly string[];
  /** True when this block continues an objective started on the previous page. */
  readonly continued: boolean;
}

/** Whole-word wrap with no line limit; a word longer than a row is hard-split. */
export function wrapAll(text: string, cols = OVERLAY_COLS): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const pieces = word.length > cols ? word.match(new RegExp(`.{1,${cols}}`, 'g'))! : [word];
    for (const piece of pieces) {
      if (!cur) cur = piece;
      else if (cur.length + 1 + piece.length <= cols) cur = `${cur} ${piece}`;
      else {
        lines.push(cur);
        cur = piece;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Pages of objective rows, each page at most `maxRows` text rows. An objective
 * is never split across pages unless it alone is taller than a page.
 */
export function layoutObjectivesOverlay(
  objs: readonly { text: string; done: boolean; failed: boolean }[],
  maxRows: number,
): OverlayRow[][] {
  const budget = Math.max(1, Math.floor(maxRows));
  const pages: OverlayRow[][] = [];
  let page: OverlayRow[] = [];
  let used = 0;
  const flush = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };
  objs.forEach((o, index) => {
    const status: ObjectiveStatus = o.failed ? 'failed' : o.done ? 'done' : 'open';
    const settled = status !== 'open';
    let lines = wrapAll(o.text.toUpperCase());
    if (used + lines.length > budget) flush();
    let continued = false;
    while (lines.length > budget) {
      page.push({ index, status, settled, lines: lines.slice(0, budget), continued });
      flush();
      lines = lines.slice(budget);
      continued = true;
    }
    page = [...page, { index, status, settled, lines, continued }];
    used += lines.length;
  });
  flush();
  return pages;
}

/** Page shown `heldFor` seconds after TAB went down (cycles). */
export function overlayPageAt(heldFor: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  return Math.floor(Math.max(0, heldFor) / OVERLAY_PAGE_SECONDS) % pageCount;
}
