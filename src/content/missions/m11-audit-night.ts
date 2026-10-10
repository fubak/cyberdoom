import type { Mission } from '../../core/types';
import { lightRects } from '../../missions/levelkit';
import type { WalkStep } from '../../missions/walkthroughs';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import { addThreatEncounter, mixedThreatEncounter, floorSpot, liveThreats, retex } from './campaign-map';

/**
 * M11 "Audit Night": reconcile a stale asset inventory, dispose of retired
 * media correctly, answer data-subject requests, set a pen-test scope, and
 * sign the attestation before the external auditors arrive at 08:00.
 * Difficulty 11.
 *
 * Critical path, three gates:
 *   1. SERVER FLOOR (analyst badge): physically sweep every asset, then
 *      reconcile the register. Disposal consoles refuse until this is done.
 *   2. MEDIA VAULT (AUDIT role from sign-in, badge + MFA): each retired
 *      drive is a grouped pick — the correct sanitization/destruction for
 *      its media type and data sensitivity, logged with a certificate.
 *      Shredding the legal-hold drive or deleting a held mailbox FAILS.
 *   3. EXIT opens only after the attestation is signed — which requires
 *      reconcile + dispose + all three DSRs + the scope decision.
 *
 * Wrong choices are scored, not hidden: format/delete on flash, degauss on
 * an SSD, dumpstered tape, donated unknown media, "trust us" emails, and
 * over-sharing pen-test scope all read as 'bad-choice' in the case file.
 * A dormant LOGIC BOMB in the vault (set to detonate during the audit)
 * plus RATs calling home from the found shadow assets provide the combat.
 * Secrets: vault supply closet, server-floor parts cage.
 */
export const m11: Mission = {
  id: 'm11',
  title: 'AUDIT NIGHT',
  difficulty: 11,
  objectives: ['4.2', '5.4', '5.5', '5.1'],
  briefing:
    'External auditors walk in at 08:00 and the asset register has not been touched since 2021. ' +
    'Sweep the floor, reconcile the inventory, dispose of the retired drives the right way, clear ' +
    'the data-subject queue and set the pen-test scope — then sign the attestation. ' +
    'Your kit: MOUSE (2) inspects, KEYBOARD (1) operates consoles, USB SCANNER (3) cleans malware, ' +
    'BADGE (4) opens doors your role covers, TOKEN (7) is the media vault\u2019s second factor.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'mfa'],
  map: {
    grid: [
    '##############################################',
    '##############################################',
    '##................####................########',
    '##................####................########',
    '##BBBB............####................########',
    '##..B.............####..SSS..SSS..SSSS########',
    '##..1.............####................########',
    '##..B.............####................########',
    '##BBBBB.SSS.SSS...####..SSS..SSS..SSSS########',
    '##................####.............S..########',
    '##................####.............2..########',
    '##................####.............SSS########',
    '########V#####################D###############',
    '##....................................##....##',
    '##....................................##....##',
    '##....................................T.....##',
    '##...........SS..........SS...........#####.##',
    '##....................................##....##',
    '##...........SS..........SS...........##....##',
    '##....................................##....##',
    '#######.###############X################.#####',
    '##...........#######........############....##',
    '##...........#######........############....##',
    '##...........#######...E....############....##',
    '##...........#######........#############4####',
    '##...........#######........############...###',
    '##...........#######........############...###',
    '##############################################',
  ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      S: { kind: 'wall', tex: 'wall-server' },
      B: { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      D: { kind: 'door', tex: 'door', doorId: 'server-floor', accessRole: 'analyst' },
      V: { kind: 'door', tex: 'door', doorId: 'media-vault', accessRole: 'audit', mfa: true },
      X: {
        kind: 'door',
        tex: 'door',
        doorId: 'exit',
        locked: true,
        lockText: 'Exit opens once the attestation is signed and filed.',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-vault', secret: true },
      '2': { kind: 'door', tex: 'wall-server', doorId: 'secret-cage', secret: true },
      E: { kind: 'exit', tex: 'exit' },
    },
    spawn: { x: 20.5, y: 17.5, angle: 0.785 },
    defaultLight: 0.6,
    lights: lightRects([
      [2, 13, 37, 19, 0.7],
      [2, 2, 17, 11, 0.5],
      [22, 2, 37, 11, 0.5],
      [20, 21, 27, 26, 0.85],
      [2, 21, 13, 26, 0.75],
      [2, 4, 4, 8, 0.35],
      [35, 8, 37, 10, 0.35],
    ]),
  },
  entities: [
    // --- War room: inventory, sign-in, attestation ---
    {
      id: 'inv-console', kind: 'console', x: 6.5, y: 18.5, sprite: 'workstation',
      tags: ['inv-load'],
      inspect: {
        label: 'Asset register (XLS)',
        detail: 'The inventory of record: 12 registered assets with owners and locations — last saved 2021-04-02. Anything on the floor not in this file is an unmanaged shadow asset; anything in the file but missing is a loss to report.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'ASSET REGISTER — last saved 2021-04-02\n' +
        'DB-03  database server   SRV-FLOOR  owner: DBA team\n' +
        'FIN-01 workstation       FINANCE     owner: K. Marsh\n' +
        'MAIL-02 relay            SRV-FLOOR  owner: IT ops\n' +
        'PRN-07 label printer     SRV-FLOOR  owner: shipping\n' +
        'NAS-09 archive shelf     DECOMMISSIONED 2019\n' +
        'LT-118 laptop + dock     ASSIGNED    K. Marsh\n' +
        '(+ 6 more rows)\n' +
        'Stale register: verify every row against the floor.',
    },
    {
      id: 'audit-signin', kind: 'console', x: 10.5, y: 18.5, sprite: 'console',
      tags: ['signin'],
      grants: { resource: 'role:audit', amount: 1 },
      inspect: {
        label: 'Audit sign-in desk',
        detail: 'Escorted-access register for the media vault. Signing in issues a time-boxed AUDIT role, logged to your badge — least privilege for the night.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'Signed in: AUDIT role granted until 08:00. Media-vault reader now accepts your badge + token.',
    },
    {
      id: 'attest-console', kind: 'console', x: 29.5, y: 18.5, sprite: 'console',
      tags: ['attest'],
      inspect: {
        label: 'Attestation binder',
        detail: 'The formal statement of compliance the external exam samples: signed assertions backed by the night\u2019s evidence. Sign only when the work is real — attestation is non-repudiation.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'ATTESTATION ISSUED\n' +
        '- Asset inventory reconciled; discrepancies resolved\n' +
        '- Media dispositions logged with certificates of destruction\n' +
        '- Legal-hold data preserved under LIT-88\n' +
        '- Data-subject requests answered and filed\n' +
        '- Pen-test scope issued (unknown environment)\n' +
        'Signed: control owner, 06:12.',
    },
    // --- War room: the three data-subject requests ---
    {
      id: 'dsr1-case', kind: 'console', x: 4.5, y: 13.5, sprite: 'console',
      inspect: {
        label: 'DSR-4421: erasure request',
        detail: 'EU customer: "erase all personal data you hold on me." On file: account profile, marketing history, support tickets — and 7 years of invoices that tax law requires you to keep.',
        category: 'legit', objectives: ['5.4'],
      },
    },
    {
      id: 'dsr1-wipe', kind: 'console', x: 3.5, y: 14.5, sprite: 'console', group: 'dsr1',
      tags: ['wrong'],
      inspect: {
        label: 'Erase EVERYTHING, invoices included',
        detail: 'Deletes the account, the PII and the financial records in one pass.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'You deleted the account, the PII — and the tax invoices. Tax law requires those records: destroying them is a compliance violation. The right to be forgotten does not override legal retention obligations.',
    },
    {
      id: 'dsr1-right', kind: 'console', x: 5.5, y: 14.5, sprite: 'console', group: 'dsr1',
      tags: ['dsr'],
      inspect: {
        label: 'Erase PII; retain legal minimums',
        detail: 'Erases personal data but keeps what the retention schedule legally requires.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'Profile, marketing history and support tickets erased. Invoices retained under the tax retention schedule with the legal basis recorded. Erasure certificate sent to the data subject.',
    },
    {
      id: 'dsr2-case', kind: 'console', x: 11.5, y: 13.5, sprite: 'console',
      inspect: {
        label: 'DSR-4422: deletion request',
        detail: 'Former employee K. Marsh asks for their mailbox and files to be deleted. Litigation hold LIT-88 is active on that mailbox for the contract suit — counsel must approve any deletion.',
        category: 'legit', objectives: ['5.4'],
      },
    },
    {
      id: 'dsr2-delete', kind: 'console', x: 10.5, y: 14.5, sprite: 'console', group: 'dsr2',
      tags: ['spoliation'],
      inspect: {
        label: 'Delete mailbox and files now',
        detail: 'Honors the request immediately, hold or no hold.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'Mailbox purged.',
    },
    {
      id: 'dsr2-hold', kind: 'console', x: 12.5, y: 14.5, sprite: 'console', group: 'dsr2',
      tags: ['dsr'],
      inspect: {
        label: 'Suspend DSR under legal hold',
        detail: 'Routes the request to counsel and preserves the mailbox until the hold lifts.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'Deletion suspended: legal hold LIT-88 overrides the erasure request until counsel releases it. Response documented, and the data subject was informed of the delay and its legal basis.',
    },
    {
      id: 'dsr3-case', kind: 'console', x: 15.5, y: 13.5, sprite: 'console',
      inspect: {
        label: 'DSR-4423: attestation request',
        detail: 'A business partner requires formal proof their data was handled compliantly this quarter — their vendor-management clause demands evidence, not assurances.',
        category: 'legit', objectives: ['5.4'],
      },
    },
    {
      id: 'dsr3-email', kind: 'console', x: 14.5, y: 14.5, sprite: 'console', group: 'dsr3',
      tags: ['wrong'],
      inspect: {
        label: 'Reply: "it\u2019s handled, trust us"',
        detail: 'A quick note back so the queue clears faster.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'A casual "trust us" reply went out — worth nothing to their auditors. Attestation means a formal, signed statement backed by evidence. The partner\u2019s audit team will reject this.',
    },
    {
      id: 'dsr3-attest', kind: 'console', x: 16.5, y: 14.5, sprite: 'console', group: 'dsr3',
      tags: ['dsr'],
      inspect: {
        label: 'Issue signed attestation + evidence',
        detail: 'Formal attestation signed by the control owner, backed by the processing logs.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'Formal attestation issued: signed by the control owner with the DSR and processing records attached. Non-repudiation — they can verify it, and we cannot later deny it.',
    },
    // --- War room: pen-test rules of engagement ---
    {
      id: 'scope-brief', kind: 'console', x: 26.5, y: 13.5, sprite: 'console',
      tags: ['audit-cast'],
      inspect: {
        label: 'Pen-test engagement letter',
        detail: 'The audit committee hired an outside red team to answer one question: what can an external attacker reach with no inside help? Issue the rules of engagement.',
        category: 'legit', objectives: ['5.5'],
      },
    },
    {
      id: 'scope-known', kind: 'console', x: 24.5, y: 14.5, sprite: 'console', group: 'scope-pick',
      tags: ['wrong'],
      inspect: {
        label: 'Hand over diagrams, source and credentials',
        detail: 'Full disclosure so the test finishes deep and fast.',
        category: 'legit', objectives: ['5.5'],
      },
      log: 'Full access granted — a known-environment (white-box) test. It measures a well-informed insider\u2019s reach, not the outside attacker the committee asked about.',
    },
    {
      id: 'scope-partial', kind: 'console', x: 26.5, y: 14.5, sprite: 'console', group: 'scope-pick',
      tags: ['wrong'],
      inspect: {
        label: 'Give network diagrams only',
        detail: 'Some inside knowledge, as a compromise.',
        category: 'legit', objectives: ['5.5'],
      },
      log: 'Partial disclosure — a partially known (gray-box) test simulates a semi-informed attacker. Useful depth on a budget, still not the outsider view the committee asked for.',
    },
    {
      id: 'scope-unknown', kind: 'console', x: 28.5, y: 14.5, sprite: 'console', group: 'scope-pick',
      tags: ['scope'],
      inspect: {
        label: 'No inside information — outsider\u2019s view',
        detail: 'The team starts from public information only.',
        category: 'legit', objectives: ['5.5'],
      },
      log: 'Unknown-environment (black-box) engagement issued: the red team starts from public information only, matching the external attacker the committee wants measured.',
    },
    // --- War room: the auditors themselves (5.5 evidence) ---
    {
      id: 'rosa', kind: 'npc', x: 12.5, y: 16.5, sprite: 'npc-f', ai: 'stand',
      tags: ['audit-cast'],
      inspect: {
        label: 'R. Vega — internal audit',
        detail: 'Internal audit: our own staff reviewing controls ahead of the exam. She reports to the audit committee, runs self-assessments, and gathers the evidence the external auditors will sample. Independent in function — but she works here.',
        category: 'person', objectives: ['5.5'],
      },
    },
    {
      id: 'cole', kind: 'npc', x: 20.5, y: 16.5, sprite: 'npc-suit', ai: 'stand',
      tags: ['audit-cast'],
      inspect: {
        label: 'C. Ferro — external auditor',
        detail: 'External: an independent third party engaged for the annual examination. He attests only to what he personally verifies — he cannot take direction on scope, methods or conclusions. His signature is what regulators trust.',
        category: 'person', objectives: ['5.5'],
      },
    },
    {
      id: 'iris', kind: 'npc', x: 16.5, y: 18.5, sprite: 'npc-m', ai: 'stand',
      tags: ['audit-cast'],
      inspect: {
        label: 'I. Chen — penetration test lead',
        detail: 'External red team. Her engagement letter must state the environment: known (full disclosure), partially known (some inside info), or unknown (nothing but public data). The committee asked for the outside-attacker view.',
        category: 'person', objectives: ['5.5'],
      },
    },
    // --- War room east: the governance shelf (5.1 — policy/standard/procedure/guideline) ---
    {
      id: 'gov-doc-aup', kind: 'console', x: 29.5, y: 14.5, sprite: 'console', tags: ['gov-doc'],
      inspect: {
        label: 'Acceptable Use Policy, v3',
        detail: 'Signed by the CISO, applies to every employee: "personal devices may not join the corporate WLAN." Violations are an HR matter. High-level management intent — no how-to steps.',
        category: 'legit', objectives: ['5.1'],
      },
    },
    {
      id: 'gov-pick-aup-policy', kind: 'console', x: 31.5, y: 14.5, sprite: 'console', group: 'gov-aup', tags: ['gov-file'],
      inspect: { label: 'File as: POLICY', detail: 'A mandatory, high-level statement of management intent that applies organization-wide.', category: 'legit', objectives: ['5.1'] },
      log: 'Filed as POLICY — correct: it is management\u2019s binding statement of intent for all staff.',
    },
    {
      id: 'gov-pick-aup-standard', kind: 'console', x: 33.5, y: 14.5, sprite: 'console', group: 'gov-aup', tags: ['wrong'],
      inspect: { label: 'File as: STANDARD', detail: 'A mandatory technical baseline — specific settings or values.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: a standard mandates specific technical parameters (lengths, versions, algorithms). A rules-of-conduct statement signed for all staff is a policy.',
    },
    {
      id: 'gov-pick-aup-guideline', kind: 'console', x: 35.5, y: 14.5, sprite: 'console', group: 'gov-aup', tags: ['wrong'],
      inspect: { label: 'File as: GUIDELINE', detail: 'A non-mandatory recommendation.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: guidelines suggest; this document binds. "Violations are an HR matter" is enforcement language — it is policy, not advice.',
    },
    {
      id: 'gov-doc-pw', kind: 'console', x: 29.5, y: 15.5, sprite: 'console', tags: ['gov-doc'],
      inspect: {
        label: 'Password configuration baseline',
        detail: 'Mandatory for all service accounts: 20+ characters, individual credentials in the PAM vault, rotated quarterly. A specific, required technical setting — not negotiable.',
        category: 'legit', objectives: ['5.1'],
      },
    },
    {
      id: 'gov-pick-pw-policy', kind: 'console', x: 31.5, y: 15.5, sprite: 'console', group: 'gov-pw', tags: ['wrong'],
      inspect: { label: 'File as: POLICY', detail: 'A mandatory, high-level statement of management intent.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: "20+ characters, rotated quarterly" is a required technical parameter, not a broad statement of intent — this is a standard.',
    },
    {
      id: 'gov-pick-pw-standard', kind: 'console', x: 33.5, y: 15.5, sprite: 'console', group: 'gov-pw', tags: ['gov-file'],
      inspect: { label: 'File as: STANDARD', detail: 'A mandatory technical baseline — specific settings or values.', category: 'legit', objectives: ['5.1'] },
      log: 'Filed as STANDARD — correct: it mandates concrete technical parameters for a specific system class.',
    },
    {
      id: 'gov-pick-pw-procedure', kind: 'console', x: 35.5, y: 15.5, sprite: 'console', group: 'gov-pw', tags: ['wrong'],
      inspect: { label: 'File as: PROCEDURE', detail: 'Step-by-step instructions for completing a task.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: a procedure is an ordered how-to. This document specifies required parameter values, not steps to follow — it is a standard.',
    },
    {
      id: 'gov-doc-offb', kind: 'console', x: 29.5, y: 16.5, sprite: 'console', tags: ['gov-doc'],
      inspect: {
        label: 'Offboarding runbook',
        detail: 'Steps executed on every departure: collect badge, disable accounts within 4 hours, archive the mailbox, revoke tokens, manager sign-off. An ordered checklist to perform.',
        category: 'legit', objectives: ['5.1'],
      },
    },
    {
      id: 'gov-pick-offb-policy', kind: 'console', x: 31.5, y: 16.5, sprite: 'console', group: 'gov-offb', tags: ['wrong'],
      inspect: { label: 'File as: POLICY', detail: 'A mandatory, high-level statement of management intent.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: this is an ordered set of steps to execute, not a statement of intent — it is a procedure.',
    },
    {
      id: 'gov-pick-offb-standard', kind: 'console', x: 33.5, y: 16.5, sprite: 'console', group: 'gov-offb', tags: ['wrong'],
      inspect: { label: 'File as: STANDARD', detail: 'A mandatory technical baseline — specific settings or values.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: standards fix required values, not sequences of actions. A departure checklist is a procedure.',
    },
    {
      id: 'gov-pick-offb-procedure', kind: 'console', x: 35.5, y: 16.5, sprite: 'console', group: 'gov-offb', tags: ['gov-file'],
      inspect: { label: 'File as: PROCEDURE', detail: 'Step-by-step instructions for completing a task.', category: 'legit', objectives: ['5.1'] },
      log: 'Filed as PROCEDURE — correct: it is the ordered, repeatable checklist staff actually execute.',
    },
    {
      id: 'gov-doc-desk', kind: 'console', x: 29.5, y: 17.5, sprite: 'console', tags: ['gov-doc'],
      inspect: {
        label: 'Clean-desk awareness tips',
        detail: 'From the awareness team: "consider locking your screen when away and stowing papers in a drawer." Suggestions only — nothing here is required or enforced.',
        category: 'legit', objectives: ['5.1'],
      },
    },
    {
      id: 'gov-pick-desk-policy', kind: 'console', x: 31.5, y: 17.5, sprite: 'console', group: 'gov-desk', tags: ['wrong'],
      inspect: { label: 'File as: POLICY', detail: 'A mandatory, high-level statement of management intent.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: "consider" is recommendation language, and nothing is enforced — a guideline, not a binding policy.',
    },
    {
      id: 'gov-pick-desk-procedure', kind: 'console', x: 33.5, y: 17.5, sprite: 'console', group: 'gov-desk', tags: ['wrong'],
      inspect: { label: 'File as: PROCEDURE', detail: 'Step-by-step instructions for completing a task.', category: 'legit', objectives: ['5.1'] },
      log: 'Wrong element: these are optional tips, not mandatory steps — a guideline.',
    },
    {
      id: 'gov-pick-desk-guideline', kind: 'console', x: 35.5, y: 17.5, sprite: 'console', group: 'gov-desk', tags: ['gov-file'],
      inspect: { label: 'File as: GUIDELINE', detail: 'A non-mandatory recommendation.', category: 'legit', objectives: ['5.1'] },
      log: 'Filed as GUIDELINE — correct: it recommends good practice without requiring it.',
    },
    // --- Server floor: the physical sweep (tag 'asset') ---
    {
      id: 'srv-db', kind: 'workstation', x: 24.5, y: 3.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'DB-03 database server',
        detail: 'Register match: SRV-FLOOR, owner DBA team. Physical asset tag matches the register. Powered, patched, backed up.',
        category: 'legit', objectives: ['4.2'],
      },
    },
    {
      id: 'ws-fin', kind: 'workstation', x: 28.5, y: 3.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'FIN-01 workstation',
        detail: 'Register match: FINANCE, owner K. Marsh — but Marsh was offboarded in 2025-11. The tag matches; the ownership record is stale.',
        category: 'legit', objectives: ['4.2'],
      },
    },
    {
      id: 'mail-02', kind: 'workstation', x: 32.5, y: 3.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'MAIL-02 relay',
        detail: 'Register match: SRV-FLOOR, owner IT ops. Present, tagged, and correctly assigned.',
        category: 'legit', objectives: ['4.2'],
      },
    },
    {
      id: 'prt-07', kind: 'workstation', x: 36.5, y: 3.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'PRN-07 label printer',
        detail: 'Register match: SRV-FLOOR, owner shipping. Present and tagged.',
        category: 'legit', objectives: ['4.2'],
      },
    },
    {
      id: 'rogue-ap', kind: 'workstation', x: 24.5, y: 6.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'Unknown wireless AP',
        detail: 'NOT in the register: a consumer router, SSID LINKSYS, admin password still "admin", ethernet run under desk 14. A shadow asset — anyone\u2019s traffic can ride it straight past the firewall.',
        category: 'suspicious', objectives: ['4.2'],
      },
    },
    {
      id: 'dev-box', kind: 'workstation', x: 28.5, y: 6.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'DEV-TEST-77',
        detail: 'NOT in the register: an engineering test box stood up in June. Worse — it holds a full copy of the production CRM database "for testing". Shadow asset and an unapproved data copy.',
        category: 'suspicious', objectives: ['4.2'],
      },
    },
    {
      id: 'nas-09', kind: 'workstation', x: 32.5, y: 6.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'NAS-09 archive shelf',
        detail: 'The register says decommissioned 2019 — but it is powered, on the network, SMB open, and someone wrote to it two days ago. A zombie asset the paperwork already buried.',
        category: 'suspicious', objectives: ['4.2'],
      },
    },
    {
      id: 'dock-118', kind: 'workstation', x: 36.5, y: 6.5, sprite: 'workstation',
      tags: ['asset'],
      inspect: {
        label: 'LT-118 docking station',
        detail: 'The register lists a laptop here — the dock is powered but the laptop is GONE. Assigned to K. Marsh, offboarded 2025-11 and never recovered. Report it missing.',
        category: 'suspicious', objectives: ['4.2'],
      },
    },
    {
      id: 'reconcile', kind: 'console', x: 30.5, y: 9.5, sprite: 'console',
      tags: ['reconcile'],
      inspect: {
        label: 'CMDB reconciliation console',
        detail: 'Compares the stale register against the physical sweep: unregistered assets get added, missing ones get reported as lost.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'INVENTORY RECONCILED\n' +
        '+ Rogue AP — unmanaged, quarantined pending owner\n' +
        '+ DEV-TEST-77 — registered; flagged for data-minimization review\n' +
        '- LT-118 laptop — MISSING, reported as lost asset\n' +
        '~ NAS-09 — "decommissioned" but live; decommission restarted\n' +
        'Register now matches the floor: 4 discrepancies closed.',
    },
    // --- Media vault: the retired-drive bays ---
    {
      id: 'shelf-ssd', kind: 'workstation', x: 7.5, y: 3.5, sprite: 'workstation',
      inspect: {
        label: 'SSD-228 (from FIN-01 refresh)',
        detail: 'Solid-state drive that held customer PII — cardholder names and emails. Flash cells: degaussing does nothing to them.',
        category: 'legit', objectives: ['4.2'],
      },
    },
    {
      id: 'ssd-format', kind: 'console', x: 6.5, y: 4.5, sprite: 'console', group: 'ssd',
      tags: ['wrong'],
      inspect: {
        label: 'Quick format SSD-228',
        detail: 'Fastest option — rebuilds the filesystem and calls it clean.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'Quick format done in 4 seconds. The PII is still recoverable — a format rewrites pointers, not cells. Auditors with forensic tools will find every record.',
    },
    {
      id: 'ssd-degauss', kind: 'console', x: 7.5, y: 4.5, sprite: 'console', group: 'ssd',
      tags: ['wrong'],
      inspect: {
        label: 'Degauss SSD-228',
        detail: 'Run it through the magnetic eraser like the tapes.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'The degaussing wand passes over the SSD — nothing happens. Degaussing only erases magnetic media; flash has no magnetic domains. The PII is intact.',
    },
    {
      id: 'ssd-erase', kind: 'console', x: 8.5, y: 4.5, sprite: 'console', group: 'ssd',
      tags: ['dispose'],
      inspect: {
        label: 'Crypto-erase + secure erase SSD-228',
        detail: 'Destroy the media key, then a firmware secure-erase pass.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'SSD-228 sanitized: cryptographic erase (media key destroyed), then a verified secure-erase pass. Certificate of destruction #8841 issued and filed.',
    },
    {
      id: 'shelf-hdd', kind: 'workstation', x: 11.5, y: 3.5, sprite: 'workstation',
      inspect: {
        label: 'HDD-114 (Marsh mailbox archive)',
        detail: 'Magnetic drive holding the K. Marsh mailbox archive — litigation hold LIT-88 is ACTIVE on this data for the contract suit.',
        category: 'legit', objectives: ['4.2', '5.4'],
      },
    },
    {
      id: 'hdd-shred', kind: 'console', x: 10.5, y: 4.5, sprite: 'console', group: 'hdd',
      tags: ['spoliation'],
      inspect: {
        label: 'Shred HDD-114 now',
        detail: 'Straight into the shredder with the other retired media.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'Drive shredded.',
    },
    {
      id: 'hdd-retain', kind: 'console', x: 11.5, y: 4.5, sprite: 'console', group: 'hdd',
      tags: ['dispose'],
      inspect: {
        label: 'Retain HDD-114 under legal hold',
        detail: 'Pull it from the destruction queue into evidence storage.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'HDD-114 retained: moved to the evidence safe under litigation hold LIT-88 and logged in the chain of custody. Disposition deferred until counsel releases the hold.',
    },
    {
      id: 'hdd-wipe', kind: 'console', x: 12.5, y: 4.5, sprite: 'console', group: 'hdd',
      tags: ['spoliation'],
      inspect: {
        label: 'Wipe and redeploy HDD-114',
        detail: 'Sanitize it so it can go back into service tonight.',
        category: 'legit', objectives: ['5.4'],
      },
      log: 'Drive wiped.',
    },
    {
      id: 'shelf-tape', kind: 'workstation', x: 15.5, y: 3.5, sprite: 'workstation',
      inspect: {
        label: 'LTO-9 tape (quarterly financials)',
        detail: 'Backup tape whose retention schedule expired in January. Magnetic media — a degausser will erase it cleanly.',
        category: 'legit', objectives: ['4.2'],
      },
    },
    {
      id: 'tape-dump', kind: 'console', x: 14.5, y: 4.5, sprite: 'console', group: 'tape',
      tags: ['wrong'],
      inspect: {
        label: 'Toss LTO-9 in the dumpster',
        detail: 'Retention expired — it is just plastic now.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'The tape goes in the trash — still perfectly readable by whoever pulls it out. Dumpster-dived backup tapes are how breaches start; expired retention never means free disposal.',
    },
    {
      id: 'tape-degauss', kind: 'console', x: 15.5, y: 4.5, sprite: 'console', group: 'tape',
      tags: ['dispose'],
      inspect: {
        label: 'Degauss + log LTO-9',
        detail: 'Magnetic erase for magnetic media, then file the certificate.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'LTO-9 degaussed: magnetic domains randomized, data unrecoverable. Certificate of destruction #8842 issued and filed.',
    },
    {
      id: 'tape-relabel', kind: 'console', x: 16.5, y: 4.5, sprite: 'console', group: 'tape',
      tags: ['wrong'],
      inspect: {
        label: 'Relabel and reuse LTO-9',
        detail: 'Peel the sticker — free scratch tape for the next backup.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'Relabeled as a scratch tape — but the quarterly financials stay recoverable until something overwrites them. Reusing media without sanitizing it first leaks last year\u2019s data to whoever mounts it next.',
    },
    {
      id: 'shelf-shadow', kind: 'workstation', x: 15.5, y: 6.5, sprite: 'workstation',
      inspect: {
        label: 'Unlabeled drive + USB stick',
        detail: 'No asset tag, no register entry, contents unverified — found loose on the vault shelf. Unknown provenance means unknown contents.',
        category: 'suspicious', objectives: ['4.2'],
      },
    },
    {
      id: 'shadow-donate', kind: 'console', x: 14.5, y: 7.5, sprite: 'console', group: 'shadow',
      tags: ['wrong'],
      inspect: {
        label: 'Donate to the school drive',
        detail: 'Free hardware for the district\u2019s computer lab.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'The unknown media goes in the donation box — with whatever is on it. If that drive held PII, we just shipped a breach to a middle school. Unknown provenance means unknown contents.',
    },
    {
      id: 'shadow-plug', kind: 'console', x: 15.5, y: 7.5, sprite: 'console', group: 'shadow',
      tags: ['wrong'],
      inspect: {
        label: 'Plug it in to check contents',
        detail: 'Fastest way to see what is on it.',
        category: 'legit', objectives: ['4.2', '2.2'],
      },
      log: 'You mount the unknown USB on a production workstation — the single most dangerous way to handle untrusted media. Whatever autorun or firmware payload it carries now has a host. Forensics mounts unknown media on an isolated, write-blocked station — never here.',
    },
    {
      id: 'shadow-destroy', kind: 'console', x: 16.5, y: 7.5, sprite: 'console', group: 'shadow',
      tags: ['dispose'],
      inspect: {
        label: 'Physically destroy + log serials',
        detail: 'Shred it — unverifiable media cannot be trusted for erasure.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'Unknown drive and USB physically destroyed; serials photographed and logged. Media you cannot verify cannot be trusted for sanitization — destruction removes the doubt. Certificate #8843 filed.',
    },
    {
      id: 'cert-ledger', kind: 'console', x: 8.5, y: 9.5, sprite: 'console',
      inspect: {
        label: 'Certificate ledger',
        detail: 'One certificate of destruction per dispositioned item: serial, method, date, witness. This is the book the auditors will sample first.',
        category: 'legit', objectives: ['4.2'],
      },
      log: 'CERTIFICATE LEDGER — entries appear as each drive is dispositioned.',
    },
    // --- Ambient + pickups ---
    {
      id: 'worm-hall-a', kind: 'enemy', x: 33.5, y: 10.5, sprite: 'worm', ai: 'wander', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'A worm is loose in the war room — a shadow asset let it in.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'worm-hall-b', kind: 'enemy', x: 5.5, y: 15.5, sprite: 'worm', ai: 'wander', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'A worm is loose in the war room — a shadow asset let it in.', category: 'malware', objectives: ['2.4'] },
    },
    ...(
      [
        ['charge-hall', 5.5, 17.5],
        ['charge-lobby-sw', 3.5, 25.5],
        ['charge-vault-floor', 16.5, 9.5],
        ['charge-vault-closet', 2.5, 6.5],
        ['charge-floor-aisle', 23.5, 10.5],
        ['charge-cage', 37.5, 10.5],
        ['charge-exit-lobby', 21.5, 25.5],
        ['charge-warroom', 34.5, 18.5],
      ] as const
    ).map(([id, x, y]) => ({
      id, kind: 'item' as const, x, y, sprite: 'charge',
      tags: ['arsenal-pickup'],
      grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions for the USB scanner.', category: 'item' as const },
    })),
    ...(
      [
        ['medkit-lobby', 3.5, 22.5],
        ['medkit-vault', 7.5, 10.5],
        ['medkit-hall', 36.5, 15.5],
      ] as const
    ).map(([id, x, y]) => ({
      id, kind: 'item' as const, x, y, sprite: 'medkit',
      grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' as const },
    })),
    {
      id: 'find-edr', kind: 'item', x: 36.5, y: 9.5, sprite: 'tool-edr',
      tags: ['arsenal-pickup'],
      grants: { resource: 'tool:edr', amount: 1 },
      inspect: { label: 'EDR console (found)', detail: 'Endpoint detection and response console with containment.', category: 'item', objectives: ['4.5'] },
    },
    ...(
      [
        ['edr-cell-cage', 36.5, 10.5],
        ['edr-cell-cage-2', 37.5, 9.5],
        ['edr-cell-vault', 3.5, 5.5, 2],
      ] as const
    ).map(([id, x, y, n = 1]) => ({
      id, kind: 'item' as const, x, y, sprite: 'edr-cell',
      tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: n },
      inspect: {
        label: n === 1 ? 'EDR cell' : 'EDR cells',
        detail: `Licence and compute for ${n === 1 ? 'one' : 'two'} EDR containment pulse${n === 1 ? '' : 's'}.`,
        category: 'item' as const,
        objectives: ['4.5'],
      },
    })),
  ],
  missionObjectives: [
    { id: 'inv-load', text: 'Pull up the stale asset inventory', kind: 'interact', tag: 'inv-load' },
    { id: 'signin', text: 'Sign in for AUDIT role (media vault)', kind: 'interact', tag: 'signin' },
    { id: 'sweep', text: 'Physically sweep the floor: inspect all 8 assets', kind: 'inspect', tag: 'asset', count: 8 },
    { id: 'reconcile', text: 'Reconcile the register against the sweep', kind: 'interact', tag: 'reconcile', requires: ['inv-load', 'sweep'] },
    { id: 'dispose', text: 'Dispose of each retired drive correctly', kind: 'interact', tag: 'dispose', count: 4, requires: ['reconcile'] },
    { id: 'dsr', text: 'Answer the three data-subject requests', kind: 'interact', tag: 'dsr', count: 3 },
    { id: 'audit-map', text: 'Identify the audit cast: brief, internal audit, external auditor, red team', kind: 'inspect', tag: 'audit-cast', count: 4 },
    { id: 'scope', text: 'Issue the pen-test rules of engagement', kind: 'interact', tag: 'scope', requires: ['audit-map'] },
    { id: 'gov-read', text: 'Read all four governance documents', kind: 'inspect', tag: 'gov-doc', count: 4 },
    { id: 'governance', text: 'File each governance document under the right element', kind: 'interact', tag: 'gov-file', count: 4, requires: ['gov-read'] },
    { id: 'attest', text: 'Sign the attestation package', kind: 'interact', tag: 'attest', requires: ['reconcile', 'dispose', 'dsr', 'scope', 'governance'] },
    { id: 'legal-hold', text: 'Never destroy data under legal hold', kind: 'avoid', tag: 'spoliation' },
    { id: 'no-violations', text: 'Badge only doors your role covers', kind: 'doors' },
    { id: 'exit', text: 'Reach the exit before the auditors arrive', kind: 'reach-exit' },
  ],
  debriefQuestions: [
    q('q1', ['4.2'], 'Decommissioned SSDs held customer PII. What must happen before they leave the building?', 3, [
      ['A quick format', 'A quick format leaves the data recoverable.'],
      ['Delete the files and empty the recycle bin', 'Deletion removes pointers, not data. Forensic tools recover it easily.'],
      ['Donate them as-is to a school', 'Shipping recoverable PII off-site is a breach waiting to happen.'],
      ['Sanitize (crypto-erase / secure erase) or physically destroy them, and keep a certificate of destruction', 'Sanitization or destruction makes the data unrecoverable, and the certificate proves it for auditors.'],
    ]),
    q('q2', ['5.4'], 'An EU customer asks you to erase all of their personal data. Which privacy concept applies, and what limits it?', 0, [
      ['Right to be forgotten, limited by legal retention obligations', 'Data subjects can request erasure, but data you are legally required to keep, such as tax records, may be retained.'],
      ['Data sovereignty, limited by geolocation', 'Sovereignty is about which country\u2019s laws govern data where it is stored, not erasure requests.'],
      ['Attestation, limited by audit scope', 'Attestation is formally affirming compliance, which has nothing to do with deleting a person\u2019s data.'],
      ['Due care, limited by budget', 'Due care is acting responsibly, but the specific right in play is erasure.'],
    ]),
    q('q3', ['5.5'], 'A penetration-test team is handed network diagrams, source code and test credentials before they start. What kind of test environment is this?', 1, [
      ['Unknown environment', 'Unknown-environment (black-box) testers start with no inside information.'],
      ['Known environment', 'Full disclosure up front (white-box) lets testers go deep quickly.'],
      ['Partially known environment', 'Partially known (gray-box) testers get only limited information, not full diagrams and code.'],
      ['Passive reconnaissance', 'Passive recon is gathering public information without touching the target. It is a technique, not an environment type.'],
    ]),
    q('q4', ['5.4'], 'Your company processes patient data strictly on a hospital\u2019s instructions. Under privacy law, your company is the:', 2, [
      ['Data controller', 'The hospital is the controller: it decides why and how the data is processed.'],
      ['Data subject', 'The patients are the data subjects.'],
      ['Data processor', 'A processor handles personal data on behalf of, and as instructed by, the controller.'],
      ['Data owner', 'The owner is a senior internal role accountable for a data set. It is not the privacy-law term for a service provider.'],
    ]),
    q('q5', ['5.1'], 'Who is ACCOUNTABLE for deciding how the sales data set is classified and who may access it?', 0, [
      ['The data owner', 'The owner, usually a senior business leader, is accountable for classification and access decisions.'],
      ['The data custodian', 'Custodians implement and operate the controls day to day, such as backups and permissions, as the owner directs.'],
      ['The data processor', 'Processors handle data for a controller. They do not set its classification.'],
      ['The help desk', 'The help desk carries out access requests. It does not decide them.'],
    ]),
  ],
  script: {
    par: 300,
    triggers: [
      {
        id: 'attest-exit',
        after: ['attest'],
        openDoors: ['exit'],
        kind: 'good',
        message: 'Attestation signed — exit open.',
      },
    ],
    secrets: [
      { id: 'vault-closet', area: [2, 5, 3, 7], label: 'Vault supply closet', grant: { resource: 'integrity', amount: 40 } },
      { id: 'parts-cage', area: [36, 9, 37, 10], label: 'Server-floor parts cage', grant: { resource: 'role:audit', amount: 1 } },
    ],
  },
};

// Logic bomb set to detonate during the audit — dormant in the media vault.
addThreatEncounter(m11, 'vault-bomb', 'logicbomb', 3, {
  id: 'vault-bombs',
  area: [2, 2, 17, 11],
  kind: 'bad',
  message: 'A LOGIC BOMB wakes in the vault — a scheduled task set to wipe it at 08:00!',
}, [2, 9, 17, 11]);

// Rootkits and trojans answer from the racks once the dev box beacons.
addThreatEncounter(m11, 'floor-rootkit', 'rootkit', 3, {
  id: 'floor-rootkits',
  area: [22, 2, 37, 11],
  kind: 'bad',
  message: 'The unregistered DEV box is beaconing — ROOTKITS answer from the racks!',
}, [22, 9, 37, 11]);
addThreatEncounter(m11, 'floor-trojan', 'trojan', 2, {
  id: 'floor-trojans',
  area: [22, 9, 37, 11],
  kind: 'bad',
  message: 'TROJANS ride the beacon traffic!',
}, [22, 9, 37, 11]);

// Once the attestation is signed, the shadow assets call home.
addThreatEncounter(m11, 'home-rat', 'rat', 4, {
  id: 'shadow-callback',
  after: ['attest'],
  kind: 'bad',
  message: 'The found shadow assets are calling home — RATs in the war room!',
}, [2, 13, 37, 19]);
addThreatEncounter(m11, 'home-worm', 'worm', 2, {
  id: 'shadow-worms',
  after: ['attest'],
  kind: 'bad',
  message: 'WORMS spill out of the rogue AP\u2019s subnet!',
}, [22, 13, 37, 19]);

export const m11Walkthrough: WalkStep[] = [
  { goto: [6, 19] },
  { interact: 'inv-console' },
  { goto: [10, 19] },
  { interact: 'audit-signin' },
  { goto: [4, 15] },
  { inspect: 'dsr1-case' },
  { interact: 'dsr1-right' },
  { goto: [11, 15] },
  { inspect: 'dsr2-case' },
  { interact: 'dsr2-hold' },
  { goto: [16, 15] },
  { inspect: 'dsr3-case' },
  { interact: 'dsr3-attest' },
  { goto: [27, 15] },
  { inspect: 'scope-brief' },
  { inspect: 'rosa' },
  { inspect: 'cole' },
  { inspect: 'iris' },
  { interact: 'scope-unknown' },
  { badge: [30, 12] },
  { goto: [30, 11] },
  { goto: [24, 4] },
  { inspect: 'srv-db' },
  { goto: [28, 4] },
  { inspect: 'ws-fin' },
  { goto: [32, 4] },
  { inspect: 'mail-02' },
  { goto: [36, 4] },
  { inspect: 'prt-07' },
  { goto: [24, 7] },
  { inspect: 'rogue-ap' },
  { goto: [28, 7] },
  { inspect: 'dev-box' },
  { goto: [32, 7] },
  { inspect: 'nas-09' },
  { goto: [36, 7] },
  { inspect: 'dock-118' },
  { goto: [30, 10] },
  { interact: 'reconcile' },
  { goto: [30, 13] },
  { badge: [8, 12] },
  { goto: [8, 13] },
  { goto: [7, 5] },
  { inspect: 'shelf-ssd' },
  { interact: 'ssd-erase' },
  { goto: [11, 5] },
  { inspect: 'shelf-hdd' },
  { interact: 'hdd-retain' },
  { goto: [15, 5] },
  { inspect: 'shelf-tape' },
  { interact: 'tape-degauss' },
  { goto: [15, 8] },
  { inspect: 'shelf-shadow' },
  { interact: 'shadow-destroy' },
  { goto: [8, 13] },
  { goto: [31, 15] },
  { inspect: 'gov-doc-aup' },
  { inspect: 'gov-doc-pw' },
  { inspect: 'gov-doc-offb' },
  { inspect: 'gov-doc-desk' },
  { interact: 'gov-pick-aup-policy' },
  { goto: [33, 15] },
  { interact: 'gov-pick-pw-standard' },
  { goto: [35, 16] },
  { interact: 'gov-pick-offb-procedure' },
  { goto: [35, 17] },
  { interact: 'gov-pick-desk-guideline' },
  { goto: [29, 19] },
  { interact: 'attest-console' },
  { wait: 0.2 },
  { goto: [23, 18] },
  { goto: [23, 23] },
];

export const m11Teach: MissionTeaching = {
  tagline: 'Auditors at 08:00. The register is five years stale and the drives are piling up.',
  situation: 'External auditors arrive at 08:00. The asset inventory is a spreadsheet nobody has opened since 2021, retired drives are stacked in the media vault, three data-subject requests sit in the queue, and the pen-test engagement letter is unsigned.',
  orders: [
    { text: 'Prove the register: sweep every asset, then reconcile.', objective: '4.2' },
    { text: 'Dispose of each retired drive the way its media demands.', objective: '4.2' },
    { text: 'Answer the DSRs, set the pen-test scope, then attest.', objective: '5.4' },
  ],
  keyTerms: [
    'asset inventory',
    'shadow IT',
    'sanitization',
    'degaussing',
    'certificate of destruction',
    'data retention',
    'legal hold',
    'right to be forgotten',
    'attestation',
    'internal audit',
    'external audit',
    'penetration test',
    'data owner',
    'data custodian',
    'data controller',
    'data processor',
    'security policy',
    'security standard',
    'security procedure',
    'security guideline',
  ],
  lessons: {
    'inv-load': {
      objective: '4.2',
      done: 'The stale register was loaded: 12 rows last saved in 2021. An audit starts from the inventory of record — everything else is verified against it.',
      missed: 'You never opened the inventory of record. Without it there is nothing to reconcile the physical sweep against.',
    },
    signin: {
      objective: '4.2',
      done: 'The AUDIT role was issued for the night and logged: least privilege for vault access, with badge plus token as the second factor.',
      missed: 'The media vault stayed locked. Signing in grants the time-boxed AUDIT role the badge reader requires — and logs who was inside.',
    },
    sweep: {
      objective: '4.2',
      done: 'Every asset tag was physically verified: four registered assets confirmed, plus a rogue AP, an unmanaged dev box holding production data, a "decommissioned" NAS still on the network, and a missing laptop. Physical enumeration finds what spreadsheets miss.',
      missed: 'Not every asset was inspected. Shadow assets (unregistered gear) and zombie assets (listed as retired but still live) only surface in a physical sweep.',
    },
    reconcile: {
      objective: '4.2',
      done: 'The register was corrected to match reality: rogue AP quarantined, DEV-TEST-77 registered and flagged, LT-118 reported missing, NAS-09 decommission restarted. Reconciliation closes the loop between paper and floor.',
      missed: 'The sweep findings never made it back into the register. An inventory that is never reconciled decays back into fiction — and the auditors will check it.',
    },
    dispose: {
      objective: '4.2',
      done: 'Each drive got the disposition its media and data demanded: crypto/secure-erase for the PII SSD, retention for the legal-hold HDD, degaussing for the expired LTO tape, destruction for the unverifiable shadow drive — all logged with certificates of destruction.',
      missed: 'The retired drives were not disposed of correctly. Match sanitization or destruction to the media type and data sensitivity, and file a certificate for every one.',
    },
    dsr: {
      objective: '5.4',
      done: 'All three requests answered: erasure bounded by tax retention, deletion suspended under legal hold, and a signed attestation with evidence issued to the partner.',
      missed: 'Requests were left hanging or answered wrong. Erasure honors the right to be forgotten only within legal retention limits; legal holds suspend it entirely; attestation requires signed evidence.',
    },
    scope: {
      objective: '5.5',
      done: 'Unknown-environment engagement issued: the red team works from public information only, exactly the outside-attacker view the committee asked for.',
      missed: 'The scope was never set — or gave the testers inside knowledge. Known and partially known environments measure an informed attacker; the committee asked what an outsider can reach.',
    },
    'audit-map': {
      objective: '5.5',
      done: 'The audit cast was identified: internal audit (Vega) self-assesses, external audit (Ferro) independently attests, and the red team (Chen) needs its environment scope.',
      missed: 'The engagement was scoped without identifying who does what. Internal audit prepares evidence, external audit attests independently, and a pen test needs its environment defined.',
    },
    'gov-read': {
      objective: '5.1',
      done: 'All four governance documents were read before filing.',
      missed: 'Documents were filed unread. Governance starts with knowing what each document actually says.',
    },
    governance: {
      objective: '5.1',
      done: 'Each document filed under the right element: the AUP is policy, the password baseline a standard, the offboarding runbook a procedure, the clean-desk tips a guideline.',
      missed: 'Governance elements were misfiled or skipped. Policy is binding intent, a standard mandates technical values, a procedure is steps, a guideline only recommends.',
    },
    attest: {
      objective: '5.4',
      done: 'Attestation issued with the evidence package: reconciliation, certificates, preserved holds, answered DSRs and the scope letter — signed and non-repudiable.',
      missed: 'No attestation was signed. An attestation is a formal, evidence-backed statement of compliance; it is only worth signing once the work behind it is real.',
    },
    'legal-hold': {
      objective: '5.4',
      done: 'Legal-hold data was preserved. A hold overrides retention schedules AND erasure requests — destroying held data is spoliation, and courts treat it as destruction of evidence.',
      missed: 'Data under legal hold was destroyed. Spoliation — destroying evidence that must be preserved — is one of the fastest ways to lose a lawsuit and an audit at once.',
    },
    'no-violations': {
      objective: '4.6',
      done: 'Every badge swipe matched your roles. Access attempts are logged — auditors read those logs.',
      missed: 'You swiped a door your role did not cover. Least privilege is enforced at the reader and logged for the audit trail.',
    },
    exit: {
      objective: '5.5',
      done: 'Out before 08:00 with the package signed. Internal audit (R. Vega) prepared and gathered; external audit (C. Ferro) will attest to what he verifies himself.',
      missed: 'The auditors arrived to an unfinished night. The exit stays locked until the attestation is signed.',
    },
    'bad-choice': {
      objective: '4.2',
      done: 'Shortcuts were rejected: no quick-format "sanitization", no degaussed flash, no dumpstered tapes, no donated unknown media, no "trust us" replies, no over-shared test scope.',
      missed: 'A shortcut was logged. Formatting is not sanitization, degaussing does nothing to flash, unknown media gets destroyed not donated, and compliance answers need signed evidence — not vibes.',
    },
  },
  examTip: 'Match sanitization to the media (degauss magnetic, crypto-erase or destroy flash), never destroy data under legal hold, and let retention obligations bound the right to be forgotten. Owner decides, custodian implements; controller determines why, processor obeys.',
};

// F1: encounter pacing — opening skirmish, vault/server reveals, hall pack,
// exit-room logic bombs, supplies.
liveThreats(m11, 'open-worm', 'worm', 1, [2, 13, 37, 19]);
addThreatEncounter(m11, 'vault-ambush-bomb', 'logicbomb', 4, {
  id: 'vault-ambush', area: [2, 2, 17, 11], kind: 'bad',
  message: 'Audit night woke the logic bombs in the records vault.',
}, [2, 2, 17, 11]);
addThreatEncounter(m11, 'server-rk', 'rootkit', 5, {
  id: 'server-ambush', area: [22, 2, 37, 11], kind: 'bad',
  message: 'Rootkits surface in the east server rows.',
}, [22, 2, 37, 11]);
addThreatEncounter(m11, 'hall-worm', 'worm', 2, {
  id: 'hall-ambush-a', area: [2, 13, 37, 19], kind: 'bad',
  message: 'Worms sweep the audit hall.',
}, [2, 13, 18, 19]);
addThreatEncounter(m11, 'hall-rat', 'rat', 3, {
  id: 'hall-ambush-b', area: [2, 13, 37, 19], kind: 'bad',
}, [19, 13, 37, 19]);
addThreatEncounter(m11, 'exit-bomb', 'logicbomb', 3, {
  id: 'exit-ambush', area: [18, 21, 27, 27], kind: 'bad',
  message: 'Logic bombs tick in the exit room — finish the audit fast.',
}, [18, 21, 27, 27]);
m11.entities.push(
  { id: 'chg-w', kind: 'item', ...floorSpot(m11, [2, 2, 17, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-e', kind: 'item', ...floorSpot(m11, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-c', kind: 'item', ...floorSpot(m11, [2, 13, 37, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-s', kind: 'item', ...floorSpot(m11, [18, 21, 27, 27]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'med-c', kind: 'item', ...floorSpot(m11, [2, 13, 37, 19]), sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 }, inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

m11.entities.push(
  { id: 'chg-x1', kind: 'item', ...floorSpot(m11, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x2', kind: 'item', ...floorSpot(m11, [2, 13, 37, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
);

// — rF2 landmarks: east server hall = bright grid floor + console audit wall;
// west media-vault block = dim rust floor.
m11.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m11.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m11, [28, 4, 38, 12], 'floor', ',');
retex(m11, [2, 4, 10, 9], 'floor', ';');
retex(m11, [2, 20, 18, 26], 'floor', ';');
m11.map.lights = { ...m11.map.lights, ...lightRects([[28, 4, 38, 11, 0.85], [2, 4, 10, 8, 0.45], [2, 20, 18, 26, 0.55]]) };
m11.entities.push(
  { id: 'audit-wall-a', kind: 'prop', x: 31.5, y: 6.5, sprite: 'console' },
  { id: 'audit-wall-b', kind: 'prop', x: 34.5, y: 6.5, sprite: 'console' },
  { id: 'vault-desk', kind: 'prop', x: 5.5, y: 6.5, sprite: 'workstation' },
);

// rF4: 46x28 silhouette — east snake (three stacked runs linked end-to-end)
// forming an audit-trail labyrinth, with a secret ledger room below it.
m11.map.legend.T = { kind: 'door', tex: 'door', doorId: 'rf4-snake' };
m11.map.legend['4'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-ledger' };
m11.entities.push(
  { id: 'rf4-ledger-item', kind: 'item', x: 41.5, y: 25.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
);
m11.script!.secrets!.push(
  { id: 'rf4-ledger', area: [40, 25, 42, 26], label: 'Shadow ledger room', grant: { resource: 'usb-charge', amount: 8 } },
);
mixedThreatEncounter(m11, 'snake-mix', [['trojan', 2], ['logicbomb', 3]],
  { id: 'snake-ambush', area: [40, 21, 43, 23], kind: 'bad',
    message: 'The audit trail runs into a logic-bomb nest — trojans cover the run.' },
  [40, 13, 43, 23]);
addThreatEncounter(m11, 'attest-wave', 'rat', 4,
  { id: 'attest-wave', after: ['attest'], kind: 'warn',
    message: 'Attestation logged — the night audit wakes the last rat nest in the hall.' },
  [2, 13, 36, 19]);
m11.map.lights = { ...m11.map.lights, ...lightRects([[40, 13, 43, 23, 0.6], [40, 25, 42, 26, 0.85], [41, 23, 41, 23, 0.35]]) };
