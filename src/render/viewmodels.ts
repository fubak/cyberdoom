import type { Gender, ToolDef, ViewmodelAnim } from '../core/types';
import { usePhase, vmLine } from '../tools/anim';
import { currentSkin } from '../tools/look';
import { shade } from '../tools/pixel';

/**
 * LOOK: Doom-style first-person tool viewmodels. Each tool is pixel-painted
 * once per (tool, gender, pose) into a small offscreen canvas with a dark
 * 1px outline, then blitted every frame with walk bob and use-recoil.
 * The USB scanner gets a fullbright muzzle flash when it fires.
 */
type Px = (c: string, x: number, y: number, w?: number, h?: number) => void;
interface Art {
  c: HTMLCanvasElement;
  /** anchor: x is centre, y is the canvas bottom */
  ox: number;
  /** first opaque row (after the outline pass) */
  top: number;
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

function paint(w: number, h: number, ox: number, fn: (px: Px) => void): Art {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const px: Px = (col, x, y, ww = 1, hh = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, ww, hh);
  };
  fn(px);
  // 1px dark outline around every opaque region
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 0) continue;
      const solid = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] > 0;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        out[i] = 8;
        out[i + 1] = 6;
        out[i + 2] = 10;
        out[i + 3] = 255;
      }
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
  let top = 0;
  while (top < h && !out.subarray(top * w * 4, (top + 1) * w * 4).some((v, i) => i % 4 === 3 && v > 0)) top++;
  return { c, ox, top };
}

/** A hand gripping from below: fingers wrap forward over an object edge. */
function hand(px: Px, x: number, y: number, gender: Gender, mirror = false): void {
  const s = SKIN[gender];
  const cf = CUFF[gender];
  const fw = gender === 'female' ? 4 : 5;
  // forearm + cuff going off-screen bottom
  px(s[1], x + 2, y + 10, 18, 30);
  px(s[0], x + 4, y + 10, 8, 30);
  px(s[2], mirror ? x + 2 : x + 17, y + 10, 3, 30);
  px(cf[1], x, y + 26, 22, 14);
  px(cf[0], x, y + 26, 22, 2);
  px(cf[2], x, y + 38, 22, 2);
  px(cf[2], mirror ? x : x + 19, y + 28, 3, 10);
  // knuckles / fingers
  for (let i = 0; i < 4; i++) {
    const fx = x + 1 + i * (fw + 0);
    px(s[1], fx, y, fw - 1, 12);
    px(s[0], fx, y, fw - 2, 3);
    px(s[2], fx + fw - 2, y + 2, 1, 9);
    px(s[3], fx, y + 11, fw - 1, 1);
    if (gender === 'female') px('#c83a6a', fx, y, fw - 1, 1);
  }
  // thumb
  const tx = mirror ? x + 18 : x - 3;
  px(s[1], tx, y + 4, 6, 9);
  px(s[0], tx + 1, y + 4, 3, 3);
  px(s[2], tx, y + 12, 6, 1);
}

function keyboardArt(gender: Gender, fire: boolean): Art {
  // compact board (~25% of view width with hands), like Doom's pistol-sized footprint
  return paint(80, 50, 40, (px) => {
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
    hand(px, 3, 12, gender, false);
    hand(px, 55, 12, gender, true);
  });
}

function mouseArt(gender: Gender, fire: boolean): Art {
  const s = SKIN[gender];
  return paint(72, 84, 36, (px) => {
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
    px(s[1], 18, 40, 36, 22);
    px(s[0], 22, 40, 18, 6);
    px(s[2], 48, 42, 6, 20);
    for (let i = 0; i < 3; i++) {
      const fx = 21 + i * 9 + (fire && i === 0 ? 0 : 0);
      px(s[1], fx, 26 + (fire && i === 0 ? 2 : 0), 7, 16);
      px(s[0], fx + 1, 26 + (fire && i === 0 ? 2 : 0), 4, 3);
      px(s[2], fx + 6, 28, 1, 14);
      if (gender === 'female') px('#c83a6a', fx + 1, 26 + (fire && i === 0 ? 2 : 0), 5, 1);
    }
    px(s[1], 12, 44, 8, 12); // thumb
    px(s[0], 13, 44, 4, 3);
    const cf = CUFF[gender];
    px(s[1], 22, 60, 26, 10);
    px(cf[1], 18, 68, 36, 16);
    px(cf[0], 18, 68, 36, 2);
    px(cf[2], 48, 70, 6, 14);
  });
}

function usbArt(gender: Gender, fire: boolean): Art {
  // compact stick: connector + body ride low in the view, fist below
  return paint(96, 94, 48, (px) => {
    if (fire) {
      // small hard-edged muzzle flash at the connector tip (drawn before outline pass)
      px('#5affff', 46, 8, 4, 8);
      px('#5affff', 42, 11, 12, 3);
      px('#ffffff', 47, 9, 2, 7);
      px('#ffffff', 44, 12, 8, 1);
      px('#bff8ff', 42, 8, 2, 2);
      px('#bff8ff', 52, 8, 2, 2);
    }
    // metal connector
    px('#c8ccd8', 40, 16, 16, 12);
    px('#eef0f6', 40, 16, 16, 2);
    px('#6a7288', 52, 18, 4, 10);
    px('#2a2e38', 43, 19, 4, 4);
    px('#2a2e38', 49, 19, 4, 4);
    // scanner body (dark polymer, chunky)
    px('#2a2e38', 34, 28, 28, 36);
    px('#4a5060', 34, 28, 28, 3);
    px('#4a5060', 34, 28, 3, 36);
    px('#14161c', 58, 30, 4, 34);
    for (let y = 56; y < 64; y += 3) px('#1a1c22', 36, y, 22, 1);
    // little screen + LED
    px('#0a1a14', 38, 32, 20, 11);
    px(fire ? '#8affff' : '#2ad83a', 40, 34, 16, 2);
    px(fire ? '#5affff' : '#14a024', 40, 37, 10, 1);
    px(fire ? '#5affff' : '#14a024', 40, 39, 13, 1);
    px(fire ? '#ffffff' : '#ff4a2a', 45, 45, 6, 3);
    // blue brand stripe
    px('#2458d8', 34, 50, 28, 3);
    px('#8ab4ff', 34, 50, 28, 1);
    hand(px, 30, 46, gender, false);
  });
}

function badgeArt(gender: Gender, fire: boolean): Art {
  return paint(84, 80, 42, (px) => {
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
    hand(px, 24, 44, gender, false);
  });
}

function art(tool: ToolDef, gender: Gender, fire: boolean): Art | null {
  const key = `${tool.id}:${gender}:${fire ? 1 : 0}:${currentSkin().id}`;
  let a = cache.get(key);
  if (!a) {
    const maker = { keyboard: keyboardArt, mouse: mouseArt, usb: usbArt, badge: badgeArt }[tool.id];
    if (!maker) return null;
    a = maker(gender, fire);
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
  const fire = ph ? ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.25) : cooldownFrac > 0.55;
  const a = art(tool, gender, fire);
  if (a) {
    const bx = Math.round(Math.sin(bob) * 7);
    const byy = Math.round(Math.abs(Math.cos(bob)) * 5);
    const pose = POSE[tool.id] ?? POSE.usb;
    let dx = 0;
    let dy: number;
    if (ph) {
      // windup (k<0) pulls back/down; impact (k=1) drives the tool's strike; recover eases home
      const k = ph.k;
      const s = k >= 0 ? pose.strike : pose.wind;
      dx = Math.round(s[0] * Math.abs(k));
      dy = Math.round(s[1] * Math.abs(k));
    } else dy = Math.round(cooldownFrac * (tool.id === 'usb' ? 10 : 6));
    const drop = Math.round((anim?.lower ?? 0) * (a.c.height + 10));
    const side = SIDE[tool.id] ?? 0;
    const S = VIEWMODEL_SCALE;
    const cw = Math.round(a.c.width * S);
    const ch = Math.round(a.c.height * S);
    // sit low enough that the highest pixel of either frame, at the top of the strike, stays under the line
    const lift = Math.max(0, -Math.min(pose.wind[1], pose.strike[1]));
    const artTop = Math.min(a.top, art(tool, gender, !fire)!.top) * S;
    const y0 = Math.max(h - ch + Math.round(8 * S), line - Math.floor(artTop) + lift);
    g.imageSmoothingEnabled = false;
    g.drawImage(a.c, Math.round(w / 2 - (a.ox - side) * S + bx + dx), y0 + byy + dy + drop, cw, ch);
  } else {
    tool.drawViewmodel(g, w, h, Math.sin(bob) * 2, gender, cooldownFrac, anim);
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
  return true;
}

/** Per-tool [dx, dy] at full windup and at the impact frame. */
/** Horizontal nudge so each tool's visible mass sits bottom-centre. */
const SIDE: Record<string, number> = { mouse: 0, badge: 0, usb: 0 };

const POSE: Record<string, { wind: [number, number]; strike: [number, number] }> = {
  keyboard: { wind: [0, 12], strike: [0, -22] }, // big lift and slam forward
  mouse: { wind: [0, 0], strike: [0, 3] }, // click press
  usb: { wind: [0, -3], strike: [2, 12] }, // recoil kick
  badge: { wind: [6, 6], strike: [-16, -8] }, // thrust at the reader
};
