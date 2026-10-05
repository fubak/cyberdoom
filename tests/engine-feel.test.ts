import { describe, expect, it, vi } from 'vitest';
import { alertNear, damageEntity, hurtEntity, updateEntities, updateProjectiles, type AiHooks } from '../src/engine/ai';
import { Feel } from '../src/engine/feel';
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
  it('applies and decays trauma shake', () => {
    const feel = new Feel();
    const initial = feel.shake(0);
    expect(Math.hypot(initial.yaw, initial.x, initial.y)).toBe(0);
    feel.hurt(40);
    const shake = feel.shake(0.123);
    expect(Math.abs(shake.yaw) + Math.abs(shake.x) + Math.abs(shake.y)).toBeGreaterThan(0);
    feel.update(1);
    const decayed = feel.shake(0.123);
    expect(Math.hypot(decayed.yaw, decayed.x, decayed.y)).toBe(0);
  });

  it('linearly decays the hurt palette and bonus flash', () => {
    const feel = new Feel();
    const smallHit = new Feel();
    smallHit.hurt(1);
    expect(smallHit.red).toBeCloseTo(0.15);

    feel.hurt(10);
    expect(feel.red).toBeCloseTo(0.4);
    feel.update(0.2);
    expect(feel.red).toBeCloseTo(0.2);
    feel.update(0.2);
    expect(feel.red).toBe(0);

    feel.hurt(100);
    expect(feel.red).toBeCloseTo(0.6);
    feel.bonus();
    expect(feel.bonusAmt).toBeCloseTo(0.35);
    feel.update(0.125);
    expect(feel.red).toBeCloseTo(0.4125);
    expect(feel.bonusAmt).toBeCloseTo(0.175);
    feel.update(0.125);
    expect(feel.red).toBeCloseTo(0.225);
    expect(feel.bonusAmt).toBe(0);
    feel.update(0.15);
    expect(feel.red).toBe(0);
  });
});

describe('Doom enemy AI', () => {
  it('distinguishes surviving damage from kills and marks every surviving hit', () => {
    const hurt = enemy('hurt', 'worm');
    hurt.hp = 2;
    expect(damageEntity(hurt, 1, 1, 0)).toBe('hurt');
    expect(hurt.hp).toBe(1);
    expect(hurt.hurtT).toBe(0.25);

    const killed = enemy('killed', 'worm');
    expect(damageEntity(killed, 1, 1, 0)).toBe('killed');
    expect(killed.hp).toBe(0);
    expect(killed.hurtT).toBeUndefined();
  });

  it('stuns according to painChance while all hits still knock back and flash', () => {
    const stunned = enemy('stunned', 'worm');
    hurtEntity(stunned, 1, 0, () => 0.1);
    expect(stunned.state.mode).toBe('pain');
    expect(stunned.state.painT).toBe(0.2);
    expect(stunned.hurtT).toBe(0.25);
    expect(stunned.state.knockVx).toBe(1.5);

    const unstunned = enemy('unstunned', 'worm');
    hurtEntity(unstunned, 1, 0, () => 0.99);
    expect(unstunned.state.mode).toBeUndefined();
    expect(unstunned.hurtT).toBe(0.25);
    expect(unstunned.state.knockVx).toBe(1.5);

    const trojan = enemy('trojan', 'trojan');
    hurtEntity(trojan, 1, 0, () => 0.5);
    expect(trojan.state.mode).toBe('pain');
    const ransomware = enemy('ransomware', 'ransomware');
    hurtEntity(ransomware, 1, 0, () => 0.5);
    expect(ransomware.state.mode).toBeUndefined();
    expect(ransomware.hurtT).toBe(0.25);
  });

  it('pauses wandering during pain and resumes afterward', () => {
    const map = new WorldMap(mapDef);
    const e = enemy('wanderer', 'worm');
    e.def.ai = 'wander';
    e.state.wanderA = 0;
    hurtEntity(e, 1, 0, () => 0.1);
    updateEntities([e], map, new Player(7, 2.5, 0), 0.1, hooks());
    expect(e.state.wanderT).toBeUndefined();
    updateEntities([e], map, new Player(7, 2.5, 0), 0.1, hooks());
    expect(e.state.mode).toBeUndefined();
    updateEntities([e], map, new Player(7, 2.5, 0), 0.1, hooks());
    expect(e.state.wanderT).toBeCloseTo(0.1);
  });

  it('knocks an enemy about 0.3 tiles in open space and resolves it against walls', () => {
    const map = new WorldMap(mapDef);
    const player = new Player(7, 2.5, 0);
    const open = enemy('open', 'worm', 4.5, 2.5);
    open.def.ai = 'stand';
    hurtEntity(open, 1, 0, () => 0.99);
    for (let i = 0; i < 120; i++) updateEntities([open], map, player, 1 / 60, hooks());
    expect(open.x - 4.5).toBeGreaterThanOrEqual(0.25);
    expect(open.x - 4.5).toBeLessThanOrEqual(0.35);

    const blocked = enemy('blocked', 'worm', 7.6, 2.5);
    blocked.def.ai = 'stand';
    hurtEntity(blocked, 1, 0, () => 0.99);
    for (let i = 0; i < 120; i++) updateEntities([blocked], map, player, 1 / 60, hooks());
    expect(blocked.x).toBeLessThanOrEqual(7.7);
    expect(blocked.x).toBeGreaterThan(7.6);
    expect(map.resolve(blocked.x, blocked.y, 0.3).x).toBeCloseTo(blocked.x, 5);
  });

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
    hurtEntity(hurt, 1, 0, () => 0.1);
    updateEntities([hurt], map, new Player(7, 2.5, 0), 0.1, hooks());
    expect(hurt.state.mode).toBe('pain');
    expect(hurt.hurtT).toBeCloseTo(0.15);
    expect(hurt.x).toBeGreaterThan(2.5);
    const near = enemy('near', 'worm', 2.5, 2.5);
    const far = enemy('far', 'worm', 7.5, 2.5);
    alertNear([near, far], 2.5, 2.5, 2);
    expect(near.state.mode).toBe('chase');
    expect(far.state.mode ?? 'idle').toBe('idle');
  });
});
