import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { m09, m09Teach } from '../src/content/missions/m09-locked-out';
import { MissionRuntime } from '../src/missions/runtime';

describe('M09 ransom outcome', () => {
  it('scores payment as a missed objective without ending the mission', () => {
    const bus = new EventBus();
    const messages: { text: string; kind?: string }[] = [];
    bus.on('message', (message) => messages.push(message));
    const runtime = new MissionRuntime(m09, bus);

    bus.emit('interact', { entityId: 'ransom-portal' });
    bus.emit('interact', { entityId: 'ransom-portal' });

    const payment = runtime.scoreLog.find((entry) => entry.objectives.includes('no-pay'));
    expect(payment).toMatchObject({ points: -250, good: false, objectives: ['no-pay'] });
    expect(runtime.finished).toBeNull();
    expect(runtime.lossReason).toBeNull();
    expect(runtime.lossCause).toBeNull();
    expect(runtime.objectives.find((objective) => objective.def.id === 'no-pay')?.failed).toBe(true);
    expect(runtime.scoreLog.some((entry) => entry.text.startsWith('Mission failed:'))).toBe(false);
    expect(messages).toContainEqual({
      text: 'PAID 14 BTC. The decryptor is slow and corrupts files, and the attacker is still inside. Legal, the insurer and law enforcement now have to be told.',
      kind: 'bad',
    });

    bus.emit('interact', { entityId: 'netflow' });
    bus.emit('interact', { entityId: 'pz-fin03' });
    bus.emit('interact', { entityId: 'core-switch' });
    for (const entity of m09.entities.filter((candidate) => candidate.tags?.includes('enc-host'))) {
      bus.emit('inspect', { entityId: entity.id });
      bus.emit('call-pick', { entityId: entity.id, action: 'quarantine' });
      bus.emit('cleaned', { entityId: entity.id });
    }
    bus.emit('interact', { entityId: 'restore' });
    bus.emit('interact', { entityId: 'lessons' });
    bus.emit('cleaned', { entityId: 'rw-a' });
    bus.emit('reach-exit', {});

    expect(runtime.finished).toBe('won');
    expect(runtime.objectives.find((objective) => objective.def.id === 'no-pay')?.failed).toBe(true);
    expect(m09Teach.lessons['no-pay'].missed).toBe(
      'You paid. US Treasury (OFAC) warns that paying a sanctioned group can itself be a violation. Payment funds the next attack, marks you as a payer for repeat extortion, and decryptors are often slow or broken. You still had to eradicate and restore from offline backups.',
    );
  });
});
