import type { Gender, ViewmodelAnim } from '../core/types';
import { ANALYSTS, skinTriple } from './look';
import { bevel, pill, poly, rect, shade, type Ctx } from './pixel';

/**
 * Shared viewmodel helpers for tools (ARSENAL): shaded, gendered analyst
 * hands and sleeves drawn as crisp pixel art. Ray wears a navy field jacket
 * with a hi-vis cuff stripe; Vega a teal jacket with a smartwatch. Skin tone
 * is chosen independently on the character-select screen.
 */

export interface HandLook {
  gender: Gender;
  skin: [string, string, string];
  jacket: string;
  accent: string;
}

export function handLook(gender: Gender, anim?: ViewmodelAnim): HandLook {
  const a = ANALYSTS[gender];
  return { gender, skin: anim?.skin ?? skinTriple(), jacket: a.jacket, accent: a.accent };
}

/**
 * Forearm + sleeve from a wrist point down off the bottom of the screen.
 * `dir` pushes the elbow toward the screen edge (-1 left, +1 right).
 */
export function sleeve(g: Ctx, wx: number, wy: number, ww: number, dir: number, look: HandLook, h = 200): void {
  const bw = ww * 1.9;
  const bx = wx + dir * (ww * 1.6 + (h - wy) * 0.35);
  const j = look.jacket;
  poly(g, [[wx - ww / 2, wy], [wx + ww / 2, wy], [bx + bw / 2, h + 2], [bx - bw / 2, h + 2]], j);
  // shading: far side darker, fold highlight
  poly(g, [[wx + (dir > 0 ? -ww / 2 : ww / 2 - 3), wy], [wx + (dir > 0 ? -ww / 2 + 3 : ww / 2), wy],
    [bx + (dir > 0 ? -bw / 2 + 7 : bw / 2), h + 2], [bx + (dir > 0 ? -bw / 2 : bw / 2 - 7), h + 2]], shade(j, 0.6));
  poly(g, [[wx - 1, wy + 6], [wx + 1, wy + 6], [bx + 2, h + 2], [bx - 1, h + 2]], shade(j, 1.25));
  // cuff
  rect(g, wx - ww / 2 - 1, wy, ww + 2, 5, shade(j, 0.8));
  rect(g, wx - ww / 2 - 1, wy, ww + 2, 1, shade(j, 1.3));
  if (look.gender === 'male') {
    rect(g, wx - ww / 2 - 1, wy + 3, ww + 2, 1, look.accent);
  } else {
    // smartwatch peeking out above the cuff
    bevel(g, wx - 4, wy - 4, 8, 6, '#20242c');
    rect(g, wx - 3, wy - 3, 6, 3, '#0b2a2a');
    rect(g, wx - 2, wy - 2, 2, 1, look.accent);
  }
}

/**
 * A fist gripping something vertical. (x, y) = top-left of the finger stack.
 * `outer` = side the knuckles face (-1 left, +1 right).
 */
export function fist(g: Ctx, x: number, y: number, w: number, look: HandLook, outer: number): void {
  const [base, sh, hi] = look.skin;
  const fem = look.gender === 'female';
  const bandH = fem ? 4 : 5;
  const bands = 4;
  const hgt = bands * bandH;
  // back of hand / palm mass on the outer side
  const bx = outer > 0 ? x + w - 6 : x - 4;
  rect(g, bx, y - 1, 10, hgt + 4, sh);
  rect(g, bx + (outer > 0 ? 2 : 1), y, 6, hgt + 2, base);
  for (let i = 0; i < bands; i++) {
    const by = y + i * bandH;
    const bw = w - (i === bands - 1 ? 3 : 0) - (fem ? 1 : 0);
    const bxx = outer > 0 ? x + (w - bw) : x;
    pill(g, bxx, by, bw, bandH, base);
    rect(g, bxx + 1, by, bw - 2, 1, hi);
    rect(g, bxx + 1, by + bandH - 1, bw - 2, 1, sh);
    // knuckle crease
    rect(g, outer > 0 ? bxx + bw - 3 : bxx + 2, by + 1, 1, bandH - 2, sh);
    if (fem) rect(g, outer > 0 ? bxx + 1 : bxx + bw - 3, by + 1, 2, bandH - 2, shade(base, 1.12));
  }
  // thumb over the top band from the inner side
  const tw = Math.round(w * 0.65);
  const tx = outer > 0 ? x - 2 : x + w - tw + 2;
  pill(g, tx, y - bandH + 1, tw, bandH, base);
  rect(g, tx + 1, y - bandH + 1, tw - 2, 1, hi);
  rect(g, tx + 1, y, tw - 2, 1, sh);
  rect(g, outer > 0 ? tx + 1 : tx + tw - 3, y - bandH + 2, 2, 2, shade(hi, 1.1));
}

/**
 * Back of a flat hand seen from above, fingers pointing up-screen.
 * (cx, y) = top-centre of the longest finger. `side` -1 = left hand.
 */
export function flatHand(g: Ctx, cx: number, y: number, len: number, look: HandLook, side: number, curl = 0): void {
  const [base, sh, hi] = look.skin;
  const fw = look.gender === 'female' ? 4 : 5;
  const lens = [len - 2, len, len - 1, len - 5];
  const total = fw * 4 + 3;
  const left = Math.round(cx - total / 2);
  const palmTop = y + len - 1;
  // palm / back of hand
  poly(g, [[left - 1, palmTop], [left + total + 1, palmTop], [left + total + 3, palmTop + 14], [left - 3, palmTop + 14]], base);
  rect(g, left, palmTop + 10, total, 4, sh);
  for (let i = 0; i < 4; i++) {
    const fi = side < 0 ? 3 - i : i; // index finger toward the thumb side
    const l = Math.max(4, lens[fi] - (fi === 0 ? curl : 0));
    const fx = left + i * (fw + 1);
    const fy = palmTop - l + 1;
    pill(g, fx, fy, fw, l + 2, base);
    rect(g, fx + 1, fy + 1, 1, l - 1, hi);
    rect(g, fx + fw - 1, fy + 2, 1, l - 1, sh);
    // nail + knuckle
    rect(g, fx + 1, fy, fw - 2, 2, shade(hi, 1.1));
    rect(g, fx, palmTop + 1, fw, 1, sh);
  }
  // thumb
  const thx = side < 0 ? left + total : left - 6;
  poly(g, side < 0
    ? [[thx - 1, palmTop + 3], [thx + 4, palmTop - 2], [thx + 7, palmTop], [thx + 2, palmTop + 9]]
    : [[thx + 7, palmTop + 3], [thx + 2, palmTop - 2], [thx - 1, palmTop], [thx + 4, palmTop + 9]], base);
  rect(g, side < 0 ? thx + 3 : thx + 1, palmTop - 1, 2, 2, hi);
}

/** Legacy simple hand used by older callers. */
export function drawHand(g: Ctx, x: number, y: number, gender: Gender): void {
  const look = handLook(gender);
  fist(g, x, y, 16, look, 1);
}
