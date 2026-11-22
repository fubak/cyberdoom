import { describe, it, expect } from 'vitest';
import { automapDoorStyle, automapLegendEntries } from '../src/ui/automap';
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
