import { describe, expect, it } from 'vitest';
import { drawFinger, fingerOutline, skinTones, type HandPen, type Pt } from '../src/render/vmHand';
import { lightViewmodel, type RGB } from '../src/render/vmLight';
import { ENTER_KEY, drawTypingHands, keyboardFidget, type KeyboardFidget, type KeyboardHandFrame } from '../src/render/vmKeyboardHands';

/** ARSENAL: shared finger construction and the baked viewmodel lighting pass. */

const TONES = skinTones(['#5a3a22', '#8a5c35', '#b98455', '#d29f6f']);

function recorder(): { pen: HandPen; calls: { kind: string; color: string; pts: Pt[] }[] } {
  const calls: { kind: string; color: string; pts: Pt[] }[] = [];
  return {
    calls,
    pen: {
      poly: (color, pts) => calls.push({ kind: 'poly', color, pts }),
      line: (pts, color) => calls.push({ kind: 'line', color, pts }),
      ell: (color, x, y) => calls.push({ kind: 'ell', color, pts: [[x, y]] }),
    },
  };
}

describe('finger construction', () => {
  it('derives a warm turn tone and a pale nail from the four-step ramp', () => {
    expect(TONES.warm).not.toBe(TONES.shadow);
    expect(TONES.warm).not.toBe(TONES.base);
    const warm = parseInt(TONES.warm.slice(1, 3), 16) - parseInt(TONES.warm.slice(5, 7), 16);
    const base = parseInt(TONES.base.slice(1, 3), 16) - parseInt(TONES.base.slice(5, 7), 16);
    expect(warm).toBeGreaterThan(base * 0.9); // at least as red-leaning as the base tone
    expect(parseInt(TONES.nail.slice(1, 3), 16)).toBeGreaterThan(parseInt(TONES.highlight.slice(1, 3), 16));
  });

  it('tapers from knuckle to tip', () => {
    const o = fingerOutline({ knuckle: [20, 10], tip: [4, 10], r0: 2, r1: 1.2 });
    const widthAtKnuckle = Math.abs(o[0][1] - o[6][1]);
    const widthAtTip = Math.abs(o[2][1] - o[4][1]);
    expect(widthAtKnuckle).toBeCloseTo(4, 5);
    expect(widthAtTip).toBeCloseTo(2.4, 5);
  });

  it('raises the middle joint by the bend', () => {
    const flat = fingerOutline({ knuckle: [20, 10], tip: [4, 10], r0: 2, r1: 1.2 });
    const bent = fingerOutline({ knuckle: [20, 10], tip: [4, 10], r0: 2, r1: 1.2, bend: 1 });
    expect(bent[1][1]).toBeCloseTo(flat[1][1] - 1, 5);
  });

  it('paints outline, shadow, warm band, lit top, ridge, crease, nail and knuckle', () => {
    const { pen, calls } = recorder();
    drawFinger(pen, TONES, { knuckle: [20, 10], tip: [4, 10], r0: 2, r1: 1.2 });
    const used = new Set(calls.map((c) => c.color));
    for (const tone of [TONES.deep, TONES.shadow, TONES.warm, TONES.base, TONES.highlight, TONES.nail]) expect(used.has(tone)).toBe(true);
    // lit side is the top: the highlight ridge sits above the finger's axis
    const ridge = calls.find((c) => c.kind === 'line' && c.color === TONES.highlight)!;
    expect(ridge.pts.every((p) => p[1] < 10)).toBe(true);
  });

  it('omits the nail when asked (finger seen from the pad side)', () => {
    const { pen, calls } = recorder();
    drawFinger(pen, TONES, { knuckle: [20, 10], tip: [4, 10], r0: 2, r1: 1.2, nail: false });
    expect(calls.some((c) => c.color === TONES.nail)).toBe(false);
  });
});

describe('lightViewmodel', () => {
  const W = 60;
  const H = 60;
  const SKIN: RGB = [185, 132, 85];
  function canvas(paint: (x: number, y: number) => [number, number, number, number] | null): Uint8ClampedArray {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = paint(x, y);
      if (c) d.set(c, (y * W + x) * 4);
    }
    return d;
  }
  const px = (d: Uint8ClampedArray, x: number, y: number) => [d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2]];
  const sum = (c: number[]) => c[0] + c[1] + c[2];
  const slab = (x: number, y: number): [number, number, number, number] | null => (x >= 8 && x < 52 && y >= 8 && y < 52 ? [120, 124, 130, 255] : null);

  it('never changes alpha and does not mutate its input', () => {
    const src = canvas(slab);
    const before = src.slice();
    const out = lightViewmodel(src, W, H, [SKIN]);
    expect(src).toEqual(before);
    for (let i = 3; i < src.length; i += 4) expect(out[i]).toBe(src[i]);
  });

  it('darkens the art toward the bottom of the frame', () => {
    const out = lightViewmodel(canvas(slab), W, H, [SKIN]);
    expect(sum(px(out, 30, 14))).toBeGreaterThan(sum(px(out, 30, 46)) + 40);
  });

  it('lights upper-left edges', () => {
    const out = lightViewmodel(canvas(slab), W, H, [SKIN]);
    expect(sum(px(out, 9, 30))).toBeGreaterThan(sum(px(out, 30, 30)) + 60);
  });

  it('casts a shadow from skin onto the tool, down and to the right only', () => {
    const withHand = (x: number, y: number): [number, number, number, number] | null =>
      x >= 20 && x < 30 && y >= 20 && y < 30 ? [...SKIN, 255] : slab(x, y);
    const out = lightViewmodel(canvas(withHand), W, H, [SKIN]);
    const plain = lightViewmodel(canvas(slab), W, H, [SKIN]);
    expect(sum(px(out, 33, 35))).toBeLessThan(sum(px(plain, 33, 35)) - 40); // below-right of the hand
    expect(sum(px(out, 14, 14))).toBe(sum(px(plain, 14, 14))); // up-left: untouched
    // skin itself is not shadowed by skin
    expect(px(out, 25, 25)[0]).toBeGreaterThan(150);
  });

  it('spills a bright saturated texel onto its neighbours and leaves it as painted', () => {
    const withLed = (x: number, y: number): [number, number, number, number] | null =>
      x >= 28 && x < 32 && y >= 28 && y < 32 ? [0, 240, 255, 255] : slab(x, y);
    const out = lightViewmodel(canvas(withLed), W, H, [SKIN]);
    const plain = lightViewmodel(canvas(slab), W, H, [SKIN]);
    expect(px(out, 36, 30)[2]).toBeGreaterThan(px(plain, 36, 30)[2] + 4);
    expect(px(out, 36, 30)[0]).toBeLessThanOrEqual(px(plain, 36, 30)[0] + 1); // cyan adds no red
  });

  it('keeps the dark outline dark', () => {
    const outlined = (x: number, y: number): [number, number, number, number] | null => {
      const s = slab(x, y);
      if (!s) return null;
      return x < 10 || y < 10 || x >= 50 || y >= 50 ? [8, 6, 10, 255] : s;
    };
    const out = lightViewmodel(canvas(outlined), W, H, [SKIN]);
    expect(px(out, 8, 30)).toEqual([8, 6, 10]);
  });
});

describe('typing hands on the keyboard', () => {
  const HOME_RIGHT: Pt[] = [[88.6, 36.2], [94.4, 35.3], [100.1, 35.6], [105.9, 36.7]];
  const look = { jacket: '#1f3f8a', accent: '#ff8a1e', seam: '#30201b' };
  const centres = (frame: KeyboardHandFrame, fidget: KeyboardFidget = '') => {
    const { pen, calls } = recorder();
    drawTypingHands(pen, TONES, look, frame, fidget);
    return calls.filter((c) => c.kind === 'ell').map((c) => c.pts[0]);
  };
  const has = (pts: Pt[], p: Pt) => pts.some((q) => Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01);

  it('rests every fingertip on its home key, both hands', () => {
    const c = centres('rest');
    for (const tip of HOME_RIGHT) {
      expect(has(c, tip)).toBe(true); // J K L ;
      expect(has(c, [160 - tip[0], tip[1]])).toBe(true); // F D S A
    }
  });

  it('lands the right little finger on Enter at contact', () => {
    expect(has(centres('contact'), ENTER_KEY)).toBe(true);
    expect(has(centres('rest'), ENTER_KEY)).toBe(false);
  });

  it('lifts one finger off its key for an idle fidget', () => {
    expect(has(centres('rest', 'R'), HOME_RIGHT[1])).toBe(false); // right middle is up
    expect(has(centres('rest', 'R'), HOME_RIGHT[0])).toBe(true);
    expect(has(centres('rest', 'L'), [160 - HOME_RIGHT[0][0], HOME_RIGHT[0][1]])).toBe(false); // left index is up
    // a fidget never plays over a strike frame
    expect(centres('contact', 'R')).toEqual(centres('contact'));
  });

  it('fidgets briefly twice per loop and is otherwise still', () => {
    expect(keyboardFidget(0)).toBe('');
    expect(keyboardFidget(1.15)).toBe('L');
    expect(keyboardFidget(2.95)).toBe('R');
    expect(keyboardFidget(4.2 + 1.15)).toBe('L');
    expect(keyboardFidget(2)).toBe('');
  });
});
