import { glow, rect, type Ctx } from './pixel';

/**
 * ARSENAL: shared 3-phase use animation curve (windup → impact → recover)
 * and screen-space hit reactions.
 */
export const IMPACT = 0.09;
export const RECOVER = 0.24;

export interface UsePhase {
  phase: 'idle' | 'wind' | 'impact' | 'recover';
  /** Signed offset: -1 = fully pulled back, +1 = fully thrust. */
  k: number;
  /** 0..1 progress inside the current phase. */
  u: number;
}

export function usePhase(t: number, windup: number): UsePhase {
  if (t < 0) return { phase: 'idle', k: 0, u: 0 };
  if (t < windup) {
    const u = t / windup;
    return { phase: 'wind', k: -Math.sin((u * Math.PI) / 2), u };
  }
  const ti = t - windup;
  if (ti < IMPACT) {
    const u = ti / IMPACT;
    return { phase: 'impact', k: u < 0.35 ? -1 + (u / 0.35) * 2 : 1, u };
  }
  const tr = ti - IMPACT;
  if (tr < RECOVER) {
    const u = tr / RECOVER;
    return { phase: 'recover', k: 1 - u * u * (3 - 2 * u), u };
  }
  return { phase: 'idle', k: 0, u: 0 };
}

/** Total length of a use animation. */
export function useDuration(windup: number): number {
  return windup + IMPACT + RECOVER;
}

/** Deterministic hash for flicker/sparkle patterns. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * On-target hit reaction drawn at the crosshair (where every tool aims):
 * a fast radial pixel burst + ring, coloured by result.
 */
export function impactBurst(g: Ctx, cx: number, cy: number, t: number, good: boolean, big = 1): void {
  const dur = 0.32;
  if (t < 0 || t > dur) return;
  const u = t / dur;
  const col = good ? '#6dff8a' : '#ff4a3a';
  const rgb = good ? '80,255,140' : '255,70,50';
  glow(g, cx, cy, 26 * big * (0.6 + u), rgb, 0.55 * (1 - u));
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(i) * 0.4;
    const r = (6 + 28 * u * (0.6 + hash(i + 9) * 0.6)) * big;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.8;
    const s = u < 0.5 ? 2 : 1;
    rect(g, x, y, s, s, i % 3 === 0 ? '#ffffff' : col);
  }
  if (u < 0.6) {
    const r = Math.round((4 + u * 30) * big);
    g.strokeStyle = col;
    g.lineWidth = 1;
    g.strokeRect(cx - r, cy - r * 0.8, r * 2, r * 1.6);
  }
}

/** Brief full-screen tint (muzzle-flash brightening / damage). */
export function screenFlash(g: Ctx, w: number, h: number, rgb: string, a: number): void {
  if (a <= 0) return;
  g.fillStyle = `rgba(${rgb},${Math.min(0.6, a)})`;
  g.fillRect(0, 0, w, h);
}
