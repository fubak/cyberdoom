export interface ViewPose {
  x: number;
  y: number;
  angle: number;
  dz: number;
  roll: number;
  hurt?: number;
  bonus?: number;
}

export class Feel {
  private trauma = 0;
  private redAmount = 0;
  private redDecayRate = 0;
  private bonusAmount = 0;

  hurt(dmg: number): void {
    this.trauma = Math.min(1, this.trauma + dmg / 40);
    this.redAmount = Math.min(0.6, this.redAmount + Math.max(0.15, dmg / 25));
    this.redDecayRate = this.redAmount / 0.4;
  }

  bonus(): void {
    this.bonusAmount = 0.35;
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - 2.2 * dt);
    const redDecay = this.redDecayRate * dt;
    const redRemaining = this.redAmount - redDecay;
    this.redAmount = redRemaining <= 1e-12 ? 0 : redRemaining;
    this.bonusAmount = Math.max(0, this.bonusAmount - (0.35 / 0.25) * dt);
  }

  get red(): number {
    return this.redAmount;
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
