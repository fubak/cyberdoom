import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { toolRegistry } from '../src/tools';
import { defaultLoadout } from '../src/tools/arsenal';

/**
 * Doom-style progression invariants for every built mission:
 *  - at least one tool is FOUND in the world (not issued at the start);
 *  - every resource used by an issued or found tool has >= 2 placed pickups;
 *  - each pickup kind has its own sprite, and every pickup sits on open floor;
 *  - MFA doors only appear in missions that issue the MFA token.
 */
describe('mission pickups and tool finds', () => {
  for (const m of missionRegistry.all()) {
    const issued = defaultLoadout(m);
    const items = m.entities.filter((e) => e.kind === 'item' && e.grants);
    const found = items.filter((e) => e.grants!.resource.startsWith('tool:')).map((e) => e.grants!.resource.slice(5));

    it(`${m.id}: at least one tool is found in the world`, () => {
      expect(found.length, `${m.id} has no tool:<id> pickup`).toBeGreaterThan(0);
      for (const id of found) {
        expect(toolRegistry.get(id), id).toBeDefined();
        expect(issued, `${id} is found in ${m.id} but also issued`).not.toContain(id);
      }
    });

    it(`${m.id}: every issued/found tool resource has >= 2 pickups`, () => {
      const tools = [...new Set([...issued, ...found])].map((id) => toolRegistry.get(id)!);
      for (const t of tools) {
        if (!t.ammo) continue;
        const n = items.filter((e) => e.grants!.resource === t.ammo!.resource).length;
        expect(n, `${m.id}: ${t.ammo.resource} pickups for ${t.id}`).toBeGreaterThanOrEqual(2);
      }
    });

    it(`${m.id}: pickups use distinct sprites per kind and sit on floor`, () => {
      const spriteFor = new Map<string, string>();
      for (const e of items) {
        const r = e.grants!.resource;
        if (r.startsWith('role:')) continue;
        const prev = spriteFor.get(r);
        if (prev) expect(e.sprite, `${e.id}`).toBe(prev);
        spriteFor.set(r, e.sprite);
        const cell = m.map.legend[m.map.grid[Math.floor(e.y)][Math.floor(e.x)]];
        expect(cell?.kind, `${e.id} at ${e.x},${e.y}`).toBe('floor');
      }
      const sprites = [...spriteFor.values()];
      expect(new Set(sprites).size, `${m.id} pickup sprites`).toBe(sprites.length);
    });

    it(`${m.id}: MFA doors are only placed where the token is issued`, () => {
      const mfaDoors = Object.values(m.map.legend).filter((c) => c.mfa);
      if (mfaDoors.length) expect(issued).toContain('mfa');
    });
  }
});
