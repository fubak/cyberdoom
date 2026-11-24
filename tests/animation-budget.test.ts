import { describe, expect, it } from 'vitest';
import { hasGenJob, runGenJob } from '../src/render/gen';
import { buildSprites, spriteSets } from '../src/render/sprites';
import { installFakeCanvas } from './fakecanvas';

/**
 * ANIMATION: every threat gets an 8-frame walk, an anticipation and a settle
 * around its strike, and a breathing idle — paid for by no longer storing the
 * three mirrored facings as separate textures.
 */
installFakeCanvas();
buildSprites();

const THREATS = ['worm', 'trojan', 'ransomware', 'rootkit', 'logicbomb', 'rat', 'botnet', 'wiper', 'boss-locker', 'boss-ghostledger', 'boss-phish', 'boss-zeroday'];
const POSES = ['walk0', 'walk7', 'attack0', 'attack1', 'pain', 'pain2', 'windup', 'settle', 'idle1', 'idle2'];

/** Rows from the top of a packed frame down to its first opaque row. */
function headroom(key: string): number {
  const p = runGenJob(key);
  for (let row = p.h - 1; row >= 0; row--) {
    for (let x = 0; x < p.w; x++) if (p.data[(row * p.w + x) * 4 + 3] > 0) return p.h - 1 - row;
  }
  return p.h;
}

describe('threat animation frames', () => {
  it('every threat has the full pose set in the five rendered facings', () => {
    for (const id of THREATS) {
      expect(spriteSets.require(id).walkN, id).toBe(8);
      for (const pose of POSES) for (let r = 0; r <= 4; r++) expect(hasGenJob(`sprite:${id}:${pose}_${r}`), `${id} ${pose}_${r}`).toBe(true);
    }
  });

  it('mirrored facings are not separate textures any more', () => {
    for (const id of THREATS) {
      for (const pose of POSES) for (const r of [5, 6, 7]) expect(hasGenJob(`sprite:${id}:${pose}_${r}`), `${id} ${pose}_${r}`).toBe(false);
      expect(Object.keys(spriteSets.require(id).frames).some((k) => /_[567]$/.test(k)), id).toBe(false);
    }
  });

  it('stores fewer or barely more frames per threat than before, with twice the walk', () => {
    // before: (4 walk + 4) poses x 8 facings = 64, or 96 for the two 8-walk threats; now 16 x 5
    for (const id of THREATS) {
      const frames = Object.keys(spriteSets.require(id).frames).filter((k) => /_\d$/.test(k)).length;
      expect(frames, id).toBe(80);
    }
  });

  // Some threats already touch the top of their canvas (the worm's antennae),
  // so silhouette height is only compared on the ones with room to move.
  const top = (id: string, pose: string): number => headroom(`sprite:${id}:${pose}_0`);
  const roomy = THREATS.filter((id) => top(id, 'attack0') > 12 && top(id, 'attack1') > 12 && top(id, 'walk0') > 12);

  it('the anticipation crouches below the raised pose and the settle rises above the strike', () => {
    expect(roomy.length).toBeGreaterThanOrEqual(3);
    for (const id of roomy) {
      expect(top(id, 'windup'), `${id} windup`).toBeGreaterThan(top(id, 'attack0'));
      expect(top(id, 'settle'), `${id} settle`).toBeLessThan(top(id, 'attack1'));
    }
  });

  it('the two idle frames breathe either side of the standing pose', () => {
    for (const id of roomy) {
      const stand = top(id, 'walk0');
      expect(top(id, 'idle1'), id).toBeLessThan(stand);
      expect(top(id, 'idle2'), id).toBeGreaterThan(stand);
    }
  });
});
