import type { CallAction, CallOption, EntityDef } from '../core/types';

/**
 * CURRICULUM: the "WHAT DO YOU DO?" triage call on a case file. After
 * inspecting a host or evidence item the player commits to a call before a
 * clean/release/patch counts, so field work tests the decision, not the
 * click. Entities opt in with `inspect.call`; 'auto' derives the right call
 * from the entity's existing evidence data (category, tags, infected), so
 * content does not hand-write answers.
 */

export const CALL_PROMPT = 'WHAT DO YOU DO?';

/** The four standard calls, always in the same slot order (keys 1-4). */
export const CALL_OPTIONS: CallOption[] = [
  { action: 'quarantine', text: 'Quarantine + clean it' },
  { action: 'release', text: 'Leave it - false positive' },
  { action: 'escalate', text: 'Escalate to an IR lead' },
  { action: 'patch', text: 'Patch / remediate it' },
];

/**
 * The call this entity's case file requires, or undefined when it asks for
 * none. 'auto' resolution order: explicit tags first (confirmed-vulnerable
 * hosts get patched, known-benign entries are released), then the evidence
 * category, then live infection state.
 */
export function requiredCall(def: EntityDef): CallAction | undefined {
  const want = def.inspect?.call;
  if (!want) return undefined;
  if (want !== 'auto') return want;
  const tags = def.tags ?? [];
  const category = def.inspect?.category;
  if (tags.includes('vulnerability-confirmed')) return 'patch';
  if (tags.includes('triage-legit') || tags.includes('decoy')) return 'release';
  if (category === 'malware' || category === 'phishing') return 'quarantine';
  if (category === 'suspicious' || def.culprit) return 'escalate';
  if (category === 'legit') return 'release';
  return def.infected ? 'quarantine' : 'release';
}

/** Options offered for an entity's call (the four standard calls). */
export function callOptions(): CallOption[] {
  return CALL_OPTIONS.map((option) => ({ ...option }));
}

/**
 * Explanation shown on the case file AFTER a pick, derived from the right
 * answer rather than hand-written per entity. Pre-choice text must stay
 * neutral, so this is the only place the answer is revealed.
 */
export function callFeedback(def: EntityDef, picked: CallAction, right: boolean): string {
  const need = requiredCall(def) ?? 'release';
  const WHAT: Record<CallAction, string> = {
    quarantine: 'the evidence shows an active threat - isolate it, then clean it',
    release: 'the evidence is benign - acting on it would be a false positive',
    escalate: 'the evidence is suspicious but unresolved - hand it to incident response',
    patch: 'the finding is a confirmed vulnerability - remediate it with the patch tool',
  };
  if (right) return `Right call: ${WHAT[need]}.`;
  const ACTED: Record<CallAction, string> = {
    quarantine: 'You quarantined something that call did not cover',
    release: 'You left it in place',
    escalate: 'You escalated instead of acting on it',
    patch: 'You patched instead of addressing the finding',
  };
  return `Wrong call. ${ACTED[picked]}, but ${WHAT[need]}. Pick the right call before acting.`;
}
