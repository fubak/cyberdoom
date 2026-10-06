import { describe, expect, it } from 'vitest';
import { reorderLazyQueue } from '../src/render/sprites';

/** Pure queue-order tests for the lazy-sprite prewarm. */
const f = (setId: string, first = false) => ({ setId, first });

describe('reorderLazyQueue', () => {
  it('no priority: first frames of each set before all others, stable', () => {
    const q = [f('worm', true), f('worm'), f('trojan', true), f('trojan'), f('ransom', true)];
    const out = reorderLazyQueue(q, []);
    expect(out.map((e) => e.setId)).toEqual(['worm', 'trojan', 'ransom', 'worm', 'trojan']);
    expect(out).not.toBe(q);
  });

  it('priority sets move to the front, then remaining first frames', () => {
    const q = [f('worm', true), f('worm'), f('trojan', true), f('trojan'), f('ransom', true)];
    const out = reorderLazyQueue(q, ['trojan']);
    expect(out.map((e) => e.setId)).toEqual(['trojan', 'trojan', 'worm', 'ransom', 'worm']);
  });

  it('unknown priority ids are a no-op reorder of first-first', () => {
    const q = [f('worm', true), f('worm')];
    expect(reorderLazyQueue(q, ['nope']).map((e) => e.setId)).toEqual(['worm', 'worm']);
    expect(reorderLazyQueue([], ['a'])).toEqual([]);
  });
});
