import { describe, expect, it } from 'vitest';
import { drawFinger, skinTones, type HandPen, type Pt } from '../src/render/vmHand';
import { drawTypingHands } from '../src/render/vmKeyboardHands';
import { FEMALE_HAND_SCALE, handScale, NAIL_BARE, NAIL_POLISH, NAIL_POLISH_GLINT, nailColor } from '../src/tools/look';

/**
 * ARSENAL: Vega's hands are a little smaller than Ray's and wear nail polish.
 */
const RAMP: [string, string, string, string] = ['#5a3a22', '#8a5c35', '#b98455', '#d29f6f'];
const LOOK = { jacket: '#1f5f5c', accent: '#3ee8d0', seam: '#30201b' };

interface Shape { color: string; pts: Pt[] }

function recorder(): { pen: HandPen; polys: Shape[]; lines: Shape[] } {
  const polys: Shape[] = [];
  const lines: Shape[] = [];
  return {
    polys,
    lines,
    pen: {
      poly: (color, pts) => polys.push({ color, pts }),
      line: (pts, color) => lines.push({ color, pts }),
      ell: () => undefined,
    },
  };
}

const area = (pts: Pt[]): number =>
  Math.abs(pts.reduce((s, [x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]; return s + x * ny - nx * y; }, 0)) / 2;

describe('nail polish', () => {
  it('only the female analyst wears it', () => {
    expect(nailColor('female')).toBe(NAIL_POLISH);
    expect(nailColor('male')).toBe(NAIL_BARE);
  });

  it('replaces the natural nail tone and adds a glint', () => {
    const bare = skinTones(RAMP);
    const polished = skinTones(RAMP, { color: NAIL_POLISH, gloss: NAIL_POLISH_GLINT });
    expect(polished.nail).toBe(NAIL_POLISH);
    expect(polished.gloss).toBe(NAIL_POLISH_GLINT);
    expect(bare.nail).not.toBe(NAIL_POLISH);
    expect(bare.gloss).toBeUndefined();
    // the rest of the ramp is untouched
    expect(polished.base).toBe(bare.base);
    expect(polished.shadow).toBe(bare.shadow);
  });

  it('a polished finger draws its nail in the polish colour with one glint line', () => {
    const spec = { knuckle: [10, 20] as Pt, tip: [10, 8] as Pt, r0: 2.3, r1: 1.9 };
    const a = recorder();
    drawFinger(a.pen, skinTones(RAMP, { color: NAIL_POLISH, gloss: NAIL_POLISH_GLINT }), spec);
    expect(a.polys.filter((p) => p.color === NAIL_POLISH)).toHaveLength(1);
    expect(a.lines.filter((l) => l.color === NAIL_POLISH_GLINT)).toHaveLength(1);
    const b = recorder();
    drawFinger(b.pen, skinTones(RAMP), spec);
    expect(b.polys.some((p) => p.color === NAIL_POLISH)).toBe(false);
    expect(b.lines.some((l) => l.color === NAIL_POLISH_GLINT)).toBe(false);
  });
});

describe('hand size', () => {
  it('the female hand is slightly smaller, the male hand is unchanged', () => {
    expect(handScale('male')).toBe(1);
    expect(handScale('female')).toBe(FEMALE_HAND_SCALE);
    expect(FEMALE_HAND_SCALE).toBeLessThan(1);
    expect(FEMALE_HAND_SCALE).toBeGreaterThanOrEqual(0.85);
  });

  it('scaling the typing hands shrinks the back of the hand but keeps the forearm reaching the frame edge', () => {
    const tones = skinTones(RAMP);
    const full = recorder();
    drawTypingHands(full.pen, tones, LOOK, 'rest');
    const small = recorder();
    drawTypingHands(small.pen, tones, { ...LOOK, scale: FEMALE_HAND_SCALE }, 'rest');
    expect(small.polys).toHaveLength(full.polys.length);

    const skinArea = (r: ReturnType<typeof recorder>) => r.polys.filter((p) => p.color === tones.shadow).reduce((s, p) => s + area(p.pts), 0);
    expect(skinArea(small)).toBeLessThan(skinArea(full));
    expect(skinArea(small)).toBeGreaterThan(skinArea(full) * 0.7);

    const lowest = (r: ReturnType<typeof recorder>) => Math.max(...r.polys.flatMap((p) => p.pts.map((q) => q[1])));
    expect(Math.abs(lowest(small) - lowest(full))).toBeLessThan(0.5);
    expect(lowest(small)).toBeGreaterThanOrEqual(80);
  });
});
