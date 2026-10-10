/**
 * ENEMIES: off-view spawn cues. A spawn column can't be seen when the enemy
 * materialises outside the fov, so the ticker gets a one-line bearing cue.
 * Ambush spawns are framed as an ambush; worm self-propagation copies are
 * framed as replication and throttled (they can arrive in bursts).
 */
export type SpawnCueKind = 'ambush' | 'replica';

/** Relative bearing → direction word; null inside the ~58° fov (with margin). */
export function cueDirection(rel: number): 'BEHIND YOU' | 'TO YOUR RIGHT' | 'TO YOUR LEFT' | null {
  let r = rel;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  if (Math.abs(r) < 0.85) return null;
  return Math.abs(r) > 2.2 ? 'BEHIND YOU' : r > 0 ? 'TO YOUR RIGHT' : 'TO YOUR LEFT';
}

/** Ticker line for an off-view spawn; null when the column itself is visible. */
export function spawnCueText(kind: SpawnCueKind, label: string, rel: number): string | null {
  const dir = cueDirection(rel);
  if (!dir) return null;
  return kind === 'ambush'
    ? `AMBUSH — ${label} MATERIALISED ${dir}`
    : `${label} REPLICATED ${dir}`;
}

/** At most one cue per interval seconds. */
export class CueGate {
  private last = -Infinity;

  constructor(private readonly interval: number) {}

  allow(now: number): boolean {
    if (now - this.last < this.interval) return false;
    this.last = now;
    return true;
  }

  reset(): void {
    this.last = -Infinity;
  }
}
