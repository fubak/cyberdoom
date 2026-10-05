import { VIEW_H, VIEW_W } from '../render/res';

export function setupPresentation(viewport: HTMLElement): void {
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.floor(Math.min((window.innerWidth * dpr) / VIEW_W, (window.innerHeight * dpr) / VIEW_H));
    if (k >= 1) {
      viewport.style.width = `${(VIEW_W * k) / dpr}px`;
      viewport.style.height = `${(VIEW_H * k) / dpr}px`;
    } else {
      // Fractional fitting is unavoidable when the physical window is below 1280×800.
      const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
      viewport.style.width = `${VIEW_W * scale}px`;
      viewport.style.height = `${VIEW_H * scale}px`;
    }
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
