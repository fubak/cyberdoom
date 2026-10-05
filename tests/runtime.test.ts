import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Mission } from '../src/core/types';
import { WorldMap } from '../src/engine/map';
import { MissionRuntime } from '../src/missions/runtime';

const mapDef = {
  grid: [
    '#######',
    '#.....#',
    '#.....#',
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

function mission(
  overrides: Partial<Mission> & Pick<Mission, 'missionObjectives'>,
): Mission {
  return {
    id: 'test',
    title: 'TEST',
    difficulty: 1,
    objectives: [],
    briefing: '',
    map: mapDef,
    entities: [],
    debriefQuestions: [],
    authorizedRoles: ['analyst'],
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

function tick(
  state: ReturnType<typeof setup>,
  dt = 0.05,
  use = false,
  openDoor: (doorId: string) => void = () => {},
) {
  state.rt.update(dt, {
    player: state.player,
    map: state.map,
    use,
    openDoor,
  });
}

describe('MissionRuntime', () => {
  it('spawns dormant entities and opens trigger doors', () => {
    const m = mission({
      entities: [{
        id: 'spawned', kind: 'enemy', x: 3, y: 3, sprite: 'worm', dormant: true,
      }],
      script: {
        par: 30,
        triggers: [{
          id: 'alarm', area: [1, 1, 2, 2], spawn: ['spawned'], openDoors: ['vault'],
          message: 'Alarm cleared', kind: 'good',
        }],
      },
      missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }],
    });
    const state = setup(m);
    const opened: string[] = [];
    tick(state, 0.05, false, (id) => opened.push(id));
    expect(state.rt.byId('spawned')?.alive).toBe(true);
    expect(opened).toEqual(['vault']);
  });

  it('reveals secrets once and awards points', () => {
    const state = setup(mission({
      script: { par: 30, secrets: [{ id: 's1', area: [1, 1, 2, 2], label: 'Server room' }] },
      missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }],
    }));
    tick(state);
    tick(state);
    expect(state.rt.stats().secrets).toBe(1);
    expect(state.rt.score).toBe(25);
    expect(state.messages.filter((m) => m.text.includes('secret')).length).toBe(1);
  });

  it('picks up carried items, accepts them, and grants a role', () => {
    const state = setup(mission({
      entities: [
        {
          id: 'usb', kind: 'item', x: 1.5, y: 1.5, sprite: 'usb', carry: true,
          tags: ['evidence'], inspect: { label: 'Evidence USB', detail: '', category: 'item' },
        },
        {
          id: 'desk', kind: 'console', x: 1.5, y: 1.5, sprite: 'console',
          accepts: 'evidence', tags: ['turn-in'],
          grants: { resource: 'role:ITOPS', amount: 1 },
          inspect: { label: 'Desk', detail: '', category: 'item', objectives: ['4.8'] },
        },
      ],
      missionObjectives: [{ id: 'turn-in', text: 'Turn in evidence', kind: 'interact', tag: 'turn-in' }],
    }));
    tick(state);
    expect(state.rt.inventory.has('usb')).toBe(true);
    state.bus.emit('interact', { entityId: 'desk' });
    expect(state.rt.inventory.size).toBe(0);
    expect(state.rt.roles).toContain('ITOPS');
    expect(state.rt.scoreLog.some((entry) => entry.text.startsWith('Turned in:') && entry.points === 50))
      .toBe(true);
  });

  it('fails on an accepts trap and exposes its loss reason', () => {
    const state = setup(mission({
      entities: [
        {
          id: 'usb', kind: 'item', x: 1.5, y: 1.5, sprite: 'usb', carry: true,
          tags: ['found-usb'], inspect: { label: 'Unknown USB', detail: '', category: 'item' },
        },
        {
          id: 'trap', kind: 'console', x: 1.5, y: 1.5, sprite: 'console',
          accepts: 'found-usb', tags: ['found-usb'],
        },
      ],
      missionObjectives: [{ id: 'avoid-usb', text: 'Do not plug in USB', kind: 'avoid', tag: 'found-usb' }],
    }));
    tick(state);
    state.bus.emit('interact', { entityId: 'trap' });
    expect(state.rt.finished).toBe('lost');
    expect(state.rt.lossReason).toBe('Do not plug in USB');
  });

  it('uses strikes before losing on repeated false accusations', () => {
    const state = setup(mission({
      entities: [{
        id: 'innocent', kind: 'npc', x: 2, y: 2, sprite: 'npc',
        reportable: true, culprit: false,
        inspect: { label: 'Innocent', detail: '', category: 'person' },
      }],
      missionObjectives: [{
        id: 'false', text: 'No false accusations', kind: 'avoid',
        tag: 'false-accuse', strikes: 2,
      }],
    }));
    state.bus.emit('interact', { entityId: 'innocent' });
    expect(state.rt.finished).toBeNull();
    expect(state.rt.objectives[0].violations).toBe(1);
    state.bus.emit('interact', { entityId: 'innocent' });
    expect(state.rt.finished).toBe('lost');
    expect(state.rt.lossReason).toBe('No false accusations');
  });

  it('refuses an interaction whose requirements are unmet', () => {
    const state = setup(mission({
      entities: [{
        id: 'console', kind: 'console', x: 2, y: 2, sprite: 'console',
        tags: ['report-console'], log: 'Read this',
      }],
      missionObjectives: [
        { id: 'evidence', text: 'Collect evidence', kind: 'inspect', tag: 'evidence' },
        { id: 'report', text: 'File report', kind: 'interact', tag: 'report-console', requires: ['evidence'] },
      ],
    }));
    state.bus.emit('interact', { entityId: 'console' });
    expect(state.rt.objectives.find((objective) => objective.def.id === 'report')?.done).toBe(false);
    expect(state.messages.at(-1)?.text).toBe('First: Collect evidence');
  });

  it('marks an obeyed doors objective done at win, but violations are not fatal', () => {
    const make = () => setup(mission({
      missionObjectives: [
        { id: 'doors', text: 'Use authorized doors', kind: 'doors' },
        { id: 'exit', text: 'Reach exit', kind: 'reach-exit' },
      ],
    }));
    const obeyed = make();
    obeyed.bus.emit('reach-exit', {});
    expect(obeyed.rt.finished).toBe('won');
    expect(obeyed.rt.objectives.find((objective) => objective.def.id === 'doors')?.done).toBe(true);

    const violated = make();
    violated.bus.emit('badge-door', { doorId: 'admin', accessRole: 'admin', allowed: false });
    violated.bus.emit('reach-exit', {});
    expect(violated.rt.finished).toBe('won');
    expect(violated.rt.objectives.find((objective) => objective.def.id === 'doors')?.failed).toBe(true);
    expect(violated.rt.objectives.find((objective) => objective.def.id === 'doors')?.done).toBe(false);
  });

  it('marks an obeyed avoid objective done at win', () => {
    const state = setup(mission({
      missionObjectives: [
        { id: 'avoid', text: 'Avoid traps', kind: 'avoid', tag: 'trap' },
        { id: 'exit', text: 'Reach exit', kind: 'reach-exit' },
      ],
    }));
    state.bus.emit('reach-exit', {});
    expect(state.rt.objectives.find((objective) => objective.def.id === 'avoid')?.done).toBe(true);
  });

  it('reinfects a cleaned entity during an outbreak and decrements progress', () => {
    const state = setup(mission({
      entities: [{
        id: 'worm', kind: 'enemy', x: 2, y: 2, sprite: 'worm', infected: true, hp: 2,
        tags: ['infected'],
      }],
      script: { par: 30, outbreak: { tag: 'infected', every: 1, until: 'done', message: 'Outbreak!' } },
      missionObjectives: [
        { id: 'clean', text: 'Clean worm', kind: 'clean', tag: 'infected' },
        { id: 'done', text: 'Finish', kind: 'interact', tag: 'finish' },
      ],
    }));
    state.bus.emit('cleaned', { entityId: 'worm' });
    expect(state.rt.objectives.find((objective) => objective.def.id === 'clean')?.done).toBe(true);
    tick(state, 1);
    expect(state.rt.byId('worm')?.infected).toBe(true);
    expect(state.rt.byId('worm')?.alive).toBe(true);
    expect(state.rt.objectives.find((objective) => objective.def.id === 'clean')?.progress).toBe(0);
    expect(state.rt.objectives.find((objective) => objective.def.id === 'clean')?.done).toBe(false);
  });

  it('credits a correct report to the culprit inspection objectives', () => {
    const state = setup(mission({
      entities: [{
        id: 'culprit', kind: 'npc', x: 2, y: 2, sprite: 'npc',
        reportable: true, culprit: true,
        inspect: { label: 'Insider', detail: '', category: 'suspicious', objectives: ['2.1', '2.4'] },
      }],
      missionObjectives: [{ id: 'report', text: 'Report insider', kind: 'report' }],
    }));
    state.bus.emit('interact', { entityId: 'culprit' });
    expect(state.rt.scoreLog.find((entry) => entry.text.startsWith('Correct'))?.objectives)
      .toEqual(['2.1', '2.4']);
  });
});
