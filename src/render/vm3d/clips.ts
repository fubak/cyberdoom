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
  /** thumb wrap amount (1 = extended sideways, 0 = wrapped around a grip). */
  thumbOut?: number;
  /** cosmetic forearm direction in stage space (the arm exits toward a
   *  screen corner); unset = follow the wrist bone axis. */
  tail?: V3;
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
  thumbOut?: number;
  tailDir?: V3;
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
  const thumbOut =
    a?.thumbOut === undefined ? b?.thumbOut
      : b?.thumbOut === undefined ? a?.thumbOut
        : lerp(a.thumbOut, b.thumbOut, u);
  return {
    wrists,
    curls: lerpCurls(a?.curls, b?.curls, u),
    thumbOut,
    tailDir: lerp3(a?.tail, b?.tail, u),
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
// bat wrap: fingers drape over the board's back edge — the mcp dips the
// proximal past the edge, the pip runs the intermediate down the back
// face, and the coupled dip pulls the tip under the bottom. The thumb
// wraps across the top over the curled fingers (power grip, not a fist
// hovering beside the case). Used by BOTH hands for the swing's bat grip.
const WRAP_CURLS: Partial<Record<FingerName, Curl>> = {
  index: { mcp: 52, pip: 90, abd: -5 },
  middle: { mcp: 54, pip: 92, abd: 0 },
  ring: { mcp: 54, pip: 90, abd: 5 },
  // pinky is too short to fold under like the others — a deeper mcp dip
  // swings its tip below the case instead of resting inside the edge
  pinky: { mcp: 74, pip: 78, abd: 9 },
  thumb: { mcp: 44, pip: 52, abd: 88 },
};
// the left hand's permanent end-grip hold: same closed-grip geometry as the
// fist relaxed ~18% (support grip, thumb over the top edge)
const HOLD_L_CURLS: Partial<Record<FingerName, Curl>> = {
  index: { mcp: 58, pip: 93, abd: -4 },
  middle: { mcp: 60, pip: 95, abd: 0 },
  ring: { mcp: 60, pip: 93, abd: 5 },
  pinky: { mcp: 62, pip: 96, abd: 9 },
  thumb: { mcp: 37, pip: 46, abd: 84 },
};

const ikc = (finger: FingerName, socket: string, weight?: number): IkContact => ({ finger, socket, weight });
// grip poses roll the metacarpals toward -z, so the anatomical forearm
// direction is +z (toward the viewer) — tilted laterally so the tube
// exits the nearer screen edge instead of pointing at the camera
const TAIL_GRIP_L: V3 = [-0.15, -0.2, 0.93];
// support grip for idle/type — relaxed closed hand on the board's left end
const L_GRIP = { wristSocket: 'gripL.wrist', curls: HOLD_L_CURLS, thumbOut: 0.3, tail: TAIL_GRIP_L };
// bat grip: L keeps the same end-face hold all through the swing (nearer
// the end, never lets go) and R wraps the top face directly inboard of
// it, fists touching. L_BAT drops the idle clip's fixed tail direction —
// the wrist yaws too far for a fixed stage vector, so the forearm follows
// the wrist axis through the arc.
const L_BAT = { wristSocket: 'gripL.wrist', curls: HOLD_L_CURLS, thumbOut: 0.3 };
const R_GRIP = { wristSocket: 'batR.wrist', thumbOut: 0.25, curls: {
  ...WRAP_CURLS,
  thumb: { mcp: 44, pip: 52, abd: 135 },
} };
// home pose: palm down over the home row, all four fingertips resting on
// J K L ; (the board's home row ends at ENT), thumb near the space bar.
const R_REST = { wristSocket: 'hoverR.wrist', curls: HOVER_CURLS, thumbOut: 0.6, ik: [
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
const R_LIFT = { wristSocket: 'hoverR.wrist', curls: LIFT_CURLS, thumbOut: 0.6 };
// mid-air waypoint above the grip end: the hand arcs up over the board
// between the home-row hover and the bat grip instead of dragging its
// fingers through the case
const R_WAY = { wristSocket: 'wayR.wrist', thumbOut: 0.5, curls: {
  index: { mcp: 80, pip: 92, abd: -5 },
  middle: { mcp: 82, pip: 94, abd: 0 },
  ring: { mcp: 82, pip: 94, abd: 5 },
  pinky: { mcp: 80, pip: 90, abd: 9 },
  thumb: { mcp: 30, pip: 35 },
} };
// release waypoint: straight up off the wrap in the same orientation —
// the fingers uncurl as the hand rises instead of dragging the case
const R_WAY2 = { wristSocket: 'wayR2.wrist', thumbOut: 0.5, curls: {
  index: { mcp: 80, pip: 92, abd: -5 },
  middle: { mcp: 82, pip: 94, abd: 0 },
  ring: { mcp: 82, pip: 94, abd: 5 },
  pinky: { mcp: 80, pip: 90, abd: 9 },
  thumb: { mcp: 30, pip: 35 },
} };
// high hover above the home row: final approach of the regrip drops
// vertically onto the keys instead of swooping under the front lip
const R_WAY3 = { wristSocket: 'wayR3.wrist', thumbOut: 0.6, curls: {
  index: { mcp: 60, pip: 72, abd: -4 },
  middle: { mcp: 62, pip: 74, abd: 0 },
  ring: { mcp: 64, pip: 76, abd: 5 },
  pinky: { mcp: 62, pip: 74, abd: 9 },
  thumb: { mcp: 12, pip: 18 },
} };
// raised tuck still in the typing pose: the hand lifts and rolls before
// sweeping sideways, so no joint sweeps through the keywell
const R_LIFT3 = { wristSocket: 'liftR3.wrist', thumbOut: 0.35, curls: {
  index: { mcp: 56, pip: 66, abd: -4 },
  middle: { mcp: 58, pip: 68, abd: 0 },
  ring: { mcp: 60, pip: 70, abd: 5 },
  pinky: { mcp: 58, pip: 68, abd: 9 },
  thumb: { mcp: 12, pip: 18 },
} };
// landing waypoint: hover shape held 4 cm above the home row — the curl
// blend finishes here so the final drop is straight down onto the keys
const R_HIGH = { wristSocket: 'hoverH.wrist', thumbOut: 0.6, curls: {
  ...HOVER_CURLS,
  // a flatter thumb rests on the keycap instead of dipping inside the case
  thumb: { mcp: 5, pip: 10 },
} };
// swing's settled home pose: same hover shape WITHOUT the ik contacts —
// during the descent blend an ik weight would drag the thumb tip down
// through the deck before the wrist arrives
const R_HOME = { wristSocket: 'hoverR.wrist', thumbOut: 0.6, curls: {
  ...HOVER_CURLS,
  thumb: { mcp: 5, pip: 10 },
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
    // two-handed diagonal bat swing at the crosshair. Wind-up 0–0.10: both
    // fists lift to the lower-right, board tipped up-right behind them.
    // Strike 0.10–0.18: hands sweep right-to-left across the lower third;
    // at ~0.15 the free end reaches the crosshair, long axis into the
    // screen, keycaps camera-left. Follow-through to ~0.30 carries
    // lower-left. Recover to 0.60: R releases, arcs over the deck and
    // lands palm-down on the home row; L never lets go. The board only
    // crosses the VM_CLEAR band between 0.10 and 0.25.
    keys: [
      // trigger: R lifts off the home row and arcs over the deck onto the
      // bat grip while L re-wraps the end (L never leaves the board)
      { t: 0, root: { pos: HOME_POS, rot: HOME_ROT }, L: L_BAT, R: R_HOVER },
      { t: 0.008, root: { pos: [0.02, -0.146, -0.442], rot: [25, 5, -8] }, L: L_BAT, R: R_LIFT3 },
      { t: 0.016, root: { pos: [0.035, -0.142, -0.448], rot: [27, 6, -6] }, L: L_BAT, R: R_WAY },
      { t: 0.024, root: { pos: [0.06, -0.137, -0.455], rot: [30, 8, -3] }, L: L_BAT, R: R_WAY },
      { t: 0.036, root: { pos: [0.08, -0.131, -0.46], rot: [26, 10, 1] }, L: L_BAT, R: R_GRIP },
      // wind-up: fists carry the end down-right, board tips up-right
      { t: 0.06, root: { pos: [0.1300, -0.0944, -0.4662], rot: [24.1, 15.2, 7.9] }, L: L_BAT, R: R_GRIP },
      { t: 0.10, root: { pos: [0.2213, -0.1011, -0.4952], rot: [25.6, 25.7, 5.7] }, L: L_BAT, R: R_GRIP },
      // strike: hands whip right-to-left across the lower third
      { t: 0.115, root: { pos: [0.1051, -0.0795, -0.5280], rot: [26.9, 63.6, 5.9] }, L: L_BAT, R: R_GRIP },
      // impact: free end reaches the crosshair
      { t: 0.15, root: { pos: [-0.0309, -0.0642, -0.5151], rot: [29.4, 77.9, 40.4] }, L: L_BAT, R: R_GRIP },
      { t: 0.18, root: { pos: [-0.1369, -0.1005, -0.5337], rot: [30.9, 100.3, 36.8] }, L: L_BAT, R: R_GRIP },
      // follow-through: carries lower-left, tip back under the clear band
      { t: 0.24, root: { pos: [-0.1976, -0.1264, -0.5449], rot: [30.2, 115.6, 29.7] }, L: L_BAT, R: R_GRIP },
      { t: 0.30, root: { pos: [-0.1790, -0.1568, -0.5743], rot: [4.2, 116.5, 5.9] }, L: L_BAT, R: R_GRIP },
      // recover: R releases straight up off the wrap, arcs over the deck,
      // and drops palm-down onto the home row; L never lets go
      { t: 0.32, root: { pos: [-0.1174, -0.1473, -0.5824], rot: [-1.9, 101.4, -3.7] }, L: L_BAT, R: R_WAY2 },
      { t: 0.38, root: { pos: [0.0295, -0.1491, -0.5670], rot: [5.2, 66.4, -18.8] }, L: L_BAT, R: R_WAY3 },
      { t: 0.44, root: { pos: [-0.02, -0.152, -0.47], rot: [18, 25, -10] }, L: L_BAT, R: R_LIFT3 },
      { t: 0.48, root: { pos: [0.0, -0.150, -0.455], rot: [21, 12, -9] }, L: L_BAT, R: R_HIGH },
      { t: 0.54, root: { pos: [0.005, -0.148, -0.44], rot: [23, 7, -8] }, L: L_GRIP, R: R_HOME },
      { t: 0.6, root: { pos: HOME_POS, rot: HOME_ROT }, L: L_GRIP, R: R_HOME },
    ],
  },
};

export const KBD_ACTION_CLIP = { type: 'kbd.type', swing: 'kbd.swing' } as const;
export type KbdAction = keyof typeof KBD_ACTION_CLIP;
