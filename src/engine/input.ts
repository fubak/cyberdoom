import type { Action } from './bindings';
import { DEFAULT_BINDINGS } from './bindings';

function clampAxis(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function radialDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const rescaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  const scale = rescaled / magnitude;
  return { x: x * scale, y: y * scale };
}

function axialDeadzone(value: number, deadzone: number): number {
  const axis = clampAxis(value);
  const magnitude = Math.abs(axis);
  if (magnitude <= deadzone) return 0;
  return Math.sign(axis) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

function buttonDown(gamepad: Gamepad, index: number): boolean {
  const button = gamepad.buttons[index];
  return !!button && (button.pressed || button.value > 0.5);
}

/**
 * Keyboard/mouse input with pointer lock and configurable key bindings.
 * Digit/Numpad 1-9, Escape, Tab, mouse, and wheel remain fixed controls.
 */
export class Input {
  keys = new Set<string>();
  bindings: Record<Action, string[]> = Object.fromEntries(
    Object.entries(DEFAULT_BINDINGS).map(([action, codes]) => [action, [...codes]]),
  ) as Record<Action, string[]>;
  mouseDX = 0;
  /** Wheel delta accumulated since last frame (+ = next tool). */
  wheel = 0;
  /** Fire pressed this frame (edge-triggered, consumed by game). */
  firePressed = false;
  fireHeld = false;
  /** Use or interaction pressed this frame. */
  usePressed = false;
  /** Digit pressed this frame, 1-9 or null. */
  slotPressed: number | null = null;
  /** Next-tool cycle pressed this frame. */
  cyclePressed = false;
  cyclePrevPressed = false;
  mapPressed = false;
  logPressed = false;
  pausePressed = false;
  padMove = { x: 0, y: 0 };
  padTurn = 0;
  padRun = false;
  pointerLocked = false;
  private pendingSlot: number | null = null;
  private pendingCycle = false;
  private pendingCyclePrev = false;
  private pendingMap = false;
  private pendingLog = false;
  private pendingPause = false;
  private pendingFire = false;
  private pendingKeyFire = false;
  private pendingUse = false;
  private padFireHeld = false;
  private previousGamepad: { index: number; id: string } | null = null;
  private previousPadButtons: boolean[] = [];
  private mouseDown = false;
  private lockPressActive = false;
  private suppressMouseUntilUp = false;
  private unlockedAudio = false;
  private lockRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lockRetried = false;

  constructor(
    private canvas: HTMLElement,
    private unlockAudio: () => void = () => {},
    /** True while a click on the page should re-capture the pointer. */
    private lockWanted: () => boolean = () => false,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.unlockOnce();
      this.keys.add(e.code);
      if (this.matchesAction('use', e.code)) this.pendingUse = true;
      if (this.matchesAction('fire', e.code)) this.pendingKeyFire = true;
      if (/^Digit[1-9]$/.test(e.code)) this.pendingSlot = Number(e.code[5]);
      if (/^Numpad[1-9]$/.test(e.code)) this.pendingSlot = Number(e.code[6]);
      if (this.matchesAction('cycle', e.code)) this.pendingCycle = true;
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.lockPressActive = false;
      this.suppressMouseUntilUp = false;
      this.pendingFire = false;
      this.pendingKeyFire = false;
    });
    window.addEventListener('pointerdown', () => this.unlockOnce());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.pointerLocked) {
        if (!this.lockWanted()) return;
        this.lockPressActive = true;
        this.suppressMouseUntilUp = true;
        this.mouseDown = false;
        this.pendingFire = false;
        this.requestLock();
        return;
      }
      if (this.suppressMouseUntilUp) return;
      this.mouseDown = true;
      this.pendingFire = true;
    });
    // Relock from anywhere on the page (letterbox, black margins) — not just
    // the canvas — so a lost lock always restores with one click. Presses on
    // interactive/menu elements are left for those controls.
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.pointerLocked || this.lockPressActive || !this.lockWanted()) return;
      const target = e.target as Element | null;
      if (target?.closest?.('button, a, input, select, textarea, .screen')) return;
      this.lockPressActive = true;
      this.suppressMouseUntilUp = true;
      this.mouseDown = false;
      this.pendingFire = false;
      this.lockRetried = false;
      this.requestLock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.lockPressActive = false;
        this.suppressMouseUntilUp = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      if ((e.buttons & 1) !== 0 && !this.mouseDown) this.suppressMouseUntilUp = true;
      this.mouseDX += Math.max(-250, Math.min(250, e.movementX));
    });
    window.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('pointerlockchange', () => {
      const buttonActive = this.lockPressActive || this.mouseDown;
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.pendingFire = false;
      this.mouseDown = false;
      if (buttonActive) this.suppressMouseUntilUp = true;
      if (this.pointerLocked) {
        this.lockRetried = false;
        if (this.lockRetryTimer !== null) {
          clearTimeout(this.lockRetryTimer);
          this.lockRetryTimer = null;
        }
      }
    });
    // Chrome refuses a relock for ~1 s after an Esc exit: one delayed retry
    // (still covered by the click's transient activation), never a loop.
    document.addEventListener('pointerlockerror', () => this.scheduleLockRetry());
  }

  private unlockOnce(): void {
    if (this.unlockedAudio) return;
    this.unlockedAudio = true;
    this.unlockAudio();
  }

  /** Call once per simulation tick; edges are consumed by exactly one tick. */
  poll(): void {
    const gamepad = this.standardGamepad();
    if (gamepad) {
      const identity = { index: gamepad.index, id: gamepad.id };
      const previous = this.previousGamepad?.index === identity.index &&
        this.previousGamepad.id === identity.id
        ? this.previousPadButtons
        : [];
      const trigger = gamepad.buttons[7]?.value ?? 0;
      const fireHeld = Number.isFinite(trigger) && trigger > 0.5;
      const buttons = Array.from(
        { length: gamepad.buttons.length },
        (_, index) => index === 7 ? fireHeld : buttonDown(gamepad, index),
      );
      const pressed = (index: number) => buttons[index] && !previous[index];
      const move = radialDeadzone(clampAxis(gamepad.axes[0]), clampAxis(gamepad.axes[1]), 0.2);

      this.padMove = { x: move.x, y: move.y === 0 ? 0 : -move.y };
      this.padTurn = axialDeadzone(gamepad.axes[2], 0.15);
      this.padRun = buttons[10] || buttons[6];
      this.padFireHeld = fireHeld;
      this.pendingUse ||= pressed(0);
      this.pendingKeyFire ||= fireHeld && !previous[7];
      this.pendingCycle ||= pressed(5);
      this.pendingCyclePrev ||= pressed(4);
      this.pendingMap ||= pressed(8);
      this.pendingLog ||= pressed(2);
      this.pendingPause ||= pressed(9);
      this.previousGamepad = identity;
      this.previousPadButtons = buttons;
    } else {
      this.padMove = { x: 0, y: 0 };
      this.padTurn = 0;
      this.padRun = false;
      this.padFireHeld = false;
      this.previousGamepad = null;
      this.previousPadButtons = [];
    }
    this.firePressed = this.pendingFire || this.pendingKeyFire;
    this.fireHeld = (this.pointerLocked && this.mouseDown) || this.actionDown('fire') || this.padFireHeld;
    this.usePressed = this.pendingUse;
    this.slotPressed = this.pendingSlot;
    this.cyclePressed = this.pendingCycle;
    this.cyclePrevPressed = this.pendingCyclePrev;
    this.mapPressed = this.pendingMap;
    this.logPressed = this.pendingLog;
    this.pausePressed = this.pendingPause;
    this.pendingFire = false;
    this.pendingKeyFire = false;
    this.pendingUse = false;
    this.pendingSlot = null;
    this.pendingCycle = false;
    this.pendingCyclePrev = false;
    this.pendingMap = false;
    this.pendingLog = false;
    this.pendingPause = false;
  }

  /**
   * Push this tick's edge flags back into the pending set. Use when a tick
   * freezes (kill hit-stop) so a tap during the freeze is not swallowed.
   */
  unpoll(): void {
    this.pendingKeyFire ||= this.firePressed;
    this.pendingUse ||= this.usePressed;
    this.pendingSlot ??= this.slotPressed;
    this.pendingCycle ||= this.cyclePressed;
    this.pendingCyclePrev ||= this.cyclePrevPressed;
    this.pendingMap ||= this.mapPressed;
    this.pendingLog ||= this.logPressed;
    this.pendingPause ||= this.pausePressed;
  }

  /** Consume accumulated mouse dx (call after reading). */
  consumeMouseDX(): number {
    const d = this.mouseDX;
    this.mouseDX = 0;
    return d;
  }

  consumeWheel(): number {
    const d = this.wheel;
    this.wheel = 0;
    return d;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  setBindings(bindings: Record<Action, string[]>): void {
    this.bindings = Object.fromEntries(
      Object.entries(bindings).map(([action, codes]) => [action, [...codes]]),
    ) as Record<Action, string[]>;
  }

  actionDown(action: Action): boolean {
    return this.bindings[action].some((code) => this.keys.has(code));
  }

  matchesAction(action: Action, code: string): boolean {
    return this.bindings[action].includes(code);
  }

  standardGamepad(): Gamepad | null {
    try {
      if (typeof navigator === 'undefined') return null;
      const gamepads = navigator.getGamepads?.();
      return Array.from(gamepads ?? []).find((pad) => pad?.connected && pad.mapping === 'standard') ?? null;
    } catch {
      return null;
    }
  }

  requestLock(): void {
    try {
      void Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => this.scheduleLockRetry());
    } catch {
      // Pointer lock may be denied before a trusted user gesture.
    }
  }

  /** One deferred relock attempt per press while the game still wants the pointer. */
  private scheduleLockRetry(): void {
    if (this.lockRetried || this.lockRetryTimer !== null || this.pointerLocked || !this.lockWanted()) return;
    this.lockRetried = true;
    this.lockRetryTimer = setTimeout(() => {
      this.lockRetryTimer = null;
      if (!this.pointerLocked && this.lockWanted()) this.requestLock();
    }, 1100);
  }
}
