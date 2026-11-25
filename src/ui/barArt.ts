import { BASE_STATUS, BASE_W, RES, VIEW_W } from '../render/res';
import { BAR_PANELS, P_AMMO, P_CRED, P_FACE, P_INT, P_OBJ, P_RES, P_TOOLS, type Panel } from './barLayout';

/**
 * LOOK: the static art under the status bar. A brushed gunmetal plate with a
 * bronze top trim (the same steel and bronze as the menu plates), and one
 * bezelled glass readout per panel. Geometry comes from barLayout.ts, so the
 * wells sit exactly where the bar text is laid out.
 */

/** Plate tones, lit top to shaded bottom. */
export const BAR_PLATE_BANDS: readonly [number, number, number][] = [
  [92, 97, 108],
  [80, 85, 96],
  [68, 73, 83],
  [57, 61, 70],
  [46, 49, 57],
];

/** Faint glass tint per readout, as an "r,g,b" triple. */
const WELL_TINT = new Map<Panel, string>([
  [P_INT, '255,70,40'],
  [P_AMMO, '255,176,40'],
  [P_TOOLS, '110,150,230'],
  [P_FACE, '110,150,230'],
  [P_CRED, '110,150,230'],
  [P_RES, '255,176,40'],
  [P_OBJ, '70,240,110'],
]);

const WELL_INSET_X = 3;
const WELL_TINT_ALPHA = 0.1;
const SCANLINE_ALPHA = 0.16;

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Recessed readout of a panel, in base units relative to the bar's top edge.
 * The RES column is taller so its four labelled rows fill the panel.
 */
export function wellRect(p: Panel): Rect {
  const x = p[0] + WELL_INSET_X;
  const w = p[1] - WELL_INSET_X * 2;
  if (p === P_RES) return { x, y: 2, w, h: BASE_STATUS - 3 };
  // the BADGE caption sits above the keycard, so this readout starts higher
  if (p === P_CRED) return { x, y: 2, w, h: BASE_STATUS - 6 };
  return { x, y: 4, w, h: BASE_STATUS - 8 };
}

/** Plate band for a native row: five flat steps down the bar. */
export function plateBand(row: number, rows: number): number {
  return Math.min(BAR_PLATE_BANDS.length - 1, Math.floor((row / rows) * BAR_PLATE_BANDS.length));
}

function paintPlate(g: CanvasRenderingContext2D, w: number, h: number): void {
  let s = 1337;
  const r = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const image = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const [br, bg, bb] = BAR_PLATE_BANDS[plateBand(y, h)];
    // brushed steel: each row has its own grain, with a little per-pixel noise
    const row = Math.floor(r() * 9) - 4;
    let streak = 0;
    for (let x = 0; x < w; x++) {
      if (streak === 0 && r() < 0.0016) streak = 12 + Math.floor(r() * 40);
      const scratch = streak > 0 ? 14 : 0;
      if (streak > 0) streak--;
      const v = row + Math.floor(r() * 5) - 2 + scratch;
      const i = (y * w + x) * 4;
      image.data[i] = br + v;
      image.data[i + 1] = bg + v;
      image.data[i + 2] = bb + v;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
}

function paintTrim(g: CanvasRenderingContext2D, u: number): void {
  // bronze strip along the top edge, keyline under it
  g.fillStyle = '#e8c88a';
  g.fillRect(0, 0, BASE_W, u);
  g.fillStyle = '#b08848';
  g.fillRect(0, u, BASE_W, u);
  g.fillStyle = '#6a4c22';
  g.fillRect(0, 2 * u, BASE_W, u);
  g.fillStyle = '#0c0d10';
  g.fillRect(0, 3 * u, BASE_W, u);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(0, 4 * u, BASE_W, u);
  g.fillStyle = '#0c0d10';
  g.fillRect(0, BASE_STATUS - 2 * u, BASE_W, 2 * u);
}

function paintScrew(g: CanvasRenderingContext2D, x: number, y: number, u: number): void {
  g.fillStyle = '#0e0f12';
  g.fillRect(x - u, y - u, 5 * u, 5 * u);
  g.fillStyle = '#8f96a3';
  g.fillRect(x, y, 3 * u, 3 * u);
  g.fillStyle = '#d6dbe4';
  g.fillRect(x, y, 2 * u, u);
  g.fillRect(x, y, u, 2 * u);
  g.fillStyle = '#2a2d34';
  g.fillRect(x, y + u, 3 * u, u);
}

function paintWell(g: CanvasRenderingContext2D, p: Panel, u: number): void {
  const { x, y, w, h } = wellRect(p);
  // raised bezel one unit wide: lit top and left, shaded bottom and right
  g.fillStyle = '#3c4049';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#aab0bc';
  g.fillRect(x - 1, y - 1, w + 2, u);
  g.fillStyle = '#8a909c';
  g.fillRect(x - 1, y - 1, u, h + 2);
  g.fillStyle = '#16171b';
  g.fillRect(x - 1, y + h + 1 - u, w + 2, u);
  g.fillStyle = '#202227';
  g.fillRect(x + w + 1 - u, y - 1, u, h + 2);
  // glass
  g.fillStyle = '#0c0e12';
  g.fillRect(x, y, w, h);
  const depth = g.createLinearGradient(0, y, 0, y + h);
  depth.addColorStop(0, 'rgba(0,0,0,0.5)');
  depth.addColorStop(0.35, 'rgba(0,0,0,0)');
  depth.addColorStop(1, 'rgba(120,130,150,0.1)');
  g.fillStyle = depth;
  g.fillRect(x, y, w, h);
  const tint = WELL_TINT.get(p);
  if (tint) {
    const glow = g.createLinearGradient(0, y, 0, y + h);
    glow.addColorStop(0, `rgba(${tint},0)`);
    glow.addColorStop(0.6, `rgba(${tint},${WELL_TINT_ALPHA})`);
    glow.addColorStop(1, `rgba(${tint},${WELL_TINT_ALPHA * 0.4})`);
    g.fillStyle = glow;
    g.fillRect(x, y, w, h);
  }
  // scanlines on every other native row
  g.fillStyle = `rgba(0,0,0,${SCANLINE_ALPHA})`;
  for (let ry = y; ry < y + h; ry += 2 * u) g.fillRect(x, ry, w, u);
  // inner shadow under the bezel, and a catch-light on the bottom lip
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(x, y, w, 2 * u);
  g.fillRect(x, y, u, h);
  g.fillStyle = 'rgba(190,200,220,0.2)';
  g.fillRect(x + u, y + h - u, w - u, u);
  // glass sheen across the top-left corner
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.beginPath();
  g.moveTo(x + u, y + 2 * u);
  g.lineTo(x + Math.min(w * 0.55, 16), y + 2 * u);
  g.lineTo(x + u, y + Math.min(h * 0.5, 10));
  g.closePath();
  g.fill();
}

/** Static bar art, painted once at native resolution. */
export function paintBarBackground(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = BASE_STATUS * RES;
  const g = c.getContext('2d')!;
  paintPlate(g, c.width, c.height);
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const u = 1 / RES;
  paintTrim(g, u);
  for (const p of BAR_PANELS) {
    const [x, w] = p;
    // seam between panels: a dark groove with a lit far edge
    if (x > 0) {
      g.fillStyle = '#101114';
      g.fillRect(x - u, 1, 2 * u, BASE_STATUS - 1.5);
      g.fillStyle = 'rgba(210,216,228,0.35)';
      g.fillRect(x + u, 1, u, BASE_STATUS - 1.5);
    }
    paintWell(g, p, u);
    // the RES readout fills its panel, so it has no room for screws
    if (p !== P_RES) {
      for (const sx of [x + 1.25, x + w - 2]) {
        if (p !== P_CRED) paintScrew(g, sx, 1.5, u);
        paintScrew(g, sx, BASE_STATUS - 2.5, u);
      }
    }
  }
  return c;
}
