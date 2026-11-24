import type { Entity } from '../core/types';

/**
 * Verdict-neutral automap targets for a 'clean' objective. Marking exactly the
 * infected hosts would hand the player the triage answer ("read every flagged
 * host before you act"), so the marker set is widened to every alive entity that
 * looks like a target (same kind and sprite), decoys included. Which ones are
 * really infected is left for the case files to show.
 */
export function lookalikeTargets(
  targets: readonly Entity[],
  entities: readonly Entity[],
  settled: ReadonlySet<string> = new Set(),
): Entity[] {
  const looks = new Set(targets.map((e) => `${e.def.kind}|${e.def.sprite}`));
  return entities.filter((e) => e.alive && !settled.has(e.def.id) && looks.has(`${e.def.kind}|${e.def.sprite}`));
}
