import { describe, expect, it } from 'vitest';
import {
  ALERT_FADE,
  ALERT_HOLD,
  EDGE_MAX_ALPHA,
  EDGE_REDUCED_ALPHA,
  alertView,
  damageAlertText,
  edgeBand,
  edgeIndicator,
  noteHit,
  relativeBearing,
  tileDistance,
  type DamageAlertState,
  type DamageHit,
} from '../src/ui/damageAlert';

const hit = (over: Partial<DamageHit> = {}): DamageHit => ({ label: 'WORM', bearing: 'BEHIND', tiles: 3, others: 0, ...over });

describe('relativeBearing', () => {
  // facing +x; positive relative angle is the player's right (face/pain-wash convention)
  it('names the four quadrants', () => {
    expect(relativeBearing(5, 0, 0)).toBe('AHEAD');
    expect(relativeBearing(-5, 0, 0)).toBe('BEHIND');
    expect(relativeBearing(0, 5, 0)).toBe('RIGHT');
    expect(relativeBearing(0, -5, 0)).toBe('LEFT');
  });

  it('is relative to the facing angle and wraps around', () => {
    expect(relativeBearing(0, 5, Math.PI / 2)).toBe('AHEAD');
    expect(relativeBearing(5, 0, Math.PI)).toBe('BEHIND');
    expect(relativeBearing(1, 0.2, 2 * Math.PI)).toBe('AHEAD');
  });
});

describe('damageAlertText', () => {
  it('names the source, whole-tile distance and bearing', () => {
    expect(damageAlertText(hit())).toBe('WORM - 3 TILES BEHIND');
    expect(damageAlertText(hit({ tiles: 1, bearing: 'LEFT' }))).toBe('WORM - 1 TILE LEFT');
    expect(damageAlertText(hit({ label: 'rat', others: 2, bearing: 'AHEAD' }))).toBe('RAT - 3 TILES AHEAD +2 MORE');
    expect(damageAlertText(hit({ label: ' ' }))).toMatch(/^MALWARE - /);
  });

  it('rounds distance to whole tiles, never below 1', () => {
    expect(tileDistance(0.3)).toBe(1);
    expect(tileDistance(2.6)).toBe(3);
    expect(tileDistance(Number.NaN)).toBe(1);
  });
});

describe('timed alert', () => {
  it('shows while damage lands and is gone ~2 s after it stops', () => {
    let s: DamageAlertState | null = null;
    s = noteHit(s, hit(), 10);
    expect(alertView(s, 10)?.alpha).toBe(1);
    expect(alertView(s, 10 + ALERT_HOLD)?.alpha).toBe(1);
    const mid = alertView(s, 10 + ALERT_HOLD + ALERT_FADE / 2)!.alpha;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(alertView(s, 10 + ALERT_HOLD + ALERT_FADE + 0.01)).toBeNull();
    // a new hit refreshes it with the latest source/direction
    s = noteHit(s, hit({ bearing: 'LEFT', tiles: 1 }), 11);
    expect(alertView(s, 12.4)?.text).toBe('WORM - 1 TILE LEFT');
  });

  it('is null before any damage', () => {
    expect(alertView(null, 5)).toBeNull();
    expect(edgeIndicator(null, 5)).toBeNull();
  });
});

describe('directional edge indicator photosafety', () => {
  /** Count onsets: alpha rising by more than 0.05 between 1/60 s samples. */
  function maxRisesPerSecond(hitTimes: number[], until: number, reduced = false): number {
    let s: DamageAlertState | null = null;
    let last = 0;
    const rises: number[] = [];
    let k = 0;
    for (let t = 0; t <= until; t += 1 / 60) {
      while (k < hitTimes.length && hitTimes[k] <= t) s = noteHit(s, hit(), hitTimes[k++]);
      const a = edgeIndicator(s, t, reduced)?.alpha ?? 0;
      if (a - last > 0.05) rises.push(t);
      last = a;
    }
    let worst = 0;
    for (const r of rises) worst = Math.max(worst, rises.filter((x) => x >= r && x < r + 1).length);
    return worst;
  }

  it('holds steady under sustained damage (no strobing)', () => {
    const hits = Array.from({ length: 100 }, (_, i) => i * 0.05);
    expect(maxRisesPerSecond(hits, 5)).toBeLessThanOrEqual(1);
  });

  it('stays under 3 onsets per second for any hit cadence', () => {
    for (const gap of [0.2, 0.5, 0.9, 1.25, 1.5]) {
      const hits = Array.from({ length: 30 }, (_, i) => i * gap);
      expect(maxRisesPerSecond(hits, 30 * gap), `gap ${gap}`).toBeLessThanOrEqual(3);
    }
  });

  it('never exceeds its alpha cap; reduced-flash mode is dimmer', () => {
    const s = noteHit(null, hit(), 0);
    expect(edgeIndicator(s, 0)!.alpha).toBeCloseTo(EDGE_MAX_ALPHA);
    expect(edgeIndicator(s, 0, true)!.alpha).toBeCloseTo(EDGE_REDUCED_ALPHA);
    expect(EDGE_REDUCED_ALPHA).toBeLessThan(EDGE_MAX_ALPHA);
    expect(EDGE_MAX_ALPHA).toBeLessThanOrEqual(0.4);
  });

  it('tints a narrow band on the attacker side, never the whole view', () => {
    const W = 320;
    const H = 168;
    expect(edgeBand('LEFT', W, H).x).toBe(0);
    expect(edgeBand('RIGHT', W, H).x + edgeBand('RIGHT', W, H).w).toBe(W);
    expect(edgeBand('AHEAD', W, H).y).toBe(0);
    expect(edgeBand('BEHIND', W, H).y + edgeBand('BEHIND', W, H).h).toBe(H);
    for (const b of ['LEFT', 'RIGHT', 'AHEAD', 'BEHIND'] as const) {
      const r = edgeBand(b, W, H);
      expect((r.w * r.h) / (W * H), b).toBeLessThanOrEqual(0.1);
    }
  });
});
