import type { Curl, RigFrame } from './handrig';

/**
 * Authored rig poses per tool: wrist position + palm orientation + per-finger
 * joint angles in a base-unit bake frame (+y up from the canvas bottom).
 * Sizes are middle-finger length in units.
 *
 * Palm orientation cheat-sheet (rotates the whole hand about the wrist):
 *   pitch -90  → palm down, fingers point away (typing / palm-on-mouse)
 *   pitch   0  → palm faces away, fingers up (flat "stop" hand)
 *   pitch +90  → palm faces the camera, fingers up
 *   roll  ±    → rotates about the finger axis (wrist tilt)
 *   yaw   ±    → turns the hand edge-on
 */

const curls = (f: Partial<Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', Curl>>) => f;

// typing: palm down on the home row, fingers curved, thumb over the space bar
const TYPE = (over: Partial<Record<'index' | 'middle' | 'ring' | 'pinky' | 'thumb', Partial<Curl>>> = {}) => ({
  index: { abd: 6, mcp: 38, pip: 52, ...over.index },
  middle: { abd: 0, mcp: 42, pip: 56, ...over.middle },
  ring: { abd: -6, mcp: 46, pip: 60, ...over.ring },
  pinky: { abd: -12, mcp: 52, pip: 64, ...over.pinky },
  thumb: { abd: 0, mcp: 60, pip: 55, ...over.thumb },
});

const FIST = (tight = 0) => ({
  index: { abd: 6, mcp: 84 + tight * 4, pip: 96 + tight * 8 },
  middle: { abd: 0, mcp: 88 + tight * 2, pip: 100 + tight * 8 },
  ring: { abd: -6, mcp: 90, pip: 102 + tight * 6 },
  pinky: { abd: -12, mcp: 90, pip: 100 },
  thumb: { abd: 0, mcp: 30 + tight * 14, pip: 40 + tight * 20 },
});

const PINCH = (open = 0) => ({
  index: { abd: 4, mcp: 80 - open * 10, pip: 85 - open * 8 },
  middle: { abd: 0, mcp: 70, pip: 84 },
  ring: { abd: -8, mcp: 82, pip: 98 },
  pinky: { abd: -14, mcp: 88, pip: 100 },
  thumb: { abd: 0, mcp: 44 - open * 10, pip: 42 - open * 8 },
});

// palm grip cupping the mouse
const CUP = (click = false) => ({
  index: { abd: 8, mcp: click ? 52 : 40, pip: click ? 42 : 30, dip: click ? 30 : 18 },
  middle: { abd: -2, mcp: 46, pip: 36, dip: 22 },
  ring: { abd: -10, mcp: 62, pip: 58 },
  pinky: { abd: -16, mcp: 68, pip: 64 },
  thumb: { abd: 0, mcp: 38, pip: 44 },
});

// squeeze a clip/bezel edge
const GRIP_SIDE = (tight = 0) => ({
  index: { abd: 8, mcp: 62 + tight * 10, pip: 70 + tight * 10 },
  middle: { abd: 0, mcp: 66 + tight * 10, pip: 74 + tight * 10 },
  ring: { abd: -8, mcp: 70 + tight * 10, pip: 78 + tight * 10 },
  pinky: { abd: -14, mcp: 76 + tight * 10, pip: 82 + tight * 10 },
  thumb: { abd: 0, mcp: 26, pip: 30 },
});

export const POSES: Record<string, RigFrame> = {
  // — KEYBOARD: two hands palm-down on the home row ——————————————————————————
  'kbd.rest': {
    w: 96, h: 52, persp: 460,
    hands: [
      { mirror: true, wrist: [30, 10, 6], pitch: -58, thumbOut: 0.35, yaw: -14, roll: 10, size: 15, fingers: curls(TYPE()), arm: [4, -26, -16] },
      { mirror: false, wrist: [66, 10, 6], pitch: -58, thumbOut: 0.35, yaw: 14, roll: -10, size: 15, fingers: curls(TYPE()), arm: [92, -26, -16] },
    ],
  },
  'kbd.typeA': {
    w: 96, h: 52, persp: 460,
    hands: [
      { mirror: true, wrist: [30, 9, 6], pitch: -58, thumbOut: 0.35, yaw: -14, roll: 10, size: 15, fingers: curls(TYPE({ index: { mcp: 62, pip: 84, dip: 60 } })), arm: [4, -26, -16] },
      { mirror: false, wrist: [66, 10, 6], pitch: -58, thumbOut: 0.35, yaw: 14, roll: -10, size: 15, fingers: curls(TYPE()), arm: [92, -26, -16] },
    ],
  },
  'kbd.typeB': {
    w: 96, h: 52, persp: 460,
    hands: [
      { mirror: true, wrist: [30, 10, 6], pitch: -58, thumbOut: 0.35, yaw: -14, roll: 10, size: 15, fingers: curls(TYPE()), arm: [4, -26, -16] },
      { mirror: false, wrist: [66, 9, 6], pitch: -58, thumbOut: 0.35, yaw: 14, roll: -10, size: 15, fingers: curls(TYPE({ middle: { mcp: 66, pip: 86, dip: 62 } })), arm: [92, -26, -16] },
    ],
  },
  'kbd.enter': {
    w: 96, h: 52, persp: 460,
    hands: [
      { mirror: true, wrist: [30, 10, 6], pitch: -58, thumbOut: 0.35, yaw: -14, roll: 10, size: 15, fingers: curls(TYPE()), arm: [4, -26, -16] },
      { mirror: false, wrist: [66, 8, 8], pitch: -60, thumbOut: 0.35, yaw: 14, roll: -14, size: 15, fingers: curls(TYPE({ ring: { mcp: 70, pip: 88, dip: 62 }, pinky: { mcp: 74, pip: 90, dip: 64 } })), arm: [92, -26, -16] },
    ],
  },

  // — MOUSE: right-hand palm grip ————————————————————————————————————————————
  'mouse.rest': {
    w: 64, h: 56, persp: 420,
    hands: [{ wrist: [32, 20, 10], pitch: -62, thumbOut: 0.08, yaw: 18, roll: -6, size: 16, fingers: curls(CUP()), arm: [56, -24, -18] }],
  },
  'mouse.click': {
    w: 64, h: 56, persp: 420,
    hands: [{ wrist: [32, 19, 10], pitch: -62, thumbOut: 0.08, yaw: 18, roll: -6, size: 16, fingers: curls(CUP(true)), arm: [56, -24, -18] }],
  },

  // — USB stick: pinch grip, connector up ————————————————————————————————————
  'usb.rest': {
    w: 56, h: 48, persp: 430,
    hands: [{ wrist: [28, 8, 4], pitch: -18, thumbOut: 0.4, yaw: 34, roll: -6, size: 16, fingers: curls(PINCH()), arm: [44, -26, -16] }],
  },
  'usb.thrust': {
    w: 56, h: 48, persp: 430,
    hands: [{ wrist: [28, 10, 10], pitch: -14, thumbOut: 0.4, yaw: 30, roll: -6, size: 16, fingers: curls(PINCH(-0.4)), arm: [46, -26, -18] }],
  },

  // — BADGE: card pinched thumb + index side —————————————————————————————————
  'badge.rest': {
    w: 48, h: 44, persp: 430,
    hands: [{ wrist: [24, 4, 2], pitch: -14, thumbOut: 0.4, yaw: 40, roll: -4, size: 16, fingers: curls(PINCH(0.3)), arm: [10, -28, -14] }],
  },
  'badge.present': {
    w: 48, h: 44, persp: 430,
    hands: [{ wrist: [24, 8, 6], pitch: 22, thumbOut: 0.4, yaw: 48, roll: -10, size: 16, fingers: curls(PINCH(0.3)), arm: [8, -28, -14] }],
  },

  // — MFA token: relaxed fist, thumb over the button —————————————————————————
  'mfa.rest': {
    w: 44, h: 44, persp: 420,
    hands: [{ wrist: [22, 6, 2], pitch: -8, thumbOut: 0.4, yaw: 26, roll: -4, size: 16, fingers: curls(FIST(-0.4)), arm: [34, -26, -16] }],
  },
  'mfa.press': {
    w: 44, h: 44, persp: 420,
    hands: [{ wrist: [22, 7, 2], pitch: -12, thumbOut: 0.4, yaw: 26, roll: -4, size: 16, fingers: curls({ ...FIST(-0.4), thumb: { abd: 0, mcp: 52, pip: 66 } }), arm: [34, -26, -16] }],
  },

  // — PATCH disk: pinch on the edge ——————————————————————————————————————————
  'patch.rest': {
    w: 44, h: 44, persp: 420,
    hands: [{ wrist: [22, 4, 0], pitch: -4, thumbOut: 0.4, yaw: 30, roll: -2, size: 16, fingers: curls(PINCH(0.15)), arm: [34, -26, -16] }],
  },
  'patch.push': {
    w: 44, h: 44, persp: 420,
    hands: [{ wrist: [22, 8, 8], pitch: -10, thumbOut: 0.4, yaw: 30, roll: -2, size: 16, fingers: curls(PINCH(0.1)), arm: [34, -26, -16] }],
  },

  // — TAP: two hands squeeze the clip housing ————————————————————————————————
  'tap.rest': {
    w: 84, h: 40, persp: 440,
    hands: [
      { mirror: true, wrist: [10, 6, 4], pitch: -58, thumbOut: 0.35, yaw: -52, roll: 10, size: 15, fingers: curls(GRIP_SIDE()), arm: [0, -24, -14] },
      { mirror: false, wrist: [74, 6, 4], pitch: -58, thumbOut: 0.35, yaw: 52, roll: -10, size: 15, fingers: curls(GRIP_SIDE()), arm: [84, -24, -14] },
    ],
  },
  'tap.squeeze': {
    w: 84, h: 40, persp: 440,
    hands: [
      { mirror: true, wrist: [10, 6, 4], pitch: -58, thumbOut: 0.35, yaw: -52, roll: 10, size: 15, fingers: curls(GRIP_SIDE(0.5)), arm: [0, -24, -14] },
      { mirror: false, wrist: [74, 6, 4], pitch: -58, thumbOut: 0.35, yaw: 52, roll: -10, size: 15, fingers: curls(GRIP_SIDE(0.5)), arm: [84, -24, -14] },
    ],
  },

  // — EDR tablet: two hands on the bezel, right thumb taps on use ————————————
  'edr.rest': {
    w: 88, h: 42, persp: 440,
    hands: [
      { mirror: true, wrist: [12, 6, 4], pitch: -46, thumbOut: 0.35, yaw: -46, roll: 12, size: 15, fingers: curls(GRIP_SIDE()), arm: [0, -24, -14] },
      { mirror: false, wrist: [76, 6, 4], pitch: -46, thumbOut: 0.35, yaw: 46, roll: -12, size: 15, fingers: curls(GRIP_SIDE()), arm: [88, -24, -14] },
    ],
  },
  'edr.tap': {
    w: 88, h: 42, persp: 440,
    hands: [
      { mirror: true, wrist: [12, 6, 4], pitch: -46, thumbOut: 0.35, yaw: -46, roll: 12, size: 15, fingers: curls(GRIP_SIDE()), arm: [0, -24, -14] },
      { mirror: false, wrist: [74, 6, 6], pitch: -46, thumbOut: 0.35, yaw: 40, roll: -14, size: 15, fingers: curls({ ...GRIP_SIDE(), thumb: { abd: 0, mcp: 56, pip: 60 } }), arm: [88, -24, -14] },
    ],
  },
};


/**
 * Per-tool hand overlay: which rig frame is the rest pose, the ordered frames
 * a use cycle steps through, and `at` — the sprite's bottom-centre anchored in
 * viewmodel space (x relative to w/2, y = px above the status-bar line).
 */
export const TOOL_HANDS: Record<string, { rest: string; use: string[]; at: [number, number] }> = {
  keyboard: { rest: 'kbd.rest', use: ['kbd.typeA', 'kbd.typeB', 'kbd.enter'], at: [0, 6] },
  mouse: { rest: 'mouse.rest', use: ['mouse.click'], at: [0, 6] },
  usb: { rest: 'usb.rest', use: ['usb.thrust'], at: [-8, 6] },
  badge: { rest: 'badge.rest', use: ['badge.present'], at: [-10, 4] },
  mfa: { rest: 'mfa.rest', use: ['mfa.press'], at: [6, 4] },
  patch: { rest: 'patch.rest', use: ['patch.push'], at: [8, 6] },
  tap: { rest: 'tap.rest', use: ['tap.squeeze'], at: [0, 4] },
  edr: { rest: 'edr.rest', use: ['edr.tap'], at: [0, 4] },
};

/** Pick the rig frame for a tool's current use phase (nearest, never blended). */
export function handPoseFor(toolId: string, phase: string | null, u: number): string | null {
  const t = TOOL_HANDS[toolId];
  if (!t) return null;
  if (phase === 'impact') return t.use[Math.min(t.use.length - 1, Math.floor(u * t.use.length))];
  if (phase === 'recover' && u < 0.35) return t.use[t.use.length - 1];
  return t.rest;
}
