import { RES } from '../render/res';

/**
 * LOOK: shared art for the plates that float over the 3D view (ticker rows,
 * pinned objective, pickup lane, action prompts, damage alert, power-up
 * badges). Every painter stays inside the rect it is given, so the layout
 * modules and the e2e plate probes keep their geometry.
 */

/** One native pixel in base units. */
const U = 1 / RES;

/** Default glass: dark enough that tiny text holds over lit walls and bright sprites. */
export const GLASS_FILL = 'rgba(4,6,10,0.78)';

export interface PlateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GlassStyle {
  /** Body colour (defaults to GLASS_FILL). */
  fill?: string;
  /** Left accent bar: base colour, its lit edge and its width in base units. */
  accent?: { color: string; light: string; w: number };
  /** Lit top edge (off for the inner rows of a stacked block). */
  top?: boolean;
  /** Shadowed bottom edge (off for the inner rows of a stacked block). */
  bottom?: boolean;
}

/** Columns of the stepped right end cap: [inset from the right edge, vertical inset]. */
export const END_CAP: readonly (readonly [number, number])[] = [
  [2 * U, U],
  [U, 2 * U],
];

/**
 * Translucent glass plate: dark body with a stepped right end, faint
 * scanlines, a lit top edge, a shadowed bottom edge and an optional lit
 * accent bar on the left.
 */
export function drawGlassPlate(g: CanvasRenderingContext2D, r: PlateRect, style: GlassStyle = {}): void {
  const { x, y, w, h } = r;
  if (w <= 0 || h <= 0) return;
  const cap = w > 4 * U && h > 4 * U;
  const bodyW = cap ? w - 2 * U : w;
  g.fillStyle = style.fill ?? GLASS_FILL;
  g.fillRect(x, y, bodyW, h);
  if (cap) for (const [dx, dy] of END_CAP) g.fillRect(x + w - dx, y + dy, U, h - 2 * dy);
  // scanlines only ever darken, so text contrast never drops
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let sy = y + 2 * U; sy < y + h - U / 2; sy += 2 * U) g.fillRect(x, sy, bodyW, U);
  if (style.top !== false) {
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.fillRect(x, y, bodyW, U);
  }
  if (style.bottom !== false) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x, y + h - U, bodyW, U);
  }
  const a = style.accent;
  if (a) {
    const aw = Math.min(a.w, w);
    g.fillStyle = a.color;
    g.fillRect(x, y, aw, h);
    g.fillStyle = a.light;
    g.fillRect(x, y, aw, U);
    g.fillRect(x, y, U, h - U);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, y + h - U, aw, U);
  }
}

const KEY_READY = { body: '#ffb428', lit: '#ffe9a0', side: '#ffd060', shade: '#c88410', foot: '#8a5606' } as const;
const KEY_IDLE = { body: '#4a4e58', lit: '#7a808c', side: '#5c626e', shade: '#3a3e48', foot: '#24272e' } as const;

/**
 * Key cap behind an `[E]` / `[LMB]` glyph: a raised amber key (grey when the
 * action is not ready). The edges are one or two native pixels, so the glyph
 * rows (which start one base unit inside the cap) all stay on the body colour.
 */
export function drawKeyCap(g: CanvasRenderingContext2D, r: PlateRect, ready: boolean): void {
  const c = ready ? KEY_READY : KEY_IDLE;
  g.fillStyle = c.body;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = c.shade;
  g.fillRect(r.x + r.w - U, r.y, U, r.h);
  g.fillStyle = c.side;
  g.fillRect(r.x, r.y, U, r.h);
  g.fillStyle = c.lit;
  g.fillRect(r.x, r.y, r.w - U, U);
  g.fillStyle = c.foot;
  g.fillRect(r.x, r.y + r.h - 2 * U, r.w, 2 * U);
}
