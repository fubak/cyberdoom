import type { Curl, FingerName } from '../handrig';

/**
 * vm3d clips: each tool action is a keyframe list over seconds. A keyframe may
 * move the tool root (board-local → rig-root space), a hand's wrist (free vm
 * point or a named tool socket the wrist rides), finger curls and fingertip
 * IK contacts (finger → socket). The resolver blends neighbouring keys with
 * cubic ease; contacts blend by the declaring key's weight.
 */

export type V3 = [number, number, number];

const D2R = Math.PI / 180;
type Q = [number, number, number, number]; // x y z w
function eulerToQuat(e: V3): Q {
  const [x, y, z] = e;
  // ZXY order: q = qz * qx * qy  (applied y first, then x, then z)
  const qx: Q = [Math.sin(x * D2R / 2), 0, 0, Math.cos(x * D2R / 2)];
  const qy: Q = [0, Math.sin(y * D2R / 2), 0, Math.cos(y * D2R / 2)];
  const qz: Q = [0, 0, Math.sin(z * D2R / 2), Math.cos(z * D2R / 2)];
  return mulQ(mulQ(qz, qx), qy);
}

function mulQ(a: Q, b: Q): Q {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quatToEuler([x, y, z, w]: Q): V3 {
  // inverse of eulerToQuat for ZXY order, via the rotation-matrix elements
  const m12 = 2 * (x * y - z * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m31 = 2 * (x * z - y * w);
  const m32 = 2 * (x * w + y * z);
  const m33 = 1 - 2 * (x * x + y * y);
  const xA = Math.asin(Math.max(-1, Math.min(1, m32)));
  const yA = Math.atan2(-m31, m33);
  const zA = Math.atan2(-m12, m22);
  return [xA / D2R, yA / D2R, zA / D2R];
}

function axisAngleQ(axis: V3, deg: number): Q {
  const h = deg * D2R / 2;
  const sn = Math.sin(h);
  return [axis[0] * sn, axis[1] * sn, axis[2] * sn, Math.cos(h)];
}

// shortest-arc slerp between two ZXY euler rotations: euler lerp spikes the
// angular speed near +-180 wraps, quat slerp rotates along one smooth arc
function slerpEuler(a: V3 | undefined, b: V3 | undefined, u: number): V3 | undefined {
  if (!a) return b;
  if (!b) return a;
  const qa = eulerToQuat(a);
  let qb = eulerToQuat(b);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (dot < 0) { qb = [-qb[0], -qb[1], -qb[2], -qb[3]]; dot = -dot; }
  let s0 = 1 - u;
  let s1 = u;
  if (dot < 0.9995) {
    const th = Math.acos(Math.min(1, dot));
    const s = Math.sin(th);
    s0 = Math.sin(s0 * th) / s;
    s1 = Math.sin(u * th) / s;
  }
  return quatToEuler([
    s0 * qa[0] + s1 * qb[0],
    s0 * qa[1] + s1 * qb[1],
    s0 * qa[2] + s1 * qb[2],
    s0 * qa[3] + s1 * qb[3],
  ]);
}

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

export interface SwingSpec {
  /** seconds the parametric arc owns; keys outside blend to its ends. */
  tRange: [number, number];
  /** one fixed unit axis; R(u) = base * axisAngle(axis, theta) * roll. */
  axis: V3;
  /** board attitude (euler deg ZXY) at u = 0. */
  baseRot: V3;
  /** swing angle range in deg, swept along `axis` as u goes 0..1. */
  theta: [number, number];
  /** small roll that keeps the keycap face camera-ish through impact. */
  rollAxis: V3;
  rollDeg: [number, number];
  /** <=5 root-position control points on the warped parameter u. */
  gCtrl: { u: number; pos: V3 }[];
}

export interface VmClip {
  name: string;
  duration: number;
  loop?: boolean;
  kind?: 'swing';
  swing?: SwingSpec;
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

/** Centripetal Catmull-Rom through the control points, evaluated at the
 *  warped parameter u (control u values are the knot positions). */
function catmullRom(ctrl: { u: number; pos: V3 }[], u: number): V3 {
  if (u <= ctrl[0].u) return ctrl[0].pos;
  if (u >= ctrl[ctrl.length - 1].u) return ctrl[ctrl.length - 1].pos;
  let i = 0;
  while (i < ctrl.length - 2 && ctrl[i + 1].u <= u) i++;
  const pc = (j: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, j))].pos;
  const P0 = pc(i - 1), P1 = pc(i), P2 = pc(i + 1), P3 = pc(i + 2);
  const t0 = ctrl[i - 1]?.u ?? ctrl[i].u - 0.25;
  const t1 = ctrl[i].u;
  const t2 = ctrl[i + 1].u;
  const t3 = ctrl[i + 2]?.u ?? ctrl[i + 1].u + 0.25;
  const x = u;
  const A1 = P1.map((_, c) => ((t1 - x) / (t1 - t0)) * P0[c] + ((x - t0) / (t1 - t0)) * P1[c]);
  const A2 = P1.map((_, c) => ((t2 - x) / (t2 - t1)) * P1[c] + ((x - t1) / (t2 - t1)) * P2[c]);
  const A3 = P1.map((_, c) => ((t3 - x) / (t3 - t2)) * P2[c] + ((x - t2) / (t3 - t2)) * P3[c]);
  const B1 = P1.map((_, c) => ((t2 - x) / (t2 - t0)) * A1[c] + ((x - t0) / (t2 - t0)) * A2[c]);
  const B2 = P1.map((_, c) => ((t3 - x) / (t3 - t1)) * A2[c] + ((x - t1) / (t3 - t1)) * A3[c]);
  return P1.map((_, c) => ((t2 - x) / (t2 - t1)) * B1[c] + ((x - t1) / (t2 - t1)) * B2[c]) as V3;
}

/** Parametric board pose for a 'swing' clip at warped parameter u in 0..1. */
export function swingPose(spec: SwingSpec, u: number): { pos: V3; rot: V3 } {
  const th = lerp(spec.theta[0], spec.theta[1], u);
  const roll = lerp(spec.rollDeg[0], spec.rollDeg[1], u);
  const q = mulQ(mulQ(eulerToQuat(spec.baseRot), axisAngleQ(spec.axis, th)), axisAngleQ(spec.rollAxis, roll));
  return { pos: catmullRom(spec.gCtrl, u), rot: quatToEuler(q) };
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
  const hands = { L: resolveHand(k0.L, k1.L, u), R: resolveHand(k0.R, k1.R, u) };
  if (clip.swing && tt >= clip.swing.tRange[0] && tt <= clip.swing.tRange[1]) {
    const [a, b] = clip.swing.tRange;
    const uu = ease(Math.max(0, Math.min(1, (tt - a) / (b - a))));
    const pose = swingPose(clip.swing, uu);
    return { rootPos: pose.pos, rootRot: pose.rot, hands, keys };
  }
  return {
    rootPos: lerp3(k0.root?.pos, k1.root?.pos, u) ?? [0, 0, 0],
    rootRot: slerpEuler(k0.root?.rot, k1.root?.rot, u) ?? [0, 0, 0],
    hands,
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
// swing arm tails (stage space): each sleeve exits through its own side
// of the frame — L forearm runs down-left toward the camera and out the
// left/bottom-left, R down-right and out the right/bottom-right. Never
// horizontal, never crossing.
// bat grip: L keeps the same end-face hold all through the swing (nearer
// the end, never lets go) and R wraps the top face directly inboard of
// it, fists touching.
// swing L: same end-face pinch as idle (approved grip), but the tail is
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
    kind: 'swing',
    swing: {
      tRange: [0.03, 0.3],
      axis: [0.153, 0.755, 0.637],
      baseRot: [20, 60, -14],
      theta: [0, 105],
      rollAxis: [1, 0, 0],
      rollDeg: [0, -30],
      gCtrl: [
        { u: 0, pos: [0.17, -0.005, -0.52] },
        { u: 0.22, pos: [0.19, -0.07, -0.51] },
        { u: 0.44, pos: [-0.02, -0.04, -0.4] },
        { u: 0.78, pos: [-0.2, -0.12, -0.36] },
        { u: 1, pos: [-0.2, -0.14, -0.39] },
      ],
    },
    // two-handed diagonal bat swing at the crosshair. 0.03-0.30 is a
    // parametric arc (one fixed swing axis + Catmull-Rom root path); the
    // keys in that window only steer hand poses/tails — the .03/.30 roots
    // hold the parametric end poses so the blends join C0.
    keys: [
      // trigger: R lifts off the home row and arcs onto the bat grip while
      // L keeps the end-face hold (L never leaves the board)
      { t: 0.0, root: { pos: HOME_POS, rot: HOME_ROT }, L: { ...L_GRIP, tail: [0.23, 0, 0.97] }, R: { ...R_HOVER, tail: [0.43, -0.46, 0.78] } },
      { t: 0.008, root: { pos: [0.044, -0.115, -0.46], rot: [24, 22, -9.5] }, L: { ...L_GRIP, tail: [0.26, -0.3, 0.9] }, R: { ...R_LIFT3, tail: [0.41, -0.62, 0.67] } },
      { t: 0.02, root: { pos: [0.07, -0.09, -0.47], rot: [22, 40, -12] }, L: { ...L_GRIP, tail: [0.3, -0.35, 0.88] }, R: { ...R_WAY, tail: [0.41, -0.72, 0.56] } },
      { t: 0.03, root: { pos: [0.17, -0.005, -0.52], rot: [20, 60, -14] }, L: { ...L_GRIP, tail: [0.3, -0.3, 0.9] }, R: { ...R_GRIP, tail: [0.5, -0.75, 0.4] } },
      { t: 0.1, root: { pos: [0.12, -0.1, -0.48], rot: [35, 86, -14] }, L: { ...L_GRIP, tail: [0.4, -0.4, 0.82] }, R: { ...R_GRIP, tail: [0.6, -0.7, 0.35] } },
      { t: 0.15, root: { pos: [-0.02, -0.04, -0.4], rot: [51, 112, -23] }, L: { ...L_GRIP, tail: [0.5, -0.35, 0.79] }, R: { ...R_GRIP, tail: [0.6, -0.75, 0.2] } },
      { t: 0.19, root: { pos: [-0.1, -0.08, -0.38], rot: [58, 140, -40] }, L: { ...L_GRIP, tail: [0.4, -0.6, 0.65] }, R: { ...R_GRIP, tail: [0.55, -0.8, 0.1] } },
      { t: 0.24, root: { pos: [-0.2, -0.12, -0.36], rot: [61, 153, -48] }, L: { ...L_GRIP, tail: [0.2, -0.9, 0.3] }, R: { ...R_GRIP, tail: [0.5, -0.85, 0] } },
      { t: 0.3, root: { pos: [-0.2, -0.14, -0.39], rot: [79.3, -62.2, 178.4] }, L: { ...L_GRIP, tail: [-0.4, -0.85, 0.3] }, R: { ...R_GRIP, tail: [0.45, -0.87, -0.1] } },
      // recover: R lifts off along the board normal, then arcs to home row
      { t: 0.36, root: { pos: [-0.13, -0.1, -0.42], rot: [50, -140, -70] }, L: { ...L_GRIP, tail: [-0.41, -0.86, 0.3] }, R: { ...R_WAY2, tail: [0.3, -0.9, 0.1] } },
      { t: 0.44, root: { pos: [-0.01, -0.13, -0.5], rot: [30, -100, -50] }, L: { ...L_GRIP, tail: [-0.1, -0.91, 0.4] }, R: { ...R_WAY2, tail: [0, -0.97, 0.24] } },
      { t: 0.52, root: { pos: [0.018, -0.15, -0.49], rot: [35, 10, -30] }, L: { ...L_GRIP, tail: [0.19, -0.86, 0.48] }, R: { ...R_WAY3, tail: [-0.11, -0.94, 0.33] } },
      { t: 0.6, root: { pos: HOME_POS, rot: HOME_ROT }, L: { ...L_GRIP, tail: [0.03, 0.04, 1] }, R: { ...R_HOME, tail: [0.08, -0.64, 0.76] } },
    ],
  },
};

export const KBD_ACTION_CLIP = { type: 'kbd.type', swing: 'kbd.swing' } as const;
export type KbdAction = keyof typeof KBD_ACTION_CLIP;
