import type { Bindings } from './controlsHelp';
import { primaryKey } from './controlsHelp';

/**
 * Evidence log copy and the "new evidence" HUD badge (UX plan Phase F #28).
 * Pure: every key shown comes from the live bindings, so a rebind updates the
 * hint; state updates return new objects.
 */

/** Hot-bar slot of the MOUSE (triage / inspection) tool. */
const MOUSE_SLOT = 2;

/**
 * Empty-log lines: what the log is for and how to put something in it. Each
 * line fits the dossier's 276px small-font text width (tested).
 */
export function evidenceEmptyLines(bindings: Bindings): string[] {
  const use = primaryKey(bindings, 'use');
  return [
    'NO EVIDENCE LOGGED',
    '',
    `READ A WORKSTATION (${use}) OR INSPECT A`,
    `TARGET WITH THE MOUSE (${MOUSE_SLOT}) TO LOG EVIDENCE.`,
    '',
    'EACH CASE FILE YOU OPEN IS KEPT HERE.',
  ];
}

/** Ticker badge for evidence the player has not opened yet: 'LOG +1 [L]'. */
export function evidenceLogBadge(unread: number, bindings: Bindings): string {
  return `LOG +${Math.max(1, Math.floor(unread))} [${primaryKey(bindings, 'log')}]`;
}

export interface EvidenceUnread {
  /** Entry ids already counted (a re-read of the same file is not new). */
  readonly seen: ReadonlySet<string>;
  /** New entries that arrived without the case file being shown. */
  readonly unread: number;
}

export const EMPTY_EVIDENCE_UNREAD: EvidenceUnread = { seen: new Set(), unread: 0 };

/** Record one 'evidence' event. `shown` = the dossier displayed it right away. */
export function noteEvidence(
  state: EvidenceUnread,
  id: string,
  shown: boolean,
): { state: EvidenceUnread; isNew: boolean } {
  if (state.seen.has(id)) return { state, isNew: false };
  return {
    state: { seen: new Set([...state.seen, id]), unread: state.unread + (shown ? 0 : 1) },
    isNew: true,
  };
}

/** The log (or a case file) was opened: nothing is unread any more. */
export function markEvidenceRead(state: EvidenceUnread): EvidenceUnread {
  return state.unread === 0 ? state : { ...state, unread: 0 };
}
