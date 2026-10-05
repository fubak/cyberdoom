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
        if (!best || light < best.light - 1e-6) best = { x, y, dx, dy, light };
      }
    }
  }
  return best;
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
  const line = darkestLine(map, dist);
  if (!line) throw new Error(`no straight open line of ${dist + 1} tiles`);
  const target = entities.find((e) => e.alive && e.def.kind === 'enemy' && e.def.sprite === kind) ??
    entities.find((e) => e.alive && e.def.kind === 'enemy');
  if (!target) throw new Error('no live enemy to probe with');
  const id = target.def.id;
  const px = line.x + 0.5;
  const py = line.y + 0.5;
  const place = () => {
    player.x = px;
    player.y = py;
    player.angle = Math.atan2(line.dy, line.dx);
    player.snap();
    target.x = px + line.dx * dist;
    target.y = py + line.dy * dist;
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
