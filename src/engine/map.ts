import type { CellDef, MapDef } from '../core/types';

export const DEFAULT_CEIL_H = 1.25;
export const VAULT_CEIL_H = 1.68;
export const DOOR_CEIL_H = 1.12;
export const SKY_PARAPET_H = 2.05;
/** Maximum floor-height step-up the player can climb without stairs or a lift. */
export const MAX_STEP_UP = 0.28;

export interface LiftRuntime {
  y: number;
  low: number;
  high: number;
  speed: number;
  hold: number;
  state: 'idle-low' | 'rising' | 'hold-high' | 'lowering';
  holdT: number;
}

export interface WorldMapSnapshot {
  doors: Map<string, number>;
  openingDoors: Set<string>;
  lifts?: Map<string, LiftRuntime>;
}

/**
 * Runtime grid map: cell lookup, door open state, wall collision, raycast.
 * Pure logic — no Three.js here so it stays unit-testable.
 */
export class WorldMap {
  readonly w: number;
  readonly h: number;
  readonly def: MapDef;
  private cells: (CellDef | null)[][];
  /** doorId -> opening fraction */
  private doors = new Map<string, number>();
  private openingDoors = new Set<string>();
  /** liftId -> dynamic platform elevation state */
  private lifts = new Map<string, LiftRuntime>();

  constructor(def: MapDef) {
    this.def = def;
    this.h = def.grid.length;
    this.w = def.grid[0]?.length ?? 0;
    this.cells = def.grid.map((row) =>
      row.split('').map((ch) => def.legend[ch] ?? null),
    );
    for (const row of this.cells) {
      for (const c of row) {
        if (c?.kind === 'door' && c.doorId) this.doors.set(c.doorId, 0);
        if (c?.lift && !this.lifts.has(c.lift.id)) {
          this.lifts.set(c.lift.id, {
            y: c.lift.low,
            low: c.lift.low,
            high: c.lift.high,
            speed: c.lift.speed ?? 0.9,
            hold: c.lift.hold ?? 3.5,
            state: 'idle-low',
            holdT: 0,
          });
        }
      }
    }
  }

  snapshot(): WorldMapSnapshot {
    const lifts = new Map<string, LiftRuntime>();
    for (const [id, st] of this.lifts) lifts.set(id, { ...st });
    return { doors: new Map(this.doors), openingDoors: new Set(this.openingDoors), lifts };
  }

  restore(snapshot: WorldMapSnapshot): void {
    this.doors = new Map(snapshot.doors);
    this.openingDoors = new Set(snapshot.openingDoors);
    if (snapshot.lifts) {
      this.lifts = new Map();
      for (const [id, st] of snapshot.lifts) this.lifts.set(id, { ...st });
    }
  }

  cellAt(tx: number, ty: number): CellDef | null {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    return this.cells[ty][tx];
  }

  cellAtF(x: number, y: number): CellDef | null {
    return this.cellAt(Math.floor(x), Math.floor(y));
  }

  isDoorOpen(doorId: string): boolean {
    return this.doorFrac(doorId) >= 0.7;
  }

  openDoor(doorId: string): void {
    this.doors.set(doorId, 1);
    this.openingDoors.delete(doorId);
  }

  startOpening(doorId: string): void {
    if (!this.doors.has(doorId) || this.doorFrac(doorId) >= 1) return;
    this.openingDoors.add(doorId);
  }

  doorFrac(doorId: string): number {
    return this.doors.get(doorId) ?? 0;
  }

  updateDoors(dt: number): void {
    for (const id of this.openingDoors) {
      const next = this.doorFrac(id) + dt / 0.55;
      const frac = next >= 1 - 1e-9 ? 1 : next;
      this.doors.set(id, frac);
      if (frac >= 1) this.openingDoors.delete(id);
    }
  }

  /** A cell blocks movement if it's a wall or a closed door. */
  blocked(tx: number, ty: number): boolean {
    const c = this.cellAt(tx, ty);
    if (!c) return true;
    if (c.kind === 'wall') return true;
    if (c.kind === 'door') return !this.isDoorOpen(c.doorId ?? '');
    return false;
  }

  blockedF(x: number, y: number): boolean {
    return this.blocked(Math.floor(x), Math.floor(y));
  }

  /** Light level at a tile (0..1). */
  lightAt(tx: number, ty: number): number {
    const key = `${tx},${ty}`;
    return this.def.lights?.[key] ?? this.def.defaultLight ?? 0.9;
  }

  /** Floor elevation in world units (0 for flat floor, >0 for raised dais/steps/lifts). */
  floorHeightAt(tx: number, ty: number): number {
    const c = this.cellAt(tx, ty);
    if (!c) return 0;
    if (c.lift) return this.lifts.get(c.lift.id)?.y ?? c.lift.low;
    return Math.max(0, c.floorHeight ?? 0);
  }

  /** Activate a lift: idle-low/lowering -> rising, hold-high -> lowering. Returns true if state changed. */
  activateLift(liftId: string): boolean {
    const st = this.lifts.get(liftId);
    if (!st) return false;
    if (st.state === 'idle-low' || st.state === 'lowering') {
      st.state = 'rising';
      return true;
    }
    if (st.state === 'hold-high') {
      st.state = 'lowering';
      st.holdT = 0;
      return true;
    }
    return false;
  }

  /** Automatically start rising when the player steps onto a waiting lift platform. */
  stepOnLift(tx: number, ty: number): boolean {
    const c = this.cellAt(tx, ty);
    if (!c?.lift) return false;
    const st = this.lifts.get(c.lift.id);
    if (!st || st.state !== 'idle-low') return false;
    st.state = 'rising';
    return true;
  }

  liftState(liftId: string): LiftRuntime | undefined {
    return this.lifts.get(liftId);
  }

  updateLifts(dt: number): void {
    for (const st of this.lifts.values()) {
      if (st.state === 'rising') {
        st.y = Math.min(st.high, st.y + st.speed * dt);
        if (st.y >= st.high - 1e-6) {
          st.y = st.high;
          st.state = 'hold-high';
          st.holdT = st.hold;
        }
      } else if (st.state === 'hold-high') {
        st.holdT -= dt;
        if (st.holdT <= 0) {
          st.holdT = 0;
          st.state = 'lowering';
        }
      } else if (st.state === 'lowering') {
        st.y = Math.max(st.low, st.y - st.speed * dt);
        if (st.y <= st.low + 1e-6) {
          st.y = st.low;
          st.state = 'idle-low';
        }
      }
    }
  }

  floorHeightAtF(x: number, y: number): number {
    return this.floorHeightAt(Math.floor(x), Math.floor(y));
  }

  /** True if the cell opens to the episode skybox instead of a solid ceiling. */
  isSky(tx: number, ty: number): boolean {
    const c = this.cellAt(tx, ty);
    return !!c && c.kind !== 'wall' && !!c.sky;
  }

  /** True if the cell is a reinforced glass window wall (blocks movement, transparent). */
  isWindow(tx: number, ty: number): boolean {
    const c = this.cellAt(tx, ty);
    return !!c && c.kind === 'wall' && !!c.window;
  }

  /**
   * Ceiling height in world units. Explicit `ceilHeight` wins; otherwise doors
   * get a slight Doom-style header drop and wide open rooms (>=7 non-wall
   * neighbors in 3x3) get vaulted ceilings.
   */
  ceilHeightAt(tx: number, ty: number): number {
    const c = this.cellAt(tx, ty);
    if (!c) return DEFAULT_CEIL_H;
    const maxFloor = c.lift ? c.lift.high : Math.max(0, c.floorHeight ?? 0);
    const minHeadroom = maxFloor > 0.2 ? maxFloor + 1.18 : 0;
    if (c.ceilHeight !== undefined) return Math.max(c.ceilHeight, minHeadroom);
    if (c.sky) return Math.max(SKY_PARAPET_H, minHeadroom);
    if (c.kind === 'door') return Math.max(DOOR_CEIL_H, minHeadroom);
    if (c.kind === 'floor' || c.kind === 'exit') {
      let open = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const n = this.cellAt(tx + ox, ty + oy);
          if (n && n.kind !== 'wall') open++;
        }
      }
      if (open >= 7) return Math.max(VAULT_CEIL_H, minHeadroom);
    }
    return Math.max(DEFAULT_CEIL_H, minHeadroom);
  }

  /** True if a tile blocks line-of-sight (solid wall or closed door; windows are transparent). */
  opaque(tx: number, ty: number): boolean {
    const c = this.cellAt(tx, ty);
    if (!c) return true;
    if (c.kind === 'wall') return !c.window;
    if (c.kind === 'door') return !this.isDoorOpen(c.doorId ?? '');
    return false;
  }

  /**
   * DDA raycast from (x,y) along angle. Returns distance to first blocking cell
   * and the cell hit. maxDist in tiles.
   */
  raycast(
    x: number,
    y: number,
    angle: number,
    maxDist = 20,
  ): { dist: number; cell: CellDef | null; tx: number; ty: number } {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let tx = Math.floor(x);
    let ty = Math.floor(y);
    if (this.blocked(tx, ty)) return { dist: 0, cell: this.cellAt(tx, ty), tx, ty };
    const stepX = dx < 0 ? -1 : 1;
    const stepY = dy < 0 ? -1 : 1;
    const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    let maxX = dx === 0 ? Infinity : ((dx < 0 ? x - tx : tx + 1 - x) * deltaX);
    let maxY = dy === 0 ? Infinity : ((dy < 0 ? y - ty : ty + 1 - y) * deltaY);
    let dist = 0;
    while (dist <= maxDist) {
      if (maxX < maxY) {
        tx += stepX;
        dist = maxX;
        maxX += deltaX;
      } else {
        ty += stepY;
        dist = maxY;
        maxY += deltaY;
      }
      if (dist > maxDist) break;
      if (this.blocked(tx, ty)) {
        return { dist, cell: this.cellAt(tx, ty), tx, ty };
      }
    }
    return { dist: maxDist, cell: null, tx: -1, ty: -1 };
  }

  /**
   * Circle-vs-grid collision resolve: pushes (px,py) out of blocked cells and
   * enables wall sliding. Radius r in tiles. When `currentFloorY` is provided,
   * ledges higher than `currentFloorY + MAX_STEP_UP` also block entry so the
   * player must use stairs or a lift to climb balconies (while still able to drop down).
   */
  resolve(
    x: number,
    y: number,
    r: number,
    currentFloorY?: number,
  ): { x: number; y: number; nx: number; ny: number } {
    let px = x;
    let py = y;
    let normalX = 0;
    let normalY = 0;
    for (let iter = 0; iter < 3; iter++) {
      const minTx = Math.floor(px - r);
      const maxTx = Math.floor(px + r);
      const minTy = Math.floor(py - r);
      const maxTy = Math.floor(py + r);
      let pushed = false;
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const tooHigh =
            currentFloorY !== undefined &&
            this.floorHeightAt(tx, ty) > currentFloorY + MAX_STEP_UP + 1e-6;
          if (!this.blocked(tx, ty) && !tooHigh) continue;
          // closest point on cell AABB to circle center
          const cx = Math.max(tx, Math.min(px, tx + 1));
          const cy = Math.max(ty, Math.min(py, ty + 1));
          const ddx = px - cx;
          const ddy = py - cy;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const push = r - d;
          px += (ddx / d) * push;
          py += (ddy / d) * push;
          normalX += ddx / d;
          normalY += ddy / d;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    const normalLength = Math.hypot(normalX, normalY);
    return normalLength > 0
      ? { x: px, y: py, nx: normalX / normalLength, ny: normalY / normalLength }
      : { x: px, y: py, nx: 0, ny: 0 };
  }
}
