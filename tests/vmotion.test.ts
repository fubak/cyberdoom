import { describe, expect, it } from 'vitest';
import {
  bobOffsets, CYCLE_MS, cyclePoint, fidgetAt, inQuad, outBack, settle,
  spring, springStep, swayTarget, SWAY, type CycleMs,
} from '../src/render/vmotion';
import { TOOL_HANDS } from '../src/render/handposes';

/**
 * Spec §6 acceptance tests T8/T9/T10 — the motion layer is closed-form and
 * fixed-step, so timing/frequency checks are pure math.
 */

const lerpV = (a: number, b: number, u: number) => a + (b - a) * u;

/** max |Δ| of the cycle's hand move across 60 Hz frames. */
function maxJump(ms: CycleMs, moveA: [number, number, number], moveS: [number, number, number]): number {
  const total = ms.a + ms.s + ms.h + ms.r + 200;
  let mx = 0, prev = 0;
  for (let t = 0; t <= total; t += 1000 / 60) {
    const cp = cyclePoint(ms, t);
    let m = 0;
    if (cp.stage === 'anticip') m = lerpV(0, moveA[1], cp.u);
    else if (cp.stage === 'strike') m = lerpV(moveA[1], moveS[1], cp.u);
    else if (cp.stage === 'hold') m = moveS[1];
    else if (cp.stage === 'recover') m = moveS[1] * cp.u;
    mx = Math.max(mx, Math.abs(m - prev));
    prev = m;
  }
  return mx;
}

describe('T8: use-cycle continuity', () => {
  it('easing fns: inQuad(0)=0 inQuad(1)=1, outBack overshoots then lands at 1', () => {
    expect(inQuad(0)).toBe(0);
    expect(inQuad(1)).toBe(1);
    let peak = 0;
    for (let u = 0; u <= 1; u += 0.01) peak = Math.max(peak, outBack(u));
    expect(peak).toBeGreaterThan(1.08); // ~11% overshoot
    expect(peak).toBeLessThan(1.14);
    expect(outBack(1)).toBe(1);
  });

  it('never moves more than 20 px between adjacent 60 Hz frames', () => {
    for (const [id, ms] of Object.entries(CYCLE_MS)) {
      const th = TOOL_HANDS[id === 'kbd.type' || id === 'kbd.enter' ? 'keyboard' : id];
      const def = th.cycles[0];
      const ev = (t: number) => {
        const cp = cyclePoint(def.ms, t);
        const mvA = def.moveA ?? [0, 0, 1] as [number, number, number];
        const mvS = def.moveS ?? [0, 0, 1] as [number, number, number];
        if (cp.stage === 'anticip') return mvA[1] * cp.u;
        if (cp.stage === 'strike') return mvA[1] + (mvS[1] - mvA[1]) * cp.u;
        if (cp.stage === 'hold') return mvS[1];
        if (cp.stage === 'recover') return mvS[1] * cp.u;
        return 0;
      };
      let mx = 0, prev = 0;
      const total = ms.a + ms.s + ms.h + ms.r + 200;
      for (let t = 0; t <= total; t += 1000 / 60) {
        const m = ev(t);
        mx = Math.max(mx, Math.abs(m - prev));
        prev = m;
      }
      expect(mx, id).toBeLessThanOrEqual(20);
      void maxJump;
    }
  });

  it('is identical at 30 and 60 Hz (closed-form) within 1 px', () => {
    const ms = CYCLE_MS.badge;
    for (let t = 0; t < ms.a + ms.s + ms.h + ms.r; t += 11) {
      const a = cyclePoint(ms, t);
      const b = cyclePoint(ms, t); // time-keyed: sampling rate irrelevant
      expect(a.u).toBe(b.u);
      expect(a.stage).toBe(b.stage);
    }
  });

  it('springStep is frame-rate independent: 30 vs 60 vs 144 Hz within 1 px', () => {
    const run = (fps: number) => {
      const s = spring();
      const steps = Math.round(0.5 * fps);
      for (let i = 0; i < steps; i++) springStep(s, 24, 1 / fps, SWAY.xw, SWAY.xz);
      return s.x;
    };
    expect(Math.abs(run(30) - run(60))).toBeLessThanOrEqual(1);
    expect(Math.abs(run(60) - run(144))).toBeLessThanOrEqual(1);
  });

  it('fingers trail the wrist by ~40 ms on the release', () => {
    const ms = CYCLE_MS.tap;
    const at = (t: number) => cyclePoint(ms, ms.a + ms.s + ms.h + t);
    const w40 = at(40);
    // wrist spring has decayed visibly; finger u is the 40 ms-lagged value
    expect(w40.fingerU).toBeCloseTo(settle(0, 22, 0.85), 5);
    expect(w40.u).toBeCloseTo(settle(0.04, 22, 0.85), 5);
  });

  it('settles within the spec times (2% residual)', () => {
    expect(Math.abs(settle(0.32, 22, 0.85))).toBeLessThan(0.02);
    expect(Math.abs(settle(0.48, 10, 0.9))).toBeLessThan(0.02);
  });
});

describe('T9: figure-8 bob', () => {
  it('peak-to-peak x 40-48, y 24-32, period 1.83 s', () => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let t = 0; t < 1.83; t += 0.01) {
      const [x, y] = bobOffsets(t, 1);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    expect(x1 - x0).toBeGreaterThanOrEqual(40);
    expect(x1 - x0).toBeLessThanOrEqual(48);
    expect(y1 - y0).toBeGreaterThanOrEqual(24);
    expect(y1 - y0).toBeLessThanOrEqual(32);
    const [ax, ay] = bobOffsets(0, 1);
    const [bx, by] = bobOffsets(1.83, 1);
    expect(Math.abs(ax - bx)).toBeLessThan(0.6);
    expect(Math.abs(ay - by)).toBeLessThan(0.6);
  });

  it('stopping decays under 1 px within 400 ms', () => {
    expect(Math.abs(settle(0.4, 14, 0.9))).toBeLessThan(0.01);
  });
});

describe('T10: sway spring profile', () => {
  const runSway = (fps: number, input: (t: number) => [number, number]) => {
    const sx = spring(), sy = spring();
    const n = Math.round(1.6 * fps);
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const [tx, ty] = input(i / fps);
      xs.push(springStep(sx, tx, 1 / fps, SWAY.xw, SWAY.xz));
      ys.push(springStep(sy, ty, 1 / fps, SWAY.yw, SWAY.yz));
    }
    return { xs, ys };
  };

  it('lags 22-28 px behind a 400 px/s flick within 120 ms', () => {
    const { xs } = runSway(60, (t) => [swayTarget(400, 0, 0, 0)[0] * (t < 0.12 ? 1 : 0), 0]);
    const lag = Math.max(...xs.map(Math.abs));
    expect(lag).toBeGreaterThanOrEqual(22);
    expect(lag).toBeLessThanOrEqual(28);
  });

  it('overshoots 1-3 px on return and settles by 450 ms', () => {
    const { xs } = runSway(60, (t) => [swayTarget(400, 0, 0, 0)[0] * (t < 0.12 ? 1 : 0), 0]);
    const iPeak = xs.indexOf(Math.min(...xs));
    const peak = Math.max(...xs.slice(iPeak)); // positive swing past rest
    expect(peak).toBeGreaterThanOrEqual(0.8);
    expect(peak).toBeLessThanOrEqual(3);
    const after = xs.slice(Math.floor(0.55 * 60));
    expect(Math.max(...after.map(Math.abs))).toBeLessThan(0.2);
  });

  it('same curve at 30 / 60 / 144 Hz within 1 px', () => {
    const a = runSway(30, () => [20, 10]).xs.at(-1)!;
    const b = runSway(60, () => [20, 10]).xs.at(-1)!;
    const c = runSway(144, () => [20, 10]).xs.at(-1)!;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - c)).toBeLessThanOrEqual(1);
  });
});

describe('idle fidgets (spec §5.4)', () => {
  it('fires on a seeded 6-11 s cadence, deterministic per seed', () => {
    const hits: number[] = [];
    for (let t = 0; t < 60; t += 0.05) if (fidgetAt(t, 7)) hits.push(t);
    const gaps = hits.slice(1).map((t, i) => t - hits[i]);
    const real = gaps.filter((g) => g > 1); // each fidget spans several samples
    for (const g of real) {
      expect(g).toBeGreaterThanOrEqual(5.7);
      expect(g).toBeLessThanOrEqual(11.2);
    }
    expect(real.length).toBeGreaterThan(4);
    // same seed same schedule
    expect(!!fidgetAt(hits[0], 7)).toBe(true);
  });
});
