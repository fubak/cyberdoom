import { describe, expect, it } from 'vitest';
import { AVATAR_BANDS, AVATAR_OUTLINE, avatarBand, lightAvatar } from '../src/render/avatarLight';
import { portraitKey, type FaceState } from '../src/tools/portrait';
import { SKIN_TONES } from '../src/tools/look';
import { DB_X } from '../src/ui/debrief-layout';
import { PLATE_RIVET_INSET } from '../src/ui/debrief';

/**
 * LOOK: the select-screen avatars are the portrait painter's figure run
 * through a lighting pass, and they follow the skin tone picker.
 */
const W = 40;
const H = 40;

/** A flat mid-grey disc on a clear ground. */
function disc(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x - 20, y - 20) <= 12) px.set([128, 128, 128, 255], (y * W + x) * 4);
    }
  }
  return px;
}
const at = (px: Uint8ClampedArray, x: number, y: number) => [...px.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

describe('avatar lighting pass', () => {
  it('bands run from shadow to highlight and the light comes from the upper left', () => {
    for (let i = 1; i < AVATAR_BANDS.length; i++) expect(AVATAR_BANDS[i]).toBeGreaterThan(AVATAR_BANDS[i - 1]);
    expect(avatarBand(-1, -1)).toBeGreaterThan(avatarBand(0, 0));
    expect(avatarBand(0, 0)).toBeGreaterThan(avatarBand(1, 1));
    expect(avatarBand(-9, -9)).toBe(AVATAR_BANDS.length - 1);
    expect(avatarBand(9, 9)).toBe(0);
  });

  it('lights the upper left of a flat shape and shades the lower right', () => {
    const px = lightAvatar(disc(), W, H, { k: 4 });
    const lit = lum(at(px, 14, 14));
    const mid = lum(at(px, 20, 20));
    const dark = lum(at(px, 26, 26));
    expect(lit).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(dark);
  });

  it('warms the lit edge and cools the shadow edge', () => {
    const px = lightAvatar(disc(), W, H, { k: 4 });
    const rim = at(px, 12, 12);
    const core = at(px, 28, 28);
    expect(rim[0]).toBeGreaterThan(rim[2]);
    expect(core[2]).toBeGreaterThan(core[0]);
  });

  it('draws a solid dark outline round the figure and leaves the rest clear', () => {
    const px = lightAvatar(disc(), W, H, { k: 4 });
    expect(at(px, 20, 7)).toEqual([...AVATAR_OUTLINE, 255]);
    expect(at(px, 33, 20)).toEqual([...AVATAR_OUTLINE, 255]);
    expect(at(px, 1, 1)[3]).toBe(0);
    expect(at(px, 20, 3)[3]).toBe(0);
    expect(at(px, 20, 20)[3]).toBe(255);
  });

  it('leaves an empty image alone', () => {
    const px = new Uint8ClampedArray(W * H * 4);
    expect([...lightAvatar(px, W, H, { k: 4 })].every((v) => v === 0)).toBe(true);
  });
});

describe('avatar follows the skin tone picker', () => {
  const st: FaceState = { integrity: 100, look: 0, blink: 0, talk: 0, ouch: false, grin: false, dead: false };

  it('every skin tone gives a different portrait key, so each is painted in its own tone', () => {
    const keys = SKIN_TONES.map((t) => portraitKey('female', st, 2, t.base));
    expect(new Set(keys).size).toBe(SKIN_TONES.length);
    expect(SKIN_TONES.length).toBe(5);
  });

  it('the key also separates the two analysts and the face states', () => {
    const base = SKIN_TONES[0].base;
    expect(portraitKey('male', st, 2, base)).not.toBe(portraitKey('female', st, 2, base));
    expect(portraitKey('male', { ...st, grin: true }, 2, base)).not.toBe(portraitKey('male', st, 2, base));
  });
});

describe('briefing and debrief plates', () => {
  it('corner rivets stay in the margin, clear of body text', () => {
    // the debrief body panel starts at x = 10; text starts at DB_X
    expect(10 + PLATE_RIVET_INSET + 2).toBeLessThanOrEqual(DB_X);
  });
});
