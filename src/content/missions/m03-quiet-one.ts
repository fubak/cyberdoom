import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, mixedThreatEncounter, floorSpot, liveThreats, retex, setMapCell } from './campaign-map';

/**
 * M3 "The Quiet One": insider threat, correlating data sources.
 * Difficulty 3. Nobody's inspect text gives a verdict. Each log shows raw
 * entries and three employees each appear in exactly one log with an innocent
 * explanation. Only the insider appears in all three.
 * Critical path, two concept gates:
 *   1. RECORDS door (investigator role) after Legal/HR opens a case, which
 *      itself needs the badge-log evidence first.
 *   2. EXIT door opens only after a correct report, which needs all 3
 *      evidence sources. A false report FAILS the mission.
 * Loop: lobby → open floor → east hall → security office → lobby.
 * Secrets: archive behind the floor's west wall, old mail room up north.
 */
export const m03: Mission = {
  id: 'm03',
  title: 'THE QUIET ONE',
  difficulty: 3,
  objectives: ['2.1', '2.4', '4.9', '3.3', '4.8'],
  briefing:
    'A DLP alert fired overnight: confidential R&D designs left the network, taken with valid credentials. ' +
    'Four employees on this floor had the opportunity. MOUSE (2) pulls up what the logs hold on a person: ' +
    'badge records, file-server access, endpoint and application logs. ' +
    'Press E on a suspect to mark them; the security console then files the report. ' +
    'Accuse the wrong person and an innocent colleague\'s career burns. ' +
    'Malware is also loose on the floor.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'mfa', 'tap'],
  map: {
    grid: [
    '############################SSSSSSSSSSSS',
    '###BBBBBBBBB################S....EE....S',
    '###B.......B################S..........S',
    '###B.......B################SSSSSXXSSSSS',
    '###B.......B################S..........S',
    '###B.......B################S..........S',
    '###B.......B################S..........S',
    '###BBBB2BBBB################S..SSSSSS..S',
    'BBBB........................S..........S',
    'B..B........................S..........S',
    'B..1........................S..SSSSSS..S',
    'B..B...###...###...###......S..........S',
    'B..B....................S...V..........S',
    'BBBB....................S...S..SSSSSS..S',
    '####....................S...S..........S',
    '####...###...###...###......S..........S',
    '####........................S..SS..SS..S',
    '####........................S..........S',
    '####........................S..........S',
    '####........................S..........S',
    '###BBBBBB..BBBBBB###..######SSSSSSSSSSSS',
    '###B............B###..#######.........##',
    '###B............B###..#######.........##',
    '###B..S...S.BB..B........####.........##',
    '###B........BB..B........####.##......##',
    '###B............d........g....##......##',
    '###B..S...S.....B........####.........##',
    '###B..S...S.....B........####.........##',
    '###B............B........####.........##',
    '###BBBBBBBTBBBBBB#################U#####',
    '##########.#######################.#####',
    '##########.#######################.#####',
    '######.............................#####',
    '######.............................#####',
    '###############4#########5##############',
    '##############...#######...#############',
    '########################################',
  ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      'S': { kind: 'wall', tex: 'wall-server' },
      'B': { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      'E': { kind: 'exit', tex: 'exit' },
      'd': { kind: 'door', tex: 'door', doorId: 'secoffice' },
      'g': { kind: 'door', tex: 'door', doorId: 'legal' },
      'V': { kind: 'door', tex: 'door', doorId: 'records', accessRole: 'investigator', mfa: true },
      'X': {
        kind: 'door', tex: 'door', doorId: 'exit-door', locked: true,
        lockText: 'Building is in lockdown until the insider case is reported',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-archive', secret: true },
      '2': { kind: 'door', tex: 'wall-brick', doorId: 'secret-mail', secret: true },
      '3': { kind: 'door', tex: 'wall-brick', doorId: 'secret-pillar-cache', secret: true },
    },
    spawn: { x: 9.5, y: 26.5, angle: -0.2783 },
    defaultLight: 0.7,
    lights: lightRects([[4, 21, 15, 28, 0.85], [5, 22, 11, 28, 1.0], [4, 8, 27, 19, 0.7], [17, 23, 24, 28, 0.8], [29, 21, 37, 28, 0.75], [29, 4, 38, 19, 0.45], [29, 1, 38, 2, 1.0], [1, 9, 2, 12, 0.3], [4, 2, 10, 6, 0.35]]),
  },
  entities: [
    {
      id: 'dana', kind: 'npc', x: 8.5, y: 12.5, sprite: 'npc-f', ai: 'stand', reportable: true, culprit: true,
      evidenceRequired: 3,
      inspect: {
        label: 'R. Kell, R&D lead',
        detail: 'BADGE: Sun 03:12 entry, R&D wing (usually Mon-Fri 09-17). FILE SRV: 1,284 files / 40 GB read from \\\\designs\\confidential; her project share is \\\\designs\\atlas. ENDPOINT: USB mass-storage mounted 03:40, 40 GB written. HR: promotion denied last week.',
        category: 'person',
        objectives: ['2.1', '2.4', '4.9'],
        flags: ['after-hours badge-in', 'bulk access outside role', 'USB mass-storage write'],
      },
    },
    {
      id: 'marcus', kind: 'npc', x: 14.5, y: 16.5, sprite: 'npc-m', ai: 'stand', reportable: true,
      evidenceRequired: 3,
      inspect: {
        label: 'D. Ortiz, developer',
        detail: 'APP LOG: 9 git commits 22:10-23:40 to atlas-api (his team\'s repo). BADGE: late exits all of release week. FILE SRV: atlas share only. ENDPOINT: no removable media.',
        category: 'person',
        objectives: ['4.9'],
      },
    },
    {
      id: 'priya', kind: 'npc', x: 20.5, y: 12.5, sprite: 'npc-f', ai: 'stand', reportable: true,
      evidenceRequired: 3,
      inspect: {
        label: 'S. Patel, HR specialist',
        detail: 'OS SECURITY LOG: ~300 personnel records opened today; ~300/day for the past 2 years. BADGE: 08:30-17:15. ENDPOINT: no removable media. DLP: no alerts.',
        category: 'person',
        objectives: ['4.9'],
      },
    },
    {
      id: 'tom', kind: 'npc', x: 26.5, y: 18.5, sprite: 'npc-suit', ai: 'stand', reportable: true,
      evidenceRequired: 3,
      inspect: {
        label: 'J. Lee, intern',
        detail: 'Observed: avoids eye contact, fidgets when security walks past. BADGE: 09:00-17:00. FILE SRV: intern share only. ENDPOINT: no removable media.',
        category: 'person',
      },
    },
    {
      id: 'badge-log', kind: 'console', x: 23.5, y: 27.5, sprite: 'console', tags: ['badge-log', 'evidence'],
      implicates: ['dana', 'marcus'],
      log: 'BADGE LOG: after-hours entries, last 7 days\nSun 03:12 R.KELL (R&D lead): R&D wing (usual Mon-Fri 09-17)\nThu 23:44 D.ORTIZ (Dev): lobby exit, release week\nS.PATEL, J.LEE: none',
      inspect: { label: 'Physical access control log', detail: 'Badge reader events for every door.', category: 'legit', objectives: ['4.9'] },
    },
    {
      id: 'legal', kind: 'console', x: 36.5, y: 27.5, sprite: 'console', tags: ['case'],
      grants: { resource: 'role:investigator', amount: 1 },
      log: 'LEGAL/HR: case #883 opened on documented after-hours access.\nInvestigator access to DLP and endpoint logs approved. Legal hold: preserve all evidence.',
      inspect: { label: 'Legal / HR case desk', detail: 'Investigations into employees need a documented reason and authorization.', category: 'legit', objectives: ['4.9'] },
    },
    {
      id: 'dlp', kind: 'console', x: 37.5, y: 4.5, sprite: 'console', tags: ['evidence'],
      implicates: ['dana'],
      log: 'DLP ALERTS: overnight\nSun 03:31 rkell: 1,284 files / 40 GB read from \\\\designs\\confidential (role share: \\\\designs\\atlas)\nspatel: ~300 HR records/day inside HRIS (no outbound transfer)',
      inspect: { label: 'DLP console', detail: 'Data-loss-prevention alerts on outbound transfers.', category: 'legit', objectives: ['4.9'] },
    },
    {
      id: 'usb-audit', kind: 'console', x: 29.5, y: 18.5, sprite: 'console', tags: ['evidence'],
      implicates: ['dana'],
      log: 'ENDPOINT USB AUDIT\nSun 03:40 RKELL-LT: USB mass storage mounted, 40 GB written\nDORTIZ-LT, SPATEL-PC, JLEE-PC: no removable media',
      inspect: { label: 'Endpoint (EDR) USB audit', detail: 'Removable-media events reported by endpoint agents.', category: 'legit', objectives: ['4.9'] },
    },
    {
      id: 'report-console', kind: 'console', x: 37.5, y: 18.5, sprite: 'console', tags: ['report-console'],
      log: 'INSIDER REPORT: press E on the employee to mark them, then file here. The case needs all three evidence sources.',
      inspect: { label: 'Case reporting console', detail: 'Files the insider report to Legal/HR and the SOC.', category: 'legit', objectives: ['4.9'] },
    },
    { id: 'trojan-floor', kind: 'enemy', x: 16.5, y: 9.5, sprite: 'trojan', ai: 'wander', hp: 3, infected: true, tags: ['malware'],
      inspect: { label: 'Trojan', detail: 'Bundled with a "free PDF converter".', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-floor', kind: 'enemy', x: 25.5, y: 9.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Self-propagating across file shares.', category: 'malware', objectives: ['2.4'] } },
    { id: 'bomb-a', kind: 'enemy', x: 33.5, y: 16.5, sprite: 'logicbomb', ai: 'chase', hp: 1, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Logic-bomb payload', detail: 'Dropped by a scheduled task set to fire when the logs were opened.', category: 'malware', objectives: ['2.4'] } },
    { id: 'bomb-b', kind: 'enemy', x: 38.5, y: 11.5, sprite: 'logicbomb', ai: 'chase', hp: 1, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Logic-bomb payload', detail: 'Dropped by a scheduled task set to fire when the logs were opened.', category: 'malware', objectives: ['2.4'] } },
    { id: 'bomb-rw', kind: 'enemy', x: 29.5, y: 5.5, sprite: 'logicbomb', ai: 'chase', hp: 1, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Logic-bomb payload', detail: 'Scheduled execution condition recorded in the records share.', category: 'malware', objectives: ['2.4'] } },
    { id: 'chg-lobby', kind: 'item', x: 14.5, y: 22.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 2 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-floor', kind: 'item', x: 4.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 2 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-legal', kind: 'item', x: 30.5, y: 22.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 2 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'med-archive', kind: 'item', x: 1.5, y: 10.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'chg-mail', kind: 'item', x: 5.5, y: 3.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-open-plan', kind: 'item', x: 19.5, y: 24.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-open-plan-cache', kind: 'item', x: 17.5, y: 24.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-open-plan-west', kind: 'item', x: 23.5, y: 23.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-east-hall', kind: 'item', x: 30.5, y: 21.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'med-mail', kind: 'item', x: 9.5, y: 5.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    {
      // EDR console sits on the walk to the (required) legal console — unmissable and lit
      id: 'find-edr', kind: 'item', x: 33.5, y: 27.5, sprite: 'tool-edr',
      tags: ['arsenal-pickup'], grants: { resource: 'tool:edr', amount: 1 },
      inspect: { label: 'EDR console (found)', detail: 'Endpoint detection and response console with containment.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'cell-floor', kind: 'item', x: 10.5, y: 9.5, sprite: 'edr-cell',
      tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
      inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'cell-records', kind: 'item', x: 33.5, y: 14.5, sprite: 'edr-cell',
      tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
      inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'cell-legal', kind: 'item', x: 31.5, y: 26.5, sprite: 'edr-cell',
      tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
      inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'pcap-floor', kind: 'item', x: 21.5, y: 17.5, sprite: 'pcap',
      tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'pcap-west', kind: 'item', x: 5.5, y: 14.5, sprite: 'pcap',
      tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
    },
  ],
  missionObjectives: [
    { id: 'badge', text: 'Pull the after-hours badge log (security office)', kind: 'interact', tag: 'badge-log' },
    { id: 'case', text: 'Get a case opened with Legal/HR', kind: 'interact', tag: 'case', requires: ['badge'] },
    { id: 'evidence', text: 'Collect 3 evidence sources (badge, DLP, USB audit)', kind: 'interact', tag: 'evidence', count: 3 },
    { id: 'report', text: 'Report the insider (mark, then file at the case console)', kind: 'report', requires: ['evidence'] },
    { id: 'no-false', text: 'No false accusations (one ends the case)', kind: 'avoid', tag: 'false-accuse' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 240,
    triggers: [
      { id: 'logic-bomb', after: ['evidence'], spawn: ['bomb-a', 'bomb-b', 'bomb-rw'], kind: 'bad',
        message: 'A scheduled task fired in the records wing: the insider left a logic bomb!' },
      { id: 'lockdown-lift', after: ['report'], openDoors: ['exit-door'], kind: 'good',
        message: 'Case filed: lockdown lifted, exit open.' },
    ],
    secrets: [
      { id: 'archive', area: [1, 9, 2, 12], label: 'Paper archive', grant: { resource: 'integrity', amount: 40 } },
      { id: 'mail', area: [4, 2, 10, 6], label: 'Old mail room', grant: { resource: 'integrity', amount: 40 } },
      { id: 'pillar-cache', area: [9, 11, 9, 11], label: 'Pillar cache', grant: { resource: 'usb-charge', amount: 14 } },
    ],
  },
  debriefQuestions: [
    {
      id: 'q1',
      prompt: 'An R&D lead, denied promotion last week, uses her own valid access to copy 40 GB of confidential designs to a personal USB drive. Which threat actor and motivation BEST fit?',
      objectives: ['2.1'],
      options: [
        { id: 'a', text: 'Nation-state; espionage', correct: false, explanation: 'Nation-states sometimes recruit insiders, but the person acting here is an employee using authorized access. Nothing points to a foreign government.' },
        { id: 'b', text: 'Insider threat; data exfiltration (likely driven by revenge)', correct: true, explanation: 'Authorized access misused from inside is the definition of an insider threat. Copying data out is exfiltration, and the denied promotion suggests revenge.' },
        { id: 'c', text: 'Hacktivist; philosophical/political beliefs', correct: false, explanation: 'Hacktivists act for a cause and usually publicize it. A quiet copy to a personal drive after a grievance does not fit.' },
        { id: 'd', text: 'Unskilled attacker; disruption/chaos', correct: false, explanation: 'Unskilled attackers are outsiders running ready-made tools. This person needed no tools, just legitimate access.' },
      ],
    },
    {
      id: 'q2',
      prompt: 'Which observation set is the STRONGEST evidence of an insider exfiltrating data?',
      objectives: ['2.4'],
      options: [
        { id: 'a', text: 'A developer committing code at 23:40 during release week, all to his own repository', correct: false, explanation: 'One unusual-hours signal that matches his role and a known deadline. It is innocent until other sources corroborate it.' },
        { id: 'b', text: 'An HR specialist opening hundreds of personnel records a day', correct: false, explanation: 'High volume, but within the role baseline, and the data never leaves the HR system. Volume only matters compared with what is normal for the job.' },
        { id: 'c', text: 'An intern who seems nervous and avoids security staff', correct: false, explanation: 'Demeanor is an impression, not a technical indicator. Acting on it leads to false accusations.' },
        { id: 'd', text: 'A 03:12 Sunday badge-in, bulk access to files outside the user\u2019s project, then a USB mass-storage write', correct: true, explanation: 'Three independent signals (physical access, file access outside role, an exfiltration channel) all point the same way. Corroboration is what makes it actionable.' },
      ],
    },
    {
      id: 'q3',
      prompt: 'You need to prove the files were copied to a USB drive on the suspect\u2019s laptop. Which data source shows this MOST directly?',
      objectives: ['4.9', '3.3'],
      options: [
        { id: 'a', text: 'Firewall logs', correct: false, explanation: 'Copying to USB never touches the network, so the firewall saw nothing.' },
        { id: 'b', text: 'Endpoint logs (OS/EDR device-connection and file-write events)', correct: true, explanation: 'Only the host records that a mass-storage device was mounted and which files were written to it.' },
        { id: 'c', text: 'Badge access logs', correct: false, explanation: 'They place her in the building at 03:12, which is useful for correlation, but they cannot show what happened on the laptop.' },
        { id: 'd', text: 'Vulnerability scan results', correct: false, explanation: 'Scans list weaknesses in systems, not what a user did with them.' },
      ],
    },
    {
      id: 'q4',
      prompt: 'The exfiltrated files are unreleased product designs that give the company its competitive edge. How are they BEST described?',
      objectives: ['3.3'],
      options: [
        { id: 'a', text: 'Regulated data', correct: false, explanation: 'Regulated data is controlled by law or regulation, such as health records, PII or cardholder data. Product designs are valuable but not regulated.' },
        { id: 'b', text: 'Public data', correct: false, explanation: 'Unreleased designs are deliberately kept from competitors. Public data can be disclosed freely.' },
        { id: 'c', text: 'Intellectual property / trade secret, classified confidential', correct: true, explanation: 'Unreleased designs are intellectual property, and keeping them secret is what gives them value, so they are a trade secret. Confidential classification requires the strongest controls, such as DLP and USB restrictions.' },
        { id: 'd', text: 'Financial information', correct: false, explanation: 'Financial information means records like accounts, payroll and transactions. Designs have value, but they are not financial records.' },
      ],
    },
    {
      id: 'q5',
      prompt: 'You have three corroborating indicators against one employee. What should you do NEXT?',
      objectives: ['4.8', '2.4'],
      options: [
        { id: 'a', text: 'Report through the incident response process and preserve the evidence with chain of custody', correct: true, explanation: 'Escalating through IR keeps the investigation coordinated with HR and legal. Chain of custody keeps the logs and device usable as evidence.' },
        { id: 'b', text: 'Confront the employee at their desk', correct: false, explanation: 'Confronting her tips her off, so evidence may be destroyed, and it puts you at personal and legal risk. Containment is a coordinated IR step.' },
        { id: 'c', text: 'Remotely wipe their laptop to stop further leaks', correct: false, explanation: 'Wiping destroys the evidence you need. Containment should isolate the device while preserving it.' },
        { id: 'd', text: 'Quietly keep watching for a few weeks to collect more', correct: false, explanation: 'Confidential data is already leaving. Waiting without reporting lets the damage grow and leaves the response to one person.' },
      ],
    },
    {
      id: 'q6',
      prompt: 'Four actors hit the same industry in one quarter: a state-funded group quietly holds access for years to steal research; a crime crew runs ransomware for payouts; activists deface sites for a cause; an intern stumbles into a breach. What primarily distinguishes them?',
      objectives: ['2.1'],
      options: [
        { id: 'a', text: 'Their motivations and resources — espionage, financial gain, ideology, and an insider acting accidentally', correct: true, explanation: 'SY0-701 distinguishes threat actors by attributes: motivation (espionage, financial gain, ideology, revenge, chaos), plus resources/funding and sophistication. Nation-state, organized crime, hacktivist and unskilled insider each map to a different pairing.' },
        { id: 'b', text: 'Their physical locations — internal actors are always inside the building', correct: false, explanation: 'Internal vs external is about authorized access, not geography. A disgruntled insider can attack from home, and an external group can recruit someone inside.' },
        { id: 'c', text: 'The tools they use — ransomware means organized crime every time', correct: false, explanation: 'Tools are shared across actors: nation-states also run ransomware, and criminals also conduct espionage. Motivation and funding, not the malware family, distinguish them.' },
        { id: 'd', text: 'Whether they are caught — actors who are caught were always insiders', correct: false, explanation: 'Attribution difficulty does not define the actor type. Each group has external and internal members and a different intent.' },
      ],
    },
  ],
};

export const m03Walkthrough: WalkStep[] = [
  { goto: [15, 25] },
  { use: [16, 25] },
  { goto: [23, 26] },
  { interact: 'badge-log' },
  { goto: [24, 25] },
  { use: [25, 25] },
  { goto: [36, 26] },
  { interact: 'legal' },
  { goto: [27, 12] },
  { badge: [28, 12] },
  { goto: [37, 5] },
  { interact: 'dlp' },
  { goto: [29, 17] },
  { interact: 'usb-audit' },
  { goto: [9, 12] },
  { inspect: 'dana' },
  { interact: 'dana' },
  { goto: [37, 17] },
  { interact: 'report-console' },
  { wait: 0.2 },
  { goto: [33, 1] },
];

export const m03Teach: MissionTeaching = {
  tagline: '40 GB walked out on a valid login. Find out whose.',
  situation:
    'A DLP alert fired overnight: confidential R&D designs left the network. The data was taken from inside, using valid credentials. Four employees had the opportunity. Only one has the evidence against them.',
  orders: [
    { text: 'Pull the log evidence on everyone who had the opportunity.', objective: '4.9' },
    { text: 'Decide who the evidence actually supports.', objective: '2.4' },
    { text: 'Escalate your finding through the proper channel.', objective: '4.8' },
  ],
  keyTerms: ['threat actor', 'insider threat', 'data exfiltration', 'correlation', 'endpoint logs', 'data classification', 'intellectual property', 'chain of custody'],
  lessons: {
    'report': {
      objective: '2.1',
      done: 'You reported the right person. Badge, file-server and endpoint logs each showed one piece, and correlated they told the whole story (4.9). That is how insider cases are built.',
      missed: 'The insider is still on the floor with confidential designs. The answer was in the logs: an after-hours badge-in, bulk access outside her role and a USB write, all from one person.',
    },
    'no-false': {
      objective: '2.4',
      done: 'No innocent colleague was accused. You waited until the evidence corroborated before you acted.',
      missed: 'You accused someone the evidence did not support. Working late, handling lots of data for the role, or looking nervous are not indicators on their own. False accusations hurt people and tip off the real culprit.',
    },
    'exit': {
      objective: '4.8',
      done: 'Case handed off to incident response.',
      missed: 'You did not reach the exit.',
    },
    'badge': {
      objective: '4.9',
      done: 'You started with the physical access log: badge readers record who entered where and when.',
      missed: 'You never pulled the badge log, so nothing placed anyone on site after hours.',
    },
    'case': {
      objective: '4.8',
      done: 'You opened a documented case with Legal/HR before pulling employee DLP and endpoint records, with a legal hold to preserve evidence.',
      missed: 'No case was opened. Investigating an employee needs authorization and a legal hold, or the evidence may be unusable.',
    },
    'evidence': {
      objective: '4.9',
      done: 'You correlated three independent sources: badge, DLP and endpoint USB audit. Only one person appears in all three.',
      missed: 'You did not collect all three sources. One log alone has an innocent explanation; correlation is what makes it actionable.',
    },
  },
  examTip: 'For investigation questions, pick the data source that actually recorded the event. USB copy = endpoint logs. Who entered the building = badge/physical logs. What crossed the network = firewall/NetFlow/packet capture. Who logged in where = OS security logs.',
};

setMapCell(m03.map, 8, 10, 'B');
setMapCell(m03.map, 9, 10, 'B');
setMapCell(m03.map, 10, 10, 'B');
setMapCell(m03.map, 8, 11, '3');
setMapCell(m03.map, 9, 11, '.');
setMapCell(m03.map, 8, 23, 'S');
setMapCell(m03.map, 10, 23, 'S');
setMapCell(m03.map, 8, 24, 'S');
setMapCell(m03.map, 10, 24, 'S');
m03.map.lights = { ...m03.map.lights, ...lightRects([[7, 21, 11, 25, 1]]) };
addThreatEncounter(m03, 'logicbomb-center', 'logicbomb', 5, {
  id: 'open-floor-bombwave',
  area: [22, 14, 24, 17],
  kind: 'bad',
  message: 'A row of logic bombs armed across the open-plan floor.',
}, [12, 10, 24, 19]);
addThreatEncounter(m03, 'logicbomb-east', 'logicbomb', 5, {
  id: 'records-bombwave',
  area: [35, 16, 37, 18],
  kind: 'bad',
  message: 'The records wing scheduled another logic-bomb wave.',
}, [29, 4, 38, 19]);
addThreatEncounter(m03, 'logicbomb-report', 'logicbomb', 5, {
  id: 'report-bombwave',
  after: ['report'],
  kind: 'bad',
  message: 'The insider’s final scheduled payload activated after the report.',
}, [5, 20, 24, 28]);

// F1: encounter pacing — one live wanderer plus a charge top-up.
liveThreats(m03, 'open-worm', 'worm', 1, [3, 21, 37, 28]);
m03.entities.push(
  { id: 'chg-s', kind: 'item', ...floorSpot(m03, [3, 21, 37, 28]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
);

// — rF2 landmarks: east records wing = grid floor + console evidence wall;
// pillar plaza (centre) = grid floor; SW brick office = dim rust bullpen.
m03.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m03.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m03, [28, 1, 38, 19], 'floor', ',');
retex(m03, [4, 8, 27, 19], 'floor', ',');
retex(m03, [3, 20, 15, 28], 'floor', ';');
m03.map.lights = { ...m03.map.lights, ...lightRects([[29, 4, 38, 19, 0.7], [4, 20, 15, 28, 0.55]]) };
m03.entities.push(
  { id: 'rec-wall-a', kind: 'prop', x: 31.5, y: 5.5, sprite: 'console' },
  { id: 'rec-wall-b', kind: 'prop', x: 34.5, y: 5.5, sprite: 'console' },
  { id: 'ops-desk-a', kind: 'prop', x: 6.5, y: 21.5, sprite: 'workstation' },
  { id: 'pillar-stash', kind: 'item', x: 9.5, y: 11.5, sprite: 'pcap', tags: ['arsenal-pickup'],
    grants: { resource: 'pcap', amount: 6 } },
);

// rF4: 40x37 silhouette — long south mail-gallery bar with a second (locked)
// post-objective exit back into the lobby and two secret storerooms off it.
m03.map.legend.T = { kind: 'door', tex: 'door', doorId: 'rf4-gallery' };
m03.map.legend.U = { kind: 'door', tex: 'door', doorId: 'rf4-gallery-back', locked: true,
  lockText: 'The gallery return door unlocks once the insider report is filed.' };
m03.map.legend['4'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-mail-cache-a' };
m03.map.legend['5'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-mail-cache-b' };
m03.entities.push(
  { id: 'rf4-mail-cache-a-item', kind: 'item', x: 15.5, y: 35.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-mail-cache-b-item', kind: 'item', x: 25.5, y: 35.5, sprite: 'medkit' },
  { id: 'rf4-gallery-prop', kind: 'prop', x: 20.5, y: 32.5, sprite: 'workstation' },
);
m03.script!.secrets!.push(
  { id: 'rf4-mail-cache-a', area: [14, 35, 16, 35], label: 'Dead-letter storeroom', grant: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-mail-cache-b', area: [24, 35, 26, 35], label: 'Intercepted parcel cage', grant: { resource: 'integrity', amount: 20 } },
);
mixedThreatEncounter(m03, 'gallery-mix', [['worm', 3], ['trojan', 1]],
  { id: 'gallery-ambush', area: [6, 32, 34, 33], kind: 'bad',
    message: 'The mail gallery is not empty — contraband processes run the aisle.' },
  [6, 32, 34, 33]);
m03.script!.triggers!.push({ id: 'gallery-back-open', after: ['report'], kind: 'good',
  message: 'Report filed — the gallery return door unlocks for a fast exit.',
  openDoors: ['rf4-gallery-back'] });
m03.map.lights = { ...m03.map.lights, ...lightRects([[6, 32, 34, 33, 0.5], [14, 35, 16, 35, 0.85], [24, 35, 26, 35, 0.85], [15, 33, 15, 33, 0.35], [25, 33, 25, 33, 0.35]]) };
