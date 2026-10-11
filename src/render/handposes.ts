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
const wristO = (pitch: number, yaw: number, roll: number, mirror: boolean) => ({
  pitch: pitch - 30,
  yaw,
  roll: (mirror ? -1 : 1) * -(roll + 90),
});

const mk = (fingers: Record<string, Curl>) => fingers;

// —— §2.1 mouse: single right hand, dorsum up ———————————————————————————————
const MOUSE = {
  index: F(6, 34, 36, 10),
  middle: F(0, 28, 34, 14),
  ring: F(-6, 44, 56, 28),
  pinky: F(-12, 56, 66, 36),
  thumb: TH(38, 10, 8, 10),
};
// —— §2.2 keyboard: two hands "holding a ball" ——————————————————————————————
const TYPEH = {
  index: F(8, 26, 40, 14),
  middle: F(2, 28, 44, 16),
  ring: F(-4, 30, 46, 18),
  pinky: F(-10, 36, 50, 20),
  thumb: TH(30, 20, 6, 14),
};
// —— §2.3 usb: tripod pinch —————————————————————————————————————————————————
const USBP = {
  index: F(4, 34, 44, 18),
  middle: F(0, 40, 52, 24),
  ring: F(-8, 72, 84, 44),
  pinky: F(-14, 82, 88, 46),
  thumb: TH(46, 30, 18, 10),
};
// —— §2.4 badge: card pinch, supinated ——————————————————————————————————————
const BADGE = {
  index: F(4, 20, 22, 8),
  middle: F(0, 22, 24, 10),
  ring: F(-8, 48, 54, 26),
  pinky: F(-14, 58, 62, 30),
  thumb: TH(34, 25, 14, 4),
};
// —— §2.5 mfa: fob grip, thumb over button ——————————————————————————————————
const MFAP = {
  index: F(6, 22, 18, 8),
  middle: F(0, 62, 70, 38),
  ring: F(-6, 68, 76, 40),
  pinky: F(-12, 74, 80, 42),
  thumb: TH(48, 20, 10, 8),
};
// —— §2.6 patch: plate hold —————————————————————————————————————————————————
const PATCH = {
  index: F(6, 16, 14, 4),
  middle: F(0, 16, 14, 4),
  ring: F(-6, 18, 16, 6),
  pinky: F(-12, 30, 30, 12),
  thumb: TH(12, 22, 18, 0),
};
// —— §2.7 tap: two-hand device hold —————————————————————————————————————————
const TAPH = {
  index: F(6, 30, 36, 14),
  middle: F(0, 60, 68, 34),
  ring: F(-6, 64, 70, 36),
  pinky: F(-12, 70, 76, 38),
  thumb: TH(36, 18, 12, 10),
};

const S1 = 23.2; // L = 190 at 1×  (190 / 8.2)
const S2 = 18.3; // L = 150 two-hand (150 / 8.2)

export const POSES: Record<string, RigFrame> = {
  'kbd.rest': {
    w: 100, h: 56, persp: 460,
    hands: [
      { mirror: true, wrist: [11.6, 8, 4], yaw: 4, roll: 5, pitch: -22, size: S2, fingers: mk({ ...TYPEH }), arm: [-14, -30, -16] },
      { wrist: [88.4, 8, 4], yaw: -4, roll: -5, pitch: -22, size: S2, fingers: mk({ ...TYPEH }), arm: [114, -30, -16] },
    ],
  },

  'mouse.rest': {
    w: 64, h: 60, persp: 440,
    hands: [{ wrist: [31, 10, 8], ...wristO(12, -6, -80, false), size: S1, fingers: mk({ ...MOUSE }), arm: [70, -32, -18] }],
  },

  'usb.rest': {
    w: 64, h: 64, persp: 450,
    hands: [{ wrist: [36, 8, 6], ...wristO(4, -10, -60, false), size: S1, fingers: mk({ ...USBP }), arm: [74, -32, -18] }],
  },

  'badge.rest': {
    w: 56, h: 64, persp: 440,
    hands: [{ wrist: [28, 6, 4], ...wristO(-6, 8, -50, false), size: S1, fingers: mk({ ...BADGE }), arm: [66, -32, -18] }],
  },

  'mfa.rest': {
    w: 56, h: 60, persp: 430,
    hands: [{ wrist: [32, 8, 4], ...wristO(10, 4, -70, false), size: S1, fingers: mk({ ...MFAP }), arm: [70, -30, -18] }],
  },

  'patch.rest': {
    w: 56, h: 60, persp: 430,
    hands: [{ wrist: [34, 6, 2], ...wristO(18, -8, -65, false), size: S1, fingers: mk({ ...PATCH }), arm: [72, -30, -18] }],
  },

  'tap.rest': {
    w: 116, h: 56, persp: 460,
    hands: [
      { mirror: true, wrist: [6.8, 8, 4], ...wristO(6, 10, 70, true), size: S2, fingers: mk({ ...TAPH }), arm: [-16, -30, -16] },
      { wrist: [109.2, 8, 4], ...wristO(6, -10, -70, false), size: S2, fingers: mk({ ...TAPH }), arm: [132, -30, -16] },
    ],
  },

  'edr.rest': {
    w: 140, h: 56, persp: 460,
    hands: [
      { mirror: true, wrist: [6, 8, 4], yaw: 4, roll: 5, pitch: -22, size: S2, fingers: mk({ ...TYPEH }), arm: [-18, -30, -16] },
      { wrist: [134, 8, 4], yaw: -4, roll: -5, pitch: -22, size: S2, fingers: mk({ ...TYPEH }), arm: [158, -30, -16] },
    ],
  },
};

// —— use cycles (spec §5.2) ————————————————————————————————————————————————

export interface CycleDef {
  ms: CycleMs;
  /** delta each hand reaches at the strike (S) — the "impact" pose. */
  impact: (HandDelta | undefined)[];
  /** delta during hold (e.g. usb finger release), blended in at `at` ms. */
  release?: { at: number; deltas: (HandDelta | undefined)[] };
  /** hand-level move [dx, dy, scaleMul] at full anticipation / at strike. */
  moveA?: [number, number, number];
  moveS?: [number, number, number];
}

/** Keyboard strike variants (§2.2): typeA left-middle, typeB right-index, enter right-pinky. */
const KBD_TYPE_A: (HandDelta | undefined)[] = [
  { fingers: { middle: { mcp: 40, pip: 48, dip: 6 } }, roll: 4 },
  undefined,
];
const KBD_TYPE_B: (HandDelta | undefined)[] = [
  undefined,
  { fingers: { index: { mcp: 40, pip: 44, dip: 6 } }, roll: -4 },
];
const KBD_ENTER: (HandDelta | undefined)[] = [
  undefined,
  { fingers: { pinky: { mcp: 46, pip: 52, dip: 8 } }, yaw: 6 },
];

export interface ToolHands {
  rest: string;
  at: [number, number];
  cycles: CycleDef[];
}

export const TOOL_HANDS: Record<string, ToolHands> = {
  keyboard: {
    rest: 'kbd.rest', at: [0, -1],
    cycles: [
      { ms: CYCLE_MS['kbd.type'], impact: KBD_TYPE_A },
      { ms: CYCLE_MS['kbd.type'], impact: KBD_TYPE_B },
      { ms: CYCLE_MS['kbd.enter'], impact: KBD_ENTER },
    ],
  },
  mouse: {
    rest: 'mouse.rest', at: [13, 2],
    cycles: [{ ms: CYCLE_MS.mouse, impact: [{ fingers: { index: { mcp: 36, pip: 36, dip: 4 } }, wrist: [0, -1, 0] }], moveS: [0, -1, 1] }],
  },
  usb: {
    rest: 'usb.rest', at: [15, 5],
    cycles: [{
      ms: CYCLE_MS.usb,
      impact: [{ wrist: [8, -13, -10], sizeMul: 0.93 }],
      moveA: [0, 6, 1.05],
      moveS: [8, -13, 0.93],
      release: {
        at: 40,
        deltas: [{ fingers: { thumb: { abd: 54, pip: 6 }, index: { pip: 36 } } }],
      },
    }],
  },
  badge: {
    rest: 'badge.rest', at: [-10, 4],
    cycles: [{
      ms: CYCLE_MS.badge,
      impact: [{ wrist: [-18, -28, 7], roll: -20, fingers: { index: { abd: 9 }, middle: { abd: 5, pip: 18 }, ring: { abd: -3 }, pinky: { abd: -9 }, thumb: { abd: 30 } } }],
      moveA: [0, -3, 1],
      moveS: [-18, -28, 1],
    }],
  },
  mfa: {
    rest: 'mfa.rest', at: [22, 4],
    cycles: [{
      ms: CYCLE_MS.mfa,
      impact: [{ fingers: { thumb: { mcp: 32, pip: 36, cmcFlex: 30 } }, wrist: [0, -3, 0] }],
      moveA: [0, -3, 1],
      moveS: [0, -3, 1],
    }],
  },
  patch: {
    rest: 'patch.rest', at: [26, 4],
    cycles: [{
      ms: CYCLE_MS.patch,
      impact: [{ wrist: [0, -22, -11], sizeMul: 0.91, roll: -12, pitch: -8 }],
      moveA: [0, 4, 1.04],
      moveS: [0, -22, 0.91],
    }],
  },
  tap: {
    rest: 'tap.rest', at: [0, 2],
    cycles: [{
      ms: CYCLE_MS.tap,
      impact: [
        { fingers: { thumb: { mcp: 30, pip: 24 } }, wrist: [0, -1, 0] },
        { fingers: { thumb: { mcp: 30, pip: 24 } }, wrist: [0, -1, 0] },
      ],
      moveS: [0, -1, 1],
    }],
  },
  edr: {
    rest: 'edr.rest', at: [0, 2],
    cycles: [{ ms: CYCLE_MS.edr, impact: [undefined, { fingers: { index: { mcp: 40, pip: 44, dip: 6 } }, roll: -4 }] }],
  },
};

/** Number of per-tool cycle variants (keyboard alternates typeA/typeB/enter). */
export function cycleVariant(toolId: string, n: number): CycleDef {
  const t = TOOL_HANDS[toolId];
  return t.cycles[n % t.cycles.length];
}
