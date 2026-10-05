import type { Gender } from '../core/types';
import { ANALYSTS, currentSkin } from './look';
import { shade } from './pixel';

/**
 * ARSENAL: procedural 24x24 analyst portraits with Doom-style face states:
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
    if (this.hurtT < 1.0) look = this.dir;
    else {
      // idle glance cycle (like Doom's status face)
      const c = Math.floor(this.time / 1.6) % 4;
      look = c === 1 ? -1 : c === 3 ? 1 : 0;
    }
    return { integrity, look, ouch: this.hurtT < 0.35, grin: this.grinT < 1.2 && this.hurtT > 0.35, dead };
  }
}

export function drawPortrait(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  gender: Gender,
  st: FaceState,
  s = 1,
  skinBase?: string,
): void {
  const a = ANALYSTS[gender];
  const female = gender === 'female';
  const p = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x0 + x * s), Math.round(y0 + y * s), Math.round(w * s), Math.round(h * s));
  };
  const base = skinBase ?? currentSkin().base;
  const pale = st.dead ? '#8a8f86' : st.integrity < 20 ? shade(base, 0.82) : base;
  const sk = pale;
  const skD = shade(sk, 0.72);
  const skL = shade(sk, 1.15);
  const hair = a.hair;
  const hairL = shade(hair, 1.6);
  const blood = '#a01010';

  // background
  p(0, 0, 24, 24, st.integrity < 25 && !st.dead ? '#3a1414' : '#141826');
  // hair behind head (female: long hair + ponytail)
  if (female) {
    p(4, 4, 16, 15, hair);
    p(18, 9, 4, 11, hair);
    p(19, 18, 3, 4, shade(hair, 0.8));
  }
  // jacket + collar
  p(1, 20, 22, 4, a.jacket);
  p(1, 20, 22, 1, shade(a.jacket, 1.3));
  p(8, 20, 8, 2, '#e8ecf2');
  p(10, 21, 4, 3, a.accent);
  // lanyard
  p(7, 21, 1, 3, a.accent);
  p(16, 21, 1, 3, a.accent);
  // neck
  p(9, 17, 6, 4, skD);
  // head
  if (female) {
    p(7, 4, 10, 13, sk);
    p(8, 17, 8, 1, sk);
    p(9, 18, 6, 1, sk);
    p(6, 7, 1, 8, sk);
    p(17, 7, 1, 8, sk);
  } else {
    p(6, 4, 12, 13, sk);
    p(7, 17, 10, 1, sk);
    p(8, 18, 8, 1, sk);
  }
  // shading: right cheek, under-jaw
  p(female ? 16 : 16, 6, 2, 11, skD);
  p(female ? 8 : 7, 6, 1, 9, skL);
  // ears
  p(5, 10, 1, 3, skD);
  p(18, 10, 1, 3, skD);
  // hair top
  if (female) {
    p(6, 2, 12, 4, hair);
    p(5, 4, 3, 8, hair);
    p(16, 4, 3, 5, hair);
    p(7, 5, 6, 2, hair); // side-swept fringe
    p(8, 3, 5, 1, hairL);
    p(5, 14, 1, 1, a.accent); // earring
  } else {
    p(6, 2, 12, 3, hair);
    p(5, 4, 2, 5, hair);
    p(17, 4, 2, 5, hair);
    p(7, 2, 6, 1, hairL);
    // beard / stubble
    for (let yy = 14; yy < 19; yy++) {
      for (let xx = 7; xx < 17; xx++) {
        if ((xx + yy) % 2 === 0 && !(yy < 16 && xx > 8 && xx < 15)) p(xx, yy, 1, 1, shade(hair, 1.25));
      }
    }
  }
  // headset band + ear cup + mic boom
  p(5, 1, 14, 1, '#20242c');
  p(4, 2, 1, 8, '#20242c');
  p(3, 9, 3, 5, '#2c313c');
  p(3, 10, 1, 3, '#4a5160');
  p(6, 14, 1, 1, '#2c313c');
  p(7, 15, 2, 1, '#2c313c');
  p(9, 15, 1, 1, st.dead ? '#333' : '#39d353');

  // brows
  const browY = st.ouch ? 7 : st.integrity < 40 ? 8 : 8;
  const browC = shade(hair, 0.8);
  if (female) {
    p(8, browY, 3, 1, browC);
    p(13, browY, 3, 1, browC);
  } else {
    p(8, browY, 3, 1, browC);
    p(13, browY, 3, 1, browC);
    p(8, browY + (st.integrity < 40 ? 0 : 1), 1, 1, browC);
    p(15, browY + (st.integrity < 40 ? 0 : 1), 1, 1, browC);
  }
  if (st.integrity < 40 && !st.ouch) {
    // furrowed inner brows
    p(10, browY + 1, 1, 1, browC);
    p(13, browY + 1, 1, 1, browC);
  }

  // eyes
  const eyeY = 10;
  if (st.dead) {
    for (const ex of [8, 13]) {
      p(ex, eyeY - 1, 1, 1, '#111');
      p(ex + 2, eyeY - 1, 1, 1, '#111');
      p(ex + 1, eyeY, 1, 1, '#111');
      p(ex, eyeY + 1, 1, 1, '#111');
      p(ex + 2, eyeY + 1, 1, 1, '#111');
    }
  } else {
    const eh = st.ouch ? 3 : 2;
    const ey = st.ouch ? eyeY - 1 : eyeY;
    for (const ex of [8, 13]) {
      p(ex, ey, 3, eh, '#f2f2ee');
      const px = ex + 1 + st.look;
      p(px, ey + (st.ouch ? 1 : 0), 1, 2, female ? '#3a2a1a' : '#24180f');
    }
    if (st.integrity < 60) p(13, eyeY - 1, 3, 1, skD); // swelling over right eye
    if (st.integrity < 30) p(13, eyeY, 3, 1, shade(skD, 0.8));
    if (female && !st.ouch) {
      p(8, ey - 1 + 0, 1, 1, '#1a1210');
      p(15, ey - 1 + 0, 1, 1, '#1a1210');
    }
  }
  // nose
  p(11, 11, 2, 3, skD);
  p(11, 13, 1, 1, shade(skD, 0.8));

  // mouth
  const lip = female ? '#a8485a' : shade(sk, 0.55);
  if (st.dead) {
    p(10, 15, 4, 1, '#331');
  } else if (st.ouch) {
    p(10, 15, 4, 3, '#3a0c0c');
    p(10, 15, 4, 1, lip);
  } else if (st.grin) {
    p(9, 15, 6, 2, '#3a0c0c');
    p(9, 15, 6, 1, '#f4f4f0');
    p(8, 14, 1, 1, lip);
    p(15, 14, 1, 1, lip);
  } else if (st.integrity < 40) {
    p(9, 16, 6, 1, lip);
    p(9, 15, 1, 1, lip);
    p(14, 15, 1, 1, lip);
  } else {
    p(10, 16, 4, 1, lip);
    if (female) p(10, 15, 4, 1, shade(lip, 1.2));
  }

  // damage stages (Doom: five health bands)
  if (!st.dead) {
    if (st.integrity < 80) p(7, 7, 2, 1, '#c84a3a'); // scrape
    if (st.integrity < 60) {
      p(14, 4, 1, 4, blood);
      p(15, 7, 1, 2, blood);
    }
    if (st.integrity < 40) {
      p(7, 12, 1, 4, blood);
      p(8, 15, 1, 2, blood);
      p(14, 4, 2, 1, blood);
    }
    if (st.integrity < 20) {
      p(9, 4, 3, 1, blood);
      p(10, 5, 1, 4, blood);
      p(16, 12, 1, 6, blood);
    }
  } else {
    p(9, 4, 6, 2, blood);
    p(11, 6, 1, 6, blood);
  }
}
