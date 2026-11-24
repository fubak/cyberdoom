import { FlashRateLimiter } from '../engine/feel';

/**
 * Reticle feedback (P2 hit feedback). The crosshair is a DOM element over the
 * 3D canvas, so it always draws above sprites — even a point-blank "loom".
 *
 * States, each with its own SHAPE as well as colour (no red/green-only cue):
 *  - idle:    green ring
 *  - target:  amber ring tightened with a centre pip — the current tool will
 *             act on what is under it
 *  - blocked: grey dashed ring with a slash — out of range, wrong target,
 *             or out of ammo
 *  - hit:     white X marker for ~200 ms after a tool connects
 * plus a brief white fill ("ret-flash") on a hit, budgeted by the shared
 * 3-flashes-per-second limiter (WCAG 2.3.1) and skippable for reduced flashing.
 */
export type ReticleState = 'idle' | 'target' | 'blocked' | 'hit';
export const RETICLE_STATES: readonly ReticleState[] = ['idle', 'target', 'blocked', 'hit'];

/** How long the hit X marker holds after a connect (seconds). */
export const HIT_MARK_S = 0.2;
/** How long the bright hit fill holds (seconds). */
export const HIT_FLASH_S = 0.08;
/** Hit reports closer together than this are the same strike. */
const SAME_HIT_S = 0.03;

/** The current tool's LMB hint (tool.hint()), before any display filtering. */
export interface ReticleHint {
  ready: boolean;
  fleeting?: boolean;
}

export function reticleState(hint: ReticleHint | null, hitMarked: boolean): ReticleState {
  if (hitMarked) return 'hit';
  if (!hint) return 'idle';
  return hint.ready ? 'target' : 'blocked';
}

export function reticleClass(state: ReticleState, flashing: boolean): string {
  return flashing ? `ret-${state} ret-flash` : `ret-${state}`;
}

/** Tracks the hit marker + budgeted flash for the reticle. */
export class HitConfirm {
  private limiter = new FlashRateLimiter(3);
  private markUntil = -Infinity;
  private flashUntil = -Infinity;
  private lastHit = -Infinity;

  /** A tool connected at `now`. Returns whether the bright flash fired.
   *  One strike can report through several events in the same instant
   *  (tool-hit + entity-hurt); those collapse into one flash. */
  hit(now: number, allowFlash = true): boolean {
    const same = now - this.lastHit < SAME_HIT_S;
    this.lastHit = now;
    this.markUntil = now + HIT_MARK_S;
    if (same) return this.flashing(now);
    if (allowFlash && this.limiter.allow(now)) {
      this.flashUntil = now + HIT_FLASH_S;
      return true;
    }
    return false;
  }

  marked(now: number): boolean {
    return now < this.markUntil;
  }

  flashing(now: number): boolean {
    return now < this.flashUntil;
  }

  reset(): void {
    this.markUntil = -Infinity;
    this.flashUntil = -Infinity;
    this.lastHit = -Infinity;
    this.limiter.reset();
  }
}
