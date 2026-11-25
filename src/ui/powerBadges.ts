import { drawText, measureText } from '../render/font';
import { BASE_W, RES } from '../render/res';
import { drawGlassPlate, type PlateRect } from './overlayArt';

/**
 * LOOK: power-up badges stacked at the top right of the 3D view (firewall
 * vest shield, SOC overclock, air-gap). Each is a glass plate with a lit
 * accent bar, a small icon and its tiny-font label.
 */

const U = 1 / RES;

export type BadgeKind = 'shield' | 'overclock' | 'airgap';

export interface PowerBadge {
  kind: BadgeKind;
  label: string;
  fg: string;
  accent: string;
  light: string;
}

export const BADGE_H = 10;
export const BADGE_GAP = 2;
export const BADGE_TOP = 16;
export const BADGE_MARGIN = 4;
/** Icon box side, in base units. */
export const BADGE_ICON = 7;
const ACCENT_W = 2;
const ICON_X = ACCENT_W + 2;
const TEXT_X = ICON_X + BADGE_ICON + 2;
const TEXT_PAD = 4;

/** The badges to show, top to bottom, for the player's current power-ups. */
export function powerBadges(armor: number, overclockT: number, airgapT: number): PowerBadge[] {
  return [
    ...(armor > 0
      ? [{ kind: 'shield' as const, label: `SHIELD ${Math.round(armor)}`, fg: '#78ecff', accent: '#2670a8', light: '#8ad4ff' }]
      : []),
    ...(overclockT > 0
      ? [{ kind: 'overclock' as const, label: `OVERCLOCK ${Math.ceil(overclockT)}S`, fg: '#ffd65a', accent: '#a86e18', light: '#ffd070' }]
      : []),
    ...(airgapT > 0
      ? [{ kind: 'airgap' as const, label: `AIR-GAP ${Math.ceil(airgapT)}S`, fg: '#ffffff', accent: '#d8a828', light: '#fff0a8' }]
      : []),
  ];
}

/** Plate rect of the `index`-th badge for a label `textW` units wide (right-aligned). */
export function badgeRect(index: number, textW: number): PlateRect {
  const w = TEXT_X + textW + TEXT_PAD;
  return { x: BASE_W - w - BADGE_MARGIN, y: BADGE_TOP + index * (BADGE_H + BADGE_GAP), w, h: BADGE_H };
}

type IconRect = readonly [x: number, y: number, w: number, h: number, tone: 0 | 1 | 2];

/** Icon shapes on a 7x7 unit box. Tone 0 = base, 1 = lit, 2 = dark detail. */
export const BADGE_ICONS: Record<BadgeKind, readonly IconRect[]> = {
  shield: [
    [0.5, 0, 6, 4, 0],
    [1, 4, 5, 1, 0],
    [1.5, 5, 4, 1, 0],
    [2.5, 6, 2, 0.75, 0],
    [0.5, 0, 6, U, 1],
    [0.5, 0, 3, 4, 1],
    [1, 4, 2.5, 1, 1],
    [1.5, 5, 2, 1, 1],
    [2.5, 6, 1, 0.75, 1],
    [3.25, 1.25, 0.5, 3.5, 2],
    [2, 2.25, 3, 0.5, 2],
  ],
  overclock: [
    [3.5, 0, 2.5, 1, 0],
    [2.5, 1, 2.5, 1, 0],
    [1.5, 2, 2.5, 1, 0],
    [1, 3, 5, 1, 0],
    [3, 4, 2.5, 1, 0],
    [2.5, 5, 2, 1, 0],
    [2, 6, 1.25, 1, 0],
    [3.5, 0, 2.5, U, 1],
    [1, 3, 5, U, 1],
    [3.5, 0, U, 1, 1],
    [2.5, 1, U, 1, 1],
    [1.5, 2, U, 1, 1],
  ],
  airgap: [
    [2, 0, 3, 0.75, 0],
    [1.5, 0.5, 0.75, 2.5, 0],
    [4.75, 0.5, 0.75, 2.5, 0],
    [0.75, 3, 5.5, 4, 0],
    [0.75, 3, 5.5, U, 1],
    [0.75, 3, U, 4, 1],
    [2, 0, 3, U, 1],
    [3, 4.25, 1, 1, 2],
    [3.25, 5, 0.5, 1.25, 2],
    [0.75, 7 - U, 5.5, U, 2],
  ],
};

function drawIcon(g: CanvasRenderingContext2D, b: PowerBadge, x: number, y: number): void {
  const tones = [b.fg, '#ffffff', 'rgba(4,6,10,0.8)'];
  // the lit tone of a white icon would vanish: fall back to the accent light
  if (b.fg === '#ffffff') tones[0] = b.light;
  for (const [ix, iy, iw, ih, tone] of BADGE_ICONS[b.kind]) {
    g.fillStyle = tones[tone];
    g.fillRect(x + ix, y + iy, iw, ih);
  }
}

export function drawPowerBadges(g: CanvasRenderingContext2D, armor: number, overclockT: number, airgapT: number): void {
  powerBadges(armor, overclockT, airgapT).forEach((b, i) => {
    const r = badgeRect(i, measureText(b.label, 'tiny'));
    drawGlassPlate(g, r, { fill: 'rgba(10,14,22,0.84)', accent: { color: b.accent, light: b.light, w: ACCENT_W } });
    drawIcon(g, b, r.x + ICON_X, r.y + (BADGE_H - BADGE_ICON) / 2);
    drawText(g, b.label, r.x + TEXT_X, r.y + 2, b.fg, 'tiny', null);
  });
}
