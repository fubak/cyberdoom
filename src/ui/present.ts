import { VIEW_H, VIEW_W } from '../render/res';

/**
 * Fit the 1280×800 viewport to the window. Integer scaling stays crisp, so
 * when floor(fit) is within 90% of the true fit we use it; otherwise a
 * fractional fit is preferred over wasting screen area on big borders.
 */
export function presentSize(
  innerW: number,
  innerH: number,
  dpr: number,
): { cssW: number; cssH: number; integer: boolean } {
  const fit = Math.min((innerW * dpr) / VIEW_W, (innerH * dpr) / VIEW_H);
  const k = Math.floor(fit);
  if (k >= 1 && k / fit >= 0.9) {
    return { cssW: (VIEW_W * k) / dpr, cssH: (VIEW_H * k) / dpr, integer: true };
  }
  const scale = Math.min(innerW / VIEW_W, innerH / VIEW_H);
  return { cssW: VIEW_W * scale, cssH: VIEW_H * scale, integer: false };
}

export function setupPresentation(viewport: HTMLElement): void {
  const resize = () => {
    const { cssW, cssH } = presentSize(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    );
    viewport.style.width = `${cssW}px`;
    viewport.style.height = `${cssH}px`;
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
