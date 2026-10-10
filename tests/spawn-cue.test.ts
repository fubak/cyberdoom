import { describe, expect, it } from 'vitest';
import { CueGate, cueDirection, spawnCueText } from '../src/engine/spawnCue';

// Mirrors src/main.ts spawnCue: ambush triggers get the AMBUSH line, worm
// propagation onSpawn gets a REPLICATED line throttled by a CueGate.
describe('spawn cue directions', () => {
  it('is silent inside the fov — the column itself is the cue', () => {
    expect(cueDirection(0)).toBeNull();
    expect(cueDirection(0.84)).toBeNull();
    expect(cueDirection(-0.84)).toBeNull();
    expect(spawnCueText('ambush', 'WORM', 0)).toBeNull();
  });

  it('names right, left and behind from the bearing', () => {
    expect(cueDirection(1.2)).toBe('TO YOUR RIGHT');
    expect(cueDirection(-1.2)).toBe('TO YOUR LEFT');
    expect(cueDirection(Math.PI)).toBe('BEHIND YOU');
    expect(cueDirection(-2.6)).toBe('BEHIND YOU');
  });

  it('wraps bearings outside ±pi', () => {
    expect(cueDirection(Math.PI * 2 + 1.2)).toBe('TO YOUR RIGHT');
    expect(cueDirection(-Math.PI * 2 - 1.2)).toBe('TO YOUR LEFT');
  });
});

describe('spawn cue wording', () => {
  it('frames trigger spawns as an ambush', () => {
    expect(spawnCueText('ambush', 'WORM', 1.2)).toBe('AMBUSH — WORM MATERIALISED TO YOUR RIGHT');
    expect(spawnCueText('ambush', 'ROOTKIT', Math.PI)).toBe('AMBUSH — ROOTKIT MATERIALISED BEHIND YOU');
  });

  it('frames propagation copies as replication, not an ambush', () => {
    expect(spawnCueText('replica', 'WORM', 1.2)).toBe('WORM REPLICATED TO YOUR RIGHT');
    expect(spawnCueText('replica', 'WORM', -Math.PI)).toBe('WORM REPLICATED BEHIND YOU');
  });
});

describe('CueGate throttle', () => {
  it('allows at most one cue per interval', () => {
    const g = new CueGate(4);
    expect(g.allow(10)).toBe(true);
    expect(g.allow(11)).toBe(false);
    expect(g.allow(13.99)).toBe(false);
    expect(g.allow(14)).toBe(true);
    expect(g.allow(15)).toBe(false);
  });

  it('reset unblocks the next cue', () => {
    const g = new CueGate(4);
    g.allow(10);
    g.reset();
    expect(g.allow(10.5)).toBe(true);
  });
});
