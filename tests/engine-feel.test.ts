import { describe, expect, it, vi } from 'vitest';
import { alertNear, hurtEntity, updateEntities, updateProjectiles, type AiHooks } from '../src/engine/ai';
import { Feel, WeaponSwitch } from '../src/engine/feel';
import { WorldMap } from '../src/engine/map';
import { Player } from '../src/engine/player';
import type { Entity, MapDef, Projectile } from '../src/core/types';

const mapDef: MapDef = {
  grid: ['#########', '#.......#', '#.......#', '#.......#', '#########'],
  legend: {
    '#': { kind: 'wall', tex: 'wall' },
    '.': { kind: 'floor', tex: 'floor' },
  },
  spawn: { x: 2.5, y: 2.5, angle: 0 },
};

function enemy(id: string, sprite = 'worm', x = 2.5, y = 2.5): Entity {
  return {
    def: { id, kind: 'enemy', sprite, ai: 'chase', x, y },
    x, y, hp: 1, alive: true, infected: true, state: {},
  };
}

function hooks(overrides: Partial<AiHooks> = {}): AiHooks {
  return {
    onSight: vi.fn(),
    onWindup: vi.fn(),
    onMelee: vi.fn(),
    onFire: vi.fn(),
    ...overrides,
  };
}

describe('Feel', () => {
  it('returns a weapon switch exactly once and becomes ready after 0.36s', () => {
    const swap = new WeaponSwitch('keyboard');
    swap.request('usb');
    expect(swap.ready).toBe(false);
    expect(swap.update(0.16)).toBe('usb');
    expect(swap.update(0.01)).toBeNull();
    expect(swap.update(0.19)).toBeNull();
    expect(swap.ready).toBe(true);
    expect(swap.current).toBe('usb');
  });
});

describe('Doom enemy AI', () => {
  it('keeps idle enemies asleep when a wall blocks LOS', () => {
    const map = new WorldMap({
      ...mapDef,
      grid: ['#########', '#...#...#', '#...#...#', '#...#...#', '#########'],
    });
    const e = enemy('behind-wall', 'worm', 2.5, 2.5);
    e.def.x = 2.5;
    const player = new Player(6.5, 2.5, 0);
    const h = hooks();
    updateEntities([e], map, player, 1 / 60, h);
    expect(e.state.mode ?? 'idle').toBe('idle');
    expect(h.onSight).not.toHaveBeenCalled();
  });

  it('wakes an enemy in LOS once and telegraphs melee before damage', () => {
    const map = new WorldMap(mapDef);
    const e = enemy('worm', 'worm', 2.5, 2.5);
    const player = new Player(3.3, 2.5, 0);
    const onSight = vi.fn();
    const onMelee = vi.fn();
    const h = hooks({ onSight, onMelee });
    let elapsed = 0;
    for (let i = 0; i < 20; i++) {
      updateEntities([e], map, player, 0.025, h);
      elapsed += 0.025;
    }
    expect(onSight).toHaveBeenCalledTimes(1);
    expect(onMelee).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) {
      updateEntities([e], map, player, 0.025, h);
      elapsed += 0.025;
    }
    expect(elapsed).toBeCloseTo(1, 8);
    expect(onMelee).toHaveBeenCalled();
  });

  it('fires trojan projectiles at the player after windup', () => {
    const map = new WorldMap(mapDef);
    const e = enemy('trojan', 'trojan', 2.5, 2.5);
    const player = new Player(5.5, 2.5, 0);
    const onFire = vi.fn();
    const h = hooks({ onFire });
    for (let i = 0; i < 120 && onFire.mock.calls.length === 0; i++) {
      updateEntities([e], map, player, 0.025, h);
    }
    expect(onFire).toHaveBeenCalled();
    const projectile = onFire.mock.calls[0][1];
    expect(projectile.hostile).toBe(true);
    expect(projectile.dx).toBeCloseTo(1);
    expect(projectile.dy).toBeCloseTo(0);
  });

  it('keeps hostile projectiles off entities and friendly projectiles off players', () => {
    const map = new WorldMap(mapDef);
    const target = enemy('target', 'worm', 2.6, 2.5);
    const player = new Player(6, 2.5, 0);
    const hostile: Projectile = {
      x: 2.5, y: 2.5, dx: 1, dy: 0, speed: 1, range: 10, traveled: 0,
      source: 'enemy:test', alive: true, hostile: true, damage: 10,
    };
    expect(updateProjectiles([hostile], [target], map, 0.1, player)).toEqual([]);
    const friendly: Projectile = {
      ...hostile, x: 2.5, source: 'usb:test', hostile: false, alive: true,
    };
    const friendlyEvents = updateProjectiles([friendly], [], map, 0.1, new Player(2.6, 2.5, 0));
    expect(friendlyEvents).toEqual([]);
    const playerHit = updateProjectiles(
      [{ ...hostile, x: 5.5, alive: true }],
      [],
      map,
      0.1,
      new Player(5.6, 2.5, 0),
    );
    expect(playerHit[0].hitPlayer).toBe(true);
  });

  it('stuns enemies for pain and alertNear wakes only enemies in range', () => {
    const map = new WorldMap(mapDef);
    const hurt = enemy('hurt', 'worm', 2.5, 2.5);
    hurtEntity(hurt, 1, 0);
    updateEntities([hurt], map, new Player(7, 2.5, 0), 0.1, hooks());
    expect(hurt.state.mode).toBe('pain');
    expect(hurt.x).toBeGreaterThan(2.5);
    const near = enemy('near', 'worm', 2.5, 2.5);
    const far = enemy('far', 'worm', 7.5, 2.5);
    alertNear([near, far], 2.5, 2.5, 2);
    expect(near.state.mode).toBe('chase');
    expect(far.state.mode ?? 'idle').toBe('idle');
  });
});
