import { blendPlace, type HandDelta, type RigFrame } from './handrig';
import { cyclePoint, fingerDrift, fidgetAt, settle } from './vmotion';
import { POSES, TOOL_HANDS, type CycleDef } from './handposes';

/**
 * USE-CYCLE + IDLE pose engine (spec §5). Given a tool and a time, produce a
 * blended RigFrame (rest + deltas) plus the hand-level move offset and the
 * held object's lagged offset. Baking stays lazy: frame names quantize the
 * cycle into ≤10 keyed steps so PartCache dedups them.
 */

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Merge two deltas channel-wise, a→b by u. */
export function mergeDelta(a: HandDelta | undefined, b: HandDelta | undefined, u: number): HandDelta {
  const out: HandDelta = {};
  if (a?.wrist || b?.wrist) {
    const aw = a?.wrist ?? [0, 0, 0], bw = b?.wrist ?? [0, 0, 0];
    out.wrist = [lerp(aw[0], bw[0], u), lerp(aw[1], bw[1], u), lerp(aw[2], bw[2], u)];
  }
  for (const k of ['yaw', 'pitch', 'roll'] as const) {
    if (a?.[k] !== undefined || b?.[k] !== undefined) out[k] = lerp(a?.[k] ?? 0, b?.[k] ?? 0, u);
  }
  if (a?.sizeMul !== undefined || b?.sizeMul !== undefined) out.sizeMul = lerp(a?.sizeMul ?? 1, b?.sizeMul ?? 1, u);
  const fa = a?.fingers ?? {}, fb = b?.fingers ?? {};
  const names = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  if (names.size) {
    out.fingers = {};
    for (const n of names) {
      const ca = (fa as Record<string, Partial<import('./handrig').Curl>>)[n] ?? {};
      const cb = (fb as Record<string, Partial<import('./handrig').Curl>>)[n] ?? {};
      const f: Partial<import('./handrig').Curl> = {};
      for (const k of ['abd', 'cmcFlex', 'mcp', 'pip', 'dip'] as const) {
        if (ca[k] !== undefined || cb[k] !== undefined) f[k] = lerp(ca[k] ?? cb[k]!, cb[k] ?? ca[k]!, u);
      }
      (out.fingers as Record<string, Partial<import('./handrig').Curl>>)[n] = f;
    }
  }
  return out;
}

/** Split a delta into wrist/orient channels vs finger channels. */
function wristOnly(d: HandDelta | undefined): HandDelta | undefined {
  if (!d) return undefined;
  const { wrist, yaw, pitch, roll, sizeMul } = d;
  const out: HandDelta = {};
  if (wrist) out.wrist = wrist;
  if (yaw !== undefined) out.yaw = yaw;
  if (pitch !== undefined) out.pitch = pitch;
  if (roll !== undefined) out.roll = roll;
  if (sizeMul !== undefined) out.sizeMul = sizeMul;
  return out;
}
function fingersOnly(d: HandDelta | undefined): HandDelta | undefined {
  return d?.fingers ? { fingers: d.fingers } : undefined;
}

/** Where a cycle is at t ms: stage, blended per-hand delta, hand move [dx,dy,scale]. */
export interface CycleEval {
  stage: 'idle' | 'anticip' | 'strike' | 'hold' | 'recover' | 'done';
  deltas: (HandDelta | undefined)[];
  move: [number, number, number];
}

export function evalCycle(def: CycleDef, tMs: number, lagMs = 0, zeta = 0.85): CycleEval {
  const cp = cyclePoint(def.ms, tMs - lagMs);
  const mvA = def.moveA ?? [0, 0, 1];
  const mvS = def.moveS ?? [0, 0, 1];
  switch (cp.stage) {
    case 'idle':
      return { stage: 'idle', deltas: [], move: [0, 0, 1] };
    case 'anticip': {
      const u = cp.u;
      return { stage: 'anticip', deltas: [], move: [mvA[0] * u, mvA[1] * u, 1 + (mvA[2] - 1) * u] };
    }
    case 'strike': {
      const u = cp.u; // outBack — overshoots past 1
      return {
        stage: 'strike',
        deltas: def.impact.map((d) => (d ? mergeDelta(undefined, d, u) : undefined)),
        move: [lerp(mvA[0], mvS[0], u), lerp(mvA[1], mvS[1], u), lerp(mvA[2], mvS[2], u)],
      };
    }
    case 'hold': {
      let deltas = def.impact;
      if (def.release && cp.t >= def.release.at) {
        const u = Math.min(1, (cp.t - def.release.at) / 60);
        deltas = def.impact.map((d, i) => mergeDelta(d, def.release!.deltas[i], u));
      }
      return { stage: 'hold', deltas, move: [...mvS] };
    }
    case 'recover': {
      // spring(22,ζ) back to rest; fingers trail the wrist by 40 ms (cp.fingerU)
      const uW = cp.u;
      const uF = lagMs === 0 && zeta === 0.85 ? cp.fingerU : settle(Math.max(0, (cp.t - 40) / 1000), 22, zeta);
      const u = lagMs === 0 && zeta === 0.85 ? uW : settle(cp.t / 1000, 22, zeta);
      return {
        stage: 'recover',
        deltas: def.impact.map((d) => {
          if (!d) return undefined;
          // wrist channels settle on the wrist clock, fingers on the lagged one
          const w = wristOnly(d);
          const f = fingersOnly(d);
          const scaledW = w ? mergeDelta(undefined, w, u) : undefined;
          const scaledF = f ? mergeDelta(undefined, f, uF) : undefined;
          return mergeDelta(scaledW, scaledF, 1);
        }),
        move: [mvS[0] * u, mvS[1] * u, 1 + (mvS[2] - 1) * u],
      };
    }
    default:
      return { stage: 'done', deltas: [], move: [0, 0, 1] };
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
  const rest = POSES[th.rest];
  const def = th.cycles[variant % th.cycles.length];
  if (tMs === null || tMs < 0) {
    return { key: th.rest, frame: rest, move: [0, 0, 1], objMove: [0, 0, 1], stage: 'idle' };
  }
  const ev = evalCycle(def, tMs);
  const evObj = evalCycle(def, tMs, RDELAY, 0.6);
  const qi = quantize(ev, def, tMs);
  const frame: RigFrame = {
    ...rest,
    hands: rest.hands.map((p, i) => (ev.deltas[i] ? blendPlace(p, ev.deltas[i]!, 1) : p)),
  };
  const key = `${th.rest}.v${variant}.s${ev.stage}.q${qi}`;
  return { key, frame, move: ev.move, objMove: evObj.move, stage: ev.stage };
}

/** Bake-step index per stage: A 0-1, S 2-4, H 5, R 6-9 (spec §5.3 cache steps). */
function quantize(ev: CycleEval, def: CycleDef, tMs: number): number {
  switch (ev.stage) {
    case 'anticip': {
      const u = def.ms.a > 0 ? tMs / def.ms.a : 1;
      return u < 0.5 ? 0 : 1;
    }
    case 'strike': {
      const u = (tMs - def.ms.a) / def.ms.s;
      return 2 + Math.min(2, Math.max(0, Math.floor(u * 3)));
    }
    case 'hold': return 5;
    case 'recover': {
      const tr = tMs - def.ms.a - def.ms.s - def.ms.h;
      const marks = [0, 40, 120, 260];
      let q = 6;
      for (let i = 0; i < marks.length; i++) if (tr >= marks[i]) q = 6 + i;
      return q;
    }
    default: return 0;
  }
}

/**
 * Idle modifiers (spec §5.4): finger drift + seeded fidgets as ADDITIVE pose
 * deltas (absolute targets = rest + offset, computed against each hand's own
 * curls). Returns the per-hand deltas and a bake-key suffix. t is seconds.
 */
export function idleFrame(frame: RigFrame, t: number, seed: number, variant = 0): { frame: RigFrame; key: string } {
  const dr = fingerDrift(t);
  const fg = fidgetAt(t, seed);
  const thumbTap = fg?.kind === 0 ? (fg.u < 0.41 ? fg.u / 0.41 : Math.max(0, 1 - (fg.t - 0.18) / 0.26)) : 0;
  const idxLift = fg?.kind === 1 ? Math.sin(Math.PI * fg.u) : 0;
  const rollW = fg?.kind === 2 ? 3 * Math.sin(Math.PI * fg.u) : 0;
  const regrip = fg?.kind === 3 ? Math.sin(Math.PI * fg.u) : 0;
  const hands = frame.hands.map((p) => {
    const d: HandDelta = { fingers: {}, roll: rollW };
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
      const base = p.fingers?.[f];
      if (!base) continue;
      const rel: Partial<import('./handrig').Curl> = {};
      if (f === 'index') { rel.mcp = dr.index - 8 * idxLift + 4 * regrip; rel.pip = dr.index - 4 * idxLift; }
      else if (f === 'ring') { rel.mcp = dr.ring + 4 * regrip; rel.pip = dr.ring; }
      else if (f === 'pinky') { rel.mcp = dr.pinky + 4 * regrip; rel.pip = dr.pinky; }
      else if (f === 'middle') { rel.mcp = 4 * regrip; }
      else if (f === 'thumb') { rel.mcp = 14 * thumbTap + 4 * regrip; rel.pip = 8 * thumbTap; }
      const c: Partial<import('./handrig').Curl> = {};
      for (const k of ['abd', 'cmcFlex', 'mcp', 'pip', 'dip'] as const) {
        if (rel[k] !== undefined) c[k] = (base[k] ?? (k === 'dip' ? (base.pip * 2) / 3 : 0)) + rel[k]!;
      }
      if (Object.keys(c).length) d.fingers![f] = c;
    }
    return { place: p, delta: d };
  });
  const key = `${variant}.i${Math.round((t % 5.56) * 8)}${fg ? `f${fg.kind}${Math.min(5, Math.floor(fg.u * 6))}` : ''}`;
  return {
    key,
    frame: { ...frame, hands: hands.map((h) => blendPlace(h.place, h.delta, 1)) },
  };
}
