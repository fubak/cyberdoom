import { wrapText } from '../render/font';

/**
 * HUD message ticker: a small priority queue (pure, immutable, unit-tested).
 *
 * Discipline (UX plan Phase C #15):
 *  - at most TICKER_MAX_MESSAGES messages and TICKER_MAX_ROWS tiny rows on screen;
 *  - priority objective > alert (damage, warnings, refusals) > tip;
 *  - a higher-priority message that does not fit bumps the lowest visible one
 *    back into the queue; it never shares space by truncation;
 *  - the same text is not repeated within DEDUPE_WINDOW seconds (a repeat while
 *    it is still on screen collapses into an "xN" count instead);
 *  - every message expires (tips also expire while they wait in the queue);
 *  - nothing is ever cut with an ellipsis: a message longer than the row budget
 *    is split into whole-word pages that queue one after another.
 */

export const TICKER_COLS = 52;
export const TICKER_MAX_MESSAGES = 2;
export const TICKER_MAX_ROWS = 3;
/** Seconds a message stays on screen once shown. */
export const TICKER_LIFE = 5;
/** Repeats of the same text inside this window (seconds) are dropped. */
export const DEDUPE_WINDOW = 60;
/** A tip still waiting after this long (seconds) is dismissed unseen: it is stale. */
export const TIP_QUEUE_TTL = 15;
const PENDING_CAP = 8;

export type TickerPriority = 'objective' | 'alert' | 'tip';
const RANK: Record<TickerPriority, number> = { objective: 3, alert: 2, tip: 1 };

export interface TickerMessage {
  readonly text: string;
  readonly kind: string;
  readonly priority: TickerPriority;
  /** Remaining on-screen life (seconds). */
  readonly t: number;
  /** Collapsed repeat count. */
  readonly n: number;
  readonly seq: number;
  /** Ticker clock when it was queued. */
  readonly at: number;
}

export interface TickerState {
  readonly visible: readonly TickerMessage[];
  readonly pending: readonly TickerMessage[];
  /** text -> ticker clock it was last accepted (dedupe window). */
  readonly recent: Readonly<Record<string, number>>;
  readonly seq: number;
  readonly now: number;
}

export const EMPTY_TICKER: TickerState = { visible: [], pending: [], recent: {}, seq: 0, now: 0 };

/**
 * Non-color semantic prefix so good/warn/bad messages never rely on color alone.
 * Every glyph must exist in the TINY ticker font: the old warn mark '~' had no
 * tiny glyph and drew as an empty '[ ]' box (read as a '( )' placeholder).
 */
export function tickerPrefix(kind: string): string {
  if (kind === 'bad') return '[!] ';
  if (kind === 'warn') return '[-] ';
  if (kind === 'good') return '[+] ';
  return '';
}

/** Default priority by message kind: confirmations are progress, bad/warn are alerts, info is a tip. */
export function defaultPriority(kind: string): TickerPriority {
  if (kind === 'good') return 'objective';
  if (kind === 'bad' || kind === 'warn') return 'alert';
  return 'tip';
}

/** The wrapped tiny rows of one message, prefix and "xN" count included (no line limit). */
export function messageLines(text: string, kind: string, n = 1): string[] {
  const head = `${tickerPrefix(kind)}${text.toUpperCase()}`;
  if (n > 1) {
    const counted = wrapText(`${head} X${n}`, TICKER_COLS, Infinity);
    // the count never costs the message a row past the budget
    if (counted.length <= TICKER_MAX_ROWS) return counted;
  }
  return wrapText(head, TICKER_COLS, Infinity);
}

/** Split text into whole-word pages that each fit the row budget with their prefix. */
export function tickerPages(text: string, kind: string, maxRows = TICKER_MAX_ROWS): string[] {
  if (messageLines(text, kind).length <= maxRows) return [text];
  const pages: string[] = [];
  let cur = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && messageLines(next, kind).length > maxRows) {
      pages.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) pages.push(cur);
  return pages;
}

const rowsOf = (m: TickerMessage): number => messageLines(m.text, m.kind, m.n).length;
const totalRows = (ms: readonly TickerMessage[]): number => ms.reduce((s, m) => s + rowsOf(m), 0);
const byPriority = (a: TickerMessage, b: TickerMessage): number =>
  RANK[b.priority] - RANK[a.priority] || a.seq - b.seq;

function fits(visible: readonly TickerMessage[], m: TickerMessage): boolean {
  return visible.length < TICKER_MAX_MESSAGES && totalRows(visible) + rowsOf(m) <= TICKER_MAX_ROWS;
}

/** The visible message a higher-priority arrival may bump: lowest rank, oldest first. */
function weakest(visible: readonly TickerMessage[]): TickerMessage | undefined {
  return [...visible].sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.seq - b.seq)[0];
}

/** Promote queued messages into the visible set, in priority order, without skipping ahead. */
function settle(state: TickerState): TickerState {
  let visible = [...state.visible];
  let pending = [...state.pending].sort(byPriority);
  for (let guard = 0; pending.length && guard < 32; guard++) {
    const head = pending[0];
    if (fits(visible, head)) {
      visible = [...visible, { ...head, t: TICKER_LIFE }];
      pending = pending.slice(1);
      continue;
    }
    const weak = weakest(visible);
    if (!weak || RANK[weak.priority] >= RANK[head.priority]) break;
    // bumped messages wait again with a fresh life; they are not lost
    visible = visible.filter((m) => m !== weak);
    pending = [...pending, { ...weak, t: TICKER_LIFE }].sort(byPriority);
  }
  return { ...state, visible, pending };
}

function capPending(pending: readonly TickerMessage[]): readonly TickerMessage[] {
  if (pending.length <= PENDING_CAP) return pending;
  // drop the least important, oldest first
  const drop = new Set(
    [...pending].sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.seq - b.seq).slice(0, pending.length - PENDING_CAP),
  );
  return pending.filter((m) => !drop.has(m));
}

export function pushTicker(
  state: TickerState,
  text: string,
  kind = 'info',
  priority: TickerPriority = defaultPriority(kind),
): TickerState {
  const shown = state.visible.find((m) => m.text === text);
  if (shown) {
    // a repeat while on screen collapses into an "xN" count and refreshes its life
    const bumped = { ...shown, t: TICKER_LIFE, n: Math.min(shown.n + 1, 99) };
    return { ...state, visible: state.visible.map((m) => (m === shown ? bumped : m)), recent: { ...state.recent, [text]: state.now } };
  }
  if (state.pending.some((m) => m.text === text)) return state;
  const last = state.recent[text];
  // objective/progress confirmations are state changes and always show
  if (priority !== 'objective' && last !== undefined && state.now - last < DEDUPE_WINDOW) return state;
  let seq = state.seq;
  const pages = tickerPages(text, kind).map(
    (page): TickerMessage => ({ text: page, kind, priority, t: TICKER_LIFE, n: 1, seq: ++seq, at: state.now }),
  );
  // pages share the original text's dedupe key so a long repeat is caught too
  const recent = { ...state.recent, [text]: state.now };
  for (const p of pages) recent[p.text] = state.now;
  return settle({ ...state, seq, recent, pending: capPending([...state.pending, ...pages]) });
}

export function tickTicker(state: TickerState, dt: number): TickerState {
  const now = state.now + dt;
  const visible = state.visible.map((m) => ({ ...m, t: m.t - dt })).filter((m) => m.t > 0);
  const pending = state.pending.filter((m) => m.priority !== 'tip' || now - m.at <= TIP_QUEUE_TTL);
  const recent = Object.fromEntries(Object.entries(state.recent).filter(([, at]) => now - at < DEDUPE_WINDOW));
  return settle({ ...state, now, visible, pending, recent });
}

/**
 * Ticker rows (pure): messages in arrival order, oldest on top, each wrapped in
 * full. A message that does not fit the remaining rows whole is left out (it is
 * never ellipsized); the queue normally guarantees it fits.
 */
export function tickerRows(
  messages: readonly { text: string; kind: string; t: number; n: number }[],
  maxRows = TICKER_MAX_ROWS,
): { line: string; kind: string; t: number }[] {
  const blocks: { lines: string[]; kind: string; t: number }[] = [];
  let rows = 0;
  for (let i = messages.length - 1; i >= 0 && rows < maxRows; i--) {
    const m = messages[i];
    const lines = messageLines(m.text, m.kind, m.n);
    if (rows + lines.length > maxRows) continue;
    blocks.unshift({ lines, kind: m.kind, t: m.t });
    rows += lines.length;
  }
  return blocks.flatMap((b) => b.lines.map((line) => ({ line, kind: b.kind, t: b.t })));
}
