/**
 * VIEWMODEL MOTION (spec §5): all hand/tool motion curves, deterministic and
 * frame-rate independent. Second-order springs integrate at a fixed 240 Hz
 * substep (accumulate dt, consume 1/240 steps, interpolate the remainder) so
 * 30/60/144 Hz produce the same path within a pixel. Everything else is a
 * closed-form function of time.
 */

export const inQuad = (u: number): number => u * u;
export const outCubic = (u: number): number => 1 - (1 - u) ** 3;
/** ≈11 % overshoot at u=1? no — it overshoots past 1 mid-curve (~8-11%). */
export const outBack = (u: number): number => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;

// —— fixed-substep spring ——————————————————————————————————————————————————

export interface Spring {
  x: number;
  v: number;
  /** accumulated unconsumed sim time (the sub-1/240 remainder). */
  acc: number;
}

export const spring = (): Spring => ({ x: 0, v: 0, acc: 0 });

const SPRING_H = 1 / 240;

/** Advance a spring toward `target` by dt seconds (ω rad/s, ζ damping). */
export function springStep(s: Spring, target: number, dt: number, omega: number, zeta: number): number {
  s.acc += Math.max(0, Math.min(0.5, dt));
  while (s.acc >= SPRING_H) {
    const a = -2 * zeta * omega * s.v - omega * omega * (s.x - target);
    s.v += a * SPRING_H;
    s.x += s.v * SPRING_H;
    s.acc -= SPRING_H;
  }
  return s.x + s.v * s.acc; // interpolate the leftover fraction of a step
}

/**
 * Closed-form step response of spring(ω,ζ): starts at 1 (v=0) and settles to
 * 0. Time in seconds. Used for recover stages — identical to the substep
 * integrator's path without needing an accumulator.
 */
export function settle(t: number, omega: number, zeta: number): number {
  if (t <= 0) return 1;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
  }
  return Math.exp(-omega * t) * (1 + omega * t);
}

// —— use-cycle shape (§5.1, §5.2) ——————————————————————————————————————————

export interface CycleMs {
  /** anticipate, strike, hold, recover — milliseconds. */
  a: number;
  s: number;
  h: number;
  r: number;
}

/** Per-tool A/S/H/R timings from the spec table. */
export const CYCLE_MS: Record<string, CycleMs> = {
  mouse: { a: 0, s: 40, h: 50, r: 110 },
  'kbd.type': { a: 20, s: 40, h: 30, r: 120 },
  'kbd.enter': { a: 30, s: 50, h: 40, r: 160 },
  usb: { a: 90, s: 70, h: 60, r: 280 },
  badge: { a: 110, s: 120, h: 180, r: 320 },
  mfa: { a: 70, s: 60, h: 60, r: 220 },
  patch: { a: 100, s: 90, h: 80, r: 300 },
  tap: { a: 60, s: 80, h: 90, r: 240 },
  edr: { a: 20, s: 40, h: 30, r: 120 },
};

export type CycleStage = 'idle' | 'anticip' | 'strike' | 'hold' | 'recover' | 'done';

export interface CyclePoint {
  stage: CycleStage;
  /**
   * Blend position along the stage: A = inQuad progress toward anticipation,
   * S = outBack progress (overshoots past 1), H = 1, R = spring settle 1→0.
   * For R this is the wrist channel; fingers trail it by 40 ms (callers use
   * `fingerU`).
   */
  u: number;
  /** Recover-stage finger channel (settle sampled 40 ms late); equals u elsewhere. */
  fingerU: number;
  /** ms into the current stage. */
  t: number;
}

/** Where is a use-cycle at t milliseconds after the trigger? Pure function. */
export function cyclePoint(ms: CycleMs, tMs: number, fingerLagMs = 40): CyclePoint {
  if (tMs < 0) return { stage: 'idle', u: 0, fingerU: 0, t: 0 };
  if (tMs < ms.a) return { stage: 'anticip', u: ms.a > 0 ? inQuad(tMs / ms.a) : 1, fingerU: ms.a > 0 ? inQuad(tMs / ms.a) : 1, t: tMs };
  const t = tMs - ms.a;
  if (t < ms.s) return { stage: 'strike', u: outBack(t / ms.s), fingerU: outBack(t / ms.s), t };
  const th = t - ms.s;
  if (th < ms.h) return { stage: 'hold', u: 1, fingerU: 1, t: th };
  const tr = th - ms.h;
  if (tr < ms.r + 300) {
    // recover: spring(22, 0.85) on every channel, fingers 40 ms behind the wrist
    return {
      stage: 'recover',
      u: settle(tr / 1000, 22, 0.85),
      fingerU: settle((tr - fingerLagMs) / 1000, 22, 0.85),
      t: tr,
    };
  }
  return { stage: 'done', u: 0, fingerU: 0, t: tr };
}

// —— idle (§5.4) ———————————————————————————————————————————————————————————

/** Breathing offsets (px): y = 1.6·sin(2π·0.22t), x = 0.6·sin(2π·0.14t + 1.1). */
export function breath(t: number): [number, number] {
  return [0.6 * Math.sin(2 * Math.PI * 0.14 * t + 1.1), 1.6 * Math.sin(2 * Math.PI * 0.22 * t)];
}

/**
 * Idle finger drift (degrees): ring & pinky mcp/pip ±3 at 0.18 Hz, index ±1.5
 * at 0.11 Hz. Returned as additive curl deltas baked into the pose.
 */
export function fingerDrift(t: number): { index: number; ring: number; pinky: number } {
  return {
    index: 1.5 * Math.sin(2 * Math.PI * 0.11 * t + 0.7),
    ring: 3 * Math.sin(2 * Math.PI * 0.18 * t),
    pinky: 3 * Math.sin(2 * Math.PI * 0.18 * t),
  };
}

export interface Fidget {
  /** 0 thumb tap, 1 index lift, 2 wrist roll, 3 re-grip. */
  kind: 0 | 1 | 2 | 3;
  /** 0..1 progress through the fidget. */
  u: number;
  /** ms since the fidget started. */
  t: number;
}

const FIDGET_DUR = [440, 220, 500, 300];

/**
 * Deterministic fidget schedule, seeded from the mission RNG: a fidget every
 * U(6, 11) s, kind drawn from the same stream. Pure function of (t, seed) so
 * replays and tests reproduce it. Returns null between fidgets.
 */
export function fidgetAt(t: number, seed: number): Fidget | null {
  if (t < 0) return null;
  // cumulative gaps: g_k = 6 + 5·h(seed, k); kind from the same hash stream
  let cursor = 0;
  for (let k = 0; cursor <= t + 1; k++) {
    const gap = 6 + 5 * hashF(seed, k);
    const start = cursor + gap;
    if (t >= start) {
      const kind = Math.floor(hashF(seed + 31, k) * 4) as Fidget['kind'];
      const ft = t - start;
      const dur = FIDGET_DUR[kind] / 1000;
      if (ft < dur) return { kind, u: ft / dur, t: ft };
      cursor = start;
    } else return null;
  }
  return null;
}

/** Deterministic hash → [0,1). */
function hashF(seed: number, k: number): number {
  let h = (seed * 374761393 + k * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// —— bob / sway (§5.5, §5.6) ————————————————————————————————————————————————

/** Figure-8 walk bob at the Doom 1.83 s period: x 22·amt·cosφ, y 26·amt·|sinφ|. */
export function bobOffsets(t: number, amt: number): [number, number] {
  const phi = (2 * Math.PI * t) / 1.83;
  return [22 * amt * Math.cos(phi), 26 * amt * Math.abs(Math.sin(phi))];
}

/** Wrist-pitch bob ripple: +3·amt·sinφ degrees, applied to the pose. */
export function bobPitch(t: number, amt: number): number {
  return 3 * amt * Math.sin((2 * Math.PI * t) / 1.83);
}

export const SWAY = {
  capX: 28,
  capY: 16,
  /** spring ω/ζ: x overshoots once (~8%), y is tighter. */
  xw: 16,
  xz: 0.7,
  yw: 13,
  yz: 0.85,
  /** hand roll coupling: 0.25°·x → 7° at full sway. */
  rollK: 0.25,
  /** scale coupling: 1 + 0.0008·y. */
  scaleK: 0.0008,
} as const;

const clampN = (v: number, n: number) => Math.max(-n, Math.min(n, v));

/**
 * Sway targets. mouseDXps is mouse delta in px/s (per-frame dx / dt) so the
 * result is identical at any frame rate; latV/fwdV/pitchV are px/s velocities.
 */
export function swayTarget(mouseDXps: number, latV: number, fwdV: number, pitchV: number): [number, number] {
  return [
    clampN(-mouseDXps * 0.6 - latV * 4.0, SWAY.capX),
    clampN(-fwdV * 1.8 - pitchV * 0.5, SWAY.capY),
  ];
}
