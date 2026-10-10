import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { difficultyScale, encounterBudget } from '../src/missions/difficulty';

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

  it('ramps the difficulty rating monotonically — every mission is its own step', () => {
    const d = ordered.map((m) => m.difficulty);
    for (let i = 1; i < d.length; i++) {
      expect(d[i], `${ordered[i].id} plateaus at d${d[i]} after ${ordered[i - 1].id}`).toBeGreaterThan(d[i - 1]);
    }
    // Stat scaling follows: the finale is clearly harder than mid-campaign,
    // which is clearly harder than the early arc, while the openers stay forgiving.
    const s = (i: number) => difficultyScale(ordered[i].difficulty);
    expect(s(11).hpBonus).toBeGreaterThan(s(7).hpBonus);
    expect(s(7).hpBonus).toBeGreaterThan(s(3).hpBonus);
    expect(s(11).speedMul).toBeGreaterThan(s(7).speedMul);
    expect(s(7).speedMul).toBeGreaterThan(s(3).speedMul);
    expect(s(11).dmgMul).toBeGreaterThan(s(3).dmgMul);
    expect(s(0).hpBonus).toBe(0);
    expect(s(0).speedMul).toBe(1);
    expect(s(0).dmgMul).toBe(1);
    // Encounter budgets never shrink down the arc.
    const budgets = ordered.map((m) => encounterBudget(m.difficulty));
    expect(budgets).toEqual([...budgets].sort((a, b) => a - b));
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
