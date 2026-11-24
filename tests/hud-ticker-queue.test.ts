import { describe, expect, it } from 'vitest';
import {
  DEDUPE_WINDOW,
  EMPTY_TICKER,
  TICKER_LIFE,
  TICKER_MAX_MESSAGES,
  TICKER_MAX_ROWS,
  TIP_QUEUE_TTL,
  defaultPriority,
  messageLines,
  pushTicker,
  tickTicker,
  tickerPages,
  tickerRows,
  type TickerState,
} from '../src/ui/tickerQueue';

const texts = (s: TickerState) => s.visible.map((m) => m.text);
const rowsOf = (s: TickerState) => s.visible.reduce((n, m) => n + messageLines(m.text, m.kind, m.n).length, 0);
const LONG =
  'Corroborate with two sources before you call it: the firewall egress log and the badge reader pull for the same window, then file the case and move on to the next host.';

describe('ticker queue discipline', () => {
  it('shows at most two messages and three rows at once', () => {
    let s = EMPTY_TICKER;
    for (const t of ['one', 'two', 'three', 'four']) s = pushTicker(s, t, 'info');
    expect(s.visible.length).toBeLessThanOrEqual(TICKER_MAX_MESSAGES);
    expect(rowsOf(s)).toBeLessThanOrEqual(TICKER_MAX_ROWS);
    expect(texts(s)).toEqual(['one', 'two']);
    expect(s.pending.map((m) => m.text)).toEqual(['three', 'four']);
  });

  it('promotes queued messages when a slot frees up', () => {
    let s = EMPTY_TICKER;
    for (const t of ['one', 'two', 'three']) s = pushTicker(s, t, 'info');
    s = tickTicker(s, TICKER_LIFE + 0.01);
    expect(texts(s)).toEqual(['three']);
  });

  it('orders by priority: objective > alert (damage/warn) > tip', () => {
    expect(defaultPriority('good')).toBe('objective');
    expect(defaultPriority('bad')).toBe('alert');
    expect(defaultPriority('warn')).toBe('alert');
    expect(defaultPriority('info')).toBe('tip');
    let s = EMPTY_TICKER;
    s = pushTicker(s, 'tip a', 'info');
    s = pushTicker(s, 'tip b', 'info');
    s = pushTicker(s, 'worm outbreak', 'bad');
    s = pushTicker(s, 'objective done', 'good');
    // both tips are bumped back to the queue; nothing was dropped
    expect(texts(s).sort()).toEqual(['objective done', 'worm outbreak']);
    expect(s.pending.map((m) => m.text)).toEqual(['tip a', 'tip b']);
  });

  it('a lower priority never bumps a higher one', () => {
    let s = EMPTY_TICKER;
    s = pushTicker(s, 'objective one', 'good');
    s = pushTicker(s, 'objective two', 'good');
    s = pushTicker(s, 'just a tip', 'info');
    expect(texts(s)).toEqual(['objective one', 'objective two']);
  });

  it('collapses an on-screen repeat into xN and drops later repeats within 60 s', () => {
    let s = pushTicker(EMPTY_TICKER, 'Locked.', 'warn');
    s = pushTicker(s, 'Locked.', 'warn');
    expect(s.visible[0].n).toBe(2);
    s = tickTicker(s, TICKER_LIFE + 0.1);
    expect(s.visible).toHaveLength(0);
    s = pushTicker(s, 'Locked.', 'warn');
    expect(s.visible).toHaveLength(0);
    s = tickTicker(s, DEDUPE_WINDOW);
    s = pushTicker(s, 'Locked.', 'warn');
    expect(texts(s)).toEqual(['Locked.']);
  });

  it('never suppresses objective/progress confirmations', () => {
    let s = pushTicker(EMPTY_TICKER, 'QUICKSAVED', 'good');
    s = tickTicker(s, TICKER_LIFE + 0.1);
    s = pushTicker(s, 'QUICKSAVED', 'good');
    expect(texts(s)).toEqual(['QUICKSAVED']);
  });

  it('auto-dismisses tips that wait too long in the queue', () => {
    let s = EMPTY_TICKER;
    s = pushTicker(s, 'alert one', 'bad');
    s = pushTicker(s, 'alert two', 'bad');
    s = pushTicker(s, 'stale tip', 'info');
    // keep the alerts on screen past the tip's queue life
    for (let t = 0; t < TIP_QUEUE_TTL + 1; t += 1) {
      s = pushTicker(s, 'alert one', 'bad');
      s = pushTicker(s, 'alert two', 'bad');
      s = tickTicker(s, 1);
    }
    expect([...texts(s), ...s.pending.map((m) => m.text)]).not.toContain('stale tip');
  });

  it('splits an over-long message into whole-word pages instead of truncating', () => {
    const pages = tickerPages(LONG, 'info');
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(messageLines(p, 'info').length).toBeLessThanOrEqual(TICKER_MAX_ROWS);
    expect(pages.join(' ').split(/\s+/)).toEqual(LONG.split(/\s+/));
    let s = pushTicker(EMPTY_TICKER, LONG, 'info');
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      for (const m of s.visible) if (!seen.includes(m.text)) seen.push(m.text);
      s = tickTicker(s, TICKER_LIFE + 0.01);
    }
    expect(seen).toEqual(pages);
  });

  it('renders no row with an ellipsis or ".." truncation', () => {
    let s = EMPTY_TICKER;
    s = pushTicker(s, LONG, 'bad');
    s = pushTicker(s, 'A second, shorter warning about the door', 'warn');
    for (let i = 0; i < 6; i++) {
      for (const r of tickerRows(s.visible)) {
        expect(r.line).not.toMatch(/…|\.\.$/);
      }
      s = tickTicker(s, 2);
    }
  });
});
