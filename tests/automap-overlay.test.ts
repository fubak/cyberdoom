import { describe, it, expect } from 'vitest';
import { automapDoorStyle, automapLegendEntries, visibleObjectivePoints } from '../src/ui/automap';
import { roleLabel } from '../src/core/roleLabel';
import { roleColor } from '../src/render/textures';
import { missionRegistry } from '../src/content/missions';
import { MissionRuntime } from '../src/missions/runtime';
import { EventBus } from '../src/core/events';

describe('automap upgrade (B5)', () => {
  it('colours doors by role and preserves locked border when both are set', () => {
    expect(automapDoorStyle({ accessRole: 'admin', locked: true })).toEqual({
      fill: roleColor('admin').light,
      lockedBorder: true,
    });
    expect(automapDoorStyle({ accessRole: 'analyst' })).toEqual({
      fill: roleColor('analyst').light,
      lockedBorder: false,
    });
    expect(automapDoorStyle({ locked: true })).toEqual({
      fill: '#d63025',
      lockedBorder: false,
    });
    expect(automapDoorStyle({})).toEqual({
      fill: '#d9b83f',
      lockedBorder: false,
    });
  });

  it('builds a legend with player, exit, objective, and mission role doors (excluding secret doors)', () => {
    const m02 = missionRegistry.get('m02')!;
    const legend = automapLegendEntries(m02.map);
    const labels = legend.map((e) => e.label);
    expect(labels).toContain('YOU');
    expect(labels).toContain('EXIT');
    expect(labels).toContain('OBJ');
    expect(legend.some((e) => e.kind === 'role')).toBe(true);
    for (const entry of legend) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.color).toMatch(/^#/);
    }
  });

  it('exposes current objective text, target markers, and secrets tally without leaking verdicts', () => {
    const m01 = missionRegistry.get('m01')!;
    const rt = new MissionRuntime(m01, new EventBus());
    const overlay = rt.automapOverlay();
    expect(overlay.objectiveText).toBeTruthy();
    expect(overlay.objectivePoints.length).toBeGreaterThan(0);
    expect(overlay.secrets).toBe(0);
    expect(overlay.secretsTotal).toBe(
      (m01.script?.secrets?.length ?? 0) + (m01.script?.eggs?.length ?? 0),
    );
  });

  it('marks all alive NPCs rather than only the culprit on report objectives', () => {
    const withReport = missionRegistry.all().find((m) =>
      m.missionObjectives.some((o) => o.kind === 'report'),
    );
    expect(withReport).toBeDefined();
    const rt = new MissionRuntime(withReport!, new EventBus());
    // Complete objectives before the report objective so report becomes active.
    for (const state of rt.objectives) {
      if (state.def.kind === 'report') break;
      state.progress = state.target;
      state.done = true;
    }
    const overlay = rt.automapOverlay();
    const npcCount = withReport!.entities.filter((e) => e.kind === 'npc' && !e.dormant).length;
    expect(overlay.objectivePoints.length).toBe(npcCount);
  });
});

describe('automap Phase A: no spoilers, readable roles', () => {
  /** Make the first objective of `kind` the active one by settling everything before it. */
  function activate(rt: MissionRuntime, kind: string): boolean {
    for (const state of rt.objectives) {
      if (state.def.kind === kind) return true;
      state.progress = state.target;
      state.done = true;
    }
    return false;
  }
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

  it('maps role ids to display labels (itops -> IT OPS)', () => {
    expect(roleLabel('itops')).toBe('IT OPS');
    expect(roleLabel('netops')).toBe('NET OPS');
    expect(roleLabel('soc')).toBe('SOC');
    expect(roleLabel('analyst')).toBe('ANALYST');
    const legend = automapLegendEntries(missionRegistry.get('m01')!.map);
    expect(legend.map((e) => e.label)).toContain('IT OPS');
    expect(legend.map((e) => e.label)).not.toContain('ITOPS');
  });

  it('the M01 clean objective marks the decoy too (does not give away the triage)', () => {
    const m01 = missionRegistry.get('m01')!;
    const rt = new MissionRuntime(m01, new EventBus());
    expect(activate(rt, 'clean')).toBe(true);
    const marks = new Set(rt.automapOverlay().objectivePoints.map(key));
    const decoy = rt.entities.find((e) => e.def.id === 'ws-decoy')!;
    expect(marks.has(key(decoy))).toBe(true);
    for (const id of ['ws1', 'ws2', 'ws3']) {
      expect(marks.has(key(rt.entities.find((e) => e.def.id === id)!)), id).toBe(true);
    }
  });

  it('clean-objective markers are verdict-neutral in every mission: lookalikes of a marked host are marked too', () => {
    for (const mission of missionRegistry.all()) {
      const rt = new MissionRuntime(mission, new EventBus());
      if (!activate(rt, 'clean')) continue;
      const marks = new Set(rt.automapOverlay().objectivePoints.map(key));
      // pickups can share a tile with a host; only hosts are objective targets
      const marked = rt.entities.filter((e) => e.alive && e.def.kind !== 'item' && marks.has(key(e)));
      expect(marked.length, mission.id).toBeGreaterThan(0);
      for (const m of marked) {
        const lookalikes = rt.entities.filter((e) => e.alive && e.def.kind === m.def.kind && e.def.sprite === m.def.sprite);
        for (const l of lookalikes) {
          expect(marks.has(key(l)), `${mission.id}: ${l.def.id} looks like ${m.def.id} but is unmarked`).toBe(true);
        }
      }
      // swapping the hidden verdict on a lookalike must not move any marker
      const before = [...marks].sort();
      for (const e of rt.entities) e.infected = !e.infected;
      expect([...new Set(rt.automapOverlay().objectivePoints.map(key))].sort(), mission.id).toEqual(before);
    }
  });

  it('only draws objective markers on explored tiles', () => {
    const points = [{ x: 1.5, y: 1.5 }, { x: 3.5, y: 2.5 }, { x: 0.5, y: 0.5 }];
    const width = 5;
    const visited = new Set([1 * width + 1, 0]);
    expect(visibleObjectivePoints(points, visited, width)).toEqual([{ x: 1.5, y: 1.5 }, { x: 0.5, y: 0.5 }]);
    expect(visibleObjectivePoints(points, new Set(), width)).toEqual([]);
    // input is not mutated
    expect(points).toHaveLength(3);
  });
});
