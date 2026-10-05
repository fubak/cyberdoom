import * as THREE from 'three';
import { Registry } from '../core/registry';
import { drawText, measureText } from './font';
import { bevel, grime, noiseFill, packTexture, paintRaw, type PaintCtx, type Painter } from './pixel';

/**
 * Procedural pixel-art texture atlas (no binary assets).
 * Walls are 64x80 texels = 1 x WALL_H world units, so one wall cell shows the
 * texture exactly once (Doom-style 1 texel ≈ 1/64 unit). Flats are 64x64.
 * Anything painted on the glow layer renders FULLBRIGHT.
 */

export const WALL_H = 1.25;
export const WALL_TEX_W = 64;
export const WALL_TEX_H = 80;

export const textureRegistry = new Registry<THREE.Texture>();

function makeTexture(id: string, w: number, h: number, painter: Painter): THREE.Texture {
  const t = packTexture(w, h, paintRaw(w, h, id, painter));
  textureRegistry.register(id, t);
  return t;
}

const wall = (id: string, p: Painter) => makeTexture(id, WALL_TEX_W, WALL_TEX_H, p);
const flat = (id: string, p: Painter) => makeTexture(id, 64, 64, p);

const ROLE_COLORS: Record<string, { stripe: string; dark: string; light: string }> = {
  admin: { stripe: '#c81e14', dark: '#4a0a06', light: '#ff7a5a' },
  analyst: { stripe: '#2458d8', dark: '#0a1a48', light: '#8ab4ff' },
  staff: { stripe: '#d8b81e', dark: '#4a3a06', light: '#fff07a' },
};

export function roleColor(role: string | undefined): { stripe: string; dark: string; light: string } {
  return ROLE_COLORS[role ?? ''] ?? { stripe: '#2aa040', dark: '#0a3010', light: '#8aff9a' };
}

function rivet(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = '#c4ccd8';
  g.fillRect(x, y, 1, 1);
  g.fillStyle = '#20232b';
  g.fillRect(x + 1, y + 1, 1, 1);
}

function steelPanel(p: PaintCtx, x: number, y: number, w: number, h: number, base: [number, number, number]): void {
  noiseFill(p, base, 14, 1, x, y, w, h);
  const { g } = p;
  // brushed horizontal streaks
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    if (p.rnd() < 0.35) {
      g.fillStyle = `rgba(255,255,255,${0.04 + p.rnd() * 0.05})`;
      g.fillRect(x + 1, yy, w - 2, 1);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, h);
}

function hazard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical = false): void {
  g.fillStyle = '#d8b018';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#16120a';
  for (let i = -h - w; i < w + h; i += 8) {
    for (let k = 0; k < 4; k++) {
      for (let yy = 0; yy < h; yy++) {
        const xx = vertical ? i + k + (h - yy) : i + k + yy;
        if (xx >= 0 && xx < w) g.fillRect(x + xx, y + yy, 1, 1);
      }
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x, y + h - 1, w, 1);
}

export function buildTextures(): void {
  if (textureRegistry.ids().length > 0) return;

  // Office tech-panel wall: two steel plates, cable tray, cyan status strip.
  wall('wall-panel', (p) => {
    const { g } = p;
    noiseFill(p, [44, 48, 58], 10);
    steelPanel(p, 1, 2, 30, 44, [86, 92, 106]);
    steelPanel(p, 33, 2, 30, 44, [82, 88, 102]);
    // vent grille on the right plate
    for (let y = 10; y < 26; y += 2) {
      g.fillStyle = '#1c1f26';
      g.fillRect(38, y, 20, 1);
      g.fillStyle = '#a4acbc';
      g.fillRect(38, y + 1, 20, 1);
    }
    // label plate on the left plate
    bevel(g, 6, 10, 20, 9, '#2a2e38', '#5a6070', '#101218', true);
    drawText(g, 'NET', 10, 12, '#9ab0c8', 'tiny', null);
    for (const [x, y] of [[3, 4], [27, 4], [3, 42], [27, 42], [35, 4], [59, 4], [35, 42], [59, 42]]) rivet(g, x, y);
    // status light strip (fullbright)
    g.fillStyle = '#0a0c10';
    g.fillRect(0, 47, 64, 5);
    g.fillStyle = '#18d8f0';
    g.fillRect(2, 48, 60, 3);
    p.glow.fillStyle = '#fff';
    p.glow.fillRect(2, 48, 60, 3);
    g.fillStyle = '#b8fcff';
    g.fillRect(2, 49, 60, 1);
    // lower kick plate
    steelPanel(p, 1, 53, 62, 25, [64, 68, 80]);
    for (let x = 6; x < 60; x += 9) {
      g.fillStyle = '#2a2e38';
      g.fillRect(x, 58, 5, 14);
      g.fillStyle = '#5c6474';
      g.fillRect(x, 58, 5, 1);
    }
    grime(p, 'rgba(20,12,6,0.5)', 90, 0, 60, 64, 20);
    g.fillStyle = '#14161c';
    g.fillRect(0, 78, 64, 2);
  });

  // Server rack: dark chassis, 2U units, drive bays, fullbright blinkenlights.
  wall('wall-server', (p) => {
    const { g, glow } = p;
    noiseFill(p, [22, 24, 30], 8);
    // rails
    for (const x of [0, 58]) {
      g.fillStyle = '#3c414c';
      g.fillRect(x, 0, 6, 80);
      g.fillStyle = '#6c7484';
      g.fillRect(x + 1, 0, 1, 80);
      for (let y = 2; y < 80; y += 4) {
        g.fillStyle = '#0a0b0e';
        g.fillRect(x + 3, y, 2, 2);
      }
    }
    const leds = ['#2cff5a', '#ffb010', '#2ca8ff', '#2cff5a', '#ff3020'];
    for (let y = 2; y < 76; y += 10) {
      bevel(g, 7, y, 50, 9, '#2c3038', '#545a66', '#0c0d10');
      // drive bays
      for (let x = 9; x < 38; x += 7) {
        g.fillStyle = '#16181d';
        g.fillRect(x, y + 2, 6, 5);
        g.fillStyle = '#4a505c';
        g.fillRect(x, y + 2, 6, 1);
        g.fillStyle = '#7c8494';
        g.fillRect(x + 4, y + 5, 1, 1);
      }
      // led cluster
      for (let k = 0; k < 4; k++) {
        const c = leds[Math.floor(p.rnd() * leds.length)];
        if (p.rnd() < 0.8) {
          g.fillStyle = c;
          g.fillRect(41 + k * 4, y + 3, 2, 2);
          glow.fillStyle = '#fff';
          glow.fillRect(41 + k * 4, y + 3, 2, 2);
        } else {
          g.fillStyle = '#101114';
          g.fillRect(41 + k * 4, y + 3, 2, 2);
        }
      }
      g.fillStyle = '#0e1013';
      g.fillRect(40, y + 6, 16, 1);
    }
    grime(p, 'rgba(0,0,0,0.45)', 60);
  });

  // Concrete block corridor wall with a painted stripe.
  wall('wall-brick', (p) => {
    const { g } = p;
    noiseFill(p, [34, 30, 28], 8);
    for (let row = 0; row < 8; row++) {
      const y = row * 10;
      const off = row % 2 === 0 ? 0 : 16;
      for (let x = -off; x < 64; x += 32) {
        const tint = (p.rnd() - 0.5) * 16;
        const base: [number, number, number] = row >= 5 ? [92 + tint, 52 + tint, 40 + tint] : [104 + tint, 98 + tint, 90 + tint];
        noiseFill(p, base, 18, 1, Math.max(0, x + 1), y + 1, Math.min(30, 64 - Math.max(0, x + 1)), 8);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(Math.max(0, x + 1), y + 1, 30, 1);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(Math.max(0, x + 1), y + 8, 30, 1);
      }
    }
    grime(p, 'rgba(0,0,0,0.5)', 120);
  });

  // Door tracks (jambs): hazard striped.
  wall('doortrak', (p) => {
    const { g } = p;
    noiseFill(p, [60, 62, 70], 10);
    hazard(g, 0, 0, 64, 80, true);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, 4, 80);
    g.fillRect(60, 0, 4, 80);
  });

  // Generic security door + role-coded variants.
  doorTexture('door', undefined);
  for (const role of Object.keys(ROLE_COLORS)) doorTexture(`door:${role}`, role);

  // Raised data-centre floor tiles (2x2 per cell) with perforated panels.
  flat('floor', (p) => {
    const { g } = p;
    noiseFill(p, [40, 42, 48], 6);
    for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
      const perf = (x + y) % 64 === 0;
      noiseFill(p, perf ? [62, 64, 72] : [70, 72, 80], 10, 1, x + 1, y + 1, 30, 30);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x + 1, y + 1, 30, 1);
      g.fillRect(x + 1, y + 1, 1, 30);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(x + 1, y + 30, 30, 1);
      g.fillRect(x + 30, y + 1, 1, 30);
      if (perf) {
        for (let yy = y + 5; yy < y + 28; yy += 4)
          for (let xx = x + 5; xx < x + 28; xx += 4) {
            g.fillStyle = '#1a1b20';
            g.fillRect(xx, yy, 2, 2);
          }
      }
    }
    g.fillStyle = '#16171b';
    g.fillRect(0, 0, 64, 1);
    g.fillRect(0, 0, 1, 64);
    g.fillRect(31, 0, 2, 64);
    g.fillRect(0, 31, 64, 2);
    grime(p, 'rgba(10,6,2,0.45)', 140);
  });

  // Acoustic ceiling tile + fluorescent light panel variant.
  const ceilBase = (p: PaintCtx) => {
    const { g } = p;
    noiseFill(p, [58, 58, 60], 10);
    g.fillStyle = '#26272b';
    g.fillRect(0, 0, 64, 2);
    g.fillRect(0, 0, 2, 64);
    g.fillRect(31, 0, 2, 64);
    g.fillRect(0, 31, 64, 2);
    grime(p, 'rgba(0,0,0,0.35)', 160);
  };
  flat('ceil', ceilBase);
  flat('ceil-light', (p) => {
    ceilBase(p);
    const { g, glow } = p;
    g.fillStyle = '#9aa0a8';
    g.fillRect(12, 6, 40, 52);
    g.fillStyle = '#e8f2ff';
    g.fillRect(14, 8, 36, 48);
    g.fillStyle = '#b8d0ec';
    for (let x = 18; x < 50; x += 8) g.fillRect(x, 8, 1, 48);
    glow.fillStyle = '#fff';
    glow.fillRect(14, 8, 36, 48);
  });

  // Exit pad: green chevrons, fullbright.
  flat('exit', (p) => {
    const { g, glow } = p;
    noiseFill(p, [20, 34, 24], 10);
    hazard(g, 0, 0, 64, 6);
    hazard(g, 0, 58, 64, 6);
    g.fillStyle = '#0c2a12';
    g.fillRect(6, 10, 52, 44);
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 10; i++) {
        g.fillStyle = '#2cff5a';
        g.fillRect(20 + i, 14 + k * 13 + i, 4, 2);
        g.fillRect(44 - i - 4, 14 + k * 13 + i, 4, 2);
        glow.fillStyle = '#fff';
        glow.fillRect(20 + i, 14 + k * 13 + i, 4, 2);
        glow.fillRect(44 - i - 4, 14 + k * 13 + i, 4, 2);
      }
    }
  });
}

function doorTexture(id: string, role: string | undefined): void {
  const rc = role ? roleColor(role) : { stripe: '#5a6070', dark: '#1a1c22', light: '#c0c8d8' };
  wall(id, (p) => {
    const { g, glow } = p;
    noiseFill(p, [52, 56, 64], 8);
    // two leaves
    steelPanel(p, 2, 2, 29, 70, [96, 100, 112]);
    steelPanel(p, 33, 2, 29, 70, [92, 96, 108]);
    g.fillStyle = '#121418';
    g.fillRect(31, 0, 2, 80);
    // role band across the door
    g.fillStyle = rc.dark;
    g.fillRect(2, 22, 60, 12);
    g.fillStyle = rc.stripe;
    g.fillRect(2, 23, 60, 10);
    g.fillStyle = rc.light;
    g.fillRect(2, 23, 60, 1);
    const label = role ? role.toUpperCase() : 'SECURE';
    const lw = measureText(label, 'tiny');
    drawText(g, label, 32 - Math.floor(lw / 2), 26, '#ffffff', 'tiny', rc.dark);
    // reinforcement bars
    for (const y of [44, 56]) {
      g.fillStyle = '#4a4e58';
      g.fillRect(4, y, 56, 3);
      g.fillStyle = '#a8b0c0';
      g.fillRect(4, y, 56, 1);
    }
    // badge reader (fullbright LED)
    bevel(g, 46, 8, 10, 12, '#1a1c22', '#6a7080', '#08090b');
    g.fillStyle = rc.light;
    g.fillRect(48, 10, 6, 2);
    glow.fillStyle = '#fff';
    glow.fillRect(48, 10, 6, 2);
    g.fillStyle = '#ff3020';
    g.fillRect(50, 15, 2, 2);
    glow.fillRect(50, 15, 2, 2);
    // hazard kick strip
    hazard(g, 2, 72, 60, 6);
    g.fillStyle = '#0c0d10';
    g.fillRect(0, 78, 64, 2);
  });
}

/** Look up a texture id, falling back to a neutral wall for unknown ids. */
export function textureOr(id: string, fallback = 'wall-panel'): THREE.Texture {
  return textureRegistry.get(id) ?? textureRegistry.require(fallback);
}

/** Door texture for a door cell; role-coded so access level reads at a glance. */
export function doorTextureFor(tex: string, accessRole: string | undefined): THREE.Texture {
  if (tex === 'door') {
    if (accessRole && !textureRegistry.get(`door:${accessRole}`)) doorTexture(`door:${accessRole}`, accessRole);
    return textureRegistry.get(accessRole ? `door:${accessRole}` : 'door')!;
  }
  return textureOr(tex, 'door');
}
