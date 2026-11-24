import { limb, type Prim, type V3 } from './model';

/**
 * ENEMIES: redesigned threat models whose outline says what they are.
 *
 * The wiper and the four bosses used to share one body (box torso, round
 * chest light, ball shoulders, horns), and the RAT was a green bug with the
 * same antenna-and-ball top as three other threats. Each now has a shape of
 * its own, drawn from what the malware does:
 *   RAT          a puppet hung on cables, with a webcam lens for a face
 *   WIPER        a hovering eraser with degaussing coils, its base in pieces
 *   LOCKER       a walking vault: round door for a chest, chains for arms
 *   GHOSTLEDGER  a hooded figure with no legs, trailing ledger tape
 *   PHISH        an anglerfish with an envelope for a lure
 *   ZERO-DAY     an unfinished, lopsided spider-mech marked with a "?"
 * Units are sprite-canvas units: x right, y up from the floor, z toward the viewer.
 */

export type ThreatPose =
  | { kind: 'walk'; k: number; n?: number }
  | { kind: 'attack'; k: 0 | 1 }
  | { kind: 'pain'; k?: 0 | 1 }
  | { kind: 'dead' };
export type ThreatModel = (pose: ThreatPose) => Prim[];

const ell = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'ell', c, r, col, ...extra });
const box = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'box', c, r, col, ...extra });
const phase = (p: ThreatPose): number => (p.kind === 'walk' ? (p.k / (p.n ?? 4)) * Math.PI * 2 : 0);
/** -1 on the wind-up pose, +1 on the strike, 0 otherwise. */
const strike = (p: ThreatPose): -1 | 0 | 1 => (p.kind === 'attack' ? (p.k === 0 ? -1 : 1) : 0);
const flinch = (p: ThreatPose): -1 | 0 | 1 => (p.kind === 'pain' ? (p.k === 1 ? -1 : 1) : 0);
const rnd = (i: number, s: number): number => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(s | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A ring of beads in the XY plane around `c`. */
function ring(out: Prim[], c: V3, radius: number, n: number, bead: number, cols: [string, string]): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(ell([c[0] + Math.cos(a) * radius, c[1] + Math.sin(a) * radius, c[2]], [bead, bead, bead], cols[i % 2]));
  }
}

/** A hanging chain of links from a to b, sagging by `sag`. */
function chain(out: Prim[], a: V3, b: V3, links: number, sag: number, bead: number, cols: [string, string]): void {
  for (let i = 0; i <= links; i++) {
    const t = i / links;
    const dip = Math.sin(t * Math.PI) * sag;
    out.push(ell([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - dip, a[2] + (b[2] - a[2]) * t], [bead, bead * 1.25, bead * 0.8], cols[i % 2], { roll: i % 2 ? 0.6 : 0 }));
  }
}

// ------------------------------------------------------------------ RAT

/** Remote access trojan: someone else is pulling the strings, and watching through the lens. */
export const ratModel: ThreatModel = (pose) => {
  const o: Prim[] = [];
  const cable = '#20242c';
  if (pose.kind === 'dead') {
    o.push(ell([0, 5, 0], [12, 4.5, 9], '#4a6e3c'));
    o.push(ell([9, 6.5, 5], [6, 5, 5.5], '#3f5e34', { roll: 0.5 }));
    o.push(ell([10, 8, 9.6], [3.6, 3.6, 1.4], '#0c0e12'));
    for (const [x, z] of [[-12, 4], [-6, 9], [4, -8], [15, -3]] as [number, number][]) limb(o, [x, 1.2, z], [x + 9, 1.4, z + 5], 0.7, cable);
    return o;
  }
  const ph = phase(pose);
  const atk = strike(pose);
  const hit = flinch(pose);
  // marionette motion: it hangs, so it moves in jerks, not strides
  const hop = pose.kind === 'walk' ? (pose.k % 2) * 2 : 0;
  const lunge = atk === 1 ? 6 : 0;
  const tilt = hit * 0.3;
  const by = 26 + hop + (atk === -1 ? 3 : 0);
  // the strings: up and out of the top of the frame
  const slack = hit !== 0 ? 5 : 0;
  limb(o, [0, by + 20, lunge], [1 + slack, 68, -3], 0.7, cable);
  for (const sx of [-1, 1]) limb(o, [sx * 6, by + 8, lunge], [sx * (10 + slack), 68, -2], 0.7, cable);
  // legs dangle; the toes only just reach the floor
  for (const sx of [-1, 1]) {
    const sw = Math.sin(ph + (sx > 0 ? Math.PI : 0)) * 3;
    limb(o, [sx * 4, by - 8, lunge], [sx * 5, 9 + hop, sw + lunge * 0.5], 1.7, '#3f5e34');
    limb(o, [sx * 5, 9 + hop, sw + lunge * 0.5], [sx * 5, 2.4 + hop * 0.5, sw + 2], 1.4, '#4a6e3c');
    o.push(ell([sx * 5, 1.6 + hop * 0.5, sw + 3.5], [2.2, 1.3, 3], '#22301c'));
  }
  // a full body and head: thin as a puppet reads, it still has to cover enough of the screen at range
  o.push(ell([0, by, lunge], [10, 10.5, 8], '#5d8a4a', { roll: tilt }));
  o.push(ell([0, by - 2, lunge + 5], [7, 7, 4], '#7aa862', { roll: tilt }));
  // arms hang from their own strings
  for (const sx of [-1, 1]) {
    const hand: V3 = atk === -1 ? [sx * 14, by + 10, 2] : atk === 1 ? [sx * 9, by - 2, 15] : [sx * 12, by - 11 + hop, 4];
    const elbow: V3 = [sx * 13, (by + 5 + hand[1]) / 2, (hand[2] + lunge) / 2 + 1];
    limb(o, [sx * 8, by + 5, lunge], elbow, 1.5, '#3f5e34');
    limb(o, elbow, hand, 1.3, '#4a6e3c');
    o.push(ell(hand, [2, 2.2, 2], '#22301c'));
    limb(o, hand, [sx * (15 + slack), 68, 0], 0.6, cable);
  }
  // camera head: one lens, a tally light, and a dish for an ear
  const hy = by + 17;
  o.push(ell([0, hy, 2 + lunge], [8.6, 7.4, 7.5], '#4a6e3c', { roll: tilt * 1.4 }));
  o.push(ell([0, hy, 9 + lunge], [5.2, 5.2, 1.6], '#0c0e12'));
  o.push(ell([0, hy, 10.2 + lunge], [3.3, 3.3, 1], '#1e3a5a'));
  const iris = atk === 1 ? '#ffffff' : atk === -1 ? '#ff4030' : '#54e8ff';
  const open = atk === 0 ? 1.3 : 0.8;
  o.push(ell([0, hy, 11 + lunge], [open * 1.2, open * 1.2, 0.6], iris, { glow: true }));
  o.push(ell([4.6, hy + 4.5, 6.5 + lunge], [0.9, 0.9, 0.7], '#ff2a1a', { glow: true }));
  limb(o, [-6, hy + 2, lunge], [-9, hy + 5, lunge], 0.8, '#3f5e34');
  o.push(ell([-10, hy + 6, lunge + 0.5], [3.6, 3.6, 1.1], '#c8ccd4', { roll: 0.5, yaw: 0.5 }));
  o.push(ell([-10, hy + 6, lunge + 1.6], [1, 1, 0.8], '#8a909c'));
  return o;
};

// ------------------------------------------------------------------ WIPER

/** Wiper: degaussing coils held wide, a screen of zeroes, and a base already erased to pieces. */
export const wiperModel: ThreatModel = (pose) => {
  const o: Prim[] = [];
  const copper: [string, string] = ['#b86a2a', '#8a4a1a'];
  if (pose.kind === 'dead') {
    for (let i = 0; i < 12; i++) {
      const s = 3.4 - rnd(i, 5) * 2;
      o.push(box([(rnd(i, 1) - 0.5) * 34, s, (rnd(i, 2) - 0.5) * 18], [s, s, s], i % 3 ? '#2a1218' : '#4a1c24', { yaw: rnd(i, 3) * 3 }));
    }
    for (const sx of [-1, 1]) o.push(ell([sx * 15, 2.2, 4], [8, 1.4, 8], copper[1]));
    o.push(ell([0, 4, 2], [5, 1.6, 4], '#ff6a3a', { glow: true }));
    return o;
  }
  const ph = phase(pose);
  const atk = strike(pose);
  const hit = flinch(pose);
  const hover = Math.sin(ph) * 1.5;
  const ty = 37 + hover;
  // lower body: the wipe has already started on itself
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const s = 3.6 * (1 - t * 0.72);
    const drift = pose.kind === 'walk' ? Math.sin(ph + i * 1.7) * 1.2 : 0;
    const col = rnd(i, 9) > 0.9 && i > 3 ? '#ff6a3a' : i % 2 ? '#2a1218' : '#4a1c24';
    o.push(box([(rnd(i, 1) - 0.5) * (9 + t * 12) + drift, ty - 12 - t * 22, (rnd(i, 2) - 0.5) * 9], [s, s, s], col, { yaw: rnd(i, 3) * 2, ...(col === '#ff6a3a' ? { glow: true } : {}) }));
  }
  o.push(box([0, ty, 0], [12, 11, 8], '#2a1218', { roll: hit * 0.2 }));
  // chest screen: zeroes; the strike wipes it to white
  const swept = atk === 1 ? 99 : atk === -1 ? 0 : -99;
  o.push(box([0, ty + 1, 8.2], [8.6, 6.6, 0.4], '#1a0508', {
    roll: hit * 0.2,
    decalGlow: true,
    decal: (l) => {
      if (l[0] < swept) return '#ffffff';
      if (hit !== 0) return rnd(Math.floor(l[0] * 2), Math.floor(l[1] * 2)) > 0.6 ? '#ff6a3a' : null;
      const cx = ((l[0] + 8.6) % 4.3) - 2.15, cy = ((l[1] + 6.6) % 6.6) - 3.3;
      const d = Math.hypot(cx / 1.3, cy / 2.3);
      return d > 0.62 && d < 1 ? '#ff6a3a' : null;
    },
  }));
  o.push(box([0, ty + 15, 0], [6, 4, 5.5], '#1c0c10'));
  o.push(box([0, ty + 15, 5.6], [4.6, 0.9, 0.3], atk === 1 ? '#ffffff' : '#ffd040', { glow: true }));
  // degaussing coils: held wide, pulled back, then thrust at you
  for (const sx of [-1, 1]) {
    const c: V3 = atk === -1 ? [sx * 17, ty + 4, -5] : atk === 1 ? [sx * 13, ty, 13] : [sx * 21, ty + hit * sx * 3, 2];
    limb(o, [sx * 12, ty + 6, 0], [c[0] - sx * 2, c[1] + 7, c[2] - 1], 2.2, '#3a1a22');
    ring(o, c, 8, 14, 1.9, copper);
    if (atk === 1) o.push(ell([c[0], c[1], c[2] + 0.5], [6, 6, 0.6], '#fff0a0', { glow: true }));
    else o.push(ell([c[0], c[1], c[2]], [1.6, 1.6, 1.2], '#ff6a3a', { glow: true }));
  }
  return o;
};

// ------------------------------------------------------------------ BOSS: LOCKER

/** Locker Overlord: a walking vault. The round door is its chest; the keyhole in the hub is the way in. */
export const bossLockerModel: ThreatModel = (pose) => {
  const o: Prim[] = [];
  const steel: [string, string] = ['#c8c0b4', '#8f887c'];
  if (pose.kind === 'dead') {
    o.push(box([0, 6, 0], [21, 6, 13], '#2c231b'));
    o.push(ell([-14, 2.4, 10], [13, 2.2, 13], '#b8821e'));
    o.push(ell([2, 10, 6], [9, 2, 7], '#ff7a20', { glow: true }));
    for (const sx of [-1, 1]) chain(o, [sx * 18, 6, -4], [sx * 27, 1.6, 8], 7, 0, 1.7, steel);
    return o;
  }
  const ph = phase(pose);
  const atk = strike(pose);
  const hit = flinch(pose);
  const bob = Math.abs(Math.sin(ph)) * 1.6;
  const by = 34 + bob;
  for (const sx of [-1, 1]) {
    const stride = Math.sin(ph + (sx > 0 ? Math.PI : 0)) * 4.5;
    limb(o, [sx * 10, by - 14, 0], [sx * 11, 3, stride], 4.6, '#2a221c');
    o.push(box([sx * 11, 12, stride * 0.5 + 4], [4.2, 3, 1.6], '#d49a2a'));
    o.push(box([sx * 11, 2.2, stride + 2.5], [6, 2.2, 7], '#1c1612'));
  }
  // bronze, not black: at 15 tiles the body is most of what you see
  o.push(box([0, by, 0], [20, 16, 12], '#6a5230', { roll: hit * 0.08 }));
  for (const sx of [-1, 1]) o.push(box([sx * 18.5, by, 9], [1.6, 15, 3.6], '#8c6a34'));
  // the door swings aside on the strike and shows what is inside
  const swing = atk === 1 ? 1 : 0;
  const door: V3 = [-11 * swing, by, 12 + 4 * swing];
  if (swing) o.push(ell([0, by, 11.6], [12, 12, 1], '#ff7a20', { glow: true }));
  o.push(ell(door, [14, 14, 2.4], '#b8821e', { yaw: swing * 1 }));
  o.push(ell([door[0], door[1], door[2] + 0.9], [10.6, 10.6, 2.2], '#8c6218', { yaw: swing * 1 }));
  if (!swing) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      o.push(ell([Math.cos(a) * 12.4, by + Math.sin(a) * 12.4, 14], [1.2, 1.2, 0.9], '#e6c060'));
    }
    const turn = atk === -1 ? 0.6 : 0;
    for (let s = 0; s < 3; s++) {
      const a = turn + (s / 3) * Math.PI;
      limb(o, [Math.cos(a) * 8, by + Math.sin(a) * 8, 14.8], [-Math.cos(a) * 8, by - Math.sin(a) * 8, 14.8], 1.1, '#d8d0c4');
    }
    // keyhole weak point in the hub
    const key = hit !== 0 ? '#ffffff' : atk === -1 ? '#ffb030' : '#ff4020';
    o.push(ell([0, by + 1.6, 16.2], [2.6, 2.6, 1], key, { glow: true }));
    o.push(box([0, by - 2.6, 16.2], [1.1, 2.8, 1], key, { glow: true }));
  }
  // slit turret for a head, under a short shackle
  o.push(box([0, by + 20 + hit, 0], [7.5, 4, 6.5], '#3a2c1e'));
  o.push(box([0, by + 20.4 + hit, 6.6], [5.6, 1.1, 0.4], atk === 1 ? '#ffffff' : '#ff2e18', { glow: true }));
  for (const sx of [-1, 1]) limb(o, [sx * 6, by + 23, 0], [sx * 5, by + 28, 0], 1.8, steel[0]);
  limb(o, [-5, by + 28, 0], [5, by + 28, 0], 1.8, steel[0]);
  // chains for arms, each ending in a lock weight
  for (const sx of [-1, 1]) {
    const end: V3 = atk === -1 ? [sx * 26, by + 18, -7] : atk === 1 ? [sx * 15, by - 4, 22] : [sx * 27, 16 + Math.sin(ph + sx) * 2, 4 + hit * 3];
    chain(o, [sx * 20, by + 11, 0], end, 8, atk === 0 ? 5 : 1, 1.8, steel);
    o.push(box([end[0], end[1] - 4, end[2]], [4, 5, 4], steel[0]));
    o.push(box([end[0], end[1] - 4, end[2] + 4.1], [1.2, 2, 0.3], '#2c231b'));
  }
  return o;
};

// ------------------------------------------------------------------ BOSS: GHOSTLEDGER

/** Ghostledger: a hood with nothing in it, a cloak of scrolling figures, and ledger tape where legs should be. */
export const bossGhostledgerModel: ThreatModel = (pose) => {
  const o: Prim[] = [];
  const tape: [string, string] = ['#d8d0e8', '#b0a4d0'];
  if (pose.kind === 'dead') {
    o.push(ell([0, 4.5, 0], [17, 4.5, 12], '#2a1740'));
    o.push(ell([4, 5.5, 7], [7, 3, 5], '#07030c'));
    for (let i = 0; i < 9; i++) o.push(box([(rnd(i, 1) - 0.5) * 38, 1 + rnd(i, 4), (rnd(i, 2) - 0.5) * 20], [4.5, 0.4, 2.2], tape[i % 2], { yaw: rnd(i, 3) * 3 }));
    return o;
  }
  const ph = phase(pose);
  const atk = strike(pose);
  const hit = flinch(pose);
  const drift = Math.sin(ph) * 1.6;
  const by = 36 + drift;
  // ledger tape trails down and back in place of legs
  for (const x of [-9, 0, 9]) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const wave = Math.sin(ph * 1 + i * 0.8 + x) * (1 + t * 3);
      o.push(box([x + wave + hit * t * 5, by - 12 - t * 22, -t * 9], [3.4 * (1 - t * 0.45), 1.5, 0.3], tape[i % 2], {
        pitch: 0.35,
        decal: (l) => (Math.abs(l[1]) < 0.3 && Math.abs(l[0] % 1.3) < 0.7 ? '#5a3a8a' : null),
      }));
    }
  }
  o.push(ell([0, by, 0], [16, 12, 9], '#3a2060', { roll: hit * 0.12 }));
  o.push(ell([0, by - 9, 0], [12, 6, 8], '#2a1740'));
  // the cloak's front: columns of figures
  const scroll = pose.kind === 'walk' ? pose.k : atk * 3;
  o.push(box([0, by - 1, 8.7], [9, 9.5, 0.4], '#1a0a2a', {
    decalGlow: true,
    decal: (l) => {
      const col = Math.floor((l[0] + 9) / 2.25), row = Math.floor((l[1] + 9.5) / 1.6 + scroll);
      if (Math.abs(((l[0] + 9) % 2.25) - 1.1) > 0.75 || Math.abs(((l[1] + 9.5) % 1.6) - 0.8) > 0.5) return null;
      if (atk === 1) return '#ffffff';
      return rnd(col, row) > 0.45 ? '#ff5ab4' : null;
    },
  }));
  // hood, and the void inside it
  const hy = by + 13 + hit;
  o.push(ell([0, hy, 0], [11, 12, 10], '#2a1740'));
  o.push(ell([0, hy + 11, -3], [5, 5.5, 5], '#3a2060'));
  o.push(ell([0, hy - 2, 7], [6.6, 7.6, 4], '#07030c'));
  for (const sx of [-1, 1]) o.push(ell([sx * 2.7, hy - 0.6, 10.4], [1.4, atk === 1 ? 1.4 : 0.8, 0.5], hit !== 0 ? '#ffffff' : '#ff3a9a', { glow: true }));
  for (const x of [-5, 0, 5]) limb(o, [x, hy + 10, -1], [x * 1.3, hy + 15 + (x === 0 ? 3 : 0), -2], 0.9, tape[0]);
  // long sleeves; the hands carry the charge
  for (const sx of [-1, 1]) {
    const hand: V3 = atk === -1 ? [sx * 20, hy + 6, 0] : atk === 1 ? [sx * 11, by + 2, 20] : [sx * 21, by - 15 + Math.sin(ph + sx) * 1.5, 8];
    const elbow: V3 = [sx * 22, (by + hand[1]) / 2 + 2, hand[2] * 0.4];
    limb(o, [sx * 14, by + 4, 0], elbow, 3.4, '#3a2060');
    limb(o, elbow, hand, 2.4, '#2a1740');
    o.push(ell(hand, atk === 1 ? [4.2, 4.2, 4.2] : [2.6, 2.6, 2.6], atk === 1 ? '#ffffff' : '#ff3a9a', { glow: true }));
  }
  return o;
};

// ------------------------------------------------------------------ BOSS: PHISH

/** Vishing Broker: an anglerfish. You see the envelope first; the jaw only opens when it strikes. */
export const bossPhishModel: ThreatModel = (pose) => {
  const o: Prim[] = [];
  const hide = '#12403a';
  if (pose.kind === 'dead') {
    o.push(ell([0, 7, 0], [19, 7, 14], '#2a6a5e'));
    o.push(ell([0, 9.5, 2], [13, 5, 10], '#b8d8c8'));
    limb(o, [10, 6, 8], [22, 1.6, 14], 0.8, hide);
    o.push(box([24, 1.8, 15], [3.4, 0.6, 2.4], '#8a8468'));
    for (const sx of [-1, 1]) o.push(ell([sx * 19, 4, -2], [5, 1.4, 6], hide));
    return o;
  }
  const ph = phase(pose);
  const atk = strike(pose);
  const hit = flinch(pose);
  const bob = Math.sin(ph) * 1.8;
  const by = 28 + bob + (atk === 1 ? -1 : 0);
  const fwd = atk === 1 ? 5 : 0;
  // tail and fins
  o.push(ell([0, by + 1, -20], [3, 10, 6], '#0c2c28'));
  for (const sx of [-1, 1]) o.push(ell([sx * 19, by - 3, -3], [5, 7, 2.2], '#0c2c28', { roll: sx * (0.5 + Math.sin(ph + sx) * 0.2) }));
  for (let i = 0; i < 4; i++) limb(o, [0, by + 12, -10 + i * 5], [0, by + 18 - i, -13 + i * 5], 0.9, '#0c2c28');
  o.push(ell([0, by, -2 + fwd], [17, 14, 16], hide, { roll: hit * 0.12 }));
  o.push(ell([0, by - 6, 2 + fwd], [13, 7, 13], '#1c5a50'));
  // lights along the flank
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) o.push(ell([sx * (15.4 - i * 0.5), by + 2 - i * 3, 4 - i * 4 + fwd], [1, 1, 0.8], '#2affb0', { glow: true }));
  // the jaw: a slit at rest, wide on the strike
  const gape = atk === 1 ? 11 : atk === -1 ? 6 : hit !== 0 ? 8 : 1.6;
  const my = by - 5;
  o.push(ell([0, my, 13 + fwd], [12.5, gape, 4], '#04100e'));
  if (atk === 1) o.push(ell([0, my, 12 + fwd], [8, gape * 0.6, 2], '#2affb0', { glow: true }));
  for (let i = -3; i <= 3; i++) {
    const x = i * 3.4;
    const edge = Math.sqrt(Math.max(0, 1 - (x / 12.5) ** 2));
    const len = 2.6 - Math.abs(i) * 0.25;
    o.push(ell([x, my + gape * edge - len * 0.6, 15.4 + fwd], [0.9, len, 0.9], '#e8e4d0'));
    o.push(ell([x + 1.7, my - gape * edge + len * 0.6, 15.8 + fwd], [0.9, len, 0.9], '#e8e4d0'));
  }
  for (const sx of [-1, 1]) {
    o.push(ell([sx * 9.5, by + 7, 10.5 + fwd], [2.3, 2.3, 1.6], '#d8ffe8'));
    o.push(ell([sx * 9.5, by + 7, 12 + fwd], [0.9, 0.9, 0.6], '#04100e'));
  }
  // the lure: an envelope on a stalk, swung out in front
  const sway = Math.sin(ph) * 3 + hit * 8;
  const whip = atk === 1 ? -8 : atk === -1 ? 4 : 0;
  const tip: V3 = [sway, by + 20 + whip * 0.5, 24 + fwd + whip];
  limb(o, [0, by + 12, 8 + fwd], [sway * 0.3, by + 26, 12 + fwd], 0.9, hide);
  limb(o, [sway * 0.3, by + 26, 12 + fwd], [sway * 0.8, by + 28, 20 + fwd + whip * 0.5], 0.8, hide);
  limb(o, [sway * 0.8, by + 28, 20 + fwd + whip * 0.5], [tip[0], tip[1] + 3, tip[2]], 0.7, hide);
  o.push(box(tip, [4.4, 3, 0.8], '#fff2c0', {
    glow: true,
    decal: (l) => (Math.abs(Math.abs(l[0]) * 0.68 - (3 - l[1]) * 0.5) < 0.35 && l[1] > -0.5 ? '#c8a040' : null),
  }));
  return o;
};

// ------------------------------------------------------------------ BOSS: ZERO-DAY

/** CVE-0DAY: unknown and unfinished. One arm far too big, plates missing, the core showing through. */
export const bossZerodayModel: ThreatModel = (pose) => {
  const o: Prim[] = [];
  const char = '#2a1210';
  if (pose.kind === 'dead') {
    o.push(box([0, 5, 0], [15, 5, 11], char, { roll: 0.15 }));
    o.push(ell([4, 7, 3], [6, 3, 5], '#8a3a10', { glow: true }));
    for (const [x, z] of [[-22, 8], [-18, -10], [20, 10], [24, -6]] as [number, number][]) limb(o, [x * 0.5, 4, z * 0.5], [x, 1.6, z], 2.2, '#3c1a14');
    limb(o, [10, 6, 4], [26, 2.4, 14], 3.4, '#3c1a14');
    return o;
  }
  const ph = phase(pose);
  const atk = strike(pose);
  const hit = flinch(pose);
  const bob = Math.abs(Math.sin(ph)) * 1.4;
  // the strike drops the whole body onto the target
  const by = 30 + bob - (atk === 1 ? 5 : 0);
  // it has not finished loading: every few frames a plate is in the wrong place
  const glitch = pose.kind === 'walk' && pose.k % 4 === 3 ? 2 : hit * 2.5;
  // four legs, none the same length; the back-right one was never completed
  const legs: [number, number, number, boolean][] = [[-1, 1, 1.15, true], [1, 1, 0.9, true], [-1, -1, 1, true], [1, -1, 0.55, false]];
  legs.forEach(([sx, sz, reach, whole], i) => {
    const step = Math.sin(ph + i * 1.7) * 3;
    const hip: V3 = [sx * 11, by - 3, sz * 6];
    const knee: V3 = [sx * 18 * reach, by + 7, sz * 10 + step * 0.5];
    const foot: V3 = whole ? [sx * 22 * reach, 1.6 + Math.max(0, step) * 0.8, sz * 14 + step] : [sx * 17, by - 8, sz * 12];
    limb(o, hip, knee, 2.8, '#3c1a14');
    o.push(ell(knee, [3.4, 3.4, 3.4], '#ff8a2a', { glow: true }));
    limb(o, knee, foot, 2.2, '#4a2018');
    if (whole) o.push(box([foot[0], 1.4, foot[2]], [3.4, 1.4, 3.8], '#170a08'));
    else o.push(ell(foot, [2, 2, 2], '#ffe070', { glow: true }));
  });
  // the core, with a plate missing over it
  o.push(ell([5, by + 3, 2], [6.5, 6.5, 6.5], atk === 1 ? '#ffffff' : '#ff6a1a', { glow: true }));
  for (let i = 0; i < 4; i++) limb(o, [1 + i * 3.4, by - 5, 8], [3 + i * 3.4, by + 11, 6], 0.7, '#6a2a1a');
  o.push(box([-3, by, 0], [10, 10, 10], char, { roll: 0.08 + hit * 0.1 }));
  // left plate carries the only marking it has: a question mark
  o.push(box([-7 - glitch, by + 4, 9.6], [6.5, 8, 1], '#3c1a14', {
    decalGlow: true,
    decal: (l, n) => {
      if (n[2] < 0.5) return null;
      const hook = Math.abs(Math.hypot(l[0], l[1] - 2.6) - 2.4) < 0.75 && (l[1] > 2.2 || l[0] > 0);
      const stem = Math.abs(l[0]) < 0.75 && l[1] < 0.6 && l[1] > -2.2;
      const dot = Math.abs(l[0]) < 0.85 && l[1] < -3.4 && l[1] > -5;
      return hook || stem || dot ? '#ffd060' : null;
    },
  }));
  // cracks leaking light
  for (const [x, y, r] of [[-11, by - 6, 0.5], [9, by - 7, -0.6], [3, by + 9, 0.9]] as [number, number, number][]) {
    o.push(box([x, y, 10.3], [0.5, 3.6, 0.2], '#ffb040', { roll: r, glow: true }));
  }
  // sensor cluster, off-centre, three eyes of three sizes
  o.push(ell([-4, by + 14, 4], [4.6, 4, 4.6], '#3c1a14'));
  for (const [x, y, s] of [[-6, by + 15, 1.4], [-3, by + 13.4, 0.8], [-1.6, by + 15.6, 0.5]] as [number, number, number][]) {
    o.push(ell([x, y, 8.2], [s, s, 0.6], hit !== 0 ? '#ffffff' : '#ffe040', { glow: true }));
  }
  // the one oversized arm
  // raised high on the wind-up, then swept down across the body
  const wrist: V3 = atk === -1 ? [24, by + 26, 0] : atk === 1 ? [4, by - 6, 24] : [27, by + 12, 8];
  limb(o, [13, by + 6, 2], [22, by + 14, 3], 4.2, '#3c1a14');
  limb(o, [22, by + 14, 3], wrist, 3.6, '#4a2018');
  for (const dy of [-1, 1]) {
    const tip: V3 = [wrist[0] + (atk === 1 ? -3 : 2), wrist[1] + dy * (atk === 1 ? 2 : 5), wrist[2] + 9];
    limb(o, wrist, tip, 2, '#d8c8b0');
  }
  o.push(ell(wrist, [3.2, 3.2, 3.2], atk === 1 ? '#ffffff' : '#ff8a2a', { glow: true }));
  return o;
};
