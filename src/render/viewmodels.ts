import type { Gender, ToolDef } from '../core/types';

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
}

const cache = new Map<string, Art>();

const SKIN: Record<Gender, string[]> = {
  male: ['#f8c898', '#e0a070', '#b07848', '#704828'],
  female: ['#ffd8b0', '#f0b888', '#c88860', '#8a5838'],
};
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
  return { c, ox };
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
  return paint(176, 70, 88, (px) => {
    // keyboard in perspective: body trapezoid, rows narrower towards the top
    for (let r = 0; r < 34; r++) {
      const inset = Math.floor((34 - r) * 0.45);
      px(r < 2 ? '#8a92a8' : '#3a404c', 8 + inset, 4 + r, 160 - inset * 2, 1);
    }
    px('#1a1c22', 8, 38, 160, 4);
    const rows = 5;
    for (let row = 0; row < rows; row++) {
      const y = 7 + row * 6;
      const inset = Math.floor((rows - row) * 2.6) + 4;
      const x0 = 8 + inset;
      const x1 = 168 - inset;
      const n = 14;
      const kw = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        let cap = '#c8ccd8';
        let top = '#eef0f6';
        if (row === 4 && k > 3 && k < 10) {
          if (k !== 4) continue;
          // space bar
          const sx = Math.round(x0 + k * kw);
          px('#9aa0b0', sx, y, Math.round(kw * 6) - 1, 5);
          px('#dde0e8', sx, y, Math.round(kw * 6) - 1, 1);
          continue;
        }
        if (row === 2 && k === 13) { cap = '#2ad83a'; top = '#8aff9a'; }
        if (row === 0 && k === 0) { cap = '#e01e10'; top = '#ff7a5a'; }
        const pressed = fire && ((row === 2 && k === 13) || (row === 1 && (k === 5 || k === 9)));
        const kx = Math.round(x0 + k * kw);
        const ky = y + (pressed ? 1 : 0);
        px('#5a6070', kx, ky + 4, Math.round(kw) - 1, 1);
        px(cap, kx, ky, Math.round(kw) - 1, 4);
        px(top, kx, ky, Math.round(kw) - 1, 1);
      }
    }
    // status LEDs (Enter = "report")
    px(fire ? '#8aff9a' : '#2ad83a', 150, 5, 3, 1);
    px('#ffd040', 144, 5, 3, 1);
    hand(px, 2, 30, gender, false);
    hand(px, 152, 30, gender, true);
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
  return paint(96, 108, 48, (px) => {
    if (fire) {
      // fullbright scan burst at the connector (drawn before outline pass)
      px('#e8ffff', 38, 0, 20, 14);
      px('#5affff', 32, 4, 32, 8);
      px('#2ac8ff', 28, 6, 40, 4);
      px('#ffffff', 44, 2, 8, 10);
      px('#5affff', 46, 14, 4, 4);
    }
    // metal connector
    px('#c8ccd8', 40, 16, 16, 16);
    px('#eef0f6', 40, 16, 16, 2);
    px('#6a7288', 52, 18, 4, 14);
    px('#2a2e38', 43, 20, 4, 4);
    px('#2a2e38', 49, 20, 4, 4);
    // scanner body (dark polymer, chunky)
    px('#2a2e38', 34, 32, 28, 52);
    px('#4a5060', 34, 32, 28, 3);
    px('#4a5060', 34, 32, 3, 52);
    px('#14161c', 58, 34, 4, 50);
    // grip ridges
    for (let y = 62; y < 82; y += 4) px('#1a1c22', 36, y, 22, 1);
    // little screen + LED
    px('#0a1a14', 38, 38, 20, 14);
    px(fire ? '#8affff' : '#2ad83a', 40, 40, 16, 2);
    px(fire ? '#5affff' : '#14a024', 40, 44, 10, 1);
    px(fire ? '#5affff' : '#14a024', 40, 47, 13, 1);
    px(fire ? '#ffffff' : '#ff4a2a', 45, 55, 6, 3);
    // blue brand stripe
    px('#2458d8', 34, 58, 28, 3);
    px('#8ab4ff', 34, 58, 28, 1);
    hand(px, 30, 60, gender, false);
  });
}

function badgeArt(gender: Gender, fire: boolean): Art {
  return paint(84, 104, 42, (px) => {
    // lanyard strap
    px('#c81e14', 38, 0, 6, 24);
    px('#ff7a5a', 38, 0, 2, 24);
    px('#9aa0b0', 37, 22, 8, 5);
    // card
    px('#eef0f6', 18, 26, 46, 62);
    px('#c8ccd8', 60, 28, 4, 60);
    px('#2458d8', 18, 30, 46, 10);
    px('#8ab4ff', 18, 30, 46, 2);
    px('#8a90a0', 24, 46, 16, 20); // photo
    px('#f0b888', 28, 49, 8, 9);
    px('#3a2a1a', 27, 47, 10, 3);
    px('#2458d8', 26, 59, 12, 7);
    px('#ffd040', 44, 48, 12, 9); // chip
    px('#c89818', 44, 52, 12, 1);
    px('#c89818', 50, 48, 1, 9);
    px('#3a404c', 24, 70, 34, 2);
    px('#3a404c', 24, 74, 26, 2);
    px('#3a404c', 24, 78, 30, 2);
    if (fire) {
      px('#5aff6a', 22, 82, 38, 3);
      px('#c8ffb0', 22, 82, 38, 1);
    }
    hand(px, 24, 72, gender, false);
  });
}

function art(tool: ToolDef, gender: Gender, fire: boolean): Art | null {
  const key = `${tool.id}:${gender}:${fire ? 1 : 0}`;
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
 * Draw the current tool's viewmodel; returns false for tools without bespoke
 * art so the caller can fall back to the tool's own drawViewmodel.
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
): boolean {
  const fire = cooldownFrac > 0.55;
  const a = art(tool, gender, fire);
  if (!a) return false;
  const bx = Math.round(Math.sin(bob) * 7);
  const byy = Math.round(Math.abs(Math.cos(bob)) * 5);
  const recoil = Math.round(cooldownFrac * (tool.id === 'usb' ? 10 : tool.id === 'badge' ? -10 : 6));
  const side = tool.id === 'mouse' ? 56 : tool.id === 'badge' ? 40 : tool.id === 'usb' ? 20 : 0;
  g.drawImage(a.c, Math.round(w / 2 - a.ox + side + bx), h - a.c.height + 8 + byy + recoil);
  return true;
}
