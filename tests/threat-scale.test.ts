import { describe, expect, it } from 'vitest';
import { FAR0, FAR_SCALE_CAP, LOOM_FILL_FRAC, farScale } from '../src/render/melee';
import { THREAT_SCALE, buildSprites, spriteSets } from '../src/render/sprites';
import { WALL_H } from '../src/render/textures';
import { installFakeCanvas } from './fakecanvas';

/**
 * ENEMIES: threats used to stand taller than the rooms they were in. They are
 * now sized against a person and the ceiling, and the far boost makes up the
 * difference so a distant threat covers what it did before.
 */
installFakeCanvas();
buildSprites();

const REGULAR = ['worm', 'trojan', 'ransomware', 'rootkit', 'logicbomb', 'rat', 'botnet', 'wiper'];
/** World height of a person (the NPC model set in sprites.ts). */
const PERSON_H = 0.98;
const BOSSES = ['boss-locker', 'boss-ghostledger', 'boss-phish', 'boss-zeroday'];

describe('threat world size', () => {
  it('a regular threat fits under the ceiling and is no more than a head taller than a person', () => {
    const person = PERSON_H;
    for (const id of REGULAR) {
      const h = spriteSets.require(id).h;
      expect(h, id).toBeLessThan(WALL_H);
      expect(h, id).toBeLessThanOrEqual(person * 1.2);
      expect(h, id).toBeGreaterThanOrEqual(person * 0.95);
    }
  });

  it('a boss is bigger than every regular threat but not more than 1.25 walls tall', () => {
    const tallest = Math.max(...REGULAR.map((id) => spriteSets.require(id).h));
    for (const id of BOSSES) {
      const h = spriteSets.require(id).h;
      expect(h, id).toBeGreaterThan(tallest);
      expect(h, id).toBeLessThanOrEqual(WALL_H * 1.25);
    }
  });

  it('sprites stay square in the world', () => {
    for (const id of [...REGULAR, ...BOSSES]) expect(spriteSets.require(id).w, id).toBe(spriteSets.require(id).h);
  });
});

describe('far boost', () => {
  it('leaves the smaller size alone inside FAR0', () => {
    expect(farScale(0)).toBe(1);
    expect(farScale(FAR0)).toBe(1);
  });

  it('gives a threat at 15 tiles the screen size it had before the shrink', () => {
    const before = 1 + 0.035 * (15 - FAR0);
    expect(THREAT_SCALE * farScale(15)).toBeCloseTo(before, 2);
  });

  it('never makes a far threat bigger than its old capped size', () => {
    expect(THREAT_SCALE * FAR_SCALE_CAP).toBeLessThanOrEqual(1.45);
    expect(farScale(60)).toBe(FAR_SCALE_CAP);
  });

  it('a lunging threat fills about a third of the view, not half', () => {
    expect(LOOM_FILL_FRAC).toBeLessThanOrEqual(0.38);
    expect(LOOM_FILL_FRAC).toBeGreaterThanOrEqual(0.3);
  });
});
