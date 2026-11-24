/**
 * Paging keys shared by the paged text screens (briefing details; the field
 * dossier uses the same map): Left / A = previous page, Right / D = next.
 * Q stays a harmless alias for previous (it was the briefing's old back key).
 * Callers decide when paging applies, e.g. D only pages once the briefing is
 * already showing details (on the overview D opens them).
 */
const PREV = new Set(['arrowleft', 'a', 'q']);
const NEXT = new Set(['arrowright', 'd']);

export type PageStep = -1 | 0 | 1;

/** -1 previous, +1 next, 0 not a paging key. */
export function pageStep(key: string): PageStep {
  const k = key.toLowerCase();
  if (PREV.has(k)) return -1;
  if (NEXT.has(k)) return 1;
  return 0;
}

/** Move `page` by `step`, clamped to [0, count - 1] (no wrap-around). */
export function stepPage(page: number, step: number, count: number): number {
  const last = Math.max(0, count - 1);
  return Math.max(0, Math.min(last, page + step));
}

/** Canvas footer for a paged screen, e.g. "←/→ OR A/D: PAGE 2/4". `page` is 0-based. */
export function pageLabel(page: number, count: number): string {
  return `←/→ OR A/D: PAGE ${stepPage(page, 0, count) + 1}/${count}`;
}
