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
  const input = new Input(fakeCanvas as unknown as HTMLElement);
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
