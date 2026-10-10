import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { missionRegistry } from '../src/content/missions';
import { MissionRuntime } from '../src/missions/runtime';

/**
 * CURRICULUM: the "WHAT DO YOU DO?" triage call gates field actions — a
 * clean/release/patch only counts after the right call on the case file,
 * and a wrong call is logged as a violation.
 */
function start(id: string) {
  const bus = new EventBus();
  const rt = new MissionRuntime(missionRegistry.require(id), bus);
  return { bus, rt };
}

const objective = (rt: MissionRuntime, id: string) =>
  rt.objectives.find((o) => o.def.id === id)!;

describe('triage call gating', () => {
  it('attaches a WHAT DO YOU DO? call to the case file on inspect', () => {
    const { bus, rt } = start('m01');
    bus.emit('inspect', { entityId: 'ws1' });
    const entry = rt.evidence.find((e) => e.id === 'ws1:inspect');
    expect(entry?.call).toBeDefined();
    expect(entry?.call?.resolved).toBe(false);
    expect(entry?.call?.options.length).toBeGreaterThanOrEqual(2);
    // the file itself must not reveal the right answer
    expect(entry?.call && 'required' in entry.call).toBe(false);
    expect(entry?.call && 'correct' in entry.call).toBe(false);
  });

  it('a clean without the correct triage call does not complete the objective', () => {
    const { bus, rt } = start('m01');
    bus.emit('inspect', { entityId: 'ws1' });
    const entity = rt.byId('ws1')!;
    entity.hp = 0;
    bus.emit('cleaned', { entityId: 'ws1' });
    expect(objective(rt, 'clean-all').progress).toBe(0);
    // the clean is reverted: the host is still live until the call is made
    expect(entity.infected).toBe(true);
    expect(entity.alive).toBe(true);
  });

  it('a wrong call is logged as a violation', () => {
    const { bus, rt } = start('m01');
    bus.emit('inspect', { entityId: 'ws1' });
    bus.emit('call-pick', { entityId: 'ws1', action: 'release' });
    expect(objective(rt, 'wrong-call').violations).toBe(1);
    const entry = rt.evidence.find((e) => e.id === 'ws1:inspect');
    expect(entry?.call?.resolved).toBe(false);
    expect(entry?.call?.feedback).toBeTruthy();
  });

  it('the correct call lets the clean count', () => {
    const { bus, rt } = start('m01');
    bus.emit('inspect', { entityId: 'ws1' });
    bus.emit('call-pick', { entityId: 'ws1', action: 'quarantine' });
    expect(objective(rt, 'wrong-call').violations).toBe(0);
    const entity = rt.byId('ws1')!;
    entity.hp = 0;
    bus.emit('cleaned', { entityId: 'ws1' });
    expect(objective(rt, 'clean-all').progress).toBe(1);
  });

  it('release on a legitimate mail only counts after the release call (m04)', () => {
    const { bus, rt } = start('m04');
    bus.emit('inspect', { entityId: 'mail-legit-a' });
    bus.emit('interact', { entityId: 'mail-legit-a' });
    expect(objective(rt, 'release').progress).toBe(0);
    bus.emit('call-pick', { entityId: 'mail-legit-a', action: 'release' });
    bus.emit('interact', { entityId: 'mail-legit-a' });
    expect(objective(rt, 'release').progress).toBe(1);
  });

  it('a patch without the confirmed call does not count (m05)', () => {
    const { bus, rt } = start('m05');
    bus.emit('inspect', { entityId: 'vuln-hr' });
    const entity = rt.byId('vuln-hr')!;
    entity.state.patched = true;
    bus.emit('tool-hit', { toolId: 'patch', entityId: 'vuln-hr', good: true });
    expect(objective(rt, 'confirmed-hosts').progress).toBe(0);
    expect(entity.state.patched).toBe(false);
    bus.emit('call-pick', { entityId: 'vuln-hr', action: 'patch' });
    entity.state.patched = true;
    bus.emit('tool-hit', { toolId: 'patch', entityId: 'vuln-hr', good: true });
    expect(objective(rt, 'confirmed-hosts').progress).toBe(1);
  });

  it('derives the required call from evidence category data', () => {
    const { rt } = start('m01');
    expect(rt.callRequiredFor('ws1')).toBe('quarantine');
    expect(rt.callRequiredFor('ws-decoy')).toBe('release');
    const { rt: rt5 } = start('m05');
    expect(rt5.callRequiredFor('vuln-db')).toBe('patch');
    expect(rt5.callRequiredFor('false-positive-printer')).toBe('release');
  });
});
