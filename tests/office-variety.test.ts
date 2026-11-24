import { describe, expect, it } from 'vitest';
import { missionById } from '../src/content/missions';
import { WorldMap } from '../src/engine/map';
import { buildTextures, hashStr, lookTheme, textureRegistry, variantCount } from '../src/render/textures';
import { OFFICE_DECALS, OFFICE_WALL_ALTS } from '../src/render/texturesOffice';
import { DECALABLE, pickWallFace } from '../src/render/wallPick';
import { installFakeCanvas } from './fakecanvas';

installFakeCanvas();
buildTextures();

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Every exposed wall face of a mission, picked exactly as the renderer does. */
function m01Faces() {
  const mission = missionById('m01')!;
  const map = new WorldMap(mission.map);
  const theme = lookTheme('m01', mission.map.look?.theme);
  const seed = hashStr('m01');
  const out: { tex: string; decal: string | null }[] = [];
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const cell = map.cellAt(tx, ty);
      if (cell?.kind !== 'wall') continue;
      for (const [dx, dz] of DIRS) {
        const n = map.cellAt(tx + dx, ty + dz);
        if (!n || n.kind === 'wall' || n.kind === 'door') continue;
        const h = (Math.imul(tx * 2 + dx + 1, 73856093) ^ Math.imul(ty * 2 + dz + 1, 19349663) ^ seed) >>> 0;
        out.push(pickWallFace(cell.tex, h, theme, variantCount));
      }
    }
  }
  return out;
}

describe('office corridor texture variety (P1-11)', () => {
  it('registers three office wall alternates, each with baked wear variants', () => {
    expect(OFFICE_WALL_ALTS.length).toBe(3);
    for (const id of OFFICE_WALL_ALTS) {
      expect(textureRegistry.get(id), id).toBeTruthy();
      expect(variantCount(id)).toBeGreaterThan(1);
    }
  });

  it('office decals are opaque cut-outs: alpha only 0 (cut) or lit, never the fullbright band', () => {
    for (const id of OFFICE_DECALS) {
      const t = textureRegistry.require(id) as unknown as { image: { data: Uint8Array } };
      const d = t.image.data;
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) {
        const a = d[i];
        // 128 = fullbright (glow layer); a translucent texel (1-254 except 128)
        // would be drawn unlit-fullbright by the world shader
        expect(a === 0 || a === 255 || a === 128, `${id} alpha ${a}`).toBe(true);
        if (a > 0) painted++;
      }
      expect(painted, id).toBeGreaterThan(100);
    }
  });

  it('the office and bullpen themes pool the new decals', () => {
    for (const id of OFFICE_DECALS) expect(lookTheme('m01').decals).toContain(id);
    expect(lookTheme('m03').decals).toContain('decal-stain');
  });

  it('M01 wall runs mix alternates and carry decals (no single repeated tile)', () => {
    const faces = m01Faces();
    expect(faces.length).toBeGreaterThan(200);
    const families = new Set(faces.map((f) => f.tex.split(':')[0]));
    for (const id of OFFICE_WALL_ALTS) expect(families.has(id), id).toBe(true);
    const alt = faces.filter((f) => (OFFICE_WALL_ALTS as readonly string[]).includes(f.tex.split(':')[0])).length / faces.length;
    expect(alt).toBeGreaterThan(0.15);
    expect(alt).toBeLessThan(0.35);
    const decals = faces.filter((f) => f.decal).length / faces.length;
    expect(decals).toBeGreaterThan(0.08);
    expect(decals).toBeLessThan(0.3);
    expect(new Set(faces.map((f) => f.decal).filter(Boolean)).size).toBeGreaterThanOrEqual(5);
  });

  it('keeps the original pick for non-office families (other missions unchanged)', () => {
    const theme = { alts: ['wall-tech', 'wall-panel2'], decals: ['decal-vent', 'decal-cable'] };
    for (let h = 0; h < 5000; h += 37) {
      let tex = 'wall-panel';
      if (h % 4 === 0) tex = theme.alts[(h >>> 4) % theme.alts.length];
      const nv = variantCount(tex);
      if (nv > 1 && (h >>> 16) % nv > 0) tex = `${tex}:v${(h >>> 16) % nv}`;
      const decal = DECALABLE.has(tex.split(':')[0]) && (h >>> 8) % 3 === 0 ? theme.decals[(h >>> 12) % theme.decals.length] : null;
      expect(pickWallFace('wall-panel', h, theme, variantCount)).toEqual({ tex, decal });
    }
  });
});
