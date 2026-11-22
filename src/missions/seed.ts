import type { EntityDef, Mission } from '../core/types';

/** Deterministic 32-bit PRNG (Mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Flood-fills the mission grid treating walls and locked/role/secret doors as barriers
 * so seeded shuffling never moves a workstation across a progression gate.
 */
function computeZones(mission: Mission): Int32Array {
  const rows = mission.map.grid;
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const zones = new Int32Array(w * h).fill(-1);
  const legend = mission.map.legend;

  const passable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const ch = rows[y]?.[x];
    if (!ch) return false;
    const def = legend[ch];
    if (!def) return false;
    if (def.kind === 'wall') return false;
    if (def.kind === 'door' && (def.locked || def.accessRole || def.secret)) return false;
    return true;
  };

  let nextZone = 0;
  const queue: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (zones[idx] !== -1 || !passable(x, y)) continue;
      const z = nextZone++;
      zones[idx] = z;
      queue.length = 0;
      queue.push(idx);
      for (let head = 0; head < queue.length; head++) {
        const cur = queue[head]!;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (!passable(nx!, ny!)) continue;
          const nIdx = ny! * w + nx!;
          if (zones[nIdx] === -1) {
            zones[nIdx] = z;
            queue.push(nIdx);
          }
        }
      }
    }
  }
  return zones;
}

function isPoolCandidate(e: EntityDef): boolean {
  if (e.kind !== 'workstation') return false;
  if (e.dormant) return false;
  if (!e.inspect) return false;
  if (e.tags?.includes('plug-usb')) return false;
  return true;
}

/**
 * Shuffles workstation `(x, y)` coordinates within each door-bounded zone using `seed`.
 * Seed `0` returns the canonical mission unchanged for deterministic walkthroughs and tests.
 */
export function applySeededPools(mission: Mission, seed: number): Mission {
  if (!seed) return mission;
  const h = mission.map.grid.length;
  const w = mission.map.grid[0]?.length ?? 0;
  if (w === 0 || h === 0) return mission;

  const zones = computeZones(mission);
  const groups = new Map<number, number[]>();

  for (let i = 0; i < mission.entities.length; i++) {
    const e = mission.entities[i]!;
    if (!isPoolCandidate(e)) continue;
    const gx = Math.floor(e.x);
    const gy = Math.floor(e.y);
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
    const z = zones[gy * w + gx]!;
    if (z < 0) continue;
    let list = groups.get(z);
    if (!list) {
      list = [];
      groups.set(z, list);
    }
    list.push(i);
  }

  const rng = mulberry32(seed);
  const entities = mission.entities.map((e) => ({ ...e }));

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const slots = indices.map((i) => ({ x: entities[i]!.x, y: entities[i]!.y }));
    // Fisher-Yates shuffle
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = slots[i]!;
      slots[i] = slots[j]!;
      slots[j] = tmp;
    }
    for (let k = 0; k < indices.length; k++) {
      const ent = entities[indices[k]!]!;
      ent.x = slots[k]!.x;
      ent.y = slots[k]!.y;
    }
  }

  return { ...mission, entities };
}
