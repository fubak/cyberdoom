import * as THREE from 'three';

export type SkyEpisode = 'ep1' | 'ep2' | 'ep3';

export interface SkyPalette {
  zenith: [number, number, number];
  mid: [number, number, number];
  horizon: [number, number, number];
  silhouette: [number, number, number];
  windowLit: [number, number, number];
  star: [number, number, number];
  cloud: [number, number, number];
}

export const SKY_PALETTES: Record<SkyEpisode, SkyPalette> = {
  /** Episode 1 (M01–M04): Meridian HQ dusk skyline — deep indigo zenith, warm amber horizon. */
  ep1: {
    zenith: [10, 16, 36],
    mid: [24, 38, 72],
    horizon: [110, 74, 52],
    silhouette: [14, 18, 28],
    windowLit: [245, 200, 110],
    star: [215, 228, 255],
    cloud: [44, 56, 88],
  },
  /** Episode 2 (M05–M08): Storm-lit data center campus — slate storm clouds, cyan glow. */
  ep2: {
    zenith: [8, 20, 30],
    mid: [18, 46, 62],
    horizon: [48, 108, 124],
    silhouette: [10, 20, 26],
    windowLit: [92, 232, 255],
    star: [170, 235, 250],
    cloud: [28, 62, 78],
  },
  /** Episode 3 (M09–M12): Breach crimson sky — Doom-style red-amber storm haze over dark towers. */
  ep3: {
    zenith: [26, 8, 12],
    mid: [76, 20, 18],
    horizon: [164, 56, 26],
    silhouette: [18, 8, 10],
    windowLit: [255, 130, 56],
    star: [255, 190, 150],
    cloud: [112, 34, 24],
  },
};

export function skyEpisodeForMission(missionId: string): SkyEpisode {
  const m = missionId.match(/^m(\d+)/i);
  const num = m ? Number(m[1]) : 1;
  if (num <= 4) return 'ep1';
  if (num <= 8) return 'ep2';
  return 'ep3';
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function rgbStr(c: [number, number, number], a = 1): string {
  return a < 1 ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`;
}

const skyCache = new Map<SkyEpisode, THREE.CanvasTexture>();

/**
 * Procedurally paint a 512x256 panoramic Doom-style episode sky texture.
 * Horizontally seamless (tiled around a sky cylinder). Cached per episode.
 */
export function buildSkyTexture(episode: SkyEpisode): THREE.CanvasTexture {
  const cached = skyCache.get(episode);
  if (cached) return cached;

  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pal = SKY_PALETTES[episode];

  // 1. Stepped vertical gradient (band-quantised for crisp retro sky feel)
  const bands = 24;
  for (let y = 0; y < H; y++) {
    const tRaw = y / (H - 1);
    const t = Math.floor(tRaw * bands) / bands;
    let r: number;
    let g: number;
    let b: number;
    if (t < 0.55) {
      const k = t / 0.55;
      r = lerp(pal.zenith[0], pal.mid[0], k);
      g = lerp(pal.zenith[1], pal.mid[1], k);
      b = lerp(pal.zenith[2], pal.mid[2], k);
    } else {
      const k = (t - 0.55) / 0.45;
      r = lerp(pal.mid[0], pal.horizon[0], k);
      g = lerp(pal.mid[1], pal.horizon[1], k);
      b = lerp(pal.mid[2], pal.horizon[2], k);
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, W, 1);
  }

  // 2. Deterministic stars in upper zenith
  let seed = episode === 'ep1' ? 101 : episode === 'ep2' ? 202 : 303;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  ctx.fillStyle = rgbStr(pal.star, 0.85);
  for (let i = 0; i < 64; i++) {
    const sx = Math.floor(rand() * W);
    const sy = Math.floor(rand() * (H * 0.48));
    const sz = rand() > 0.8 ? 2 : 1;
    ctx.fillRect(sx, sy, sz, sz);
  }

  // 3. Layered cloud streaks (wrap-safe)
  ctx.fillStyle = rgbStr(pal.cloud, 0.55);
  for (let i = 0; i < 18; i++) {
    const cx = Math.floor(rand() * W);
    const cy = Math.floor(H * (0.24 + rand() * 0.42));
    const cw = 36 + Math.floor(rand() * 72);
    const ch = 4 + Math.floor(rand() * 8);
    ctx.fillRect(cx, cy, cw, ch);
    if (cx + cw > W) ctx.fillRect(cx - W, cy, cw, ch);
  }

  // 4. Distant corporate / industrial skyline silhouettes
  const horizonY = Math.floor(H * 0.78);
  let bx = 0;
  while (bx < W) {
    const bw = 12 + Math.floor(rand() * 24);
    const bh = 18 + Math.floor(rand() * 54);
    const topY = horizonY - bh;
    ctx.fillStyle = rgbStr(pal.silhouette);
    ctx.fillRect(bx, topY, bw, H - topY);

    // Occasional antenna spire with red warning beacon
    if (rand() > 0.65) {
      const ax = bx + Math.floor(bw / 2);
      ctx.fillRect(ax, topY - 12, 2, 12);
      ctx.fillStyle = '#ff3838';
      ctx.fillRect(ax, topY - 14, 2, 2);
    }

    // Lit pixel windows
    ctx.fillStyle = rgbStr(pal.windowLit, 0.78);
    for (let wy = topY + 4; wy < horizonY - 4; wy += 5) {
      for (let wx = bx + 3; wx < bx + bw - 3; wx += 4) {
        if (rand() > 0.58) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    bx += bw + 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  skyCache.set(episode, tex);
  return tex;
}
