import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Mission } from '../src/core/types';
import { WorldMap } from '../src/engine/map';
import { MissionRuntime } from '../src/missions/runtime';

const mapDef = {
  grid: ['#####', '#...#', '#...#', '#####'],
  legend: {
    '#': { kind: 'wall' as const, tex: 'wall' },
    '.': { kind: 'floor' as const, tex: 'floor' },
  },
  spawn: { x: 1.5, y: 1.5, angle: 0 },
};

function build() {
  const m: Mission = {
    id: 'test', title: 'TEST', difficulty: 1, objectives: [], briefing: '', map: mapDef,
    entities: [
      { id: 'trap', kind: 'console', x: 2.5, y: 1.5, sprite: 'console', tags: ['bad'],
        inspect: { label: 'Prod Deploy', detail: '', category: 'item' } },
      { id: 'safe', kind: 'console', x: 3.5, y: 1.5, sprite: 'console', tags: ['ok'] },
    ],
    missionObjectives: [{ id: 'avoid', text: 'Never deploy', kind: 'avoid', tag: 'bad' }],
    debriefQuestions: [], authorizedRoles: ['analyst'],
  };
  const bus = new EventBus();
  const messages: string[] = [];
  bus.on('message', (x) => messages.push(x.text));
  const rt = new MissionRuntime(m, bus);
  void new WorldMap(m.map);
  return { bus, rt, messages };
}

describe('final-action confirmation', () => {
  it('first E on a mission-ending console only arms it', () => {
    const { bus, rt, messages } = build();
    bus.emit('interact', { entityId: 'trap' });
    expect(rt.finished).toBeNull();
    expect(messages.at(-1)).toMatch(/CONFIRM: Prod Deploy .*press E again/i);
    expect(rt.interactHint(rt.byId('trap')!)).toBe('PRESS E AGAIN TO CONFIRM');
  });

  it('a second E commits', () => {
    const { bus, rt } = build();
    bus.emit('interact', { entityId: 'trap' });
    bus.emit('interact', { entityId: 'trap' });
    expect(rt.finished).toBe('lost');
  });

  it('the armed state expires and switching target disarms', () => {
    const { bus, rt } = build();
    bus.emit('interact', { entityId: 'trap' });
    rt.elapsed += MissionRuntime.CONFIRM_WINDOW + 1;
    bus.emit('interact', { entityId: 'trap' });
    expect(rt.finished).toBeNull();
    bus.emit('interact', { entityId: 'safe' });
    bus.emit('interact', { entityId: 'trap' });
    expect(rt.finished).toBeNull();
  });

  it('ordinary consoles are not gated and do not reveal a prompt', () => {
    const { rt } = build();
    expect(rt.needsConfirm(rt.byId('safe')!)).toBe(false);
    expect(rt.interactHint(rt.byId('trap')!)).toBe('USE CONSOLE');
  });
});
