import { describe, expect, it } from 'vitest';
import { hasGenJob, runGenJob } from '../src/render/gen';
import { rasterize, type Prim } from '../src/render/model';
import { buildSprites, scaleModel } from '../src/render/sprites';
import { bossGhostledgerModel, bossLockerModel, bossPhishModel, bossZerodayModel, ratModel, wiperModel, type ThreatModel, type ThreatPose } from '../src/render/threatModels';
import { installFakeCanvas } from './fakecanvas';

/**
 * ENEMIES: the wiper, the RAT and the four bosses each have an outline of
 * their own. They used to share one body, so the front silhouettes are
 * compared pairwise here to keep them from drifting back together.
 */
installFakeCanvas();
buildSprites();

const MODELS: [string, ThreatModel][] = [
  ['rat', ratModel], ['wiper', wiperModel], ['boss-locker', bossLockerModel],
  ['boss-ghostledger', bossGhostledgerModel], ['boss-phish', bossPhishModel], ['boss-zeroday', bossZerodayModel],
];
const POSES: ThreatPose[] = [
  { kind: 'walk', k: 0, n: 8 }, { kind: 'walk', k: 3, n: 8 }, { kind: 'attack', k: 0 }, { kind: 'attack', k: 1 },
  { kind: 'pain', k: 0 }, { kind: 'pain', k: 1 }, { kind: 'dead' },
];
const S = 128;
/** Front silhouette at half scale: 1 where the model covers the pixel. */
function mask(prims: Prim[]): Uint8Array {
  const half = scaleModel(prims).map((p) => ({ ...p, c: [p.c[0] / 2, p.c[1] / 2, p.c[2] / 2], r: [p.r[0] / 2, p.r[1] / 2, p.r[2] / 2], decal: undefined })) as Prim[];
  const d = rasterize(S, S, half, { view: 0 }).rgba;
  return Uint8Array.from({ length: S * S }, (_, i) => (d[i * 4 + 3] ? 1 : 0));
}
function overlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) { both += a[i] & b[i]; either += a[i] | b[i]; }
  return both / either;
}

describe('redesigned threats', () => {
  it('every pose of every model draws something and stays inside the canvas sides', () => {
    for (const [id, model] of MODELS) {
      for (const pose of POSES) {
        const m = mask(model(pose));
        const area = m.reduce((s, v) => s + v, 0);
        expect(area, `${id} ${pose.kind}`).toBeGreaterThan(S * S * 0.03);
        for (let y = 0; y < S; y++) {
          expect(m[y * S], `${id} ${pose.kind} left edge`).toBe(0);
          expect(m[y * S + S - 1], `${id} ${pose.kind} right edge`).toBe(0);
        }
      }
    }
  });

  it('no two of them share a front silhouette', () => {
    const fronts = MODELS.map(([id, model]) => [id, mask(model({ kind: 'walk', k: 0, n: 8 }))] as const);
    for (let i = 0; i < fronts.length; i++) {
      for (let j = i + 1; j < fronts.length; j++) {
        expect(overlap(fronts[i][1], fronts[j][1]), `${fronts[i][0]} vs ${fronts[j][0]}`).toBeLessThan(0.6);
      }
    }
  });

  it('the strike pose changes the outline, so an attack reads at range', () => {
    for (const [id, model] of MODELS) {
      const rest = mask(model({ kind: 'walk', k: 0, n: 8 }));
      const hit = mask(model({ kind: 'attack', k: 1 }));
      expect(overlap(rest, hit), id).toBeLessThan(0.93);
    }
  });

  it('bosses render on the larger canvas, regular threats on the standard one', () => {
    for (const id of ['boss-locker', 'boss-ghostledger', 'boss-phish', 'boss-zeroday']) {
      expect(hasGenJob(`sprite:${id}:walk0_0`)).toBe(true);
      expect(runGenJob(`sprite:${id}:walk0_0`).w, id).toBe(384);
    }
    expect(runGenJob('sprite:rat:walk0_0').w).toBe(256);
    expect(runGenJob('sprite:wiper:walk0_0').w).toBe(256);
  });
});
