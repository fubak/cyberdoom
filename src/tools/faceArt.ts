import type { Painter } from '../render/hires';
import { shade } from './pixel';

/**
 * LOOK: the analysts' heads, drawn from scratch on the 24-unit portrait grid.
 * The old faces were one flat skin polygon with a wedge of shadow; these are
 * built as forms: a skull with a turned side plane, eye sockets, cheekbones
 * and a chin, a nose with a bridge, wings and a lit tip, hair laid in masses
 * and strands, and a bust with lapels and a collar. Light is from the upper
 * left throughout. The eye, brow and mouth states are drawn on top by
 * portrait.ts and keep their positions (EYE_Y, EYE_X, the mouth at y 16).
 */

export const EYE_Y = 10.7;
export const EYE_X: readonly [number, number] = [9.4, 14.6];

export interface FaceLook {
  female: boolean;
  dead: boolean;
  /** Skin after the damage tint. */
  sk: string;
  hair: string;
  jacket: string;
  accent: string;
}

type Pt = [number, number];

/** Head outlines. They stay inside the old silhouettes so the damage overlays still land on skin. */
export const HEAD_MALE: Pt[] = [
  [6.2, 7], [6.6, 4.6], [8.6, 3], [12, 2.6], [15.4, 3], [17.4, 4.6], [17.8, 7], [17.8, 12.6],
  [16.9, 15.6], [14.8, 17.8], [13.1, 18.3], [10.9, 18.3], [9.2, 17.8], [7.1, 15.6], [6.2, 12.6],
];
export const HEAD_FEMALE: Pt[] = [
  [6.7, 7], [7.1, 4.8], [8.9, 3.3], [12, 2.9], [15.1, 3.3], [16.9, 4.8], [17.3, 7], [17.3, 12.2],
  [16.3, 15.1], [14.3, 17.3], [12.9, 17.95], [11.1, 17.95], [9.7, 17.3], [7.7, 15.1], [6.7, 12.2],
];

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Skin ramp from one base: deep shadow, shadow, half-tone, base, light, highlight. Shadows lean cool, lights warm. */
export function skinRamp(sk: string): { dd: string; d: string; m: string; b: string; l: string; h: string } {
  return {
    dd: mix(shade(sk, 0.58), '#2a1830', 0.18),
    d: mix(shade(sk, 0.76), '#3a2238', 0.1),
    m: shade(sk, 0.89),
    b: sk,
    l: mix(shade(sk, 1.08), '#fff0d0', 0.08),
    h: mix(shade(sk, 1.16), '#fff4dc', 0.2),
  };
}

function bust(P: Painter, L: FaceLook): void {
  const lw = (units: number) => Math.max(1, Math.round(units * P.k));
  const s = skinRamp(L.sk);
  const j = L.jacket;
  // neck: a column with the head's shadow across the top and its own side plane
  P.poly([[9.3, 14.6], [14.7, 14.6], [15.1, 19.8], [8.9, 19.8]], s.m);
  P.poly([[12.6, 14.6], [14.7, 14.6], [15.1, 19.8], [13.2, 19.8]], s.d);
  P.ell(12, 16.5, 3.3, 1.7, s.dd);
  P.rect(9.5, 17.6, 0.9, 2, s.b);
  // shoulders
  P.poly([[0, 24], [0.4, 21.5], [4.6, 19.5], [8.7, 18.6], [15.3, 18.6], [19.4, 19.5], [23.6, 21.5], [24, 24]], j);
  P.poly([[15.3, 18.6], [19.4, 19.5], [23.6, 21.5], [24, 24], [16.6, 24], [15.6, 20.6]], shade(j, 0.78));
  P.dots(0, 19.4, 24, 4.6, shade(j, 0.84), 0.1, 4);
  P.line([[0.4, 21.5], [4.6, 19.5], [8.7, 18.6]], shade(j, 1.5), lw(0.4));
  P.line([[15.3, 18.6], [19.4, 19.5], [23.6, 21.5]], shade(j, 1.12), lw(0.3));
  // seams and a fold under each shoulder
  P.line([[3.4, 20.2], [2.6, 24]], shade(j, 0.68));
  P.line([[20.6, 20.2], [21.4, 24]], shade(j, 0.6));
  P.line([[5.6, 21.6], [6.6, 24]], shade(j, 1.18));
  // shirt in the V of the jacket
  P.poly([[9.2, 18.8], [14.8, 18.8], [13.4, 22.6], [12, 24], [10.6, 22.6]], '#e9edf3');
  P.poly([[12, 18.8], [14.8, 18.8], [13.4, 22.6], [12, 24]], '#c2cad8');
  P.ell(12, 19, 2.7, 0.8, '#9aa4b6');
  P.poly([[10.9, 20.9], [13.1, 20.9], [12, 24]], L.accent);
  P.poly([[12, 20.9], [13.1, 20.9], [12, 24]], shade(L.accent, 0.72));
  // lapels: the left one catches the light
  P.poly([[8.7, 18.6], [10, 18.9], [11, 24], [7, 24], [7.6, 20.4]], shade(j, 1.22));
  P.poly([[15.3, 18.6], [14, 18.9], [13, 24], [17, 24], [16.4, 20.4]], shade(j, 0.92));
  P.line([[8.7, 18.6], [7.6, 20.4], [7, 24]], shade(j, 1.6));
  P.line([[10, 18.9], [11, 24]], shade(j, 0.6));
  P.line([[14, 18.9], [13, 24]], shade(j, 0.55));
  // lanyard
  P.line([[8.9, 18.7], [10.7, 24]], L.accent, lw(0.35));
  P.line([[15.1, 18.7], [13.3, 24]], shade(L.accent, 0.8), lw(0.35));
}

function skull(P: Painter, L: FaceLook): void {
  const s = skinRamp(L.sk);
  const R = L.female ? 17.3 : 17.8;
  const Lx = L.female ? 6.7 : 6.2;
  // ears first, so the head overlaps their inner edge
  P.ell(Lx - 0.25, 11.5, 0.95, 1.75, s.m);
  P.ell(Lx - 0.1, 11.6, 0.45, 1.05, s.d);
  P.ell(R + 0.25, 11.5, 0.95, 1.75, s.d);
  P.ell(R + 0.1, 11.6, 0.45, 1.05, s.dd);
  P.poly(L.female ? HEAD_FEMALE : HEAD_MALE, s.b);
  // the far side of the head turns away from the light: half-tone, then shadow at the edge
  P.poly([[R - 2.5, 4.4], [R - 0.4, 5], [R, 7], [R, 12.4], [R - 0.95, 15.4], [R - 3.1, 17.6], [R - 4.3, 17.3], [R - 2.7, 14.6], [R - 2.1, 11.2], [R - 2.2, 7.4]], s.m);
  P.dots(R - 3.4, 5.6, 1.3, 10.6, s.m, 0.42, 8);
  P.poly([[R - 0.95, 6.2], [R, 7], [R, 12.4], [R - 0.95, 15.4], [R - 2.7, 17.3], [R - 1.9, 14.7], [R - 1.15, 11.4], [R - 1.1, 8]], s.d);
  P.dots(R - 2, 7, 1, 8.4, s.d, 0.36, 12);
  // brow ridge and eye sockets
  P.ell(EYE_X[0], EYE_Y - 0.5, 2.2, 1.35, s.m);
  P.ell(EYE_X[1], EYE_Y - 0.5, 2.2, 1.35, s.d);
  P.ell(EYE_X[0] - 0.2, EYE_Y - 0.9, 1.5, 0.6, s.d);
  P.ell(EYE_X[1] + 0.2, EYE_Y - 0.9, 1.5, 0.6, s.dd);
  // forehead, lit cheekbone and chin
  P.ell(10.1, 6.3, 2.7, 1.25, s.l);
  P.ell(9.3, 5.9, 1.3, 0.55, s.h);
  P.ell(8.5, 12.7, 1.25, 0.95, s.l);
  P.ell(8.2, 12.4, 0.5, 0.35, s.h);
  P.ell(15.4, 12.8, 1.1, 0.8, s.m);
  // hollow under each cheekbone, running to the jaw
  P.dots(7.3, 14, 1.9, 2.3, s.m, 0.5, 31);
  P.dots(14.9, 14, 1.8, 2.5, s.d, 0.5, 32);
  // chin: a lit knob over the shadow where it turns under
  P.ell(12, 17.5, 2.3, 0.7, s.m);
  P.ell(11.6, 16.95, 1.05, 0.5, s.l);
  if (L.female) {
    const blush = mix(L.sk, '#d85a6a', 0.24);
    P.ell(8.6, 13.4, 1.25, 0.6, blush);
    P.ell(15.5, 13.4, 1.1, 0.55, mix(s.m, '#d85a6a', 0.22));
  }
}

function beard(P: Painter, L: FaceLook): void {
  const base = mix(L.sk, L.hair, 0.6);
  const dark = mix(L.sk, L.hair, 0.86);
  const lite = mix(L.sk, L.hair, 0.4);
  // sideburn down the jaw, under the chin and back up: a short boxed beard
  P.poly([
    [6.3, 10.6], [7.2, 12.4], [8.4, 14.1], [10, 14.9], [12, 15.3], [14, 14.9], [15.6, 14.1], [16.8, 12.4], [17.7, 10.6],
    [17.8, 12.6], [16.9, 15.6], [14.8, 17.8], [13.1, 18.3], [10.9, 18.3], [9.2, 17.8], [7.1, 15.6], [6.2, 12.6],
  ], base);
  // texture stays inside the beard: lighter where the light lands, denser on the far jaw and under the chin
  P.dots(7.4, 14.6, 3.4, 2.8, lite, 0.3, 9);
  P.dots(13.4, 14.8, 3.2, 2.8, dark, 0.5, 10);
  P.dots(9.4, 16.6, 5.2, 1.6, dark, 0.34, 11);
  // the cheek line feathers out instead of ending on a hard edge
  P.dots(7.2, 12.6, 1.6, 1.4, base, 0.4, 13);
  P.dots(15.4, 12.6, 1.6, 1.4, base, 0.45, 14);
  // moustache, parted under the nose
  P.poly([[9.7, 15.5], [10.2, 14.7], [11.7, 14.5], [12, 14.8], [12.3, 14.5], [13.8, 14.7], [14.3, 15.5], [13, 15.25], [12, 15.4], [11, 15.25]], dark);
  P.dots(9.8, 14.5, 2.2, 0.9, lite, 0.25, 15);
  // the lower lip shows through, with the soul patch under it
  P.ell(12, 16.55, 1.5, 0.5, mix(L.sk, L.hair, 0.3));
  P.poly([[11.3, 16.9], [12.7, 16.9], [12.4, 17.8], [11.6, 17.8]], dark);
}

function hairFront(P: Painter, L: FaceLook): void {
  const lw = (units: number) => Math.max(1, Math.round(units * P.k));
  const u = 1 / P.k;
  const h = L.hair;
  const hM = shade(h, 1.32);
  const hL = shade(h, 1.8);
  const hD = shade(h, 0.68);
  if (L.female) {
    // side part high on the left; the fringe sweeps across the forehead and tucks behind the far ear
    P.poly([
      [5.7, 12.6], [5.2, 7.2], [6.6, 3.5], [9.3, 1.6], [12.6, 1.2], [15.7, 2], [17.9, 4.4], [18.9, 8], [18.5, 12.2],
      [17.5, 8.6], [16.4, 6.2], [14.4, 5], [12, 5.2], [10, 6.6], [8.4, 8.6], [7.3, 10.8], [7, 12.6],
    ], h);
    P.poly([[13.4, 1.4], [15.7, 2], [17.9, 4.4], [18.9, 8], [18.5, 12.2], [17.5, 8.6], [16.4, 6.2], [15, 5.2], [15.6, 3.4]], hD);
    // strands follow the sweep from the part
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      P.line([[9.6 + t * 5.4, 1.9 + t * 0.5], [8.6 + t * 5.2, 4 + t * 0.4], [7.2 + t * 6, 6.6 + t * 0.2 - Math.sin(t * 3) * 0.3]], i % 2 ? hM : hD);
    }
    P.line([[9.4, 2], [8, 4.2], [6.6, 7], [6, 11.6]], hM);
    P.line([[9.8, 1.8], [12.4, 1.6], [14.6, 2]], hL, lw(0.3));
    P.line([[8.6, 3.2], [7.6, 5]], hL, lw(0.3));
    // shadow the fringe casts on the forehead
    const s = skinRamp(L.sk);
    P.line([[14.6, 5.25], [12, 5.5], [10.2, 6.9], [8.7, 8.8], [7.6, 10.9]], s.d, lw(0.35));
    // stud earring
    P.ell(5.9, 13.6, 0.42, 0.42, L.accent);
    P.rect(5.7, 13.3, u, u, '#ffffff');
  } else {
    // short crop: a dense top that fades down the temples
    P.poly([
      [5.9, 8.2], [6, 5], [7.4, 2.8], [9.8, 1.5], [12, 1.2], [14.2, 1.5], [16.6, 2.8], [18, 5], [18.1, 8.2],
      [17.6, 6.7], [16.7, 5.2], [15.1, 4.3], [13.1, 4.05], [12, 4.35], [10.9, 4.05], [8.9, 4.3], [7.3, 5.2], [6.4, 6.7],
    ], h);
    P.poly([[14.2, 1.5], [16.6, 2.8], [18, 5], [18.1, 8.2], [17.6, 6.7], [16.7, 5.2], [15.4, 4.4], [15.8, 3]], hD);
    const fade = mix(L.sk, h, 0.62);
    P.rect(6, 6.6, 0.75, 3.6, fade);
    P.rect(17.25, 6.6, 0.75, 3.6, mix(L.sk, h, 0.78));
    P.dots(6, 9.4, 0.9, 1.8, mix(L.sk, h, 0.35), 0.5, 3);
    P.dots(17.1, 9.4, 0.9, 1.8, mix(L.sk, h, 0.5), 0.5, 5);
    // cropped texture: short strokes leaning with the growth, lighter on the lit side
    for (let i = 0; i < 11; i++) {
      const x = 6.9 + i;
      const y = 2.1 + Math.abs(i - 5) * 0.14 + (i % 3) * 0.16;
      P.line([[x, y], [x + 0.35, y + 1.5]], i % 2 ? (i < 6 ? hM : h) : hD);
    }
    P.dots(7, 1.8, 10, 2.4, hD, 0.14, 21);
    P.line([[7.8, 2.9], [10.2, 1.9], [12.6, 1.7]], hL, lw(0.3));
    // hairline shadow on the forehead
    const s = skinRamp(L.sk);
    P.line([[7.4, 5.45], [9, 4.6], [10.9, 4.35], [12, 4.65], [13.1, 4.35], [15, 4.6], [16.6, 5.45]], s.d, lw(0.3));
  }
}

function hairBack(P: Painter, L: FaceLook): void {
  if (!L.female) return;
  const h = L.hair;
  const hM = shade(h, 1.32);
  const hD = shade(h, 0.68);
  // the mass behind the head, a fall down the near side and a ponytail over the far shoulder
  P.ell(12, 10.6, 7.9, 9, hD);
  P.poly([[5, 8], [4.2, 13], [4.4, 18.6], [5.6, 21.2], [7.6, 20.4], [7.2, 14]], h);
  P.line([[5.2, 9], [4.8, 14], [5.2, 19]], hM);
  P.line([[6.2, 10], [6, 15], [6.6, 20]], hD);
  P.poly([[16.6, 8], [20.4, 9.4], [22, 14.6], [21.5, 21], [19.2, 22.6], [18.5, 17.2], [17.4, 13]], h);
  P.poly([[19.4, 9.2], [20.4, 9.4], [22, 14.6], [21.5, 21], [20.4, 21.8], [20.8, 15]], hD);
  for (let i = 0; i < 4; i++) P.line([[17.9 + i * 0.75, 10 + i * 0.3], [19 + i * 0.6, 16], [19.2 + i * 0.45, 21.4]], i % 2 ? hM : hD);
}

function headset(P: Painter, L: FaceLook): void {
  const lw = (units: number) => Math.max(1, Math.round(units * P.k));
  const u = 1 / P.k;
  // band over the crown
  P.line([[4.6, 9.4], [5, 4.6], [7.6, 1.8], [12, 1], [16.4, 1.8], [19, 4.6], [19.4, 8.8]], '#1c2028', lw(0.75));
  P.line([[5.2, 4.6], [7.8, 2], [12, 1.2]], '#5a6274');
  P.line([[16.6, 2.1], [18.8, 4.6]], '#0e1014');
  // near ear cup: housing, cushion, a highlight down its lit rim
  P.ell(4.5, 11.6, 1.85, 2.7, '#1c2028');
  P.ell(4.4, 11.5, 1.45, 2.25, '#30363f');
  P.ell(4.2, 11.4, 0.95, 1.6, '#444b5a');
  P.rect(3.3, 10.2, u, 2.2, '#8a93a6');
  P.rect(4, 10.6, 0.5, 0.35, '#6a7284');
  // far cup, mostly hidden by the head
  P.ell(19.4, 11.4, 0.9, 2.1, '#14171d');
  // boom to the corner of the mouth
  P.line([[5.3, 13.7], [6.3, 15.4], [8.3, 16.5]], '#1c2028', lw(0.6));
  P.line([[5.5, 13.6], [6.5, 15.2]], '#5a6274');
  P.ell(9, 16.55, 0.75, 0.6, '#14171d');
  P.ell(9.1, 16.5, 0.34, 0.3, L.dead ? '#333' : '#39d353');
  if (!L.dead) P.rect(9, 16.35, u, u, '#d0ffd8');
}

/** Everything under the eyes, brows and mouth: hair behind, bust, skull, beard, hair in front, headset. */
export function paintBust(P: Painter, L: FaceLook): void {
  hairBack(P, L);
  bust(P, L);
  skull(P, L);
  if (!L.female) beard(P, L);
  hairFront(P, L);
  headset(P, L);
}

/** Nose: a bridge with a shadow side, wings, nostrils and a lit tip. Drawn after the eyes. */
export function paintNose(P: Painter, L: FaceLook): void {
  const lw = (units: number) => Math.max(1, Math.round(units * P.k));
  const u = 1 / P.k;
  const s = skinRamp(L.sk);
  P.line([[12.85, 9.6], [13.05, 12.3], [13.45, 13.4]], s.d, lw(0.32));
  P.line([[11.75, 10], [11.6, 12.4]], s.l, lw(0.25));
  P.ell(10.95, 13.85, 0.6, 0.5, s.m);
  P.ell(13.05, 13.85, 0.6, 0.5, s.d);
  P.ell(12, 13.55, 1.05, 0.72, s.b);
  P.ell(11.7, 13.3, 0.45, 0.32, s.l);
  P.rect(11.55, 13.1, 0.5, u, s.h);
  P.rect(11.05, 14.12, 0.5, 0.28, s.dd);
  P.rect(12.5, 14.12, 0.5, 0.28, s.dd);
  // shadow the nose throws onto the lip (the beard already darkens it on Ray)
  if (L.female) P.rect(11, 14.5, 2.2, u, s.d);
}
