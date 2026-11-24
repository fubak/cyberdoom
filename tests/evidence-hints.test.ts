import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, rebind } from '../src/engine/bindings';
import {
  EMPTY_EVIDENCE_UNREAD,
  evidenceEmptyLines,
  evidenceLogBadge,
  markEvidenceRead,
  noteEvidence,
} from '../src/ui/evidenceHints';
import { DOSSIER_TEXT_W } from '../src/ui/dossier';
import { measureText } from '../src/render/font';

describe('evidence log empty state (Phase F)', () => {
  it('tells the player how to produce entries with the live keys', () => {
    const text = evidenceEmptyLines(DEFAULT_BINDINGS).join(' ');
    expect(text).toContain('NO EVIDENCE LOGGED');
    expect(text).toContain('(E)');
    expect(text).toMatch(/WORKSTATION/);
    expect(text).toMatch(/MOUSE \(2\)/);
    expect(text).toMatch(/LOG EVIDENCE/);
  });

  it('follows a rebind of the use key', () => {
    const bindings = rebind(DEFAULT_BINDINGS, 'use', 'KeyR');
    const text = evidenceEmptyLines(bindings).join(' ');
    expect(text).toContain('(R)');
    expect(text).not.toContain('(E)');
  });

  it('every line fits the dossier text width (nothing clipped or ellipsized)', () => {
    for (const line of evidenceEmptyLines(DEFAULT_BINDINGS)) {
      expect(measureText(line, 'small')).toBeLessThanOrEqual(DOSSIER_TEXT_W);
      expect(line).not.toContain('…');
    }
  });

  it('does not mutate the bindings it reads', () => {
    const bindings = { ...DEFAULT_BINDINGS, use: ['KeyE', 'Space'] };
    const snapshot = JSON.stringify(bindings);
    evidenceEmptyLines(bindings);
    evidenceLogBadge(2, bindings);
    expect(JSON.stringify(bindings)).toBe(snapshot);
  });
});

describe('evidence HUD badge (Phase F)', () => {
  it('formats the unread count with the live log key', () => {
    expect(evidenceLogBadge(1, DEFAULT_BINDINGS)).toBe('LOG +1 [L]');
    expect(evidenceLogBadge(3, rebind(DEFAULT_BINDINGS, 'log', 'KeyJ'))).toBe('LOG +3 [J]');
  });

  it('counts only first sightings that were not shown in the dossier', () => {
    let state = EMPTY_EVIDENCE_UNREAD;
    let r = noteEvidence(state, 'ws1:inspect', false);
    expect(r.isNew).toBe(true);
    expect(r.state.unread).toBe(1);
    state = r.state;
    // a re-read of the same entry is not new evidence
    r = noteEvidence(state, 'ws1:inspect', false);
    expect(r.isNew).toBe(false);
    expect(r.state.unread).toBe(1);
    // a new entry shown straight in the dossier is new but already read
    r = noteEvidence(r.state, 'ws2:inspect', true);
    expect(r.isNew).toBe(true);
    expect(r.state.unread).toBe(1);
    r = noteEvidence(r.state, 'ws3:inspect', false);
    expect(r.state.unread).toBe(2);
    expect(markEvidenceRead(r.state).unread).toBe(0);
    expect(markEvidenceRead(r.state).seen.has('ws3:inspect')).toBe(true);
  });

  it('never mutates the previous state', () => {
    const before = EMPTY_EVIDENCE_UNREAD;
    const after = noteEvidence(before, 'a', false).state;
    expect(before.unread).toBe(0);
    expect(before.seen.size).toBe(0);
    expect(after.seen.has('a')).toBe(true);
    const read = markEvidenceRead(after);
    expect(after.unread).toBe(1);
    expect(read).not.toBe(after);
    // reading an already-read state returns it unchanged
    expect(markEvidenceRead(read)).toBe(read);
  });
});
