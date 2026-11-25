import { describe, expect, it } from 'vitest';
import { BASE_H, BASE_STATUS, BASE_W } from '../src/render/res';
import { bossAlertY, bossBarLayout, bossEngaged, BOSS_FILL } from '../src/ui/bossBar';
import { keyPlateRect } from '../src/ui/keyPlate';
import { drawGlassPlate, drawKeyCap, type PlateRect } from '../src/ui/overlayArt';
import { BADGE_H, BADGE_ICON, BADGE_ICONS, badgeRect, powerBadges } from '../src/ui/powerBadges';
import { TICKER_MAX_ROWS } from '../src/ui/tickerQueue';

/**
 * LOOK: the plates over the 3D view (ticker, prompts, boss bar, power-up
 * badges). Layout modules and e2e probes own the rects, so the art must never
 * paint outside the rect it is handed.
 */
interface Fill { x: number; y: number; w: number; h: number; color: string }

function recorder(): { g: CanvasRenderingContext2D; fills: Fill[] } {
  const fills: Fill[] = [];
  const g = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, color: String(this.fillStyle) });
    },
  };
  return { g: g as unknown as CanvasRenderingContext2D, fills };
}

const EPS = 1e-9;
function expectInside(fills: Fill[], r: PlateRect): void {
  expect(fills.length).toBeGreaterThan(0);
  for (const f of fills) {
    expect(f.w).toBeGreaterThan(0);
    expect(f.h).toBeGreaterThan(0);
    expect(f.x).toBeGreaterThanOrEqual(r.x - EPS);
    expect(f.y).toBeGreaterThanOrEqual(r.y - EPS);
    expect(f.x + f.w).toBeLessThanOrEqual(r.x + r.w + EPS);
    expect(f.y + f.h).toBeLessThanOrEqual(r.y + r.h + EPS);
  }
}

describe('glass plate', () => {
  const accent = { color: '#a87a10', light: '#ffd040', w: 2 };

  it('stays inside its rect, with and without an accent bar', () => {
    for (const r of [{ x: 1, y: 1, w: 120, h: 7 }, { x: 0, y: 150, w: 60, h: 9 }, { x: 3, y: 9, w: 5, h: 21 }]) {
      const plain = recorder();
      drawGlassPlate(plain.g, r);
      expectInside(plain.fills, r);
      const barred = recorder();
      drawGlassPlate(barred.g, r, { accent });
      expectInside(barred.fills, r);
      expect(barred.fills.some((f) => f.color === accent.color)).toBe(true);
    }
  });

  it('draws nothing for an empty rect', () => {
    const a = recorder();
    drawGlassPlate(a.g, { x: 1, y: 1, w: 0, h: 7 });
    expect(a.fills).toHaveLength(0);
  });

  it('inner rows of a stacked block skip the lit top and shadowed bottom', () => {
    const r = { x: 1, y: 9, w: 80, h: 7 };
    const full = recorder();
    drawGlassPlate(full.g, r);
    const inner = recorder();
    drawGlassPlate(inner.g, r, { top: false, bottom: false });
    expect(inner.fills).toHaveLength(full.fills.length - 2);
  });
});

describe('key cap', () => {
  it('stays inside the key plate and keeps the glyph rows on the body colour', () => {
    const y = 150;
    const plate = keyPlateRect(4, y, 15);
    for (const ready of [true, false]) {
      const a = recorder();
      drawKeyCap(a.g, plate, ready);
      expectInside(a.fills, plate);
      const body = a.fills[0];
      // the 5x7 glyph spans y..y+7 from glyphX: no edge fill may reach into it
      for (const f of a.fills.slice(1)) {
        const overlapsX = f.x < plate.glyphX + 15 && f.x + f.w > plate.glyphX;
        const overlapsY = f.y < y + 7 && f.y + f.h > plate.glyphY;
        expect(overlapsX && overlapsY, `${f.color} at ${f.x},${f.y}`).toBe(false);
      }
      expect(body.w).toBe(plate.w);
    }
  });

  it('a ready key is amber and an idle key is not', () => {
    const plate = keyPlateRect(4, 150, 5);
    const ready = recorder();
    drawKeyCap(ready.g, plate, true);
    const idle = recorder();
    drawKeyCap(idle.g, plate, false);
    expect(ready.fills[0].color).toBe('#ffb428');
    expect(idle.fills[0].color).not.toBe('#ffb428');
  });
});

describe('power-up badges', () => {
  it('lists only the active power-ups, shield first', () => {
    expect(powerBadges(0, 0, 0)).toEqual([]);
    expect(powerBadges(50, 0, 3.2).map((b) => b.label)).toEqual(['SHIELD 50', 'AIR-GAP 4S']);
    expect(powerBadges(12.4, 9.1, 1).map((b) => b.kind)).toEqual(['shield', 'overclock', 'airgap']);
  });

  it('stacks right-aligned inside the view without overlapping', () => {
    const rects = [0, 1, 2].map((i) => badgeRect(i, 60));
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThan(BASE_W);
      expect(r.h).toBe(BADGE_H);
    }
    expect(rects[1].y).toBeGreaterThanOrEqual(rects[0].y + rects[0].h);
    expect(rects[2].y).toBeGreaterThanOrEqual(rects[1].y + rects[1].h);
  });

  it('every icon fits its box', () => {
    for (const shapes of Object.values(BADGE_ICONS)) {
      expect(shapes.length).toBeGreaterThan(0);
      for (const [x, y, w, h] of shapes) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(BADGE_ICON);
        expect(y + h).toBeLessThanOrEqual(BADGE_ICON);
      }
    }
    expect(BADGE_ICON).toBeLessThanOrEqual(BADGE_H);
  });
});

describe('boss bar', () => {
  const boss = { name: 'Boss-Locker Overlord', hp: 21, maxHp: 27, phase: 1, phaseCount: 3, phaseLabel: 'Key generation' };

  it('shows once the boss has seen the player or been hit', () => {
    expect(bossEngaged({})).toBe(false);
    expect(bossEngaged({ mode: 'wander' })).toBe(false);
    expect(bossEngaged({ sighted: true })).toBe(true);
    expect(bossEngaged({ aggroed: true })).toBe(true);
  });

  it('sits below a full ticker block and above the aim point', () => {
    for (const b of [boss, { ...boss, telegraph: 'Lockdown' }, { name: 'x', hp: 5, maxHp: 5 }]) {
      const l = bossBarLayout(b);
      // pinned objective (8) + ticker rows (7 each) from y 1
      expect(l.box.y).toBeGreaterThanOrEqual(1 + 8 + TICKER_MAX_ROWS * 7);
      expect(l.box.y + l.box.h).toBeLessThan((BASE_H - BASE_STATUS) / 2 - 8);
      expect(l.box.x).toBeGreaterThanOrEqual(0);
      expect(l.box.x + l.box.w).toBeLessThanOrEqual(BASE_W);
      expect(l.bar.y + l.bar.h).toBeLessThan(l.box.y + l.box.h);
      expect(bossAlertY(b)).toBeGreaterThan(l.box.y + l.box.h);
    }
  });

  it('fill follows hit points and is clamped', () => {
    expect(bossBarLayout({ ...boss, hp: 27 }).fillW).toBe(bossBarLayout(boss).bar.w);
    expect(bossBarLayout({ ...boss, hp: 40 }).fillW).toBe(bossBarLayout(boss).bar.w);
    expect(bossBarLayout({ ...boss, hp: 13.5 }).fillW).toBe(bossBarLayout(boss).bar.w / 2);
  });

  it('colour steps from normal to low, and the final phase overrides both', () => {
    expect(bossBarLayout(boss).ramp).toBe(BOSS_FILL.normal);
    expect(bossBarLayout({ ...boss, hp: 5 }).ramp).toBe(BOSS_FILL.low);
    expect(bossBarLayout({ ...boss, hp: 5, phase: 3 }).ramp).toBe(BOSS_FILL.final);
  });

  it('puts one divider between each pair of phases, inside the bar', () => {
    const l = bossBarLayout(boss);
    expect(l.dividers).toHaveLength(2);
    for (const x of l.dividers) {
      expect(x).toBeGreaterThan(l.bar.x);
      expect(x).toBeLessThan(l.bar.x + l.bar.w);
    }
    expect(bossBarLayout({ name: 'x', hp: 5, maxHp: 5 }).dividers).toEqual([]);
  });

  it('labels the phase and prefers a telegraph over the phase name', () => {
    expect(bossBarLayout(boss).label).toBe('BOSS-LOCKER OVERLORD P1/3  21/27');
    expect(bossBarLayout(boss).sub).toBe('KEY GENERATION');
    const t = bossBarLayout({ ...boss, telegraph: 'Lockdown' });
    expect(t.sub).toBe('! LOCKDOWN !');
    expect(t.alert).toBe(true);
    expect(bossBarLayout({ name: 'x', hp: 5, maxHp: 5 }).sub).toBeNull();
  });
});
