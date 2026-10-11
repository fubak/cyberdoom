export interface ViewPose {
  x: number;
  y: number;
  angle: number;
  dz: number;
  roll: number;
  pitch?: number;
  hurt?: number;
  hurtSide?: number;
  bonus?: number;
}

/**
 * WCAG 2.3.1 photosafety guard for FULL-SCREEN flashes (world light blooms,
 * the pain wash, muzzle light floods): no more than `maxPerSecond` flash
 * events inside any one-second window, even under sustained fire. Small,
 * localized effects (enemy sprite hit-flash, impact particles) are exempt.
 * Sliding-window counter: a flash is allowed only when fewer than
 * `maxPerSecond` flashes happened in the last second.
 */
export class FlashRateLimiter {
  private readonly times: number[] = [];

  constructor(private readonly maxPerSecond = 3) {}

  /** Try to spend one flash at time `now` (seconds, monotonic). */
  allow(now: number): boolean {
    while (this.times.length > 0 && this.times[0] < now - 1) this.times.shift();
    if (this.times.length >= this.maxPerSecond) return false;
    this.times.push(now);
    return true;
  }

  reset(): void {
    this.times.length = 0;
  }
}

export class Feel {
  private trauma = 0;
  private hurtPeak = 0;
  private hurtHold = 0;
  private hurtDuration = 0;
  private hurtElapsed = 0;
  private hurtSideAmount = 0;
  private bonusAmount = 0;
  /** Recoil jolt on tool fire: instant hit, ~110 ms settle (Doom muzzle kick). */
  private kickAmt = 0;
  /** Kill punch: instant camera dip that eases back over ~150 ms. */
  private punchAmt = 0;
  /** Player-hurt view kick: pitch punch + roll jab, scaled by damage. */
  private hurtPitchAmt = 0;
  private hurtRollAmt = 0;
  private hurtRollSide = 0;

  hurt(dmg: number, side = 0, wash = true): void {
    this.trauma = Math.min(1, this.trauma + dmg / 40);
    // View kick: a short pitch punch + roll jab toward the attacker, scaled by
    // damage — the hit physically shoves the camera at the damage instant.
    this.hurtPitchAmt = Math.max(this.hurtPitchAmt, Math.min(0.1, 0.035 + dmg * 0.0022));
    this.hurtRollAmt = Math.max(this.hurtRollAmt, Math.min(0.075, 0.02 + dmg * 0.002));
    if (side !== 0) this.hurtRollSide = Math.sign(side);
    else if (this.hurtRollSide === 0) this.hurtRollSide = Math.random() < 0.5 ? -1 : 1;
    if (!wash) return; // photosafety limiter spent: keep kick/shake, skip the red wash
    // Doom pain wash: any hit floods the view red, holds ~0.1s, then eases out
    // over ~0.3-0.4s; bigger hits flood deeper and linger a little longer.
    const peak = Math.min(0.9, 0.62 + dmg * 0.011);
    const duration = 0.1 + Math.min(0.4, 0.3 + dmg * 0.004);
    const remaining = Math.max(0, this.hurtDuration - this.hurtElapsed);
    this.hurtPeak = Math.max(this.red, peak);
    this.hurtDuration = Math.max(remaining, duration);
    this.hurtHold = 0.1;
    this.hurtElapsed = 0;
    this.hurtSideAmount = Math.max(-1, Math.min(1, side));
  }

  bonus(): void {
    this.bonusAmount = 0.35;
  }

  /** Fire moment: sharp downward viewmodel recoil jolt. */
  kick(strength = 1): void {
    this.kickAmt = Math.max(this.kickAmt, strength);
  }

  get viewKick(): number {
    return this.kickAmt;
  }

  /** Kill punctuation: camera punch + a shake bump so the kill lands hard. */
  punch(strength = 1): void {
    this.punchAmt = Math.max(this.punchAmt, strength);
    this.trauma = Math.min(1, this.trauma + 0.22 * strength);
  }

  /** Downward camera offset (world units) for the kill punch. */
  get punchDip(): number {
    return this.punchAmt * 0.055;
  }

  /** Upward view punch (radians) from a taken hit — snaps in, ~150 ms out. */
  get hurtPitch(): number {
    return this.hurtPitchAmt;
  }

  /** Roll jab (radians) toward the attacker from a taken hit. */
  get hurtRoll(): number {
    return this.hurtRollAmt * this.hurtRollSide;
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - 2.2 * dt);
    this.hurtElapsed = Math.min(this.hurtDuration, this.hurtElapsed + dt);
    this.bonusAmount = Math.max(0, this.bonusAmount - (0.35 / 0.25) * dt);
    this.kickAmt = Math.max(0, this.kickAmt - 9 * dt);
    this.punchAmt = Math.max(0, this.punchAmt - 7 * dt);
    this.hurtPitchAmt = Math.max(0, this.hurtPitchAmt - 8 * dt);
    this.hurtRollAmt = Math.max(0, this.hurtRollAmt - 9 * dt);
  }

  get red(): number {
    if (this.hurtDuration <= 0) return 0;
    if (this.hurtElapsed < this.hurtHold) return this.hurtPeak;
    const decay = this.hurtDuration - this.hurtHold;
    const t = this.hurtElapsed - this.hurtHold;
    if (decay <= 0 || t >= decay) return 0;
    const k = t / decay;
    return this.hurtPeak * (1 - k) ** 2;
  }

  get hurtSide(): number {
    return this.hurtPeak > 0 ? this.hurtSideAmount * (this.red / this.hurtPeak) : 0;
  }

  get bonusAmt(): number {
    return this.bonusAmount;
  }

  shake(t: number): { yaw: number; x: number; y: number } {
    const amount = this.trauma ** 2;
    const noise = (phase: number) =>
      (Math.sin(2 * Math.PI * 23 * t + phase) * 0.5 +
        Math.sin(2 * Math.PI * 31 * t + phase * 1.7) * 0.3 +
        Math.sin(2 * Math.PI * 37 * t + phase * 2.3) * 0.2);
    return {
      yaw: amount * 0.03 * noise(0.2),
      x: amount * 0.035 * noise(1.8),
      y: amount * 0.035 * noise(3.1),
    };
  }
}
