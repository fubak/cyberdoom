import type { RigFrame } from './handrig';
import { cyclePoint, fingerDrift, fidgetAt, settle, type CycleMs } from './vmotion';
import { POSES, TOOL_HANDS } from './handposes';

/**
 * USE-CYCLE + IDLE pose engine on top of main's pose table. A use cycle is a
 * timed walk through anticipation → strike → hold → recover that picks one of
 * the tool's named poses (rest or a `use` pose) and adds continuous draw-space
 * offsets — anticipation pullback, strike travel, release/return springs — so
 * the motion animates while the baked art stays exactly main's sprites.
 * Frame keys reduce to the pose name itself, so the PartCache holds the same
 * sprite set main does.
 */

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export interface CycleDef {
  ms: CycleMs;
  /** anticipation pullback offset [dx, dy, scale] (1x px). */
  moveA?: [number, number, number];
  /** strike/hold travel offset [dx, dy, scale]. */
  moveS?: [number, number, number];
  /** late-hold partial release of the held object's offset. */
  release?: { at: number; move: [number, number, number] };
}

/** Per-tool cycle timing + offsets (spec §5 table; art untouched). */
export const CYCLES: Record<string, CycleDef[]> = {
  keyboard: [
    { ms: { a: 30, s: 50, h: 55, r: 110 }, moveA: [0, -3, 1], moveS: [0, 3, 1] },
    { ms: { a: 30, s: 50, h: 55, r: 110 }, moveA: [0, -3, 1], moveS: [0, 3, 1] },
    { ms: { a: 80, s: 90, h: 180, r: 260 }, moveA: [0, -7, 0.97], moveS: [2, 9, 1.04], release: { at: 110, move: [1, 5, 1.02] } },
  ],
  mouse: [{ ms: { a: 40, s: 60, h: 80, r: 140 }, moveA: [0, -3, 1], moveS: [1, 3, 1] }],
  usb: [{ ms: { a: 110, s: 120, h: 120, r: 300 }, moveA: [-3, 4, 0.95], moveS: [4, -11, 1.06], release: { at: 70, move: [2, -8, 1.04] } }],
  badge: [{ ms: { a: 110, s: 140, h: 230, r: 300 }, moveA: [2, -3, 0.96], moveS: [7, 7, 1.07], release: { at: 140, move: [5, 4, 1.05] } }],
  mfa: [{ ms: { a: 60, s: 70, h: 70, r: 160 }, moveA: [-2, -3, 1], moveS: [3, 3, 1] }],
  patch: [{ ms: { a: 110, s: 140, h: 210, r: 300 }, moveA: [-3, 4, 0.95], moveS: [5, -9, 1.05], release: { at: 130, move: [3, -6, 1.03] } }],
  tap: [{ ms: { a: 80, s: 100, h: 100, r: 240 }, moveA: [0, 2, 0.96], moveS: [0, -4, 1.05], release: { at: 60, move: [0, -2, 1.03] } }],
  edr: [{ ms: { a: 60, s: 80, h: 110, r: 220 }, moveA: [-2, 1, 0.97], moveS: [3, -3, 1.05] }],
};

/** Where a cycle is at t ms: stage, use-pose weight, hand move [dx,dy,scale]. */
export interface CycleEval {
  stage: 'idle' | 'anticip' | 'strike' | 'hold' | 'recover' | 'done';
  /** 0 = rest pose, 1 = use pose; snaps on once the strike lands. */
  useU: number;
  move: [number, number, number];
}

export function evalCycle(def: CycleDef, tMs: number, lagMs = 0, zeta = 0.85): CycleEval {
  const cp = cyclePoint(def.ms, tMs - lagMs);
  const mvA = def.moveA ?? [0, 0, 1];
  const mvS = def.moveS ?? [0, 0, 1];
  switch (cp.stage) {
    case 'idle':
      return { stage: 'idle', useU: 0, move: [0, 0, 1] };
    case 'anticip':
      return { stage: 'anticip', useU: 0, move: [mvA[0] * cp.u, mvA[1] * cp.u, 1 + (mvA[2] - 1) * cp.u] };
    case 'strike':
      // the strike pose lands partway through the travel, not at t=0
      return {
        stage: 'strike',
        useU: cp.u > 0.35 ? 1 : 0,
        move: [lerp(mvA[0], mvS[0], cp.u), lerp(mvA[1], mvS[1], cp.u), lerp(mvA[2], mvS[2], cp.u)],
      };
    case 'hold': {
      let move = mvS;
      if (def.release && cp.t >= def.release.at) {
        const u = Math.min(1, (cp.t - def.release.at) / 60);
        move = [lerp(mvS[0], def.release.move[0], u), lerp(mvS[1], def.release.move[1], u), lerp(mvS[2], def.release.move[2], u)];
      }
      return { stage: 'hold', useU: 1, move };
    }
    case 'recover': {
      // spring back; the use pose releases early while the offset eases out
      const u = settle(cp.t / 1000, 22, zeta);
      return {
        stage: 'recover',
        useU: cp.u > 0.55 ? 0 : 1,
        move: [mvS[0] * u, mvS[1] * u, 1 + (mvS[2] - 1) * u],
      };
    }
    default:
      return { stage: 'done', useU: 0, move: [0, 0, 1] };
  }
}

/** Pose frame + draw offsets for a tool at `tMs` after fire (or idle). */
export interface HandFrame {
  key: string;
  frame: RigFrame;
  /** draw offset for the hand sprite: dx, dy, scale. */
  move: [number, number, number];
  /** offset the held object gets instead (20 ms lag, looser spring). */
  objMove: [number, number, number];
  stage: string;
}

const RDELAY = 20;

export function handCycleFrame(toolId: string, tMs: number | null, variant: number): HandFrame | null {
  const th = TOOL_HANDS[toolId];
  if (!th) return null;
  const defs = CYCLES[toolId] ?? [{ ms: { a: 60, s: 80, h: 100, r: 220 } }];
  const def = defs[variant % defs.length];
  if (tMs === null || tMs < 0) {
    return { key: th.rest, frame: POSES[th.rest], move: [0, 0, 1], objMove: [0, 0, 1], stage: 'idle' };
  }
  const ev = evalCycle(def, tMs);
  const evObj = evalCycle(def, tMs, RDELAY, 0.6);
  // frame == one of main's named poses, so the pose name is the bake key:
  // the PartCache holds exactly main's sprite set
  const poseName = ev.useU >= 0.5 ? th.use[variant % th.use.length] : th.rest;
  return { key: poseName, frame: POSES[poseName], move: ev.move, objMove: evObj.move, stage: ev.stage };
}

/** Number of use-cycle variants a tool exposes (for variant rotation). */
export function cycleVariants(toolId: string): number {
  return CYCLES[toolId]?.length ?? 1;
}

/**
 * Idle modifiers (spec §5.4): finger drift + seeded fidgets as continuous
 * composite offsets — NOT pose deltas. Re-baking a sprite per idle phase
 * is worse than a 1-2px whole-hand micro-shift, which is all the drift reads
 * as at bake res anyway. Returns [dx, dy, rollDeg] in 1x px. t is seconds.
 */
export function idleFrame(t: number, seed: number): { move: [number, number, number] } {
  const dr = fingerDrift(t);
  const fg = fidgetAt(t, seed);
  const thumbTap = fg?.kind === 0 ? Math.sin(Math.PI * Math.min(1, fg.u)) : 0;
  const idxLift = fg?.kind === 1 ? Math.sin(Math.PI * fg.u) : 0;
  const rollW = fg?.kind === 2 ? 3 * Math.sin(Math.PI * fg.u) : 0;
  const regrip = fg?.kind === 3 ? Math.sin(Math.PI * fg.u) : 0;
  const dx = 0.5 * Math.sin(2 * Math.PI * 0.13 * t + seed * 2.3) + 0.8 * regrip + 0.3 * dr.index;
  const dy = 0.6 * Math.sin(2 * Math.PI * 0.18 * t + seed * 1.1) + 1.2 * thumbTap - 1.0 * idxLift + 0.3 * dr.ring;
  return { move: [dx, dy, rollW + 0.4 * dr.pinky] };
}
