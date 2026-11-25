/**
 * LOOK: the gunmetal console frame behind the pause, options and controls
 * menus. The frame itself is CSS (.cd-console in curriculum.css); this module
 * paints its two sprites, a brushed-steel grain tile and a corner screw, and
 * publishes them to CSS as `--menu-steel` and `--menu-screw`.
 */

/** Grain tile side in sprite pixels (drawn at 4x, so it repeats every 256 CSS px). */
export const STEEL_TILE = 64;
/** Screw sprite side in sprite pixels. */
export const SCREW_SIZE = 5;

/** Deterministic 0..1 hash, so the grain is the same on every load. */
export function grainNoise(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/**
 * Brushed-steel grain as [r, g, b, a] per pixel: mostly horizontal streaks
 * (one tone per row) with a little per-pixel speckle. Only light or dark
 * tints at low alpha, so it reads as texture over the CSS plate bands.
 */
export function steelGrain(size = STEEL_TILE): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = grainNoise(977, y) - 0.5;
    for (let x = 0; x < size; x++) {
      const v = row * 0.7 + (grainNoise(x, y) - 0.5) * 0.3;
      const i = (y * size + x) * 4;
      const tone = v > 0 ? 255 : 0;
      data[i] = tone;
      data[i + 1] = tone;
      data[i + 2] = tone;
      data[i + 3] = Math.round(Math.min(1, Math.abs(v) * 2) * 46);
    }
  }
  return data;
}

/** Screw sprite rows: '.' clear, 'k' keyline, 'l' lit, 'm' mid, 'd' dark slot. */
export const SCREW_ROWS = ['.kkk.', 'kllmk', 'kdddk', 'kmmmk', '.kkk.'] as const;
const SCREW_TONES: Record<string, string | null> = { '.': null, k: '#0c0d10', l: '#d0d6e0', m: '#8a909c', d: '#2a2d34' };

function sprite(size: number, paint: (g: CanvasRenderingContext2D) => void): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return 'none';
  paint(g);
  return `url(${c.toDataURL('image/png')})`;
}

let installed = false;

/** Publish the frame sprites to CSS. Runs once. */
export function installMenuArt(root: HTMLElement = document.documentElement): void {
  if (installed) return;
  installed = true;
  root.style.setProperty('--menu-steel', sprite(STEEL_TILE, (g) => {
    const image = g.createImageData(STEEL_TILE, STEEL_TILE);
    image.data.set(steelGrain());
    g.putImageData(image, 0, 0);
  }));
  root.style.setProperty('--menu-screw', sprite(SCREW_SIZE, (g) => {
    SCREW_ROWS.forEach((row, y) => [...row].forEach((ch, x) => {
      const tone = SCREW_TONES[ch];
      if (!tone) return;
      g.fillStyle = tone;
      g.fillRect(x, y, 1, 1);
    }));
  }));
}

/** The console frame element; installs its sprites on first use. */
export function consoleFrame(): HTMLElement {
  installMenuArt();
  const frame = document.createElement('div');
  frame.className = 'cd-console';
  return frame;
}
