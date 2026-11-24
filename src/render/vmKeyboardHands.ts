import { shade } from '../tools/pixel';
import { drawFinger, type HandPen, type Pt, type SkinTones } from './vmHand';

/**
 * ARSENAL: the analyst's hands on the keyboard, in a typing posture.
 *
 * Seen from the analyst's own eyes: forearms come up from the bottom corners
 * angled inward, wrists straight and hovering at the near edge of the case,
 * the backs of the hands toward the viewer, fingers curved onto the home row
 * (A S D F / J K L ;) and thumbs resting on the space bar. The strike is the
 * right hand rocking outward so the little finger hits Enter.
 *
 * Everything is authored for the RIGHT hand in keyboard-art units (160 wide);
 * the left hand is the same geometry mirrored about x = 80, so both hands are
 * lit from the same upper-left side.
 */

export type KeyboardHandFrame = 'rest' | 'raise' | 'swing' | 'contact' | 'recover';
/** Idle fidget: one finger lifts off its key for a moment. */
export type KeyboardFidget = '' | 'L' | 'R';

export interface SleeveLook {
  jacket: string;
  accent: string;
  seam: string;
}

type FingerId = 0 | 1 | 2 | 3; // index, middle, ring, little

/** Fingertip rest points on J K L ; (right hand). */
const HOME: Pt[] = [[88.6, 36.2], [94.4, 35.3], [100.1, 35.6], [105.9, 36.7]];
/** Enter key centre (amber key, end of the home row). */
export const ENTER_KEY: Pt = [111.8, 35.2];
/** Thumb rest point on the space bar. */
const THUMB_HOME: Pt = [87.8, 48.9];

/** Knuckle positions in hand space: [across the hand toward the little finger, along the hand toward the fingers]. */
const KNUCKLE: Pt[] = [[-7.6, 13.4], [-2.6, 13.9], [2.5, 13.2], [7.2, 11.6]];
const GIRTH = [2.25, 2.3, 2.15, 1.9];
/** Forearm angle off vertical, degrees inward. */
const FOREARM_DEG = 14;
const WRIST: Pt = [105.5, 58.2];

interface HandPose {
  dx: number;
  dy: number;
  /** Extra rotation, degrees; negative swings the hand outward. */
  rot: number;
  /** Per finger: how far it is lifted off its key (0 = resting, 1 = fully raised). */
  lift: [number, number, number, number];
  /** Where the little finger is aiming, if not its home key. */
  little?: Pt;
}

const REST: HandPose = { dx: 0, dy: 0, rot: 0, lift: [0, 0, 0, 0] };

const RIGHT: Record<KeyboardHandFrame, HandPose> = {
  rest: REST,
  raise: { dx: 1.5, dy: -1, rot: -3, lift: [0.8, 0.8, 0.8, 0.5], little: [110.4, 36.5] },
  swing: { dx: 2.2, dy: -0.4, rot: -5, lift: [1, 1, 1, 0.2], little: [111.4, 35.7] },
  contact: { dx: 2.4, dy: 0.7, rot: -5, lift: [0.6, 0.6, 0.6, 0], little: ENTER_KEY },
  recover: { dx: 1.2, dy: 0.2, rot: -2, lift: [0.3, 0.3, 0.3, 0.4], little: [108.6, 36.3] },
};

const LEFT: Record<KeyboardHandFrame, HandPose> = {
  rest: REST,
  raise: { dx: 0, dy: -0.4, rot: 0, lift: [0.7, 0, 0, 0] },
  swing: { dx: 0, dy: -0.2, rot: 0, lift: [0, 0.5, 0, 0] },
  contact: { dx: 0, dy: 0.3, rot: 0, lift: [0, 0, 0, 0] },
  recover: REST,
};

function drawHand(pen: HandPen, t: SkinTones, look: SleeveLook, mirror: boolean, pose: HandPose): void {
  const rad = ((FOREARM_DEG + pose.rot) * Math.PI) / 180;
  // hand axes in right-hand space: `along` points from wrist to fingers, `across` toward the little finger
  const along: Pt = [-Math.sin(rad), -Math.cos(rad)];
  const across: Pt = [Math.cos(rad), -Math.sin(rad)];
  const wx = WRIST[0] + pose.dx, wy = WRIST[1] + pose.dy;
  const flip = (p: Pt): Pt => (mirror ? [160 - p[0], p[1]] : p);
  const H = (u: number, v: number): Pt => flip([wx + u * across[0] + v * along[0], wy + u * across[1] + v * along[1]]);
  const poly = (color: string, uv: Pt[]): void => pen.poly(color, uv.map(([u, v]) => H(u, v)));
  // shift a hand-space outline toward the lit (screen upper-left) side by `d` units
  const litShift = (uv: Pt[], d: number): Pt[] => uv.map(([u, v]) => { const q = H(u, v); return [q[0] - d * 0.7, q[1] - d * 0.7]; });

  // --- sleeve: forearm runs off the bottom of the frame
  const jacketShade = shade(look.jacket, 0.64);
  const jacketLight = shade(look.jacket, 1.22);
  poly(jacketShade, [[-8.2, -3.2], [8.6, -3.2], [11, -23], [-10.4, -23]]);
  poly(look.jacket, [[-7.2, -3.8], [7.4, -3.8], [9.6, -23], [-9.2, -23]]);
  // the sleeve's lit edge is on the screen-left side of either arm
  poly(jacketLight, mirror ? [[4.8, -3.8], [7.4, -3.8], [9.6, -23], [6.4, -23]] : [[-7.2, -3.8], [-4.6, -3.8], [-6, -23], [-9.2, -23]]);
  poly(jacketShade, [[-7.6, -4.6], [7.8, -4.6], [8.2, -7.6], [-8, -7.6]]);
  poly(look.accent, [[-7.6, -5.4], [7.8, -5.4], [8, -6.8], [-7.8, -6.8]]);
  pen.line([H(0.5, -8), H(1.6, -22)], look.seam, 1);

  // --- thumb: from the radial side of the wrist to the space bar
  const thumbTip: Pt = [THUMB_HOME[0] + pose.dx * 0.5, THUMB_HOME[1] + pose.dy * 0.6];
  drawFinger(pen, t, { knuckle: H(-8.6, 3.2), tip: flip(thumbTip), r0: 3, r1: 2.3, bend: mirror ? -0.9 : 0.9, dip: true });

  // --- back of the hand: knuckle arc, ulnar edge, wrist, thenar pad
  const back: Pt[] = [
    [-10.3, 12.4], [-5.2, 14.6], [0, 15], [5.2, 14.1], [9.6, 11.9],
    [10.4, 7], [8.4, 1.4], [7, -4], [-6.6, -4], [-8.8, 1.6], [-11.3, 6.4], [-11.1, 10],
  ];
  const grown = (uv: Pt[], g: number): Pt[] => uv.map(([u, v]): Pt => [u * (1 + g / 11), 5 + (v - 5) * (1 + g / 10)]);
  poly(t.deep, grown(back, 0.55));
  poly(t.shadow, back);
  pen.poly(t.warm, litShift(grown(back, -0.9), 0.5));
  pen.poly(t.base, litShift(grown(back, -1.9), 1.1));
  // tendons fan from the wrist to each knuckle
  for (const [ku, kv] of KNUCKLE) pen.line([H(ku * 0.86, kv - 2.6), H(ku * 0.28, 2.4)], t.warm, 0.6);
  // wrist bone on the little-finger side, and the lit web by the thumb
  const bone = H(6.2, -1);
  pen.ell(t.base, bone[0], bone[1], 1.5, 1.2);
  pen.ell(t.highlight, bone[0] - 0.4, bone[1] - 0.4, 0.8, 0.6);
  const web = H(-8.4, 7.2);
  pen.ell(t.highlight, web[0], web[1], 1.6, 2.2);

  // --- fingers, little finger first so the index sits on top toward the centre
  for (const i of [3, 2, 1, 0] as FingerId[]) {
    const lift = pose.lift[i];
    const k = H(KNUCKLE[i][0], KNUCKLE[i][1]);
    const home: Pt = i === 3 && pose.little ? pose.little : HOME[i];
    const rest = flip(home);
    // a raised finger foreshortens toward its knuckle and comes up off the key
    const tip: Pt = [rest[0] + (k[0] - rest[0]) * 0.26 * lift, rest[1] + (k[1] - rest[1]) * 0.26 * lift - 0.7 * lift];
    const r0 = GIRTH[i] * (1 + 0.06 * lift);
    drawFinger(pen, t, { knuckle: k, tip, r0, r1: r0 * 0.82, bend: (mirror ? -1 : 1) * (0.5 + 0.3 * lift), dip: true });
  }
}

/** Both hands for a keyboard frame. `fidget` lifts one resting finger (idle only). */
export function drawTypingHands(pen: HandPen, tones: SkinTones, look: SleeveLook, frame: KeyboardHandFrame, fidget: KeyboardFidget = ''): void {
  const withFidget = (pose: HandPose, finger: FingerId, on: boolean): HandPose =>
    on ? { ...pose, lift: pose.lift.map((v, i) => (i === finger ? 1 : v)) as HandPose['lift'] } : pose;
  drawHand(pen, tones, look, true, withFidget(LEFT[frame], 0, frame === 'rest' && fidget === 'L'));
  drawHand(pen, tones, look, false, withFidget(RIGHT[frame], 1, frame === 'rest' && fidget === 'R'));
}

/** Idle fidget schedule: a finger taps briefly twice in each 4.2 s loop. */
export function keyboardFidget(time: number): KeyboardFidget {
  const t = ((time % 4.2) + 4.2) % 4.2;
  if (t >= 1.1 && t < 1.26) return 'L';
  if (t >= 2.9 && t < 3.06) return 'R';
  return '';
}
