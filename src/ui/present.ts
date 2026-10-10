import { VIEW_H, VIEW_W } from '../render/res';

/**
 * Fit the 1280×800 viewport to the window. Integer scaling keeps texels
 * perfectly even, so we always take floor(fit) when the result still fills
 * >= 85% of the window's shorter axis; otherwise the frame is presented at a
 * fractional fit through a sharp-bilinear pass (see below).
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

/**
 * Size the viewport and, for fractional fits, run a sharp-bilinear pass:
 * the world and HUD canvases are nearest-upscaled into a `canvas.stage`
 * buffer at ceil(fit) each frame, then the browser's filtered downscale
 * shrinks it to the exact fit — crisp texels, even widths, <= 1px soft edge.
 * The stage sits right after #hud in DOM order, so crosshair, dossier,
 * automap and .screen overlays still paint above it; the source canvases are
 * hidden while composited (drawImage still reads them). Returns the
 * per-frame compositor: a no-op on the integer path.
 */
export function setupPresentation(viewport: HTMLElement): () => void {
  let stage: HTMLCanvasElement | null = null;
  let stageG: CanvasRenderingContext2D | null = null;
  // gl+hud are composited at native res here first, so the big nearest blit
  // runs once per frame instead of twice (cheaper under software rendering)
  const comp = document.createElement('canvas');
  comp.width = VIEW_W;
  comp.height = VIEW_H;
  const compG = comp.getContext('2d')!;
  let fractional = false;
  let kCeil = 1;

  const sources = () => {
    const gl = viewport.querySelector<HTMLCanvasElement>('canvas.gl');
    const hud = viewport.querySelector<HTMLCanvasElement>('#hud');
    return gl && hud ? { gl, hud } : null;
  };

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const { cssW, cssH, integer } = presentSize(
      window.innerWidth,
      window.innerHeight,
      dpr,
    );
    viewport.style.width = `${cssW}px`;
    viewport.style.height = `${cssH}px`;
    fractional = !integer;
    if (fractional) {
      const fit = Math.min(
        (window.innerWidth * dpr) / VIEW_W,
        (window.innerHeight * dpr) / VIEW_H,
      );
      kCeil = Math.max(1, Math.ceil(fit));
    } else {
      kCeil = 1;
      if (stage) stage.style.display = 'none';
      const src = sources();
      if (src) {
        src.gl.style.visibility = '';
        src.hud.style.visibility = '';
      }
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

  return () => {
    if (!fractional) return;
    const src = sources();
    if (!src) return;
    if (!stage) {
      stage = document.createElement('canvas');
      stage.className = 'stage';
      stageG = stage.getContext('2d');
    }
    if (stage.width !== VIEW_W * kCeil || stage.height !== VIEW_H * kCeil) {
      stage.width = VIEW_W * kCeil;
      stage.height = VIEW_H * kCeil;
    }
    if (src.hud.nextSibling !== stage) {
      viewport.insertBefore(stage, src.hud.nextSibling);
    }
    stage.style.display = '';
    src.gl.style.visibility = 'hidden';
    src.hud.style.visibility = 'hidden';
    compG.imageSmoothingEnabled = false;
    compG.drawImage(src.gl, 0, 0);
    compG.drawImage(src.hud, 0, 0);
    stageG!.imageSmoothingEnabled = false;
    stageG!.drawImage(comp, 0, 0, stage.width, stage.height);
  };
}
