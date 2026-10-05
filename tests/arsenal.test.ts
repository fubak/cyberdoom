import { describe, it, expect } from 'vitest';
import { toolRegistry, toolForSlot } from '../src/tools';
import { Arsenal, defaultLoadout } from '../src/tools/arsenal';
import { useDuration } from '../src/tools/anim';
import { EventBus } from '../src/core/events';
import { objectiveById } from '../src/content/objectives';
import { VOICES } from '../src/tools/sfx';
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
  it('registers eight tools on slots 1-8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((s) => toolForSlot(s)?.id)).toEqual(['keyboard', 'mouse', 'usb', 'badge', 'tap', 'edr', 'mfa', 'patch']);
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
    expect(defaultLoadout({ difficulty: 3 })).toContain('mfa');
    expect(defaultLoadout({ difficulty: 3 })).not.toContain('tap');
    expect(defaultLoadout({ difficulty: 6 })).toContain('tap');
    expect(defaultLoadout({ difficulty: 6 })).not.toContain('edr');
    expect(defaultLoadout({ difficulty: 9 })).toContain('edr');
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

  it('tap copies traffic in the cone but makes no verdict and never cleans', () => {
    const bus = new EventBus();
    const cleaned: string[] = [];
    const msgs: string[] = [];
    bus.on('cleaned', ({ entityId }) => cleaned.push(entityId));
    bus.on('message', ({ text }) => msgs.push(text));
    const host = ent('h', { infected: true }, 'malware');
    const benign = ent('b', { y: 1.3 }, 'legit');
    const behind = ent('x', { infected: true, x: -5 }, 'malware');
    toolForSlot(5)!.use(ctx({ bus, entities: [host, benign, behind] }));
    expect(host.state.captured).toBe(true);
    expect(benign.state.captured).toBe(true);
    expect(behind.state.captured).toBeUndefined();
    for (const e of [host, benign]) {
      expect(e.state.flagged).toBeUndefined();
      expect(e.state.inspected).toBeUndefined();
    }
    expect(cleaned).toEqual([]);
    expect(msgs.some((m) => m.includes('every 60 s'))).toBe(true);
  });

  it('mouse flags a tap-captured host in one click, graded by the analyst call', () => {
    const bus = new EventBus();
    const verdicts: boolean[] = [];
    bus.on('triage', ({ correct }) => verdicts.push(correct));
    const host = ent('h', { infected: true, state: { captured: true } }, 'malware');
    toolForSlot(2)!.use(ctx({ bus, aimEntity: () => host }));
    expect(verdicts).toEqual([true]);
  });

  it('mfa: an MFA door needs the badge AND the token; token alone fails', () => {
    const bus = new EventBus();
    const opened: string[] = [];
    bus.on('badge-door', ({ doorId, allowed }) => { if (allowed) opened.push(doorId); });
    const entities: Entity[] = [];
    const door = () => ({ doorId: 'srv', accessRole: 'netops', dist: 1, mfa: true });
    const c = ctx({ bus, entities, authorizedRoles: ['netops'], isDoorAhead: door });
    toolForSlot(7)!.use(c);
    expect(opened).toEqual([]);
    toolForSlot(4)!.use(c);
    expect(opened).toEqual([]);
    toolForSlot(7)!.use(c);
    expect(opened).toEqual(['srv']);
  });

  it('mfa: refuses phishing prompts and shared accounts', () => {
    const bus = new EventBus();
    const hits: boolean[] = [];
    bus.on('tool-hit', ({ good }) => hits.push(good));
    const phish = ent('p', {}, 'phishing');
    const shared = ent('s');
    shared.def.tags = ['shared-account'];
    for (const e of [phish, shared]) toolForSlot(7)!.use(ctx({ bus, aimEntity: () => e }));
    expect(hits).toEqual([false, false]);
    expect(phish.state.mfaRefused).toBe(true);
  });

  it('patch disk: patches clean hosts, refuses infected ones, refunds misses', () => {
    const tool = toolForSlot(8)!;
    const clean = ent('c');
    const infected = ent('i', { infected: true });
    expect(tool.use(ctx({ aimEntity: () => clean }))).toBe(true);
    expect(clean.state.patched).toBe(true);
    expect(tool.use(ctx({ aimEntity: () => infected }))).toBe(false);
    expect(infected.state.patched).toBeUndefined();
    expect(tool.use(ctx())).toBe(false);
    const a = new Arsenal(new EventBus());
    a.reset({ difficulty: 1, loadout: ['patch'] }, 'male');
    for (let i = 0; i < 40; i++) a.update(1 / 60, false, false, () => ctx());
    const before = a.ammoFor();
    a.update(1 / 60, true, true, () => ctx());
    for (let i = 0; i < 40; i++) a.update(1 / 60, false, false, () => ctx());
    expect(a.ammoFor()).toBe(before);
  });

  it('a found tool lights its ARMS slot and every resource reports current/max', () => {
    const a = new Arsenal(new EventBus());
    a.reset({ difficulty: 1 }, 'female');
    expect(a.grant('tool:tap', 1)).toBe('YOU GOT THE NETWORK TAP!');
    expect(a.got()?.slot).toBe(5);
    const res = a.resources();
    expect(res.map((r) => r.id)).toEqual(['usb-charge', 'pcap', 'edr-cell', 'patch-disk']);
    const pcap = res.find((r) => r.id === 'pcap')!;
    expect(pcap.owned).toBe(true);
    expect(pcap.cur).toBeGreaterThan(0);
    expect(pcap.max).toBe(12);
    expect(res.find((r) => r.id === 'edr-cell')!.owned).toBe(false);
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

describe('analyst voices', () => {
  it('each analyst has a distinct formant set, not one table pitch-scaled', () => {
    const m = VOICES.male;
    const f = VOICES.female;
    const ratios = (['a', 'e', 'o', 'u'] as const).flatMap((v) => m.vowels[v].map((hz, i) => f.vowels[v][i] / hz));
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(spread).toBeGreaterThan(0.1);
    expect(f.breath).toBeGreaterThan(m.breath * 2);
    expect(f.q).not.toEqual(m.q);
  });
});

describe('round 3: keyboard containment and arm\'s-length scanning', () => {
  const near = (es: Entity[]) => (max: number) =>
    es.filter((e) => e.alive && Math.hypot(e.x - 1, e.y - 1) <= max)
      .sort((a, b) => Math.hypot(a.x - 1, a.y - 1) - Math.hypot(b.x - 1, b.y - 1))[0] ?? null;
  const malware = (id: string, sprite: string, hp: number, x: number): Entity => ({
    def: { id, kind: 'enemy', x, y: 1, sprite, hp, infected: true },
    x, y: 1, hp, alive: true, infected: true, state: {},
  });
  const strike = (e: Entity, n = 1) => {
    const bus = new EventBus();
    const cleaned: string[] = [];
    bus.on('cleaned', ({ entityId }) => cleaned.push(entityId));
    const kb = toolForSlot(1)!;
    for (let i = 0; i < n; i++) kb.use(ctx({ bus, entities: [e], aimEntity: near([e]) }));
    return cleaned;
  };

  it('two keyboard hits within 1.5 tiles kill a 2-hp worm', () => {
    const worm = malware('w', 'worm', 2, 2.4);
    expect(strike(worm)).toEqual([]);
    expect(worm.hp).toBe(1);
    expect(strike(worm)).toEqual(['w']);
    expect(worm.hp).toBeLessThanOrEqual(0);
  });
  it('a worm 3 tiles away is untouched', () => {
    const worm = malware('w', 'worm', 2, 4);
    expect(strike(worm)).toEqual([]);
    expect(worm.hp).toBe(2);
  });
  it('a 3-hp trojan and 4-hp ransomware take one strike per hp, and the keyboard never runs out', () => {
    for (const [sprite, hp] of [['trojan', 3], ['ransomware', 4]] as const) {
      const e = malware(sprite, sprite, hp, 2);
      for (let i = 1; i < hp; i++) {
        expect(strike(e, 1)).toEqual([]);
        expect(e.hp).toBe(hp - i);
      }
      expect(strike(e, 1)).toEqual([sprite]);
    }
    // melee is the slow fallback: ranged scanning must be the better answer at range
    expect(toolForSlot(1)!.cooldown).toBeGreaterThanOrEqual(0.6);
    expect(toolForSlot(1)!.ammo).toBeNull();
    expect(toolForSlot(1)!.control?.objectives).toContain('4.8');
  });
  it('keyboard does not mark people as suspects', () => {
    const bus = new EventBus();
    const interacts: string[] = [];
    bus.on('interact', ({ entityId }) => interacts.push(entityId));
    const npc = ent('greg', { def: { id: 'greg', kind: 'npc', x: 2, y: 1, sprite: 'npc', reportable: true } });
    toolForSlot(1)!.use(ctx({ bus, aimEntity: () => npc }));
    expect(interacts).toEqual([]);
  });
  it('USB cleans a workstation only at arm\'s length; a far one refunds the charge', () => {
    const usb = toolForSlot(3)!;
    const shots: unknown[] = [];
    const far = ent('pc-far', { infected: true, x: 6, y: 1 });
    expect(usb.use(ctx({ aimEntity: () => far, fireProjectile: (p) => shots.push(p) }))).toBe(false);
    expect(shots).toHaveLength(0);
    const close = ent('pc-near', { infected: true, x: 2.5, y: 1 });
    usb.use(ctx({ aimEntity: () => close, fireProjectile: (p) => shots.push(p) }));
    expect(shots).toHaveLength(1);
    const worm = malware('w', 'worm', 2, 9);
    usb.use(ctx({ aimEntity: () => worm, fireProjectile: (p) => shots.push(p) }));
    expect(shots).toHaveLength(2);
  });
});
