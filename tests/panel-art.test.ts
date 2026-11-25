import { describe, expect, it } from 'vitest';
import { GRID_TILES, gridLines, MAP_BG, MAP_FLOOR, MAP_WALL, paintBackdrop, paintFloor, paintWall } from '../src/ui/automapIcons';
import type { PlateRect } from '../src/ui/overlayArt';
import { BAND_STEPS, drawBand, drawLamp, drawPanel, LAMP, TRIM_AMBER, TRIM_GREEN, TRIM_RED } from '../src/ui/panelArt';

/**
 * LOOK: opaque panel art (objective strip, TAB overlay, automap chrome) and
 * the automap tile painters. The layout modules own every rect, so the art
 * must stay inside the rect it is handed.
 */
interface Fill { x: number; y: number; w: number; h: number; color: string }

function recorder(): { g: CanvasRenderingContext2D; fills: Fill[] } {
  const fills: Fill[] = [];
  const g = {
    fillStyle: '',
    globalAlpha: 1,
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

const lum = (hex: string): number => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);

describe('band', () => {
  const strip = { x: 0, y: 0, w: 320, h: 11 };
  const footer = { x: 0, y: 152, w: 320, h: 14 };

  it('stays inside its rect for every trim and edge', () => {
    for (const trim of [TRIM_AMBER, TRIM_GREEN, TRIM_RED]) {
      for (const [r, edge] of [[strip, 'bottom'], [footer, 'top'], [{ x: 0, y: 0, w: 320, h: 164 }, 'bottom']] as const) {
        const a = recorder();
        drawBand(a.g, r, trim, edge);
        expectInside(a.fills, r);
      }
    }
  });

  it('puts the trim on the requested edge', () => {
    const bottom = recorder();
    drawBand(bottom.g, strip, TRIM_AMBER, 'bottom');
    expect(bottom.fills.find((f) => f.color === TRIM_AMBER.color)!.y).toBe(strip.y + strip.h - 1);
    const top = recorder();
    drawBand(top.g, footer, TRIM_AMBER, 'top');
    expect(top.fills.find((f) => f.color === TRIM_AMBER.color)!.y).toBe(footer.y);
  });

  it('restores the canvas alpha after a translucent body', () => {
    const a = recorder();
    drawBand(a.g, strip, TRIM_AMBER, 'bottom', 0.5);
    expect(a.g.globalAlpha).toBe(1);
  });

  it('body steps darken downward and stay near black', () => {
    for (let i = 1; i < BAND_STEPS.length; i++) expect(lum(BAND_STEPS[i])).toBeLessThan(lum(BAND_STEPS[i - 1]));
    expect(lum(BAND_STEPS[0])).toBeLessThan(60);
  });

  it('draws nothing for an empty rect', () => {
    const a = recorder();
    drawBand(a.g, { x: 0, y: 0, w: 320, h: 0 }, TRIM_AMBER);
    expect(a.fills).toHaveLength(0);
  });
});

describe('lamp', () => {
  it('stays inside its square at both sizes the HUD uses', () => {
    for (const size of [5, 7]) {
      for (const state of ['open', 'done', 'failed'] as const) {
        const a = recorder();
        drawLamp(a.g, 4, 20, size, state);
        expectInside(a.fills, { x: 4, y: 20, w: size, h: size });
        expect(a.fills.some((f) => f.color === LAMP[state][1])).toBe(true);
      }
    }
  });

  it('each state has its own body colour', () => {
    expect(new Set([LAMP.open[1], LAMP.done[1], LAMP.failed[1]]).size).toBe(3);
  });
});

describe('legend panel', () => {
  it('stays inside its rect', () => {
    const r = { x: 270, y: 14, w: 47, h: 32 };
    const a = recorder();
    drawPanel(a.g, r, TRIM_AMBER);
    expectInside(a.fills, r);
  });
});

describe('automap tiles', () => {
  it('wall, floor and backdrop are three distinct tones, floor and wall above the backdrop', () => {
    expect(new Set([MAP_BG, MAP_FLOOR, MAP_WALL]).size).toBe(3);
    expect(lum(MAP_FLOOR)).toBeGreaterThan(lum(MAP_BG));
    expect(lum(MAP_WALL)).toBeGreaterThan(lum(MAP_BG));
  });

  it('tile painters stay inside the cell, at large and tiny zoom', () => {
    for (const size of [1.5, 4, 9.6]) {
      for (const paint of [paintWall, paintFloor]) {
        const a = recorder();
        paint(a.g, 30.25, 41.5, size);
        expectInside(a.fills, { x: 30.25, y: 41.5, w: size, h: size });
      }
    }
  });

  it('tiny tiles skip the edge detail', () => {
    const a = recorder();
    paintWall(a.g, 0, 0, 2);
    expect(a.fills).toHaveLength(1);
  });

  it('grid lines are one pitch apart, cover the span and pass through the map origin', () => {
    const lines = gridLines(37.5, 20, 320);
    expect(lines[0]).toBeGreaterThan(-20);
    expect(lines[0]).toBeLessThanOrEqual(0);
    expect(lines[lines.length - 1]).toBeGreaterThan(300);
    for (let i = 1; i < lines.length; i++) expect(lines[i] - lines[i - 1]).toBeCloseTo(20);
    expect(lines.some((x) => Math.abs(x - 37.5) < 1e-9)).toBe(true);
    expect(gridLines(0, 0, 320)).toEqual([]);
  });

  it('the backdrop drops its grid when tiles are too small to space the lines', () => {
    const dense = recorder();
    paintBackdrop(dense.g, 320, 168, 0, 0, 1);
    expect(dense.fills).toHaveLength(1);
    const open = recorder();
    paintBackdrop(open.g, 320, 168, 10, 10, 8);
    expect(open.fills.length).toBeGreaterThan(1);
    expect(GRID_TILES).toBeGreaterThan(1);
    expectInside(open.fills.slice(0, 1), { x: 0, y: 0, w: 320, h: 168 });
  });
});
