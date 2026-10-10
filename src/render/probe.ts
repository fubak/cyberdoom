import type { Entity } from '../core/types';
import type { WorldMap } from '../engine/map';
import type { Player } from '../engine/player';
import type { Renderer } from './renderer';

/**
 * LOOK: threat-readability probe (debug only). Places one enemy, drawn as
 * `kind`, `dist` tiles straight ahead of the player down the DARKEST straight
 * open line in the map, renders the view with and without it, and measures:
 *  - contrast: WCAG-style (Lhi+0.05)/(Llo+0.05) of the mean relative luminance
 *    of the sprite's pixels vs the same pixels with the sprite hidden;
 *  - p10: 10th-percentile luma (0-255) of the 3D view without the sprite.
 * All other sprites are hidden in both frames so only the world is background.
 */
export interface ProbeResult {
  kind: string;
  dist: number;
  at: { x: number; y: number; dx: number; dy: number; light: number };
  spritePx: number;
  spriteLum: number;
  bgLum: number;
  contrast: number;
  p10: number;
  /** data: URLs of the with-sprite and without-sprite frames (when requested). */
  images?: [string, string];
  target?: unknown;
}

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const relLum = (d: Uint8Array, i: number) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
const luma = (d: Uint8Array, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function darkestLine(map: WorldMap, dist: number): { x: number; y: number; dx: number; dy: number; light: number } | null {
  const open = (x: number, y: number) => {
    const c = map.cellAt(x, y);
    return !!c && c.kind !== 'wall' && c.kind !== 'door' && !map.blocked(x, y);
  };
  let best: { x: number; y: number; dx: number; dy: number; light: number } | null = null;
  let bestScore = Infinity;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let ok = true;
        let sum = 0;
        for (let k = 0; k <= dist + 1 && ok; k++) {
          ok = open(x + dx * k, y + dy * k);
          if (k <= dist) sum += map.lightAt(x + dx * k, y + dy * k);
        }
        if (!ok) continue;
        const light = sum / (dist + 1);
        // a probe sprite is placed at the run's end, so the cell beyond it is
        // the measured backdrop — prefer runs whose backdrop stays dark too
        const score = light + 0.6 * map.lightAt(x + dx * (dist + 1), y + dy * (dist + 1));
        if (!best || score < bestScore - 1e-6) {
          bestScore = score;
          best = { x, y, dx, dy, light };
        }
      }
    }
  }
  return best;
}

/**
 * Brightest straight run that ends against a wall: `len` open tiles then a
 * blocking cell, so standing at the run start the end wall is ~`len` tiles
 * away. Used by the light-diminishing probe; returns the highest-scored run.
 */
export function litWallLine(map: WorldMap, len: number): { x: number; y: number; dx: number; dy: number; light: number } | null {
  const open = (x: number, y: number) => {
    const c = map.cellAt(x, y);
    return !!c && c.kind !== 'wall' && c.kind !== 'door' && !map.blocked(x, y);
  };
  let best: { x: number; y: number; dx: number; dy: number; light: number } | null = null;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let ok = true;
        let sum = 0;
        for (let k = 0; k < len && ok; k++) {
          ok = open(x + dx * k, y + dy * k);
          sum += map.lightAt(x + dx * k, y + dy * k);
        }
        // the run must terminate against a wall (the measured face)
        ok = ok && map.blocked(x + dx * len, y + dy * len);
        if (!ok) continue;
        const light = sum / len;
        if (!best || light > best.light + 1e-6) best = { x, y, dx, dy, light };
      }
    }
  }
  return best;
}

export interface LightProbeResult {
  /** Mean luma (0-255) of the view's centre band: same lit wall at ~2 vs ~10 tiles. */
  near: number;
  far: number;
  /** far/near — distance diminishing, target well under 1 (Doom ≈ half at 10 tiles). */
  ratio: number;
  dist: number;
  /** Centre-band luma standing inside the darkest straight run of the map. */
  dark: number;
  darkLight: number;
  line: { x: number; y: number; dx: number; dy: number; light: number } | null;
  images?: string[];
}

// Median luma over a fractional band of the view. Median, not mean: scattered
// fullbright texels (rack LEDs, glow decals) stay bright at range as they
// should, and a mean lets them mask the lit surface's falloff.
const bandLuma = (v: { w: number; h: number; data: Uint8Array }, x0: number, x1: number, y0: number, y1: number) => {
  const ls: number[] = [];
  for (let y = Math.floor(v.h * y0); y < v.h * y1; y++) {
    for (let x = Math.floor(v.w * x0); x < v.w * x1; x++) {
      ls.push(luma(v.data, (y * v.w + x) * 4));
    }
  }
  if (!ls.length) return 0;
  ls.sort((a, b) => a - b);
  return ls[Math.floor(ls.length / 2)];
};

// Falloff bands, both inside the ~`dist`-tile corridor shot: floor flats have
// a uniform mix of plate/vent texels and no fullbright elements, and every
// cell of a lit run carries the same light, so the floor at ~2 tiles vs ~9-10
// tiles in one view isolates pure distance diminishing — the same gradient
// Doom's colormap shows down a corridor. (End-wall texels fail this job: dark
// rack families compress the range and glow signs are authored fullbright.)
// Bands are wide so the vent/plate mix averages out; the far band sits just
// under the end wall's base, above floor decals.
const NEAR_FLOOR: [number, number, number, number] = [0.3, 0.7, 0.8, 0.92];
const FAR_FLOOR: [number, number, number, number] = [0.4, 0.6, 0.52, 0.56];
// Centre band for the dark-sector reading: the corridor's far end — walls and
// flats at ~4+ tiles, which is what the <=15-luma target applies to. Near
// floor and side walls at band edges stay lit by the edge light source.
const DARK_BAND: [number, number, number, number] = [0.35, 0.65, 0.18, 0.62];

/**
 * LOOK: light-diminishing probe (debug only). Measures the centre-band luma
 * of the same lit corridor wall from ~`dist` tiles and from ~2 tiles, plus
 * the centre-band luma inside the map's darkest straight run — all with every
 * sprite hidden, so only world light is measured.
 */
export async function lightProbe(
  r: Renderer,
  map: WorldMap,
  entities: Entity[],
  player: Player,
  dist = 10,
  withImages = false,
): Promise<LightProbeResult> {
  r.debugNoFlash = true;
  r.debugHidden.clear();
  for (const e of entities) r.debugHidden.add(e.def.id);
  const images: string[] = [];
  const stand = async (x: number, y: number, angle: number) => {
    player.x = x;
    player.y = y;
    player.angle = angle;
    player.vx = 0;
    player.vy = 0;
    player.snap();
    for (let i = 0; i < 3; i++) await frame();
  };
  try {
    const lineDist = litWallLine(map, dist) ? dist : Math.max(6, dist - 2);
    const line = litWallLine(map, lineDist);
    let far = 0;
    let near = 0;
    if (line) {
      const angle = Math.atan2(line.dy, line.dx);
      await stand(line.x + 0.5, line.y + 0.5, angle);
      const a = await r.captureView();
      far = bandLuma(a, ...FAR_FLOOR);
      near = bandLuma(a, ...NEAR_FLOOR);
      if (withImages) images.push(toUrl(a));
      await stand(line.x + (lineDist - 2) * line.dx + 0.5, line.y + (lineDist - 2) * line.dy + 0.5, angle);
      const b = await r.captureView();
      if (withImages) images.push(toUrl(b));
    }
    let dark = 0;
    let darkLight = 0;
    const dline = darkestLine(map, 6);
    if (dline) {
      await stand(dline.x + 0.5, dline.y + 0.5, Math.atan2(dline.dy, dline.dx));
      const d = await r.captureView();
      dark = bandLuma(d, ...DARK_BAND);
      darkLight = dline.light;
      if (withImages) images.push(toUrl(d));
    }
    return {
      near: +near.toFixed(1),
      far: +far.toFixed(1),
      ratio: near > 0 ? +(far / near).toFixed(3) : 0,
      dist: lineDist,
      dark: +dark.toFixed(1),
      darkLight: +darkLight.toFixed(2),
      line,
      ...(withImages ? { images } : {}),
    };
  } finally {
    r.debugHidden.clear();
    r.debugNoFlash = false;
  }
}

export function placeThreat(
  map: WorldMap,
  entities: Entity[],
  player: Player,
  kind: string,
  dist: number,
): { target: Entity; line: NonNullable<ReturnType<typeof darkestLine>> } {
  const line = darkestLine(map, dist);
  if (!line) throw new Error(`no straight open line of ${dist + 1} tiles`);
  const target = entities.find((e) => e.alive && e.def.kind === 'enemy' && e.def.sprite === kind) ??
    entities.find((e) => e.alive && e.def.kind === 'enemy');
  if (!target) throw new Error('no live enemy to probe with');
  const px = line.x + 0.5;
  const py = line.y + 0.5;
  player.x = px;
  player.y = py;
  player.angle = Math.atan2(line.dy, line.dx);
  player.vx = 0;
  player.vy = 0;
  player.snap();
  target.x = px + line.dx * dist;
  target.y = py + line.dy * dist;
  return { target, line };
}

export async function lookProbe(
  r: Renderer,
  map: WorldMap,
  entities: Entity[],
  player: Player,
  kind: string,
  dist: number,
  withImages = false,
): Promise<ProbeResult> {
  const { target, line } = placeThreat(map, entities, player, kind, dist);
  const id = target.def.id;
  const place = () => {
    placeThreat(map, entities, player, kind, dist);
  };
  r.debugSprite.set(id, kind);
  r.debugNoFlash = true;
  r.debugHidden.clear();
  for (const e of entities) if (e.def.id !== id) r.debugHidden.add(e.def.id);
  try {
    for (let i = 0; i < 4; i++) {
      place();
      await frame();
    }
    place();
    const a = await r.captureView();
    r.debugHidden.add(id);
    place();
    await frame();
    place();
    const b = await r.captureView();
    let n = 0;
    let sa = 0;
    let sb = 0;
    const lum: number[] = [];
    for (let i = 0; i < b.data.length; i += 4) {
      lum.push(luma(b.data, i));
      const diff = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (diff > 12) {
        n++;
        sa += relLum(a.data, i);
        sb += relLum(b.data, i);
      }
    }
    lum.sort((x, y) => x - y);
    const spriteLum = n ? sa / n : 0;
    const bgLum = n ? sb / n : 0;
    const hi = Math.max(spriteLum, bgLum);
    const lo = Math.min(spriteLum, bgLum);
    return {
      kind,
      dist,
      at: line,
      spritePx: n,
      spriteLum: +spriteLum.toFixed(4),
      bgLum: +bgLum.toFixed(4),
      contrast: n ? +((hi + 0.05) / (lo + 0.05)).toFixed(2) : 0,
      p10: Math.round(lum[Math.floor(lum.length * 0.1)]),
      target: { id, alive: target.alive, x: target.x, y: target.y, mesh: r.debugSpriteInfo(id) },
      ...(withImages ? { images: [toUrl(a), toUrl(b)] as [string, string] } : {}),
    };
  } finally {
    r.debugHidden.clear();
    r.debugSprite.delete(id);
    r.debugNoFlash = false;
  }
}

function toUrl(v: { w: number; h: number; data: Uint8Array }): string {
  const c = document.createElement('canvas');
  c.width = v.w;
  c.height = v.h;
  const img = new ImageData(v.w, v.h);
  img.data.set(v.data);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
