import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';

// Campaign order is the mission id sequence (m01..m12), which matches the
// intended difficulty arc.
const ordered = missionRegistry.all().sort((a, b) => a.id.localeCompare(b.id));

describe('difficulty curve', () => {
  it('ramps threat counts upward across the campaign, allowing small dips', () => {
    expect(ordered.length).toBeGreaterThanOrEqual(12);
    const counts = ordered.map((m) => m.entities.filter((e) => e.kind === 'enemy').length);
    // The opener fields about a dozen threats; the finale fields 30+.
    expect(counts[0]).toBeGreaterThanOrEqual(12);
    expect(counts[counts.length - 1]).toBeGreaterThanOrEqual(30);
    // Monotonic-ish: no mission falls more than 4 below the running peak.
    let peak = 0;
    counts.forEach((count, index) => {
      expect(
        count,
        `${ordered[index].id} drops too far below the campaign peak`,
      ).toBeGreaterThanOrEqual(peak - 4);
      peak = Math.max(peak, count);
    });
  });

  it('gives every mission an opening skirmish and at least one telegraphed ambush', () => {
    for (const m of ordered) {
      const live = m.entities.filter((e) => e.kind === 'enemy' && !e.dormant);
      expect(live.length, `${m.id} has no live opening threats`).toBeGreaterThanOrEqual(1);
      const ambushes = (m.script?.triggers ?? []).filter((t) => t.spawn?.length);
      expect(ambushes.length, `${m.id} has no spawn triggers`).toBeGreaterThanOrEqual(1);
    }
  });
});
