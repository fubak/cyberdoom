import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, floorSpot, liveThreats } from './campaign-map';

/**
 * M10 "Third Party": a SaaS vendor wants production access next week; the rep applies
 * social-engineering pressure (urgency + authority + verification resistance).
 * Difficulty 9. Three desks, each gated on evidence:
 *   1. VENDOR SUITE (analyst badge): demand questionnaire / right-to-audit /
 *      independent assessment, read what comes back, then match each requirement
 *      to the correct agreement (SLA, NDA, SOW, MSA). Wrong picks are scored
 *      -15 "bad-choice" and explained in the case file.
 *   2. RISK DESK (risk role via intake): appetite statement + four scenario
 *      registers give raw AV / EF / ARO numbers only — the player computes
 *      SLE/ALE and picks mitigate/transfer/accept/avoid per scenario. Picks that
 *      don't fit the STATED appetite are scored -15.
 *   3. NOC (analyst + MFA): a compromised MSP pushes an unscheduled package over
 *      the trusted RMM channel — the digest does not match. Verify the evidence,
 *      then suspend the channel. Approving the push FAILS the mission.
 * The rep must be marked and filed at the case console (report). Signing the
 * "fast-track" pilot or badging the exec express lift are violations.
 * Exit opens once assessment, agreements, strategies, the report and the block
 * are all done.
 * Secrets: suite closet, server closet, risk-room cache.
 */
export const m10: Mission = {
  id: 'm10',
  title: 'THIRD PARTY',
  difficulty: 9,
  objectives: ['5.3', '5.2', '2.2', '3.1'],
  briefing:
    'A new SaaS vendor wants remote access to production next week — and their rep is already ' +
    'in the meeting room pushing to skip the assessment. Meanwhile a compromised MSP is pushing ' +
    'an unscheduled update through the trusted RMM channel. MOUSE (2) inspects people and records, ' +
    'KEYBOARD (1) issues demands and decisions, BADGE (4) opens doors your roles cover.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'mfa'],
  map: {
    grid: [
      '########################################',
      '########################################',
      '##................####................##',
      '##................####................##',
      '##BBBB............####..SS..SS.SS.SSSS##',
      '##...B............####............S...##',
      '##...B............####..SS..SS.SS.S...##',
      '##...1............####............2...##',
      '##...B............####..SS..SS.SS.S...##',
      '##...B............####............S...##',
      '##BBBB............####............SSSS##',
      '##................####................##',
      '########A#####################N#########',
      '##....................................##',
      '##....................................##',
      '##......BBBBB..........BBBBB..........##',
      '##......BBBBB..........BBBBB..........##',
      '##....................................##',
      '##....................................##',
      '##....................................##',
      '#######R############XV##################',
      '##...#.............#.........###########',
      '##...#.............#.........###########',
      '##...3.............#.........###########',
      '##...#.............#....E....###########',
      '##...#.............#.........###########',
      '##...#.............#.........###########',
      '########################################',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      S: { kind: 'wall', tex: 'wall-server' },
      B: { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      E: { kind: 'exit', tex: 'exit' },
      A: { kind: 'door', tex: 'door', doorId: 'vendor-suite', accessRole: 'analyst' },
      N: { kind: 'door', tex: 'door', doorId: 'noc', accessRole: 'analyst', mfa: true },
      R: { kind: 'door', tex: 'door', doorId: 'risk-desk', accessRole: 'risk' },
      V: {
        kind: 'door', tex: 'door', doorId: 'exec-express', accessRole: 'exec',
        lockText: 'EXEC EXPRESS: badge-provisioned for exec staff only. The rep says it goes straight to production.',
      },
      X: {
        kind: 'door', tex: 'door', doorId: 'exit', locked: true,
        lockText: 'Exit releases when the assessment, agreements, risk calls, report and update block are all done',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-suite', secret: true },
      '2': { kind: 'door', tex: 'wall-server', doorId: 'secret-server', secret: true },
      '3': { kind: 'door', tex: 'wall-panel', doorId: 'secret-risk', secret: true },
    },
    spawn: { x: 6.5, y: 17.5, angle: 0 },
    defaultLight: 0.62,
    lights: lightRects([
      [2, 2, 17, 11, 0.9],
      [22, 2, 37, 11, 0.85],
      [2, 12, 37, 19, 0.6],
      [6, 20, 18, 26, 0.85],
      [20, 21, 28, 26, 0.8],
      [2, 5, 4, 9, 0.4],
      [35, 5, 37, 9, 0.4],
      [2, 21, 4, 26, 0.4],
    ]),
  },
  entities: [
    // --- VENDOR SUITE: assessment demands (interact 'assess-doc') ---
    {
      id: 'demand-questionnaire', kind: 'console', x: 7.5, y: 2.5, sprite: 'console', tags: ['assess-doc'],
      log: 'REQUEST FILED: standardized security questionnaire issued to the vendor — control coverage, MFA for their admins, subcontractors, incident history.',
      inspect: { label: 'Issue security questionnaire', detail: 'First ask: the standardized questionnaire puts the vendor\u2019s controls on the record before any contract talk.', category: 'legit', objectives: ['5.3'] },
    },
    {
      id: 'demand-audit', kind: 'console', x: 10.5, y: 2.5, sprite: 'console', tags: ['assess-doc'],
      log: 'DEMAND LOGGED: right-to-audit clause required in the final agreement — periodic assessment access for us or an auditor we appoint.',
      inspect: { label: 'Demand right-to-audit clause', detail: 'The clause contractually preserves your right to verify the vendor\u2019s controls after signing — without it, the questionnaire is a one-time snapshot.', category: 'legit', objectives: ['5.3'] },
    },
    {
      id: 'demand-assessment', kind: 'console', x: 13.5, y: 2.5, sprite: 'console', tags: ['assess-doc'],
      log: 'DEMAND LOGGED: independent third-party assessment required — a SOC 2 / ISO review from an outside assessor, not vendor self-attestation.',
      inspect: { label: 'Demand independent assessment', detail: 'Self-attestation is the vendor grading its own homework. An independent assessment gives the answers weight.', category: 'legit', objectives: ['5.3'] },
    },
    {
      id: 'report-console', kind: 'console', x: 16.5, y: 2.5, sprite: 'console', tags: ['report-console'],
      log: 'CASE FILE console — file marked suspects here.',
      inspect: { label: 'Case console', detail: 'Files reports on marked people to security and legal.', category: 'legit', objectives: ['5.6'] },
    },
    // --- VENDOR SUITE: returned documents (inspect 'vendor-doc') ---
    {
      id: 'doc-questionnaire', kind: 'console', x: 16.5, y: 4.5, sprite: 'console', tags: ['vendor-doc'],
      inspect: {
        label: 'Vendor questionnaire (returned)', category: 'legit', objectives: ['5.3'],
        detail: 'Back in 2 days — that alone is a flag. Patching cadence and admin MFA check out, BUT: shared "ops" accounts for tenant support, subcontractors listed with no locations, and no breach-notification commitment stated.',
      },
    },
    {
      id: 'doc-soc2', kind: 'console', x: 16.5, y: 6.5, sprite: 'console', tags: ['vendor-doc'],
      inspect: {
        label: 'SOC 2 Type II report', category: 'legit', objectives: ['5.3'],
        detail: 'Audited by an external CPA firm over 12 months — controls tested operating, not just designed. Scope note on p.3: the analytics module the vendor wants to connect to production is OUT of scope.',
      },
    },
    {
      id: 'doc-contract', kind: 'console', x: 16.5, y: 8.5, sprite: 'console', tags: ['vendor-doc'],
      inspect: {
        label: 'Vendor draft contract', category: 'legit', objectives: ['5.3'],
        detail: 'MSA + SOW draft. Missing: right-to-audit clause, breach-notification window, subcontractor flow-downs. Margin note in the rep\u2019s hand: "legal can add those later — sign the pilot first."',
      },
    },
    // --- VENDOR SUITE: agreements board (inspect 'need' / interact 'agreement') ---
    {
      id: 'need-uptime', kind: 'console', x: 6.5, y: 4.5, sprite: 'console', tags: ['need'],
      inspect: {
        label: 'Requirement: availability', category: 'legit', objectives: ['5.3'],
        detail: 'Contract must guarantee 99.9% monthly uptime with service credits when missed, plus an escalation path for repeated misses.',
      },
    },
    {
      id: 'need-confidential', kind: 'console', x: 6.5, y: 6.5, sprite: 'console', tags: ['need'],
      inspect: {
        label: 'Requirement: confidentiality', category: 'legit', objectives: ['5.3'],
        detail: 'Vendor engineers will see unreleased roadmap data during integration. That information must be legally protected before any access.',
      },
    },
    {
      id: 'need-migration', kind: 'console', x: 6.5, y: 8.5, sprite: 'console', tags: ['need'],
      inspect: {
        label: 'Requirement: migration project', category: 'legit', objectives: ['5.3'],
        detail: 'One-off project: migrate three years of ticket history into the new CRM by Q3 — defined deliverables, milestones and acceptance criteria.',
      },
    },
    {
      id: 'need-framework', kind: 'console', x: 6.5, y: 10.5, sprite: 'console', tags: ['need'],
      inspect: {
        label: 'Requirement: master terms', category: 'legit', objectives: ['5.3'],
        detail: 'Before any SOWs or pilots: liability, indemnification, IP ownership and termination terms that govern every future order with this vendor.',
      },
    },
    ...(
      [
        ['opt-uptime-sla', 9.5, 4.5, 'SLA', 'agreement', 'need-uptime',
          'SIGNED: service-level agreement — 99.9% monthly uptime, service credits on misses, escalation path. Measurable service levels are exactly what an SLA is for.'],
        ['opt-uptime-msa', 11.5, 4.5, 'MSA', 'wrong', 'need-uptime',
          'Wrong call: an MSA sets the general legal terms of the relationship — it carries no measurable uptime commitment. Availability targets belong in an SLA.'],
        ['opt-uptime-nda', 13.5, 4.5, 'NDA', 'wrong', 'need-uptime',
          'Wrong call: an NDA protects confidential information. It cannot guarantee availability, uptime or credits.'],
        ['opt-uptime-mou', 15.5, 4.5, 'MOU', 'wrong', 'need-uptime',
          'Wrong call: an MOU records mutual intent and is generally non-binding — it will not enforce 99.9% uptime or service credits.'],
        ['opt-conf-nda', 9.5, 6.5, 'NDA', 'agreement', 'need-confidential',
          'SIGNED: non-disclosure agreement — the roadmap data is legally protected before the vendor sees it, with remedies if it leaks.'],
        ['opt-conf-bpa', 11.5, 6.5, 'BPA', 'wrong', 'need-confidential',
          'Wrong call: a business partners agreement defines partner roles, profit and decision-making — not confidentiality duties.'],
        ['opt-conf-sla', 13.5, 6.5, 'SLA', 'wrong', 'need-confidential',
          'Wrong call: an SLA measures service performance (uptime, response time), not information protection.'],
        ['opt-conf-msa', 15.5, 6.5, 'MSA', 'wrong', 'need-confidential',
          'Wrong call: the MSA frames the whole relationship — confidentiality for a specific disclosure is the NDA\u2019s job.'],
        ['opt-mig-msa', 9.5, 8.5, 'MSA', 'wrong', 'need-migration',
          'Wrong call: the MSA is the umbrella for ongoing terms. A specific one-off project with deliverables and dates goes in a statement of work under it.'],
        ['opt-mig-sow', 11.5, 8.5, 'SOW', 'agreement', 'need-migration',
          'EXECUTED: statement of work — deliverables, milestones, timeline and acceptance criteria for the migration live here.'],
        ['opt-mig-sla', 13.5, 8.5, 'SLA', 'wrong', 'need-migration',
          'Wrong call: an SLA measures ongoing service quality, not one-off project deliverables and milestones.'],
        ['opt-mig-mou', 15.5, 8.5, 'MOU', 'wrong', 'need-migration',
          'Wrong call: an MOU is non-binding intent — it cannot hold a vendor to milestones or acceptance criteria.'],
        ['opt-frame-msa', 9.5, 10.5, 'MSA', 'agreement', 'need-framework',
          'SIGNED: master service agreement — the umbrella that fixes liability, indemnification, IP and termination once; SOWs and SLAs attach under it.'],
        ['opt-frame-sow', 11.5, 10.5, 'SOW', 'wrong', 'need-framework',
          'Wrong call: a SOW defines one project\u2019s deliverables — it does not set the umbrella legal terms for the whole relationship.'],
        ['opt-frame-sla', 13.5, 10.5, 'SLA', 'wrong', 'need-framework',
          'Wrong call: an SLA sets service metrics, not liability, indemnification or termination terms.'],
        ['opt-frame-moa', 15.5, 10.5, 'MOA', 'wrong', 'need-framework',
          'Wrong call: an MOA/MOU records intent between parties — it will not carry enforceable liability or IP terms.'],
      ] as const
    ).map(([id, x, y, name, tag, group, log]) => ({
      id, kind: 'console' as const, x, y, sprite: 'console', group, tags: [tag],
      log,
      inspect: {
        label: `Sign ${name} for this requirement`, category: 'legit' as const, objectives: ['5.3'],
        detail: `Commits the ${name} to the requirement beside it. Check the requirement text first.`,
      },
    })),
    // --- NOC: the compromised MSP push (inspect 'msp-evidence') ---
    {
      id: 'msp-feed', kind: 'console', x: 23.5, y: 2.5, sprite: 'console', tags: ['msp-evidence'],
      inspect: {
        label: 'RMM alert feed', category: 'legit', objectives: ['2.2'],
        detail: 'MSP Update Manager: package KB-9921 pushed to 41 managed hosts at 03:12 — outside the change window, through the MSP\u2019s trusted remote-management channel. The package installs a new persistence service and opens an outbound listener.',
      },
    },
    {
      id: 'vendor-digest', kind: 'console', x: 25.5, y: 2.5, sprite: 'console', tags: ['msp-evidence'],
      inspect: {
        label: 'Vendor published digests', category: 'legit', objectives: ['2.2'],
        detail: 'Signed manifest: official KB-9921 digest sha256:9f2a7c...e41b, released Friday under change CR-8812. The pushed package\u2019s digest does not match and is not in the manifest.',
      },
    },
    {
      id: 'apply-update', kind: 'console', x: 27.5, y: 2.5, sprite: 'console', tags: ['deploy-update'],
      inspect: {
        label: 'Approve and push KB-9921', category: 'suspicious', objectives: ['2.2'],
        detail: 'Pushes the unscheduled MSP package to the production gateway now. Digest unverified. The MSP\u2019s rep calls it "critical".',
      },
    },
    {
      id: 'block-rmm', kind: 'console', x: 23.5, y: 3.5, sprite: 'console', tags: ['block-update'],
      log: 'MSP channel suspended: KB-9921 blocked on remaining hosts; pushed hosts quarantined pending vendor review.',
      inspect: { label: 'Suspend MSP update channel', detail: 'Cuts the trusted RMM push until the package is verified — the channel itself is the supply-chain vector.', category: 'legit', objectives: ['2.2'] },
    },
    // --- ATRIUM: people ---
    {
      id: 'rep', kind: 'npc', x: 30.5, y: 16.5, sprite: 'npc-suit', ai: 'stand', reportable: true, culprit: true,
      inspect: {
        label: 'Vendor sales rep', category: 'person', objectives: ['5.6'],
        detail: 'Pitch: "pilot pricing expires Friday", "your CIO already signed off", "the security review happens after go-live". Will not name a security contact or legal signatory when asked.',
        flags: ['manufactured urgency', 'claimed authority', 'resists verification'],
      },
    },
    {
      id: 'procurement', kind: 'npc', x: 14.5, y: 17.5, sprite: 'npc-f', ai: 'stand', reportable: true,
      inspect: {
        label: 'Procurement director', category: 'person', objectives: ['5.6'],
        detail: 'Wants the contract executed before quarter-end for budget reasons. Firm on dates, but forwards every technical question to security and attaches the standard vendor-intake checklist.',
        flags: ['deadline-driven', 'follows process'],
      },
    },
    {
      id: 'expedite-console', kind: 'console', x: 32.5, y: 16.5, sprite: 'console', tags: ['shortcut'],
      inspect: {
        label: 'Vendor fast-track', category: 'suspicious', objectives: ['5.3'],
        detail: 'Sign the pilot and grant remote access now; the rep guarantees the paperwork "catches up later". The assessment, audit clause and independent review would all be skipped.',
      },
    },
    {
      id: 'risk-intake', kind: 'console', x: 7.5, y: 13.5, sprite: 'console', tags: ['risk-intake'],
      grants: { resource: 'role:risk', amount: 1 },
      log: 'Risk charter signed. RISK DESK access granted on your badge.',
      inspect: { label: 'Risk intake terminal', detail: 'The risk desk is restricted — sign the charter here to get the RISK role on your badge.', category: 'legit', objectives: ['5.2'] },
    },
    // --- RISK DESK: appetite + registers (inspect 'risk-evidence') ---
    {
      id: 'risk-appetite', kind: 'console', x: 17.5, y: 21.5, sprite: 'console', tags: ['risk-evidence'],
      inspect: {
        label: 'Risk appetite statement', category: 'legit', objectives: ['5.2'],
        detail: 'Board-approved: residual loss tolerance LOW (<= $10,000 per year). Customer-data breach: near-zero tolerance. Compliance violations: none tolerated. Reputation damage: low.',
      },
    },
    {
      id: 'reg-flood', kind: 'console', x: 9.5, y: 21.5, sprite: 'console', tags: ['risk-evidence'],
      inspect: {
        label: 'Register R-1: warehouse flood', category: 'legit', objectives: ['5.2'],
        detail: 'Asset value AV $200,000; exposure factor EF 25% (a flood destroys a quarter of the value); floods expected once in 10 years (ARO 0.1).',
      },
    },
    {
      id: 'reg-saas', kind: 'console', x: 11.5, y: 21.5, sprite: 'console', tags: ['risk-evidence'],
      inspect: {
        label: 'Register R-2: SaaS CRM breach', category: 'legit', objectives: ['5.2'],
        detail: 'The vendor CRM will hold customer PII. Estimated single-incident impact $900,000 (fines, notification, churn); likelihood about once in 50 years (ARO 0.02).',
      },
    },
    {
      id: 'reg-eol', kind: 'console', x: 13.5, y: 21.5, sprite: 'console', tags: ['risk-evidence'],
      inspect: {
        label: 'Register R-3: EOL platform', category: 'legit', objectives: ['5.2'],
        detail: 'Ship the product on an end-of-life embedded OS: estimated breach loss $60,000 per year. The insurer excludes EOL systems, and no tested control reaches tolerance.',
      },
    },
    {
      id: 'reg-segment', kind: 'console', x: 15.5, y: 21.5, sprite: 'console', tags: ['risk-evidence'],
      inspect: {
        label: 'Register R-4: lateral movement', category: 'legit', objectives: ['5.2'],
        detail: 'Unmitigated loss estimate $80,000 per year if an intruder reaches the finance VLAN. A segmentation + MFA project costs $8,000 per year and cuts the residual estimate to about $6,000 per year.',
      },
    },
    ...(
      [
        ['opt-flood-mitigate', 9.5, 22.5, 'MITIGATE: flood barriers, $30k/yr', 'wrong', 'risk-flood',
          'Wrong call: barriers cost $30,000/yr to cut an expected loss of $5,000/yr. A control must cost less than the loss it prevents.'],
        ['opt-flood-transfer', 9.5, 23.5, 'TRANSFER: flood insurance, $8k/yr', 'wrong', 'risk-flood',
          'Wrong call: an $8,000/yr premium against a $5,000/yr expected loss overshoots the stated appetite — documented acceptance is free.'],
        ['opt-flood-avoid', 9.5, 24.5, 'AVOID: shut the warehouse', 'wrong', 'risk-flood',
          'Wrong call: closing the warehouse removes a small expected loss and the business function with it. Avoidance is for risk nothing else can reach.'],
        ['opt-flood-accept', 9.5, 25.5, 'ACCEPT: document it, no spend', 'strategy', 'risk-flood',
          'ACCEPTED: SLE = $200,000 x 0.25 = $50,000; ALE = $50,000 x 0.1 = $5,000/yr — inside the <= $10k tolerance. Documented in the register.'],
        ['opt-saas-transfer', 11.5, 22.5, 'TRANSFER: cyber-insurance + indemnity', 'strategy', 'risk-saas',
          'TRANSFERRED: cyber-insurance plus a vendor indemnification clause. Breach exceeds a near-zero appetite and controls cannot reach it, so the financial impact moves to a third party.'],
        ['opt-saas-accept', 11.5, 23.5, 'ACCEPT: budget for the loss', 'wrong', 'risk-saas',
          'Wrong call: accepting leaves ~$18,000/yr of expected loss on customer data against a near-zero appetite — over tolerance by definition.'],
        ['opt-saas-mitigate', 11.5, 24.5, 'MITIGATE: DLP program, $40k/yr', 'wrong', 'risk-saas',
          'Wrong call: $40,000/yr of DLP lowers likelihood but cannot reach a near-zero residual — transfer fits the stated appetite here.'],
        ['opt-saas-avoid', 11.5, 25.5, 'AVOID: cancel the CRM rollout', 'wrong', 'risk-saas',
          'Wrong call: abandoning the CRM sacrifices the business capability outright. When transfer is available, avoidance overshoots the appetite.'],
        ['opt-eol-mitigate', 13.5, 22.5, 'MITIGATE: compensating controls', 'wrong', 'risk-eol',
          'Wrong call: no tested control brings an end-of-life platform within tolerance — mitigation cannot reach it.'],
        ['opt-eol-transfer', 13.5, 23.5, 'TRANSFER: cyber-insurance', 'wrong', 'risk-eol',
          'Wrong call: the insurer explicitly excludes EOL systems — there is no one to transfer to.'],
        ['opt-eol-avoid', 13.5, 24.5, 'AVOID: delay launch until replaced', 'strategy', 'risk-eol',
          'AVOIDED: launch delayed until the OS is replaced. When nothing gets within tolerance and transfer is unavailable, you do not do the activity.'],
        ['opt-eol-accept', 13.5, 25.5, 'ACCEPT: ship and log the risk', 'wrong', 'risk-eol',
          'Wrong call: accepting $60,000/yr of breach loss against a low appetite violates the stated tolerance — and the register knows it.'],
        ['opt-seg-transfer', 15.5, 22.5, 'TRANSFER: insurance quote $25k/yr', 'wrong', 'risk-seg',
          'Wrong call: the quoted premium is $25,000/yr — mitigation reaches tolerance for $8,000/yr. Transfer is overpriced here.'],
        ['opt-seg-mitigate', 15.5, 23.5, 'MITIGATE: segmentation + MFA, $8k/yr', 'strategy', 'risk-seg',
          'MITIGATED: segmentation + MFA cuts the residual estimate to ~$6,000/yr — inside tolerance, and the control costs less than the risk it removes.'],
        ['opt-seg-accept', 15.5, 24.5, 'ACCEPT: log the exposure', 'wrong', 'risk-seg',
          'Wrong call: an $80,000/yr unmitigated loss dwarfs the $10,000 tolerance.'],
        ['opt-seg-avoid', 15.5, 25.5, 'AVOID: shut the finance VLAN', 'wrong', 'risk-seg',
          'Wrong call: you cannot avoid the finance function without stopping the business it serves.'],
      ] as const
    ).map(([id, x, y, name, tag, group, log]) => ({
      id, kind: 'console' as const, x, y, sprite: 'console', group, tags: [tag],
      log,
      inspect: {
        label: name, category: 'legit' as const, objectives: ['5.2'],
        detail: 'Commit this response for the scenario in the register above. Work the numbers from the register and appetite first.',
      },
    })),
    // --- ambient pressure ---
    { id: 'worm-a', kind: 'enemy', x: 16.5, y: 18.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Came in on the vendor\u2019s unmanaged demo laptop and is scanning the meeting floor.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-b', kind: 'enemy', x: 34.5, y: 14.5, sprite: 'worm', ai: 'wander', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Self-propagating process scanning reachable hosts.', category: 'malware', objectives: ['2.4'] } },
    // --- pickups ---
    { id: 'find-tap', kind: 'item', x: 23.5, y: 9.5, sprite: 'tool-tap', tags: ['arsenal-pickup'], grants: { resource: 'tool:tap', amount: 1 },
      inspect: { label: 'Network tap (found)', detail: 'Portable tap — monitor the vendor/MSP link on your own terms.', category: 'item', objectives: ['2.2'] } },
    { id: 'pcap-noc', kind: 'item', x: 25.5, y: 9.5, sprite: 'pcap', tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 1 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item' } },
    { id: 'pcap-server', kind: 'item', x: 35.5, y: 7.5, sprite: 'pcap', tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 1 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item' } },
    { id: 'pcap-closet', kind: 'item', x: 3.5, y: 24.5, sprite: 'pcap', tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 1 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item' } },
    { id: 'pcap-floor', kind: 'item', x: 33.5, y: 19.5, sprite: 'pcap', tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 1 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item' } },
    { id: 'chg-suite', kind: 'item', x: 8.5, y: 9.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-noc', kind: 'item', x: 32.5, y: 10.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-atrium-w', kind: 'item', x: 10.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-atrium-e', kind: 'item', x: 27.5, y: 13.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-risk', kind: 'item', x: 17.5, y: 25.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-suite-closet', kind: 'item', x: 2.5, y: 6.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'med-suite-closet', kind: 'item', x: 3.5, y: 8.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'med-server-closet', kind: 'item', x: 36.5, y: 8.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'med-risk-closet', kind: 'item', x: 2.5, y: 22.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'med-risk', kind: 'item', x: 17.5, y: 22.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  ],
  missionObjectives: [
    { id: 'risk-intake', text: 'Sign the risk charter at the intake terminal', kind: 'interact', tag: 'risk-intake' },
    { id: 'assess', text: 'Demand questionnaire, right-to-audit and independent assessment', kind: 'interact', tag: 'assess-doc', count: 3 },
    { id: 'review', text: 'Review the returned questionnaire, SOC 2 and draft contract', kind: 'inspect', tag: 'vendor-doc', count: 3, requires: ['assess'] },
    { id: 'needs', text: 'Read all four contract requirements on the agreements board', kind: 'inspect', tag: 'need', count: 4 },
    { id: 'agreements', text: 'Match each requirement to the right agreement', kind: 'interact', tag: 'agreement', count: 4, requires: ['review', 'needs'] },
    { id: 'report', text: 'Mark the high-pressure rep and file at the case console', kind: 'report' },
    { id: 'risk-evidence', text: 'Read the appetite statement and all four risk registers', kind: 'inspect', tag: 'risk-evidence', count: 5 },
    { id: 'strategies', text: 'Assign the risk response that fits appetite per scenario', kind: 'interact', tag: 'strategy', count: 4, requires: ['risk-evidence'] },
    { id: 'supply-evidence', text: 'Verify the MSP package against the published digest', kind: 'inspect', tag: 'msp-evidence', count: 2 },
    { id: 'block-update', text: 'Suspend the MSP update channel', kind: 'interact', tag: 'block-update', requires: ['supply-evidence'] },
    { id: 'pressure', text: 'No signing or access granted without an assessment', kind: 'avoid', tag: 'shortcut' },
    { id: 'malicious-update', text: 'Do not push the unverified MSP package', kind: 'avoid', tag: 'deploy-update' },
    { id: 'no-false', text: 'No false reports — one ends the case', kind: 'avoid', tag: 'false-accuse' },
    { id: 'no-overreach', text: 'No unauthorized badge attempts', kind: 'doors' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 300,
    triggers: [
      { id: 'noc-alert', area: [22, 2, 37, 11], kind: 'warn',
        message: 'RMM ALERT: unscheduled MSP package pushing through the trusted channel!' },
      {
        id: 'exit-open',
        after: ['risk-intake', 'agreements', 'strategies', 'block-update', 'report'],
        openDoors: ['exit'], kind: 'good',
        message: 'Assessment complete, agreements matched, risks assigned, report filed, MSP channel suspended. Exit open.',
      },
    ],
    secrets: [
      { id: 'suite-closet', area: [2, 5, 4, 9], label: 'Vendor suite supply closet' },
      { id: 'server-closet', area: [35, 5, 37, 9], label: 'Server room supply closet' },
      { id: 'risk-cache', area: [2, 21, 4, 26], label: 'Risk desk cache' },
    ],
  },
  debriefQuestions: [
    q('q1', ['5.3'], 'Before signing, you want the contractual right to inspect the vendor\u2019s security controls yourself. Which clause do you need?', 2, [
      ['Non-disclosure agreement', 'An NDA protects confidential information. It gives you no right to inspect anything.'],
      ['Service-level agreement', 'An SLA sets performance targets like uptime, not audit access.'],
      ['Right-to-audit clause', 'It contractually allows you (or your auditor) to assess the vendor\u2019s controls.'],
      ['Memorandum of understanding', 'An MOU records intent and is generally not binding, so it cannot enforce audits.'],
    ]),
    q('q2', ['5.3'], 'An agreement guarantees 99.9% monthly uptime and gives service credits when it is missed. What type is it?', 0, [
      ['SLA', 'A service-level agreement defines measurable service levels and the remedies when they are missed.'],
      ['MSA', 'A master service agreement sets general terms for future work. Specific metrics usually sit in SLAs or SOWs under it.'],
      ['SOW / work order', 'A statement of work defines a project\u2019s deliverables and timeline, not ongoing uptime.'],
      ['BPA', 'A business partners agreement covers partnership roles, profit and decision-making.'],
    ]),
    q('q3', ['5.2'], 'An asset worth $200,000 would lose 25% of its value in a flood (exposure factor), and floods are expected once every 10 years. What is the ALE?', 3, [
      ['$50,000', 'That is the SLE (asset value x exposure factor), the loss from ONE flood. ALE multiplies it by the yearly rate.'],
      ['$20,000', 'That multiplies the asset value by the ARO and skips the exposure factor.'],
      ['$500,000', 'That multiplies the SLE by 10 years instead of by the ARO (0.1).'],
      ['$5,000', 'SLE = $200,000 x 0.25 = $50,000. ARO = 1/10 = 0.1. ALE = SLE x ARO = $5,000.'],
    ]),
    q('q4', ['5.2'], 'Leadership buys a cyber-insurance policy to cover breach costs. Which risk strategy is this?', 1, [
      ['Mitigate', 'Mitigation reduces likelihood or impact with controls. Insurance changes neither.'],
      ['Transfer', 'Insurance shifts the financial impact to a third party. The risk is transferred, not removed.'],
      ['Accept', 'Accepting means bearing the loss yourself. Here someone else pays.'],
      ['Avoid', 'Avoidance means stopping the risky activity altogether.'],
    ]),
    q('q5', ['3.1'], 'Your company uses a SaaS CRM. Under the shared-responsibility model, who is responsible for configuring user access and for the data users enter?', 2, [
      ['The provider, for everything', 'SaaS shifts the infrastructure and application to the provider, but never your data or your user access decisions.'],
      ['The provider for the data, the customer for the servers', 'Reversed. In SaaS the provider runs the servers and the customer owns its data.'],
      ['The customer', 'In every cloud model the customer stays responsible for its data, identities and access configuration.'],
      ['The customer, including patching the application\u2019s OS', 'In SaaS the provider patches the platform. Patching the OS is the customer\u2019s job only in IaaS.'],
    ]),
    q('q6', ['2.2'], 'Attackers breach a managed service provider and use its remote-management tool to push ransomware to every customer. What is the threat vector?', 0, [
      ['Supply chain (MSP)', 'The attack arrived through a trusted third party\u2019s access. SY0-701 lists MSPs, vendors and suppliers as supply-chain vectors.'],
      ['Watering hole', 'Watering-hole attacks compromise a website the victims visit.'],
      ['Open service ports', 'The attack used the MSP\u2019s legitimate, trusted channel, not an exposed port.'],
      ['Removable device', 'No physical media was involved.'],
    ]),
  ],
};

export const m10Walkthrough: WalkStep[] = [
  { goto: [7, 14] },
  { interact: 'risk-intake' },
  { goto: [8, 13] },
  { badge: [8, 12] },
  { goto: [8, 11] },
  { goto: [7, 3] },
  { interact: 'demand-questionnaire' },
  { goto: [10, 3] },
  { interact: 'demand-audit' },
  { goto: [13, 3] },
  { interact: 'demand-assessment' },
  { goto: [16, 3] },
  { inspect: 'doc-questionnaire' },
  { goto: [16, 5] },
  { inspect: 'doc-soc2' },
  { goto: [16, 7] },
  { inspect: 'doc-contract' },
  { goto: [6, 3] },
  { inspect: 'need-uptime' },
  { goto: [6, 5] },
  { inspect: 'need-confidential' },
  { goto: [6, 7] },
  { inspect: 'need-migration' },
  { goto: [6, 9] },
  { inspect: 'need-framework' },
  { goto: [9, 5] },
  { interact: 'opt-uptime-sla' },
  { interact: 'opt-conf-nda' },
  { goto: [11, 9] },
  { interact: 'opt-mig-sow' },
  { goto: [9, 11] },
  { interact: 'opt-frame-msa' },
  { goto: [8, 11] },
  { badge: [8, 12] },
  { goto: [30, 17] },
  { interact: 'rep' },
  { goto: [8, 13] },
  { badge: [8, 12] },
  { goto: [16, 3] },
  { interact: 'report-console' },
  { goto: [8, 11] },
  { badge: [8, 12] },
  { goto: [7, 19] },
  { badge: [7, 20] },
  { goto: [10, 21] },
  { inspect: 'reg-flood' },
  { inspect: 'reg-saas' },
  { goto: [14, 21] },
  { inspect: 'reg-eol' },
  { inspect: 'reg-segment' },
  { goto: [17, 22] },
  { inspect: 'risk-appetite' },
  { goto: [8, 25] },
  { interact: 'opt-flood-accept' },
  { goto: [10, 22] },
  { interact: 'opt-saas-transfer' },
  { goto: [14, 24] },
  { interact: 'opt-eol-avoid' },
  { goto: [16, 23] },
  { interact: 'opt-seg-mitigate' },
  { goto: [30, 13] },
  { badge: [30, 12] },
  { goto: [22, 2] },
  { inspect: 'msp-feed' },
  { goto: [25, 3] },
  { inspect: 'vendor-digest' },
  { goto: [23, 4] },
  { interact: 'block-rmm' },
  { wait: 0.2 },
  { goto: [24, 24] },
];

export const m10Teach: MissionTeaching = {
  tagline: 'The vendor wants production access by Monday. The paperwork wants to exist first.',
  situation:
    'A SaaS vendor wants remote access to production next week and their rep is applying pressure. ' +
    'At the same time, a compromised MSP is pushing an unscheduled package through the trusted ' +
    'update channel.',
  orders: [
    { text: 'Run the assessment: demand, review, sign the right agreements.', objective: '5.3' },
    { text: 'Work the risk desk: compute the numbers, match appetite.', objective: '5.2' },
    { text: 'Verify and stop the MSP push. Do not let the rep rush you.', objective: '2.2' },
  ],
  keyTerms: [
    'third-party risk', 'right to audit', 'service-level agreement', 'non-disclosure agreement',
    'master service agreement', 'statement of work', 'annualized loss expectancy', 'risk appetite',
    'supply chain', 'shared responsibility model', 'social engineering',
  ],
  lessons: {
    'risk-intake': {
      objective: '5.2',
      done: 'The risk desk needs its own role — least privilege applies to internal desks, not just server rooms.',
      missed: 'The charter was never signed, so the risk decisions were never made.',
    },
    'assess': {
      objective: '5.3',
      done: 'Questionnaire, right-to-audit and an independent assessment: the three asks that turn "trust us" into verifiable evidence.',
      missed: 'You engaged the vendor without demanding the evidence — the contract would rest on the rep\u2019s word alone.',
    },
    'review': {
      objective: '5.3',
      done: 'The returned docs showed real gaps: shared admin accounts, subcontractors with no locations, an out-of-scope SOC 2 module, a contract missing audit and notification clauses.',
      missed: 'The documents came back but nobody read them — the gaps the vendor left stayed invisible.',
    },
    'needs': {
      objective: '5.3',
      done: 'Each requirement names a distinct need: measurable availability, legal confidentiality, a one-off project, and umbrella legal terms.',
      missed: 'You signed agreements without reading what each one was for.',
    },
    'agreements': {
      objective: '5.3',
      done: 'SLA for measurable service levels, NDA for confidential disclosure, SOW for a defined project, MSA for the umbrella legal terms.',
      missed: 'Some requirements went unsigned or were matched to the wrong instrument — a signed paper that does not cover the need is paperwork, not protection.',
    },
    'bad-choice': {
      objective: '5.3',
      done: 'No wrong instruments were signed.',
      missed: 'A wrong instrument was signed somewhere: MSA for uptime, NDA for service levels, MOU for binding terms. Each instrument has a job — the case file explains each miss.',
    },
    'report': {
      objective: '5.6',
      done: 'The rep showed every social-engineering tell — manufactured urgency, claimed authority, resistance to verification — and was reported through the official channel.',
      missed: 'The rep applied textbook pressure tactics and went unreported. Security awareness reporting exists exactly for this.',
    },
    'risk-evidence': {
      objective: '5.2',
      done: 'You read the appetite statement and every register before deciding — the numbers, not the lobby, set the response.',
      missed: 'Risk calls were made without reading the registers or the appetite they are judged against.',
    },
    'strategies': {
      objective: '5.2',
      done: 'Each response fit the stated appetite: accept the $5k/yr flood ALE inside tolerance, transfer the breach the insurer can carry, avoid the EOL launch nothing could fix, mitigate the VLAN risk for less than the loss.',
      missed: 'Some scenarios got responses that ignore the appetite — a correct-sounding strategy that does not fit tolerance is still wrong.',
    },
    'supply-evidence': {
      objective: '2.2',
      done: 'The pushed package was out-of-window and its digest did not match the vendor\u2019s signed manifest — a compromised MSP is a supply-chain vector, not a maintenance task.',
      missed: 'The MSP package was never verified — trusted channels are exactly what supply-chain attacks abuse.',
    },
    'block-update': {
      objective: '2.2',
      done: 'The trusted channel was suspended until the package could be verified — cutting the vector stops the push.',
      missed: 'The unverified package kept its channel open to every managed host.',
    },
    'pressure': {
      objective: '5.6',
      done: 'No signature, no access, no shortcuts — the fast-track stayed unsigned.',
      missed: 'You signed the pilot and granted access to skip the assessment. Urgency plus authority plus "paperwork later" is social engineering, not sales.',
    },
    'malicious-update': {
      objective: '2.2',
      done: 'The unverified MSP package was never approved for production.',
      missed: 'You pushed an unscheduled package whose digest did not match the manifest — the supply chain went straight to the gateway.',
    },
    'no-false': {
      objective: '5.6',
      done: 'No innocent person was accused — deadline pressure from procurement is process, not social engineering.',
      missed: 'A false report was filed. Pressure on a schedule is not the same as pressure to bypass controls; the tell is what they ask you to skip.',
    },
    'no-overreach': {
      objective: '4.6',
      done: 'No unauthorized badge attempts — the exec express lift stayed untouched.',
      missed: 'You swiped at a door your role does not cover. Least privilege applies to you too, and every swipe is logged.',
    },
    'exit': {
      objective: '5.3',
      done: 'Assessment done, agreements matched, risks assigned, rep reported, MSP push stopped.',
      missed: 'You left before the vendor file was finished.',
    },
  },
  examTip: 'Vendor risk on the exam: agreements each have a job — NDA protects information, SLA sets measurable service levels, MSA is the umbrella, SOW is one project, MOU/BPA is non-binding intent. Risk math: SLE = AV x EF, ALE = SLE x ARO; the response must fit the STATED appetite. And an MSP\u2019s trusted access is a supply-chain vector.',
};

// Enemy pressure: the pushed package drops implants once the player verifies it,
// and hosts already hit wake up in the NOC.
addThreatEncounter(m10, 'trojan-floor', 'trojan', 8, {
  id: 'msp-push-floor', after: ['supply-evidence'], kind: 'bad',
  message: 'The pushed package drops trojan implants on managed hosts!',
}, [2, 13, 37, 19]);
addThreatEncounter(m10, 'trojan-racks', 'trojan', 5, {
  id: 'msp-push-noc', after: ['supply-evidence'], kind: 'bad',
  message: 'Trojan implants from the unverified package light up across the NOC racks!',
}, [22, 2, 37, 11]);
addThreatEncounter(m10, 'trojan-noc', 'trojan', 3, {
  id: 'noc-wake', area: [22, 2, 37, 11], kind: 'bad',
  message: 'Hosts already hit by the earlier MSP push wake up in the racks!',
}, [22, 2, 37, 11]);

// F1: encounter pacing — opening skirmish, room reveals, exit pressure, supplies.
liveThreats(m10, 'open-rat', 'rat', 1, [12, 13, 37, 19]);
addThreatEncounter(m10, 'vendor-rat', 'rat', 4, {
  id: 'vendor-ambush', area: [2, 2, 17, 11], kind: 'bad',
  message: 'Vendor remote-access implants wake in the west office.',
}, [2, 2, 17, 11]);
addThreatEncounter(m10, 'risk-trojan', 'trojan', 3, {
  id: 'risk-ambush', area: [22, 2, 37, 11], kind: 'bad',
  message: 'Trojans ride the third-party tools in the east lab.',
}, [22, 2, 37, 11]);
addThreatEncounter(m10, 'hall-rat', 'rat', 2, {
  id: 'hall-ambush-a', area: [2, 13, 37, 19], kind: 'bad',
  message: 'RATs pivot through the central hall.',
}, [2, 13, 21, 19]);
addThreatEncounter(m10, 'hall-worm', 'worm', 2, {
  id: 'hall-ambush-b', area: [2, 13, 37, 19], kind: 'bad',
}, [22, 13, 37, 19]);
addThreatEncounter(m10, 'exit-rat', 'rat', 3, {
  id: 'exit-ambush', area: [18, 21, 27, 26], kind: 'bad',
  message: 'The third-party foothold tries to cut off your exit.',
}, [18, 21, 27, 26]);
m10.entities.push(
  { id: 'chg-w', kind: 'item', ...floorSpot(m10, [2, 2, 17, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-e', kind: 'item', ...floorSpot(m10, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-c', kind: 'item', ...floorSpot(m10, [12, 13, 37, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-s', kind: 'item', ...floorSpot(m10, [18, 21, 27, 26]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'med-c', kind: 'item', ...floorSpot(m10, [12, 13, 37, 19]), sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 }, inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

m10.entities.push(
  { id: 'chg-x1', kind: 'item', ...floorSpot(m10, [12, 13, 37, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x2', kind: 'item', ...floorSpot(m10, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
);
