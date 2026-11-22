import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CEIL_H,
  DOOR_CEIL_H,
  SKY_PARAPET_H,
  VAULT_CEIL_H,
  WorldMap,
} from '../src/engine/map';
import { missionRegistry } from '../src/content/missions';
import { SKY_PALETTES, skyEpisodeForMission } from '../src/render/sky';

describe('D6 architecture: height variation, skylights, windows, and episode skies', () => {
  it('maps M01-M04 to ep1, M05-M08 to ep2, and M09-M12 to ep3', () => {
    expect(skyEpisodeForMission('m01')).toBe('ep1');
    expect(skyEpisodeForMission('m04')).toBe('ep1');
    expect(skyEpisodeForMission('m05')).toBe('ep2');
    expect(skyEpisodeForMission('m08')).toBe('ep2');
    expect(skyEpisodeForMission('m09')).toBe('ep3');
    expect(skyEpisodeForMission('m12')).toBe('ep3');
    expect(Object.keys(SKY_PALETTES).sort()).toEqual(['ep1', 'ep2', 'ep3']);
  });

  it('computes floor heights, vaulted ceilings, door headers, sky parapets, and window opacity', () => {
    const map = new WorldMap({
      grid: [
        '#####',
        '#...#',
        '#.s.#',
        '#w.D#',
        '#.E.#',
        '#####',
      ],
      legend: {
        '#': { kind: 'wall', tex: 'wall-panel' },
        '.': { kind: 'floor', tex: 'floor' },
        s: { kind: 'floor', tex: 'floor', sky: true },
        w: { kind: 'wall', tex: 'wall-panel', window: true },
        D: { kind: 'door', tex: 'door', doorId: 'd1' },
        E: { kind: 'exit', tex: 'floor', floorHeight: 0.16 },
      },
      spawn: { x: 2.5, y: 1.5, angle: 0 },
    });

    expect(map.floorHeightAt(2, 1)).toBe(0);
    expect(map.floorHeightAt(2, 4)).toBe(0.16);
    expect(map.isSky(2, 2)).toBe(true);
    expect(map.ceilHeightAt(2, 2)).toBe(SKY_PARAPET_H);
    expect(map.ceilHeightAt(3, 3)).toBe(DOOR_CEIL_H);
    expect(map.ceilHeightAt(1, 1)).toBe(DEFAULT_CEIL_H);
    expect(map.isWindow(1, 3)).toBe(true);
    expect(map.blocked(1, 3)).toBe(true);
    expect(map.opaque(1, 3)).toBe(false);
    expect(map.opaque(0, 0)).toBe(true);

    // Wide open room (>=7 non-wall neighbors) gets vaulted ceiling
    const big = new WorldMap({
      grid: [
        '#####',
        '#...#',
        '#...#',
        '#...#',
        '#####',
      ],
      legend: {
        '#': { kind: 'wall', tex: 'wall-panel' },
        '.': { kind: 'floor', tex: 'floor' },
      },
      spawn: { x: 2.5, y: 2.5, angle: 0 },
    });
    expect(big.ceilHeightAt(2, 2)).toBe(VAULT_CEIL_H);
  });

  it('gives every campaign mission a raised exit dais and skylight well', () => {
    for (const m of missionRegistry.all()) {
      const exitDef = Object.values(m.map.legend).find((d) => d.kind === 'exit');
      expect(exitDef?.floorHeight, `${m.id} exit dais`).toBeGreaterThan(0);

      const skyGlyph = Object.entries(m.map.legend).find(([, d]) => d.sky)?.[0];
      expect(skyGlyph, `${m.id} sky legend`).toBeTruthy();
      const skyCount = m.map.grid.join('').split(skyGlyph!).length - 1;
      expect(skyCount, `${m.id} sky cells`).toBeGreaterThan(0);
    }
  });
});
