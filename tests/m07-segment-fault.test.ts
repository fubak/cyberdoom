import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { m07 } from '../src/content/missions/m07-segment-fault';
import { WorldMap } from '../src/engine/map';
import { MissionRuntime } from '../src/missions/runtime';

function setup() {
  const bus = new EventBus();
  const messages: { text: string; kind?: string }[] = [];
  bus.on('message', (message) => messages.push(message));
  const rt = new MissionRuntime(m07, bus);
  const map = new WorldMap(m07.map);
  const player = { x: m07.map.spawn.x, y: m07.map.spawn.y, angle: m07.map.spawn.angle, integrity: 100 };
  return { bus, messages, rt, map, player };
}

function tick(state: ReturnType<typeof setup>, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
    state.rt.update(0.05, { player: state.player, map: state.map, use: false, openDoor: (id) => state.map.openDoor(id) });
  }
}

const DEVICES = ['sw-legacy', 'scada-01', 'web-01', 'db-01', 'pc-04'];

function audit(state: ReturnType<typeof setup>): void {
  state.bus.emit('interact', { entityId: 'net-design' });
  for (const id of DEVICES) state.bus.emit('inspect', { entityId: id });
}

describe('m07 segment fault', () => {
  it('scores a wrong placement call once and explains it in the case file', () => {
    const state = setup();
    state.bus.emit('interact', { entityId: 'fw-inside-legacy' });
    expect(state.rt.score).toBe(-15);
    expect(state.rt.scoreLog).toContainEqual(expect.objectContaining({ tag: 'bad-choice' }));
    expect(state.rt.byId('fw-inside-legacy')?.alive).toBe(true);
    // a second poke is not scored again
    state.bus.emit('interact', { entityId: 'fw-inside-legacy' });
    expect(state.rt.score).toBe(-15);
  });

  it('requires the audit before any placement counts', () => {
    const state = setup();
    state.bus.emit('interact', { entityId: 'fw-chokepoint' });
    expect(state.rt.objectives.find((o) => o.def.id === 'fw-place')?.done).toBe(false);
    expect(state.messages.at(-1)?.text).toMatch(/^First: /);
  });

  it('resolves a placement group on the right call', () => {
    const state = setup();
    audit(state);
    state.bus.emit('interact', { entityId: 'fw-chokepoint' });
    expect(state.rt.objectives.find((o) => o.def.id === 'fw-place')?.done).toBe(true);
    expect(state.rt.byId('fw-inside-legacy')?.alive).toBe(false);
    expect(state.rt.byId('fw-edge')?.alive).toBe(false);
  });

  it('refuses deny-all before the allows, then fails an unauthorized second attempt', () => {
    const state = setup();
    audit(state);
    state.bus.emit('interact', { entityId: 'fw-chokepoint' });
    state.bus.emit('interact', { entityId: 'rule-deny' });
    expect(state.rt.objectives.find((o) => o.def.id === 'acl-deny')?.done).toBe(false);
    expect(state.messages.at(-1)?.text).toMatch(/CHANGE NOT APPROVED/);
    expect(state.rt.finished).toBeNull();
    // second unauthorized attempt within the override window loses the mission
    state.bus.emit('interact', { entityId: 'rule-deny' });
    expect(state.rt.objectives.find((o) => o.def.id === 'acl-order')?.failed).toBe(true);
    expect(state.rt.finished).toBe('lost');
  });

  it('re-infects cleaned flat-LAN hosts until the firewall is placed', () => {
    const state = setup();
    audit(state);
    // clean a host before segmenting: the outbreak puts it right back
    state.bus.emit('inspect', { entityId: 'ws-plant1' });
    state.bus.emit('call-pick', { entityId: 'ws-plant1', action: 'quarantine' });
    state.bus.emit('cleaned', { entityId: 'ws-plant1' });
    expect(state.rt.byId('ws-plant1')?.infected).toBe(false);
    tick(state, 19);
    expect(state.rt.byId('ws-plant1')?.infected).toBe(true);
    expect(state.rt.objectives.find((o) => o.def.id === 'flat-host')?.progress).toBe(0);
    // after the firewall is inline, cleaned hosts stay clean
    state.bus.emit('interact', { entityId: 'fw-chokepoint' });
    state.bus.emit('inspect', { entityId: 'ws-plant1' });
    state.bus.emit('call-pick', { entityId: 'ws-plant1', action: 'quarantine' });
    state.bus.emit('cleaned', { entityId: 'ws-plant1' });
    tick(state, 19);
    expect(state.rt.byId('ws-plant1')?.infected).toBe(false);
    expect(state.rt.objectives.find((o) => o.def.id === 'flat-host')?.progress).toBe(1);
  });
});
