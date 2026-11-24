import { describe, expect, it } from 'vitest';
import { ellipsizeWords, wrapText } from '../src/render/font';
import { sortedTools } from '../src/tools';
import { tickerColor, tickerPrefix, tickerRows } from '../src/ui/hud';

const msg = (text: string, kind = 'info', n = 1) => ({ text, kind, t: 5, n });

describe('tickerRows', () => {
  it('keeps every arsenal tool lesson within three ticker lines', () => {
    for (const tool of sortedTools()) {
      const lesson = tool.control?.lesson;
      expect(lesson, `${tool.id} lesson`).toBeDefined();
      if (!lesson) throw new Error(`${tool.id} has no lesson`);
      expect(wrapText(lesson.toUpperCase(), 52, 99).length, tool.id).toBeLessThanOrEqual(3);
    }
  });

  it('ellipsizes at whole-word boundaries, with a character fallback for one long word', () => {
    const original = 'alpha bravo charlie';
    const clipped = ellipsizeWords(original, 13);
    const visible = clipped.slice(0, -1);
    const visibleWords = visible.split(/\s+/);

    expect(clipped).toBe('alpha bravo…');
    expect(clipped.length).toBeLessThanOrEqual(13);
    expect(visibleWords).toEqual(original.split(/\s+/).slice(0, visibleWords.length));
    expect(ellipsizeWords('extraordinary', 6)).toBe('extra…');
  });

  it('truncates wrapText at a whole-word prefix', () => {
    const original = 'ONE TWO THREE FOUR FIVE SIX SEVEN';
    const lines = wrapText(original, 10, 2);
    const visible = lines.join(' ').slice(0, -1);
    const visibleWords = visible.split(/\s+/);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('…');
    expect(visibleWords).toEqual(original.split(/\s+/).slice(0, visibleWords.length));
  });

  it('leaves out an older message that no longer fits whole instead of cutting it', () => {
    const original = 'alpha bravo charlie delta echo foxtrot golf hotel of india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu';
    const rows = tickerRows([msg(original), msg('newer')], 2);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe('NEWER');
    expect(rows.some((row) => row.line.includes('…') || row.line.includes('..'))).toBe(false);
  });

  it('renders every word of a 140-char message across its wrapped lines', () => {
    const text =
      'CASE ON WS-EAST-12: 1/2 SOURCES — HAVE: firewall egress log matched outbound exfil window; NEED: badge reader pull for the same window to corroborate';
    expect(text.length).toBeGreaterThanOrEqual(140);
    const rows = tickerRows([msg(text)]);
    const joined = rows.map((r) => r.line).join(' ');
    for (const word of text.toUpperCase().split(/\s+/)) {
      expect(joined).toContain(word);
    }
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it('caps the whole block at 4 rows across stacked messages', () => {
    const long = 'ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT GOLF HOTEL INDIA JULIET KILO LIMA MIKE NOVEMBER OSCAR PAPA QUEBEC ROMEO';
    const rows = tickerRows([msg(long), msg(long), msg(long)]);
    expect(rows.length).toBeLessThanOrEqual(4);
  });

  it('puts the xN collapse count on the last wrapped line of its message', () => {
    const rows = tickerRows([msg('RAT is draining your integrity!', 'bad', 3)]);
    expect(rows[rows.length - 1].line).toContain('X3');
    // a long repeat message keeps the count on its last wrapped line, not the first
    const long = tickerRows([msg('sustained drain alert repeats while the worm keeps siphoning integrity from the host', 'bad', 4)]);
    expect(long.length).toBeGreaterThan(1);
    expect(long[long.length - 1].line).toContain('X4');
    expect(long[0].line).not.toContain('X4');
  });

  it('shows newest message lines last (oldest shown on top)', () => {
    const rows = tickerRows([msg('first message'), msg('second message')]);
    expect(rows[0].line).toContain('FIRST');
    expect(rows[1].line).toContain('SECOND');
  });

  it('distinguishes good, warn, and bad messages by prefix as well as color, with a color-blind palette', () => {
    const good = tickerRows([msg('Host cleaned', 'good')])[0].line;
    const warn = tickerRows([msg('Door locked', 'warn')])[0].line;
    const bad = tickerRows([msg('Integrity hit', 'bad')])[0].line;
    expect(good.startsWith(tickerPrefix('good'))).toBe(true);
    expect(warn.startsWith(tickerPrefix('warn'))).toBe(true);
    expect(bad.startsWith(tickerPrefix('bad'))).toBe(true);
    expect(new Set([tickerPrefix('good'), tickerPrefix('warn'), tickerPrefix('bad')]).size).toBe(3);

    // Color-blind palette keeps all four kinds distinct and swaps red/green for vermilion/sky-blue.
    const cbColors = new Set(['good', 'warn', 'bad', 'info'].map((k) => tickerColor(k, true)));
    expect(cbColors.size).toBe(4);
    expect(tickerColor('good', true)).not.toBe(tickerColor('good', false));
    expect(tickerColor('bad', true)).not.toBe(tickerColor('bad', false));
  });
});
