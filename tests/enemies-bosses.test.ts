import { describe, expect, it } from 'vitest';
import { ENEMY_PROFILES, updateEntities } from '../src/engine/ai';
import { WorldMap } from '../src/engine/map';
import { Player } from '../src/engine/player';
import { spriteModels } from '../src/render/sprites';
import { SFX_DEFS, renderSfx } from '../src/engine/audio/sfxdef';
import { missionById } from '../src/content/missions';
import type { Entity, Projectile } from '../src/core/types';

function openMap(): WorldMap {
  return new WorldMap({
    legend: { '#': { kind: 'wall', tex: 'wall-server' }, '.': { kind: 'floor', tex: 'floor-tile' } },
    grid: [
      '#########',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#########',
    ],
    spawn: { x: 2.5, y: 3.5, angle: 0 },
  });
}

function makeEnemy(id: string, sprite: string, x = 6.5, y = 3.5): Entity {
  return {
    def: { id, kind: 'enemy', x, y, sprite, threat: sprite, ai: 'chase', hp: 20, infected: true },
    x,
    y,
    hp: 20,
    alive: true,
    infected: true,
    state: { awake: true, attackCd: 0 },
  };
}

describe('D2 enemy variants and bosses', () => {
  const newTypes = ['botnet', 'wiper', 'boss-locker', 'boss-ghostledger'] as const;

  it('registers AI profiles, sprite models, and audio for all new threat types', () => {
    for (const id of newTypes) {
      expect(ENEMY_PROFILES[id]).toBeDefined();
      expect(spriteModels[id]).toBeTypeOf('function');
      expect(SFX_DEFS[`sight-${id}`]).toBeDefined();
      expect(renderSfx(`attack-${id}`, 22050)).not.toBeNull();
      expect(renderSfx(`death-${id}`, 22050)).not.toBeNull();
    }
    expect(ENEMY_PROFILES['boss-locker'].boss).toBe(true);
    expect(ENEMY_PROFILES['boss-ghostledger'].boss).toBe(true);
    expect(ENEMY_PROFILES.botnet.boss).toBeFalsy();
    expect(ENEMY_PROFILES.wiper.boss).toBeFalsy();
  });

  it('fires multi-bolt fan volleys matching spreadCount and spreadAngle', () => {
    for (const id of newTypes) {
      const map = openMap();
      const player = new Player(2.5, 3.5, 0);
      const enemy = makeEnemy(`e-${id}`, id);
      const fired: Projectile[] = [];
      const hooks = {
        onFire: (_e: Entity, p: Projectile) => { fired.push(p); },
        onSight: () => {},
        onWindup: () => {},
        onMelee: () => {},
      };
      // Advance through windup until the volley fires
      for (let i = 0; i < 60 && fired.length === 0; i++) {
        updateEntities([enemy], map, player, 0.05, hooks);
      }
      const profile = ENEMY_PROFILES[id];
      expect(fired.length).toBe(profile.spreadCount);
      if (fired.length > 1) {
        const base = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        const rels = fired.map((p) => {
          const d = Math.atan2(p.dy, p.dx) - base;
          return Math.atan2(Math.sin(d), Math.cos(d));
        });
        const span = Math.max(...rels) - Math.min(...rels);
        expect(span).toBeCloseTo(profile.spreadAngle!, 2);
      }
    }
  });

  it('places bosses and variants in late-campaign missions', () => {
    const m07 = missionById('m07')!;
    const m08 = missionById('m08')!;
    const m09 = missionById('m09')!;
    const m12 = missionById('m12')!;
    expect(m07.entities.some((e) => e.sprite === 'botnet')).toBe(true);
    expect(m08.entities.some((e) => e.sprite === 'wiper')).toBe(true);
    expect(m09.entities.some((e) => e.sprite === 'boss-locker')).toBe(true);
    expect(m12.entities.some((e) => e.sprite === 'boss-ghostledger')).toBe(true);
  });
});
