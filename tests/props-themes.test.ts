import { describe, expect, it } from 'vitest';
import { MISSION_THEMES } from '../src/content/missions/campaign-map';
import { missionRegistry } from '../src/content/missions/index';
import { buildSprites, spriteSets } from '../src/render/sprites';
import { buildTextures, textureRegistry, variantCount } from '../src/render/textures';
import { installFakeCanvas } from './fakecanvas';

installFakeCanvas();
buildTextures();
buildSprites();

describe('D3 environmental props and episode wall/floor themes', () => {
  it('registers all four themed wall textures and three themed floor textures with variants', () => {
    for (const id of ['wall-office', 'wall-datacenter', 'wall-vault', 'wall-soc']) {
      expect(textureRegistry.get(id), `missing wall texture ${id}`).toBeDefined();
      expect(variantCount(id)).toBeGreaterThan(0);
      expect(textureRegistry.get(`${id}:v1`)).toBeDefined();
    }
    for (const id of ['floor-carpet', 'floor-datacenter', 'floor-soc']) {
      expect(textureRegistry.get(id), `missing floor texture ${id}`).toBeDefined();
      expect(variantCount(id)).toBeGreaterThan(0);
      expect(textureRegistry.get(`${id}:v1`)).toBeDefined();
    }
  });

  it('registers all six environmental prop sprites with frames', () => {
    for (const id of [
      'server-rack',
      'office-plant',
      'water-cooler',
      'whiteboard',
      'hazard-barrel',
      'warning-beacon',
    ]) {
      const set = spriteSets.get(id);
      expect(set, `missing prop sprite ${id}`).toBeDefined();
      expect(Object.keys(set!.frames).length).toBeGreaterThan(0);
    }
  });

  it('applies distinct wall/floor themes and environmental props across M01-M12', () => {
    const usedWalls = new Set<string>();
    const usedFloors = new Set<string>();
    const usedProps = new Set<string>();

    for (const mission of missionRegistry.all()) {
      const theme = MISSION_THEMES[mission.id];
      expect(theme, `missing theme for ${mission.id}`).toBeDefined();
      const legendValues = Object.values(mission.map.legend);
      expect(legendValues.some((d) => d.kind === 'wall' && d.tex === theme!.wall)).toBe(true);
      expect(legendValues.some((d) => d.kind === 'floor' && d.tex === theme!.floor)).toBe(true);
      usedWalls.add(theme!.wall);
      usedFloors.add(theme!.floor);

      for (const ent of mission.entities) {
        if (ent.kind !== 'prop' || ent.sprite === 'duck') continue;
        expect(theme!.props).toContain(ent.sprite);
        usedProps.add(ent.sprite);
      }
    }

    expect(usedWalls.size).toBe(4);
    expect(usedFloors.size).toBe(3);
    expect(usedProps.size).toBe(6);
  });
});
