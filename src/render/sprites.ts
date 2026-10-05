import * as THREE from 'three';
import { Registry } from '../core/registry';
import { drawText } from './font';
import { packTexture, paintRaw, pxEllipse, type PaintCtx } from './pixel';

/**
 * Procedural billboard sprite sets. Every entity sprite id maps to a SpriteSet
 * with named frames (walk/attack/rotations) and a world-space size. Frames are
 * outlined + auto-shaded pixel art; glow layers render fullbright.
 */

export interface SpriteSet {
  /** World size in tiles (height; width follows the canvas aspect). */
  w: number;
  h: number;
  frames: Record<string, THREE.Texture>;
  /** How the renderer animates it. */
  anim: 'monster' | 'person' | 'flicker' | 'static';
}

export const spriteRegistry = new Registry<THREE.Texture>();
export const spriteSets = new Registry<SpriteSet>();

type Draw = (p: PaintCtx) => void;

interface FrameSpec {
  key: string;
  draw: Draw;
  mirror?: boolean;
}

function makeSet(id: string, cw: number, ch: number, worldH: number, anim: SpriteSet['anim'], frames: FrameSpec[], dissolve = false): SpriteSet {
  const out: Record<string, THREE.Texture> = {};
  let firstRaw: ReturnType<typeof paintRaw> | null = null;
  for (const f of frames) {
    const raw = paintRaw(cw, ch, `${id}:${f.key}`, f.draw);
    if (!firstRaw) firstRaw = raw;
    out[f.key] = packTexture(cw, ch, raw, { sprite: true, shade: true, mirror: f.mirror });
  }
  if (anim === 'monster' && firstRaw) out.pain = painFrame(cw, ch, firstRaw);
  if (dissolve && firstRaw) {
    for (let k = 0; k < 4; k++) out[`die${k}`] = dissolveFrame(cw, ch, firstRaw, k, id);
  }
  const set: SpriteSet = { w: (worldH * cw) / ch, h: worldH, frames: out, anim };
  spriteSets.register(id, set);
  spriteRegistry.register(id, out[frames[0].key]);
  return set;
}

/** Pain frame: recoils up/back 2px and flares hot white-red. */
function painFrame(w: number, h: number, raw: ReturnType<typeof paintRaw>): THREE.Texture {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (raw.rgba[i + 3] < 128) continue;
      const nx = Math.min(w - 1, x + (y < h / 2 ? 1 : 0));
      const ny = Math.max(0, y - 2);
      const o = (ny * w + nx) * 4;
      rgba[o] = Math.min(255, raw.rgba[i] * 0.6 + 120);
      rgba[o + 1] = Math.min(255, raw.rgba[i + 1] * 0.6 + 60);
      rgba[o + 2] = Math.min(255, raw.rgba[i + 2] * 0.6 + 50);
      rgba[o + 3] = 255;
      glow[o + 3] = raw.glow[i + 3];
    }
  }
  return packTexture(w, h, { rgba, glow }, { sprite: true, shade: true });
}

/** "Quarantine" death: the sprite breaks into green fullbright pixels and scatters. */
function dissolveFrame(w: number, h: number, raw: ReturnType<typeof paintRaw>, k: number, seed: string): THREE.Texture {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8ClampedArray(w * h * 4);
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
  const rnd = () => ((s = (s * 1103515245 + 12345) | 0) >>> 8) / 16777216;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (raw.rgba[i + 3] < 128) continue;
      if (rnd() < 0.18 + k * 0.24) continue;
      // fall/scatter downward
      const ny = Math.min(h - 1, y + Math.floor(k * k * 2 * rnd()));
      const nx = Math.max(0, Math.min(w - 1, x + Math.round((rnd() - 0.5) * k * 4)));
      const o = (ny * w + nx) * 4;
      const t = Math.min(1, 0.35 + k * 0.25);
      rgba[o] = raw.rgba[i] * (1 - t) + 44 * t;
      rgba[o + 1] = raw.rgba[i + 1] * (1 - t) + 255 * t;
      rgba[o + 2] = raw.rgba[i + 2] * (1 - t) + 90 * t;
      rgba[o + 3] = 255;
      if (k >= 1) glow[o + 3] = 255;
    }
  }
  return packTexture(w, h, { rgba, glow }, { sprite: true, outline: null });
}

function lit(p: PaintCtx, color: string, x: number, y: number, w: number, h: number): void {
  p.g.fillStyle = color;
  p.g.fillRect(x, y, w, h);
  p.glow.fillStyle = '#fff';
  p.glow.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- malware

function worm(phase: number, attack: boolean): Draw {
  return (p) => {
    const { g } = p;
    const segs = 6;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const x = 32 + Math.sin(i * 1.1 + phase) * (3 + t * 3) + (attack ? t * t * 6 : 0);
      const y = 58 - t * (attack ? 34 : 38);
      const r = 9 - t * 2.5;
      pts.push([x, y, r]);
    }
    for (let i = 0; i < segs; i++) {
      const [x, y, r] = pts[i];
      pxEllipse(g, x, y, r + 1, r * 0.8, '#5a0c08');
      pxEllipse(g, x, y - 1, r, r * 0.72, i % 2 ? '#c42a1a' : '#a8200f');
      pxEllipse(g, x - 1, y + 1, r * 0.55, r * 0.3, '#f07a4a');
      // spines
      g.fillStyle = '#2a0604';
      g.fillRect(Math.round(x - 1), Math.round(y - r * 0.8 - 3), 2, 3);
    }
    // head
    const [hx, hy] = [pts[segs - 1][0], pts[segs - 1][1] - 8];
    pxEllipse(g, hx, hy, 11, 9, '#b8200f');
    pxEllipse(g, hx, hy + 3, 8, 4, '#7a1208');
    // mandibles
    g.fillStyle = '#ecd8a8';
    g.fillRect(Math.round(hx - 10), Math.round(hy + 4), 3, 7);
    g.fillRect(Math.round(hx + 7), Math.round(hy + 4), 3, 7);
    g.fillRect(Math.round(hx - 8), Math.round(hy + 10), 3, 2);
    g.fillRect(Math.round(hx + 5), Math.round(hy + 10), 3, 2);
    if (attack) {
      pxEllipse(g, hx, hy + 5, 5, 4, '#200000');
      lit(p, '#ff4020', Math.round(hx - 3), Math.round(hy + 4), 6, 3);
    }
    // glowing compound eyes
    lit(p, '#ffe040', Math.round(hx - 7), Math.round(hy - 3), 4, 3);
    lit(p, '#ffe040', Math.round(hx + 3), Math.round(hy - 3), 4, 3);
    lit(p, '#ffffff', Math.round(hx - 6), Math.round(hy - 3), 1, 1);
    lit(p, '#ffffff', Math.round(hx + 4), Math.round(hy - 3), 1, 1);
    // antennae
    g.fillStyle = '#2a0604';
    g.fillRect(Math.round(hx - 5), Math.round(hy - 14), 1, 6);
    g.fillRect(Math.round(hx + 5), Math.round(hy - 14), 1, 6);
    lit(p, '#ff6030', Math.round(hx - 6), Math.round(hy - 16), 3, 2);
    lit(p, '#ff6030', Math.round(hx + 4), Math.round(hy - 16), 3, 2);
  };
}

function trojan(phase: number, attack: boolean): Draw {
  return (p) => {
    const { g } = p;
    const lift = attack ? 14 : 2 + Math.round(Math.abs(Math.sin(phase)) * 3);
    // spider legs (the giveaway)
    g.fillStyle = '#16101c';
    for (let k = 0; k < 3; k++) {
      const sw = (k + (phase > 1.5 ? 1 : 0)) % 2 ? 2 : -2;
      g.fillRect(12 - k * 3 + sw, 50 + k, 6, 2);
      g.fillRect(9 - k * 3 + sw, 52 + k, 2, 8 - k);
      g.fillRect(46 + k * 3 - sw, 50 + k, 6, 2);
      g.fillRect(53 + k * 3 - sw, 52 + k, 2, 8 - k);
    }
    // box body
    g.fillStyle = '#7a2aa8';
    g.fillRect(14, 30, 36, 24);
    g.fillStyle = '#5a1a80';
    g.fillRect(14, 48, 36, 6);
    // ribbon vertical + horizontal
    g.fillStyle = '#e8c020';
    g.fillRect(29, 30, 6, 24);
    g.fillStyle = '#b08a10';
    g.fillRect(34, 30, 1, 24);
    // interior / teeth gap
    if (attack) {
      g.fillStyle = '#1a0420';
      g.fillRect(14, 30 - lift, 36, lift);
      lit(p, '#ff40c0', 18, 30 - lift + 3, 28, lift - 5);
      g.fillStyle = '#f4f0e0';
      for (let x = 15; x < 49; x += 4) {
        g.fillRect(x, 30 - lift, 3, 4);
        g.fillRect(x + 1, 27, 3, 3);
      }
    } else {
      g.fillStyle = '#12041a';
      g.fillRect(15, 30 - lift, 34, lift);
      lit(p, '#ff60ff', 21, 30 - lift, 4, Math.max(1, lift - 1));
      lit(p, '#ff60ff', 39, 30 - lift, 4, Math.max(1, lift - 1));
    }
    // lid
    const ly = 22 - lift;
    g.fillStyle = '#8e36c4';
    g.fillRect(12, ly, 40, 9);
    g.fillStyle = '#e8c020';
    g.fillRect(29, ly, 6, 9);
    // bow
    pxEllipse(g, 25, ly - 4, 6, 4, '#f0d030');
    pxEllipse(g, 39, ly - 4, 6, 4, '#f0d030');
    pxEllipse(g, 25, ly - 4, 2, 1, '#9a7808');
    pxEllipse(g, 39, ly - 4, 2, 1, '#9a7808');
    g.fillStyle = '#c89a10';
    g.fillRect(30, ly - 6, 4, 5);
    // gift tag "FREE"
    g.fillStyle = '#f4ecd8';
    g.fillRect(40, 36, 13, 7);
    drawText(g, 'FREE', 41, 37, '#c01818', 'tiny', null);
  };
}

function ransomware(phase: number, attack: boolean): Draw {
  return (p) => {
    const { g } = p;
    const arm = attack ? -10 : Math.round(Math.sin(phase) * 3);
    // shackle horns
    g.fillStyle = '#9aa2b0';
    for (let a = 0; a <= 20; a++) {
      const t = (a / 20) * Math.PI;
      const x = 32 - Math.cos(t) * 13;
      const y = 22 - Math.sin(t) * 16;
      g.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 4);
    }
    g.fillStyle = '#d8e0ec';
    for (let a = 2; a <= 18; a += 2) {
      const t = (a / 20) * Math.PI;
      g.fillRect(Math.round(32 - Math.cos(t) * 13) - 1, Math.round(22 - Math.sin(t) * 16) - 1, 2, 1);
    }
    // chained arms
    g.fillStyle = '#6a3a0a';
    g.fillRect(6, 28 + arm, 8, 18);
    g.fillRect(50, 28 + arm, 8, 18);
    g.fillStyle = '#2a1404';
    for (let k = 0; k < 3; k++) {
      g.fillRect(4, 26 + arm - k * 2, 3, 3);
      g.fillRect(57, 26 + arm - k * 2, 3, 3);
    }
    g.fillStyle = '#9aa2b0';
    for (let y = 46 + arm; y < 62; y += 4) {
      g.fillRect(8, y, 3, 2);
      g.fillRect(53, y, 3, 2);
    }
    // padlock body
    g.fillStyle = '#d8740c';
    g.fillRect(12, 22, 40, 36);
    g.fillStyle = '#f0a030';
    g.fillRect(12, 22, 40, 3);
    g.fillStyle = '#8a4404';
    g.fillRect(12, 52, 40, 6);
    for (let y = 28; y < 52; y += 6) {
      g.fillStyle = '#b85a08';
      g.fillRect(14, y, 36, 1);
    }
    // angry brows + eyes
    g.fillStyle = '#3a1802';
    g.fillRect(17, 28, 10, 2);
    g.fillRect(37, 28, 10, 2);
    g.fillRect(25, 30, 3, 2);
    g.fillRect(36, 30, 3, 2);
    lit(p, '#ff2010', 19, 31, 6, 4);
    lit(p, '#ff2010', 39, 31, 6, 4);
    lit(p, '#ffe0a0', 21, 32, 2, 2);
    lit(p, '#ffe0a0', 41, 32, 2, 2);
    // keyhole mouth
    pxEllipse(g, 32, 41, 5, 4, '#140600');
    g.fillStyle = '#140600';
    g.fillRect(29, 43, 7, 10);
    if (attack) lit(p, '#ff3010', 30, 39, 5, 12);
    else lit(p, '#a01808', 31, 44, 3, 6);
    // ransom note scrap
    g.fillStyle = '#ece4cc';
    g.fillRect(40, 46, 10, 8);
    drawText(g, '$', 43, 47, '#1a7a20', 'tiny', null);
  };
}

// ---------------------------------------------------------------- devices

function workstation(state: 'clean' | 'infected', frame: number): Draw {
  return (p) => {
    const { g } = p;
    // desk
    g.fillStyle = '#5a4030';
    g.fillRect(2, 40, 60, 5);
    g.fillStyle = '#8a6448';
    g.fillRect(2, 40, 60, 1);
    g.fillStyle = '#3a281c';
    g.fillRect(4, 45, 4, 19);
    g.fillRect(56, 45, 4, 19);
    // tower
    g.fillStyle = '#2a2e38';
    g.fillRect(44, 46, 10, 18);
    g.fillStyle = '#4a5060';
    g.fillRect(44, 46, 10, 1);
    lit(p, state === 'clean' ? '#2cff5a' : '#ff3020', 46, 49, 2, 1);
    // monitor
    g.fillStyle = '#1c1f26';
    g.fillRect(8, 6, 44, 30);
    g.fillStyle = '#3a404c';
    g.fillRect(8, 6, 44, 1);
    g.fillRect(28, 36, 6, 4);
    g.fillRect(22, 38, 18, 2);
    // keyboard
    g.fillStyle = '#c8ccd4';
    g.fillRect(14, 37, 20, 3);
    if (state === 'clean') {
      lit(p, '#1858c8', 11, 9, 38, 24);
      lit(p, '#3a84f0', 11, 9, 38, 3);
      lit(p, '#d8e4f4', 14, 14, 18, 12);
      lit(p, '#2a64d8', 14, 14, 18, 2);
      lit(p, '#a0b8d8', 16, 18, 12, 1);
      lit(p, '#a0b8d8', 16, 21, 9, 1);
      lit(p, '#2cff5a', 36, 15, 10, 10);
      lit(p, '#ffffff', 38, 19, 2, 2);
      lit(p, '#ffffff', 40, 21, 4, 2);
    } else {
      const flash = frame === 1;
      lit(p, flash ? '#ff3020' : '#b81810', 11, 9, 38, 24);
      // skull
      lit(p, '#f4f0e0', 22, 12, 14, 11);
      lit(p, '#f4f0e0', 25, 23, 8, 4);
      lit(p, '#200000', 24, 15, 4, 4);
      lit(p, '#200000', 30, 15, 4, 4);
      lit(p, '#200000', 28, 20, 2, 2);
      // popups
      lit(p, '#ffe040', flash ? 12 : 37, flash ? 24 : 10, 11, 7);
      lit(p, '#200000', flash ? 13 : 38, flash ? 26 : 12, 9, 1);
      lit(p, '#200000', flash ? 13 : 38, flash ? 28 : 14, 6, 1);
    }
  };
}

function consoleKiosk(frame: number): Draw {
  return (p) => {
    const { g } = p;
    g.fillStyle = '#2a3038';
    g.fillRect(8, 6, 32, 58);
    g.fillStyle = '#4a5464';
    g.fillRect(8, 6, 32, 2);
    g.fillStyle = '#1a1e24';
    g.fillRect(8, 60, 32, 4);
    // screen
    g.fillStyle = '#0a1a0c';
    g.fillRect(11, 10, 26, 22);
    for (let y = 12; y < 30; y += 3) {
      const w = 6 + ((y * 7 + frame * 5) % 16);
      lit(p, '#2cff5a', 13, y, w, 1);
    }
    lit(p, '#b8ffc8', 13 + ((frame * 9) % 18), 28, 3, 2);
    // label
    g.fillStyle = '#c81e14';
    g.fillRect(11, 35, 26, 7);
    drawText(g, 'SOC', 18, 36, '#ffffff', 'tiny', null);
    // keyboard tray
    g.fillStyle = '#3a4250';
    g.fillRect(4, 45, 40, 6);
    g.fillStyle = '#7a8496';
    for (let x = 6; x < 42; x += 3) g.fillRect(x, 46, 2, 2);
    lit(p, '#ffb010', 34, 54, 3, 2);
  };
}

// ---------------------------------------------------------------- people

interface Look {
  shirt: string;
  shirtDark: string;
  pants: string;
  skin: string;
  hair: string;
  longHair: boolean;
  tie?: string;
  lanyard: string;
}

function person(look: Look, view: 'front' | 'side' | 'back', step: number): Draw {
  return (p) => {
    const { g } = p;
    const cx = 16;
    const legSwing = step === 0 ? 0 : step === 1 ? 2 : -2;
    // legs
    g.fillStyle = look.pants;
    if (view === 'side') {
      g.fillRect(cx - 3 + legSwing, 44, 5, 16);
      g.fillRect(cx - 2 - legSwing, 44, 5, 16);
      g.fillStyle = '#121214';
      g.fillRect(cx - 3 + legSwing, 60, 7, 3);
      g.fillRect(cx - 2 - legSwing, 60, 7, 3);
    } else {
      g.fillRect(cx - 6, 44, 5, 16 + (step === 1 ? -1 : 0));
      g.fillRect(cx + 1, 44, 5, 16 + (step === 2 ? -1 : 0));
      g.fillStyle = '#121214';
      g.fillRect(cx - 7, 60 + (step === 1 ? -1 : 0), 6, 3);
      g.fillRect(cx + 1, 60 + (step === 2 ? -1 : 0), 6, 3);
    }
    // torso
    const tw = view === 'side' ? 10 : 16;
    g.fillStyle = look.shirt;
    g.fillRect(cx - tw / 2, 22, tw, 23);
    g.fillStyle = look.shirtDark;
    g.fillRect(cx - tw / 2, 42, tw, 3);
    // arms
    if (view === 'side') {
      g.fillStyle = look.shirtDark;
      g.fillRect(cx - 2 - legSwing, 23, 5, 15);
      g.fillStyle = look.skin;
      g.fillRect(cx - 2 - legSwing, 38, 4, 4);
    } else {
      g.fillStyle = look.shirtDark;
      g.fillRect(cx - tw / 2 - 4, 23, 4, 16);
      g.fillRect(cx + tw / 2, 23, 4, 16);
      g.fillStyle = look.skin;
      g.fillRect(cx - tw / 2 - 4, 39 + (step === 1 ? 1 : 0), 4, 4);
      g.fillRect(cx + tw / 2, 39 + (step === 2 ? 1 : 0), 4, 4);
    }
    if (view === 'front') {
      // collar, tie, lanyard + badge
      g.fillStyle = look.skin;
      g.fillRect(cx - 2, 22, 4, 3);
      if (look.tie) {
        g.fillStyle = look.tie;
        g.fillRect(cx - 1, 24, 2, 12);
      }
      g.fillStyle = look.lanyard;
      g.fillRect(cx - 4, 22, 1, 9);
      g.fillRect(cx + 3, 22, 1, 9);
      g.fillStyle = '#e8ecf4';
      g.fillRect(cx - 3, 31, 6, 7);
      g.fillStyle = look.lanyard;
      g.fillRect(cx - 3, 31, 6, 2);
    }
    // head
    const hw = view === 'side' ? 9 : 10;
    const hx = cx - hw / 2 + (view === 'side' ? 1 : 0);
    g.fillStyle = look.skin;
    g.fillRect(hx, 8, hw, 13);
    g.fillRect(cx - 2, 20, 4, 2);
    // hair
    g.fillStyle = look.hair;
    g.fillRect(hx - 1, 6, hw + 2, 4);
    if (view === 'back') {
      g.fillRect(hx - 1, 6, hw + 2, look.longHair ? 22 : 14);
    } else if (view === 'side') {
      g.fillRect(hx - 1, 6, 5, look.longHair ? 22 : 9);
      g.fillStyle = look.skin;
      g.fillRect(hx + hw, 13, 2, 3); // nose
      g.fillStyle = '#16120e';
      g.fillRect(hx + hw - 3, 12, 2, 2);
      g.fillStyle = '#7a3a2a';
      g.fillRect(hx + hw - 3, 17, 3, 1);
    } else {
      if (look.longHair) {
        g.fillRect(hx - 2, 8, 3, 18);
        g.fillRect(hx + hw - 1, 8, 3, 18);
      }
      g.fillStyle = '#16120e';
      g.fillRect(hx + 2, 13, 2, 2);
      g.fillRect(hx + hw - 4, 13, 2, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(hx + 4, 15, 2, 2);
      g.fillStyle = '#7a3a2a';
      g.fillRect(hx + 3, 18, 4, 1);
    }
  };
}

function personSet(id: string, look: Look): void {
  const frames: FrameSpec[] = [];
  for (let s = 0; s < 3; s++) {
    frames.push({ key: `front${s}`, draw: person(look, 'front', s) });
    frames.push({ key: `side${s}`, draw: person(look, 'side', s) });
    frames.push({ key: `sideL${s}`, draw: person(look, 'side', s), mirror: true });
    frames.push({ key: `back${s}`, draw: person(look, 'back', s) });
  }
  makeSet(id, 32, 64, 0.98, 'person', frames);
}

// ---------------------------------------------------------------- items / fx

export function buildSprites(): void {
  if (spriteSets.ids().length > 0) return;

  makeSet('worm', 64, 64, 0.95, 'monster', [
    { key: 'walk0', draw: worm(0, false) },
    { key: 'walk1', draw: worm(1.6, false) },
    { key: 'attack', draw: worm(0.8, true) },
  ], true);
  makeSet('trojan', 64, 64, 1.05, 'monster', [
    { key: 'walk0', draw: trojan(0.3, false) },
    { key: 'walk1', draw: trojan(1.9, false) },
    { key: 'attack', draw: trojan(0, true) },
  ], true);
  makeSet('ransomware', 64, 64, 1.15, 'monster', [
    { key: 'walk0', draw: ransomware(0, false) },
    { key: 'walk1', draw: ransomware(Math.PI, false) },
    { key: 'attack', draw: ransomware(0, true) },
  ], true);

  makeSet('workstation', 64, 64, 0.82, 'static', [{ key: 'idle', draw: workstation('clean', 0) }]);
  makeSet('workstation-infected', 64, 64, 0.82, 'flicker', [
    { key: 'f0', draw: workstation('infected', 0) },
    { key: 'f1', draw: workstation('infected', 1) },
  ]);
  makeSet('console', 48, 64, 0.95, 'flicker', [
    { key: 'f0', draw: consoleKiosk(0) },
    { key: 'f1', draw: consoleKiosk(1) },
  ]);

  personSet('npc-m', {
    shirt: '#3a6ad0', shirtDark: '#24448a', pants: '#2a2c34', skin: '#e0a878', hair: '#4a3020',
    longHair: false, lanyard: '#2458d8',
  });
  personSet('npc-f', {
    shirt: '#d0661c', shirtDark: '#8a3e0c', pants: '#34303a', skin: '#f0c098', hair: '#6a2a10',
    longHair: true, lanyard: '#2458d8',
  });
  personSet('npc-suit', {
    shirt: '#2e3038', shirtDark: '#1a1b20', pants: '#1e1f24', skin: '#c88a5a', hair: '#141210',
    longHair: false, tie: '#a01818', lanyard: '#c81e14',
  });

  makeSet('usb', 32, 32, 0.26, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      pxEllipse(g, 16, 28, 11, 2, 'rgba(0,0,0,0.0)');
      g.fillStyle = '#9aa2b0';
      g.fillRect(9, 17, 6, 6);
      g.fillStyle = '#2a2e38';
      g.fillRect(10, 19, 1, 1);
      g.fillRect(13, 19, 1, 1);
      g.fillStyle = '#c81e14';
      g.fillRect(15, 15, 14, 10);
      g.fillStyle = '#ff6a4a';
      g.fillRect(15, 15, 14, 2);
      lit(p, '#ffe040', 25, 19, 2, 2);
      // "?" glint
      lit(p, '#ffe040', 5, 4, 1, 1);
      drawText(g, '?', 18, 3, '#ffe040', 'small', '#000');
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(18, 3, 5, 7);
    },
  }]);
  makeSet('charge', 32, 32, 0.36, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      g.fillStyle = '#3a404c';
      g.fillRect(9, 6, 14, 4);
      g.fillRect(9, 26, 14, 4);
      g.fillStyle = '#5a6272';
      g.fillRect(9, 6, 14, 1);
      g.fillStyle = '#20242c';
      g.fillRect(10, 10, 12, 16);
      lit(p, f ? '#7af8ff' : '#18d8f0', 12, 11, 8, 14);
      lit(p, '#ffffff', 14, 13 + f * 4, 2, 6);
      drawText(g, '+', 13, 15, '#0a3040', 'small', null);
    },
  })));
  makeSet('medkit', 32, 32, 0.3, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      g.fillStyle = '#e8ecf0';
      g.fillRect(5, 12, 22, 16);
      g.fillStyle = '#aab0b8';
      g.fillRect(5, 25, 22, 3);
      g.fillStyle = '#5a5e66';
      g.fillRect(12, 9, 8, 3);
      g.fillStyle = '#d81e1e';
      g.fillRect(14, 14, 4, 11);
      g.fillRect(10, 18, 12, 4);
    },
  }]);

  // Projectile (scanner charge) + impact puff
  makeSet('fx-scan', 16, 16, 0.24, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      pxEllipse(p.g, 8, 8, 7 - f, 7 - f, '#18a8d8');
      pxEllipse(p.g, 8, 8, 5 - f, 5 - f, '#7af8ff');
      pxEllipse(p.g, 8, 8, 2, 2, '#ffffff');
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(0, 0, 16, 16);
    },
  })));
  makeSet('fx-puff', 24, 24, 0.34, 'static', [0, 1, 2].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const r = 4 + f * 3;
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        const x = Math.round(12 + Math.cos(t) * r);
        const y = Math.round(12 + Math.sin(t) * r);
        lit(p, f === 2 ? '#2cff5a' : '#b8ffff', x, y, 2, 2);
      }
      if (f === 0) lit(p, '#ffffff', 10, 10, 4, 4);
    },
  })));

  // Ceiling-hung EXIT sign above exit tiles
  makeSet('fx-exit', 48, 16, 0.2, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      g.fillStyle = '#1a1c22';
      g.fillRect(0, 2, 48, 14);
      lit(p, '#0a3a12', 2, 4, 44, 10);
      drawText(g, 'EXIT', 6, 6, '#2cff5a', 'small', null);
      lit(p, '#2cff5a', 32, 8, 10, 2);
      lit(p, '#2cff5a', 38, 6, 2, 6);
      lit(p, '#2cff5a', 40, 7, 1, 4);
      p.glow.fillRect(6, 6, 24, 7);
      g.fillStyle = '#5a6070';
      g.fillRect(10, 0, 1, 2);
      g.fillRect(37, 0, 1, 2);
    },
  }]);
}
