/**
 * Gamepad menu navigation: translates standard-mapping pad input into the
 * keyboard events every menu already handles (arrows, Enter, Escape), so
 * title, character/mission select, briefing, pause, controls and debrief
 * work without per-screen pad code.
 */

export interface PadKey {
  key: string;
  code: string;
}

const UP: PadKey = { key: 'ArrowUp', code: 'ArrowUp' };
const DOWN: PadKey = { key: 'ArrowDown', code: 'ArrowDown' };
const LEFT: PadKey = { key: 'ArrowLeft', code: 'ArrowLeft' };
const RIGHT: PadKey = { key: 'ArrowRight', code: 'ArrowRight' };
const CONFIRM: PadKey = { key: 'Enter', code: 'Enter' };
const BACK: PadKey = { key: 'Escape', code: 'Escape' };

/** Standard mapping: A=0, B=1, Start=9, D-pad 12-15. Start is skipped in
 * the pause menu, where the play-input path already uses it to resume. */
const BUTTON_KEYS: [number, PadKey][] = [
  [0, CONFIRM],
  [9, CONFIRM],
  [1, BACK],
  [12, UP],
  [13, DOWN],
  [14, LEFT],
  [15, RIGHT],
];

const STICK_THRESHOLD = 0.6;
const REPEAT_DELAY = 0.42;
const REPEAT_RATE = 0.12;

interface PadLike {
  buttons: readonly { pressed: boolean; value?: number }[];
  axes: readonly number[];
}

export class PadMenuNav {
  private held = new Map<string, number>();

  /** Advance by dt seconds; returns the keys to emit this step. */
  step(pad: PadLike | null, dt: number, opts: { startConfirms?: boolean } = {}): PadKey[] {
    const active = new Map<string, PadKey>();
    if (pad) {
      for (const [index, key] of BUTTON_KEYS) {
        if (index === 9 && opts.startConfirms === false) continue;
        const b = pad.buttons[index];
        if (b && (b.pressed || (b.value ?? 0) > 0.5)) active.set(`b${index}`, key);
      }
      const x = Number.isFinite(pad.axes[0]) ? pad.axes[0] : 0;
      const y = Number.isFinite(pad.axes[1]) ? pad.axes[1] : 0;
      if (y < -STICK_THRESHOLD) active.set('sy', UP);
      else if (y > STICK_THRESHOLD) active.set('sy', DOWN);
      if (x < -STICK_THRESHOLD) active.set('sx', LEFT);
      else if (x > STICK_THRESHOLD) active.set('sx', RIGHT);
    }
    const out: PadKey[] = [];
    for (const id of [...this.held.keys()]) {
      if (!active.has(id)) this.held.delete(id);
    }
    for (const [id, key] of active) {
      const repeats = key !== CONFIRM && key !== BACK;
      const t = this.held.get(id);
      if (t === undefined) {
        this.held.set(id, REPEAT_DELAY);
        out.push(key);
      } else if (repeats) {
        let left = t - dt;
        while (left <= 0) {
          out.push(key);
          left += REPEAT_RATE;
        }
        this.held.set(id, left);
      }
    }
    return out;
  }

  reset(): void {
    this.held.clear();
  }

  /** Mark currently held inputs as consumed so leaving play doesn't fire them. */
  prime(pad: PadLike | null): void {
    this.step(pad, 0);
  }
}

export function dispatchPadKey(key: PadKey, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: key.key, code: key.code, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key: key.key, code: key.code, bubbles: true, cancelable: true }));
}
