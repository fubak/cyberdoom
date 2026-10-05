export interface ViewPose {
  x: number;
  y: number;
  angle: number;
  dz: number;
  roll: number;
  hurt?: number;
  hurtSide?: number;
  bonus?: number;
}

export class Feel {
  private trauma = 0;
  private hurtPeak = 0;
  private hurtDuration = 0;
  private hurtElapsed = 0;
  private hurtSideAmount = 0;
  private bonusAmount = 0;

  hurt(dmg: number, side = 0): void {
    this.trauma = Math.min(1, this.trauma + dmg / 40);
    const intensity = Math.min(0.85, Math.max(0.35, 0.35 + dmg / 40));
    const duration = Math.min(0.6, Math.max(0.25, 0.25 + dmg * 0.017));
    const remaining = Math.max(0, this.hurtDuration - this.hurtElapsed);
    this.hurtPeak = Math.max(this.red, intensity);
    this.hurtDuration = Math.max(remaining, duration);
    this.hurtElapsed = 0;
    this.hurtSideAmount = Math.max(-1, Math.min(1, side));
  }

  bonus(): void {
    this.bonusAmount = 0.35;
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - 2.2 * dt);
    this.hurtElapsed = Math.min(this.hurtDuration, this.hurtElapsed + dt);
    this.bonusAmount = Math.max(0, this.bonusAmount - (0.35 / 0.25) * dt);
  }

  get red(): number {
    if (this.hurtDuration <= 0 || this.hurtElapsed >= this.hurtDuration) return 0;
    const progress = this.hurtElapsed / this.hurtDuration;
    if (progress <= 0.25) return this.hurtPeak;
    const eased = (progress - 0.25) / 0.75;
    return this.hurtPeak * (1 - eased) ** 2;
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
