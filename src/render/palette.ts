import * as THREE from 'three';

/**
 * CYBERDOOM 256-colour palette (original). Like Doom's PLAYPAL, every frame is
 * snapped to this palette in the post pass, which gives the crushed, banded,
 * "painted" look. Built from 16 hand-picked hue ramps, dark→light.
 */

type RGB = [number, number, number];

/** [shadow, mid, highlight] anchors per ramp; 16 shades interpolated. */
const RAMPS: { n: number; stops: RGB[] }[] = [
  { n: 32, stops: [[0, 0, 0], [118, 118, 122], [255, 255, 255]] }, // neutral grey
  { n: 16, stops: [[6, 8, 14], [74, 86, 108], [196, 210, 232]] }, // steel blue-grey
  { n: 16, stops: [[10, 8, 6], [92, 82, 70], [214, 200, 178]] }, // warm concrete
  { n: 16, stops: [[14, 6, 4], [112, 58, 38], [228, 160, 120]] }, // rust / brick
  { n: 16, stops: [[20, 0, 0], [180, 24, 16], [255, 150, 130]] }, // blood red
  { n: 16, stops: [[24, 8, 0], [214, 108, 12], [255, 214, 140]] }, // orange / amber
  { n: 16, stops: [[22, 18, 0], [210, 190, 30], [255, 252, 190]] }, // warning yellow
  { n: 16, stops: [[0, 14, 2], [30, 170, 60], [190, 255, 190]] }, // terminal green
  { n: 16, stops: [[10, 12, 4], [86, 96, 44], [200, 210, 140]] }, // olive / khaki
  { n: 16, stops: [[0, 14, 18], [0, 170, 200], [190, 255, 255]] }, // cyan
  { n: 16, stops: [[2, 4, 24], [36, 80, 210], [170, 200, 255]] }, // blue
  { n: 16, stops: [[14, 2, 20], [130, 44, 170], [236, 170, 255]] }, // purple
  { n: 16, stops: [[30, 14, 8], [196, 136, 96], [255, 224, 196]] }, // skin
  { n: 16, stops: [[2, 10, 10], [34, 84, 80], [150, 210, 196]] }, // dark teal
  { n: 16, stops: [[20, 4, 14], [200, 40, 120], [255, 180, 220]] }, // magenta (malware)
];

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function buildPalette(): RGB[] {
  const out: RGB[] = [];
  for (const r of RAMPS) {
    for (let i = 0; i < r.n; i++) {
      const t = i / (r.n - 1);
      const c = t < 0.5 ? lerp(r.stops[0], r.stops[1], t * 2) : lerp(r.stops[1], r.stops[2], (t - 0.5) * 2);
      out.push([Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
    }
  }
  return out.slice(0, 256);
}

/** 32x32x32 nearest-colour LUT laid out as a 1024x32 texture (x = r + b*32, y = g). */
export function buildPaletteLut(): THREE.DataTexture {
  const pal = buildPalette();
  const N = 32;
  const data = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const R = (r * 255) / 31;
        const G = (g * 255) / 31;
        const B = (b * 255) / 31;
        let best = 0;
        let bd = Infinity;
        for (let i = 0; i < pal.length; i++) {
          const p = pal[i];
          const dr = p[0] - R;
          const dg = p[1] - G;
          const db = p[2] - B;
          const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        const o = (g * N * N + b * N + r) * 4;
        data[o] = pal[best][0];
        data[o + 1] = pal[best][1];
        data[o + 2] = pal[best][2];
        data[o + 3] = 255;
      }
    }
  }
  const t = new THREE.DataTexture(data, N * N, N, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
