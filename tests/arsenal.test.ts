import { describe, it, expect } from 'vitest';
import { toolRegistry, toolForSlot } from '../src/tools';
import { Arsenal, defaultLoadout } from '../src/tools/arsenal';
import { useDuration } from '../src/tools/anim';
import { EventBus } from '../src/core/events';
import { objectiveById } from '../src/content/objectives';
import type { Entity, ToolUseContext } from '../src/core/types';

function ctx(over: Partial<ToolUseContext> = {}): ToolUseContext {
  return {
    playerX: 1, playerY: 1, playerAngle: 0, entities: [], projectiles: [], wallDistance: 5,
    isDoorAhead: () => null, openDoor: () => {}, bus: new EventBus(), fireProjectile: () => {},
    aimEntity: () => null, authorizedRoles: [], role: 'analyst', ...over,
  };
}

function ent(id: string, over: Partial<Entity> = {}, inspectCat?: string): Entity {
  return {
    def: { id, kind: 'workstation', x: 2, y: 1, sprite: 'pc', inspect: inspectCat ? { label: id, detail: 'd', category: inspectCat as 'malware' } : undefined },
    x: 2, y: 1, hp: 2, alive: true, infected: false, state: {}, ...over,
  };
}

describe('arsenal contracts', () => {
  it('registers six tools on slots 1-6', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => toolForSlot(s)?.id)).toEqual(['keyboard', 'mouse', 'usb', 'badge', 'tap', 'edr']);
  });
  it('every tool maps to a SY0-701 control with real objective ids', () => {
    for (const t of toolRegistry.all()) {
      expect(t.control, t.id).toBeDefined();
      expect(t.control!.types.length).toBeGreaterThan(0);
      for (const o of t.control!.objectives) expect(objectiveById(o), `${t.id} ${o}`).toBeDefined();
    }
  });
  it('standard tools have a 300-450ms windup/impact/recover cycle; EDR is a charged shot', () => {
    for (const t of toolRegistry.all()) {
      const d = useDuration(t.windup ?? 0);
      if (t.id === 'edr') expect(d).toBeGreaterThan(0.6);
      else {
        expect(d, t.id).toBeGreaterThanOrEqual(0.3);
        expect(d, t.id).toBeLessThanOrEqual(0.45);
      }
    }
  });
  it('loadout grows with difficulty', () => {
    expect(defaultLoadout({ difficulty: 1 })).toEqual(['keyboard', 'mouse', 'usb', 'badge']);
    expect(defaultLoadout({ difficulty: 3 })).toContain('tap');
    expect(defaultLoadout({ difficulty: 3 })).not.toContain('edr');
    expect(defaultLoadout({ difficulty: 6 })).toContain('edr');
    expect(defaultLoadout({ difficulty: 9, loadout: ['keyboard', 'badge'] })).toEqual(['keyboard', 'badge']);
  });
});

describe('arsenal runtime', () => {
  const settle = (a: Arsenal, c = () => ctx()) => { for (let i = 0; i < 40; i++) a.update(1 / 60, false, false, c); };

  it('switching lowers then raises; unowned slots refuse', () => {
    const a = new Arsenal(new EventBus());
    a.reset({ difficulty: 1 }, 'female');
    settle(a);
    expect(a.select(5)).toBe(false);
    expect(a.select(3)).toBe(true);
    expect(a.switching).toBe(true);
    settle(a);
    expect(a.current.id).toBe('usb');
    expect(a.switching).toBe(false);
  });

  it('fires after the windup, spends ammo, and dry-fires at zero', () => {
    const a = new Arsenal(new EventBus());
    a.reset({ difficulty: 1 }, 'male');
    a.select(3);
    settle(a);
    let shots = 0;
    const c = () => ctx({ fireProjectile: () => shots++ });
    const start = a.ammoFor()!;
    a.update(1 / 60, true, true, c);
    expect(shots).toBe(0); // still winding up
    settle(a, c);
    expect(shots).toBe(1);
    expect(a.ammoFor()).toBe(start - 1);
    a.ammo.set('usb-charge', 0);
    a.update(1 / 60, true, true, c);
    settle(a, c);
    expect(shots).toBe(1);
  });

  it('tool pickups grant and auto-switch; ammo caps at the tool max', () => {
    const a = new Arsenal(new EventBus());
    a.reset({ difficulty: 1 }, 'male');
    a.grant('tool:edr', 1);
    settle(a);
    expect(a.current.id).toBe('edr');
    a.grant('usb-charge', 999);
    expect(a.ammo.get('usb-charge')).toBe(30);
  });
});

describe('tool mechanics', () => {
  it('mouse: inspect first, then a triage verdict that is graded', () => {
    const bus = new EventBus();
    const verdicts: boolean[] = [];
    bus.on('triage', ({ correct }) => verdicts.push(correct));
    const mal = ent('m', { infected: true }, 'malware');
    const ok = ent('b', {}, 'benign');
    const mouse = toolForSlot(2)!;
    for (const e of [mal, mal, ok, ok]) mouse.use(ctx({ bus, aimEntity: () => e }));
    expect(verdicts).toEqual([true, false]);
    expect(mal.state.flagCorrect).toBe(true);
  });

  it('badge: a repeated denied swipe at the same door logs only one violation', () => {
    const bus = new EventBus();
    const logged: boolean[] = [];
    bus.on('badge-door', ({ allowed }) => logged.push(allowed));
    const entities: Entity[] = [];
    const c = ctx({ bus, entities, authorizedRoles: ['analyst'], isDoorAhead: () => ({ doorId: 'srv', accessRole: 'admin', dist: 1 }) });
    for (let i = 0; i < 4; i++) toolForSlot(4)!.use(c);
    expect(logged).toEqual([false]);
  });

  it('tap flags beaconing hosts in the cone but never cleans them', () => {
    const bus = new EventBus();
    const cleaned: string[] = [];
    bus.on('cleaned', ({ entityId }) => cleaned.push(entityId));
    const host = ent('h', { infected: true }, 'malware');
    const behind = ent('x', { infected: true, x: -5 }, 'malware');
    toolForSlot(5)!.use(ctx({ bus, entities: [host, behind] }));
    expect(host.state.flagged).toBe(true);
    expect(behind.state.flagged).toBeUndefined();
    expect(cleaned).toEqual([]);
  });

  it('edr contains infected endpoints in radius', () => {
    const bus = new EventBus();
    const cleaned: string[] = [];
    bus.on('cleaned', ({ entityId }) => cleaned.push(entityId));
    const near = ent('n', { infected: true, hp: 3 });
    const far = ent('f', { infected: true, hp: 3, x: 40 });
    const clean = ent('c');
    toolForSlot(6)!.use(ctx({ bus, entities: [near, far, clean] }));
    expect(cleaned).toEqual(['n']);
  });
});
