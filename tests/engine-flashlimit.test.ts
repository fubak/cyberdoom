import { describe, expect, it } from 'vitest';
import { FlashRateLimiter } from '../src/engine/feel';

/**
 * WCAG 2.3.1 photosafety contract: no more than 3 full-screen flashes may
 * start inside any one-second window, even under sustained fire. The
 * enemy-sprite hit flash is exempt and not gated by this limiter.
 */
describe('FlashRateLimiter', () => {
  it('allows the first 3 flashes then blocks the 4th inside one second', () => {
    const l = new FlashRateLimiter(3);
    expect(l.allow(0)).toBe(true);
    expect(l.allow(0.1)).toBe(true);
    expect(l.allow(0.2)).toBe(true);
    expect(l.allow(0.3)).toBe(false);
    expect(l.allow(0.9)).toBe(false);
  });

  it('never exceeds 3 flashes in any 1s window under sustained attempts', () => {
    const l = new FlashRateLimiter(3);
    const fired: number[] = [];
    // attempt a flash every 40 ms for 10 seconds — ~250 attempts
    for (let t = 0; t < 10; t += 0.04) {
      if (l.allow(t)) fired.push(t);
    }
    // every sliding 1s window holds at most 3 accepted flashes
    for (let i = 0; i < fired.length; i++) {
      const window = fired.filter((t) => t >= fired[i] && t < fired[i] + 1);
      expect(window.length).toBeLessThanOrEqual(3);
    }
    // sustained rate converges to 3/s, not a one-off burst
    expect(fired.filter((t) => t >= 8).length).toBeGreaterThanOrEqual(5);
  });

  it('reopens once the oldest flash ages past one second', () => {
    const l = new FlashRateLimiter(3);
    l.allow(0);
    l.allow(0.34);
    l.allow(0.67);
    expect(l.allow(1.0)).toBe(false); // flash at t=0 is exactly 1s old — still counted
    expect(l.allow(1.01)).toBe(true); // t=0 has expired, one slot frees
  });

  it('treats sparse flashes independently — gaps never accumulate credit', () => {
    const l = new FlashRateLimiter(3);
    l.allow(0);
    expect(l.allow(5)).toBe(true);
    expect(l.allow(5.1)).toBe(true);
    expect(l.allow(5.2)).toBe(true);
    expect(l.allow(5.3)).toBe(false);
  });
});
