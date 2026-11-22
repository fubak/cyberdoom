export interface Checkpoint {
  label: string;
  runtime: unknown;
  player: unknown;
  arsenal: unknown;
  doors: unknown;
  elapsedAt: number;
}

export function objectiveCheckpointLabel(
  completedBefore: ReadonlySet<string>,
  objectives: readonly { def: { id: string; text: string }; done: boolean }[],
  finished: boolean,
): string | null {
  if (finished) return null;
  const completed = objectives.find(({ def, done }) => done && !completedBefore.has(def.id));
  return completed ? `CHECKPOINT: ${completed.def.text}` : null;
}

export function latestRetryCheckpoint(
  automatic: Checkpoint | null,
  quick: Checkpoint | null,
): Checkpoint | null {
  const automaticEligible = automatic && automatic.label !== 'MISSION START' ? automatic : null;
  const quickEligible = quick && (!automatic || quick.elapsedAt > automatic.elapsedAt) ? quick : null;
  if (!automaticEligible) return quickEligible;
  if (!quickEligible) return automaticEligible;
  return quickEligible.elapsedAt > automaticEligible.elapsedAt ? quickEligible : automaticEligible;
}
