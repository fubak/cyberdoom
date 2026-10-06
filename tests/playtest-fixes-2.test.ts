import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Mission, ToolUseContext } from '../src/core/types';
import { WorldMap } from '../src/engine/map';
import { enemyInTheWay, exitEdge } from '../src/engine/interact';
import { MissionRuntime } from '../src/missions/runtime';
import { patchTool } from '../src/tools/patch';
import { avoidViolated } from '../src/ui/debrief-layout';
import { DOSSIER_H, DOSSIER_ROWS, DOSSIER_X, DOSSIER_Y } from '../src/ui/dossier';
import { missionRowStates } from '../src/missions/progress';
import { BASE_STATUS } from '../src/render/res';

const mapDef = {
  grid: [
    '#######',
    '#.....#',
    '#.....#',
    '#....E#',
    '#######',
  ],
  legend: {
    '#': { kind: 'wall' as const, tex: 'wall' },
    '.': { kind: 'floor' as const, tex: 'floor' },
    E: { kind: 'exit' as const, tex: 'exit' },
  },
  spawn: { x: 1.5, y: 1.5, angle: 0 },
};

function mission(overrides: Partial<Mission> & Pick<Mission, 'missionObjectives'>): Mission {
  return {
    id: 'test', title: 'TEST', difficulty: 1, objectives: [], briefing: '',
    map: mapDef, entities: [], debriefQuestions: [], authorizedRoles: ['analyst'],
    ...overrides,
  };
}

function setup(m: Mission) {
  const bus = new EventBus();
  const messages: { text: string; kind?: string }[] = [];
  bus.on('message', (message) => messages.push(message));
  const rt = new MissionRuntime(m, bus);
  const map = new WorldMap(m.map);
  const player = { x: 1.5, y: 1.5, angle: 0, integrity: 100 };
  return { bus, messages, rt, map, player };
}

describe('exit edge latch', () => {
  it('emits on entry only, re-arms after leaving', () => {
    expect(exitEdge(false, true, false)).toBe(true);
    expect(exitEdge(true, true, false)).toBe(false); // still on exit: no re-emit
    expect(exitEdge(true, false, false)).toBe(false);
    expect(exitEdge(false, true, false)).toBe(true); // re-enter: emit again
    expect(exitEdge(false, true, true)).toBe(false); // finished: nothing
  });

  it('reach-exit with unfinished objectives warns, then wins on re-entry', () => {
    const s = setup(mission({
      entities: [{ id: 'ws', kind: 'workstation', x: 2, y: 2, sprite: 'workstation-infected', infected: true, tags: ['inf'], inspect: { label: 'WS', detail: '', category: 'malware' } }],
      missionObjectives: [
        { id: 'clean', text: 'Clean the host', kind: 'clean', tag: 'inf' },
        { id: 'exit', text: 'Exit', kind: 'reach-exit' },
      ],
    }));
    let won = 0;
    const fired = () => { s.bus.emit('reach-exit', {}); };
    fired();
    expect(s.rt.finished).toBeNull();
    expect(s.messages.at(-1)!.text).toContain('Exit locked');
    s.bus.emit('inspect', { entityId: 'ws' });
    s.bus.emit('cleaned', { entityId: 'ws' });
    fired();
    expect(s.rt.finished).toBe('won');
    void won;
  });
});

describe('avoid objective debrief status', () => {
  it('unviolated avoid is upheld even on a loss', () => {
    expect(avoidViolated({ failed: false, violations: 0 })).toBe(false);
    expect(avoidViolated({ failed: false })).toBe(false);
    expect(avoidViolated({ failed: false, violations: 1 })).toBe(true);
    expect(avoidViolated({ failed: true, violations: 3 })).toBe(true);
  });

  it('objectiveSummary exposes violations and kind for the debrief', () => {
    const s = setup(mission({
      entities: [{ id: 'portal', kind: 'console', x: 2, y: 2, sprite: 'console', tags: ['pay-ransom'] }],
      missionObjectives: [
        { id: 'no-pay', text: 'Do not pay the ransom', kind: 'avoid', tag: 'pay-ransom' },
        { id: 'exit', text: 'Exit', kind: 'reach-exit' },
      ],
    }));
    s.bus.emit('player-down', {});
    const summary = s.rt.objectiveSummary().find((o) => o.kind === 'avoid')!;
    expect(summary.failed).toBe(false);
    expect(summary.violations).toBe(0);
    expect(avoidViolated(summary)).toBe(false); // renders upheld, not "you paid"
  });
});

describe('patch objective kind', () => {
  const patchMission = () => mission({
    entities: [
      { id: 'vuln', kind: 'workstation', x: 2, y: 2, sprite: 'workstation', tags: ['vulnerability-confirmed'], inspect: { label: 'Finding', detail: '', category: 'legit' } },
      { id: 'other', kind: 'workstation', x: 3, y: 2, sprite: 'workstation', tags: ['plain'] },
    ],
    missionObjectives: [
      { id: 'patch-em', text: 'Patch the finding', kind: 'patch', tag: 'vulnerability-confirmed' },
      { id: 'exit', text: 'Exit', kind: 'reach-exit' },
    ],
  });

  it('counts tool-hit patch on the tagged host, not elsewhere', () => {
    const s = setup(patchMission());
    s.bus.emit('tool-hit', { toolId: 'patch', entityId: 'other', good: true });
    expect(s.rt.objectives[0].done).toBe(false);
    s.bus.emit('tool-hit', { toolId: 'patch', entityId: 'vuln', good: true });
    expect(s.rt.objectives[0].done).toBe(true);
  });

  it('ignores bad patch hits and other tools', () => {
    const s = setup(patchMission());
    s.bus.emit('tool-hit', { toolId: 'patch', entityId: 'vuln', good: false });
    s.bus.emit('tool-hit', { toolId: 'usb', entityId: 'vuln', good: true });
    expect(s.rt.objectives[0].done).toBe(false);
  });

  it('patch tool refuses an uninspected triage host without spending a disk', () => {
    const s = setup(patchMission());
    const vuln = s.rt.byId('vuln')!;
    vuln.def.tags = ['triage', 'vulnerability-confirmed'];
    const messages: { text: string; kind?: string }[] = [];
    s.bus.on('message', (m) => messages.push(m));
    const ctx = {
      bus: s.bus,
      entities: s.rt.entities,
      authorizedRoles: [],
      isInspected: (id: string) => s.rt.wasInspected(id),
      aimEntity: () => vuln,
    } as unknown as ToolUseContext;
    expect(patchTool.use(ctx)).toBe(false);
    expect(vuln.state.patched).toBeUndefined();
    expect(messages.at(-1)!.text).toContain('Confirm the finding first: inspect');
    expect(messages.at(-1)!.kind).toBe('warn');
    // after inspection it patches
    s.bus.emit('inspect', { entityId: 'vuln' });
    expect(patchTool.use(ctx)).toBe(true);
    expect(vuln.state.patched).toBe(true);
  });
});

describe('enemy in the way warning', () => {
  it('flags an enemy blocking a workstation in the aim line', () => {
    const s = setup(mission({
      entities: [
        { id: 'worm', kind: 'enemy', x: 2, y: 2.5, sprite: 'worm' },
        { id: 'ws', kind: 'workstation', x: 3, y: 2.5, sprite: 'workstation' },
      ],
      missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }],
    }));
    // player at (1.5,2.5) aiming +x: worm at (2,2) blocks ws at (3,2)
    const blocked = enemyInTheWay(s.rt.entities, 1.5, 2.5, 0, s.map);
    expect(blocked?.def.id).toBe('worm');
  });

  it('returns null when nothing blocks', () => {
    const s = setup(mission({
      entities: [{ id: 'ws', kind: 'workstation', x: 3, y: 2, sprite: 'workstation' }],
      missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }],
    }));
    expect(enemyInTheWay(s.rt.entities, 1.5, 2.5, 0, s.map)).toBeNull();
    // enemy behind the player does not count either
    s.rt.entities.push({
      def: { id: 'w', kind: 'enemy', x: 0, y: 2, sprite: 'worm' } as never,
      x: 0.5, y: 2.5, hp: 1, alive: true, infected: false, state: {},
    });
    expect(enemyInTheWay(s.rt.entities, 1.5, 2.5, 0, s.map)).toBeNull();
  });
});

describe('mission select row states', () => {
  it('cleared / next / locked derive from progress', () => {
    const store = new Map<string, string>();
    const prev = globalThis.localStorage;
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      get length() { return store.size; },
    } as Storage;
    try {
      store.set('cyberdoom.progress', JSON.stringify(['m01']));
      const states = missionRowStates(['m01', 'm02', 'm03', 'm04']);
      expect(states.get('m01')).toBe('cleared');
      expect(states.get('m02')).toBe('next');
      expect(states.get('m03')).toBe('locked'); // m02 uncleared
      expect(states.get('m04')).toBe('locked');
      store.set('cyberdoom.progress', JSON.stringify(['m01', 'm02', 'm03', 'm04']));
      expect(missionRowStates(['m01', 'm02']).get('m02')).toBe('cleared');
    } finally {
      (globalThis as { localStorage?: Storage }).localStorage = prev;
    }
  });
});

describe('dossier bounds', () => {
  it('panel sits below the ticker and above the status bar', () => {
    expect(DOSSIER_Y).toBeGreaterThanOrEqual(40); // below top message lines
    expect(DOSSIER_Y + DOSSIER_H + 2).toBeLessThanOrEqual(200 - BASE_STATUS); // above status bar
    expect(DOSSIER_X + 296).toBeLessThanOrEqual(320);
    expect(DOSSIER_ROWS * 8 + 26).toBeLessThanOrEqual(DOSSIER_H - 12); // content rows fit
  });
});
