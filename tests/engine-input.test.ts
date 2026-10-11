import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/engine/input';

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
