export const MAX_PARTICLES = 384;

export interface ParticleView {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  color: Float32Array;
  size: Float32Array;
  minPx: Float32Array;
  count: number;
}

type Color = readonly [number, number, number];

export class ParticleSystem {
  readonly x = new Float32Array(MAX_PARTICLES);
  readonly y = new Float32Array(MAX_PARTICLES);
  readonly z = new Float32Array(MAX_PARTICLES);
  readonly vx = new Float32Array(MAX_PARTICLES);
  readonly vy = new Float32Array(MAX_PARTICLES);
  readonly vz = new Float32Array(MAX_PARTICLES);
  readonly gravity = new Float32Array(MAX_PARTICLES);
  readonly life = new Float32Array(MAX_PARTICLES);
  readonly maxLife = new Float32Array(MAX_PARTICLES);
  readonly color = new Float32Array(MAX_PARTICLES * 3);
  readonly size = new Float32Array(MAX_PARTICLES);
  readonly minPx = new Float32Array(MAX_PARTICLES);
  private readonly born = new Float64Array(MAX_PARTICLES);
  private readonly currentView: ParticleView;
  private count = 0;
  private sequence = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.currentView = {
      x: this.x,
      y: this.y,
      z: this.z,
      color: this.color,
      size: this.size,
      minPx: this.minPx,
      count: 0,
    };
  }

  /**
   * Chunky "data-blood" spray: large, high-contrast shards in the threat's
   * colour (`tint`) mixed with white-hot cores. Most shards are flung upward
   * under heavy gravity so they visibly arc and land on the floor (z clamps
   * at 0) — readable past 6 tiles where a fine confetti puff dissolved.
   */
  burst(x: number, y: number, z: number, kind: 'kill' | 'hit', tint: Color = [1, 0.28, 0.08]): void {
    const rng = this.rng;
    const shard = (): Color => [
      Math.min(1, tint[0] * (0.75 + rng() * 0.5)),
      Math.min(1, tint[1] * (0.75 + rng() * 0.5)),
      Math.min(1, tint[2] * (0.75 + rng() * 0.5)),
    ];
    const count = kind === 'kill' ? 48 : 10;
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const speed = (kind === 'kill' ? 0.8 : 0.55) + rng() * 2.5;
      const big = i % 4 === 0;
      const hot = kind === 'kill' ? i % 5 === 0 : i % 3 === 0;
      this.add(
        x, y, z + rng() * 0.25,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        1.3 + rng() * (kind === 'kill' ? 3.4 : 2.2),
        6 + rng() * 3.5,
        big ? 0.5 + rng() * 0.4 : 0.28 + rng() * 0.2,
        hot ? [1, 0.97, 0.9] : shard(),
        big ? 0.1 + rng() * 0.09 : 0.05 + rng() * 0.05,
        big ? 3 : 2,
      );
    }
    if (kind === 'kill') this.add(x, y, z, 0, 0, 0, 0, 0.12, [1, 1, 1], 0.6, 6);
  }

  charge(x: number, y: number, z: number, k: number): void {
    const t = Math.max(0, Math.min(1, k));
    this.add(x, y, z, 0, 0, 0, 0, (1 / 60) * 0.9,
      [1, 0.85 + 0.15 * t, 0.2 + 0.5 * t],
      0.12 + 0.16 * t,
      4 + 3 * t);
  }

  pop(x: number, y: number, z: number): void {
    this.add(x, y, z, 0, 0, 0, 0, 0.1, [1, 1, 0.72], 0.28, 7);
  }

  /**
   * Brief bright core at an impact point — reads as a light burst
   * (~120 ms). White-hot center inside a tool-coloured halo.
   */
  flash(x: number, y: number, z: number, color: Color = [1, 0.88, 0.55]): void {
    this.add(x, y, z + 0.04, 0, 0, 0.35, 0, 0.09, [1, 1, 0.95], 0.95, 12);
    this.add(x, y, z, 0, 0, 0.18, 0, 0.13, color, 0.6, 9);
  }

  /**
   * Per-tool impact signature at a hit point (<=32 particles per call).
   * `tx`,`ty` (optional) aim packets back toward the player for 'tap';
   * `good` tints the badge/mfa reader sparkle.
   */
  toolImpact(tool: string, x: number, y: number, z: number, tx?: number, ty?: number, good = true): void {
    const rng = this.rng;
    switch (tool) {
      case 'keyboard': {
        // amber/white keycap shards flung outward, heavy gravity
        // spray away from the player (tangentially at most) so shards
        // never fly at the camera and smear across the view
        const away = tx === undefined ? 0 : Math.atan2(y - ty!, x - tx);
        const haveTarget = tx !== undefined && (x - tx !== 0 || y - ty! !== 0);
        for (let i = 0; i < 14; i++) {
          const a = haveTarget ? away + (rng() - 0.5) * 2.4 : rng() * Math.PI * 2;
          const sp = 0.4 + rng() * 0.7;
          this.add(x, y, z + rng() * 0.2,
            Math.cos(a) * sp, Math.sin(a) * sp, 1.2 + rng() * 1.4, 4.5,
            0.35 + rng() * 0.2,
            i % 4 === 0 ? [1, 1, 1] : [1, 0.68 + rng() * 0.2, 0.1],
            0.05 + rng() * 0.05, 3);
        }
        break;
      }
      case 'usb': {
        // cyan expanding scan ring (radial, no gravity) + short rising column
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          this.add(x, y, z + 0.05,
            Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.1, 0,
            0.3, [0.3, 0.9, 1], 0.035, 3);
        }
        for (let i = 0; i < 6; i++) {
          this.add(x + (rng() - 0.5) * 0.3, y + (rng() - 0.5) * 0.3, rng() * 0.2,
            0, 0, 1.6 + rng(), 0, 0.35 + rng() * 0.2,
            [0.6 + rng() * 0.3, 0.95, 1], 0.04, 4);
        }
        break;
      }
      case 'edr': {
        // blue-white lightning column stacked floor to head height
        for (let i = 0; i < 8; i++) {
          const zz = (i / 7) * 1.2;
          this.add(x + (rng() - 0.5) * 0.22, y + (rng() - 0.5) * 0.22, zz,
            (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4, 0.3 + rng() * 0.6, 0,
            0.28 + rng() * 0.15,
            i % 3 === 0 ? [1, 1, 1] : [0.45 + rng() * 0.25, 0.75, 1],
            0.05, 4);
        }
        break;
      }
      case 'tap': {
        // violet packets streaming back toward the player
        const dx = tx === undefined ? 0 : tx - x;
        const dy = ty === undefined ? 0 : ty - y;
        const d = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < 10; i++) {
          const k = 1.6 + rng() * 1.4;
          this.add(x + (rng() - 0.5) * 0.4, y + (rng() - 0.5) * 0.4, z + (rng() - 0.5) * 0.4,
            (dx / d) * k + (rng() - 0.5) * 0.4, (dy / d) * k + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.5, 0,
            0.45 + rng() * 0.2, [0.7 + rng() * 0.2, 0.4, 1], 0.04, 3);
        }
        break;
      }
      case 'mouse': {
        // yellow descending scan-line column
        for (let i = 0; i < 8; i++) {
          this.add(x + (rng() - 0.5) * 0.3, y + (rng() - 0.5) * 0.3, z + 0.4 + rng() * 0.5,
            0, 0, -(1.4 + rng()), 0, 0.4 + rng() * 0.2,
            [1, 0.9, 0.3], 0.045, 4);
        }
        break;
      }
      case 'patch': {
        // green rising cross (+) cluster
        for (let i = 0; i < 10; i++) {
          const arm = i % 4;
          const r = i === 0 ? 0 : 0.06 + rng() * 0.1;
          this.add(
            x + (arm === 0 ? r : arm === 1 ? -r : 0),
            y + (arm === 2 ? r : arm === 3 ? -r : 0),
            z + rng() * 0.15,
            0, 0, 0.8 + rng() * 0.8, 0, 0.5 + rng() * 0.2,
            [0.35, 1, 0.45], 0.045, 4);
        }
        break;
      }
      case 'mfa':
      case 'badge': {
        // small reader sparkle; green on accept, red on refuse
        const col: Color = good ? [0.4, 1, 0.5] : [1, 0.35, 0.25];
        for (let i = 0; i < 6; i++) {
          const a = rng() * Math.PI * 2;
          this.add(x, y, z + rng() * 0.2,
            Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.5 + rng() * 0.8, 1.5,
            0.25 + rng() * 0.15, col, 0.04, 4);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Doom teleport-fog analogue: a pale column rising where a threat spawns. */
  spawn(x: number, y: number): void {
    for (let i = 0; i < 40; i++) {
      const angle = this.rng() * Math.PI * 2;
      const r = 0.1 + this.rng() * 0.35;
      this.add(
        x + Math.cos(angle) * r,
        y + Math.sin(angle) * r,
        this.rng() * 0.15,
        Math.cos(angle) * 0.35,
        Math.sin(angle) * 0.35,
        1.4 + this.rng() * 1.6,
        0.4,
        0.5 + this.rng() * 0.35,
        [0.55 + this.rng() * 0.25, 0.92 + this.rng() * 0.08, 0.85 + this.rng() * 0.15],
        0.04 + this.rng() * 0.05,
        3,
      );
    }
    this.add(x, y, 0.5, 0, 0, 0.2, 0, 0.5, [0.9, 1, 0.95], 0.4, 8);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    let i = 0;
    while (i < this.count) {
      const previousLife = this.life[i];
      const nextLife = previousLife - dt;
      if (nextLife <= 0) {
        this.count--;
        if (i < this.count) this.copyParticle(i, this.count);
        continue;
      }
      const fade = nextLife / previousLife;
      const colorIndex = i * 3;
      this.color[colorIndex] *= fade;
      this.color[colorIndex + 1] *= fade;
      this.color[colorIndex + 2] *= fade;
      this.life[i] = nextLife;
      this.vz[i] -= this.gravity[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] = Math.max(0, this.z[i] + this.vz[i] * dt);
      i++;
    }
    this.currentView.count = this.count;
  }

  view(): ParticleView {
    this.currentView.count = this.count;
    return this.currentView;
  }

  clear(): void {
    this.count = 0;
    this.currentView.count = 0;
  }

  private add(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    gravity: number,
    life: number,
    color: Color,
    size: number,
    minPx: number,
  ): void {
    let i: number;
    if (this.count < MAX_PARTICLES) {
      i = this.count++;
    } else {
      i = 0;
      for (let j = 1; j < this.count; j++) {
        if (this.born[j] < this.born[i]) i = j;
      }
    }
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.gravity[i] = gravity;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.born[i] = this.sequence++;
    this.color[i * 3] = color[0];
    this.color[i * 3 + 1] = color[1];
    this.color[i * 3 + 2] = color[2];
    this.size[i] = size;
    this.minPx[i] = minPx;
    this.currentView.count = this.count;
  }

  private copyParticle(to: number, from: number): void {
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.z[to] = this.z[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.vz[to] = this.vz[from];
    this.gravity[to] = this.gravity[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.minPx[to] = this.minPx[from];
    this.born[to] = this.born[from];
    this.color[to * 3] = this.color[from * 3];
    this.color[to * 3 + 1] = this.color[from * 3 + 1];
    this.color[to * 3 + 2] = this.color[from * 3 + 2];
  }
}
