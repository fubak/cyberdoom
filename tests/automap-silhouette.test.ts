import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';

/** LEVELS: every mission must have a recognizably different automap silhouette.
 *  Doom E1 maps are identifiable from the automap alone; all 12 missions used
 *  to share the same 40x30 rectangle. Signature = footprint dims + an
 *  occupancy grid (non-wall cells) downsampled to 16x12 by majority vote.
 *  Pairwise distance = Manhattan over the signature, weighted by dim deltas. */
const DW = 16, DH = 12;

function signature(occ: number[][], w: number, h: number): number[] {
  const sig: number[] = [];
  for (let dy = 0; dy < DH; dy++) {
    for (let dx = 0; dx < DW; dx++) {
      let filled = 0, total = 0;
      for (let y = Math.floor((dy * h) / DH); y < Math.floor(((dy + 1) * h) / DH); y++) {
        for (let x = Math.floor((dx * w) / DW); x < Math.floor(((dx + 1) * w) / DW); x++) {
          total++; filled += occ[y][x];
        }
      }
      sig.push(filled / total > 0.5 ? 1 : 0);
    }
  }
  return sig;
}

describe('automap silhouettes', () => {
  const missions = missionRegistry.all();
  const sigs = missions.map((m) => {
    const grid = m.map.grid;
    const h = grid.length, w = grid[0].length;
    const occ = grid.map((row) =>
      [...row].map((c) => (m.map.legend[c]?.kind !== 'wall' ? 1 : 0)));
    return { id: m.id, w, h, sig: signature(occ, w, h) };
  });

  it('every mission reports a footprint', () => {
    for (const s of sigs) {
      expect(s.w, `${s.id} width`).toBeGreaterThanOrEqual(28);
      expect(s.h, `${s.id} height`).toBeGreaterThanOrEqual(24);
    }
  });

  it('no two silhouettes are alike', () => {
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i + 1; j < sigs.length; j++) {
        let dist = Math.abs(sigs[i].w - sigs[j].w) + Math.abs(sigs[i].h - sigs[j].h);
        for (let k = 0; k < sigs[i].sig.length; k++) {
          dist += Math.abs(sigs[i].sig[k] - sigs[j].sig[k]) * 1.5;
        }
        expect(dist, `${sigs[i].id} vs ${sigs[j].id}`).toBeGreaterThanOrEqual(40);
      }
    }
  });
});
