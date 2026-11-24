import { describe, expect, it } from 'vitest';
import {
  AUTOMAP_ZOOM_MAX,
  AUTOMAP_ZOOM_MIN,
  automapBaseCell,
  automapCellIcon,
  automapOrigin,
  avoidBox,
  doorAxis,
  edgeArrow,
  exploredBounds,
  fitExplored,
  partitionObjectivePoints,
} from '../src/ui/automapView';
import { automapLegendEntries } from '../src/ui/automap';
import { missionRegistry } from '../src/content/missions';
import { MissionRuntime } from '../src/missions/runtime';
import { EventBus } from '../src/core/events';

const view = { w: 320, h: 168, insetTop: 20, insetBottom: 18 };

describe('automap auto-fit (Phase F)', () => {
  it('finds the bounding box of explored tiles', () => {
    const w = 10;
    const visited = new Set([2 * w + 3, 4 * w + 7, 3 * w + 5]);
    expect(exploredBounds(visited, w, 8)).toEqual({ minX: 3, minY: 2, maxX: 7, maxY: 4 });
    expect(exploredBounds(new Set(), w, 8)).toBeNull();
    // out-of-range indices are ignored
    expect(exploredBounds(new Set([-1, 999]), w, 8)).toBeNull();
  });

  it('centres the explored box and zooms it to fill the frame', () => {
    const mapW = 60;
    const mapH = 40;
    const bounds = { minX: 10, minY: 10, maxX: 19, maxY: 15 };
    const fit = fitExplored(bounds, mapW, mapH, view)!;
    expect(fit.centerX).toBeCloseTo(15);
    const cell = automapBaseCell(view, mapW, mapH) * fit.zoom;
    // the explored box (plus margin) fits inside the band between header and footer
    expect((bounds.maxX - bounds.minX + 1) * cell).toBeLessThanOrEqual(view.w);
    expect((bounds.maxY - bounds.minY + 1) * cell).toBeLessThanOrEqual(view.h - view.insetTop - view.insetBottom);
    // and it fills one axis of the frame (minus margins): not left tiny
    const fillW = ((bounds.maxX - bounds.minX + 3) * cell) / view.w;
    const fillH = ((bounds.maxY - bounds.minY + 3) * cell) / (view.h - view.insetTop - view.insetBottom);
    expect(Math.max(fillW, fillH)).toBeGreaterThan(0.95);
    // vertical centre lands in the middle of the band, not of the raw view
    const screenY = view.h / 2 + ((bounds.minY + bounds.maxY + 1) / 2 - fit.centerY) * cell;
    expect(screenY).toBeCloseTo(view.insetTop + (view.h - view.insetTop - view.insetBottom) / 2);
  });

  it('free pan can centre an explored corner; follow keeps the tight clamp', () => {
    const v = { w: 320, h: 168 };
    // 60x40 map at 10px cells; centre on tile (3, 3) near the top-left corner
    const pan = automapOrigin({ x: 3, y: 3 }, 10, 60, 40, v, false);
    expect(pan.left + 3 * 10).toBeCloseTo(v.w / 2);
    expect(pan.top + 3 * 10).toBeCloseTo(v.h / 2);
    const follow = automapOrigin({ x: 3, y: 3 }, 10, 60, 40, v, true);
    expect(follow).toEqual({ left: 0, top: 0 });
    // a map smaller than the view is centred while following
    expect(automapOrigin({ x: 1, y: 1 }, 2, 10, 10, v, true)).toEqual({ left: 150, top: 74 });
    // free pan still cannot push the whole map off screen
    const far = automapOrigin({ x: -100, y: 500 }, 10, 60, 40, v, false);
    expect(far.left).toBeLessThanOrEqual(v.w / 2);
    expect(far.top + 40 * 10).toBeGreaterThanOrEqual(v.h / 2);
  });

  it('clamps zoom to the manual zoom range', () => {
    const tiny = fitExplored({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 200, 200, view)!;
    expect(tiny.zoom).toBe(AUTOMAP_ZOOM_MAX);
    const huge = fitExplored({ minX: 0, minY: 0, maxX: 399, maxY: 9 }, 400, 10, view)!;
    expect(huge.zoom).toBeGreaterThanOrEqual(AUTOMAP_ZOOM_MIN);
  });

  it('does not mutate its inputs', () => {
    const bounds = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    const v = { ...view };
    fitExplored(bounds, 10, 10, v);
    expect(bounds).toEqual({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
    expect(v).toEqual(view);
  });
});

describe('automap objective edge arrows (Phase F)', () => {
  const rect = { left: 10, top: 20, right: 310, bottom: 150 };

  it('clamps a far target to the frame border along the ray from the origin', () => {
    const a = edgeArrow({ x: 160, y: 85 }, { x: 1000, y: 85 }, rect)!;
    expect(a.x).toBeCloseTo(310);
    expect(a.y).toBeCloseTo(85);
    expect(a.angle).toBeCloseTo(0);
    const up = edgeArrow({ x: 160, y: 85 }, { x: 160, y: -500 }, rect)!;
    expect(up.y).toBeCloseTo(20);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('hits the nearer border on a diagonal and stays inside the rect', () => {
    const a = edgeArrow({ x: 160, y: 85 }, { x: 900, y: 900 }, rect)!;
    expect(a.x).toBeGreaterThanOrEqual(rect.left - 1e-9);
    expect(a.x).toBeLessThanOrEqual(rect.right + 1e-9);
    expect(a.y).toBeCloseTo(150);
  });

  it('places even an on-screen unexplored target on the border (direction only, no exact spot)', () => {
    const a = edgeArrow({ x: 160, y: 85 }, { x: 170, y: 85 }, rect)!;
    expect(a.x).toBeCloseTo(310);
  });

  it('clamps an origin outside the frame first, and returns null with no direction', () => {
    const a = edgeArrow({ x: -100, y: 85 }, { x: 1000, y: 85 }, rect)!;
    expect(a.x).toBeCloseTo(310);
    expect(edgeArrow({ x: 50, y: 50 }, { x: 50, y: 50 }, rect)).toBeNull();
  });

  it('slides an arrow out from under the legend box', () => {
    const box = { left: 260, top: 20, right: 310, bottom: 60 };
    const side = avoidBox({ x: 310, y: 30, angle: 0 }, box, rect);
    expect(side).toEqual({ x: 310, y: 64, angle: 0 });
    const top = avoidBox({ x: 280, y: 20, angle: -1 }, box, rect);
    expect(top).toEqual({ x: 256, y: 20, angle: -1 });
    const clear = { x: 100, y: 20, angle: -1 };
    expect(avoidBox(clear, box, rect)).toBe(clear);
  });

  it('splits markers into explored diamonds and unexplored arrows without dropping any', () => {
    const w = 5;
    const points = [{ x: 1.5, y: 1.5 }, { x: 3.5, y: 2.5 }];
    const visited = new Set([1 * w + 1]);
    const parts = partitionObjectivePoints(points, visited, w);
    expect(parts.explored).toEqual([{ x: 1.5, y: 1.5 }]);
    expect(parts.unexplored).toEqual([{ x: 3.5, y: 2.5 }]);
    expect(points).toHaveLength(2);
  });

  it('arrows stay verdict-neutral: flipping hidden infection never changes the arrow set', () => {
    const m01 = missionRegistry.get('m01')!;
    const rt = new MissionRuntime(m01, new EventBus());
    for (const state of rt.objectives) {
      if (state.def.kind === 'clean') break;
      state.progress = state.target;
      state.done = true;
    }
    const w = m01.map.grid[0].length;
    const arrows = () =>
      partitionObjectivePoints(rt.automapOverlay().objectivePoints, new Set<number>(), w)
        .unexplored.map((p) => `${p.x},${p.y}`).sort();
    const before = arrows();
    // the decoy is among the arrows too
    const decoy = rt.entities.find((e) => e.def.id === 'ws-decoy')!;
    expect(before).toContain(`${decoy.x},${decoy.y}`);
    for (const e of rt.entities) e.infected = !e.infected;
    expect(arrows()).toEqual(before);
  });
});

describe('automap door / lock / exit icons (Phase F)', () => {
  it('picks a distinct shape per cell type', () => {
    expect(automapCellIcon({ kind: 'exit' })).toBe('exit');
    expect(automapCellIcon({ kind: 'door' })).toBe('door');
    expect(automapCellIcon({ kind: 'door', locked: true })).toBe('locked');
    expect(automapCellIcon({ kind: 'door', accessRole: 'admin' })).toBe('door');
    expect(automapCellIcon({ kind: 'door', accessRole: 'admin', locked: true })).toBe('locked');
    expect(automapCellIcon({ kind: 'floor' })).toBeNull();
    expect(automapCellIcon({ kind: 'wall' })).toBeNull();
  });

  it('orients the door slab across the passage', () => {
    // walls left and right: passage runs north-south, slab lies horizontal
    expect(doorAxis((x) => x !== 5, 5, 5)).toBe('h');
    // walls above and below: slab is vertical
    expect(doorAxis((_x, y) => y !== 5, 5, 5)).toBe('v');
  });

  it('legend icons match the map icons', () => {
    for (const mission of missionRegistry.all()) {
      const legend = automapLegendEntries(mission.map);
      const byKind = (kind: string) => legend.find((e) => e.kind === kind);
      expect(byKind('exit')?.icon).toBe('exit');
      expect(byKind('objective')?.icon).toBe('objective');
      if (byKind('door')) expect(byKind('door')!.icon).toBe('door');
      if (byKind('locked')) expect(byKind('locked')!.icon).toBe('locked');
      for (const role of legend.filter((e) => e.kind === 'role')) expect(role.icon).toBe('door');
      // any locked door on the map (role-gated or not) must have a LOCK legend row
      const anyLocked = Object.values(mission.map.legend).some((c) => c.kind === 'door' && c.locked && !c.secret);
      expect(!!byKind('locked'), mission.id).toBe(anyLocked);
    }
  });
});
