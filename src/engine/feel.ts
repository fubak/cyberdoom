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

type SwitchPhase = 'idle' | 'lower' | 'raise';

export class WeaponSwitch<T> {
  current: T;
  private pending: T | null = null;
  private phase: SwitchPhase = 'idle';
  private phaseTime = 0;

  constructor(current: T) {
    this.current = current;
  }

  request(next: T): void {
    if (next === this.current || next === this.pending) return;
    this.pending = next;
    if (this.phase === 'idle') {
      this.phase = 'lower';
      this.phaseTime = 0;
    }
  }

  update(dt: number): T | null {
    let remaining = dt;
    let switched: T | null = null;
    while (remaining > 0 && this.phase !== 'idle') {
      const duration = this.phase === 'lower' ? 0.16 : 0.2;
      const step = Math.min(remaining, duration - this.phaseTime);
      this.phaseTime += step;
      remaining -= step;
      if (this.phaseTime + 1e-10 < duration) break;
      this.phaseTime = 0;
      if (this.phase === 'lower') {
        this.phase = 'raise';
        if (this.pending !== null) {
          this.current = this.pending;
          this.pending = null;
          switched = this.current;
        }
      } else if (this.pending !== null) {
        this.phase = 'lower';
      } else {
        this.phase = 'idle';
      }
    }
    return switched;
  }

  get ready(): boolean {
    return this.phase === 'idle';
  }

  get offsetY(): number {
    if (this.phase === 'idle') return 0;
    const duration = this.phase === 'lower' ? 0.16 : 0.2;
    const t = Math.max(0, Math.min(1, this.phaseTime / duration));
    const eased = t * t * (3 - 2 * t);
    return this.phase === 'lower' ? eased * 70 : (1 - eased) * 70;
  }
}
