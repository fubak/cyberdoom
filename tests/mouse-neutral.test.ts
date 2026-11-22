import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Entity, ToolUseContext } from '../src/core/types';
import { mouseTool } from '../src/tools/mouse';

function item(id: string, infected: boolean, category: 'legit' | 'malware'): Entity {
  return {
    def: {
      id,
      kind: 'item',
      x: 2,
      y: 0,
      sprite: 'charge',
      inspect: { label: id, detail: '', category },
    },
    x: 2,
    y: 0,
    hp: 1,
    alive: true,
    infected,
    state: {},
  };
}

function inspectItem(entity: Entity) {
  const bus = new EventBus();
  const messages: string[] = [];
  bus.on('message', ({ text }) => messages.push(text));
  const ctx: ToolUseContext = {
    playerX: 0,
    playerY: 0,
    playerAngle: 0,
    entities: [entity],
    projectiles: [],
    wallDistance: 10,
    isDoorAhead: () => null,
    openDoor: () => {},
    bus,
    fireProjectile: () => {},
    aimEntity: () => entity,
    authorizedRoles: ['analyst'],
    role: 'analyst',
  };
  mouseTool.use(ctx);
  return { message: messages[0], hint: mouseTool.hint!(ctx)?.text };
}

describe('mouse prompts stay neutral before a triage decision', () => {
  it('gives benign and malicious items the same first-inspect message and hint', () => {
    const benign = inspectItem(item('benign', false, 'legit'));
    const malicious = inspectItem(item('malicious', true, 'malware'));
    const message = 'Weigh the evidence. Click again to FLAG it, or leave it if it checks out.';

    expect(benign.message).toBe(message);
    expect(malicious.message).toBe(message);
    expect(benign.message).not.toContain('MALICIOUS');
    expect(malicious.message).not.toContain('MALICIOUS');

    expect(benign.hint).toBe('FLAG ITEM OR MOVE ON');
    expect(malicious.hint).toBe(benign.hint);
    expect(benign.hint).not.toContain('MALICIOUS');
    expect(malicious.hint).not.toContain('MALICIOUS');
  });
});
