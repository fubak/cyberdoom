export function encounterBudget(d: number): number {
  return Math.ceil(6 * Math.pow(1.27, d - 1));
}

export function difficultyScale(d: number): {
  hpBonus: number;
  speedMul: number;
  aggro: number;
} {
  return {
    hpBonus: (d >= 6 ? 1 : 0) + (d >= 8 ? 1 : 0),
    speedMul: 1 + 0.04 * (d - 1),
    aggro: 8 + 0.75 * d,
  };
}
