import type { Gender } from '../core/types';
import { ANALYSTS, currentSkin } from './look';
import { painter, PartCache, type Painter } from '../render/hires';
import { RES } from '../render/res';
import { shade } from './pixel';

/**
 * ARSENAL: procedural 24x24-unit analyst portraits (painted at native 4x) with Doom-style face states:
 * five damage stages, eyes that glance (and snap toward whatever hurt you),
 * an "ouch" face on a big hit, and a grin on a new tool. No bitmap assets.
 */

export interface FaceState {
  integrity: number;
  /** -1 = look left, 0 = ahead, 1 = look right. */
  look: number;
  ouch: boolean;
  grin: boolean;
  dead: boolean;
}

export const FACE_SIZE = 24;

export class Face {
  private hurtT = 9;
  private grinT = 9;
  private dir = 0;
  private time = 0;

  /** dir: -1 = attacker on the left, 1 = right, 0 = ahead. */
  hurt(dir: number): void {
    this.hurtT = 0;
    this.dir = Math.sign(dir);
  }

  grin(): void {
    this.grinT = 0;
  }

  reset(): void {
    this.hurtT = 9;
    this.grinT = 9;
    this.dir = 0;
  }

  tick(dt: number): void {
    this.time += dt;
    this.hurtT += dt;
    this.grinT += dt;
  }

  state(integrity: number): FaceState {
    const dead = integrity <= 0;
    let look = 0;
    if (this.hurtT < 0.55) look = this.dir; // snap toward the hit for ~0.5 s
    else {
      // idle glance cycle (like Doom's status face)
      const c = Math.floor(this.time / 1.6) % 4;
      look = c === 1 ? -1 : c === 3 ? 1 : 0;
    }
    return { integrity, look, ouch: this.hurtT < 0.35, grin: this.grinT < 1.2 && this.hurtT > 0.35, dead };
  }
}

const portraits = new PartCache<HTMLCanvasElement>(96);

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Doom's five health bands: clean, nicked, beaten, bloody, near-dead. */
function damageTier(integrity: number): number {
  let t = 0;
  for (const th of [80, 60, 40, 20]) if (integrity < th) t++;
  return t;
}

/**
 * Analyst portrait, `s` x 24 units square. Painted at native resolution
 * (RES x the 24-unit grid, so 96x96 in the HUD) and cached per face state.
 */
export function drawPortrait(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  gender: Gender,
  st: FaceState,
  s = 1,
  skinBase?: string,
): void {
  const base = skinBase ?? currentSkin().base;
  const tier = damageTier(st.integrity);
  const key = `${gender}|${s}|${base}|${tier}|${st.look}|${st.ouch ? 1 : 0}${st.grin ? 1 : 0}${st.dead ? 1 : 0}`;
  const c = portraits.get(key, () => {
    const P = painter(FACE_SIZE, FACE_SIZE, s * RES);
    paintPortrait(P, gender, st, base);
    return P.c;
  });
  g.drawImage(c, x0, y0, FACE_SIZE * s, FACE_SIZE * s);
}

function paintPortrait(P: Painter, gender: Gender, st: FaceState, base: string): void {
  const a = ANALYSTS[gender];
  const female = gender === 'female';
  const u = 1 / P.k;
  const lw = (units: number) => Math.max(1, Math.round(units * P.k));
  const tier = damageTier(st.integrity);
  // skin goes pale and grey as integrity drops (Doom's face loses its colour)
  const sk = st.dead
    ? '#8a8f86'
    : tier >= 4
      ? shade(mix(base, '#98908a', 0.42), 0.82)
      : tier >= 3
        ? shade(mix(base, '#a99d92', 0.22), 0.9)
        : tier >= 2
          ? mix(base, '#b8ac9c', 0.14)
          : base;
  const skD = shade(sk, 0.78);
  const skDD = shade(sk, 0.62);
  const skL = shade(sk, 1.07);
  const hair = a.hair;
  const hairM = shade(hair, 1.3);
  const hairL = shade(hair, 1.75);
  const hairD = shade(hair, 0.7);
  const blood = '#b01210';
  const bloodD = '#5a0606';
  const bloodL = '#e03020';
  const hurt = tier >= 3 && !st.dead;

  // background + CRT scanlines
  const bg = tier >= 4 && !st.dead ? '#3a1414' : '#141826';
  P.rect(0, 0, 24, 24, bg);
  for (let y = 0; y < 24; y += 0.5) P.rect(0, y, 24, u, shade(bg, 0.82));

  // long hair + ponytail behind the head
  if (female) {
    P.ell(12, 11.5, 7.6, 8.6, hairD);
    P.poly([[16.5, 8], [20.5, 9.5], [22, 15], [21.4, 21], [19, 22.5], [18.6, 17], [17.4, 13]], hair);
    for (let i = 0; i < 4; i++) P.line([[18 + i * 0.8, 10 + i * 0.3], [19.2 + i * 0.6, 16], [19.4 + i * 0.4, 21]], i % 2 ? hairM : hairD);
  }

  // jacket, shirt collar, lanyard
  P.poly([[0, 24], [0.6, 21], [5.5, 19.2], [18.5, 19.2], [23.4, 21], [24, 24]], a.jacket);
  P.line([[0.6, 21], [5.5, 19.2], [18.5, 19.2], [23.4, 21]], shade(a.jacket, 1.35), lw(0.4));
  P.dots(0, 20, 24, 4, shade(a.jacket, 0.82), 0.12, 4);
  P.poly([[2, 24], [3, 21.6], [4, 24]], shade(a.jacket, 0.7));
  P.poly([[22, 24], [21, 21.6], [20, 24]], shade(a.jacket, 0.7));
  P.poly([[8.2, 19.4], [15.8, 19.4], [14, 22.2], [12, 24], [10, 22.2]], '#e8ecf2');
  P.line([[8.2, 19.4], [10, 22.2], [12, 24]], '#a8b0bc');
  P.line([[15.8, 19.4], [14, 22.2], [12, 24]], '#a8b0bc');
  P.poly([[10.8, 20.8], [13.2, 20.8], [12, 24]], a.accent);
  P.line([[7.4, 19.6], [8.6, 24]], a.accent, lw(0.4));
  P.line([[16.6, 19.6], [15.4, 24]], a.accent, lw(0.4));

  // neck with jaw shadow
  P.rect(9.2, 15.5, 5.6, 4.5, skD);
  P.ell(12, 16.4, 3.4, 1.6, skDD);
  P.rect(13.4, 15.5, 1.4, 4.5, skDD);

  // ears
  for (const ex of [5.7, 18.3]) {
    P.ell(ex, 11.6, 1.1, 1.9, skD);
    P.ell(ex + (ex < 12 ? 0.2 : -0.2), 11.6, 0.5, 1.1, skDD);
  }

  // head
  const head: [number, number][] = female
    ? [[6.6, 6.5], [7.8, 3.8], [12, 3], [16.2, 3.8], [17.4, 6.5], [17.4, 12.6], [16, 16], [13.6, 18], [10.4, 18], [8, 16], [6.6, 12.6]]
    : [[6, 6], [7, 3.6], [12, 2.8], [17, 3.6], [18, 6], [18, 13], [16.6, 16.4], [14, 18.2], [10, 18.2], [7.4, 16.4], [6, 13]];
  P.poly(head, sk);
  const R = female ? 17.4 : 18;
  // form shading, light from the upper left
  P.poly([[R - 1.6, 4.8], [R, 6.2], [R, 12.8], [R - 1.4, 16.2], [14, 18.1], [13.4, 17.9], [R - 1.8, 15.2], [R - 1.2, 11.5], [R - 1.2, 7]], skD);
  P.dots(R - 2.6, 6, 1.4, 9.4, skD, 0.4, 8);
  P.dots(R - 3.4, 7, 0.8, 7.6, skD, 0.15, 12);
  P.poly([[R - 0.8, 7], [R, 7], [R, 12.8], [R - 1.4, 16.2], [R - 1.2, 12]], skDD);
  P.ell(9.6, 6.2, 2.8, 1.4, skL);
  P.ell(8.5, 13, 1.1, 1.6, skL);
  P.dots(7.5, 5, 9, 11, shade(sk, 0.93), 0.03, 17);
  if (female) {
    P.ell(8.4, 13.4, 1.1, 0.55, mix(sk, '#d86a78', 0.22));
    P.ell(15.6, 13.4, 1.1, 0.55, mix(skD, '#d86a78', 0.22));
  } else if (!st.dead) {
    // stubble / short beard
    const stub = mix(sk, hair, 0.28);
    P.poly([[7, 13.6], [8.4, 14.2], [10.4, 14.4], [12, 14.8], [13.6, 14.4], [15.6, 14.2], [17, 13.6], [16.6, 16.4], [14, 18.2], [10, 18.2], [7.4, 16.4]], stub);
    P.dots(7, 13.8, 10, 4.4, mix(sk, hair, 0.55), 0.3, 9);
    P.dots(10.2, 14.5, 3.6, 0.7, mix(sk, hair, 0.7), 0.55, 10);
  }

  // hair
  if (female) {
    P.poly([[5.2, 12.4], [5, 6], [6.6, 3], [9.6, 1.6], [14.4, 1.6], [17.4, 3], [19, 6], [18.6, 10.4], [17.6, 6.6], [15.6, 4.8], [13.2, 5.6], [10.2, 7.8], [7.6, 7.6], [6.8, 12.4]], hair);
    for (let i = 0; i < 5; i++) P.line([[9 + i * 1.4, 2.2], [8.4 + i * 1.1, 4.8], [7.4 + i * 0.9, 7.2]], i % 2 ? hairM : hairD);
    P.line([[7.6, 3.2], [10, 2.2], [13.6, 2.2]], hairL, lw(0.3));
    P.line([[5.6, 7], [5.8, 11.6]], hairM);
    P.ell(5.6, 14, 0.4, 0.4, a.accent);
    P.rect(5.4, 13.7, u, u, '#ffffff');
  } else {
    P.poly([[5.6, 8.4], [5.8, 4.6], [7.4, 2.6], [10, 1.5], [14, 1.5], [16.6, 2.6], [18.2, 4.6], [18.4, 8.4], [17.4, 6.4], [16, 4.6], [12, 4.1], [8, 4.6], [6.6, 6.4]], hair);
    P.rect(5.9, 6, 0.9, 4.2, hair);
    P.rect(17.2, 6, 0.9, 4.2, hair);
    for (let i = 0; i < 7; i++) P.line([[7.2 + i * 1.5, 2.3 + (i % 2) * 0.3], [7.6 + i * 1.45, 4.3]], i % 2 ? hairM : hairD);
    P.line([[8, 2.4], [11, 1.8], [13.6, 2]], hairL, lw(0.3));
    P.dots(5.9, 8, 0.9, 2.2, shade(sk, 0.8), 0.25, 3);
  }

  // headset: band, ear cup, mic boom + status LED
  P.line([[4.6, 9.4], [5, 4.6], [7.6, 1.8], [12, 1], [16.4, 1.8], [19, 4.6], [19.4, 8.6]], '#20242c', lw(0.7));
  P.line([[5.2, 4.6], [7.8, 2], [12, 1.2]], '#4a5160');
  P.ell(4.5, 11.6, 1.8, 2.6, '#2c313c');
  P.ell(4.3, 11.4, 1.1, 1.8, '#3a4050');
  P.rect(3.5, 10.2, u, 2, '#6a7284');
  P.line([[5.4, 13.6], [6.4, 15.2], [8.4, 16.2]], '#2c313c', lw(0.55));
  P.ell(9, 16.3, 0.7, 0.55, '#20242c');
  P.ell(9.1, 16.25, 0.32, 0.3, st.dead ? '#333' : '#39d353');
  if (!st.dead) P.rect(9, 16.1, u, u, '#d0ffd8');

  // brows
  const by = st.ouch ? 7.3 : 8.3;
  const bt = female ? 0.45 : 0.75;
  const browC = shade(hair, 0.85);
  for (const side of [-1, 1]) {
    const inner = 12 + side * 1.2;
    const outer = 12 + side * 4.2;
    const iy = by + (hurt ? 0.7 : tier >= 2 ? 0.35 : 0);
    const arch = female ? -0.45 : -0.15;
    P.poly([[inner, iy], [12 + side * 2.7, by + arch], [outer, by + 0.5], [outer, by + 0.5 + bt * 0.6], [12 + side * 2.7, by + arch + bt], [inner, iy + bt]], browC);
  }

  // eyes — the lids sag as the tiers climb (Doom's beaten faces lose the wide eyes)
  const eyeY = 10.7;
  const iris = female ? '#4a3220' : '#2e1e12';
  const droop = st.dead || st.ouch ? 0 : tier >= 4 ? 0.62 : tier >= 3 ? 0.34 : 0;
  const white = tier >= 4 && !st.dead ? '#e8b8a8' : '#f2f2ee';
  for (const ex of [9.4, 14.6]) {
    if (st.dead) {
      P.line([[ex - 1, eyeY - 0.9], [ex + 1, eyeY + 0.9]], '#111', lw(0.35));
      P.line([[ex + 1, eyeY - 0.9], [ex - 1, eyeY + 0.9]], '#111', lw(0.35));
      continue;
    }
    const ry = st.ouch ? 1.2 : 0.8;
    P.ell(ex, eyeY - 0.2, 1.9, ry + 0.45, skD);
    P.ell(ex, eyeY, 1.45, ry, white);
    P.rect(ex - 1.45, eyeY + ry * 0.4, 2.9, u, '#d8d4cc');
    const ix = ex + st.look * 0.6;
    const ir = Math.min(0.62, ry);
    P.ell(ix, eyeY + 0.05, 0.62, ir, iris);
    P.ell(ix, eyeY + 0.05, 0.3, Math.min(0.3, ir), '#0a0806');
    P.rect(ix - 0.3, eyeY - 0.35, u, u, '#ffffff');
    if (tier >= 4) {
      // bloodshot corners
      P.rect(ex - 1.3, eyeY - 0.1, 0.5, u, '#d83828');
      P.rect(ex + 0.9, eyeY + 0.15, 0.5, u, '#d83828');
    }
    if (droop > 0) {
      // skin-toned lid slides down over the top of the eye + a crease line
      P.ell(ex, eyeY - ry - 0.55 + droop * 1.4, 1.9, 1.0, sk);
      P.line(
        [
          [ex - 1.55, eyeY - ry + droop * 1.15],
          [ex, eyeY - ry + 0.25 + droop * 0.9],
          [ex + 1.55, eyeY - ry + droop * 1.15],
        ],
        skDD,
      );
      P.dots(ex - 1.4, eyeY - ry + droop * 0.9, 2.8, 0.6, skD, 0.4, ex === 9.4 ? 5 : 6);
    }
    P.line([[ex - 1.5, eyeY - 0.1], [ex - 0.6, eyeY - ry - 0.05], [ex + 0.6, eyeY - ry - 0.05], [ex + 1.5, eyeY - 0.1]], '#1a1210', female ? 2 : 1);
    if (female) P.line([[ex + (ex > 12 ? 1.5 : -1.5), eyeY - 0.2], [ex + (ex > 12 ? 2 : -2), eyeY - 0.7]], '#1a1210', 1);
    P.line([[ex - 1.2, eyeY + ry + 0.2], [ex + 1.2, eyeY + ry + 0.2]], skDD);
  }
  if (!st.dead && tier >= 2) P.ell(14.6, 9.6, 1.9, 0.6, '#8a5a66');
  if (!st.dead && tier >= 3) P.ell(14.6, 10.1, 1.7, 0.55, '#6a3a4a');
  if (!st.dead && tier >= 3) P.ell(9.4, 10.1, 1.6, 0.5, '#5a3040');

  // nose
  P.line([[12.7, 10.6], [13, 12.6], [13.3, 13.6]], skD, lw(0.3));
  P.ell(12, 13.7, 1.15, 0.7, sk);
  P.rect(11.6, 13.2, 0.6, u, skL);
  P.rect(11, 14.15, 0.5, 0.3, skDD);
  P.rect(12.5, 14.15, 0.5, 0.3, skDD);
  P.rect(10.9, 14.5, 2.2, u, skD);

  // mouth
  const lip = female ? '#a8485a' : shade(sk, 0.62);
  if (st.dead) {
    P.rect(10.2, 16, 3.6, 0.45, '#331');
  } else if (st.ouch) {
    P.ell(12, 16.5, 1.7, 1.35, '#3a0c0c');
    P.rect(10.9, 15.3, 2.2, 0.45, '#e8e4dc');
    P.line([[10.3, 15.3], [12, 15.1], [13.7, 15.3]], lip, lw(0.35));
  } else if (tier >= 4) {
    // near-dead: open grimace, teeth clenched top and bottom, blood at the lip
    P.ell(12, 16.4, 2.1, 1.6, '#2a0806');
    P.rect(10.2, 15.3, 3.6, 0.5, '#d8d0c0');
    P.rect(10.6, 16.9, 2.8, 0.45, '#c0b8a8');
    for (let x = 10.9; x < 13.4; x += 0.8) P.rect(x, 15.3, u, 0.5, '#8a8478');
    P.line([[9.6, 15.4], [10.2, 16.3], [13.8, 16.3], [14.4, 15.4]], lip, lw(0.4));
    P.line([[10.4, 15.4], [10.1, 16.9]], blood, lw(0.3));
  } else if (st.grin) {
    P.poly([[9.3, 15.3], [14.7, 15.3], [13.6, 16.9], [10.4, 16.9]], '#3a0c0c');
    P.rect(9.8, 15.35, 4.4, 0.6, '#f4f4f0');
    for (let x = 10.6; x < 14; x += 0.9) P.rect(x, 15.35, u, 0.6, '#c8c4bc');
    P.line([[9.2, 15.4], [8.8, 14.8]], lip, lw(0.3));
    P.line([[14.8, 15.4], [15.2, 14.8]], lip, lw(0.3));
  } else if (hurt) {
    // gritted teeth, deeper mouth shadow than the neutral line
    P.rect(9.8, 15.5, 4.4, 0.7, '#2a0806');
    P.rect(10.2, 15.55, 3.6, 0.4, '#d8d0c0');
    for (let x = 10.7; x < 13.6; x += 0.75) P.rect(x, 15.55, u, 0.4, '#8a8478');
    P.line([[9.4, 15.3], [10.2, 16.1], [13.8, 16.1], [14.6, 15.3]], lip, lw(0.4));
  } else if (tier >= 2) {
    // strained: pressed lips with the corners pulled down (Doom's hurt frown)
    P.line([[9.7, 16.3], [10.9, 15.8], [12, 15.9], [13.1, 15.8], [14.3, 16.3]], lip, lw(0.45));
    P.line([[9.7, 16.3], [10.2, 16.9]], lip, lw(0.3));
    P.line([[14.3, 16.3], [13.8, 16.9]], lip, lw(0.3));
    P.rect(10.6, 16.9, 2.8, u, skDD);
  } else if (female) {
    P.poly([[10.1, 15.9], [11.3, 15.4], [12, 15.6], [12.7, 15.4], [13.9, 15.9]], lip);
    P.ell(12, 16.3, 1.6, 0.5, shade(lip, 1.1));
    P.rect(11.4, 16.1, 1, u, shade(lip, 1.6));
    P.line([[10.1, 15.9], [13.9, 15.9]], shade(lip, 0.6));
  } else {
    P.line([[10.2, 15.9], [12, 16.1], [13.8, 15.9]], lip, lw(0.4));
    P.rect(10.8, 16.5, 2.4, u, skL);
  }

  // damage stages — Doom's five faces: each tier adds unmistakable new blood
  const streak = (pts: [number, number][], w = 0.35) => {
    P.line(pts, bloodD, lw(w) + 1);
    P.line(pts, blood, lw(w));
  };
  const soak = (x: number, y: number, w: number, h: number, p = 0.75, seed = 1) => {
    P.dots(x, y, w, h, bloodD, p * 0.7, seed + 40);
    P.dots(x, y, w, h, blood, p, seed);
    P.dots(x, y, w, h * 0.5, bloodL, p * 0.4, seed + 80);
  };
  if (!st.dead) {
    if (tier >= 1) {
      // nicked brow, a puffed cut on the cheekbone, first sweat bead
      P.line([[7.1, 7.1], [8.9, 7.6]], '#c84a3a', lw(0.35));
      P.line([[7.3, 6.9], [8.9, 7.4]], blood, lw(0.25));
      P.dots(7, 6.8, 2.2, 1.4, '#e07060', 0.35, 2);
      P.ell(15.9, 13.2, 1.6, 1, mix(sk, '#6a4a68', 0.5));
      P.line([[14.9, 12.4], [16.6, 13.2]], mix(sk, '#4a3450', 0.4), lw(0.25));
      streak([[8.6, 12.6], [9.6, 13.2]], 0.3);
      P.rect(6.8, 9.4, u, 0.8, '#9ad0ff');
    }
    if (tier >= 2) {
      // blood from the hairline runs down past the brow into the eye
      streak([[14.4, 4.2], [14.6, 6.4], [15.2, 8.6], [15.5, 10.4]], 0.55);
      soak(14.2, 4.4, 1.4, 2.6, 0.55, 11);
      P.dots(13.4, 3.6, 3, 1.2, blood, 0.35, 12);
      // sweat beads on both temples + a swollen bruise under the eye
      P.dots(6.6, 8.4, 0.9, 1.8, '#9ad0ff', 0.5, 13);
      P.rect(6.9, 9.6, u, 0.8, '#9ad0ff');
      P.dots(16.9, 8.2, 0.9, 1.6, '#9ad0ff', 0.5, 14);
      P.rect(17, 9.4, u, 0.8, '#9ad0ff');
      P.ell(9.6, 10.6, 1.8, 0.7, mix(sk, '#4a3450', 0.4));
      // nosebleed: a thin runnel from the left nostril to the lip
      P.line([[11.5, 14.3], [11.2, 15.6]], blood, lw(0.4));
      P.dots(11.1, 14.4, 0.9, 1.8, blood, 0.45, 15);
      // a second thin runnel on the right cheek
      streak([[16.6, 11.4], [16.8, 13.8]], 0.35);
    }
    if (tier >= 3) {
      // second runnel down the left cheek to the jaw + blood at the nose and lip
      streak([[7.4, 11.8], [7.6, 14.4], [8.3, 16.8]], 0.55);
      soak(7.2, 12.6, 1.4, 3.4, 0.55, 21);
      streak([[14.2, 4.2], [15.8, 4.6]], 0.45);
      P.line([[11.2, 14.4], [11, 15.2], [10.6, 15.7]], blood, lw(0.4));
      P.dots(8.6, 13.2, 1.8, 2.4, blood, 0.45, 22);
      P.dots(8.2, 15.8, 1.4, 2.6, blood, 0.5, 23);
      // hair matted flat with sweat/blood
      P.dots(8, 4.4, 8, 1.4, hairD, 0.5, 24);
    }
    if (tier >= 4) {
      // half the face soaked: forehead gush, twin runnels to the chin, soaked collar
      soak(8.6, 4.2, 7.4, 1.6, 0.8, 31);
      streak([[9, 4.2], [11.4, 4.4]], 0.6);
      streak([[10.4, 4.6], [10.6, 7], [10.4, 8.8]], 0.55);
      soak(10.2, 6.8, 1.2, 2.4, 0.6, 32);
      streak([[16.4, 11.8], [16.6, 15], [16.2, 17.6]], 0.6);
      soak(15.8, 13.4, 1.4, 3.2, 0.6, 33);
      streak([[8.2, 16.6], [8.6, 18.6], [8.4, 19.4]], 0.45);
      P.dots(12.4, 15.6, 1.6, 2.4, blood, 0.5, 34);
      P.line([[11.4, 17.4], [11.6, 18.8]], blood, lw(0.35));
      // blood pooled on the collar line
      P.rect(8.6, 19.4, 6.8, 0.6, bloodD);
      P.dots(8.6, 19.4, 6.8, 1.4, blood, 0.55, 35);
      // gaunt shading under the cheekbones
      P.ell(9, 14.6, 1.4, 0.9, skDD);
      P.ell(15.2, 14.9, 1.2, 0.8, skDD);
    }
  } else {
    soak(8.4, 4.2, 7.6, 2.2, 0.85, 41);
    streak([[9, 4.2], [15, 4.6]], 0.7);
    streak([[11.4, 5], [11.6, 8], [11.2, 11.6]], 0.45);
    streak([[8.4, 12.4], [8.6, 15.8], [8.2, 18]], 0.5);
    P.rect(8.6, 19.4, 6.8, 0.7, bloodD);
  }
}
