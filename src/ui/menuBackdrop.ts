import { paintCorridor } from '../render/title';
import { BASE_H, BASE_W, RES, VIEW_H, VIEW_W } from '../render/res';

/**
 * LOOK: one backdrop behind every menu. The title's server-room corridor,
 * without the threats, pushed back into the dark so text and panels on top
 * of it keep their contrast. Before this each menu sat on its own flat
 * brown fill.
 */

/** Share of the corridor's brightness that survives at the centre and at the frame edge. */
export const BACKDROP_KEEP_CENTRE = 0.5;
export const BACKDROP_KEEP_EDGE = 0.1;
/** Vignette rings between the two. Stepped, so it stays pixel art instead of a smooth blur. */
export const BACKDROP_RINGS = 6;

/** Opacity of each ring pass: RINGS passes take the edge from KEEP_CENTRE down to KEEP_EDGE. */
export function ringAlpha(): number {
  return 1 - Math.pow(BACKDROP_KEEP_EDGE / BACKDROP_KEEP_CENTRE, 1 / BACKDROP_RINGS);
}

let cached: HTMLCanvasElement | null = null;

/** Full-resolution darkened corridor, painted once. */
export function menuBackdropCanvas(): HTMLCanvasElement {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(paintCorridor(), 0, 0);
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.fillStyle = `rgba(6,4,8,${(1 - BACKDROP_KEEP_CENTRE).toFixed(3)})`;
  g.fillRect(0, 0, BASE_W, BASE_H);
  // each pass darkens everything outside a growing ellipse, so the edge takes every pass
  g.fillStyle = `rgba(6,4,8,${ringAlpha().toFixed(3)})`;
  for (let i = 0; i < BACKDROP_RINGS; i++) {
    const k = 0.3 + (0.5 * i) / (BACKDROP_RINGS - 1);
    g.beginPath();
    g.rect(0, 0, BASE_W, BASE_H);
    g.ellipse(BASE_W / 2, BASE_H / 2, BASE_W * k, BASE_H * k, 0, 0, Math.PI * 2);
    g.fill('evenodd');
  }
  cached = c;
  return c;
}

let installed = false;

/** Publish the backdrop to CSS as `--menu-backdrop` at twice base resolution (the page scales it up unsmoothed). Runs once. */
export function installMenuBackdrop(root: HTMLElement = document.documentElement): void {
  if (installed) return;
  installed = true;
  const small = document.createElement('canvas');
  small.width = BASE_W * 2;
  small.height = BASE_H * 2;
  const g = small.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(menuBackdropCanvas(), 0, 0, small.width, small.height);
  root.style.setProperty('--menu-backdrop', `url(${small.toDataURL('image/png')})`);
}
