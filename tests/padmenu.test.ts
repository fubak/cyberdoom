import { describe, expect, it } from 'vitest';
import { PadMenuNav } from '../src/engine/padmenu';

function pad(pressed: number[] = [], axes: number[] = [0, 0, 0, 0]) {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  };
}

describe('gamepad menu navigation', () => {
  it('maps A/B/D-pad to Enter/Escape/arrows on the press edge only', () => {
    const nav = new PadMenuNav();
    expect(nav.step(pad([0]), 0.016).map((k) => k.key)).toEqual(['Enter']);
    expect(nav.step(pad([0]), 1)).toEqual([]);
    expect(nav.step(pad([]), 0.016)).toEqual([]);
    expect(nav.step(pad([1]), 0.016).map((k) => k.key)).toEqual(['Escape']);
    expect(nav.step(pad([13]), 0.016).map((k) => k.key)).toEqual(['ArrowDown']);
  });

  it('auto-repeats held directions and maps the left stick', () => {
    const nav = new PadMenuNav();
    expect(nav.step(pad([], [0, -0.9]), 0.016).map((k) => k.key)).toEqual(['ArrowUp']);
    expect(nav.step(pad([], [0, -0.9]), 0.3)).toEqual([]);
    expect(nav.step(pad([], [0, -0.9]), 0.2).map((k) => k.key)).toEqual(['ArrowUp']);
    expect(nav.step(pad([], [0, 0.3]), 0.016)).toEqual([]);
  });

  it('skips Start in the pause menu and ignores inputs already held when priming', () => {
    const nav = new PadMenuNav();
    expect(nav.step(pad([9]), 0.016, { startConfirms: false })).toEqual([]);
    const held = new PadMenuNav();
    held.prime(pad([0]));
    expect(held.step(pad([0]), 0.016)).toEqual([]);
    expect(nav.step(pad([9]), 0.016).map((k) => k.key)).toEqual(['Enter']);
  });
});
