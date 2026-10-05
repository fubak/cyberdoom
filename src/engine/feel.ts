export interface ViewPose {
  x: number;
  y: number;
  angle: number;
  dz: number;
  roll: number;
}

export class Feel {
  private trauma = 0;

  hurt(dmg: number): void {
    this.trauma = Math.min(1, this.trauma + dmg / 40);
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - 2.2 * dt);
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
