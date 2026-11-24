import { drawText, measureText } from './font';
import { bevel, grime, noiseFill, type PaintCtx, type Painter } from './pixel';

/**
 * LOOK (P1-11 texture variety): office-corridor wall alternates and decals.
 *
 * M01/M03/M04 corridors are one wall family ('wall-office') end to end, and
 * that family carried no decals, so long runs read as one repeated tile. The
 * alternates keep the base's frosted transom (rows 8-24), aluminium rails
 * (24, 48), wood wainscot (50-74) and kick plate, so a run stays continuous,
 * and swap the mid-wall band for a notice board, a fire-hose cabinet or a
 * service column. Decals add a ceiling cable drop, a "lock your screen"
 * policy plaque and a water stain.
 *
 * Painters are built from the shared texture helpers passed in (`kit`) so
 * this module has no import cycle with textures.ts. Everything draws through
 * the seeded PaintCtx, so the gen-worker pipeline stays byte-identical.
 * Decal painters use only opaque colours: a partially transparent decal
 * texel would land in the shader's fullbright alpha band.
 */
export interface PaintKit {
  kickPlate(g: CanvasRenderingContext2D, trim: string): void;
  vShade(g: CanvasRenderingContext2D, y0: number, y1: number, rgb: string, a0: number, a1: number, x0?: number, w?: number): void;
  seam(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void;
  bolt(g: CanvasRenderingContext2D, x: number, y: number): void;
  drip(g: CanvasRenderingContext2D, x: number, y0: number, len: number, rgb?: string): void;
}

/** Alternate families mixed into 'wall-office' runs. */
export const OFFICE_WALL_ALTS = ['wall-office2', 'wall-office3', 'wall-office4'] as const;
/** New office decals (pooled by the office and bullpen themes). */
export const OFFICE_DECALS = ['decal-cable-drop', 'decal-sign-lock', 'decal-stain'] as const;

/** The 'wall-office' skeleton every alternate shares, so runs stay continuous. */
function officeBase(p: PaintCtx, kit: PaintKit): void {
  const { g } = p;
  noiseFill(p, [126, 122, 114], 7);
  g.fillStyle = '#384654';
  g.fillRect(0, 8, 64, 16);
  noiseFill(p, [152, 178, 196], 8, 1, 2, 10, 28, 12);
  noiseFill(p, [152, 178, 196], 8, 1, 34, 10, 28, 12);
  g.fillStyle = '#8b94a0';
  g.fillRect(0, 24, 64, 2);
  g.fillRect(0, 48, 64, 2);
  noiseFill(p, [98, 68, 42], 10, 1, 0, 50, 64, 24);
  for (let x = 0; x < 64; x += 6) {
    g.fillStyle = 'rgba(34,20,10,0.55)';
    g.fillRect(x, 50, 1, 24);
    g.fillStyle = 'rgba(180,136,88,0.22)';
    g.fillRect(x + 1, 50, 1, 24);
  }
  kit.kickPlate(g, '#4a6e8c');
  kit.vShade(g, 0, 6, '18,22,26', 0.25, 0);
}

/** Cork notice board with pinned memos between the rails. */
function noticeBoard(p: PaintCtx, kit: PaintKit): void {
  const { g, glow } = p;
  officeBase(p, kit);
  bevel(g, 8, 27, 48, 20, '#6a4a2a', '#a07850', '#2a1a0a');
  noiseFill(p, [150, 104, 62], 18, 1, 9, 28, 46, 18);
  const papers: [number, number, number, number, string][] = [
    [11, 29, 9, 11, '#e8e4d8'], [22, 30, 10, 8, '#f0d860'], [34, 29, 8, 12, '#dfe6ee'],
    [44, 31, 9, 9, '#f2b8c0'], [24, 39, 8, 6, '#e8e4d8'],
  ];
  for (const [x, y, w, h, c] of papers) {
    g.fillStyle = '#3a2614';
    g.fillRect(x + 1, y + 1, w, h);
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
    for (let ly = y + 3; ly < y + h - 1; ly += 2) {
      g.fillStyle = '#6a6e78';
      g.fillRect(x + 1, ly, Math.max(2, Math.floor(w * (0.5 + p.rnd() * 0.4))), 1 / p.s);
    }
    g.fillStyle = p.rnd() < 0.5 ? '#d02a20' : '#2a62d0';
    g.fillRect(x + Math.floor(w / 2), y, 1, 1);
  }
  drawText(g, 'MFA!', 35, 33, '#c02020', 'tiny', null);
  // small badge-reader LED by the board (fullbright)
  g.fillStyle = '#20e060';
  g.fillRect(58, 36, 1, 1);
  glow.fillStyle = '#fff';
  glow.fillRect(58, 36, 1, 1);
  grime(p, 'rgba(20,16,12,0.25)', 50);
}

/** Recessed red fire-hose cabinet with a glass door. */
function hoseCabinet(p: PaintCtx, kit: PaintKit): void {
  const { g } = p;
  officeBase(p, kit);
  bevel(g, 18, 20, 28, 46, '#8a1a14', '#e04838', '#3a0806');
  g.fillStyle = '#1c0806';
  g.fillRect(21, 23, 22, 34);
  // hose reel behind the glass
  for (let r = 0; r < 4; r++) {
    g.fillStyle = r % 2 ? '#b02a1c' : '#d8482c';
    g.fillRect(23 + r, 28 + r, 18 - r * 2, 2);
    g.fillRect(23 + r, 46 - r, 18 - r * 2, 2);
    g.fillRect(23 + r, 28 + r, 2, 20 - r * 2);
    g.fillRect(39 - r, 28 + r, 2, 20 - r * 2);
  }
  g.fillStyle = '#c8c8d0';
  g.fillRect(31, 36, 3, 3);
  // glass glare + label
  g.fillStyle = 'rgba(220,240,255,0.22)';
  g.fillRect(22, 24, 3, 32);
  g.fillStyle = '#f0e8e0';
  g.fillRect(21, 58, 22, 6);
  const w = measureText('FIRE', 'tiny');
  drawText(g, 'FIRE', 32 - Math.floor(w / 2), 59, '#a01010', 'tiny', null);
  kit.bolt(g, 19, 21);
  kit.bolt(g, 43, 21);
  grime(p, 'rgba(20,16,12,0.25)', 50);
}

/** Painted service column: conduit, outlet, thermostat. */
function serviceColumn(p: PaintCtx, kit: PaintKit): void {
  const { g, glow } = p;
  officeBase(p, kit);
  noiseFill(p, [108, 110, 112], 8, 1, 24, 0, 16, 66);
  kit.seam(g, 24, 0, 24, 66);
  kit.seam(g, 40, 0, 40, 66);
  g.fillStyle = '#5a6068';
  g.fillRect(36, 0, 2, 66);
  g.fillStyle = '#a8b0b8';
  g.fillRect(36, 0, 1 / p.s, 66);
  // thermostat
  bevel(g, 27, 30, 8, 10, '#d8d8d0', '#ffffff', '#7a7a72');
  g.fillStyle = '#183018';
  g.fillRect(28, 32, 6, 3);
  g.fillStyle = '#60ff80';
  g.fillRect(29, 33, 3, 1);
  glow.fillStyle = '#fff';
  glow.fillRect(29, 33, 3, 1);
  // twin outlet low on the column
  bevel(g, 28, 56, 6, 8, '#e0dcd0', '#ffffff', '#88847a');
  g.fillStyle = '#1a1a1a';
  for (const y of [58, 61]) {
    g.fillRect(29, y, 1, 1);
    g.fillRect(32, y, 1, 1);
  }
  kit.drip(g, 31, 41, 12, '30,26,20');
  grime(p, 'rgba(20,16,12,0.25)', 50);
}

/** Ceiling cable drop: a bundled run into a junction box. */
function cableDropDecal(p: PaintCtx, kit: PaintKit): void {
  const { g } = p;
  const cols = ['#c84830', '#30a0d8', '#d8b018', '#40a050', '#8a8a96'];
  for (let k = 0; k < cols.length; k++) {
    g.fillStyle = cols[k];
    g.fillRect(44 + k, 0, 1, 30 + (k % 2));
  }
  for (const y of [4, 14, 24]) {
    g.fillStyle = '#10131a';
    g.fillRect(43, y, 7, 2);
  }
  bevel(g, 40, 30, 14, 10, '#2c3038', '#6a7282', '#101218');
  g.fillStyle = '#ffb010';
  g.fillRect(43, 33, 2, 1);
  g.fillStyle = '#0c0e12';
  g.fillRect(47, 34, 4, 3);
  kit.bolt(g, 41, 31);
  kit.bolt(g, 51, 37);
}

/** Policy plaque: LOCK YOUR SCREEN, with a padlock glyph. */
function lockSignDecal(p: PaintCtx): void {
  const { g } = p;
  bevel(g, 14, 28, 36, 18, '#1c3a78', '#5a86d8', '#0a1430');
  g.fillStyle = '#e8eef8';
  g.fillRect(17, 31, 7, 6);
  g.fillStyle = '#1c3a78';
  g.fillRect(19, 33, 3, 3);
  g.fillStyle = '#e8eef8';
  g.fillRect(18, 29, 1, 3);
  g.fillRect(22, 29, 1, 3);
  g.fillRect(18, 28, 5, 1);
  drawText(g, 'LOCK', 26, 30, '#ffffff', 'tiny', null);
  drawText(g, 'YOUR', 26, 36, '#ffffff', 'tiny', null);
  drawText(g, 'SCREEN', 18, 41, '#ffd040', 'tiny', null);
}

/** Water stain: an opaque stipple blob bleeding down from the transom. */
function stainDecal(p: PaintCtx): void {
  const { g } = p;
  const u = 1 / p.s;
  const cx = 30;
  const cy = 30;
  for (let i = 0; i < 900; i++) {
    const a = p.rnd() * Math.PI * 2;
    const r = Math.sqrt(p.rnd());
    const x = cx + Math.cos(a) * r * 14;
    const y = cy + Math.sin(a) * r * 9 + (r * r) * 4;
    // denser and darker toward the centre, stippled toward the rim
    if (p.rnd() > 1.15 - r) {
      g.fillStyle = r < 0.55 ? '#4a3a26' : '#5e4c34';
      g.fillRect(Math.floor(x / u) * u, Math.floor(y / u) * u, u, u);
    }
  }
  // tide-mark ring
  for (let k = 0; k < 140; k++) {
    const a = (k / 140) * Math.PI * 2;
    g.fillStyle = '#3a2c1a';
    g.fillRect(Math.floor((cx + Math.cos(a) * 14) / u) * u, Math.floor((cy + Math.sin(a) * 9 + 3) / u) * u, u, u);
  }
  // runs below the blob — opaque stipple, no alpha fade
  for (const x of [26, 33]) {
    for (let y = 40; y < 52; y++) {
      if (p.rnd() < 0.7) {
        g.fillStyle = '#4a3a26';
        g.fillRect(x + (y % 4 === 1 ? u : 0), y, u, 1);
      }
    }
  }
}

/** Office painters keyed by texture id, built from the shared helper kit. */
export function officeTextures(kit: PaintKit): { walls: Record<string, Painter>; decals: Record<string, Painter> } {
  return {
    walls: {
      'wall-office2': (p) => noticeBoard(p, kit),
      'wall-office3': (p) => hoseCabinet(p, kit),
      'wall-office4': (p) => serviceColumn(p, kit),
    },
    decals: {
      'decal-cable-drop': (p) => cableDropDecal(p, kit),
      'decal-sign-lock': (p) => lockSignDecal(p),
      'decal-stain': (p) => stainDecal(p),
    },
  };
}
