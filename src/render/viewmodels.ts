import type { Gender, ToolDef, ViewmodelAnim } from '../core/types';
import { fireFlash, fireLamp, usePhase, vmLine } from '../tools/anim';
import { currentSkin } from '../tools/look';
import { shade } from '../tools/pixel';
import { ANALYSTS } from '../tools/look';
import { cylTone, outlineNative, painter, type Painter } from './hires';
import { RES } from './res';

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

/** Hand palette from the player's chosen skin tone (independent of gender). */
const SKIN: Record<Gender, string[]> = new Proxy({} as Record<Gender, string[]>, {
  get: () => {
    const s = currentSkin();
    return [s.highlight, s.base, s.shadow, shade(s.shadow, 0.7)];
  },
});
const CUFF: Record<Gender, string[]> = {
  male: ['#3a62c8', '#1a3a8a', '#0c1c4a'],
  female: ['#2aa8a0', '#147a74', '#0a4440'],
};

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

/** Fabric weave: a sparse diagonal twill in the shadow tone, one native pixel wide. */
function weave(P: Painter, x: number, y: number, w: number, h: number, col: string): void {
  const k = P.k;
  P.g.fillStyle = col;
  for (let yy = Math.round(y * k); yy < Math.round((y + h) * k); yy++)
    for (let xx = Math.round(x * k); xx < Math.round((x + w) * k); xx++) if ((xx + yy * 3) % 7 === 0) P.g.fillRect(xx, yy, 1, 1);
}

/**
 * One finger seen from the back, tip up: rounded tip, lit-cylinder shading,
 * nail, two knuckle creases, a little skin texture, shadow where it meets the palm.
 */
function finger(P: Painter, x: number, y: number, w: number, h: number, s: string[], nail: string | null, seed: number, flip = false): void {
  const u = 1 / P.k;
  const r = w / 2;
  P.ell(x + r, y + r, r, r, s[1]);
  P.rect(x, y + r, w, h - r, s[1]);
  const cols = Math.round(w * P.k);
  for (let i = 0; i < cols; i++) {
    const tone = cylTone(s, (i + 0.5) / cols, flip);
    if (tone === s[1]) continue;
    const dx = ((i + 0.5) * u - r) / r;
    const capTop = y + r - Math.sqrt(Math.max(0, 1 - dx * dx)) * r;
    P.rect(x + i * u, capTop + u, u, y + h - capTop - u, tone);
  }
  P.dots(x + u, y + r, w - 2 * u, h - r, shade(s[1], 0.92), 0.05, seed);
  if (nail) {
    const nw = w * 0.6;
    const nx = x + (w - nw) / 2;
    P.ell(nx + nw / 2, y + nw / 2 + u, nw / 2, nw / 2, nail);
    P.rect(nx, y + nw / 2 + u, nw, Math.max(u * 2, w * 0.4), nail);
    P.rect(nx, y + nw / 2 + u + Math.max(u * 2, w * 0.4), nw, u, shade(nail, 0.7));
    P.rect(nx + u, y + 2 * u, u, nw * 0.6, shade(nail, 1.55));
  }
  for (const f of [0.46, 0.72]) {
    const yc = y + h * f;
    P.line([[x + w * 0.22, yc], [x + w * 0.5, yc + u], [x + w * 0.78, yc]], s[2]);
    P.rect(x + w * 0.3, yc - 2 * u, w * 0.34, u, s[0]);
  }
  P.rect(x, y + h - 2 * u, w, 2 * u, s[3]);
}

/** Jacket cuff: weave, stitched hem, far-side shadow; Ray's hi-vis stripe. */
function cuff(P: Painter, x: number, y: number, w: number, h: number, gender: Gender, mirror: boolean): void {
  const cf = CUFF[gender];
  const u = 1 / P.k;
  P.rect(x, y, w, h, cf[1]);
  weave(P, x, y, w, h, shade(cf[1], 0.82));
  P.rect(x, y, w, 0.75, cf[0]);
  P.rect(x, y + 0.75, w, u, shade(cf[0], 1.25));
  for (let i = 0.5; i < w - 0.5; i += 1.25) P.rect(x + i, y + 1.75, 0.5, u, shade(cf[0], 1.15));
  P.rect(mirror ? x : x + w - 3, y + 2, 3, h - 2, cf[2]);
  P.rect(mirror ? x + 3 : x + w - 3 - u, y + 2, u, h - 2, shade(cf[2], 0.8));
  P.rect(x, y + h - 1.5, w, 1.5, cf[2]);
  if (gender === 'male') {
    P.rect(x, y + 5, w, 1, ANALYSTS.male.accent);
    P.rect(x, y + 5, w, u, shade(ANALYSTS.male.accent, 1.4));
    P.dots(x, y + 5, w, 1, '#ffffff', 0.12, 3);
  }
}

/** Lit forearm (cylinder across `w`), skin texture, Vega's smartwatch. */
function forearm(P: Painter, x: number, y: number, w: number, h: number, gender: Gender, mirror: boolean, watchY?: number): void {
  const s = SKIN[gender];
  const u = 1 / P.k;
  const cols = Math.round(w * P.k);
  for (let i = 0; i < cols; i++) P.rect(x + i * u, y, u, h, cylTone(s, (i + 0.5) / cols, mirror));
  P.dots(x, y, w, h, shade(s[1], 0.9), 0.05, 11);
  if (gender === 'male') P.dots(x + w * 0.2, y + 2, w * 0.6, h - 4, shade(s[3], 0.8), 0.018, 5);
  if (gender === 'female' && watchY !== undefined) {
    P.rect(x, watchY, w, 2.5, '#14161c');
    P.rect(x, watchY, w, u, '#3a3e48');
    const wx = x + w / 2 - 4;
    P.rect(wx, watchY - 1.5, 8, 5.5, '#20242c');
    P.rect(wx + u, watchY - 1.5, 8 - 2 * u, u, '#5a6070');
    P.rect(wx + 1, watchY - 0.5, 6, 3.5, '#0b2a2a');
    P.rect(wx + 1.5, watchY, 2.25, 0.75, ANALYSTS.female.accent);
    P.rect(wx + 1.5, watchY + 1.25, 4, u * 2, shade(ANALYSTS.female.accent, 0.7));
    P.rect(wx + 4.5, watchY, 1, 0.75, '#ff5a7a');
  }
}

/** A hand gripping from below: fingers wrap forward over an object edge. */
function hand(P: Painter, x: number, y: number, gender: Gender, mirror = false): void {
  const s = SKIN[gender];
  const fem = gender === 'female';
  const fw = fem ? 4 : 5;
  const nail = fem ? '#c83a6a' : shade(s[0], 1.06);
  forearm(P, x + 2, y + 10, 18, 30, gender, mirror, 21);
  cuff(P, x, y + 26, 22, 14, gender, mirror);
  // shadow between and under the fingers
  P.rect(x + 1, y + 3, fw * 4, 9, s[3]);
  const lift = [0.75, 0, 0.25, 1.25];
  for (let i = 0; i < 4; i++) {
    const j = mirror ? 3 - i : i;
    finger(P, x + 1 + i * fw, y + lift[j], fw - 0.5, 12 - lift[j], s, nail, i + 1, mirror);
  }
  // thumb
  const tx = mirror ? x + 18 : x - 3;
  finger(P, tx, y + 4, 6, 9, s, nail, 9, mirror);
}

function keyboardArt(gender: Gender, fire: boolean): Art {
  // compact board (~25% of view width with hands), like Doom's pistol-sized footprint
  return paint(80, 50, 40, (px, P) => {
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
    hand(P, 3, 12, gender, false);
    hand(P, 55, 12, gender, true);
  });
}

function mouseArt(gender: Gender, fire: boolean): Art {
  const s = SKIN[gender];
  return paint(72, 84, 36, (px, P) => {
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
    // palm over the shell
    const fem = gender === 'female';
    const nail = fem ? '#c83a6a' : shade(s[0], 1.06);
    const pc = Math.round(36 * P.k);
    for (let i = 0; i < pc; i++) P.rect(18 + i / P.k, 40, 1 / P.k, 22, cylTone(s, (i + 0.5) / pc));
    P.dots(18, 40, 36, 22, shade(s[1], 0.9), 0.05, 21);
    for (let i = 0; i < 3; i++) P.ell(24.5 + i * 9, 43, 2.4, 1.1, s[0]);
    P.rect(19, 40, 34, 2, s[3]);
    for (let i = 0; i < 3; i++) {
      const fy = 26 + (fire && i === 0 ? 2 : 0);
      finger(P, 21 + i * 9, fy, 7, 16, s, nail, i + 31);
    }
    finger(P, 12, 44, 8, 12, s, nail, 39);
    forearm(P, 22, 60, 26, 10, gender, false, 62);
    cuff(P, 18, 68, 36, 16, gender, false);
  });
}

function usbArt(gender: Gender, fire: boolean): Art {
  // the scanner is the shotgun-equivalent: a big chunky stick ~17% of view
  // width, connector up, hard-edged flash blooming off the tip on the fire frame
  return paint(92, 58, 46, (px, P) => {
    const cx = 46;
    if (fire) {
      px('#5affff', cx - 6, 2, 12, 9);
      px('#5affff', cx - 10, 5, 20, 4);
      px('#ffffff', cx - 3, 3, 6, 8);
      px('#ffffff', cx - 8, 6, 16, 2);
      px('#bff8ff', cx - 12, 4, 3, 3);
      px('#bff8ff', cx + 10, 4, 3, 3);
    }
    // metal connector
    px('#c8ccd8', cx - 9, 11, 18, 11);
    px('#eef0f6', cx - 9, 11, 18, 2);
    px('#6a7288', cx + 5, 13, 4, 9);
    px('#2a2e38', cx - 6, 14, 4, 4);
    px('#2a2e38', cx + 1, 14, 4, 4);
    // scanner body (dark polymer, chunky)
    px('#2a2e38', cx - 22, 22, 44, 30);
    px('#4a5060', cx - 22, 22, 44, 3);
    px('#4a5060', cx - 22, 22, 3, 30);
    px('#14161c', cx + 15, 24, 7, 28);
    for (let y = 45; y < 52; y += 3) px('#1a1c22', cx - 19, y, 34, 1);
    // little screen + LED
    px('#0a1a14', cx - 17, 26, 30, 12);
    px(fire ? '#8affff' : '#2ad83a', cx - 14, 28, 24, 2);
    px(fire ? '#5affff' : '#14a024', cx - 14, 31, 15, 1);
    px(fire ? '#5affff' : '#14a024', cx - 14, 33, 20, 1);
    px(fire ? '#ffffff' : '#ff4a2a', cx - 5, 40, 9, 3);
    // blue brand stripe
    px('#2458d8', cx - 22, 46, 44, 3);
    px('#8ab4ff', cx - 22, 46, 44, 1);
    hand(P, cx - 24, 38, gender, false);
  });
}

function badgeArt(gender: Gender, fire: boolean): Art {
  return paint(84, 80, 42, (px, P) => {
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
    hand(P, 24, 44, gender, false);
  });
}

/** Art variant: 0 rest, 1 fire pose, 2 fire pose lit in the tool's flash colour. */
function art(tool: ToolDef, gender: Gender, mode: 0 | 1 | 2): Art | null {
  const key = `${tool.id}:${gender}:${mode}:${currentSkin().id}`;
  let a = cache.get(key);
  if (!a) {
    const maker = { keyboard: keyboardArt, mouse: mouseArt, usb: usbArt, badge: badgeArt }[tool.id];
    if (!maker) return null;
    a = maker(gender, mode > 0);
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
  const a = art(tool, gender, lit ? 2 : fire ? 1 : 0);
  if (a) {
    const bx = Math.round(Math.sin(bob) * 6);
    const byy = Math.round(Math.abs(Math.cos(bob)) * 3);
    const pose = POSE[tool.id] ?? POSE.usb;
    let dx = 0;
    let dy: number;
    if (ph) {
      // windup (k<0) pulls back a touch; impact drives the strike UP and back
      // toward the camera, Doom-style — never down under the status bar
      const k = ph.k;
      const s = k >= 0 ? pose.strike : pose.wind;
      dx = Math.round(s[0] * Math.abs(k));
      dy = Math.round(s[1] * Math.abs(k));
    } else dy = -Math.round(cooldownFrac * 5); // recoil settle rides up, not down
    const drop = Math.round((anim?.lower ?? 0) * (a.c.height + 10));
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
    // downward motion (bob + pose dips) is capped so the art can never sink
    // more than SINK px under the bar — the tool rests on the bar, not in it
    const roomDown = h + SINK - (y0 + bot);
    const dyDown = Math.min(byy + dy, roomDown);
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
/** Hard limit: art never sinks more than this below the bar at any phase. */
const SINK = 4;
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
