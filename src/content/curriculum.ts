import { DOMAINS, OBJECTIVES, objectiveById } from './objectives';

/**
 * CURRICULUM: the SY0-701 mission arc (rookie -> expert).
 *
 * Which mission teaches which objectives, in which order, and HOW: every
 * objective slot names the mechanic that teaches it. `win` mechanics are
 * actions the player must perform correctly to win the mission. That is the
 * contract the LEVELS piece builds maps against. `evidence` mechanics are
 * taught through in-world inspect text the player has to read and reason
 * about. `quiz` mechanics are assessed in the debrief knowledge check.
 *
 * Every "Given a scenario" objective must be backed by at least one `win`
 * mechanic somewhere in the arc. Over the full arc every one of the 28
 * objectives is taught, and each domain's share of mechanics + questions
 * stays within 5 percentage points of its exam weight (tests/curriculum.test.ts).
 */
export type MechanicKind = 'win' | 'evidence' | 'quiz';

export interface ArcObjective {
  id: string;
  kind: MechanicKind;
  /** Concrete description of what the player does / reads for this objective. */
  mechanic: string;
}

export interface ArcMission {
  id: string;
  title: string;
  /** 1-10, non-decreasing along the arc. */
  difficulty: number;
  /** Primary objectives with their teaching mechanic, most important first. */
  objectives: ArcObjective[];
  /** Player-facing situation for the briefing (no instructions: the player decides). */
  briefing: string;
  built: boolean;
}

const w = (id: string, mechanic: string): ArcObjective => ({ id, kind: 'win', mechanic });
const ev = (id: string, mechanic: string): ArcObjective => ({ id, kind: 'evidence', mechanic });
const qz = (id: string, mechanic: string): ArcObjective => ({ id, kind: 'quiz', mechanic });

export const ARC: ArcMission[] = [
  {
    id: 'm01', title: 'PATCH TUESDAY', difficulty: 1, built: true,
    briefing: 'Three workstations are misbehaving and a USB stick turned up in the corridor.',
    objectives: [
      w('2.4', 'Inspect every workstation, including noisy PRN-02, before acting; a host only counts as cleaned once inspected. Scanning or flagging a clean host is a scored false positive.'),
      w('2.2', 'A found removable device lies on the route; plugging it into the unlocked spare PC triggers the removable-device vector and fails the mission.'),
      w('2.5', 'Deploy endpoint protection to every infected host: each scan session is one boot of the write-protected media, so wasted scans matter.'),
      qz('3.4', 'Debrief: recover WS-07 from offline backups vs replication vs paying the ransom.'),
      w('5.6', 'Carry the found removable device to the Security Desk and report it (Keyboard): +50 and the IT OPS role needed to reach the server room.'),
    ],
  },
  {
    id: 'm02', title: 'NEED TO KNOW', difficulty: 3, built: true,
    briefing: 'New floor, ANALYST badge. Rumor says the sysadmins share one admin password.',
    objectives: [
      w('4.6', 'RBAC doors: badge only doors your ANALYST role covers; badging the ADMIN door is a logged least-privilege violation.'),
      ev('1.2', 'Inspect evidence shows logs that only ever say "admin": the player must recognize the accounting / non-repudiation failure.'),
      w('5.6', 'Find the person offering shared credentials and report it at the security console (official reporting channel) to win.'),
    ],
  },
  {
    id: 'm03', title: 'THE QUIET ONE', difficulty: 6, built: true,
    briefing: 'A DLP alert fired overnight: confidential designs left the network using valid credentials.',
    objectives: [
      w('4.9', 'Read each employee\u2019s raw log evidence (badge, file server, endpoint, app logs) and identify the one whose sources corroborate.'),
      w('2.1', 'Report the insider, not the nervous intern or the late-working developer; a false accusation fails the mission.'),
      ev('2.4', 'Evidence uses exam indicators: out-of-cycle logging, bulk access outside the role baseline, USB mass-storage writes.'),
      qz('3.3', 'Debrief: classify the stolen designs (intellectual property / trade secret, confidential) vs regulated data.'),
      w('4.8', 'File the report through the security console (IR channel) instead of confronting the suspect.'),
    ],
  },
  {
    id: 'm04', title: 'HOOK, LINE & SINKER', difficulty: 6, built: true,
    briefing: 'The reported-phishing queue is overflowing and finance just got an "urgent" wire request from the CEO.',
    objectives: [
      w('5.6', 'Mailroom triage: inspect each message terminal and QUARANTINE phish / BEC / typosquats or RELEASE legitimate mail; a wrong call costs integrity, and the queue must be cleared to exit.'),
      ev('2.2', 'Messages demonstrate message-based vectors: BEC, brand impersonation, typosquatting (micros0ft-support.com), smishing.'),
      w('4.5', 'Gateway console: enable SPF + DKIM + DMARC p=reject; until enforced, spoofed-domain mail keeps spawning.'),
      w('2.4', 'Sign-in log console: find the mailbox showing impossible travel + concurrent session usage and lock it.'),
    ],
  },
  {
    id: 'm05', title: 'CHANGE FREEZE', difficulty: 6, built: true,
    briefing: 'A critical patch has to land on the payroll server tonight, and the change board meets in ten minutes.',
    objectives: [
      w('1.3', 'Collect impact analysis, backout plan and owner approval before the maintenance window; patching without them reverts the server and fails the mission.'),
      w('1.1', 'Control gaps: fix each gap terminal with the right control type (preventive, detective, corrective, deterrent, compensating, directive).'),
      ev('4.3', 'The scan report includes false positives the player must confirm before choosing what to patch.'),
      qz('5.1', 'Debrief: policy vs standard vs procedure vs guideline.'),
    ],
  },
  {
    id: 'm06', title: 'KEYMASTER', difficulty: 7, built: true,
    briefing: 'The crypto vaults are failing their audit: plaintext passwords, an expired certificate, and a leaked private key.',
    objectives: [
      w('1.4', 'Inspect all three certificates and install only the trusted, unexpired chain. Confirm the leaked key by fingerprint; revoke it before generating a new HSM key pair. Wrong choices score; passwords use salted bcrypt, not AES or Base64.'),
      w('3.3', 'Tokenize card numbers before export and encrypt backups at rest; both controls and the audit are required before the exit unlocks.'),
      w('4.6', 'Enter the vault with its authorized role and badge-plus-fingerprint MFA; password plus security question is still one factor type.'),
    ],
  },
  {
    id: 'm07', title: 'SEGMENT FAULT', difficulty: 7, built: true,
    briefing: 'The plant network is flat: web server, database, admin PCs and a 20-year-old SCADA controller all on one subnet.',
    objectives: [
      w('3.2', 'Place appliances: firewall between zones, IPS inline (not on a tap) in front of the DB, and a jump server as the only admin path.'),
      w('3.1', 'Isolate the unpatchable ICS/SCADA controller in its own zone (air gap or strict segmentation).'),
      w('4.5', 'Write the firewall rule set: specific allows (443 to the screened subnet, 1433 web->DB only) with deny-all last.'),
      ev('2.3', 'Inspect devices: end-of-life firmware, default configuration, legacy OS (misconfiguration, hardware vulnerabilities).'),
    ],
  },
  {
    id: 'm08', title: 'ZERO DAY', difficulty: 8, built: true,
    briefing: 'Exploit chatter on a threat feed names your stack. You have until the next shift to close the holes.',
    objectives: [
      w('2.3', 'Classify each server\u2019s flaw from raw WAF log, crash dump, page source and changelog evidence; remediation is refused until every flagged server is analyzed.'),
      w('4.3', 'Remediate by exposure and active exploitation rather than raw CVSS; out-of-order changes are refused and scored, patching the false positive is scored, and a rescan gates the exit.'),
      w('4.1', 'Disable unneeded services and enforce code-signed deploys; deploying the unsigned forum hotfix fails the mission.'),
    ],
  },
  {
    id: 'm09', title: 'LOCKED OUT', difficulty: 8, built: true,
    briefing: 'Ransomware is encrypting the finance VLAN right now. The CFO wants payroll back by morning.',
    objectives: [
      w('4.8', 'Run incident response in order: contain (isolate the VLAN) -> eradicate -> recover; out-of-order actions reinfect hosts. Bag evidence with chain of custody.'),
      w('3.4', 'Recover from offline backups (replicated shares are encrypted too) and bring payroll up at the hot site within RTO.'),
      w('4.9', 'Use firewall / NetFlow logs to find patient zero and the C2 address.'),
    ],
  },
  {
    id: 'm10', title: 'THIRD PARTY', difficulty: 9, built: true,
    briefing: 'A new SaaS vendor wants remote access to production next week. Their sales rep is very persuasive.',
    objectives: [
      w('5.3', 'Vendor assessment: demand the questionnaire, right-to-audit clause and independent assessment; choose the correct agreement (SLA, NDA, MSA, SOW).'),
      w('5.2', 'Risk desk: compute SLE / ALE and pick a strategy (mitigate, transfer, accept, avoid) that fits the stated risk appetite.'),
      ev('2.2', 'A compromised MSP pushes a malicious update: supply-chain vector.'),
      qz('3.1', 'Debrief: shared-responsibility matrix for SaaS vs IaaS.'),
    ],
  },
  {
    id: 'm11', title: 'AUDIT NIGHT', difficulty: 9, built: true,
    briefing: 'External auditors arrive at 08:00. The asset inventory is a spreadsheet nobody has opened since 2021.',
    objectives: [
      w('4.2', 'Reconcile the asset inventory, then sanitize or destroy decommissioned drives and collect certificates of destruction.'),
      w('5.4', 'Answer data-subject requests (right to be forgotten vs retention obligations) and produce attestation evidence.'),
      ev('5.5', 'Auditor NPCs: internal vs external audit, known vs unknown environment penetration test.'),
      qz('5.1', 'Debrief: data owner vs custodian vs controller vs processor.'),
    ],
  },
  {
    id: 'm12', title: 'ROBO SOC', difficulty: 10, built: true,
    briefing: 'Alert volume tripled. Leadership wants the SOC automated by Friday, and the attackers know it.',
    objectives: [
      w('4.7', 'Build the SOAR playbook: auto-ticket and auto-contain with guard rails (human approval for privileged accounts); no single point of failure.'),
      w('4.4', 'Tune SIEM alerts: cut false positives without suppressing true positives (password spraying must still fire).'),
      w('3.2', 'Set each automated control\u2019s failure mode: fail-closed for the payment segment, fail-open where safety requires it.'),
      ev('2.5', 'Automation pushes config enforcement and an application allow list to every kiosk.'),
    ],
  },
];

export function arcIndex(missionId: string): number {
  return ARC.findIndex((m) => m.id === missionId);
}

export function arcObjectiveIds(m: ArcMission): string[] {
  return m.objectives.map((o) => o.id);
}

export function playableCoverage(): {
  objectives: string[];
  winBacked: string[];
  total: number;
  builtMissions: number;
  arcMissions: number;
} {
  const built = ARC.filter((mission) => mission.built);
  const objectives = [...new Set(built.flatMap((mission) => arcObjectiveIds(mission)))].sort();
  const winBacked = [...new Set(
    built.flatMap((mission) =>
      mission.objectives
        .filter((objective) => objective.kind === 'win')
        .map((objective) => objective.id),
    ),
  )].sort();
  return {
    objectives,
    winBacked,
    total: OBJECTIVES.length,
    builtMissions: built.length,
    arcMissions: ARC.length,
  };
}

export function playableCoverageLine(): string {
  const coverage = playableCoverage();
  const objectiveCount = coverage.objectives.length;
  const percentage = Math.round((objectiveCount / coverage.total) * 100);
  return `PLAYABLE NOW: ${coverage.builtMissions}/${coverage.arcMissions} MISSIONS · ${objectiveCount}/${coverage.total} OBJECTIVES (${percentage}%) · ${coverage.winBacked.length} WIN-BACKED`;
}

/**
 * Share (%) of teaching weight per domain across the whole arc: each arc
 * mechanic slot counts 1, and each knowledge-check question counts 1, split
 * evenly across the objectives it assesses.
 */
export function coverageShare(questions: { objectives: string[] }[]): Record<number, number> {
  const tally: Record<number, number> = {};
  let total = 0;
  const add = (id: string, wgt: number) => {
    const d = objectiveById(id)?.domain;
    if (!d) return;
    tally[d] = (tally[d] ?? 0) + wgt;
    total += wgt;
  };
  for (const m of ARC) for (const o of m.objectives) add(o.id, 1);
  for (const q of questions) for (const id of q.objectives) add(id, 1 / q.objectives.length);
  const out: Record<number, number> = {};
  for (const d of DOMAINS) out[d.domain] = Math.round(((tally[d.domain] ?? 0) / total) * 1000) / 10;
  return out;
}

/** Teaching data attached to each mission (briefing dossier + after-action lessons). */
export interface MissionTeaching {
  /** One-line mission pitch shown on the briefing page. */
  tagline: string;
  /** Short "situation" paragraph shown first in the briefing. */
  situation: string;
  /** Step-by-step "what you must do", each tied to the concept it applies. */
  orders: { text: string; objective: string }[];
  /** Glossary keys shown as key terms in briefing and debrief. */
  keyTerms: string[];
  /**
   * After-action lessons per MissionObjective id: what the outcome means.
   * `done` is shown when the objective was met, `missed` when failed/incomplete.
   */
  lessons: Record<string, { objective: string; done: string; missed: string }>;
  /** One exam-day takeaway. */
  examTip: string;
}

export function letterGrade(pct: number): string {
  return pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
}

export function gradeMission(o: {
  fieldPct: number;
  quizPct: number;
  won: boolean;
  falsePositives: number;
}): { field: number; total: number; grade: string; capped: 'fail' | 'false-positive' | null } {
  const field = o.falsePositives > 0 ? Math.min(o.fieldPct, 89) : o.fieldPct;
  let total = Math.round(field * 0.5 + o.quizPct * 0.5);
  let capped: 'fail' | 'false-positive' | null = null;
  if (!o.won) {
    total = Math.min(total, 59);
    capped = 'fail';
  } else if (o.falsePositives > 0) {
    total = Math.min(total, 89);
    capped = 'false-positive';
  }
  return { field, total, grade: letterGrade(total), capped };
}

// ---------- learner mastery (persisted locally) ----------

const STORE_KEY = 'cyberdoom.mastery.v1';

/** objective id -> quiz answers and field demonstrations. */
export type Mastery = Record<string, { right: number; wrong: number; field?: number }>;

export function loadMastery(): Mastery {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Mastery) : {};
  } catch {
    return {};
  }
}

export function recordAnswer(m: Mastery, objectiveIds: string[], correct: boolean): Mastery {
  for (const id of objectiveIds) {
    const e = (m[id] ??= { right: 0, wrong: 0 });
    if (correct) e.right++;
    else e.wrong++;
  }
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — mastery is session-only */
  }
  return m;
}

export function recordField(m: Mastery, objectiveIds: string[]): Mastery {
  for (const id of objectiveIds) {
    if (!objectiveById(id)) continue;
    const e = (m[id] ??= { right: 0, wrong: 0 });
    e.field = (e.field ?? 0) + 1;
  }
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — mastery is session-only */
  }
  return m;
}

/** An objective counts as demonstrated once answered right or demonstrated in the field. */
export function isDemonstrated(m: Mastery, id: string): boolean {
  const e = m[id];
  return !!e && ((e.field ?? 0) > 0 || (e.right > 0 && e.right >= e.wrong));
}

/**
 * Exam-weighted readiness: each domain contributes its exam weight times the
 * fraction of its objectives demonstrated.
 */
export function readiness(m: Mastery): { overall: number; byDomain: { domain: number; title: string; weight: number; demonstrated: number; total: number }[] } {
  const byDomain = DOMAINS.map((d) => {
    const objs = OBJECTIVES.filter((o) => o.domain === d.domain);
    const demonstrated = objs.filter((o) => isDemonstrated(m, o.id)).length;
    return { domain: d.domain, title: d.title, weight: d.weight, demonstrated, total: objs.length };
  });
  const overall = byDomain.reduce((s, d) => s + (d.weight * d.demonstrated) / d.total, 0);
  return { overall: Math.round(overall), byDomain };
}
