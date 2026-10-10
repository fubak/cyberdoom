import { VIEW_H, VIEW_W } from '../render/res';

/**
 * Fit the 1280×800 viewport to the window. Integer scaling keeps texels
 * perfectly even, so we always take floor(fit) when the result still fills
 * >= 85% of the window's shorter axis; otherwise a fractional fit is scaled
 * with a high-quality filter (the canvas drops `image-rendering: pixelated`).
 */
export function presentSize(
  innerW: number,
  innerH: number,
  dpr: number,
): { cssW: number; cssH: number; integer: boolean } {
  const pw = innerW * dpr;
  const ph = innerH * dpr;
  const fit = Math.min(pw / VIEW_W, ph / VIEW_H);
  const k = Math.floor(fit);
  // how much of the window's shorter axis an integer-scaled frame would fill
  const shorterFill = pw <= ph ? (VIEW_W * k) / pw : (VIEW_H * k) / ph;
  if (k >= 1 && shorterFill >= 0.85) {
    return { cssW: (VIEW_W * k) / dpr, cssH: (VIEW_H * k) / dpr, integer: true };
  }
  const scale = Math.min(innerW / VIEW_W, innerH / VIEW_H);
  return { cssW: VIEW_W * scale, cssH: VIEW_H * scale, integer: false };
}

export function setupPresentation(viewport: HTMLElement): void {
  const resize = () => {
    const { cssW, cssH, integer } = presentSize(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    );
    viewport.style.width = `${cssW}px`;
    viewport.style.height = `${cssH}px`;
    // fractional scale: let the browser filter instead of uneven texel widths
    viewport.classList.toggle('smooth', !integer);
  };
  let dprQuery: MediaQueryList | null = null;
  const armDprListener = () => {
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener('change', onDprChange, { once: true });
  };
  const onDprChange = () => {
    resize();
    armDprListener();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  resize();
  armDprListener();
}
