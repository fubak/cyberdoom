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

  it('requires inspection before cleaning an infected workstation', () => {
    const state = setup(mission({
      entities: [{
        id: 'host', kind: 'workstation', x: 2, y: 2, sprite: 'workstation',
        infected: true, hp: 2,
        inspect: { label: 'Unconfirmed host', detail: 'Raw host indicators.', category: 'malware' },
      }],
      missionObjectives: [{ id: 'clean', text: 'Clean host', kind: 'clean', tag: 'infected' }],
    }));
    const host = state.rt.byId('host')!;
    state.bus.emit('interact', { entityId: 'host' });
    expect(host.infected).toBe(true);
    expect(state.rt.score).toBe(-10);

    state.bus.emit('cleaned', { entityId: 'host' });
    expect(host.alive).toBe(true);
    expect(host.infected).toBe(true);
    expect(host.hp).toBe(2);
    expect(state.rt.score).toBe(-10);

    host.hp = 0;
    state.bus.emit('cleaned', { entityId: 'host' });
    expect(host.hp).toBe(2);
    expect(state.rt.score).toBe(-10);

    state.bus.emit('inspect', { entityId: 'host' });
    expect(host.state.revealed).toBe(true);
    state.bus.emit('cleaned', { entityId: 'host' });
    expect(host.alive).toBe(false);
    expect(host.infected).toBe(false);
    expect(state.rt.score).toBe(15);
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

  it('fails an early interaction through its configured avoid objective', () => {
    const state = setup(mission({
      entities: [{
        id: 'patch', kind: 'console', x: 2, y: 2, sprite: 'console',
        tags: ['patch'],
      }],
      missionObjectives: [
        { id: 'docs', text: 'Collect change documents', kind: 'inspect', tag: 'docs' },
        {
          id: 'apply', text: 'Apply the patch', kind: 'interact', tag: 'patch',
          requires: ['docs'], earlyViolates: 'early-patch',
        },
        { id: 'early-patch', text: 'Do not patch early', kind: 'avoid' },
      ],
    }));
    state.bus.emit('interact', { entityId: 'patch' });
    expect(state.rt.finished).toBe('lost');
    expect(state.rt.lossReason).toBe('Do not patch early');
    expect(state.rt.objectives.find((objective) => objective.def.id === 'early-patch')?.violations).toBe(1);
  });

  it('loses after three wrong triage calls and removes integrity each time', () => {
    const state = setup(mission({
      entities: [{
        id: 'false-positive', kind: 'workstation', x: 2, y: 2, sprite: 'workstation',
        tags: ['triage'], infected: false,
      }],
      missionObjectives: [{
        id: 'wrong-call', text: 'Avoid wrong triage calls', kind: 'avoid',
        tag: 'wrong-call', strikes: 3,
      }],
    }));
    tick(state);
    for (let i = 0; i < 3; i++) {
      state.bus.emit('tool-hit', { toolId: 'usb', entityId: 'false-positive', good: false });
    }
    expect(state.rt.finished).toBe('lost');
    expect(state.rt.lossReason).toBe('Avoid wrong triage calls');
    expect(state.player.integrity).toBe(70);
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

  it('records inspect evidence once, reopens it on every read, and keeps the ticker short', () => {
    const detail = 'A long chain of evidence that must remain in the case file, not in the ticker.';
    const state = setup(mission({
      entities: [{
        id: 'decoy', kind: 'workstation', x: 2, y: 2, sprite: 'workstation-infected', tags: ['decoy'],
        inspect: { label: 'Workstation PRN-02 (print room)', detail, category: 'legit' },
      }],
      missionObjectives: [{ id: 'read', text: 'Read the host', kind: 'inspect', tag: 'decoy' }],
    }));
    const opened: string[] = [];
    state.bus.on('evidence', (evidence) => opened.push(evidence.id));
    state.bus.emit('inspect', { entityId: 'decoy' });
    state.bus.emit('inspect', { entityId: 'decoy' });

    expect(state.rt.evidence).toHaveLength(1);
    expect(opened).toEqual(['decoy:inspect', 'decoy:inspect']);
    const ticker = state.messages.filter((message) => message.text.startsWith('CASE FILE:'));
    expect(ticker).toHaveLength(2);
    expect(ticker.every((message) => message.text.length <= 40 && !message.text.includes(detail))).toBe(true);
    expect(state.rt.score).toBe(0);
    expect(state.rt.objectives[0].progress).toBe(1);
  });

  it('records console reads as one full log evidence entry', () => {
    const text = 'SECURITY DESK: lost and found.\nHand over found devices; do not plug them in.';
    const state = setup(mission({
      entities: [{
        id: 'desk', kind: 'console', x: 2, y: 2, sprite: 'console', log: text,
        inspect: { label: 'Security Desk', detail: 'Drop point.', category: 'legit' },
      }],
      missionObjectives: [{ id: 'exit', text: 'Finish', kind: 'reach-exit' }],
    }));
    state.bus.emit('interact', { entityId: 'desk' });

    expect(state.rt.evidence).toEqual([{
      id: 'desk:log',
      entityId: 'desk',
      label: 'Security Desk',
      detail: text,
      source: 'log',
      category: 'legit',
    }]);
    expect(state.messages.map((message) => message.text)).toContain('READ: Security Desk');
    expect(state.messages.some((message) => message.text === text)).toBe(false);
  });

  it('scores one scan false positive for a clean decoy without progressing clean objectives', () => {
    const state = setup(mission({
      entities: [{
        id: 'decoy', kind: 'workstation', x: 2, y: 2, sprite: 'workstation-infected', tags: ['decoy'],
        inspect: { label: 'PRN-02', detail: 'Signed spooler.', category: 'legit', objectives: ['2.4'] },
      }],
      missionObjectives: [{ id: 'clean-decoy', text: 'Clean the decoy', kind: 'clean', tag: 'decoy' }],
    }));
    state.bus.emit('scan-miss', { entityId: 'decoy' });
    state.bus.emit('scan-miss', { entityId: 'decoy' });

    const falsePositives = state.rt.scoreLog.filter((entry) => entry.tag === 'false-positive');
    expect(falsePositives).toHaveLength(1);
    expect(falsePositives[0]).toMatchObject({
      text: 'False positive: PRN-02 was clean',
      points: -25,
      good: false,
      objectives: ['2.4'],
      tag: 'false-positive',
    });
    expect(state.rt.objectives[0].progress).toBe(0);
    expect(state.rt.objectives[0].done).toBe(false);
    expect(state.rt.finished).toBeNull();
  });

  it('scores triage once per entity and tags a false-positive flag', () => {
    const state = setup(mission({
      entities: [
        {
          id: 'clean', kind: 'workstation', x: 2, y: 2, sprite: 'workstation',
          inspect: { label: 'Clean host', detail: '', category: 'legit' },
        },
        {
          id: 'infected', kind: 'workstation', x: 3, y: 2, sprite: 'workstation-infected', infected: true,
          inspect: { label: 'Infected host', detail: '', category: 'malware', objectives: ['2.4'] },
        },
      ],
      missionObjectives: [{ id: 'exit', text: 'Finish', kind: 'reach-exit' }],
    }));
    state.bus.emit('triage', { entityId: 'clean', verdict: 'malicious', correct: false });
    state.bus.emit('triage', { entityId: 'clean', verdict: 'malicious', correct: false });
    state.bus.emit('triage', { entityId: 'infected', verdict: 'malicious', correct: true });
    state.bus.emit('triage', { entityId: 'infected', verdict: 'malicious', correct: true });

    expect(state.rt.scoreLog.filter((entry) => entry.text.startsWith('False positive:'))).toMatchObject([
      { text: 'False positive: Clean host was clean', points: -10, tag: 'false-positive' },
    ]);
    expect(state.rt.scoreLog.filter((entry) => entry.text.startsWith('Correct triage:'))).toMatchObject([
      { text: 'Correct triage: Infected host', points: 10, objectives: ['2.4'] },
    ]);
  });

  it('does not penalize a scan miss on an initially infected entity', () => {
    const state = setup(mission({
      entities: [{
        id: 'infected', kind: 'workstation', x: 2, y: 2, sprite: 'workstation-infected', infected: true,
        inspect: { label: 'Infected host', detail: '', category: 'malware' },
      }],
      missionObjectives: [{ id: 'exit', text: 'Finish', kind: 'reach-exit' }],
    }));
    state.bus.emit('scan-miss', { entityId: 'infected' });
    expect(state.rt.score).toBe(0);
    expect(state.rt.scoreLog).toHaveLength(0);
  });
});
