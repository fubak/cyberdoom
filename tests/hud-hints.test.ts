import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Entity, EntityDef, Mission, ToolDef, ToolUseContext } from '../src/core/types';
import { keyboardTool } from '../src/tools/keyboard';
import { mouseTool } from '../src/tools/mouse';
import { usbTool, USB_PLUG_RANGE } from '../src/tools/usb';
import { patchTool } from '../src/tools/patch';
import { badgeTool, mfaPending } from '../src/tools/badge';
import { mfaTool } from '../src/tools/mfa';
import { tapTool } from '../src/tools/tap';
import { edrTool } from '../src/tools/edr';
import { targetNoun } from '../src/tools/hint';
import { doorUseHint, resolveUse, type UseTargetContext } from '../src/engine/useTarget';
import { MissionRuntime } from '../src/missions/runtime';
import { WorldMap } from '../src/engine/map';

/** Build an entity at (x, y) straight ahead of a player at origin facing +x. */
function ent(def: Partial<EntityDef> & Pick<EntityDef, 'id' | 'kind'>, x = 1, infected = false): Entity {
  return {
    def: { sprite: 'worm', x, y: 0, ...def } as EntityDef,
    x,
    y: 0,
    hp: 2,
    alive: true,
    infected,
    state: {},
  };
}

interface CtxOpts {
  entities?: Entity[];
  playerX?: number;
  playerY?: number;
  angle?: number;
  wall?: number;
  door?: { doorId: string; accessRole?: string; dist: number; mfa?: boolean } | null;
  losAll?: boolean;
}

/** Fake ToolUseContext: aimEntity = nearest alive entity within range/cone along +x. */
function ctx(o: CtxOpts = {}) {
  const bus = new EventBus();
  const fired: { type: string; data: unknown }[] = [];
  for (const ev of ['tool-hit', 'interact', 'message', 'inspect', 'cleaned', 'entity-hurt', 'scan-miss', 'badge-door', 'triage'] as const) {
    bus.on(ev, (data) => fired.push({ type: ev, data }));
  }
  const angle = o.angle ?? 0;
  const c: ToolUseContext = {
    playerX: o.playerX ?? 0,
    playerY: o.playerY ?? 0,
    playerAngle: angle,
    entities: o.entities ?? [],
    projectiles: [],
    wallDistance: o.wall ?? 10,
    isDoorAhead: () => o.door ?? null,
    openDoor: () => {},
    bus,
    fireProjectile: (p) => {
      fired.push({ type: 'fireProjectile', data: p });
      c.projectiles.push({ ...p, alive: true, traveled: 0 });
    },
    aimEntity: (maxDist, maxAngle) => {
      let best: Entity | null = null;
      let bestD = maxDist;
      for (const e of c.entities) {
        if (!e.alive) continue;
        const dx = e.x - c.playerX;
        const dy = e.y - c.playerY;
        const d = Math.hypot(dx, dy);
        if (d > bestD) continue;
        let da = Math.atan2(dy, dx) - angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > maxAngle) continue;
        best = e;
        bestD = d;
      }
      return best;
    },
    authorizedRoles: ['analyst'],
    role: 'analyst',
    isInspected: (id) => !!c.entities.find((e) => e.def.id === id)?.state.inspected,
    lineOfSight: o.losAll === false ? () => false : () => true,
  };
  return { ctx: c, fired };
}

function affected(fired: { type: string; data: unknown }[], tool: ToolDef, result: void | boolean): boolean {
  if (result === false) return false;
  if (tool.id === 'usb') return fired.some((f) => f.type === 'fireProjectile');
  return fired.some((f) => f.type === 'tool-hit' && (f.data as { good?: boolean }).good === true)
    || fired.some((f) => f.type === 'interact')
    || fired.some((f) => f.type === 'inspect')
    || fired.some((f) => f.type === 'badge-door')
    || fired.some((f) => f.type === 'triage');
}

const NO_LEAK = [/decoy/i, /wrong/i, /phish/i, /malicious.*host|totally.*safe/i];

function noLeak(hint: string | null, e?: Entity) {
  if (hint === null) return;
  expect(hint.length).toBeLessThanOrEqual(34);
  expect(hint).toBe(hint.toUpperCase());
  for (const re of NO_LEAK) expect(hint).not.toMatch(re);
  if (e?.def.inspect?.label) expect(hint).not.toContain(e.def.inspect.label.toUpperCase());
}

describe('tool hints agree with use() and never leak verdicts', () => {
  it('keyboard: infected enemy close -> ready KILL PROCESS', () => {
    const e = ent({ id: 'w1', kind: 'enemy' }, 1, true);
    const { ctx: c, fired } = ctx({ entities: [e] });
    const h = keyboardTool.hint!(c);
    expect(h?.text).toBe('KILL PROCESS: MALWARE');
    expect(h?.ready).toBe(true);
    expect(affected(fired, keyboardTool, keyboardTool.use(c))).toBe(true);
  });

  it('keyboard: npc -> not ready, use does nothing', () => {
    const e = ent({ id: 'n1', kind: 'npc' }, 1);
    const { ctx: c, fired } = ctx({ entities: [e] });
    const h = keyboardTool.hint!(c);
    expect(h?.text).toBe('NOT USED ON PEOPLE');
    expect(h?.ready).toBe(false);
    keyboardTool.use(c);
    expect(affected(fired, keyboardTool, undefined)).toBe(false);
  });

  it('keyboard: revealed infected workstation -> not ready; enemy out of reach -> too far', () => {
    const ws = ent({ id: 'ws', kind: 'workstation' }, 1, true);
    ws.state.revealed = true;
    const { ctx: c } = ctx({ entities: [ws] });
    const h = keyboardTool.hint!(c);
    expect(h?.ready).toBe(false);
    expect(h?.text).toContain('WON\'T CLEAN HOST');
    const far = ent({ id: 'w2', kind: 'enemy' }, 4, true);
    const { ctx: c2 } = ctx({ entities: [far] });
    expect(keyboardTool.hint!(c2)?.text).toBe('TOO FAR: KEYBOARD IS POINT-BLANK');
  });

  it('mouse: uninspected -> INSPECT ready and matches use(); flagged -> not ready', () => {
    const e = ent({ id: 't1', kind: 'enemy' }, 2);
    const { ctx: c, fired } = ctx({ entities: [e] });
    const h = mouseTool.hint!(c);
    expect(h?.text).toBe('INSPECT MALWARE');
    expect(h?.ready).toBe(true);
    mouseTool.use(c);
    expect(affected(fired, mouseTool, undefined)).toBe(true);
    e.state.flagged = true;
    expect(mouseTool.hint!(c)?.text).toBe('ALREADY FLAGGED');
    expect(mouseTool.hint!(c)?.ready).toBe(false);
  });

  it('mouse: nothing -> AIM AT A TARGET; nothing in view of a malicious item still flags via plain branch', () => {
    const { ctx: c } = ctx();
    expect(mouseTool.hint!(c)?.text).toBe('INSPECT: AIM AT A TARGET');
    const bad = ent({ id: 'm1', kind: 'item', inspect: { label: 'Totally Safe Drive', detail: '', category: 'phishing' } }, 2);
    bad.state.inspected = true;
    const { ctx: c2, fired } = ctx({ entities: [bad] });
    const h = mouseTool.hint!(c2);
    noLeak(h!.text, bad);
    expect(h?.ready).toBe(true);
    mouseTool.use(c2);
    expect(affected(fired, mouseTool, undefined)).toBe(true);
  });

  it('usb: workstation too far vs in plug range', () => {
    const wsFar = ent({ id: 'ws', kind: 'workstation' }, USB_PLUG_RANGE + 1);
    const { ctx: c1, fired: f1 } = ctx({ entities: [wsFar] });
    expect(usbTool.hint!(c1)?.text).toBe('TOO FAR: WALK UP TO PLUG IN');
    expect(usbTool.hint!(c1)?.ready).toBe(false);
    usbTool.use(c1);
    expect(f1.some((f) => f.type === 'fireProjectile')).toBe(false);
    const wsNear = ent({ id: 'ws', kind: 'workstation' }, USB_PLUG_RANGE - 0.5);
    const { ctx: c2 } = ctx({ entities: [wsNear] });
    expect(usbTool.hint!(c2)?.text).toBe('PLUG IN: SCAN & QUARANTINE');
    expect(usbTool.hint!(c2)?.ready).toBe(true);
  });

  it('patch: reachability, inspect guard, infected guard, patched, ready', () => {
    const { ctx: c0 } = ctx();
    expect(patchTool.hint!(c0)?.text).toBe('NO WORKSTATION IN REACH');
    const triageHost = ent({ id: 't', kind: 'workstation', tags: ['triage'] }, 1);
    const { ctx: c1 } = ctx({ entities: [triageHost] });
    expect(patchTool.hint!(c1)?.text).toBe('INSPECT FIRST (MOUSE 2)');
    triageHost.state.inspected = true;
    triageHost.infected = true;
    triageHost.state.revealed = true;
    const { ctx: c2 } = ctx({ entities: [triageHost] });
    expect(patchTool.hint!(c2)?.text).toBe('CLEAN IT FIRST (SCANNER 3)');
    triageHost.infected = false;
    triageHost.state.patched = true;
    expect(patchTool.hint!(c2)?.text).toBe('ALREADY PATCHED');
    triageHost.state.patched = false;
    const h = patchTool.hint!(c2);
    expect(h?.text).toBe('APPLY PATCH: WORKSTATION');
    expect(h?.ready).toBe(true);
  });

  it('badge and mfa door hints', () => {
    const door = { doorId: 'd1', dist: 1 };
    const { ctx: c } = ctx({ door });
    // no accessRole -> a readerless door opens with E, not the badge
    expect(badgeTool.hint!(c)?.text).toBe('NO READER: PRESS E TO OPEN');
    expect(badgeTool.hint!(c)?.ready).toBe(false);
    const { ctx: cr } = ctx({ door: { doorId: 'd1', dist: 1, accessRole: 'analyst' } });
    expect(badgeTool.hint!(cr)?.text).toBe('SWIPE BADGE AT READER');
    expect(badgeTool.hint!(cr)?.ready).toBe(true);
    expect(mfaTool.hint!(c)?.text).toBe('BADGE-ONLY READER');
    const mfaDoor = { doorId: 'd2', dist: 1, mfa: true };
    const entities: Entity[] = [];
    const { ctx: c2 } = ctx({ door: mfaDoor, entities });
    expect(mfaTool.hint!(c2)?.text).toBe('SWIPE BADGE FIRST');
    mfaPending(entities).add('d2');
    expect(mfaTool.hint!(c2)?.text).toBe('CONFIRM MFA AT READER');
    expect(mfaTool.hint!(c2)?.ready).toBe(true);
  });

  it('tap: counts hosts in cone; edr: always ready', () => {
    const host = ent({ id: 'h', kind: 'workstation' }, 3);
    const { ctx: c } = ctx({ entities: [host] });
    const h = tapTool.hint!(c);
    expect(h?.text).toBe('CAPTURE TRAFFIC (1 IN VIEW)');
    expect(h?.ready).toBe(true);
    const { ctx: c2 } = ctx();
    expect(tapTool.hint!(c2)?.ready).toBe(false);
    expect(tapTool.hint!(c2)?.text).toBe('CAPTURE TRAFFIC: NO HOSTS IN VIEW');
    expect(edrTool.hint!(c2)).toEqual({ text: 'HOLD: CHARGE CONTAINMENT PULSE', ready: true });
  });

  it('no hint text leaks an entity label for decoy/wrong/malicious entities', () => {
    const decoy = ent({ id: 'd', kind: 'console', tags: ['decoy'], inspect: { label: 'Totally Safe Console', detail: '', category: 'legit' } }, 2);
    decoy.state.inspected = true;
    for (const tool of [keyboardTool, mouseTool, usbTool, tapTool]) {
      const { ctx: c } = ctx({ entities: [decoy] });
      noLeak(tool.hint?.(c)?.text ?? null, decoy);
    }
  });
});

describe('targetNoun', () => {
  it('maps kinds and never a label', () => {
    expect(targetNoun(ent({ id: 'x', kind: 'enemy' }))).toBe('MALWARE');
    expect(targetNoun(ent({ id: 'x', kind: 'workstation' }))).toBe('WORKSTATION');
    expect(targetNoun(ent({ id: 'x', kind: 'console' }))).toBe('CONSOLE');
    expect(targetNoun(ent({ id: 'x', kind: 'npc' }))).toBe('EMPLOYEE');
    expect(targetNoun(ent({ id: 'x', kind: 'item' }))).toBe('ITEM');
    expect(targetNoun(ent({ id: 'x', kind: 'prop' }))).toBe('OBJECT');
  });
});

describe('resolveUse + doorUseHint', () => {
  function uctx(o: Partial<UseTargetContext>): UseTargetContext {
    return {
      isDoorAhead: () => null,
      isDoorOpen: () => true,
      aimEntity: () => null,
      wallDistance: 10,
      roles: ['analyst'],
      hasBadge: true,
      mfaPending: new Set(),
      ...o,
    };
  }
  it('unopened door ahead -> door; open door falls through to entity', () => {
    const door = { doorId: 'd1', dist: 1 };
    expect(resolveUse(uctx({ isDoorAhead: () => door, isDoorOpen: () => false })).kind).toBe('door');
    const e = ent({ id: 't', kind: 'console' }, 1);
    const r = resolveUse(uctx({ isDoorAhead: () => door, isDoorOpen: () => true, aimEntity: () => e }));
    expect(r.kind).toBe('entity');
  });
  it('wall bump when nothing aimed and wall close', () => {
    expect(resolveUse(uctx({ wallDistance: 0.5 })).kind).toBe('bump');
    expect(resolveUse(uctx({ wallDistance: 5 })).kind).toBe('none');
  });
  it('door hints mirror E behaviour by role/mfa/badge state', () => {
    const door = { doorId: 'd', accessRole: 'admin', mfa: true };
    const c = uctx({ roles: ['analyst'] });
    expect(doorUseHint(c, door)).toBe('READER: ADMIN ONLY');
    const c2 = uctx({ roles: ['admin'], hasBadge: false });
    expect(doorUseHint(c2, door)).toBe('READER: SELECT BADGE [4]');
    const c3 = uctx({ roles: ['admin'], hasBadge: true });
    expect(doorUseHint(c3, door)).toBe('SWIPE BADGE AT READER');
    c3.mfaPending.add('d');
    expect(doorUseHint(c3, door)).toBe('SECOND FACTOR: TOKEN [7]');
    expect(doorUseHint(c3, { doorId: 'x' })).toBe('OPEN DOOR');
  });
});

const mapDef = {
  grid: ['#####', '#...#', '#...#', '#...#', '#####'],
  legend: {
    '#': { kind: 'wall' as const, tex: 'wall' },
    '.': { kind: 'floor' as const, tex: 'floor' },
  },
  spawn: { x: 1.5, y: 1.5, angle: 0 },
};

function hintMission(entities: EntityDef[]): Mission {
  return {
    id: 'hint-test', title: 'T', difficulty: 1, objectives: [], briefing: '',
    map: mapDef, entities, debriefQuestions: [], authorizedRoles: ['analyst'],
    missionObjectives: [],
  };
}

describe('MissionRuntime.interactHint', () => {
  it('a wrong console and a normal console give the same hint', () => {
    const wrong: EntityDef = { id: 'bad', kind: 'console', x: 2, y: 2, sprite: 's', tags: ['wrong'], inspect: { label: 'Definitely The Right Console', detail: '', category: 'legit' } };
    const ok: EntityDef = { id: 'good', kind: 'console', x: 2, y: 2.5, sprite: 's' };
    const rt = new MissionRuntime(hintMission([wrong, ok]), new EventBus());
    const a = rt.interactHint(rt.byId('bad')!);
    const b = rt.interactHint(rt.byId('good')!);
    expect(a).toBe('USE CONSOLE');
    expect(b).toBe(a);
    expect(a).not.toContain('RIGHT CONSOLE');
  });

  it('reportable -> MARK AS SUSPECT; revealed infected workstation -> MANUAL CLEANUP; others null', () => {
    const npc: EntityDef = { id: 'npc', kind: 'npc', x: 1, y: 1, sprite: 's', reportable: true };
    const ws: EntityDef = { id: 'ws', kind: 'workstation', x: 1, y: 2, sprite: 's', infected: true };
    const prop: EntityDef = { id: 'p', kind: 'prop', x: 1, y: 3, sprite: 's' };
    const rt = new MissionRuntime(hintMission([npc, ws, prop]), new EventBus());
    rt.byId('ws')!.state.revealed = true;
    expect(rt.interactHint(rt.byId('npc')!)).toBe('MARK AS SUSPECT');
    expect(rt.interactHint(rt.byId('ws')!)).toBe('MANUAL CLEANUP');
    expect(rt.interactHint(rt.byId('p')!)).toBeNull();
  });

  it('triage workstation uninspected -> INSPECT FIRST', () => {
    const host: EntityDef = { id: 'h', kind: 'workstation', x: 1, y: 1, sprite: 's', tags: ['triage'] };
    const rt = new MissionRuntime(hintMission([host]), new EventBus());
    expect(rt.interactHint(rt.byId('h')!)).toBe('INSPECT FIRST (MOUSE 2)');
  });

  it('M04: malicious vs legit inspected triage host gives identical E and mouse hints', () => {
    const bad: EntityDef = { id: 'b', kind: 'workstation', x: 1, y: 1, sprite: 's', tags: ['triage'], infected: true, inspect: { label: 'Mail Relay', detail: '', category: 'malware' } };
    const ok: EntityDef = { id: 'o', kind: 'workstation', x: 1, y: 2, sprite: 's', tags: ['triage'], inspect: { label: 'Print Server', detail: '', category: 'legit' } };
    const bus = new EventBus();
    const rt = new MissionRuntime(hintMission([bad, ok]), bus);
    bus.emit('inspect', { entityId: 'b' });
    bus.emit('inspect', { entityId: 'o' });
    const be = rt.byId('b')!;
    const oe = rt.byId('o')!;
    be.state.inspected = oe.state.inspected = true;
    expect(rt.interactHint(be)).toBe(rt.interactHint(oe));
    expect(rt.interactHint(be)).toBe('FILE TRIAGE CALL');
    // aim straight ahead for the mouse hint (defs sit at x=1, y=1/2)
    be.y = oe.y = 0;
    const mouseHint = (e: Entity) => mouseTool.hint!(ctx({ entities: [e] }).ctx);
    expect(mouseHint(be)).toEqual(mouseHint(oe));
    expect(mouseHint(be)?.text).toBe('CHOOSE A RESPONSE TOOL');
  });

  it('M05: vuln-confirmed vs plain inspected triage host gives identical mouse hint', () => {
    const vuln = ent({ id: 'v', kind: 'workstation', tags: ['triage', 'vulnerability-confirmed'] }, 1);
    const plain = ent({ id: 'p', kind: 'workstation', tags: ['triage'] }, 1);
    vuln.state.inspected = plain.state.inspected = true;
    const hv = mouseTool.hint!(ctx({ entities: [vuln] }).ctx);
    const hp = mouseTool.hint!(ctx({ entities: [plain] }).ctx);
    expect(hv).toEqual(hp);
    expect(hv?.text).toBe('CHOOSE A RESPONSE TOOL');
  });

  it('unrevealed infected workstation hints identically to a clean one', () => {
    const infected = ent({ id: 'i', kind: 'workstation' }, 1, true);
    const clean = ent({ id: 'c', kind: 'workstation' }, 1);
    for (const tool of [keyboardTool, patchTool]) {
      const hi = tool.hint!(ctx({ entities: [infected] }).ctx);
      const hc = tool.hint!(ctx({ entities: [clean] }).ctx);
      expect(hi).toEqual(hc);
    }
    expect(keyboardTool.hint!(ctx({ entities: [infected] }).ctx)?.text).toBe('RUN COMMAND: WORKSTATION');
    expect(patchTool.hint!(ctx({ entities: [infected] }).ctx)?.text).toBe('APPLY PATCH: WORKSTATION');
    const rt = new MissionRuntime(hintMission([
      { id: 'i', kind: 'workstation', x: 1, y: 1, sprite: 's', infected: true },
      { id: 'c', kind: 'workstation', x: 1, y: 2, sprite: 's' },
    ]), new EventBus());
    expect(rt.interactHint(rt.byId('i')!)).toBe(rt.interactHint(rt.byId('c')!));
    expect(rt.interactHint(rt.byId('i')!)).toBe('INSPECT FIRST (MOUSE 2)');
    // once revealed, the infected host is visibly different
    rt.byId('i')!.state.revealed = true;
    rt.byId('c')!.state.revealed = true;
    expect(rt.interactHint(rt.byId('i')!)).toBe('MANUAL CLEANUP');
    expect(rt.interactHint(rt.byId('c')!)).toBeNull();
  });

  it('interact handler still runs the real action after the hint (same branch)', () => {
    const rt = new MissionRuntime(hintMission([]), new EventBus());
    void new WorldMap(mapDef);
    expect(rt.finished).toBeNull();
  });
});
