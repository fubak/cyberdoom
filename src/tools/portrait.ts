import type { Gender } from '../core/types';
import { ANALYSTS, currentSkin } from './look';
import { painter, PartCache, type Painter } from '../render/hires';
import { RES } from '../render/res';
import { shade } from './pixel';
import { lightAvatar } from '../render/avatarLight';
import { EYE_X, EYE_Y, paintBust, paintNose, type FaceLook } from './faceArt';

/**
 * ARSENAL: procedural 24x24-unit analyst portraits (painted at native 4x) with Doom-style face states:
 * five damage stages, eyes that glance (and snap toward whatever hurt you),
 * an "ouch" face on a big hit, and a grin on a new tool. No bitmap assets.
 */

export interface FaceState {
  integrity: number;
  /** -1 = look left, 0 = ahead, 1 = look right (plus small saccade darts). */
  look: number;
  /** Eyelid closure 0..1 (a ~120 ms blink every ~3-6 s). */
  blink: number;
  /** Mouth open amount 0..1 while the analyst "talks" (voice line / ticker). */
  talk: number;
  ouch: boolean;
  grin: boolean;
  dead: boolean;
}

export const FACE_SIZE = 24;

export class Face {
  /** EGGS: while the SUDO cheat is active the face holds its Doom grin. */
  god = false;
  private hurtT = 9;
  private grinT = 9;
  private talkT = 9;
  private dir = 0;
  private time = 0;
  /** deterministic blink schedule (independent of frame rate) */
  private nextBlink = 2.4;
  private blinkN = 0;

  /** dir: -1 = attacker on the left, 1 = right, 0 = ahead. */
  hurt(dir: number): void {
    this.hurtT = 0;
    this.dir = Math.sign(dir);
  }

  grin(): void {
    this.grinT = 0;
  }

  /** A voice line / ticker burst: the portrait's mouth moves while it plays. */
  talk(): void {
    this.talkT = 0;
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
    this.talkT += dt;
  }

  state(integrity: number): FaceState {
    const dead = integrity <= 0;
    let look = 0;
    if (this.hurtT < 0.55) look = this.dir; // snap toward the hit for ~0.5 s
    else {
      // idle glance cycle (like Doom's status face)
      const c = Math.floor(this.time / 1.6) % 4;
      look = c === 1 ? -1 : c === 3 ? 1 : 0;
      // micro-saccade: a quick half-step dart inside some glance windows
      if (Math.floor(this.time * 5) % 13 === 4) look *= 0.45;
    }
    // deterministic blink: 120 ms lid cycle every ~2.8-6 s (seeded spacing)
    while (this.time >= this.nextBlink) {
      this.blinkN++;
      this.nextBlink += 2.8 + ((this.blinkN * 0.618 + 0.31) % 1) * 3.2;
    }
    const bt = this.nextBlink - this.time;
    const blink = dead || this.ouchOpen() ? 0 : bt < 0.12 ? 1 - bt / 0.12 : 0;
    const talk = this.talkT < 1.1 && this.hurtT > 0.35 ? Math.max(0, Math.sin(this.talkT * 34)) * (1 - this.talkT / 1.1) : 0;
    return {
      integrity,
      look,
      blink: Math.max(0, blink),
      talk,
      ouch: this.ouchOpen(),
      grin: this.god || (this.grinT < 1.2 && this.hurtT > 0.35),
      dead,
    };
  }

  private ouchOpen(): boolean {
    return !this.god && this.hurtT < 0.35;
  }
}

const portraits = new PartCache<HTMLCanvasElement>(160);

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
  const c = portraits.get(portraitKey(gender, st, s, base), () => {
    const P = painter(FACE_SIZE, FACE_SIZE, s * RES);
    paintPortrait(P, gender, st, base);
    return P.c;
  });
  g.drawImage(c, x0, y0, FACE_SIZE * s, FACE_SIZE * s);
}

/** Everything that changes how a portrait looks, as one cache key. The skin tone is part of it. */
export function portraitKey(gender: Gender, st: FaceState, s: number, base: string): string {
  const tier = damageTier(st.integrity);
  return `${gender}|${s}|${base}|${tier}|${st.look}|${st.ouch ? 1 : 0}${st.grin ? 1 : 0}${st.dead ? 1 : 0}|${st.blink > 0.5 ? 1 : 0}${Math.round(st.talk * 2)}`;
}

const avatars = new PartCache<HTMLCanvasElement>(96);

/**
 * LOOK: the analyst as a lit bust for the select screen. The same painter as
 * the HUD face, drawn on a clear ground, run through the avatar lighting pass
 * (key light, rim, core shadow, outline) and set on a backdrop in the
 * analyst's own colour with a glow behind the head.
 */
export function drawAvatar(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  gender: Gender,
  st: FaceState,
  s = 1,
  skinBase?: string,
): void {
  const base = skinBase ?? currentSkin().base;
  const c = avatars.get(`a|${portraitKey(gender, st, s, base)}`, () => {
    const k = s * RES;
    const fig = painter(FACE_SIZE, FACE_SIZE, k);
    paintPortrait(fig, gender, st, base, true);
    const img = fig.g.getImageData(0, 0, fig.c.width, fig.c.height);
    lightAvatar(img.data, fig.c.width, fig.c.height, { k });
    fig.g.putImageData(img, 0, 0);
    const out = painter(FACE_SIZE, FACE_SIZE, k);
    const accent = ANALYSTS[gender].accent;
    const deep = mix('#06070c', accent, 0.1);
    // backdrop: dark at the edges, the analyst's colour gathering behind the head
    out.rect(0, 0, FACE_SIZE, FACE_SIZE, deep);
    const halo: [number, number, number][] = [[13.5, 12.5, 0.16], [11, 10.5, 0.24], [8.4, 8.4, 0.33], [5.8, 6, 0.42]];
    for (const [rx, ry, t] of halo) out.ell(12, 9.6, rx, ry, mix('#06070c', accent, t));
    for (let y = 0; y < FACE_SIZE; y += 1) out.rect(0, y, FACE_SIZE, 1 / k, 'rgba(0,0,0,0.22)');
    out.g.drawImage(fig.c, 0, 0);
    return out.c;
  });
  g.drawImage(c, x0, y0, FACE_SIZE * s, FACE_SIZE * s);
}

function paintPortrait(P: Painter, gender: Gender, st: FaceState, base: string, bare = false): void {
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
  const hairD = shade(hair, 0.7);
  const blood = '#b01210';
  const bloodD = '#5a0606';
  const bloodL = '#e03020';
  const hurt = tier >= 3 && !st.dead;

  // background + CRT scanlines
  const bg = tier >= 4 && !st.dead ? '#3a1414' : '#141826';
  if (!bare) {
    P.rect(0, 0, 24, 24, bg);
    for (let y = 0; y < 24; y += 0.5) P.rect(0, y, 24, u, shade(bg, 0.82));
  }

  // the head itself: hair, bust, skull, beard and headset (faceArt.ts)
  const L: FaceLook = { female, dead: st.dead, sk, hair, jacket: a.jacket, accent: a.accent };
  paintBust(P, L);

  // brows — each state gets its own brow: calm, strained (inner lift),
  // hurt (knit down), ouch (clamped), near-dead (slack)
  const by = st.ouch ? 7.3 : st.talk > 0.3 ? 7.9 : 8.3;
  const bt = female ? 0.45 : 0.75;
  const browC = shade(hair, 0.85);
  for (const side of [-1, 1]) {
    const inner = 12 + side * 1.2;
    const outer = 12 + side * 4.2;
    const iy = by + (hurt ? 0.7 : tier >= 2 ? 0.4 : tier >= 1 ? 0.22 : 0);
    const arch = female ? -0.45 : -0.15;
    P.poly([[inner, iy], [12 + side * 2.7, by + arch], [outer, by + 0.5], [outer, by + 0.5 + bt * 0.6], [12 + side * 2.7, by + arch + bt], [inner, iy + bt]], browC);
  }

  // eyes — the lids sag as the tiers climb (Doom's beaten faces lose the wide eyes)
  const eyeY = EYE_Y;
  const iris = female ? '#4a3220' : '#2e1e12';
  const droop = st.dead || st.ouch ? 0 : tier >= 4 ? 0.62 : tier >= 3 ? 0.34 : tier >= 2 ? 0.12 : 0;
  const lid = Math.max(droop, st.blink * 0.95);
  const white = tier >= 4 && !st.dead ? '#e8b8a8' : '#f2f2ee';
  for (const ex of EYE_X) {
    if (st.dead) {
      P.line([[ex - 1, eyeY - 0.9], [ex + 1, eyeY + 0.9]], '#111', lw(0.35));
      P.line([[ex + 1, eyeY - 0.9], [ex - 1, eyeY + 0.9]], '#111', lw(0.35));
      continue;
    }
    // almond eyes: narrower than the old round ones, the white shaded under the lid
    const ry = st.ouch ? 1.05 : 0.68;
    P.ell(ex, eyeY - 0.28, 1.42, ry + 0.12, skD);
    P.ell(ex, eyeY, 1.3, ry, white);
    P.rect(ex - 1.2, eyeY - ry + 0.1, 2.4, 0.22, '#c4c0c8');
    P.rect(ex - 1.2, eyeY + ry * 0.45, 2.4, u, '#d8d4cc');
    const ix = ex + st.look * 0.6;
    const ir = Math.min(0.62, ry);
    P.ell(ix, eyeY + 0.05, 0.66, Math.min(0.66, ry), shade(iris, 0.6));
    P.ell(ix, eyeY + 0.05, 0.52, Math.min(0.52, ir), shade(iris, 1.5));
    P.ell(ix, eyeY + 0.05, 0.3, Math.min(0.3, ir), '#0a0806');
    P.rect(ix - 0.3, eyeY - 0.35, u, u, '#ffffff');
    if (tier >= 4) {
      // bloodshot corners
      P.rect(ex - 1.3, eyeY - 0.1, 0.5, u, '#d83828');
      P.rect(ex + 0.9, eyeY + 0.15, 0.5, u, '#d83828');
    }
    if (lid > 0) {
      // skin-toned lid slides down over the top of the eye + a crease line
      P.ell(ex, eyeY - ry - 0.55 + lid * 1.7, 1.9, 1.1, sk);
      P.line(
        [
          [ex - 1.55, eyeY - ry + lid * 1.3],
          [ex, eyeY - ry + 0.25 + lid * 1.05],
          [ex + 1.55, eyeY - ry + lid * 1.3],
        ],
        skDD,
      );
      P.dots(ex - 1.4, eyeY - ry + lid * 1.05, 2.8, 0.6, skD, 0.4, ex === 9.4 ? 5 : 6);
    }
    P.line([[ex - 1.5, eyeY - 0.1], [ex - 0.6, eyeY - ry - 0.05], [ex + 0.6, eyeY - ry - 0.05], [ex + 1.5, eyeY - 0.1]], '#1a1210', female ? 2 : 1);
    if (female) P.line([[ex + (ex > 12 ? 1.5 : -1.5), eyeY - 0.2], [ex + (ex > 12 ? 2 : -2), eyeY - 0.7]], '#1a1210', 1);
    P.line([[ex - 1.2, eyeY + ry + 0.2], [ex + 1.2, eyeY + ry + 0.2]], skDD);
  }
  if (!st.dead && tier >= 2) P.ell(14.6, 9.6, 1.9, 0.6, '#8a5a66');
  if (!st.dead && tier >= 3) P.ell(14.6, 10.1, 1.7, 0.55, '#6a3a4a');
  if (!st.dead && tier >= 3) P.ell(9.4, 10.1, 1.6, 0.5, '#5a3040');

  paintNose(P, L);

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
  } else if (st.talk > 0.25) {
    // talking: open mouth with a hint of teeth, lip frame stays
    const open = 0.5 + st.talk * 0.9;
    P.ell(12, 16.2, 1.6, open, '#3a0c0c');
    P.rect(10.8, 15.4, 2.4, 0.4, '#e8e4dc');
    P.line([[10.3, 15.3], [12, 15.1], [13.7, 15.3]], lip, lw(0.35));
    P.line([[10.6, 16.9], [12, 17.1], [13.4, 16.9]], lip, lw(0.3));
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
      // nicked brow, a puffed cut on the cheekbone, shiny sweat sheen on the
      // forehead and obvious beads at BOTH temples (tier 1 must read alone)
      P.line([[7.1, 7.1], [8.9, 7.6]], '#c84a3a', lw(0.35));
      P.line([[7.3, 6.9], [8.9, 7.4]], blood, lw(0.25));
      P.dots(7, 6.8, 2.2, 1.4, '#e07060', 0.35, 2);
      P.ell(15.9, 13.2, 1.6, 1, mix(sk, '#6a4a68', 0.5));
      P.line([[14.9, 12.4], [16.6, 13.2]], mix(sk, '#4a3450', 0.4), lw(0.25));
      streak([[8.6, 12.6], [9.6, 13.2]], 0.3);
      P.rect(6.8, 9.4, u, 0.8, '#9ad0ff');
      P.ell(7, 9.2, 0.5, 0.9, '#b8e2ff');
      P.rect(6.9, 8.6, u, u, '#eefaff');
      P.ell(17, 9.2, 0.5, 0.9, '#b8e2ff');
      P.rect(16.9, 8.6, u, u, '#eefaff');
      P.dots(9, 5.4, 6, 1.4, '#cfe8ff', 0.22, 44);
    }
    if (tier >= 2) {
      // bruised eye socket + blood from the hairline running into the eye
      P.ell(14.6, 10.4, 2.1, 1.1, mix(sk, '#4a3450', 0.45));
      P.dots(13.4, 9.7, 2.4, 1.6, mix(sk, '#3a2440', 0.5), 0.5, 46);
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
