/**
 * ARSENAL: shared finger construction for the painted viewmodel hands.
 *
 * The old hands drew each finger as a flat strip with a dark line between
 * neighbours. A finger here is two tapered segments with a knuckle, a crease
 * at the joint, a lit top, a shaded underside and a nail, so a row of them
 * reads as a hand. Drawing goes through a HandPen, so each tool keeps its own
 * pose transform and mirroring.
 */

export type Pt = [number, number];

export interface HandPen {
  poly(color: string, pts: Pt[]): void;
  line(pts: Pt[], color: string, width?: number): void;
  ell(color: string, x: number, y: number, rx: number, ry: number): void;
}

export interface SkinTones {
  deep: string;
  shadow: string;
  /** Warm band where light turns to shadow. */
  warm: string;
  base: string;
  highlight: string;
  nail: string;
}

export interface FingerSpec {
  knuckle: Pt;
  tip: Pt;
  /** Half-width at the knuckle and at the tip (base units). */
  r0: number;
  r1: number;
  /** How far the middle joint rises off the straight line (base units). */
  bend?: number;
  nail?: boolean;
  /** Also crease the last joint (fingers seen from the back). */
  dip?: boolean;
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const hex = (c: number[]): string => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Six working tones from the four-step skin ramp [deep, shadow, base, highlight]. */
export function skinTones(ramp: readonly [string, string, string, string]): SkinTones {
  const [deep, shadow, base, highlight] = ramp;
  const mid = rgb(mixHex(shadow, base, 0.5));
  return {
    deep,
    shadow,
    warm: hex([mid[0] + 22, mid[1] + 2, mid[2] - 6]),
    base,
    highlight,
    nail: mixHex(highlight, '#ffe2d8', 0.55),
  };
}

/** Finger outline points, for tests and for shadows: knuckle top → tip → knuckle bottom. */
export function fingerOutline(spec: FingerSpec, grow = 0): Pt[] {
  const [kx, ky] = spec.knuckle;
  const [tx, ty] = spec.tip;
  const len = Math.hypot(tx - kx, ty - ky) || 1;
  const ux = (tx - kx) / len, uy = (ty - ky) / len;
  // normal pointing down the screen, so -n is the lit top
  let nx = -uy, ny = ux;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const bend = spec.bend ?? 0;
  const px = kx + (tx - kx) * 0.48 - nx * bend, py = ky + (ty - ky) * 0.48 - ny * bend;
  const r0 = spec.r0 + grow, r1 = spec.r1 + grow, rm = (spec.r0 + spec.r1) * 0.52 + grow;
  return [
    [kx - nx * r0, ky - ny * r0],
    [px - nx * rm, py - ny * rm],
    [tx - nx * r1, ty - ny * r1],
    [tx + ux * r1 * 0.9, ty + uy * r1 * 0.9],
    [tx + nx * r1, ty + ny * r1],
    [px + nx * rm, py + ny * rm],
    [kx + nx * r0, ky + ny * r0],
  ];
}

export function drawFinger(pen: HandPen, t: SkinTones, spec: FingerSpec): void {
  const [kx, ky] = spec.knuckle;
  const [tx, ty] = spec.tip;
  const len = Math.hypot(tx - kx, ty - ky) || 1;
  const ux = (tx - kx) / len, uy = (ty - ky) / len;
  let nx = -uy, ny = ux;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const bend = spec.bend ?? 0;
  const px = kx + (tx - kx) * 0.48 - nx * bend, py = ky + (ty - ky) * 0.48 - ny * bend;
  const r0 = spec.r0, r1 = spec.r1, rm = (r0 + r1) * 0.52;

  pen.poly(t.deep, fingerOutline(spec, 0.5));
  pen.ell(t.deep, tx, ty, r1 + 0.5, r1 + 0.5);
  // underside in shadow, a warm band, then the lit top
  pen.poly(t.shadow, fingerOutline(spec));
  pen.ell(t.shadow, tx, ty, r1, r1);
  const band = (color: string, lo: number): void =>
    pen.poly(color, [
      [kx - nx * r0, ky - ny * r0], [px - nx * rm, py - ny * rm], [tx - nx * r1, ty - ny * r1],
      [tx + nx * r1 * lo, ty + ny * r1 * lo], [px + nx * rm * lo, py + ny * rm * lo], [kx + nx * r0 * lo, ky + ny * r0 * lo],
    ]);
  band(t.warm, 0.5);
  band(t.base, 0.12);
  pen.ell(t.base, tx - nx * r1 * 0.3, ty - ny * r1 * 0.3, r1 * 0.8, r1 * 0.66);
  // lit ridge along the first segment
  pen.line([[kx + ux * len * 0.1 - nx * r0 * 0.62, ky + uy * len * 0.1 - ny * r0 * 0.62], [px - ux * len * 0.07 - nx * rm * 0.62, py - uy * len * 0.07 - ny * rm * 0.62]], t.highlight, 0.7);
  // joint crease
  pen.line([[px - nx * rm * 0.75, py - ny * rm * 0.75], [px + nx * rm * 0.45, py + ny * rm * 0.45]], t.shadow, 0.6);
  if (spec.dip) {
    const dx = px + (tx - px) * 0.58, dy = py + (ty - py) * 0.58;
    const rd = rm + (r1 - rm) * 0.58;
    pen.line([[dx - nx * rd * 0.7, dy - ny * rd * 0.7], [dx + nx * rd * 0.4, dy + ny * rd * 0.4]], t.shadow, 0.6);
  }
  if (spec.nail !== false) {
    const back = Math.min(len * 0.22, r1 * 2.1);
    pen.poly(t.nail, [
      [tx - ux * back - nx * r1 * 0.82, ty - uy * back - ny * r1 * 0.82],
      [tx + ux * r1 * 0.35 - nx * r1 * 0.78, ty + uy * r1 * 0.35 - ny * r1 * 0.78],
      [tx + ux * r1 * 0.35 + nx * r1 * 0.12, ty + uy * r1 * 0.35 + ny * r1 * 0.12],
      [tx - ux * back + nx * r1 * 0.12, ty - uy * back + ny * r1 * 0.12],
    ]);
  }
  // knuckle
  pen.ell(t.base, kx, ky, r0 * 1.12, r0 * 1.02);
  pen.ell(t.highlight, kx - nx * r0 * 0.3, ky - ny * r0 * 0.3, r0 * 0.6, r0 * 0.4);
}
