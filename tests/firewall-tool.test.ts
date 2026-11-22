import { describe, it, expect } from 'vitest';
import { toolRegistry, toolForSlot } from '../src/tools/index';
import { FIREWALL_PELLETS, FIREWALL_RANGE, firewallTool } from '../src/tools/firewall';
import { SFX_DEFS } from '../src/engine/audio/sfxdef';
import { EventBus } from '../src/core/events';
import { missionRegistry } from '../src/content/missions/index';
import type { Projectile, ToolUseContext } from '../src/core/types';

describe('D4: Firewall Blaster (slot 9 damaging tool)', () => {
  it('registers in slot 9 with shared usb-charge ammo and cybersecurity control metadata', () => {
    expect(toolRegistry.get('firewall')).toBe(firewallTool);
    expect(toolForSlot(9)).toBe(firewallTool);
    expect(firewallTool.ammo?.resource).toBe('usb-charge');
    expect(firewallTool.control?.category).toBe('technical');
    expect(firewallTool.control?.lesson).toMatch(/endpoint/i);
  });

  it('fires a 5-pellet horizontal packet-filter fan on use', () => {
    const fired: Omit<Projectile, 'alive' | 'traveled'>[] = [];
    const bus = new EventBus();
    const ctx = {
      playerX: 5,
      playerY: 5,
      playerAngle: 0,
      bus,
      fireProjectile: (p: Omit<Projectile, 'alive' | 'traveled'>) => fired.push(p),
      aimEntity: () => null,
      wallDistance: () => 10,
      isDoorAhead: () => null,
      openDoor: () => {},
      entities: [],
      inRadius: () => [],
      hasAmmo: () => true,
      roles: [],
      simT: 0,
    } as unknown as ToolUseContext;

    expect(firewallTool.use(ctx)).toBe(true);
    expect(fired.length).toBe(FIREWALL_PELLETS.length);
    expect(fired.every((p) => p.source === 'firewall-pellet')).toBe(true);
    expect(fired.every((p) => p.range === FIREWALL_RANGE)).toBe(true);
    const angles = fired.map((p) => Math.atan2(p.dy, p.dx));
    expect(angles[0]).toBeLessThan(angles[2]);
    expect(angles[4]).toBeGreaterThan(angles[2]);
  });

  it('has a synthesized audio definition for firewall-blast', () => {
    expect(SFX_DEFS['firewall-blast']).toBeDefined();
  });

  it('is included in M07–M12 mission loadouts', () => {
    for (const id of ['m07', 'm08', 'm09', 'm10', 'm11', 'm12']) {
      const m = missionRegistry.get(id);
      expect(m?.loadout, `${id} should include firewall`).toContain('firewall');
    }
  });
});
