import type { MapDef } from '../core/types';
import type { WorldMap } from '../engine/map';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface SectorLight {
  /** Per-tile light (row-major, `map.w` wide). */
  light: Float32Array<ArrayBuffer>;
  /** Per-tile strobe phase id (0 = steady). */
  strobe: Float32Array<ArrayBuffer>;
  strobeCount: number;
  /** "x,y" keys of lit / dead ceiling-lamp cells. */
  lamps: Set<string>;
  deadLamps: Set<string>;
}

/**
 * Sector lighting: the mission's per-tile light is the sector level; within
 * a sector, ceiling lamps on a 3-tile grid cast pools that fall off toward
 * near-black between them. Dark sectors (< 0.5) and ~1 in 5 lamps elsewhere
 * are dead, leaving black patches; the spawn area always stays lit.
 *
 * Pure (no Three.js) so wall-seam and lighting tests can run it in node.
 */
export function computeSectorLight(
  map: WorldMap,
  def: MapDef,
  entityDefs?: { x: number; y: number; kind: string }[],
  missionId?: string,
): SectorLight {
  const w = map.w;
  const h = map.h;
  const light = new Float32Array(w * h);
  const strobe = new Float32Array(w * h);
  let strobeCount = 0;
  const lamps = new Set<string>();
  const deadLamps = new Set<string>();
  const src: [number, number, number][] = [];
  const open = (x: number, y: number) => {
    const k = map.cellAt(x, y)?.kind;
    return k !== undefined && k !== 'wall' && k !== 'door';
  };
  // Dark pockets: dead-end floor cells (closets, secret nooks, maintenance
  // stubs) with no authored light override. They get no lamp and drop to
  // near-dark, so every mission gets real black areas to contrast the lit
  // corridors. Secret doors count as solid: the closet behind them is dark.
  const pocket = new Set<string>();
  const solid = (x: number, y: number) => {
    const c = map.cellAt(x, y);
    return !c || c.kind === 'wall' || (c.kind === 'door' && !!c.secret);
  };
  // never pocket a gameplay-critical cell: exits and cells holding a
  // required interactable (console/workstation/npc — sprites that sit at a
  // low readability floor) must stay readable. Pickup nooks still darken:
  // items carry a 0.45 floor, the Doom "glow in a dark closet" look.
  const critical = new Set<string>();
  for (const e of entityDefs ?? []) {
    if (e.kind === 'console' || e.kind === 'workstation' || e.kind === 'npc') {
      critical.add(`${Math.floor(e.x)},${Math.floor(e.y)}`);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!open(x, y) || def.lights?.[`${x},${y}`] !== undefined) continue;
      if (map.cellAt(x, y)?.kind === 'exit' || critical.has(`${x},${y}`)) continue;
      let walls = 0;
      for (const [dx, dz] of DIRS) if (solid(x + dx, y + dz)) walls++;
      if (walls >= 3) pocket.add(`${x},${y}`);
    }
  }
  const sx = def.spawn.x;
  const sy = def.spawn.y;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map.cellAt(x, y)?.kind === 'exit') src.push([x + 0.5, y + 0.5, 0.8]);
      if (!open(x, y) || x % 3 !== 1 || y % 3 !== 1) continue;
      const key = `${x},${y}`;
      if (pocket.has(key)) continue;
      const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
      const nearSpawn = Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 2.5;
      if (!nearSpawn && (map.lightAt(x, y) < 0.5 || hash % 5 === 0)) {
        deadLamps.add(key);
        continue;
      }
      lamps.add(key);
      src.push([x + 0.5, y + 0.5, 1]);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (const [lx, ly, ls] of src) {
        const d2 = (x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2;
        if (d2 < 16) best = Math.max(best, ls * Math.exp(-d2 / 3.2));
      }
      const base = map.lightAt(x, y);
      let v = Math.min(1, base * (0.45 + 0.8 * best));
      // Darkness drama: crush dim sectors toward gloom — Doom's colormap
      // loses whole bands in shadow, so a 0.3 sector is a shadow, not a
      // grey room. Continuous below ~0.5 light, identity above. The 0.09
      // floor (plus the shader's world floor) keeps pocket geometry legible.
      v *= Math.min(1, 0.45 + 1.1 * v);
      light[y * w + x] = Math.max(0.035, v);
    }
  }
  for (const key of pocket) {
    const [x, y] = key.split(',').map(Number);
    light[y * w + x] = Math.min(light[y * w + x], 0.024);
    // the open cell at the pocket's mouth dims too, so the threshold into
    // the nook fades rather than snapping — but the mouth stays lit enough
    // to read as the light source at the pocket's edge (the Doom doorway).
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const ny = y + dz;
      if (!open(nx, ny) || pocket.has(`${nx},${ny}`)) continue;
      const i = ny * w + nx;
      light[i] = Math.min(light[i], Math.max(light[i] * 0.55, 0.1));
    }
  }

  // Doom strobing sectors: 1-2 lit, connected regions blink in sync per
  // sector (mid and late missions). Lit enough that the blink reads as a
  // fixture switching off, never touching the spawn approach or exit pads.
  const missionNum = /^m(\d+)$/i.exec(missionId ?? '')?.[1];
  if (missionNum === undefined || +missionNum >= 4) {
    const seen = new Uint8Array(w * h);
    const comps: { cells: number[]; cx: number; cy: number }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (seen[i] || !open(x, y) || light[i] < 0.55) continue;
        const cells: number[] = [];
        const stack = [i];
        seen[i] = 1;
        let cxs = 0;
        let cys = 0;
        while (stack.length) {
          const j = stack.pop()!;
          cells.push(j);
          const jx = j % w;
          const jy = (j / w) | 0;
          cxs += jx + 0.5;
          cys += jy + 0.5;
          for (const [dx, dz] of DIRS) {
            const nx = jx + dx;
            const ny = jy + dz;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (!seen[ni] && open(nx, ny) && light[ni] >= 0.55) {
              seen[ni] = 1;
              stack.push(ni);
            }
          }
        }
        comps.push({ cells, cx: cxs / cells.length, cy: cys / cells.length });
      }
    }
    const pick = comps
      .filter((c) => c.cells.length >= 5 && Math.hypot(c.cx - def.spawn.x, c.cy - def.spawn.y) >= 5)
      .sort((a, b) => Math.min(a.cells.length, 24) - Math.min(b.cells.length, 24) || a.cx - b.cx || a.cy - b.cy)
      .slice(0, 2);
    for (const c of pick) {
      const phase = ++strobeCount;
      // room-sized patch: the brightest cells of the region (its lamp pool)
      const core = [...c.cells].sort((a, b) => light[b] - light[a]).slice(0, 24);
      for (const j of core) {
        const jx = j % w;
        const jy = (j / w) | 0;
        if (map.cellAt(jx, jy)?.kind === 'exit') continue;
        strobe[j] = phase;
      }
    }
  }
  return { light, strobe, strobeCount, lamps, deadLamps };
}
