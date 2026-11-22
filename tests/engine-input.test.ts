import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/engine/input';
import { resolveBindings } from '../src/engine/bindings';

function mouseEvent(type: string, button: number, buttons: number, movementX = 0): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    button: { value: button },
    buttons: { value: buttons },
    movementX: { value: movementX },
  });
  return event;
}

function keyboardEvent(type: string, code: string): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: false },
  });
  return event;
}

function gamepad(
  axes: number[],
  pressed: number[] = [],
  triggerValue = 0,
): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: pressed.includes(index),
    value: index === 7 ? triggerValue : pressed.includes(index) ? 1 : 0,
  }));
  return {
    axes,
    buttons,
    connected: true,
    id: 'mock-standard-pad',
    index: 0,
    mapping: 'standard',
  } as unknown as Gamepad;
}

function fixture() {
  const fakeWindow = new EventTarget();
  const fakeDocument = new EventTarget() as EventTarget & { pointerLockElement: HTMLElement | null };
  let locked: HTMLElement | null = null;
  Object.defineProperty(fakeDocument, 'pointerLockElement', { get: () => locked });
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);

  const fakeCanvas = new EventTarget() as EventTarget & { requestPointerLock: () => void };
  const setLock = (value: boolean) => {
    locked = value ? (fakeCanvas as unknown as HTMLElement) : null;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
  };
  fakeCanvas.requestPointerLock = () => setLock(true);
  const input = new Input(fakeCanvas as unknown as HTMLElement, () => {}, () => true);
  return { input, fakeWindow, fakeDocument, fakeCanvas, setLock };
}

afterEach(() => vi.unstubAllGlobals());

describe('Input pointer-lock fire suppression', () => {
  it('swallows an unlocked lock press until mouseup', () => {
    const { input, fakeWindow, fakeCanvas } = fixture();
    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    expect(input.pointerLocked).toBe(true);
    for (let i = 0; i < 3; i++) {
      input.poll();
      expect(input.firePressed).toBe(false);
      expect(input.fireHeld).toBe(false);
    }

    fakeWindow.dispatchEvent(mouseEvent('mouseup', 0, 0));
    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    input.poll();
    expect(input.firePressed).toBe(true);
    expect(input.fireHeld).toBe(true);
  });

  it('swallows the first click after an Escape-style lock loss', () => {
    const { input, fakeWindow, fakeCanvas, setLock } = fixture();
    setLock(true);
    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    setLock(false);
    input.poll();
    expect(input.firePressed).toBe(false);
    expect(input.fireHeld).toBe(false);

    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    input.poll();
    expect(input.firePressed).toBe(false);
    expect(input.fireHeld).toBe(false);

    fakeWindow.dispatchEvent(mouseEvent('mouseup', 0, 0));
    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    input.poll();
    expect(input.firePressed).toBe(true);
    expect(input.fireHeld).toBe(true);
  });

  it('keeps suppressing if the first locked event reports a held button', () => {
    const { input, fakeWindow, fakeCanvas, setLock } = fixture();
    setLock(true);
    fakeWindow.dispatchEvent(mouseEvent('mousemove', 0, 1));
    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    input.poll();
    expect(input.firePressed).toBe(false);
    expect(input.fireHeld).toBe(false);

    fakeWindow.dispatchEvent(mouseEvent('mouseup', 0, 0));
    fakeCanvas.dispatchEvent(mouseEvent('mousedown', 0, 1));
    input.poll();
    expect(input.firePressed).toBe(true);
    expect(input.fireHeld).toBe(true);
  });

  it('maps Numpad1-9 to slots and KeyQ to cyclePressed', () => {
    const { input, fakeWindow } = fixture();
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'Numpad3'));
    input.poll();
    expect(input.slotPressed).toBe(3);
    input.poll();
    expect(input.slotPressed).toBeNull();

    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyQ'));
    input.poll();
    expect(input.cyclePressed).toBe(true);
    input.poll();
    expect(input.cyclePressed).toBe(false);

    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'Digit5'));
    input.poll();
    expect(input.slotPressed).toBe(5);
  });

  it('keeps KeyF firing through pointer-lock changes', () => {
    const { input, fakeWindow, setLock } = fixture();
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyF'));
    setLock(true);
    setLock(false);
    input.poll();
    expect(input.firePressed).toBe(true);
    expect(input.fireHeld).toBe(true);
    fakeWindow.dispatchEvent(keyboardEvent('keyup', 'KeyF'));
    input.poll();
    expect(input.fireHeld).toBe(false);
  });
});

describe('Input bindings', () => {
  it('routes movement and key edges through the configured bindings', () => {
    const { input, fakeWindow } = fixture();
    input.setBindings(resolveBindings({
      forward: ['KeyI'],
      use: ['KeyJ'],
      fire: ['KeyK'],
      cycle: ['KeyN'],
    }));

    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
    expect(input.actionDown('forward')).toBe(false);
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyI'));
    expect(input.actionDown('forward')).toBe(true);

    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyJ'));
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyK'));
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyN'));
    input.poll();
    expect(input.usePressed).toBe(true);
    expect(input.firePressed).toBe(true);
    expect(input.fireHeld).toBe(true);
    expect(input.cyclePressed).toBe(true);
  });
});

describe('Input gamepad', () => {
  it('applies radial and turn deadzones and rescales the remaining range', () => {
    const { input } = fixture();
    let pad = gamepad([0.1, 0.1, 0.1]);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });

    input.poll();
    expect(input.padMove).toEqual({ x: 0, y: 0 });
    expect(input.padTurn).toBe(0);

    pad = gamepad([0.6, 0, 0.575]);
    input.poll();
    expect(input.padMove.x).toBeCloseTo(0.5);
    expect(input.padMove.y).toBe(0);
    expect(input.padTurn).toBeCloseTo(0.5);

    pad = gamepad([0, -0.6, 0]);
    input.poll();
    expect(input.padMove.x).toBe(0);
    expect(input.padMove.y).toBeCloseTo(0.5);
  });

  it('emits one edge per mapped button press and preserves held controls', () => {
    const { input } = fixture();
    let pad = gamepad([0, 0, 0], [0, 2, 4, 5, 6, 8, 9, 10], 0.75);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });

    input.poll();
    expect(input.usePressed).toBe(true);
    expect(input.firePressed).toBe(true);
    expect(input.fireHeld).toBe(true);
    expect(input.cyclePrevPressed).toBe(true);
    expect(input.cyclePressed).toBe(true);
    expect(input.logPressed).toBe(true);
    expect(input.mapPressed).toBe(true);
    expect(input.pausePressed).toBe(true);
    expect(input.padRun).toBe(true);

    input.poll();
    expect(input.usePressed).toBe(false);
    expect(input.firePressed).toBe(false);
    expect(input.fireHeld).toBe(true);
    expect(input.cyclePrevPressed).toBe(false);
    expect(input.cyclePressed).toBe(false);
    expect(input.logPressed).toBe(false);
    expect(input.mapPressed).toBe(false);
    expect(input.pausePressed).toBe(false);
    expect(input.padRun).toBe(true);

    pad = gamepad([0, 0, 0]);
    input.poll();
    expect(input.fireHeld).toBe(false);
    expect(input.padRun).toBe(false);

    pad = gamepad([0, 0, 0], [0, 2, 4, 5, 6, 8, 9, 10], 0.75);
    input.poll();
    expect(input.usePressed).toBe(true);
    expect(input.firePressed).toBe(true);
    expect(input.cyclePrevPressed).toBe(true);
    expect(input.cyclePressed).toBe(true);
    expect(input.logPressed).toBe(true);
    expect(input.mapPressed).toBe(true);
    expect(input.pausePressed).toBe(true);
  });

  it('treats a missing Gamepad API and an empty pad list as no input', () => {
    const { input } = fixture();
    vi.stubGlobal('navigator', {});

    expect(() => input.poll()).not.toThrow();
    expect(input.padMove).toEqual({ x: 0, y: 0 });
    expect(input.padTurn).toBe(0);
    expect(input.fireHeld).toBe(false);
    expect(input.pausePressed).toBe(false);

    vi.stubGlobal('navigator', { getGamepads: () => [] });
    expect(() => input.poll()).not.toThrow();
    expect(input.padRun).toBe(false);
    expect(input.mapPressed).toBe(false);
  });
});

function docMouseEvent(button: number, target: Element | null = null): Event {
  const event = new Event('mousedown');
  Object.defineProperties(event, {
    button: { value: button },
    target: { value: target },
  });
  return event;
}

function wantedFixture(wanted = true) {
  const fakeWindow = new EventTarget();
  const fakeDocument = new EventTarget() as EventTarget & { pointerLockElement: HTMLElement | null };
  let locked: HTMLElement | null = null;
  Object.defineProperty(fakeDocument, 'pointerLockElement', { get: () => locked });
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);

  const fakeCanvas = new EventTarget() as EventTarget & { requestPointerLock: () => void };
  const lockCalls = vi.fn(() => {
    locked = fakeCanvas as unknown as HTMLElement;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
  });
  fakeCanvas.requestPointerLock = lockCalls;
  const input = new Input(fakeCanvas as unknown as HTMLElement, () => {}, () => wanted);
  return { input, fakeWindow, fakeDocument, fakeCanvas, lockCalls, setLock: (v: boolean) => {
    locked = v ? (fakeCanvas as unknown as HTMLElement) : null;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
  } };
}

describe('Input page-wide relock', () => {
  it('requests the lock on a document press while lockWanted and never fires', () => {
    const { input, fakeDocument, lockCalls } = wantedFixture();
    fakeDocument.dispatchEvent(docMouseEvent(0));
    expect(lockCalls).toHaveBeenCalledTimes(1);
    expect(input.pointerLocked).toBe(true);
    for (let i = 0; i < 3; i++) {
      input.poll();
      expect(input.firePressed).toBe(false);
      expect(input.fireHeld).toBe(false);
    }
  });

  it('ignores presses on interactive elements', () => {
    const { fakeDocument, lockCalls } = wantedFixture();
    const button = { closest: () => ({}) } as unknown as Element;
    fakeDocument.dispatchEvent(docMouseEvent(0, button));
    expect(lockCalls).not.toHaveBeenCalled();
  });

  it('ignores presses inside .screen overlays', () => {
    const { fakeDocument, lockCalls } = wantedFixture();
    const inside = { closest: (sel: string) => (sel.includes('.screen') ? {} : null) } as unknown as Element;
    fakeDocument.dispatchEvent(docMouseEvent(0, inside));
    expect(lockCalls).not.toHaveBeenCalled();
  });

  it('does nothing while lockWanted is false', () => {
    const { fakeDocument, lockCalls } = wantedFixture(false);
    fakeDocument.dispatchEvent(docMouseEvent(0));
    expect(lockCalls).not.toHaveBeenCalled();
  });

  it('schedules exactly one retry after pointerlockerror', () => {
    vi.useFakeTimers();
    try {
      const { fakeDocument, fakeCanvas, lockCalls } = wantedFixture();
      let fail = true;
      fakeCanvas.requestPointerLock = vi.fn(() => {
        if (fail) {
          fail = false;
          fakeDocument.dispatchEvent(new Event('pointerlockerror'));
        } else lockCalls();
      });
      fakeDocument.dispatchEvent(docMouseEvent(0));
      fakeDocument.dispatchEvent(new Event('pointerlockerror'));
      fakeDocument.dispatchEvent(new Event('pointerlockerror'));
      vi.advanceTimersByTime(1100);
      expect(lockCalls).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000);
      expect(lockCalls).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
