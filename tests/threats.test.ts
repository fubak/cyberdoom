import { describe, expect, it, vi } from 'vitest';
import { ENEMY_PROFILES, WORM_PROPAGATE_MAX, hurtEntity, updateEntities, updateProjectiles, type AiHooks } from '../src/engine/ai';
import { WorldMap } from '../src/engine/map';
import { Player } from '../src/engine/player';
import type { Entity, MapDef } from '../src/core/types';

const mapDef: MapDef = {
  grid: ['#########', '#.......#', '#.......#', '#.......#', '#########'],
  legend: {
    '#': { kind: 'wall', tex: 'wall' },
    '.': { kind: 'floor', tex: 'floor' },
  },
  spawn: { x: 2.5, y: 2.5, angle: 0 },
};

function enemy(id: string, sprite: string, x: number, y: number, hp = 1): Entity {
  return {
    def: { id, kind: 'enemy', sprite, ai: 'chase', x, y, hp },
    x, y, hp, alive: true, infected: true, state: {},
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

describe('infighting', () => {
  it('hostile projectiles collide with other enemies', () => {
    const map = new WorldMap(mapDef);
    const victim = enemy('w1', 'worm', 4, 2.5, 3);
    const player = new Player(2.5, 5.5, 0);
    const p = {
      x: 2.5, y: 2.5, dx: 1, dy: 0, speed: 10, range: 16,
      source: 'enemy:rat1', hostile: true, damage: 8, alive: true, traveled: 0,
    };
    let events: ReturnType<typeof updateProjectiles> = [];
    for (let i = 0; i < 6 && !events.length; i++) {
      events = updateProjectiles([p], [victim], map, 0.05, player);
    }
    expect(events[0]?.hit).toBe(victim);
    expect(p.alive).toBe(false);
  });

  it('a shooter ignores itself but a grudged enemy aims at its attacker', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const map = new WorldMap(mapDef);
    const shooter = enemy('rat1', 'rat', 2.5, 2.5, 3);
    const victim = enemy('worm1', 'worm', 5.5, 2.5, 3);
    shooter.state.grudgeId = 'worm1';
    shooter.state.grudgeT = 8;
    shooter.state.aggroed = true;
    shooter.state.mode = 'chase';
    const player = new Player(2.5, 5.5, 0); // off-axis: aim should not follow the player
    const onFire = vi.fn();
    for (let i = 0; i < 400 && !onFire.mock.calls.length; i++) {
      updateEntities([shooter, victim], map, player, 0.025, hooks({ onFire }));
    }
    expect(onFire).toHaveBeenCalled();
    const proj = onFire.mock.calls[0][1];
    expect(proj.dx).toBeGreaterThan(0.8); // aimed +x toward the worm
    expect(Math.abs(proj.dy)).toBeLessThan(0.3);
    vi.restoreAllMocks();
  });
});

describe('new threat profiles', () => {
  it('telegraphs a logic bomb and deals its close-range blast before disappearing', () => {
    const map = new WorldMap(mapDef);
    const bomb = enemy('bomb', 'logicbomb', 2.5, 2.5);
    const player = new Player(4.5, 2.5, 0);
    const onSight = vi.fn();
    const onWindup = vi.fn();
    const onMelee = vi.fn();
    const h = hooks({ onSight, onWindup, onMelee });

    for (let i = 0; i < 60 && bomb.alive; i++) {
      updateEntities([bomb], map, player, 0.025, h);
    }

    expect(onSight).toHaveBeenCalledTimes(1);
    expect(onWindup).toHaveBeenCalledWith(bomb, 1.4);
    expect(onMelee).toHaveBeenCalledWith(bomb, 22);
    expect(bomb.alive).toBe(false);
  });

  it('fires a rat projectile, then retreats for seven tenths of a second', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const map = new WorldMap(mapDef);
    const rat = enemy('rat', 'rat', 2.5, 2.5);
    const player = new Player(5.5, 2.5, 0);
    const onFire = vi.fn();
    const h = hooks({ onFire });

    for (let i = 0; i < 120 && onFire.mock.calls.length === 0; i++) {
      updateEntities([rat], map, player, 0.025, h);
    }
    expect(onFire).toHaveBeenCalled();
    expect(onFire.mock.calls[0][1]).toMatchObject({ speed: 7, damage: 8 });
    expect(rat.state.mode).toBe('retreat');
    expect(rat.state.retreatT).toBe(0.7);

    const xAtShot = rat.x;
    updateEntities([rat], map, player, 0.025, h);
    expect(rat.x).toBeLessThan(xAtShot);
    for (let i = 0; i < 30; i++) updateEntities([rat], map, player, 0.025, h);
    expect(rat.state.mode).toBe('chase');
    vi.restoreAllMocks();
  });

  it('regenerates rootkit health after a three-second quiet period, up to maxHp', () => {
    const map = new WorldMap(mapDef);
    const rootkit = enemy('rootkit', 'rootkit', 2.5, 2.5, 3);
    rootkit.hp = 1;
    rootkit.state.aggro = 1;
    rootkit.state.maxHp = 3;
    const player = new Player(6.5, 2.5, 0);
    const h = hooks();
    hurtEntity(rootkit, 1, 0);

    for (let i = 0; i < 230; i++) updateEntities([rootkit], map, player, 0.025, h);
    expect(rootkit.hp).toBe(1);
    for (let i = 0; i < 20; i++) updateEntities([rootkit], map, player, 0.025, h);
    expect(rootkit.hp).toBe(2);
    for (let i = 0; i < 130; i++) updateEntities([rootkit], map, player, 0.025, h);
    expect(rootkit.hp).toBe(3);
    for (let i = 0; i < 300; i++) updateEntities([rootkit], map, player, 0.025, h);
    expect(rootkit.hp).toBe(3);
  });

  it('keeps rootkits hidden outside half aggro range and uses its melee profile', () => {
    const map = new WorldMap(mapDef);
    const rootkit = enemy('rootkit-hidden', 'rootkit', 2.5, 2.5, 3);
    rootkit.state.aggro = 4;
    rootkit.state.maxHp = 3;
    const player = new Player(5.5, 2.5, 0);
    const onWindup = vi.fn();
    const onMelee = vi.fn();
    const h = hooks({ onWindup, onMelee });

    for (let i = 0; i < 20; i++) updateEntities([rootkit], map, player, 0.025, h);
    expect(rootkit.state.mode).toBeUndefined();

    player.x = 3.2;
    for (let i = 0; i < 100 && onMelee.mock.calls.length === 0; i++) {
      updateEntities([rootkit], map, player, 0.025, h);
    }
    expect(onWindup).toHaveBeenCalledWith(rootkit, 0.5);
    expect(onMelee).toHaveBeenCalledWith(rootkit, 12);
  });
});

describe('combat telegraph and drain floors', () => {
  it('every melee telegraph lasts at least 0.5s (Doom 0.51-0.69s attack frames)', () => {
    for (const [kind, profile] of Object.entries(ENEMY_PROFILES)) {
      if (!profile.ranged) {
        expect(profile.windup, kind).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it.each([
    ['M01', 1.0, 20],
    ['M12', 1.44, 12],
  ])('two adjacent worms take >=%ds to drain a full-integrity player at %s difficulty', (_label, speedMul, floor) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const map = new WorldMap(mapDef);
    const player = new Player(4.5, 2.5, 0);
    const worm = (id: string, x: number): Entity => {
      const w = enemy(id, 'worm', x, 2.5, 99);
      w.state.propN = WORM_PROPAGATE_MAX; // freeze propagation: measure 2-worm DPS only
      w.state.speedMul = speedMul; // runtime's difficultyScale dial
      return w;
    };
    const entities = [worm('w-a', 3.7), worm('w-b', 5.3)];
    let t = 0;
    let firstHitT = -1;
    const h = hooks({
      onMelee: (_e, dmg) => {
        if (firstHitT < 0) firstHitT = t;
        player.damage(dmg);
      },
    });
    while (player.integrity > 0 && t < 60) {
      updateEntities(entities, map, player, 0.025, h);
      t += 0.025;
    }
    expect(player.integrity).toBe(0);
    expect(t - firstHitT).toBeGreaterThanOrEqual(floor);
    vi.restoreAllMocks();
  });
});

describe('malware-type mechanics (SY0-701 2.4)', () => {
  it('worm self-propagates ~8s after first sighting, capped at 2 copies', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const map = new WorldMap(mapDef);
    const worm = enemy('w1', 'worm', 6.5, 2.5, 2);
    const player = new Player(2.5, 2.5, 0);
    const onSpawn = vi.fn();
    const onNotice = vi.fn();
    const entities = [worm];
    const h = hooks({ onSpawn, onNotice });

    for (let i = 0; i < 30; i++) updateEntities(entities, map, player, 0.025, h);
    expect(onNotice).toHaveBeenCalledWith(worm, expect.stringContaining('self-propagating'));
    expect(entities).toHaveLength(1);

    for (let i = 0; i < 350 && entities.length < 2; i++) updateEntities(entities, map, player, 0.025, h);
    expect(onSpawn).toHaveBeenCalledTimes(1);
    expect(entities).toHaveLength(2);
    const copy = entities[1];
    expect(copy.def.id).toBe('w1-c1');
    expect(copy.alive).toBe(true);
    expect(copy.def.tags).toEqual([]);

    for (let i = 0; i < 400 && entities.length < 3; i++) updateEntities(entities, map, player, 0.025, h);
    expect(entities).toHaveLength(3);
    for (let i = 0; i < 400; i++) updateEntities(entities, map, player, 0.025, h);
    expect(entities).toHaveLength(3); // cap reached, copies never re-propagate
    expect(onSpawn).toHaveBeenCalledTimes(2);
  });

  it('trojan sits frozen while disguised, reveals within 3 tiles and attacks', () => {
    const map = new WorldMap(mapDef);
    const trojan = enemy('t1', 'trojan', 2.5, 2.5, 3);
    trojan.state.facing = 0; // facing +x, straight at the player: inside aggro range
    const player = new Player(7.5, 2.5, Math.PI);
    const onSight = vi.fn();
    const onNotice = vi.fn();
    const onFire = vi.fn();
    const h = hooks({ onSight, onNotice, onFire });

    // Five tiles away in plain sight is still a pickup: no move, no chase, no shot.
    for (let i = 0; i < 80; i++) updateEntities([trojan], map, player, 0.025, h);
    expect(trojan.state.revealedTrojan).toBeUndefined();
    expect(trojan.state.mode).toBeUndefined();
    expect(trojan.x).toBe(2.5);
    expect(trojan.y).toBe(2.5);
    expect(onSight).not.toHaveBeenCalled();
    expect(onFire).not.toHaveBeenCalled();

    // Even a combat aggro without exposure keeps it planted.
    trojan.state.aggroed = true;
    trojan.state.mode = 'chase';
    for (let i = 0; i < 40; i++) updateEntities([trojan], map, player, 0.025, h);
    expect(trojan.state.revealedTrojan).toBeUndefined();
    expect(trojan.x).toBe(2.5);
    expect(trojan.y).toBe(2.5);
    expect(onFire).not.toHaveBeenCalled();

    // Closing within 3 tiles exposes it; then it hunts normally.
    player.x = 5.4;
    player.y = 2.5;
    for (let i = 0; i < 10; i++) updateEntities([trojan], map, player, 0.025, h);
    expect(trojan.state.revealedTrojan).toBe(true);
    expect(trojan.state.mode).toBe('chase');
    expect(trojan.state.aggroed).toBe(true);
    expect(onSight).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith(trojan, expect.stringContaining('disguised'));
  });

  it('trojan reveals when inspected at range', () => {
    const map = new WorldMap(mapDef);
    const trojan = enemy('t2', 'trojan', 2.5, 2.5, 3);
    const player = new Player(7.5, 2.5, Math.PI);
    trojan.state.revealed = true; // mouse inspect sets this via the runtime
    const onNotice = vi.fn();
    updateEntities([trojan], map, player, 0.025, hooks({ onNotice }));
    expect(trojan.state.revealedTrojan).toBe(true);
    expect(trojan.state.aggroed).toBe(true);
  });

  it('ransomware seals a door off the required path, never one needed to reach it', () => {
    const sealMap: MapDef = {
      grid: [
        '#######',
        '#.#...#',
        '#D#...#',
        '#.###.#',
        '#.....#',
        '#######',
      ],
      legend: {
        '#': { kind: 'wall', tex: 'wall' },
        '.': { kind: 'floor', tex: 'floor' },
        'D': { kind: 'door', tex: 'door', doorId: 'd1' },
      },
      spawn: { x: 1.5, y: 4.5, angle: 0 },
    };
    const map = new WorldMap(sealMap);
    const rw = enemy('rw1', 'ransomware', 4.5, 2.5, 4);
    rw.state.sighted = true;
    const player = new Player(1.5, 4.5, 0);
    const onSeal = vi.fn();
    const onUnseal = vi.fn();
    updateEntities([rw], map, player, 0.025, hooks({ onSeal, onUnseal }));
    expect(onSeal).toHaveBeenCalledTimes(1);
    expect(onSeal.mock.calls[0][1]).toMatchObject({ kind: 'door', id: 'd1' });

    rw.alive = false;
    updateEntities([rw], map, player, 0.025, hooks({ onUnseal }));
    expect(onUnseal).toHaveBeenCalledTimes(1);
    expect(onUnseal.mock.calls[0][1]).toMatchObject({ kind: 'door', id: 'd1' });
  });

  it('ransomware never seals the only door between player and itself', () => {
    const lockMap: MapDef = {
      grid: ['#######', '#...D..', '#######'],
      legend: {
        '#': { kind: 'wall', tex: 'wall' },
        '.': { kind: 'floor', tex: 'floor' },
        'D': { kind: 'door', tex: 'door', doorId: 'd1' },
      },
      spawn: { x: 5.5, y: 1.5, angle: Math.PI },
    };
    const map = new WorldMap(lockMap);
    const rw = enemy('rw2', 'ransomware', 1.5, 1.5, 4);
    rw.state.sighted = true;
    const player = new Player(5.5, 1.5, Math.PI);
    const onSeal = vi.fn();
    updateEntities([rw], map, player, 0.025, hooks({ onSeal }));
    expect(onSeal).not.toHaveBeenCalled();
    expect(rw.state.seal).toBeUndefined();
  });

  it('ransomware falls back to sealing a nearby console, released on death', () => {
    const map = new WorldMap(mapDef);
    const rw = enemy('rw3', 'ransomware', 4.5, 2.5, 4);
    rw.state.sighted = true;
    const console: Entity = {
      def: { id: 'con1', kind: 'console', sprite: 'console', x: 5.5, y: 2.5 },
      x: 5.5, y: 2.5, hp: 1, alive: true, infected: false, state: {},
    };
    const player = new Player(2.5, 2.5, 0);
    const onSeal = vi.fn();
    const entities = [rw, console];
    updateEntities(entities, map, player, 0.025, hooks({ onSeal }));
    expect(onSeal).toHaveBeenCalledWith(rw, expect.objectContaining({ kind: 'entity', id: 'con1' }));
    expect(console.state.sealedBy).toBe('rw3');

    rw.alive = false;
    updateEntities(entities, map, player, 0.025, hooks());
    expect(console.state.sealedBy).toBeUndefined();
  });

  it('rootkit is exposed by a tap capture (and by damage/close range)', () => {
    const map = new WorldMap(mapDef);
    const rootkit = enemy('rk1', 'rootkit', 2.5, 2.5, 3);
    const player = new Player(7.5, 2.5, Math.PI);
    const onNotice = vi.fn();
    updateEntities([rootkit], map, player, 0.025, hooks({ onNotice }));
    expect(rootkit.state.revealedRootkit).toBeUndefined();
    rootkit.state.captured = true; // network tap
    updateEntities([rootkit], map, player, 0.025, hooks({ onNotice }));
    expect(rootkit.state.revealedRootkit).toBe(true);
    expect(onNotice).toHaveBeenCalledWith(rootkit, expect.stringContaining('hides'));
  });

  it('wanderers aggro on sight like chasers (M09 wander ransomware)', () => {
    const map = new WorldMap(mapDef);
    const rw = enemy('rw-wander', 'ransomware', 2.5, 2.5, 4);
    rw.def.ai = 'wander';
    const player = new Player(5.5, 2.5, Math.PI);
    const onSight = vi.fn();
    const h = hooks({ onSight });
    for (let i = 0; i < 40; i++) updateEntities([rw], map, player, 0.025, h);
    expect(onSight).toHaveBeenCalledTimes(1);
    expect(rw.state.aggroed).toBe(true);
    expect(rw.state.mode).toBe('chase');
  });

  it('close combat cycles in ~1.0-1.3s (Doom-like melee cadence)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const map = new WorldMap(mapDef);
    const worm = enemy('w-melee', 'worm', 2.5, 2.5, 99);
    const player = new Player(3.2, 2.5, Math.PI);
    const onMelee = vi.fn();
    const h = hooks({ onMelee });
    const times: number[] = [];
    for (let i = 0; i < 400; i++) {
      updateEntities([worm], map, player, 0.025, h);
      if (onMelee.mock.calls.length > times.length) times.push(i * 0.025);
    }
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeLessThan(1.4);
      expect(times[i] - times[i - 1]).toBeGreaterThan(0.7);
    }
  });

  it('pins melee cooldown to 0.45-0.75s and ranged cooldown to 1.2-2.0s', () => {
    // 0.1 passes the ranged fire-chance gate at 6 tiles and exercises the
    // low end of both cooldown ranges.
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const map = new WorldMap(mapDef);

    // Melee (worm): cooldown captured right after each hit.
    const worm = enemy('w-cd', 'worm', 2.5, 2.5, 99);
    const meleeCds: number[] = [];
    const meleePlayer = new Player(3.2, 2.5, Math.PI);
    const onMelee = vi.fn();
    const mw = hooks({ onMelee });
    for (let i = 0; i < 400 && meleeCds.length < 3; i++) {
      updateEntities([worm], map, meleePlayer, 0.025, mw);
      if (onMelee.mock.calls.length > meleeCds.length) {
        meleeCds.push(worm.state.attackCooldown as number);
      }
    }
    expect(meleeCds.length).toBeGreaterThanOrEqual(3);
    for (const cd of meleeCds) {
      expect(cd).toBeGreaterThanOrEqual(0.45);
      expect(cd).toBeLessThan(0.75);
    }

    // Ranged (revealed trojan): cooldown captured right after each shot.
    const trojan = enemy('t-cd', 'trojan', 1.5, 2.5, 99);
    trojan.state.revealedTrojan = true;
    trojan.state.facing = 0; // player is at +x
    const rangedCds: number[] = [];
    const player = new Player(7.5, 2.5, Math.PI);
    const onFire = vi.fn();
    const rh = hooks({ onFire });
    for (let i = 0; i < 800 && rangedCds.length < 3; i++) {
      updateEntities([trojan], map, player, 0.025, rh);
      if (onFire.mock.calls.length > rangedCds.length) {
        rangedCds.push(trojan.state.attackCooldown as number);
      }
    }
    expect(rangedCds.length).toBeGreaterThanOrEqual(3);
    for (const cd of rangedCds) {
      expect(cd).toBeGreaterThanOrEqual(1.2);
      expect(cd).toBeLessThan(2.0);
    }
  });
});
