import { describe, expect, it, vi } from 'vitest';
import { alertNear, damageEntity, ENEMY_RADIUS, hurtEntity, updateEntities, updateProjectiles, type AiHooks } from '../src/engine/ai';
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

const contactMapDef: MapDef = {
  grid: [
    '####################',
    ...Array.from({ length: 18 }, () => `#${'.'.repeat(18)}#`),
    '####################',
  ],
  legend: mapDef.legend,
  spawn: { x: 10, y: 10, angle: 0 },
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

function movementSolids(entities: Entity[]): { x: number; y: number; r: number }[] {
  return entities
    .filter((e) => e.alive && ['enemy', 'npc', 'workstation', 'console'].includes(e.def.kind))
    .map((e) => ({ x: e.x, y: e.y, r: 0.3 }));
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

  it('floods the view red on any damage, holds ~0.1s, then clears by ~0.5s', () => {
    const feel = new Feel();
    feel.hurt(6);
    expect(feel.red).toBeGreaterThanOrEqual(0.6);
    feel.update(0.1);
    expect(feel.red).toBeGreaterThanOrEqual(0.6);
    feel.update(0.4);
    expect(feel.red).toBe(0);
  });

  it('scales, eases, stacks and directs the hurt wash while retaining the bonus flash', () => {
    const smallHit = new Feel();
    smallHit.hurt(6, 1);
    expect(smallHit.red).toBeCloseTo(0.686, 3);
    expect(smallHit.hurtSide).toBeCloseTo(1);
    smallHit.update(0.05);
    expect(smallHit.red).toBeCloseTo(0.686, 3);
    smallHit.update(0.25);
    expect(smallHit.red).toBeGreaterThan(0);
    expect(smallHit.hurtSide).toBeGreaterThan(0);
    smallHit.update(0.13);
    expect(smallHit.red).toBe(0);
    expect(smallHit.hurtSide).toBe(0);

    const heavyHit = new Feel();
    heavyHit.hurt(18, -0.5);
    expect(heavyHit.red).toBeCloseTo(0.818, 3);
    expect(heavyHit.hurtSide).toBeCloseTo(-0.5);
    heavyHit.update(0.45);
    expect(heavyHit.red).toBeGreaterThan(0);
    heavyHit.update(0.05);
    expect(heavyHit.red).toBe(0);

    const cappedHit = new Feel();
    cappedHit.hurt(40, 0.75);
    expect(cappedHit.red).toBeCloseTo(0.9);
    cappedHit.update(0.55);
    expect(cappedHit.red).toBe(0);

    const stacked = new Feel();
    stacked.hurt(18, -1);
    stacked.update(0.2);
    stacked.hurt(6, 1);
    expect(stacked.red).toBeGreaterThanOrEqual(0.6);
    expect(stacked.hurtSide).toBeCloseTo(1);
    stacked.update(0.4);
    expect(stacked.red).toBeGreaterThan(0);
    stacked.update(0.05);
    expect(stacked.red).toBe(0);

    const feel = new Feel();
    feel.bonus();
    expect(feel.bonusAmt).toBeCloseTo(0.35);
    feel.update(0.125);
    expect(feel.bonusAmt).toBeCloseTo(0.175);
    feel.update(0.125);
    expect(feel.bonusAmt).toBe(0);
  });

  it('dips the camera on a kill punch and settles within ~150 ms', () => {
    const feel = new Feel();
    expect(feel.punchDip).toBe(0);
    feel.punch();
    expect(feel.punchDip).toBeGreaterThan(0.04);
    expect(Math.abs(feel.shake(0.123).yaw) + Math.abs(feel.shake(0.123).x)).toBeGreaterThan(0);
    feel.update(0.15);
    expect(feel.punchDip).toBeLessThan(0.01);
    feel.update(0.05);
    expect(feel.punchDip).toBe(0);
  });
});

describe('Doom enemy AI', () => {
  it('keeps a chasing worm at contact without displacing a stationary player', () => {
    const map = new WorldMap(contactMapDef);
    const player = new Player(10, 10, 0);
    const worm = enemy('contact-worm', 'worm', 4, 10);
    worm.state.facing = 0;
    const onMelee = vi.fn();
    const h = hooks({ onMelee });
    const startX = player.x;
    const startY = player.y;
    const dt = 1 / 60;

    for (let i = 0; i < 6 * 60; i++) {
      player.move(map, 0, 0, false, 0, dt, movementSolids([worm]));
      updateEntities([worm], map, player, dt, h);
    }

    expect(Math.hypot(player.x - startX, player.y - startY)).toBeLessThan(0.5);
    expect(Math.hypot(worm.x - player.x, worm.y - player.y)).toBeGreaterThanOrEqual(player.radius + ENEMY_RADIUS - 1e-6);
    expect(onMelee).toHaveBeenCalled();
  });

  it('scales bite knockback to its real friction displacement and prevents stacking', () => {
    const map = new WorldMap(contactMapDef);
    const single = new Player(10, 10, 0);
    single.knockback(1, 0, 0.16);
    for (let i = 0; i < 120; i++) single.move(map, 0, 0, false, 0, 1 / 60);
    expect(single.x - 10).toBeCloseTo(0.146, 2);

    const heavy = new Player(10, 10, 0);
    heavy.knockback(1, 0, 0.28);
    for (let i = 0; i < 120; i++) heavy.move(map, 0, 0, false, 0, 1 / 60);
    expect(heavy.x - 10).toBeGreaterThanOrEqual(0.25);
    expect(heavy.x - 10).toBeLessThanOrEqual(0.28);

    const repeated = new Player(10, 10, 0);
    for (let i = 0; i < 30; i++) {
      repeated.knockback(1, 0, 0.16);
      repeated.move(map, 0, 0, false, 0, 1 / 60);
    }
    expect(repeated.x - 10).toBeLessThanOrEqual(0.35);
  });

  it('keeps bite knockback bounded during a six-second chase', () => {
    const map = new WorldMap(contactMapDef);
    const player = new Player(10, 10, 0);
    const worm = enemy('knockback-worm', 'worm', 4, 10);
    worm.state.facing = 0;
    const bites: { tick: number; x: number; y: number }[] = [];
    let tick = 0;
    const h = hooks({
      onMelee: (e, dmg) => {
        player.knockback(player.x - e.x, player.y - e.y, Math.min(0.35, 0.1 + dmg * 0.01));
        bites.push({ tick, x: player.x, y: player.y });
      },
    });
    const startX = player.x;
    const startY = player.y;
    const positions: { x: number; y: number }[] = [];
    const dt = 1 / 60;

    for (tick = 0; tick < 6 * 60; tick++) {
      player.move(map, 0, 0, false, 0, dt, movementSolids([worm]));
      updateEntities([worm], map, player, dt, h);
      positions.push({ x: player.x, y: player.y });
    }

    expect(bites.length).toBeGreaterThanOrEqual(2);
    for (const bite of bites) {
      const after = positions[Math.min(positions.length - 1, bite.tick + 30)];
      expect(Math.hypot(after.x - bite.x, after.y - bite.y)).toBeLessThanOrEqual(0.35);
    }
    expect(Math.hypot(player.x - startX, player.y - startY)).toBeLessThan(2);
    expect(Math.hypot(worm.x - player.x, worm.y - player.y)).toBeGreaterThanOrEqual(player.radius + ENEMY_RADIUS - 1e-6);
  });

  it('stops enemy knockback before it enters the player contact circle', () => {
    const map = new WorldMap(contactMapDef);
    const player = new Player(10, 10, 0);
    const e = enemy('pushed-toward-player', 'worm', 10.7, 10);
    e.def.ai = 'stand';
    e.state.knockVx = -1.5;
    for (let i = 0; i < 120; i++) updateEntities([e], map, player, 1 / 60, hooks());
    expect(Math.hypot(e.x - player.x, e.y - player.y)).toBeGreaterThanOrEqual(player.radius + ENEMY_RADIUS - 1e-6);
  });

  it('distinguishes surviving damage from kills and marks every surviving hit', () => {
    const hurt = enemy('hurt', 'worm');
    hurt.hp = 2;
    expect(damageEntity(hurt, 1, 1, 0)).toBe('hurt');
    expect(hurt.hp).toBe(1);
    expect(hurt.hurtT).toBe(0.1);

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
    expect(stunned.hurtT).toBe(0.1);
    // melee-range (<2 tiles) knockback is reduced so follow-up swings connect
    expect(stunned.state.knockVx).toBe(0.55);

    const unstunned = enemy('unstunned', 'worm');
    hurtEntity(unstunned, 1, 0, () => 0.99);
    expect(unstunned.state.mode).toBe('chase');
    expect(unstunned.hurtT).toBe(0.1);
    expect(unstunned.state.knockVx).toBe(0.55);

    const ranged = enemy('ranged', 'worm');
    hurtEntity(ranged, 3, 0, () => 0.99);
    expect(ranged.state.knockVx).toBe(1.5); // ranged hits keep the full shove

    const trojan = enemy('trojan', 'trojan');
    hurtEntity(trojan, 1, 0, () => 0.5);
    expect(trojan.state.mode).toBe('pain');
    const ransomware = enemy('ransomware', 'ransomware');
    hurtEntity(ransomware, 1, 0, () => 0.5);
    expect(ransomware.state.mode).toBe('chase');
    expect(ransomware.hurtT).toBe(0.1);
  });

  it('preserves a windup after a non-stunning hit and records the rootkit hurt time', () => {
    const windup = enemy('windup', 'worm');
    windup.state.mode = 'windup';
    windup.state.windupT = 0.5;
    windup.state.aiClock = 7.5;
    hurtEntity(windup, 1, 0, () => 0.99);
    expect(windup.state.mode).toBe('windup');
    expect(windup.state.windupT).toBe(0.5);
    expect(windup.state.lastHurtAt).toBe(7.5);

    const profileOverride = enemy('profile-override', 'ransomware');
    profileOverride.def.threat = 'worm';
    hurtEntity(profileOverride, 1, 0, () => 0.7);
    expect(profileOverride.state.mode).toBe('pain');
  });

  it('pauses wandering during pain and resumes afterward', () => {
    const map = new WorldMap(mapDef);
    const e = enemy('wanderer', 'worm');
    e.def.ai = 'wander';
    e.state.wanderA = 0;
    // pain entered without an alert (hurtEntity now aggros wanderers — F1);
    // facing away from the player so it can't spot them when pain ends
    e.state.mode = 'pain';
    e.state.painT = 0.2;
    e.state.facing = Math.PI;
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
    hurtEntity(open, 3, 0, () => 0.99); // attacker 3 tiles out: full knockback
    for (let i = 0; i < 120; i++) updateEntities([open], map, player, 1 / 60, hooks());
    expect(open.x - 4.5).toBeGreaterThanOrEqual(0.25);
    expect(open.x - 4.5).toBeLessThanOrEqual(0.35);

    // a melee-range hit keeps the target inside the keyboard's 1.5-tile arc:
    // ~0.1 tiles of shove instead of being punched out of reach
    const melee = enemy('melee', 'worm', 4.5, 3.5);
    melee.def.ai = 'stand';
    hurtEntity(melee, 1, 0, () => 0.99);
    for (let i = 0; i < 120; i++) updateEntities([melee], map, player, 1 / 60, hooks());
    expect(melee.x - 4.5).toBeGreaterThanOrEqual(0.07);
    expect(melee.x - 4.5).toBeLessThanOrEqual(0.16);

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
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    try {
      for (let i = 0; i < 120 && onFire.mock.calls.length === 0; i++) {
        updateEntities([e], map, player, 0.025, h);
      }
    } finally {
      rand.mockRestore();
    }
    expect(onFire).toHaveBeenCalled();
    const projectile = onFire.mock.calls[0][1];
    expect(projectile.hostile).toBe(true);
    expect(projectile.dx).toBeCloseTo(1);
    expect(projectile.dy).toBeCloseTo(0);
  });

  it('hostile projectiles hit other enemies (infighting) and friendly projectiles stay off players', () => {
    const map = new WorldMap(mapDef);
    const target = enemy('target', 'worm', 2.6, 2.5);
    const player = new Player(6, 2.5, 0);
    const hostile: Projectile = {
      x: 2.5, y: 2.5, dx: 1, dy: 0, speed: 1, range: 10, traveled: 0,
      source: 'enemy:test', alive: true, hostile: true, damage: 10,
    };
    // shooter is a different enemy than the target → the projectile connects
    const hostileEvents = updateProjectiles([hostile], [target], map, 0.1, player);
    expect(hostileEvents[0]?.hit).toBe(target);
    // ...but never its own shooter
    const selfShot: Projectile = {
      x: 2.5, y: 2.5, dx: 1, dy: 0, speed: 1, range: 10, traveled: 0,
      source: 'enemy:target', alive: true, hostile: true, damage: 10,
    };
    expect(updateProjectiles([selfShot], [target], map, 0.1, player)).toEqual([]);
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
    expect(hurt.hurtT).toBeCloseTo(0);
    expect(hurt.x).toBeGreaterThan(2.5);
    const near = enemy('near', 'worm', 2.5, 2.5);
    const far = enemy('far', 'worm', 7.5, 2.5);
    alertNear([near, far], 2.5, 2.5, 2);
    expect(near.state.mode).toBe('chase');
    expect(far.state.mode ?? 'idle').toBe('idle');
  });

  it('keeps render state finite while chasing (regression: uninitialised phase made hop NaN)', () => {
    const map = new WorldMap(mapDef);
    const worm = enemy('chase-worm', 'worm', 7, 2.5);
    const player = new Player(1.5, 2.5, 0); // ~5.5 tiles ahead, clear LOS
    const h = hooks();
    for (let i = 0; i < 10; i++) updateEntities([worm], map, player, 0.025, h);
    expect(worm.state.mode).toBe('chase');
    expect(Number.isFinite(worm.state.hop)).toBe(true);
    expect(Number.isFinite(worm.state.scale)).toBe(true);
  });

  it('keeps hop finite for a fresh idle enemy after one tick', () => {
    const map = new WorldMap(mapDef);
    const idle = enemy('idle-worm', 'worm', 7, 2.5);
    const player = new Player(1.5, 2.5, Math.PI); // facing away, far end of map
    updateEntities([idle], map, player, 0.025, hooks());
    expect(Number.isFinite(idle.state.hop)).toBe(true);
    expect(Number.isFinite(idle.state.scale)).toBe(true);
  });
});
