import { describe, expect, it } from 'vitest';
import { Player } from '../src/engine/player';
import { missionRegistry } from '../src/content/missions/index';

describe('D1 powerups', () => {
  it('firewall vest armor absorbs 50% of incoming damage and caps at 100', () => {
    const p = new Player(2, 2, 0);
    expect(p.addArmor(60)).toBe(60);
    expect(p.addArmor(60)).toBe(40);
    expect(p.armor).toBe(100);

    p.damage(20);
    expect(p.armor).toBe(90);
    expect(p.integrity).toBe(90);
  });

  it('air-gap shield blocks all incoming damage until its timer expires', () => {
    const p = new Player(2, 2, 0);
    p.airgapT = 12;
    p.damage(35);
    expect(p.integrity).toBe(100);

    p.tickPowerups(12);
    expect(p.airgapT).toBe(0);
    p.damage(20);
    expect(p.integrity).toBe(80);
  });

  it('snapshot and restore preserve armor, overclock, and air-gap timers', () => {
    const p = new Player(3, 4, 0.5);
    p.addArmor(50);
    p.overclockT = 11.5;
    p.airgapT = 7.25;
    const snap = p.snapshot();

    const p2 = new Player(1, 1, 0);
    p2.restore(snap);
    expect(p2.armor).toBe(50);
    expect(p2.overclockT).toBe(11.5);
    expect(p2.airgapT).toBe(7.25);
  });

  it('all four powerup types are placed across the campaign', () => {
    const resources = new Set<string>();
    for (const m of missionRegistry.all()) {
      for (const e of m.entities) {
        if (e.kind === 'item' && e.grants) resources.add(e.grants.resource);
      }
    }
    expect(resources.has('armor')).toBe(true);
    expect(resources.has('overclock')).toBe(true);
    expect(resources.has('airgap')).toBe(true);
    expect(resources.has('siem-map')).toBe(true);
  });
});
