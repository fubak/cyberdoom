import type { Gender, ToolDef, ViewmodelAnim } from '../core/types';
import { fireFlash, fireLamp, usePhase, vmLine } from '../tools/anim';
import { currentSkin, type SkinTone } from '../tools/look';
import { handLook } from '../tools/shared';
import { shade } from '../tools/pixel';
import { outlineNative, painter, type Painter } from './hires';
import { RES } from './res';
import { bakeRig } from './handrig';
import { handCycleFrame, idleFrame, cycleVariants } from './handcycles';
import { breath } from './vmotion';
import { TOOL_HANDS } from './handposes';

/**
 * LOOK: Doom-style first-person tool viewmodels. Each tool is pixel-painted
 * once per (tool, gender, pose) into an offscreen canvas at native (RES x)
 * resolution with a dark outline, then blitted every frame with walk bob and use-recoil.
 * The USB scanner gets a fullbright muzzle flash when it fires.
 */
type Px = (c: string, x: number, y: number, w?: number, h?: number) => void;
interface Art {
  c: HTMLCanvasElement;
  /** anchor: x is centre, y is the canvas bottom */
  ox: number;
  /** first opaque row (after the outline pass), base units */
  top: number;
  /** last opaque row + 1 (after the outline pass), base units */
  bot: number;
}

const cache = new Map<string, Art>();

/** Overall on-screen size of the bespoke viewmodels (1 = native 1:1 pixels). */
export const VIEWMODEL_SCALE = 1;

/** External hand-motion inputs written by main.ts each frame (§5.5/§5.6). */
export const handMods = { roll: 0, bobPitch: 0, seed: 1, still: false };

function paint(w: number, h: number, ox: number, fn: (px: Px, P: Painter) => void): Art {
  const P = painter(w, h);
  const px: Px = (col, x, y, ww = 1, hh = 1) => P.rect(x, y, ww, hh, col);
  fn(px, P);
  const top = outlineNative(P.g, P.c.width, P.c.height, 2);
  return { c: P.c, ox, top: top / RES, bot: opaqueBottom(P.g, P.c.width, P.c.height) / RES };
}

/** One past the lowest opaque row (native px). */
function opaqueBottom(g: CanvasRenderingContext2D, w: number, h: number): number {
  const d = g.getImageData(0, 0, w, h).data;
  for (let y = h - 1; y >= 0; y--)
    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 0) return y + 1;
  return h;
}

/**
 * Fire-frame lighting on the ART: clone the painted canvas and push every
 * opaque pixel toward the tool's TOOL_FLASH colour, the way Doom's weapon
 * sprite catches its own muzzle flash. Outline pixels light up too.
 */
function tintFlash(a: Art, rgb: string): Art {
  const c = document.createElement('canvas');
  c.width = a.c.width;
  c.height = a.c.height;
  const g = c.getContext('2d')!;
  g.drawImage(a.c, 0, 0);
  const [r, gg, b] = rgb.split(',').map(Number);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = Math.min(255, d[i] * 0.45 + r * 0.55 + 24);
    d[i + 1] = Math.min(255, d[i + 1] * 0.45 + gg * 0.55 + 24);
    d[i + 2] = Math.min(255, d[i + 2] * 0.45 + b * 0.55 + 24);
  }
  g.putImageData(img, 0, 0);
  return { c, ox: a.ox, top: a.top, bot: a.bot };
}

function keyboardArt(fire: boolean): Art {
  // compact board (~25% of view width with hands), like Doom's pistol-sized footprint
  return paint(80, 50, 40, (px, _P) => {
    for (let r = 0; r < 22; r++) {
      const inset = Math.floor((22 - r) * 0.3);
      px(r < 2 ? '#8a92a8' : '#3a404c', 10 + inset, 2 + r, 60 - inset * 2, 1);
    }
    px('#1a1c22', 10, 24, 60, 3);
    const rows = 4;
    for (let row = 0; row < rows; row++) {
      const y = 5 + row * 5;
      const x0 = 10 + (rows - row) * 2 + 2;
      const x1 = 70 - (rows - row) * 2 - 2;
      const n = 10;
      const kw = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        let cap = '#c8ccd8';
        let top = '#eef0f6';
        const kx = Math.round(x0 + k * kw);
        if (row === 3 && k > 2 && k < 7) {
          if (k !== 3) continue;
          px('#9aa0b0', kx, y, Math.round(kw * 4) - 1, 3);
          px('#dde0e8', kx, y, Math.round(kw * 4) - 1, 1);
          continue;
        }
        if (row === 1 && k === 9) { cap = '#2ad83a'; top = '#8aff9a'; }
        if (row === 0 && k === 0) { cap = '#e01e10'; top = '#ff7a5a'; }
        const pressed = fire && ((row === 1 && k === 9) || (row === 1 && (k === 3 || k === 6)));
        const ky = y + (pressed ? 1 : 0);
        px('#5a6070', kx, ky + 3, Math.round(kw) - 1, 1);
        px(cap, kx, ky, Math.round(kw) - 1, 3);
        px(top, kx, ky, Math.round(kw) - 1, 1);
      }
    }
    px(fire ? '#8aff9a' : '#2ad83a', 60, 3, 2, 1);
    px('#ffd040', 56, 3, 2, 1);
  });
}

function mouseArt(fire: boolean): Art {
  return paint(72, 84, 36, (px, _P) => {
    // cable going up/forward
    px('#3a404c', 34, 0, 2, 14);
    px('#5a6070', 34, 0, 1, 14);
    // mouse shell
    const shell = ['#f0f2f8', '#c8ccd8', '#9aa0b0', '#5a6070'];
    for (let r = 0; r < 40; r++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((r - 22) / 24) ** 2)) * 16);
      px(shell[1], 35 - half, 12 + r, half * 2, 1);
      px(shell[0], 35 - half + 2, 12 + r, Math.max(0, half - 4), 1);
      px(shell[2], 35 + half - 3, 12 + r, 3, 1);
    }
    // buttons split + wheel
    px(shell[3], 34, 12, 1, 18);
    px(fire ? '#2ad83a' : '#8a90a0', 22, 16, 11, fire ? 12 : 1);
    px('#1a1c22', 33, 16, 4, 8);
    px('#2458d8', 34, 17, 2, 6);
    px('#8ab4ff', 34, 17, 2, 1);
    // contact shadow + thin dark mousepad in perspective (wider toward camera)
    px('#14100e', 22, 50, 34, 3);
    px('#242228', 4, 54, 64, 4);
    px('#1a181e', 0, 58, 72, 6);
    px('#2a2830', 0, 58, 72, 1);
  });
}

type UsbFrame = 'rest' | 'press' | 'flash' | 'recoil' | 'settle';

function usbArt(frame: UsbFrame, gender: Gender, skin: SkinTone): Art {
  const look = handLook(gender);
  const [base, shadow, highlight] = [skin.base, skin.shadow, skin.highlight];
  const deep = shade(shadow, 0.65);
  const ramp = [deep, shadow, base, highlight];
  const seam = '#30201b';
  const recoil = frame === 'recoil';
  return paint(84, 56, 42, (_px, P) => {
    const point = (x: number, y: number): [number, number] => {
      const rx = recoil ? x + Math.round((y - 42) * 0.06) : x;
      const ry = recoil ? y + Math.round((42 - x) * 0.035) : y;
      return [rx, 8 + ry * (48 / 88)];
    };
    const box = (color: string, x: number, y: number, w: number, h: number) =>
      P.poly([point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)], color);
    const shape = (color: string, pts: [number, number][]) => P.poly(pts.map(([x, y]) => point(x, y)), color);
    const seamLine = (pts: [number, number][]) => P.line(pts.map(([x, y]) => point(x, y)), seam);

    const jacketShade = shade(look.jacket, 0.64);
    const jacketLight = shade(look.jacket, 1.22);
    shape(jacketShade, [[51, 65], [69, 60], [84, 68], [84, 88], [51, 88]]);
    shape(look.jacket, [[54, 65], [69, 62], [82, 69], [82, 88], [56, 88]]);
    shape(jacketLight, [[55, 66], [59, 65], [65, 88], [60, 88]]);
    seamLine([[58, 68], [64, 76], [70, 88]]);
    box(jacketShade, 56, 70, 25, 4);
    box(look.accent, 57, 72, 24, 1.5);
    box(jacketLight, 57, 70, 24, 0.75);
    if (gender === 'female') {
      box('#20242c', 54, 66, 9, 5);
      box('#0b2a2a', 55, 67, 7, 3);
      box(look.accent, 56, 67, 2, 1);
      box('#ff5a7a', 60, 67, 1, 1);
    }

    for (let i = 0; i < 4; i++) {
      const x = 23 + i * 7;
      const y = 61 + (i % 2);
      box(ramp[2], x, y, 8, 13);
      box(ramp[1], x + 1, y + 3, 6, 9);
      box(ramp[3], x + 2, y + 10, 3, 1);
      seamLine([[x + 7, y + 4], [x + 6, y + 8]]);
    }
    shape('#11151d', [[31, 4], [51, 4], [61, 49], [67, 68], [17, 68], [23, 49]]);
    shape('#657084', [[33, 5], [49, 5], [58, 47], [63, 66], [21, 66], [26, 47]]);
    if (frame === 'flash') {
      shape('#5affff', [[34, 0], [38, 0], [38, 3], [30, 3], [30, 6], [27, 6], [27, 3], [34, 3]]);
      shape('#bff8ff', [[47, 1], [51, 1], [51, 4], [55, 4], [55, 7], [49, 7], [49, 4], [47, 4]]);
    }
    shape('#aab4c5', [[34, 6], [48, 6], [54, 34], [29, 34]]);
    shape('#454f61', [[29, 34], [54, 34], [62, 66], [22, 66]]);
    shape('#778396', [[30, 35], [53, 35], [56, 40], [28, 40]]);
    shape('#242b38', [[24, 41], [59, 41], [64, 66], [20, 66]]);
    shape('#384353', [[25, 42], [57, 42], [60, 62], [23, 62]]);
    shape('#171d27', [[20, 63], [64, 63], [67, 68], [17, 68]]);
    shape('#4a5667', [[20, 63], [64, 63], [64, 65], [20, 65]]);

    // Connector, screen, LED, and the thumb-side red trigger on the top face.
    box('#b6c1d0', 36, 1, 11, 6);
    box('#edf2f5', 36, 1, 11, 1.5);
    box('#7b8798', 44, 2, 3, 5);
    box('#141922', 38, 3, 2, 2);
    box('#141922', 42, 3, 2, 2);
    shape('#0a171b', [[32, 14], [51, 14], [54, 29], [29, 29]]);
    box(frame === 'flash' ? '#8affff' : '#2ad83a', 32, 17, 17, 1.5);
    box(frame === 'flash' ? '#5affff' : '#149d34', 32, 20, 11, 1);
    box(frame === 'flash' ? '#5affff' : '#149d34', 32, 22, 14, 1);
    box('#ff4a2a', 47, 41, 8, 2.5);
    box('#ff9873', 47, 41, 8, 0.75);
    box('#285fe0', 24, 47, 37, 2.5);
    box('#8ab4ff', 24, 47, 37, 0.75);
    box(frame === 'settle' ? '#53ff72' : '#22bb48', 52, 35, 4, 1.5);

    // Palm and knuckles wrap the right edge; the thumb lands on the trigger.
    shape(ramp[2], [[54, 51], [61, 51], [65, 56], [63, 67], [56, 69], [52, 62]]);
    box(ramp[1], 55, 55, 8, 9);
    for (let i = 0; i < 3; i++) {
      box(ramp[2], 55 + i * 2, 53 + (i % 2), 2, 2);
      box(ramp[3], 55 + i * 2, 53 + (i % 2), 1, 0.5);
    }
    const thumbY = frame === 'press' ? 42 : frame === 'recoil' ? 39 : 40;
    shape(ramp[2], [[52, thumbY], [59, thumbY], [63, thumbY + 3], [60, thumbY + 6], [54, thumbY + 5], [51, thumbY + 3]]);
    box(ramp[3], 55, thumbY + 1, 3, 1);
    seamLine([[53, thumbY + 4], [57, thumbY + 5], [60, thumbY + 4]]);
  });
}

function badgeArt(fire: boolean): Art {
  return paint(84, 80, 42, (px, _P) => {
    // lanyard clip (the strap runs down behind the card)
    px('#c81e14', 38, 0, 6, 4);
    px('#ff7a5a', 38, 0, 2, 4);
    px('#9aa0b0', 37, 3, 8, 5);
    // card
    px('#eef0f6', 18, 7, 46, 46);
    px('#c8ccd8', 60, 9, 4, 44);
    px('#2458d8', 18, 10, 46, 8);
    px('#8ab4ff', 18, 10, 46, 2);
    px('#8a90a0', 24, 21, 14, 16); // photo
    px('#f0b888', 27, 23, 8, 8);
    px('#3a2a1a', 26, 21, 10, 3);
    px('#2458d8', 25, 31, 12, 6);
    px('#ffd040', 44, 22, 12, 9); // chip
    px('#c89818', 44, 26, 12, 1);
    px('#c89818', 50, 22, 1, 9);
    px('#3a404c', 24, 40, 34, 2);
    px('#3a404c', 46, 35, 12, 2);
    if (fire) {
      px('#5aff6a', 40, 44, 22, 3);
      px('#c8ffb0', 40, 44, 22, 1);
    }
  });
}

/** Art variant: 0 rest, 1 fire pose, 2 fire pose lit in the tool's flash colour. */
function art(tool: ToolDef, gender: Gender, mode: 0 | 1 | 2, usbFrame?: UsbFrame): Art | null {
  const key = `${tool.id}:${gender}:${mode}:${usbFrame ?? ''}:${currentSkin().id}`;
  let a = cache.get(key);
  if (!a) {
    const maker = { keyboard: keyboardArt, mouse: mouseArt, badge: badgeArt }[tool.id];
    if (tool.id === 'usb') a = usbArt(usbFrame ?? (mode === 2 ? 'flash' : mode === 1 ? 'recoil' : 'rest'), gender, currentSkin());
    else if (!maker) return null;
    else a = maker(mode > 0);
    if (mode === 2) a = tintFlash(a, TOOL_FLASH[tool.id] ?? '255,255,255');
    cache.set(key, a);
  }
  return a;
}

/**
 * Draw the current tool's viewmodel (bespoke art, or the tool's own
 * drawViewmodel) plus its fx, all under the clearance line. Always true.
 */
export function drawToolViewmodel(
  g: CanvasRenderingContext2D,
  tool: ToolDef,
  w: number,
  h: number,
  bob: number,
  gender: Gender,
  cooldownFrac: number,
  _time: number,
  anim?: ViewmodelAnim,
): boolean {
  const line = vmLine(h);
  const ph = anim ? usePhase(anim.sinceUse, tool.windup ?? 0) : null;
  // fire cycle: rest art in windup, lit art at the impact flash, fire art
  // through the rest of the strike and early recover — the lit pose holds for
  // ~77 ms of the 90 ms impact window, so >=4 rendered frames at 60 Hz
  const lit = !!ph && ph.phase === 'impact' && ph.u < 0.85;
  const fire = lit || (!!ph && (ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.25))) || (!ph && cooldownFrac > 0.55);
  const usbFrame: UsbFrame | undefined = tool.id !== 'usb' || !ph ? undefined
    : ph.phase === 'wind' ? 'press'
      : ph.phase === 'impact' ? 'flash'
        : ph.phase === 'recover' ? (ph.u < 0.5 ? 'recoil' : 'settle')
          : 'rest';
  const a = art(tool, gender, lit ? 2 : fire ? 1 : 0, usbFrame);
  // shared bob/strike/switch offsets for the art AND the rig-hand overlay
  const bx = Math.round(Math.sin(bob) * 6);
  const byy = Math.round(Math.abs(Math.cos(bob)) * 3);
  const pose = POSE[tool.id] ?? POSE.usb;
  let dx = 0;
  let dy: number;
  // the held object trails the hand: cycle move sampled 20 ms late (looser ζ)
  const _anchor0 = TOOL_HANDS[tool.id];
  const _lag = _anchor0 && anim ? handCycleFrame(tool.id, anim.sinceUse * 1000, Math.floor(_time * 0.6) % cycleVariants(tool.id))?.objMove : null;
  if (_lag && ph) {
    dx = Math.round(_lag[0]);
    dy = Math.round(_lag[1]);
  } else if (ph) {
    const k = ph.k;
    const s = k >= 0 ? pose.strike : pose.wind;
    dx = Math.round(s[0] * Math.abs(k));
    dy = Math.round(s[1] * Math.abs(k));
  } else dy = -Math.round(cooldownFrac * 5); // recoil settle rides up, not down
  const drop = Math.round((anim?.lower ?? 0) * ((a?.c.height ?? 60) + 10));
  // actual downward travel the art got after the sink cap (hands track it)
  let dyDown = byy + dy;
  if (a) {
    const side = SIDE[tool.id] ?? 0;
    const S = VIEWMODEL_SCALE * (SIZE[tool.id] ?? 1);
    // the lit frame swells ~5% toward the camera for one frame of punch
    const swell = lit ? 1.05 : 1;
    const cw = (a.c.width / RES) * S * swell;
    const ch = (a.c.height / RES) * S * swell;
    const top = a.top * S;
    const bot = a.bot * S;
    // up travel the anchor has to absorb (strike lift + lit swell growth)
    const lift = Math.max(0, -Math.min(pose.wind[1], pose.strike[1])) + (LIT_SWELL - 1) * (bot - top);
    // rest: the art's lowest painted row sits BLEED px under the bar line;
    // never raise so far that the peak clears the viewmodel line
    let y0 = h + BLEED - bot;
    y0 = Math.max(y0, line - top + Math.ceil(lift));
    // downward motion (bob + pose dips) is capped so the art's opaque bottom
    // can never dip under the bar — the tool rests on the bar, not in it
    const roomDown = h + BLEED - (y0 + bot);
    dyDown = Math.min(byy + dy, roomDown);
    g.imageSmoothingEnabled = false;
    const y = y0 + dyDown + drop - (ch - (a.c.height / RES) * S);
    g.drawImage(a.c, Math.round(w / 2 - (a.ox - side) * S + bx + dx), y, cw, ch);
    if (lit) {
      const rgb = TOOL_FLASH[tool.id];
      if (rgb) {
        // bloom is additive haze, not art: clip it below the clearance line so
        // it can never wash into the aim area
        g.save();
        g.beginPath();
        g.rect(0, line, w, h - line);
        g.clip();
        fireLamp(g, w / 2 + bx + dx, y + top + (bot - top) * 0.25, (bot - top) * 0.9, anim!.sinceUse - (tool.windup ?? 0), rgb, 0.4);
        g.restore();
      }
    }
  } else {
    tool.drawViewmodel(g, w, h, Math.sin(bob) * 2, gender, cooldownFrac, anim);
    // tools that paint their own viewmodel still get the lit fire frame: an
    // additive lamp over the tool's business end in its flash colour
    if (ph && ph.phase === 'impact') {
      const rgb = TOOL_FLASH[tool.id];
      if (rgb) {
        g.save();
        g.beginPath();
        g.rect(0, line, w, h - line);
        g.clip();
        fireLamp(g, w / 2, line + (h - line) * 0.35, (h - line) * 0.55, anim!.sinceUse - (tool.windup ?? 0), rgb, 0.45);
        g.restore();
      }
    }
  }
  // articulated rig hands over the tool: use-cycle pose + idle micro-motion,
  // tracking the lagged object offsets so the grip follows the tool
  {
    const anchor = SHOW_HANDS ? TOOL_HANDS[tool.id] : undefined;
    if (anchor) {
      const variant = Math.floor(_time * 0.6) % cycleVariants(tool.id);
      const hf = handCycleFrame(tool.id, ph ? anim!.sinceUse * 1000 : null, variant);
      if (hf) {
        const frame = hf.frame;
        const key = hf.key;
        const idleM = !handMods.still && (hf.stage === 'idle' || hf.stage === 'done') ? idleFrame(_time, handMods.seed).move : [0, 0, 0];
        const sp = bakeRig(key, frame, { gender, skin: currentSkin() });
        const sw = sp.c.width / RES;
        const sh = sp.c.height / RES;
        const [brx, bry] = breath(_time);
        // hands are an accent, not the hero: draw them smaller and sunk lower
        // toward the bar so the tool silhouette owns the centre of the view
        const hs = hf.move[2] * HAND_SCALE;
        const hx = Math.round(w / 2 + anchor.at[0] - (sw * hs) / 2 + bx + dx + hf.move[0] + brx * 0.5 + 1 + idleM[0]);
        let hy = Math.round(h - anchor.at[1] - sh * hs + dyDown + drop + hf.move[1] + bry + idleM[1] + HAND_SINK);
        // never let the hand's first opaque row cross the clearance line
        hy = Math.max(hy, Math.ceil(line - (sp.top / RES) * hs));
        // sway roll + bob pitch + idle roll applied continuously at draw:
        // rotating the canvas is free; baking per-degree variants is not
        const rot = handMods.still ? 0 : (handMods.roll + handMods.bobPitch + idleM[2]) * (Math.PI / 180);
        if (Math.abs(rot) > 1e-4 && 'rotate' in g) {
          const gg = g as CanvasRenderingContext2D;
          gg.save();
          gg.translate(hx + (sw * hs) / 2, hy + (sh * hs) / 2);
          gg.rotate(rot);
          gg.drawImage(sp.c as CanvasImageSource, (-sw * hs) / 2, (-sh * hs) / 2, sw * hs, sh * hs);
          gg.restore();
        } else {
          g.drawImage(sp.c as CanvasImageSource, hx, hy, sw * hs, sh * hs);
        }
      }
    }
  }
  if (anim && !anim.lower && tool.drawFx) {
    // tool fx live in the band under the line, so flashes and pulses never cover the aim area
    g.save();
    g.beginPath();
    g.rect(0, line, w, h - line);
    g.clip();
    tool.drawFx(g, w, h, anim);
    g.restore();
  }
  if (anim && !anim.lower) {
    // muzzle-flash equivalent: a 2-3 frame light burst bleeding in from the screen
    // edges, tinted per tool, timed to the impact window
    const rgb = TOOL_FLASH[tool.id];
    if (rgb) fireFlash(g, w, h, anim.sinceUse - (tool.windup ?? 0), rgb);
  }
  return true;
}

/** Opaque art may rest this far under the bar line (the Doom bottom-crop look). */
const BLEED = 1;
/** Rig hands off: capsule-baked digits read as mitts at this scale — tools draw bare, Doom-style. */
const SHOW_HANDS = false;
/** Rig hands render ~22% smaller than authored — grips stay readable without the hand owning the frame. */
const HAND_SCALE = 0.78;
/** Extra pixels the hand sprite sinks toward the bar line (Doom keeps hands low). */
const HAND_SINK = 4;
/** Lit-frame scale punch (art swells toward the camera at the impact flash). */
const LIT_SWELL = 1.05;

/** Per-tool viewmodel size multiplier (keyboard art runs ~25% of view width at 1). */
const SIZE: Record<string, number> = { keyboard: 1.0, mouse: 0.68, badge: 0.66, usb: 1.0 };

/** Muzzle-flash tint per tool (rgb for edgeFlash); also feeds the world light flood. */
export const TOOL_FLASH: Record<string, string> = {
  keyboard: '255,200,90',
  mouse: '255,230,120',
  usb: '120,240,255',
  badge: '140,255,160',
  tap: '180,110,255',
  edr: '120,220,255',
  mfa: '255,220,140',
  patch: '120,255,140',
};

/** Per-tool [dx, dy] at full windup and at the impact frame. */
/** Horizontal nudge so each tool's visible mass sits bottom-centre. */
const SIDE: Record<string, number> = { mouse: 0, badge: 0, usb: 0 };

const POSE: Record<string, { wind: [number, number]; strike: [number, number] }> = {
  keyboard: { wind: [-3, 3], strike: [0, -14] }, // pull back a touch, slam up-forward
  mouse: { wind: [0, 2], strike: [0, -5] }, // press, then pop up
  usb: { wind: [-2, -2], strike: [4, -12] }, // anticipation lift, recoil kick up-back
  badge: { wind: [7, 3], strike: [-24, -11] }, // pull back, swipe across the reader left
};
