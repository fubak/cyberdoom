import type { Curl, FingerName } from '../handrig';

/**
 * vm3d clips: each tool action is a keyframe list over seconds. A keyframe may
 * move the tool root (board-local → rig-root space), a hand's wrist (free vm
 * point or a named tool socket the wrist rides), finger curls and fingertip
 * IK contacts (finger → socket). The resolver blends neighbouring keys with
 * cubic ease; contacts blend by the declaring key's weight.
 */

export type V3 = [number, number, number];
export type HandSide = 'L' | 'R';

export interface IkContact { finger: FingerName; socket: string; weight?: number }

export interface HandKey {
  /** free wrist target in vm space (metres). */
  wrist?: V3;
  /** board socket whose world transform the wrist rides (pos + orientation). */
  wristSocket?: string;
  /** palm orientation (euler deg, ZXY) used with a free `wrist`. */
  wristRot?: V3;
  curls?: Partial<Record<FingerName, Curl>>;
  /** fingertip → socket contacts active at this key. */
  ik?: IkContact[];
}

export interface VmKey {
  t: number;
  /** tool root in rig-root space: position metres + euler deg (ZXY). */
  root?: { pos?: V3; rot?: V3 };
  L?: HandKey;
  R?: HandKey;
  /** per-key press amounts (0..1) keyed by socket name after 'key.'. */
  keys?: Record<string, number>;
}

export interface VmClip {
  name: string;
  duration: number;
  loop?: boolean;
  keys: VmKey[];
}

export interface ResolvedContact extends IkContact { weight: number }

export interface WristTarget {
  /** board socket whose world transform the wrist copies. */
  socket?: string;
  /** free vm-space wrist point (metres) + palm euler deg (ZXY). */
  pos?: V3;
  rot?: V3;
  weight: number;
}

export interface ResolvedHand {
  wrists: WristTarget[];
  curls: Partial<Record<FingerName, Curl>>;
  contacts: ResolvedContact[];
}

export interface Resolved {
  rootPos: V3;
  rootRot: V3;
  hands: Record<HandSide, ResolvedHand>;
  keys: Record<string, number>;
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerp3 = (a: V3 | undefined, b: V3 | undefined, u: number): V3 | undefined =>
  a && b ? [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)] : b ?? a;

const CURL_KEYS: (keyof Curl)[] = ['mcp', 'pip', 'dip', 'abd'];
const FINGERS: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];

function lerpCurls(
  a: Partial<Record<FingerName, Curl>> | undefined,
  b: Partial<Record<FingerName, Curl>> | undefined,
  u: number,
): Partial<Record<FingerName, Curl>> {
  const out: Partial<Record<FingerName, Curl>> = {};
  for (const f of FINGERS) {
    const ca = a?.[f];
    const cb = b?.[f];
    if (!ca && !cb) continue;
    if (!ca) { out[f] = { ...cb! }; continue; }
    if (!cb) { out[f] = { ...ca }; continue; }
    const c: Curl = {
      mcp: lerp(ca.mcp ?? cb.mcp ?? 0, cb.mcp ?? ca.mcp ?? 0, u),
      pip: lerp(ca.pip ?? cb.pip ?? 0, cb.pip ?? ca.pip ?? 0, u),
    };
    for (const k of CURL_KEYS) {
      if (k !== 'mcp' && k !== 'pip' && (ca[k] !== undefined || cb[k] !== undefined)) {
        c[k] = lerp(ca[k] ?? cb[k] ?? 0, cb[k] ?? ca[k] ?? 0, u);
      }
    }
    out[f] = c;
  }
  return out;
}

function resolveHand(a: HandKey | undefined, b: HandKey | undefined, u: number): ResolvedHand {
  const contacts = new Map<string, ResolvedContact>();
  for (const c of a?.ik ?? []) contacts.set(c.finger, { ...c, weight: (1 - u) * (c.weight ?? 1) });
  for (const c of b?.ik ?? []) {
    const ex = contacts.get(c.finger);
    if (ex && ex.socket === c.socket) ex.weight = Math.min(1, ex.weight + u * (c.weight ?? 1));
    else contacts.set(c.finger + ':' + c.socket, { ...c, weight: u * (c.weight ?? 1) });
  }
  const wrists: WristTarget[] = [];
  if (a && (a.wristSocket || a.wrist)) {
    wrists.push({ socket: a.wristSocket, pos: a.wrist, rot: a.wristRot, weight: 1 - u });
  }
  if (b && (b.wristSocket || b.wrist)) {
    wrists.push({ socket: b.wristSocket, pos: b.wrist, rot: b.wristRot, weight: u });
  }
  return {
    wrists,
    curls: lerpCurls(a?.curls, b?.curls, u),
    contacts: [...contacts.values()].filter((c) => c.weight > 0.2),
  };
}

/** Sample a clip at time t (seconds) into a pose the rig solver consumes. */
export function resolveClip(clip: VmClip, t: number): Resolved {
  const tt = clip.loop ? ((t % clip.duration) + clip.duration) % clip.duration : Math.min(t, clip.duration);
  let i = 0;
  while (i < clip.keys.length - 1 && clip.keys[i + 1].t <= tt) i++;
  const k0 = clip.keys[i];
  const k1 = clip.keys[Math.min(i + 1, clip.keys.length - 1)];
  const span = Math.max(1e-4, k1.t - k0.t);
  const u = ease(Math.max(0, Math.min(1, (tt - k0.t) / span)));
  const keys: Record<string, number> = {};
  for (const n of new Set([...Object.keys(k0.keys ?? {}), ...Object.keys(k1.keys ?? {})])) {
    keys[n] = lerp(k0.keys?.[n] ?? 0, k1.keys?.[n] ?? 0, u);
  }
  return {
    rootPos: lerp3(k0.root?.pos, k1.root?.pos, u) ?? [0, 0, 0],
    rootRot: lerp3(k0.root?.rot, k1.root?.rot, u) ?? [0, 0, 0],
    hands: { L: resolveHand(k0.L, k1.L, u), R: resolveHand(k0.R, k1.R, u) },
    keys,
  };
}

/* ------------------------------------------------------------------ */
/* Keyboard clips. Timings are gameplay-bound: SWING wind-up must peak   */
/* at the 60 ms windup (damage event), impact lands 60–110 ms, and the  */
/* whole move is home by the 600 ms cooldown.                          */
/* ------------------------------------------------------------------ */

// relaxed typing curl for the hovering right hand
const HOVER_CURLS: Partial<Record<FingerName, Curl>> = {
  index: { mcp: 55, pip: 70, abd: -6 },
  middle: { mcp: 60, pip: 75, abd: 0 },
  ring: { mcp: 62, pip: 78, abd: 6 },
  pinky: { mcp: 55, pip: 70, abd: 10 },
  thumb: { mcp: 12, pip: 18 },
};
// the left hand's permanent end-grip curl; IK puts the tips on the board
const GRIP_L_CURLS: Partial<Record<FingerName, Curl>> = {
  index: { mcp: 70, pip: 80, abd: -4 },
  middle: { mcp: 74, pip: 84, abd: 0 },
  ring: { mcp: 78, pip: 88, abd: 4 },
  pinky: { mcp: 70, pip: 80, abd: 8 },
  thumb: { mcp: 16, pip: 22 },
};
const GRIP_R_CURLS: Partial<Record<FingerName, Curl>> = {
  index: { mcp: 72, pip: 82, abd: -5 },
  middle: { mcp: 76, pip: 86, abd: 0 },
  ring: { mcp: 80, pip: 90, abd: 5 },
  pinky: { mcp: 74, pip: 82, abd: 9 },
  thumb: { mcp: 18, pip: 26 },
};

const ikc = (finger: FingerName, socket: string, weight?: number): IkContact => ({ finger, socket, weight });
const L_GRIP = { wristSocket: 'gripL.wrist', curls: GRIP_L_CURLS, ik: [
  // the thumb wraps the end face: soft contact (the 2-dof thumb reaches
  // within ~1 cm of the face — enough to read as a wrap without strain)
  ikc('thumb', 'gripL.tip.thumb', 0.6),
  ikc('index', 'gripL.tip.index'),
  ikc('middle', 'gripL.tip.middle'),
  ikc('ring', 'gripL.tip.ring'),
  ikc('pinky', 'gripL.tip.pinky'),
] };
const R_GRIP = { wristSocket: 'gripR.wrist', curls: GRIP_R_CURLS, ik: [
  ikc('thumb', 'gripR.tip.thumb', 0.5),
  ikc('index', 'gripR.tip.index'),
  ikc('middle', 'gripR.tip.middle'),
  ikc('ring', 'gripR.tip.ring'),
  ikc('pinky', 'gripR.tip.pinky'),
] };
// home pose: palm down over the home row, all four fingertips resting on
// J K L ; (the board's home row ends at ENT), thumb near the space bar.
const R_REST = { wristSocket: 'hoverR.wrist', curls: HOVER_CURLS, ik: [
  ikc('index', 'key.j'),
  ikc('middle', 'key.k'),
  ikc('ring', 'key.l'),
  ikc('pinky', 'key.enter'),
  ikc('thumb', 'key.space', 0.5),
] };
const R_HOVER = R_REST;
// fingers lift nearly straight while the wrist slides between keystrokes
const LIFT_CURLS: Partial<Record<FingerName, Curl>> = {
  index: { mcp: 28, pip: 32, abd: -4 },
  middle: { mcp: 24, pip: 28, abd: 0 },
  ring: { mcp: 26, pip: 30, abd: 5 },
  pinky: { mcp: 30, pip: 34, abd: 10 },
  thumb: { mcp: 5, pip: 10 },
};
const R_LIFT = { wristSocket: 'hoverR.wrist', curls: LIFT_CURLS };
// mid-air waypoint above the grip end: the hand arcs up over the board
// between the home-row hover and the bat grip instead of dragging its
// fingers through the case
const R_WAY = { wristSocket: 'wayR.wrist', curls: {
  index: { mcp: 68, pip: 80, abd: -4 },
  middle: { mcp: 72, pip: 84, abd: 0 },
  ring: { mcp: 74, pip: 86, abd: 5 },
  pinky: { mcp: 70, pip: 82, abd: 9 },
  thumb: { mcp: 20, pip: 26 },
} };
// low pull-back beside the end face: fingers stay curled while the hand
// slides left, keeping the tips outside the case until they're clear
const R_WAY2 = { wristSocket: 'wayR2.wrist', curls: {
  index: { mcp: 55, pip: 65, abd: -5 },
  middle: { mcp: 60, pip: 70, abd: 0 },
  ring: { mcp: 64, pip: 74, abd: 5 },
  pinky: { mcp: 58, pip: 68, abd: 9 },
  thumb: { mcp: 16, pip: 24 },
} };
// high hover above the home row: final approach of the regrip drops
// vertically onto the keys instead of swooping under the front lip
const R_WAY3 = { wristSocket: 'wayR3.wrist', curls: {
  index: { mcp: 60, pip: 72, abd: -4 },
  middle: { mcp: 62, pip: 74, abd: 0 },
  ring: { mcp: 64, pip: 76, abd: 5 },
  pinky: { mcp: 62, pip: 74, abd: 9 },
  thumb: { mcp: 12, pip: 18 },
} };
// raised tuck still in the typing pose: the hand lifts and rolls before
// sweeping sideways, so no joint sweeps through the keywell
const R_LIFT3 = { wristSocket: 'liftR3.wrist', curls: {
  index: { mcp: 56, pip: 66, abd: -4 },
  middle: { mcp: 58, pip: 68, abd: 0 },
  ring: { mcp: 60, pip: 70, abd: 5 },
  pinky: { mcp: 58, pip: 68, abd: 9 },
  thumb: { mcp: 16, pip: 22 },
} };
// during a strike the other fingers stay lifted clear of the deck
const PRESS_CURLS: Partial<Record<FingerName, Curl>> = { ...LIFT_CURLS };

// home pose: board low-centre, tilted toward the camera, right end low
const HOME_POS: V3 = [0.012, -0.148, -0.44];
const HOME_ROT: V3 = [24, 5, -9];

/** TYPE keyframe helper: home pose unless overridden. */
const tKey = (k: VmKey): VmKey => ({
  L: L_GRIP,
  R: R_HOVER,
  root: { pos: HOME_POS, rot: HOME_ROT },
  ...k,
});

export const CLIPS: Record<string, VmClip> = {
  'kbd.idle': {
    name: 'kbd.idle',
    duration: 3.2,
    loop: true,
    keys: [
      { t: 0, root: { pos: HOME_POS, rot: HOME_ROT }, L: L_GRIP, R: R_HOVER },
      {
        t: 1.6,
        root: { pos: [0.014, -0.1465, -0.44], rot: [24.6, 5.3, -9.3] },
        L: L_GRIP, R: R_HOVER,
      },
      { t: 3.2, root: { pos: HOME_POS, rot: HOME_ROT }, L: L_GRIP, R: R_HOVER },
    ],
  },

  'kbd.type': {
    name: 'kbd.type',
    duration: 0.62,
    // every key defaults to the home pose; fields below override per key
    keys: [
      tKey({ t: 0 }),
      // J (index) down
      tKey({
        t: 0.06,
        R: { wristSocket: 'pressR.wrist', curls: { ...PRESS_CURLS, index: { mcp: 36, pip: 42 } }, ik: [ikc('index', 'key.j')] },
        keys: { j: 1 },
      }),
      tKey({ t: 0.11, R: R_LIFT, keys: { j: 0.15 } }),
      // K (middle) down
      tKey({
        t: 0.17,
        R: { wristSocket: 'pressR.wristM', curls: { ...PRESS_CURLS, middle: { mcp: 38, pip: 44 } }, ik: [ikc('middle', 'key.k')] },
        keys: { k: 1 },
      }),
      tKey({ t: 0.22, R: R_LIFT, keys: { k: 0.1 } }),
      // L (ring) down
      tKey({
        t: 0.30,
        R: { wristSocket: 'pressR.wristR', curls: { ...PRESS_CURLS, ring: { mcp: 40, pip: 46 } }, ik: [ikc('ring', 'key.l')] },
        keys: { l: 1 },
      }),
      tKey({ t: 0.35, R: R_LIFT, keys: { l: 0.1 } }),
      // pinky stretches to Enter
      tKey({
        t: 0.46,
        R: { wristSocket: 'pressR.wristP', curls: { ...PRESS_CURLS, pinky: { mcp: 42, pip: 48 } }, ik: [ikc('pinky', 'key.enter')] },
        keys: { enter: 1 },
      }),
      tKey({ t: 0.52, R: R_LIFT, keys: { enter: 0.15 } }),
      // settle home
      tKey({ t: 0.62 }),
    ],
  },

  'kbd.swing': {
    name: 'kbd.swing',
    duration: 0.6,
    keys: [
      // trigger: right hand drops onto the grip, board starts up-right
      { t: 0, root: { pos: HOME_POS, rot: HOME_ROT }, L: L_GRIP, R: R_HOVER },
      { t: 0.008, root: { pos: [0.022, -0.144, -0.439], rot: [25, 2, -11] }, L: L_GRIP, R: R_LIFT3 },
      { t: 0.016, root: { pos: [0.03, -0.140, -0.437], rot: [25, -1, -14] }, L: L_GRIP, R: R_WAY },
      { t: 0.024, root: { pos: [0.042, -0.137, -0.436], rot: [26, -4, -16] }, L: L_GRIP, R: R_WAY2 },
      { t: 0.03, root: { pos: [0.05, -0.135, -0.435], rot: [26, -6, -18] }, L: L_GRIP, R: R_GRIP },
      // wind-up peak at the 60 ms windup: held end high right, rolled back
      { t: 0.06, root: { pos: [0.17, -0.08, -0.40], rot: [34, -28, -46] }, L: L_GRIP, R: R_GRIP },
      // impact: board whips across to the lower left, tipped toward camera
      { t: 0.105, root: { pos: [-0.21, -0.05, -0.38], rot: [8, 42, 22] }, L: L_GRIP, R: R_GRIP },
      // follow-through: carried to the far left edge
      { t: 0.17, root: { pos: [-0.25, -0.10, -0.43], rot: [4, 48, 12] }, L: L_GRIP, R: R_GRIP },
      // recover and regrip
      { t: 0.30, root: { pos: [-0.06, -0.14, -0.44], rot: [18, 16, -2] }, L: L_GRIP, R: R_GRIP },
      { t: 0.335, root: { pos: [-0.034, -0.141, -0.431], rot: [21, 13, -3] }, L: L_GRIP, R: R_WAY2 },
      { t: 0.36, root: { pos: [-0.025, -0.143, -0.432], rot: [21, 12, -4] }, L: L_GRIP, R: R_WAY },
      { t: 0.40, root: { pos: [-0.012, -0.145, -0.436], rot: [22, 10, -6] }, L: L_GRIP, R: R_WAY3 },
      { t: 0.435, root: { pos: [0.002, -0.146, -0.438], rot: [23, 8, -7] }, L: L_GRIP, R: R_LIFT3 },
      { t: 0.45, root: { pos: [0.005, -0.147, -0.44], rot: [23, 7, -7] }, L: L_GRIP, R: R_HOVER },
      { t: 0.6, root: { pos: HOME_POS, rot: HOME_ROT }, L: L_GRIP, R: R_HOVER },
    ],
  },
};

export const KBD_ACTION_CLIP = { type: 'kbd.type', swing: 'kbd.swing' } as const;
export type KbdAction = keyof typeof KBD_ACTION_CLIP;
