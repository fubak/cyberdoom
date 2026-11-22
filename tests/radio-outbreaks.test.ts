import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { RADIO_LINES, formatRadioLine } from '../src/content/radio';
import { EventBus } from '../src/core/events';
import { MissionRuntime } from '../src/missions/runtime';
import { WorldMap } from '../src/engine/map';

describe('Campaign radio chatter & decision-tied triggers (C4/C5)', () => {
  it('defines concise start, midpoint, and ready SOC-LEAD radio lines for M01-M12', () => {
    for (const m of missionRegistry.all()) {
      const lines = RADIO_LINES[m.id];
      expect(lines, `missing radio lines for ${m.id}`).toBeDefined();
      for (const key of ['start', 'midpoint', 'ready'] as const) {
        const formatted = formatRadioLine(lines[key]);
        expect(formatted.startsWith('[SOC-LEAD] ')).toBe(true);
        expect(formatted.length, `${m.id}.${key} too long`).toBeLessThanOrEqual(120);
      }
    }
  });

  it('emits start radio line after 4 seconds of mission time via the existing message bus', () => {
    const m01 = missionRegistry.get('m01')!;
    const bus = new EventBus();
    const messages: string[] = [];
    bus.on('message', (e) => messages.push(e.text));

    const rt = new MissionRuntime(m01, bus);
    const map = new WorldMap(m01.map);
    const world = {
      player: { x: m01.map.spawn.x, y: m01.map.spawn.y, angle: m01.map.spawn.angle, integrity: 100 },
      map,
      use: false,
      openDoor: () => {},
    };

    rt.update(2, world);
    expect(messages.some((m) => m.startsWith('[SOC-LEAD]'))).toBe(false);

    rt.update(2.5, world);
    expect(messages.some((m) => m.startsWith('[SOC-LEAD]'))).toBe(true);
  });

  it('suppresses a spawn trigger when its `unless` security control objective is already complete', () => {
    const m06 = missionRegistry.get('m06')!;
    const bus = new EventBus();
    const rt = new MissionRuntime(m06, bus);
    const map = new WorldMap(m06.map);

    // Mark `rotate` objective done before entering the key-management room.
    const rotate = rt.objectives.find((o) => o.def.id === 'rotate');
    expect(rotate).toBeDefined();
    rotate!.done = true;

    rt.update(0.1, {
      player: { x: 30.5, y: 10.5, angle: 0, integrity: 100 },
      map,
      use: false,
      openDoor: () => {},
    });

    const wormA = rt.entities.find((e) => e.def.id === 'key-worm-a');
    expect(wormA?.alive).toBe(false);
  });
});
