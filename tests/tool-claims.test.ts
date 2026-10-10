import { describe, expect, it } from 'vitest';
import { missionRegistry, teachingRegistry } from '../src/content/missions';
import { ARC_QUESTIONS } from '../src/content/arc-questions';
import { toolRegistry } from '../src/tools';
import type { Mission } from '../src/core/types';

/**
 * Tool/key accuracy audit: every player-facing string that tells the player
 * what a tool or key does must agree with what the tool actually does.
 *
 * Ground truth (from src/tools/* and the interact handler):
 *   - KEYBOARD (1): kills malware processes point-blank, runs commands on
 *     consoles/devices. REFUSES people — it cannot mark a suspect.
 *   - MOUSE (2): inspects; second click flags a NON-person as malicious.
 *     REFUSES people — suspects are not triaged.
 *   - USB SCANNER (3): cleans/quarantines infected hosts and malware.
 *   - BADGE (4): presents your credential at badge readers.
 *   - NETWORK TAP (5): passively copies traffic — cannot block.
 *   - EDR CONSOLE (6): containment pulse — kills processes in a burst.
 *   - MFA TOKEN (7): second factor at MFA readers.
 *   - PATCH DISK (8): remediates confirmed vulnerabilities.
 *   - E (interact): opens doors, uses consoles, hands over items,
 *     MARKS A SUSPECT (the only way to mark), manual cleanup.
 * Update these tables when a tool's real behavior changes.
 */

interface Claim {
  /** Which registry tool a name refers to in player text. */
  tool: string;
  name: RegExp;
  /** Action verbs this tool cannot perform (checked un-negated, per sentence). */
  cannot: RegExp;
}

const CLAIMS: Claim[] = [
  { tool: 'keyboard', name: /\bkeyboards?\b/i, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|scans?|cleans?|quarantin\w*|blocks?)\b/i },
  { tool: 'mouse', name: /\bmouse\b/i, cannot: /\b(marks?|accus\w*|suspects?|cleans?|quarantin\w*|patch\w*|blocks?|swipes?|badges?|operates?)\b/i },
  { tool: 'usb', name: /\busb scanner\b|\bscanner stick\b/i, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|patch\w*|blocks?|swipes?|badges?)\b/i },
  { tool: 'badge', name: /\bBADGE\b/, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|scans?|cleans?|quarantin\w*|patch\w*|blocks?)\b/i },
  { tool: 'tap', name: /\bTAP\b/, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|cleans?|quarantin\w*|patch\w*|blocks?)\b/i },
  { tool: 'edr', name: /\bEDR\b/, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|patch\w*)\b/i },
  { tool: 'mfa', name: /\bMFA\b|\bTOKENS?\b/, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|scans?|cleans?|quarantin\w*|patch\w*|blocks?)\b/i },
  { tool: 'patch', name: /\bPATCH\b/, cannot: /\b(flags?|marks?|accus\w*|suspects?|inspects?|scans?|blocks?|swipes?|badges?)\b/i },
];

/** Names as printed next to a slot number in player text -> registry id. */
const SLOT_NAMES: [RegExp, string][] = [
  [/KEYBOARD/i, 'keyboard'],
  [/MOUSE/i, 'mouse'],
  [/USB SCANNER/i, 'usb'],
  [/SCANNER/i, 'usb'],
  [/BADGE/i, 'badge'],
  [/NETWORK TAP/i, 'tap'],
  [/TAP/i, 'tap'],
  [/EDR/i, 'edr'],
  [/MFA TOKEN/i, 'mfa'],
  [/MFA/i, 'mfa'],
  [/TOKEN/i, 'mfa'],
  [/PATCH DISK/i, 'patch'],
  [/PATCH/i, 'patch'],
];

/** People nouns — marking these is E's job and no tool's. */
const PERSON = /\b(person|people|suspect|suspects|employee|employees|insider|colleague|rep\b|someone|culprit|staff|worker|npc|npcs|intern|sysadmin|analyst|developer)\b/i;
const MARK_VERB = /\b(flags?|marks?|accus\w*)\b/i;
/** What E/interact cannot do (mouse inspects; scanners scan). */
const E_KEY = /(?:press|hit|push|use|key|with|\(|\[)\s*E\b/i;
const E_CANNOT = /\b(inspects?|scans?)\b/i;
const NEGATOR = /\b(can'?t|cannot|can not|never|not|won'?t|don'?t|doesn'?t|no\b|without|refuse[sd]?|instead|fail\w*)\b/i;

function sentences(text: string): string[] {
  return text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
}

/** An action verb counts as a claim only when it is not negated nearby. */
function claimed(sentence: string, verb: RegExp): boolean {
  const m = sentence.match(verb);
  if (!m || m.index === undefined) return false;
  const before = sentence.slice(Math.max(0, m.index - 26), m.index);
  return !NEGATOR.test(before);
}

interface Row { where: string; text: string }
function collect(): Row[] {
  const rows: Row[] = [];
  const push = (where: string, text: unknown) => {
    if (typeof text === 'string' && text.trim()) rows.push({ where, text });
  };
  for (const m of missionRegistry.all() as Mission[]) {
    push(`${m.id}.briefing`, m.briefing);
    for (const o of m.missionObjectives) push(`${m.id}.objective.${o.id}`, o.text);
    for (const cell of Object.values(m.map.legend ?? {})) {
      push(`${m.id}.lockText`, (cell as { lockText?: string }).lockText);
    }
    for (const e of m.entities) {
      push(`${m.id}.${e.id}.label`, e.inspect?.label);
      push(`${m.id}.${e.id}.detail`, e.inspect?.detail);
      push(`${m.id}.${e.id}.flags`, (e.inspect?.flags ?? []).join(' | '));
      push(`${m.id}.${e.id}.log`, e.log);
    }
    for (const q of m.debriefQuestions) {
      push(`${m.id}.q.${q.id}.prompt`, q.prompt);
      for (const o of q.options) {
        push(`${m.id}.q.${q.id}.opt`, o.text);
        push(`${m.id}.q.${q.id}.expl`, o.explanation);
      }
    }
    for (const t of m.script?.triggers ?? []) push(`${m.id}.trigger.${t.id}`, t.message);
    for (const s of m.script?.secrets ?? []) push(`${m.id}.secret.${s.id}`, s.label);
    push(`${m.id}.outbreak`, m.script?.outbreak?.message);
    const teach = teachingRegistry.get(m.id);
    if (teach) {
      push(`${m.id}.tagline`, teach.tagline);
      push(`${m.id}.situation`, teach.situation);
      teach.orders.forEach((o, i) => push(`${m.id}.orders.${i}`, o.text));
      for (const [k, l] of Object.entries(teach.lessons)) {
        push(`${m.id}.${k}.done`, l.done);
        push(`${m.id}.${k}.missed`, l.missed);
      }
      push(`${m.id}.examTip`, teach.examTip);
    }
  }
  for (const q of Object.values(ARC_QUESTIONS).flat()) {
    push(`arcq.${q.id}.prompt`, q.prompt);
    for (const o of q.options) {
      push(`arcq.${q.id}.opt`, o.text);
      push(`arcq.${q.id}.expl`, o.explanation);
    }
  }
  return rows;
}

describe('tool/key claims in player-facing text', () => {
  const rows = collect();

  it('slot numbers next to tool names match the real keybinds', () => {
    const violations: string[] = [];
    for (const { where, text } of rows) {
      for (const [nameRe, toolId] of SLOT_NAMES) {
        const re = new RegExp(`\\b${nameRe.source}\\b\\s*[\\(\\[]\\s*(\\d)\\s*[\\)\\]]`, 'gi');
        for (const m of text.matchAll(re)) {
          const tool = toolRegistry.get(toolId);
          const claimedSlot = Number(m[1]);
          if (tool && claimedSlot !== tool.slot) {
            violations.push(`${where}: "${m[0]}" — ${tool.name} is on slot ${tool.slot}, not ${claimedSlot}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no text claims a tool marks/flags/accuses a person (that is E interact)', () => {
    const violations: string[] = [];
    for (const { where, text } of rows) {
      for (const sentence of sentences(text)) {
        if (!MARK_VERB.test(sentence) || !PERSON.test(sentence)) continue;
        for (const { tool, name } of CLAIMS) {
          if (name.test(sentence)) {
            violations.push(`${where}: "${sentence.trim()}" claims ${tool} marks/flags/accuses a person`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no text claims a tool does something it cannot do', () => {
    // A verb is attributed to a tool only when it follows the tool's name in
    // the same clause and before any other tool name — that is how "TOOL (n)
    // verbs" kit lists read. Verbs before the name ("mark them with X") are
    // covered by the person-marking rule above.
    const violations: string[] = [];
    for (const { where, text } of rows) {
      for (const sentence of sentences(text)) {
        for (const clause of sentence.split(/[,;:!]/)) {
          const marks: { tool: string; cannot: RegExp; end: number }[] = [];
          for (const { tool, name, cannot } of CLAIMS) {
            for (const m of clause.matchAll(new RegExp(name.source, name.flags + 'g'))) {
              marks.push({ tool, cannot, end: (m.index ?? 0) + m[0].length });
            }
          }
          marks.sort((a, b) => a.end - b.end);
          for (const [i, mark] of marks.entries()) {
            const window = clause.slice(mark.end, marks[i + 1]?.end ?? clause.length);
            const verb = window.match(mark.cannot)?.[0];
            if (verb && claimed(window, mark.cannot)) {
              violations.push(`${where}: "${clause.trim()}" claims ${mark.tool} can "${verb}"`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no text claims the E key inspects/scans/flags (those belong to tools)', () => {
    const violations: string[] = [];
    for (const { where, text } of rows) {
      for (const sentence of sentences(text)) {
        for (const m of sentence.matchAll(new RegExp(E_KEY.source, 'gi'))) {
          const window = sentence.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 30);
          if (claimed(window, E_CANNOT)) {
            violations.push(`${where}: "${sentence.trim()}" claims E ${window.match(E_CANNOT)?.[0]}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
