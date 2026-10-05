import { describe, expect, it, vi } from 'vitest';
import { hurtEntity, updateEntities, type AiHooks } from '../src/engine/ai';
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
