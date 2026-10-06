import { glow, rect, type Ctx } from './pixel';
import { drawText } from './pixelfont';

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

/** Top of every held tool and its fx (rest, bob, firing), as a fraction of 3D-view height. */
export const VM_CLEAR = 0.62;

/** First view row a held tool may draw on: everything above stays clear for targets. */
export function vmLine(h: number): number {
  return Math.ceil(h * VM_CLEAR);
}

/** Row where tool-tip confirm sparks sit, just below the clearance line. */
export function tipY(h: number): number {
  return vmLine(h) + Math.round(h * 0.08);
}

/** Deterministic hash for flicker/sparkle patterns. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Per-tool confirm look; default is the shared burst. */
export type ImpactStyle = 'burst' | 'keys' | 'scan' | 'select' | 'patch' | 'packets';

/**
 * Hit confirm at the tool tip (below the clearance line; the target itself
 * shows the hit): a small fast pixel burst + ring, coloured by result.
 * `style` gives each tool its own signature (all stay under the clearance line).
 */
export function impactBurst(g: Ctx, cx: number, cy: number, t: number, good: boolean, big = 1, style: ImpactStyle = 'burst'): void {
  const dur = 0.32;
  if (t < 0 || t > dur) return;
  const u = t / dur;
  switch (style) {
    case 'keys': {
      // amber square shards flung outward + a tiny KILL -9 flash
      const col = good ? '#ffb428' : '#ff4a3a';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + hash(i) * 0.5;
        const r = (2 + 16 * u * (0.5 + hash(i + 7) * 0.7)) * big;
        const s = u < 0.6 ? 3 : 2;
        rect(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 - u * 4, s, s, i % 4 === 0 ? '#ffffff' : col);
      }
      if (u < 0.45 && good) drawText(g, 'KILL -9', cx - 16, cy + 10, '#ffb428', 1);
      return;
    }
    case 'scan': {
      // concentric cyan rings collapsing/expanding
      const col = good ? '#4adfff' : '#ff4a3a';
      for (let k = 0; k < 3; k++) {
        const r = Math.max(1, (3 + ((u * 2 + k * 0.5) % 1.5) * 9) * big);
        g.strokeStyle = col;
        g.lineWidth = 1;
        g.strokeRect(cx - r, cy - r * 0.5, r * 2, r);
      }
      glow(g, cx, cy, 10 * big, '80,220,255', 0.4 * (1 - u));
      return;
    }
    case 'select': {
      // yellow corner brackets tightening on the hit point
      const col = good ? '#ffe040' : '#ff4a3a';
      const r = (12 - u * 7) * big;
      const l = Math.max(2, r * 0.4);
      g.fillStyle = col;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = cx + sx * r;
        const y = cy + sy * r * 0.55;
        g.fillRect(x - (sx < 0 ? 0 : l), y - (sy < 0 ? 0 : 1), l, 1);
        g.fillRect(x - (sx < 0 ? 0 : 1), y - (sy < 0 ? 0 : l), 1, l);
      }
      return;
    }
    case 'patch': {
      // green rising + glyphs
      const col = good ? '#4aff6a' : '#ff4a3a';
      for (let i = 0; i < 6; i++) {
        const ox = (hash(i * 13) - 0.5) * 26 * big;
        const oy = -u * 16 - hash(i * 7) * 6;
        const s = i === 0 ? 6 : 4;
        rect(g, cx + ox - s / 2, cy + oy, s, 1, col);
        rect(g, cx + ox - 0.5, cy + oy - s / 2 + 0.5, 1, s, col);
      }
      return;
    }
    case 'packets': {
      // violet dashes streaming toward the player
      const col = good ? '#b46aff' : '#ff4a3a';
      for (let i = 0; i < 8; i++) {
        const k = ((u * 1.6 + hash(i) * 0.7) % 1);
        const x = cx + (hash(i * 5) - 0.5) * 40 * big * (1 - k * 0.5);
        const y = cy - k * 18 + (hash(i * 3) - 0.5) * 6;
        rect(g, x, y, 4, 2, col);
      }
      return;
    }
    case 'burst':
    default:
      break;
  }
  const col = good ? '#6dff8a' : '#ff4a3a';
  const rgb = good ? '80,255,140' : '255,70,50';
  glow(g, cx, cy, 12 * big * (0.6 + u), rgb, 0.5 * (1 - u));
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(i) * 0.4;
    const r = (3 + 14 * u * (0.6 + hash(i + 9) * 0.6)) * big;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.6;
    const s = u < 0.5 ? 2 : 1;
    rect(g, x, y, s, s, i % 3 === 0 ? '#ffffff' : col);
  }
  if (u < 0.6) {
    const r = Math.round((3 + u * 12) * big);
    g.strokeStyle = col;
    g.lineWidth = 1;
    g.strokeRect(cx - r, cy - r * 0.5, r * 2, r);
  }
}

/** Brief full-screen tint (muzzle-flash brightening / damage). */
export function screenFlash(g: Ctx, w: number, h: number, rgb: string, a: number): void {
  if (a <= 0) return;
  g.fillStyle = `rgba(${rgb},${Math.min(0.6, a)})`;
  g.fillRect(0, 0, w, h);
}
