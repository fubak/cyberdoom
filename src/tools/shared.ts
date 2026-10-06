import type { Gender, ViewmodelAnim } from '../core/types';
import { ANALYSTS, skinTriple } from './look';
import { cylTone, outlineNative, painter, PartCache, weaveOpaque, type Painter } from '../render/hires';
import { pill, poly, rect, shade, type Ctx } from './pixel';

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

const parts = new PartCache<HTMLCanvasElement>(256);

/** [highlight, base, shadow, deep] from a skin triple [base, shadow, highlight]. */
function ramp(skin: [string, string, string]): string[] {
  return [skin[2], skin[0], skin[1], shade(skin[1], 0.72)];
}

/**
 * Forearm + sleeve from a wrist point down off the bottom of the screen.
 * `dir` pushes the elbow toward the screen edge (-1 left, +1 right).
 * Painted at native resolution and cached per (shape, look).
 */
export function sleeve(g: Ctx, wx: number, wy: number, ww: number, dir: number, look: HandLook, h = 200): void {
  wx = Math.round(wx);
  wy = Math.round(wy);
  const span = h + 2 - wy;
  if (span <= 0) return;
  const bw = ww * 1.9;
  const d = dir * (ww * 1.6 + (h - wy) * 0.35);
  const L = Math.floor(Math.min(-ww / 2 - 1, d - bw / 2, -4)) - 1;
  const Rr = Math.ceil(Math.max(ww / 2 + 1, d + bw / 2, 4)) + 1;
  const top = 5;
  const key = `s|${ww}|${dir}|${h - wy}|${look.gender}|${look.jacket}|${look.accent}`;
  const c = parts.get(key, () => {
    const P = painter(Rr - L, span + top);
    const ox = -L;
    const j = look.jacket;
    const u = 1 / P.k;
    const bx = ox + d;
    const B = span + top;
    P.poly([[ox - ww / 2, top], [ox + ww / 2, top], [bx + bw / 2, B], [bx - bw / 2, B]], j);
    P.poly([[ox + (dir > 0 ? -ww / 2 : ww / 2 - 3), top], [ox + (dir > 0 ? -ww / 2 + 3 : ww / 2), top],
      [bx + (dir > 0 ? -bw / 2 + 7 : bw / 2), B], [bx + (dir > 0 ? -bw / 2 : bw / 2 - 7), B]], shade(j, 0.6));
    P.poly([[ox + (dir > 0 ? -ww / 2 + 3 : ww / 2 - 3) - u, top], [ox + (dir > 0 ? -ww / 2 + 3 : ww / 2 - 3) + u, top],
      [bx + (dir > 0 ? -bw / 2 + 7 : bw / 2 - 7) + u, B], [bx + (dir > 0 ? -bw / 2 + 7 : bw / 2 - 7) - u, B]], shade(j, 0.75));
    P.poly([[ox - 1, top + 6], [ox + 1, top + 6], [bx + 2, B], [bx - 1, B]], shade(j, 1.25));
    P.poly([[ox - 1 + u, top + 6], [ox - 1 + 2 * u, top + 6], [bx - 1 + 2 * u, B], [bx - 1 + u, B]], shade(j, 1.45));
    // fabric folds pulling toward the elbow
    for (let f = 0; f < 3; f++) {
      const fy = top + 10 + f * Math.max(6, span / 5);
      if (fy > B - 2) break;
      const t = (fy - top) / (B - top);
      const cx = ox + (bx - ox) * t;
      const half = (ww / 2) + (bw / 2 - ww / 2) * t;
      P.line([[cx - half * 0.6, fy], [cx - half * 0.1, fy + 1.5], [cx + half * 0.5, fy + 0.5]], shade(j, 0.7));
      P.line([[cx - half * 0.6, fy - u], [cx - half * 0.1, fy + 1.5 - u], [cx + half * 0.5, fy + 0.5 - u]], shade(j, 1.12));
    }
    weaveOpaque(P, 0, top, Rr - L, span, 0.86);
    // cuff
    const cl = ox - ww / 2 - 1;
    P.rect(cl, top, ww + 2, 5, shade(j, 0.8));
    weaveOpaque(P, cl, top, ww + 2, 5, 0.84);
    P.rect(cl, top, ww + 2, 1, shade(j, 1.3));
    P.rect(cl, top + 1, ww + 2, u, shade(j, 1.5));
    for (let i = 0.5; i < ww + 1; i += 1.25) P.rect(cl + i, top + 1.75, 0.5, u, shade(j, 1.1));
    P.rect(cl, top + 5 - u, ww + 2, u, shade(j, 0.5));
    if (look.gender === 'male') {
      P.rect(cl, top + 3, ww + 2, 1, look.accent);
      P.rect(cl, top + 3, ww + 2, u, shade(look.accent, 1.4));
      P.dots(cl, top + 3, ww + 2, 1, '#ffffff', 0.14, 7);
    } else {
      // smartwatch peeking out above the cuff
      const x0 = ox - 4;
      P.rect(x0, 1, 8, 6, '#20242c');
      P.rect(x0, 1, 8, u, '#5a6070');
      P.rect(x0, 1, u, 6, '#3a3e48');
      P.rect(x0, 7 - u, 8, u, '#0c0e12');
      P.rect(x0 + 1, 2, 6, 3, '#0b2a2a');
      P.rect(x0 + 1.25, 2.5, 2, 0.75, look.accent);
      P.rect(x0 + 1.25, 3.75, 4, 2 * u, shade(look.accent, 0.7));
      P.rect(x0 + 4.5, 2.5, 1, 0.75, '#ff5a7a');
      P.rect(x0 + 6, 2, u, 1, '#ffffff');
    }
    return P.c;
  });
  g.drawImage(c, wx + L, wy - top, Rr - L, span + top);
}

/** A rounded finger band lying horizontally, shaded top-lit like a cylinder. */
function band(P: Painter, x: number, y: number, w: number, hgt: number, sk: string[]): void {
  const rows = Math.round(hgt * P.k);
  const u = 1 / P.k;
  const r = hgt / 2;
  for (let i = 0; i < rows; i++) {
    const dy = ((i + 0.5) / rows) * 2 - 1;
    const inset = r * (1 - Math.sqrt(Math.max(0, 1 - dy * dy)));
    P.rect(x + inset, y + i * u, w - 2 * inset, u, cylTone(sk, (i + 0.5) / rows));
  }
}

/**
 * A fist gripping something vertical. (x, y) = top-left of the finger stack.
 * `outer` = side the knuckles face (-1 left, +1 right).
 */
export function fist(g: Ctx, x: number, y: number, w: number, look: HandLook, outer: number): void {
  x = Math.round(x);
  y = Math.round(y);
  const fem = look.gender === 'female';
  const bandH = fem ? 4 : 5;
  const bands = 4;
  const hgt = bands * bandH;
  const ox = 7;
  const oy = bandH + 2;
  const W = w + 14;
  const H = hgt + bandH + 8;
  const key = `f|${w}|${outer}|${look.gender}|${look.skin.join()}`;
  const c = parts.get(key, () => {
    const P = painter(W, H);
    const sk = ramp(look.skin);
    const u = 1 / P.k;
    const nail = fem ? '#c83a6a' : shade(sk[0], 1.06);
    // back of hand / palm mass on the outer side
    const bx = outer > 0 ? ox + w - 6 : ox - 4;
    P.rect(bx, oy - 1, 10, hgt + 4, sk[2]);
    const pc = Math.round(8 * P.k);
    for (let i = 0; i < pc; i++) P.rect(bx + 1 + i * u, oy, u, hgt + 2, cylTone(sk, (i + 0.5) / pc, outer < 0));
    for (let t = 0; t < 3; t++) P.rect(bx + 2.5 + t * 2, oy + 1, u, hgt - 1, shade(sk[1], 0.9));
    P.dots(bx, oy, 10, hgt + 2, shade(sk[1], 0.9), 0.05, 13);
    for (let i = 0; i < bands; i++) {
      const by = oy + i * bandH;
      const bw = w - (i === bands - 1 ? 3 : 0) - (fem ? 1 : 0);
      const bxx = outer > 0 ? ox + (w - bw) : ox;
      band(P, bxx, by, bw, bandH, sk);
      P.dots(bxx + 1, by + 1, bw - 2, bandH - 2, shade(sk[1], 0.9), 0.05, 20 + i);
      // knuckle: lit bump + crease
      const kx = outer > 0 ? bxx + bw - 3 : bxx + 2;
      P.ell(kx + (outer > 0 ? -0.5 : 1.5), by + bandH * 0.4, 1, bandH * 0.22, sk[0]);
      P.rect(kx, by + 1, u, bandH - 2, sk[2]);
      P.rect(kx + (outer > 0 ? -u : u), by + 1, u, bandH - 2, shade(sk[2], 0.8));
      // fingertip + nail on the inner end
      const nx = outer > 0 ? bxx + 0.75 : bxx + bw - 2.25;
      P.rect(nx, by + 0.75, 1.5, bandH - 1.75, nail);
      P.rect(nx + u, by + 1, u, bandH - 2.5, shade(nail, 1.5));
      P.rect(outer > 0 ? bxx + 2.25 : bxx + bw - 2.25 - u, by + 1, u, bandH - 2, sk[2]);
      // gap to the next finger
      if (i < bands - 1) P.rect(bxx + 1, by + bandH - u, bw - 2, u, sk[3]);
    }
    // thumb over the top band from the inner side
    const tw = Math.round(w * 0.65);
    const tx = outer > 0 ? ox - 2 : ox + w - tw + 2;
    band(P, tx, oy - bandH + 1, tw, bandH, sk);
    P.rect(tx + 1, oy, tw - 2, u, sk[3]);
    const tnx = outer > 0 ? tx + 0.75 : tx + tw - 2.75;
    P.ell(tnx + 1, oy - bandH + 2.75, 1, 1.1, nail);
    P.rect(tnx + 0.5, oy - bandH + 2, u, 1, shade(nail, 1.5));
    outlineNative(P.g, P.c.width, P.c.height, 1, [20, 12, 10]);
    return P.c;
  });
  g.drawImage(c, x - ox, y - oy, W, H);
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
