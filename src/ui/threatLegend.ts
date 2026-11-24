/**
 * Mission-select threat markers. Mission difficulty (1-9) buckets into three
 * levels drawn as `!` repeated; the legend line explains them from this table
 * so the markers and the explanation cannot drift apart.
 */
export interface ThreatLevel {
  level: number;
  label: string;
}

export const THREAT_LEVELS: readonly ThreatLevel[] = [
  { level: 1, label: 'LOW' },
  { level: 2, label: 'MED' },
  { level: 3, label: 'HIGH' },
];

const DIFFICULTY_PER_LEVEL = 3;

export function threatLevelFor(difficulty: number): ThreatLevel {
  const raw = Math.ceil(difficulty / DIFFICULTY_PER_LEVEL);
  const level = Math.max(1, Math.min(THREAT_LEVELS.length, Number.isFinite(raw) ? raw : 1));
  return THREAT_LEVELS[level - 1]!;
}

export function threatMarker(level: number): string {
  return '!'.repeat(level);
}

export function threatLegend(): string {
  return `THREAT  ${THREAT_LEVELS.map((t) => `${threatMarker(t.level)} = ${t.label}`).join('  ·  ')}`;
}
