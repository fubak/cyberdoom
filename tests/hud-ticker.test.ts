import { describe, expect, it } from 'vitest';
import { tickerRows } from '../src/ui/hud';

const msg = (text: string, kind = 'info', n = 1) => ({ text, kind, t: 5, n });

describe('tickerRows', () => {
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
});
