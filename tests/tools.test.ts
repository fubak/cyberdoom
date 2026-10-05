import { describe, it, expect } from 'vitest';
import { toolRegistry, toolForSlot, sortedTools } from '../src/tools';
import { EventBus } from '../src/core/events';
import type { ToolUseContext } from '../src/core/types';

function ctx(over: Partial<ToolUseContext> = {}): ToolUseContext {
  return {
    playerX: 1,
    playerY: 1,
    playerAngle: 0,
    entities: [],
    projectiles: [],
    wallDistance: 5,
    isDoorAhead: () => null,
    openDoor: () => {},
    bus: new EventBus(),
    fireProjectile: () => {},
    aimEntity: () => null,
    authorizedRoles: [],
    role: 'analyst',
    ...over,
  };
}

describe('tool registry', () => {
  it('keeps the four core tools on slots 1-4', () => {
    expect(toolForSlot(1)?.id).toBe('keyboard');
    expect(toolForSlot(2)?.id).toBe('mouse');
    expect(toolForSlot(3)?.id).toBe('usb');
    expect(toolForSlot(4)?.id).toBe('badge');
  });
  it('slots are unique', () => {
    const slots = toolRegistry.all().map((t) => t.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
  it('sortedTools returns slot order', () => {
    const slots = sortedTools().map((t) => t.slot);
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
  });
});

describe('tool behavior', () => {
  it('usb fires a projectile', () => {
    const fired: unknown[] = [];
    toolForSlot(3)!.use(ctx({ fireProjectile: (p) => fired.push(p) }));
    expect(fired.length).toBe(1);
  });
  it('mouse emits inspect only when an entity is aimed at', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('inspect', ({ entityId }) => seen.push(entityId));
    toolForSlot(2)!.use(ctx({ bus }));
    expect(seen.length).toBe(0);
    toolForSlot(2)!.use(
      ctx({
        bus,
        aimEntity: () => ({
          def: { id: 'e1', kind: 'npc', x: 0, y: 0, sprite: 'npc-m' },
          x: 0, y: 0, hp: 1, alive: true, infected: false, state: {},
        }),
      }),
    );
    expect(seen).toEqual(['e1']);
  });
  it('badge emits allowed=false for unauthorized role', () => {
    const bus = new EventBus();
    const events: boolean[] = [];
    bus.on('badge-door', ({ allowed }) => events.push(allowed));
    toolForSlot(4)!.use(
      ctx({
        bus,
        authorizedRoles: ['analyst'],
        isDoorAhead: () => ({ doorId: 'd', accessRole: 'admin', dist: 1 }),
      }),
    );
    expect(events).toEqual([false]);
  });
});
