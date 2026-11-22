import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  keyLabel,
  rebind,
  resolveBindings,
} from '../src/engine/bindings';

describe('keyboard bindings', () => {
  it('preserves the current default controls', () => {
    expect(DEFAULT_BINDINGS).toEqual({
      forward: ['KeyW'],
      back: ['KeyS'],
      strafeLeft: ['KeyA'],
      strafeRight: ['KeyD'],
      turnLeft: ['ArrowLeft'],
      turnRight: ['ArrowRight'],
      run: ['ShiftLeft', 'ShiftRight'],
      use: ['KeyE', 'Space'],
      fire: ['KeyF'],
      cycle: ['KeyQ'],
      map: ['KeyM'],
      log: ['KeyL'],
    });
    expect(Object.keys(ACTION_LABELS)).toEqual(Object.keys(DEFAULT_BINDINGS));
    expect(ACTION_LABELS).toMatchObject({
      forward: 'MOVE FORWARD',
      back: 'MOVE BACK',
      strafeLeft: 'STRAFE LEFT',
      strafeRight: 'STRAFE RIGHT',
      turnLeft: 'TURN LEFT',
      turnRight: 'TURN RIGHT',
      run: 'RUN',
      use: 'USE / INTERACT',
      fire: 'USE TOOL (KEY)',
      cycle: 'NEXT TOOL',
      map: 'MAP',
      log: 'EVIDENCE LOG',
    });
  });

  it('rebinds one action and removes the key from other actions', () => {
    const bindings = resolveBindings({});
    const rebound = rebind(bindings, 'forward', 'KeyE');

    expect(rebound.forward).toEqual(['KeyE']);
    expect(rebound.use).toEqual(['Space']);
    expect(bindings.forward).toEqual(['KeyW']);
    expect(rebind(bindings, 'forward', 'KeyI').forward).toEqual(['KeyI']);
  });

  it('merges valid overrides over defaults and drops invalid entries', () => {
    const bindings = resolveBindings({
      forward: ['KeyI', '', 2, null],
      use: [],
      unknown: ['KeyZ'],
      back: 'KeyS',
    });

    expect(bindings.forward).toEqual(['KeyI']);
    expect(bindings.back).toEqual(['KeyS']);
    expect(bindings.use).toEqual([]);
    expect(bindings.fire).toEqual(['KeyF']);
  });

  it('labels common KeyboardEvent.code values', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowLeft')).toBe('LEFT');
    expect(keyLabel('ShiftRight')).toBe('SHIFT');
    expect(keyLabel('Space')).toBe('SPACE');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('F1')).toBe('F1');
  });
});
