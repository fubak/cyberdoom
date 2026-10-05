import { describe, expect, it } from 'vitest';
import { Audio, spatialize } from '../src/engine/audio';

describe('audio spatialization', () => {
  it('keeps nearby sounds loud and fades out at 19 tiles', () => {
    expect(spatialize(1, 0, 0).gain).toBe(1);
    expect(spatialize(19, 0, 0).gain).toBe(0);
  });

  it('pans the player right for a source on +y and centers a source ahead', () => {
    expect(spatialize(0, 1, 0).pan).toBeGreaterThan(0);
    expect(spatialize(1, 0, 0).pan).toBeCloseTo(0);
  });

  it('does not throw when WebAudio is unavailable', () => {
    expect(() => new Audio().sfx('impact', { x: 1, y: 1 })).not.toThrow();
  });
});
