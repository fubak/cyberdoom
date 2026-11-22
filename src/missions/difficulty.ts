export type SkillId = 'trainee' | 'junior' | 'analyst' | 'senior' | 'commander';

export interface Skill {
  id: SkillId;
  label: string;
  dmg: number;
  speed: number;
  hpBonus: number;
  pickup: number;
}

export const SKILLS: Skill[] = [
  { id: 'trainee', label: 'TRAINEE', dmg: 0.5, speed: 0.85, hpBonus: 0, pickup: 2 },
  { id: 'junior', label: 'JUNIOR ANALYST', dmg: 0.75, speed: 0.93, hpBonus: 0, pickup: 1.5 },
  { id: 'analyst', label: 'ANALYST', dmg: 1, speed: 1, hpBonus: 0, pickup: 1 },
  { id: 'senior', label: 'SENIOR ANALYST', dmg: 1.25, speed: 1.07, hpBonus: 0, pickup: 0.75 },
  { id: 'commander', label: 'INCIDENT COMMANDER', dmg: 1.5, speed: 1.15, hpBonus: 1, pickup: 0.5 },
];

export function skillById(id: string): Skill {
  return SKILLS.find((skill) => skill.id === id) ?? SKILLS.find((skill) => skill.id === 'analyst')!;
}

/** LEVELS: expected threat count for the campaign arc (grows with mission difficulty). */
export function encounterBudget(d: number): number {
  return Math.ceil(6 * Math.pow(1.14, d - 1));
}

/**
 * LEVELS: per-mission stat scaling applied to enemies at mission start.
 * Gentle through the rookie missions, clearly steep by the finale:
 * d1 stays at base stats; d12 gives +5 hp, x1.55 speed and x1.66 ranged damage.
 * `aggro` is the sight radius in tiles and is capped at ~10 so un-sighted
 * enemies never detect the player across half the map (spawn-safety rule).
 * `dmgMul` scales ranged (projectile) damage only; melee damage uses speedMul
 * and the selected skill modifier.
 */
export function difficultyScale(d: number): {
  hpBonus: number;
  speedMul: number;
  dmgMul: number;
  aggro: number;
} {
  return {
    hpBonus: Math.max(0, Math.round((d - 2) * 0.45)),
    speedMul: 1 + 0.05 * (d - 1),
    dmgMul: 1 + 0.06 * (d - 1),
    aggro: Math.min(10, 6.5 + 0.4 * d),
  };
}
