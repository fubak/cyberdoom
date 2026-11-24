import { limb, type Prim, type V3 } from './model';

/**
 * LOOK: props, pickups and people as primitive models, built the same way as
 * the threats (ellipsoids and boxes; x right, y up from the floor, z toward
 * the viewer) so they take the same baked light and outline. Units are
 * sprite-canvas units; the set definition scales them to texels.
 */

const ell = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'ell', c, r, col, ...extra });
const box = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'box', c, r, col, ...extra });

/** A smooth limb: one stretched ellipsoid from a to b (no bead banding). */
export function bone(out: Prim[], a: V3, b: V3, rad: number, col: string, extra: Partial<Prim> = {}): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  out.push({
    shape: 'ell',
    c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    r: [rad, len / 2 + rad * 0.55, rad],
    roll: Math.asin(Math.max(-1, Math.min(1, -dx / len))),
    pitch: Math.atan2(dz, dy),
    col,
    ...extra,
  });
}

const speck = (x: number, y: number, s: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------------ workstation

/** Desk, tower, monitor, keyboard, mouse and a mug. `frame` drives the infected screen's flicker. */
export function workstationModel(infected: boolean, frame = 0): Prim[] {
  const o: Prim[] = [];
  o.push(box([0, 25, 0], [27, 1.4, 11.5], '#8f5d36', { decal: (l) => (Math.abs((l[0] + 40) % 9) < 0.5 ? '#74482a' : null) }));
  for (const sx of [-1, 1]) o.push(box([sx * 24.5, 12, 0], [1.7, 12, 10], '#4a4d57'));
  o.push(box([0, 15, -10], [24, 8, 0.7], '#5d3c22'));
  o.push(box([16, 9.5, 1], [4.2, 9.5, 8.5], '#23262e'));
  o.push(box([16, 15, 9.6], [2.6, 0.5, 0.2], '#3a3f4b'));
  o.push(ell([14.6, 5.5, 9.6], [0.8, 0.8, 0.3], infected ? '#ff3020' : '#3dff7a', { glow: true }));
  limb(o, [-3, 26.4, -4], [-3, 32, -4], 1.5, '#2b2e36');
  o.push(box([-3, 26.9, -3.5], [5.5, 0.5, 3.4], '#2b2e36'));
  o.push(box([-3, 43, -4], [15.5, 10.4, 1.5], '#15171c'));
  const screen = infected
    ? (l: V3): string => {
      const gx = Math.floor((l[0] + 14) / 1.4), gy = Math.floor((l[1] + 9) / 1.4);
      const skull = (Math.abs(l[0]) < 4.4 && l[1] > -1.5 && l[1] < 5.5) || (Math.abs(l[0]) < 2.8 && l[1] > -4 && l[1] <= -1.5);
      const eye = Math.abs(Math.abs(l[0]) - 2) < 1 && l[1] > 1 && l[1] < 3.4;
      if (skull) return eye ? '#3a0408' : '#fff2e0';
      if (speck(gx, gy, 7 + frame) > 0.86) return '#ffe04a';
      return (gy + frame) % 2 ? '#d8141c' : '#a80c18';
    }
    : (l: V3): string => {
      if (l[1] > 6.6) return '#3f8cff';
      if (l[0] > -11 && l[0] < 1 && l[1] > -5 && l[1] < 4.5) return Math.abs((l[1] + 20) % 2.2) < 0.6 ? '#9fb6d8' : '#e6eefb';
      if (l[0] > 3.5 && l[0] < 11 && l[1] > -3 && l[1] < 4) return '#34e06c';
      return '#1c50c8';
    };
  o.push(box([-3, 43, -2.4], [14, 8.9, 0.25], '#000000', { decal: screen, decalGlow: true }));
  o.push(box([-3, 26.9, 5], [8.5, 0.6, 3], '#c9ccd4', { decal: (l) => (l[1] > 0 && (Math.floor(l[0] + 20) % 2 === 0 || Math.floor(l[2] + 20) % 2 === 0) ? '#8e929c' : null) }));
  o.push(ell([9.5, 27.2, 5.5], [1.5, 1, 2.2], '#d7dae1'));
  o.push(ell([-16, 28.6, 3], [2.2, 2.4, 2.2], '#e9e4d8'));
  o.push(ell([-16, 30.6, 3], [1.7, 0.5, 1.7], '#3a2416'));
  if (infected) {
    // corruption creeping up from the tower
    for (const [x, z, h] of [[19.5, 6, 20], [13, 9.8, 15], [21, -2, 24]]) {
      limb(o, [x, 0.8, z], [x + 1.5, h * 0.5, z + 0.8], 0.9, '#7a1458');
      limb(o, [x + 1.5, h * 0.5, z + 0.8], [x - 1, h, z + 0.3], 0.7, '#a01c74');
      o.push(ell([x - 1, h + 0.6, z + 0.3], [1.2, 1.2, 1.2], frame ? '#ff8ae6' : '#ff4ad0', { glow: true }));
    }
  }
  return o;
}

// ------------------------------------------------------------------ server rack

/** 42U cabinet with vented units, a cable loom down one side, and LEDs that change per frame. */
export function serverRackModel(frame = 0): Prim[] {
  const o: Prim[] = [];
  o.push(box([0, 31, 0], [13.5, 31, 11], '#1b1e26'));
  o.push(box([0, 62.6, 0], [14.2, 0.9, 11.6], '#2c313d'));
  o.push(box([0, 1.2, 0], [14.2, 1.2, 11.6], '#0f1116'));
  for (const sx of [-1, 1]) o.push(box([sx * 12.4, 31, 11.1], [0.9, 29, 0.3], '#3a4050'));
  const cols = ['#3dff7a', '#3dff7a', '#58e0ff', '#ffb020', '#3dff7a'];
  for (let u = 0; u < 9; u++) {
    const y = 6.5 + u * 6.2;
    o.push(box([0, y, 11.05], [10.6, 2.5, 0.3], u % 3 === 1 ? '#262b36' : '#2f3542', {
      decal: (l) => (l[0] < 3.2 && Math.abs((l[0] + 30) % 1.6) < 0.55 && Math.abs(l[1]) < 1.5 ? '#0c0d11' : null),
    }));
    for (let k = 0; k < 3; k++) {
      if (speck(u, k, 3 + frame * 5) > 0.3) o.push(box([5.2 + k * 2, y + 0.6, 11.4], [0.55, 0.55, 0.15], cols[(u + k * 2 + frame) % 5], { glow: true }));
    }
    o.push(box([7.2, y - 1.1, 11.4], [2.6, 0.3, 0.12], '#565d6e'));
  }
  limb(o, [-13.9, 58, 4], [-14.5, 6, 6], 0.6, '#ffb020');
  limb(o, [-13.9, 58, 7], [-14.5, 6, 8], 0.6, '#58e0ff');
  return o;
}

// ------------------------------------------------------------------ pickups

/** First-aid case hovering over a glow disc. */
export function medkitModel(): Prim[] {
  const o: Prim[] = [];
  o.push(ell([0, 2.2, 0], [12, 0.6, 7.2], '#35e0ff', { glow: true }));
  o.push(box([0, 14.5, 0], [10, 6.8, 4.8], '#e9ecf1', {
    decal: (l, n) => (n[2] > 0.5 && ((Math.abs(l[0]) < 1.7 && Math.abs(l[1]) < 4.5) || (Math.abs(l[1]) < 1.7 && Math.abs(l[0]) < 4.5)) ? '#e0222a' : Math.abs(l[1] - 2.6) < 0.35 ? '#aab0bc' : null),
  }));
  o.push(box([0, 17.4, 0], [10.3, 0.4, 5], '#b9bfca'));
  for (const sx of [-1, 1]) {
    o.push(box([sx * 5.6, 17.2, 5], [1.2, 1.3, 0.35], '#8a909c'));
    limb(o, [sx * 3.2, 21.3, 0], [sx * 3.2, 23.6, 0], 0.75, '#5a606c');
  }
  limb(o, [-3.2, 23.6, 0], [3.2, 23.6, 0], 0.9, '#5a606c');
  return o;
}

/** Scan charge: a glowing cell held between two caps by four rails. The core pulses per frame. */
export function chargeModel(frame = 0): Prim[] {
  const o: Prim[] = [];
  const core = frame ? '#8af2ff' : '#35e0ff';
  o.push(ell([0, 2.2, 0], [9, 0.6, 5.6], core, { glow: true }));
  o.push(box([0, 8.4, 0], [5.2, 1.4, 5.2], '#3a4050'));
  limb(o, [0, 9.8, 0], [0, 23.4, 0], 3.3, core, { glow: true });
  for (let a = 0; a < 4; a++) {
    const x = Math.cos(a * 1.5708 + 0.8) * 4.5, z = Math.sin(a * 1.5708 + 0.8) * 4.5;
    limb(o, [x, 9.8, z], [x, 23.4, z], 0.7, '#596074');
  }
  o.push(box([0, 24.8, 0], [5.2, 1.4, 5.2], '#3a4050'));
  o.push(box([0, 27, 0], [2.1, 0.9, 2.1], '#c9a23a'));
  return o;
}

// ------------------------------------------------------------------ people

export interface PersonLook {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  longHair: boolean;
  tie?: string;
  lanyard: string;
  /** A prop that says what this person does: a headset, a tablet, both or neither. */
  headset?: boolean;
  tablet?: boolean;
}

/** A standing or walking office worker, about six heads tall. `step` is the walk phase in radians (0 = standing). */
export function personModel(look: PersonLook, step = 0): Prim[] {
  const o: Prim[] = [];
  const sw = Math.sin(step) * 3.2;
  const { shirt, pants, skin, hair } = look;
  for (const sx of [-1, 1]) {
    const f = sx * sw;
    // the leading foot comes off the floor, so the step reads from the front too
    const up = Math.max(0, f) * 0.5;
    o.push(ell([sx * 3.6, 1.6 + up, f + 1.5], [2.7, 1.6, 4.4], '#1c1c22'));
    bone(o, [sx * 3.5, 3.4 + up, f], [sx * 3.6, 14 + up * 0.5, f * 0.4 + 0.6], 2.4, pants);
    bone(o, [sx * 3.6, 14, f * 0.4 + 0.6], [sx * 3.3, 25, 0], 2.9, pants);
  }
  o.push(ell([0, 26, 0], [6.4, 3.2, 4.2], pants));
  o.push(box([0, 28.4, 0], [6.1, 0.8, 4.2], '#17171c'));
  o.push(ell([0, 28.4, 4.3], [1.1, 0.9, 0.4], '#c9a23a'));
  o.push(ell([0, 35.6, 0], [5.9, 8, 4.2], shirt));
  o.push(ell([0, 41.2, 0.2], [7, 3, 4.1], shirt));
  for (const sx of [-1, 1]) {
    const a = -sx * sw * 0.9;
    const carrying = look.tablet && sx < 0;
    bone(o, [sx * 7.4, 41.6, 0], [sx * 9, 33.5, carrying ? 0 : a * 0.5], 2.3, shirt);
    if (carrying) {
      bone(o, [sx * 9, 33.5, 0], [sx * 5.5, 30.5, 6.3], 1.9, shirt);
      o.push(ell([sx * 5, 30.4, 7], [1.8, 1.6, 1.8], skin));
      o.push(box([-2.5, 32.5, 7.6], [4.6, 3.4, 0.5], '#16181d', { roll: -0.12 }));
      o.push(box([-2.5, 32.5, 8.1], [4, 2.8, 0.2], '#58e0ff', { roll: -0.12, glow: true }));
    } else {
      bone(o, [sx * 9, 33.5, a * 0.5], [sx * 9.4, 26.5, a + 1.5], 1.9, shirt);
      o.push(ell([sx * 9.5, 25, a + 1.8], [1.8, 2.1, 1.7], skin));
    }
  }
  if (look.tie) o.push(box([0, 38.5, 4.5], [1, 4.6, 0.3], look.tie));
  limb(o, [-2.6, 44.2, 3.6], [1.6, 36.5, 5.2], 0.45, look.lanyard);
  limb(o, [2.6, 44.2, 3.6], [1.6, 36.5, 5.2], 0.45, look.lanyard);
  o.push(box([1.6, 34.2, 5.5], [2.1, 2.6, 0.35], '#eef1f6', { decal: (l) => (l[1] > 0.4 && Math.abs(l[0]) < 1.1 ? '#8a6a52' : l[1] < -0.8 ? look.lanyard : null) }));
  bone(o, [0, 44.2, 0], [0, 47.6, 0.3], 2.1, skin);
  o.push(ell([0, 52.4, 0.6], [5, 5.9, 5.3], skin));
  o.push(ell([0, 54.9, -1], [5.4, 4.5, 5.7], hair));
  o.push(ell([-1.4, 57.3, 2.4], [4.4, 1.9, 3.4], hair, { roll: 0.2 }));
  if (look.longHair) o.push(ell([0, 47.5, -3.2], [5.6, 8.6, 3.2], hair));
  for (const sx of [-1, 1]) {
    o.push(ell([sx * 5, 52, 0.4], [0.9, 1.6, 1.1], skin));
    o.push(ell([sx * 2.1, 52.9, 5.5], [0.7, 0.85, 0.4], '#241812'));
    o.push(box([sx * 2.1, 54.6, 5.4], [1.3, 0.3, 0.35], hair, { roll: sx * -0.12 }));
  }
  o.push(ell([0, 51.2, 5.9], [0.8, 1.2, 0.8], skin));
  o.push(box([0, 49, 5.2], [1.4, 0.28, 0.3], '#8a4a3a'));
  if (look.headset) {
    for (let k = 0; k <= 12; k++) {
      const t = (k / 12) * Math.PI;
      o.push(ell([Math.cos(t) * 5.6, 53.5 + Math.sin(t) * 5.6, -0.4], [0.8, 0.8, 0.9], '#1a1c22'));
    }
    o.push(ell([-5.8, 52.4, 0.4], [1.3, 2.1, 1.9], '#1a1c22'));
    limb(o, [-5.8, 51, 1.5], [-3.2, 49, 5.2], 0.4, '#1a1c22');
    o.push(ell([-3, 48.9, 5.5], [0.7, 0.6, 0.6], '#58e0ff', { glow: true }));
  }
  return o;
}
