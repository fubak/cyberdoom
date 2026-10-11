import type { Curl, HandDelta, RigFrame } from './handrig';
import { CYCLE_MS, type CycleMs } from './vmotion';

/**
 * Authored rig poses per tool — art-director spec §2 joint tables.
 * Finger rows are abd / mcp / pip / dip (deg). Thumb rows are
 * cmcAbd / cmcFlex / mcp / ip. Wrists are spec camera-space pitch/yaw/roll
 * mapped into the rig frame (see `wrist()`).
 *
 * Sizes: `size` = middle-finger length M in base units. Spec hand length
 * L (wrist→middle tip, 1× px) → size = L / (1 + palmL) / RES ≈ L / 8.2 for
 * the male hand; females are rescaled to the same L by the rig.
 * Anchors are the wrist-crease centre as % of the 320×168 viewmodel frame;
 * `at` in TOOL_HANDS is derived so the bake-canvas wrist lands there.
 */

const F = (abd: number, mcp: number, pip: number, dip: number): Curl => ({ abd, mcp, pip, dip });
const TH = (cmcAbd: number, cmcFlex: number, mcp: number, ip: number): Curl => ({ abd: cmcAbd, cmcFlex, mcp, pip: ip });

/**
 * Spec wrist (pitch + = extension, yaw + = fingers swing screen-right,
 * roll + = supination) → rig {pitch, yaw, roll}. In the rig, palm-down
 * viewed from behind-above ≈ pitch −55; spec roll −90 (full pronation,
 * palm flat down) ≈ rig roll 0 for the right hand — so roll maps to
 * −(specRoll + 90) for the right hand and its mirror for the left.
 */

const mk = (fingers: Record<string, Curl>) => fingers;

// ---- curl tables: main's grip values (review: baseline = main poses) ------
const MOUSE = {
  index: F(8, 40, 30, 18), middle: F(-2, 46, 36, 22), ring: F(-10, 62, 58, 26),
  pinky: F(-16, 68, 64, 30), thumb: TH(4, 4, 38, 44),
};
const TYPEH = {
  index: F(6, 38, 52, 34), middle: F(0, 42, 56, 37), ring: F(-6, 46, 60, 40),
  pinky: F(-12, 52, 64, 42), thumb: TH(25, 10, 60, 55),
};
const USBP = {
  index: F(4, 80, 85, 56), middle: F(0, 70, 84, 55), ring: F(-8, 82, 98, 64),
  pinky: F(-14, 88, 100, 66), thumb: TH(30, 12, 44, 42),
};
const BADGE = {
  index: F(4, 77, 82, 54), middle: F(0, 70, 84, 55), ring: F(-8, 82, 98, 64),
  pinky: F(-14, 88, 100, 66), thumb: TH(30, 12, 41, 40),
};
const MFAP = {
  index: F(6, 82, 93, 62), middle: F(0, 87, 97, 64), ring: F(-6, 90, 98, 65),
  pinky: F(-12, 90, 100, 66), thumb: TH(30, 12, 24, 32),
};
const PATCH = {
  index: F(6, 78, 84, 56), middle: F(0, 70, 84, 55), ring: F(-6, 82, 98, 64),
  pinky: F(-12, 88, 100, 66), thumb: TH(20, 10, 42, 41),
};
const TAPH = {
  index: F(8, 62, 70, 46), middle: F(0, 66, 74, 49), ring: F(-8, 70, 78, 52),
  pinky: F(-14, 76, 82, 54), thumb: TH(25, 10, 26, 30),
};

const S1 = 23.2; // L = 190 at 1×  (190 / 8.2)
const S2 = 18.3; // L = 150 two-hand (150 / 8.2)

export const POSES: Record<string, RigFrame> = {
  // — KEYBOARD: two hands palm-down on the home row (main pose, canvas x1.22) —
  'kbd.rest': {
    w: 117, h: 63, persp: 460,
    hands: [
      { mirror: true, wrist: [37, 12, 7], pitch: -58, yaw: -14, roll: 10, size: S2, fingers: mk({ ...TYPEH }), arm: [5, -32, -19] },
      { mirror: false, wrist: [80, 12, 7], pitch: -58, yaw: 14, roll: -10, size: S2, fingers: mk({ ...TYPEH }), arm: [112, -32, -19] },
    ],
  },

  // — MOUSE: right-hand palm grip (main pose, canvas x1.45) ——————————————————
  'mouse.rest': {
    w: 93, h: 81, persp: 420,
    hands: [{ wrist: [49.5, 20, 15], pitch: -62, yaw: 18, roll: -6, size: S1, fingers: mk({ ...MOUSE }), arm: [81, -35, -26] }],
  },

  // — USB stick: pinch grip, connector up ————————————————————————————————————
  'usb.rest': {
    w: 81, h: 70, persp: 430,
    hands: [{ wrist: [41, 12, 6], pitch: -18, yaw: 34, roll: -6, size: S1, fingers: mk({ ...USBP }), arm: [64, -38, -23] }],
  },

  // — BADGE: card pinched thumb + index side —————————————————————————————————
  'badge.rest': {
    w: 70, h: 64, persp: 430,
    hands: [{ wrist: [35, 6, 3], pitch: -14, yaw: 40, roll: -4, size: S1, fingers: mk({ ...BADGE }), arm: [15, -41, -20] }],
  },

  // — MFA token: relaxed fist, thumb over the button —————————————————————————
  'mfa.rest': {
    w: 64, h: 64, persp: 420,
    hands: [{ wrist: [32, 9, 3], pitch: -8, yaw: 26, roll: -4, size: S1, fingers: mk({ ...MFAP }), arm: [49, -38, -23] }],
  },

  // — PATCH disk: pinch on the edge ——————————————————————————————————————————
  'patch.rest': {
    w: 64, h: 64, persp: 420,
    hands: [{ wrist: [32, 6, 0], pitch: -4, yaw: 30, roll: -2, size: S1, fingers: mk({ ...PATCH }), arm: [49, -38, -23] }],
  },

  // — TAP: two hands squeeze the clip housing ————————————————————————————————
  'tap.rest': {
    w: 102, h: 49, persp: 440,
    hands: [
      { mirror: true, wrist: [12, 7, 5], pitch: -58, yaw: -52, roll: 10, size: S2, fingers: mk({ ...TAPH }), arm: [0, -29, -17] },
      { mirror: false, wrist: [90, 7, 5], pitch: -58, yaw: 52, roll: -10, size: S2, fingers: mk({ ...TAPH }), arm: [102, -29, -17] },
    ],
  },

  // — EDR tablet: two hands on the bezel, right thumb taps on use ————————————
  'edr.rest': {
    w: 107, h: 51, persp: 440,
    hands: [
      { mirror: true, wrist: [15, 7, 5], pitch: -46, yaw: -46, roll: 12, size: S2, fingers: mk({ ...TAPH }), arm: [0, -29, -17] },
      { mirror: false, wrist: [93, 7, 5], pitch: -46, yaw: 46, roll: -12, size: S2, fingers: mk({ ...TAPH }), arm: [107, -29, -17] },
    ],
  },
};

// — strike deltas: absolute finger targets + additive wrist/orient offsets —
// (derived from main's named use poses, wrist offsets scaled to the canvas).
const KBD_TYPE_A: (HandDelta | undefined)[] = [
  { wrist: [0, -1.2, 0], fingers: { index: { mcp: 62, pip: 84, dip: 60 } } },
  undefined,
];
const KBD_TYPE_B: (HandDelta | undefined)[] = [
  undefined,
  { wrist: [0, -1.2, 0], fingers: { middle: { mcp: 66, pip: 86, dip: 62 } } },
];
const KBD_ENTER: (HandDelta | undefined)[] = [
  undefined,
  { wrist: [0, -2.4, 2.4], pitch: -2, roll: -4, fingers: { ring: { mcp: 70, pip: 88, dip: 62 }, pinky: { mcp: 74, pip: 90, dip: 64 } } },
];
const SQUEEZE: HandDelta = {
  fingers: {
    index: { mcp: 67, pip: 75 }, middle: { mcp: 71, pip: 79 },
    ring: { mcp: 75, pip: 83 }, pinky: { mcp: 81, pip: 87 },
  },
};

export interface CycleDef {
  ms: CycleMs;
  impact: (HandDelta | undefined)[];
  /** anticipation (A) and strike (S) moves of the tool object [dx, dy, scale] */
  moveA?: [number, number, number];
  moveS?: [number, number, number];
  release?: { at: number; deltas: (HandDelta | undefined)[] };
}

export interface ToolHands {
  rest: string;
  at: [number, number];
  cycles: CycleDef[];
}

export const TOOL_HANDS: Record<string, ToolHands> = {
  keyboard: {
    rest: 'kbd.rest', at: [4, 9],
    cycles: [
      { ms: CYCLE_MS['kbd.type'], impact: KBD_TYPE_A },
      { ms: CYCLE_MS['kbd.type'], impact: KBD_TYPE_B },
      { ms: CYCLE_MS['kbd.enter'], impact: KBD_ENTER },
    ],
  },
  mouse: {
    rest: 'mouse.rest', at: [3, 6],
    cycles: [{ ms: CYCLE_MS.mouse, impact: [{ wrist: [0, -1.45, 0], fingers: { index: { mcp: 52, pip: 42, dip: 30 } } }], moveS: [0, -1, 1] }],
  },
  usb: {
    rest: 'usb.rest', at: [-4, 18],
    cycles: [{
      ms: CYCLE_MS.usb,
      impact: [{ wrist: [0, 2.9, 8.7], pitch: 4, yaw: -4, fingers: { index: { mcp: 84, pip: 88 }, thumb: { mcp: 48, pip: 45 } } }],
      moveA: [0, 6, 1.05],
      moveS: [0, 2.9, 0.93],
      release: {
        at: 40,
        deltas: [{ fingers: { thumb: { abd: 54, pip: 6 }, index: { pip: 36 } } }],
      },
    }],
  },
  badge: {
    rest: 'badge.rest', at: [-6, 13],
    cycles: [{
      ms: CYCLE_MS.badge,
      impact: [{ wrist: [0, 5.8, 5.8], pitch: 36, yaw: 8, roll: -6 }],
      moveA: [0, -3, 1],
      moveS: [0, 5.8, 1],
    }],
  },
  mfa: {
    rest: 'mfa.rest', at: [9, 12],
    cycles: [{
      ms: CYCLE_MS.mfa,
      impact: [{ wrist: [0, 1.45, 0], pitch: -4, fingers: { thumb: { mcp: 52, pip: 66 } } }],
      moveA: [0, -3, 1],
      moveS: [0, 1.45, 1],
    }],
  },
  patch: {
    rest: 'patch.rest', at: [11, 13],
    cycles: [{
      ms: CYCLE_MS.patch,
      impact: [{ wrist: [0, 5.8, 11.6], pitch: -6, fingers: { index: { mcp: 79, pip: 84 }, thumb: { mcp: 43, pip: 41 } } }],
      moveA: [0, 4, 1.04],
      moveS: [0, 5.8, 0.91],
    }],
  },
  tap: {
    rest: 'tap.rest', at: [3, 6],
    cycles: [{ ms: CYCLE_MS.tap, impact: [SQUEEZE, SQUEEZE], moveS: [0, -1, 1] }],
  },
  edr: {
    rest: 'edr.rest', at: [3, 6],
    cycles: [{ ms: CYCLE_MS.edr, impact: [undefined, { wrist: [-2.4, 0, 2.4], yaw: -6, roll: -2, fingers: { thumb: { mcp: 56, pip: 60 } } }] }],
  },
};

/** Number of per-tool cycle variants (keyboard alternates typeA/typeB/enter). */
export function cycleVariant(toolId: string, n: number): CycleDef {
  const t = TOOL_HANDS[toolId];
  return t.cycles[n % t.cycles.length];
}
