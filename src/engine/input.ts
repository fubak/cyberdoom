/**
 * Keyboard/mouse input with pointer lock.
 * WASD move, arrows turn, Shift run, E/Space use-interact,
 * 1-9 tool select, wheel cycles tools, LMB uses the tool.
 */
export class Input {
  keys = new Set<string>();
  mouseDX = 0;
  /** Wheel delta accumulated since last frame (+ = next tool). */
  wheel = 0;
  /** LMB pressed this frame (edge-triggered, consumed by game). */
  firePressed = false;
  fireHeld = false;
  /** E or Space pressed this frame. */
  usePressed = false;
  /** Digit pressed this frame, 1-9 or null. */
  slotPressed: number | null = null;
  pointerLocked = false;
  private pendingSlot: number | null = null;
  private pendingFire = false;
  private pendingKeyFire = false;
  private pendingUse = false;
  private mouseDown = false;
  private lockPressActive = false;
  private suppressMouseUntilUp = false;
  private unlockedAudio = false;

  constructor(private canvas: HTMLElement, private unlockAudio: () => void = () => {}) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.unlockOnce();
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyE') this.pendingUse = true;
      if (e.code === 'KeyF') this.pendingKeyFire = true;
      if (/^Digit[1-9]$/.test(e.code)) this.pendingSlot = Number(e.code[5]);
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
    });
  }

  private unlockOnce(): void {
    if (this.unlockedAudio) return;
    this.unlockedAudio = true;
    this.unlockAudio();
  }

  /** Call once per simulation tick; edges are consumed by exactly one tick. */
  poll(): void {
    this.firePressed = this.pendingFire || this.pendingKeyFire;
    this.fireHeld = (this.pointerLocked && this.mouseDown) || this.keys.has('KeyF');
    this.usePressed = this.pendingUse;
    this.slotPressed = this.pendingSlot;
    this.pendingFire = false;
    this.pendingKeyFire = false;
    this.pendingUse = false;
    this.pendingSlot = null;
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

  requestLock(): void {
    try {
      void Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
    } catch {
      // Pointer lock may be denied before a trusted user gesture.
    }
  }
}
