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
 * `dmgMul` scales ranged (projectile) damage only — melee cadence/damage is
 * owned by the feel tuning so the two-worm kill-time floor stays intact.
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
