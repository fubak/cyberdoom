import { WorldMap } from './map';

export const EYE_HEIGHT = 0.6; // Must match EYE_H in renderer.ts.

export const MOVE = {
  // Doom ground speeds in tiles/s: walk 4.17, run ~8.30.
  walkSpeed: 6.95 * EYE_HEIGHT,
  runSpeed: 13.83 * EYE_HEIGHT,
  // exponential approach rate: t90 = ln(10)/friction ≈ 0.65 s (Doom ~0.66 s)
  friction: 3.543,
  strafeScaleRun: 0.8,
  strafeScaleWalk: 0.96,
  stopSpeed: 0.027 * (EYE_HEIGHT / 0.5),
  keyTurnSlow: 1.07,
  keyTurnWalk: 2.15,
  keyTurnRun: 4.3,
  slowTurnTime: 0.17,
} as const;

/**
 * Doom-like player movement: acceleration, friction, momentum, wall sliding.
 * Pure logic — unit-testable without a browser.
 */
export class Player {
  x: number;
  y: number;
  angle: number;
  prevX: number;
  prevY: number;
  vx = 0;
  vy = 0;
  /** View bob phase. */
  bob = 0;
  t = 0;
  hurtT = 0;
  lastHurtFrom: number | undefined;
  private stepReady = false;
  private bobAmt = 0;
  private bobStopAmt = 0;
  private bobStopT = 99;
  private turnDir = 0;
  private turnHeld = 0;
  readonly radius = 0.28;
  integrity = 100;

  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.prevX = x;
    this.prevY = y;
  }

  /**
   * Advance one fixed step.
   * @param fwd -1..1 forward input, @param strafe -1..1 strafe input
   * @param run whether Shift is held
   */
  move(
    map: WorldMap,
    fwd: number,
    strafe: number,
    run: boolean,
    turnDir: number,
    dt: number,
    solids: { x: number; y: number; r: number }[] = [],
  ): void {
    this.prevX = this.x;
    this.prevY = this.y;
    if (turnDir === 0) {
      this.turnDir = 0;
      this.turnHeld = 0;
    } else {
      const dir = Math.sign(turnDir);
      if (dir !== this.turnDir) this.turnHeld = 0;
      this.turnDir = dir;
      const slowDt = Math.min(dt, Math.max(0, MOVE.slowTurnTime - this.turnHeld));
      const fastDt = dt - slowDt;
      const fastTurn = run ? MOVE.keyTurnRun : MOVE.keyTurnWalk;
      this.angle += dir * (slowDt * MOVE.keyTurnSlow + fastDt * fastTurn);
      this.turnHeld += dt;
    }

    const speed = run ? MOVE.runSpeed : MOVE.walkSpeed;
    const friction = MOVE.friction;
    const decay = Math.exp(-friction * dt);
    const accel = speed * (1 - decay) / (dt * decay);

    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    const strafeScale = run ? MOVE.strafeScaleRun : MOVE.strafeScaleWalk;
    const wishX = ca * fwd - sa * strafe * strafeScale;
    const wishY = sa * fwd + ca * strafe * strafeScale;

    this.vx = (this.vx + wishX * accel * dt) * decay;
    this.vy = (this.vy + wishY * accel * dt) * decay;
    if (fwd === 0 && strafe === 0 && Math.hypot(this.vx, this.vy) < MOVE.stopSpeed) {
      this.vx = 0;
      this.vy = 0;
    }

    let res = map.resolve(this.x + this.vx * dt, this.y + this.vy * dt, this.radius);
    if (res.nx !== 0 || res.ny !== 0) this.projectVelocity(res.nx, res.ny);
    let px = res.x;
    let py = res.y;
    let solidNx = 0;
    let solidNy = 0;
    for (const solid of solids) {
      const dx = px - solid.x;
      const dy = py - solid.y;
      const minDist = this.radius + solid.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d;
      const ny = dy / d;
      const push = minDist - d;
      px += nx * push;
      py += ny * push;
      solidNx += nx;
      solidNy += ny;
    }
    const normalLength = Math.hypot(solidNx, solidNy);
    if (normalLength > 0) this.projectVelocity(solidNx / normalLength, solidNy / normalLength);
    res = map.resolve(px, py, this.radius);
    if (res.nx !== 0 || res.ny !== 0) this.projectVelocity(res.nx, res.ny);
    this.x = res.x;
    this.y = res.y;

    const oldBob = this.bob;
    const sp = Math.hypot(this.vx, this.vy);
    this.bob += sp * dt * 1.6;
    this.stepReady = sp > 1 && Math.floor(oldBob / Math.PI) !== Math.floor(this.bob / Math.PI);
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    // spec §5.5: amt 0.55 walk / 1.0 sprint, chase k=6 while moving; on stop a
    // critically-damped-ish spring(10,0.9) eases the amplitude back to zero
    const moving = sp > 0.4;
    const targetBob = !moving ? 0 : sp > MOVE.walkSpeed ? 1.0 : 0.55;
    if (moving) {
      this.bobStopT = 99;
      this.bobStopAmt = this.bobAmt;
      this.bobAmt += (targetBob - this.bobAmt) * Math.min(1, 6 * dt);
    } else {
      if (this.bobStopT > 60) { this.bobStopT = 0; this.bobStopAmt = this.bobAmt; }
      this.bobStopT += dt;
      const w = 14, z = 0.9, wd = w * Math.sqrt(1 - z * z);
      const e = Math.exp(-z * w * this.bobStopT);
      this.bobAmt = Math.max(0, this.bobStopAmt * e * (Math.cos(wd * this.bobStopT) + (z * w / wd) * Math.sin(wd * this.bobStopT)));
    }
  }

  private projectVelocity(nx: number, ny: number): void {
    const into = this.vx * nx + this.vy * ny;
    if (into < 0) {
      this.vx -= nx * into;
      this.vy -= ny * into;
    }
  }

  snap(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  consumeStep(): boolean {
    const step = this.stepReady;
    this.stepReady = false;
    return step;
  }

  applyImpulse(ix: number, iy: number): void {
    this.vx += ix;
    this.vy += iy;
  }

  knockback(awayX: number, awayY: number, tiles: number): void {
    const length = Math.hypot(awayX, awayY);
    if (length === 0 || tiles <= 0) return;
    const nx = awayX / length;
    const ny = awayY / length;
    const impulse = MOVE.friction * tiles;
    const velocityAway = this.vx * nx + this.vy * ny;
    const add = Math.max(0, impulse - velocityAway);
    this.applyImpulse(nx * add, ny * add);
  }

  get viewBobZ(): number {
    return 0.045 * this.bobAmt * Math.sin((2 * Math.PI * this.t) / 0.571);
  }

  get weaponBobX(): number {
    return 22 * this.bobAmt * Math.cos((2 * Math.PI * this.t) / 1.83);
  }

  get weaponBobY(): number {
    return 26 * this.bobAmt * Math.abs(Math.sin((2 * Math.PI * this.t) / 1.83));
  }

  /** spec §5.5: hand bob pitch ≈ 3°·amt·sin(φ) for the baked roll variants. */
  get bobPitchDeg(): number {
    return 3 * this.bobAmt * Math.sin((2 * Math.PI * this.t) / 1.83);
  }

  get bobAmount(): number {
    return this.bobAmt;
  }

  damage(n: number, fromX?: number, fromY?: number): void {
    this.integrity = Math.max(0, this.integrity - n);
    this.hurtT = 0.5;
    if (fromX !== undefined && fromY !== undefined) {
      const towardSource = Math.atan2(fromY - this.y, fromX - this.x);
      this.lastHurtFrom = Math.atan2(
        Math.sin(towardSource - this.angle),
        Math.cos(towardSource - this.angle),
      );
    }
  }

  get alive(): boolean {
    return this.integrity > 0;
  }
}
