import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';

/**
 * M3 "The Quiet One" — insider threat, correlating data sources.
 * Difficulty 6. Inspect NPCs with the Mouse to find the insider whose
 * indicators corroborate across data sources (badge, endpoint, DLP), then
 * report the correct person at the console. False accusations cost points.
 * Malware processes roam the floor.
 */
export const m03: Mission = {
  id: 'm03',
  title: 'THE QUIET ONE',
  difficulty: 6,
  objectives: ['2.1', '2.4', '4.9', '3.3', '4.8'],
  briefing:
    'A DLP alert fired overnight: confidential R&D designs left the network, taken with valid credentials. ' +
    'Four employees on this floor had the opportunity. MOUSE (2) pulls up what the logs hold on a person: ' +
    'badge records, file-server access, endpoint and application logs. ' +
    'KEYBOARD (1) flags a suspect, and on the security console it files the report. ' +
    'Accuse the wrong person and an innocent colleague\'s career burns. ' +
    'Malware is also loose on the floor.',
  authorizedRoles: ['analyst'],
  map: {
    grid: [
      '################',
      '#......#......d#',
      '#.###..#..###..#',
      '#.#....#....#..#',
      '#.#.##.#.##.#..#',
      '#...#.....#....#',
      '###.#.###.#.####',
      '#...#.....#....#',
      '#.#.#####.#.##.#',
      '#.#.......#....#',
      '#....E.........#',
      '################',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-server' },
      '.': { kind: 'floor', tex: 'floor' },
      'd': { kind: 'door', tex: 'door', doorId: 'ops-door', accessRole: 'analyst' },
      'E': { kind: 'exit', tex: 'exit' },
    },
    spawn: { x: 1.5, y: 1.5, angle: 0 },
    defaultLight: 0.75,
  },
  entities: [
    {
      id: 'insider', kind: 'npc', x: 11, y: 7.5, sprite: 'npc-suit',
      ai: 'wander', reportable: true, culprit: true,
      inspect: {
        label: 'R. Kell, R&D lead',
        detail: 'BADGE: Sun 03:12 entry, R&D wing (usually Mon-Fri 09-17). FILE SRV: 1,284 files / 40 GB read from \\\\designs\\confidential; his project share is \\\\designs\\atlas. ENDPOINT: USB mass-storage mounted 03:40, 40 GB written. HR: promotion denied last week.',
        category: 'person',
        objectives: ['2.1', '2.4', '4.9'],
        flags: ['after-hours badge-in', 'bulk access outside role', 'USB mass-storage write'],
      },
    },
    {
      id: 'dev', kind: 'npc', x: 5, y: 3.5, sprite: 'npc-m',
      ai: 'wander', reportable: true, culprit: false,
      inspect: {
        label: 'D. Ortiz, developer',
        detail: 'APP LOG: 9 git commits 22:10-23:40 to atlas-api (his team\'s repo). BADGE: late exits all of release week. FILE SRV: atlas share only. ENDPOINT: no removable media.',
        category: 'person',
        objectives: ['4.9'],
      },
    },
    {
      id: 'hr', kind: 'npc', x: 9, y: 9.5, sprite: 'npc-f',
      ai: 'stand', reportable: true, culprit: false,
      inspect: {
        label: 'S. Patel, HR specialist',
        detail: 'OS SECURITY LOG: ~300 personnel records opened today; ~300/day for the past 2 years. BADGE: 08:30-17:15. ENDPOINT: no removable media. DLP: no alerts.',
        category: 'person',
        objectives: ['4.9'],
      },
    },
    {
      id: 'intern', kind: 'npc', x: 3, y: 9.5, sprite: 'npc-m',
      ai: 'wander', reportable: true, culprit: false,
      inspect: {
        label: 'J. Lee, intern',
        detail: 'Observed: avoids eye contact, fidgets when security walks past. BADGE: 09:00-17:00. FILE SRV: intern share only. ENDPOINT: no removable media.',
        category: 'person',
      },
    },
    {
      id: 'console', kind: 'console', x: 13, y: 1.5, sprite: 'console',
      tags: ['report-console'],
      inspect: {
        label: 'Security console',
        detail: 'Incident reporting channel. Use the KEYBOARD here to report your marked suspect. Hand over the evidence; do not confront them yourself (4.8).',
        category: 'item',
        objectives: ['4.8'],
      },
    },
    {
      id: 'worm1', kind: 'enemy', x: 6, y: 5.5, sprite: 'worm',
      ai: 'chase', hp: 1, infected: true, tags: ['infected'],
      inspect: { label: 'Worm', detail: 'Self-replicating malware that spreads with no user action (2.4). One scanner charge.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'trojan1', kind: 'enemy', x: 10, y: 3.5, sprite: 'trojan',
      ai: 'chase', hp: 1, infected: true, tags: ['infected'],
      inspect: { label: 'Trojan', detail: 'Malware disguised as legitimate software. It needs a user to run it and does not self-replicate (2.4).', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'ransom1', kind: 'enemy', x: 7, y: 9.5, sprite: 'ransomware',
      ai: 'chase', hp: 2, infected: true, tags: ['infected'],
      inspect: { label: 'Ransomware', detail: 'Encrypts data and demands payment (2.4). Tougher: two scanner charges.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'charge1', kind: 'item', x: 1.5, y: 10.5, sprite: 'charge',
      tags: ['charge'], grants: { resource: 'usb-charge', amount: 6 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware updates — ammo for your USB scanner.', category: 'item' },
    },
  ],
  missionObjectives: [
    { id: 'report-insider', text: 'Report the real insider at the console', kind: 'report' },
    { id: 'no-false-accuse', text: 'No false accusations', kind: 'avoid', tag: 'false-accuse' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  debriefQuestions: [
    {
      id: 'q1',
      prompt: 'An R&D lead, denied promotion last week, uses his own valid access to copy 40 GB of confidential designs to a personal USB drive. Which threat actor and motivation BEST fit?',
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
      objectives: ['4.9'],
      options: [
        { id: 'a', text: 'Firewall logs', correct: false, explanation: 'Copying to USB never touches the network, so the firewall saw nothing.' },
        { id: 'b', text: 'Endpoint logs (OS/EDR device-connection and file-write events)', correct: true, explanation: 'Only the host records that a mass-storage device was mounted and which files were written to it.' },
        { id: 'c', text: 'Badge access logs', correct: false, explanation: 'They place him in the building at 03:12, which is useful for correlation, but they cannot show what happened on the laptop.' },
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
      objectives: ['4.8'],
      options: [
        { id: 'a', text: 'Report through the incident response process and preserve the evidence with chain of custody', correct: true, explanation: 'Escalating through IR keeps the investigation coordinated with HR and legal. Chain of custody keeps the logs and device usable as evidence.' },
        { id: 'b', text: 'Confront the employee at their desk', correct: false, explanation: 'Confronting him tips him off, so evidence may be destroyed, and it puts you at personal and legal risk. Containment is a coordinated IR step.' },
        { id: 'c', text: 'Remotely wipe their laptop to stop further leaks', correct: false, explanation: 'Wiping destroys the evidence you need. Containment should isolate the device while preserving it.' },
        { id: 'd', text: 'Quietly keep watching for a few weeks to collect more', correct: false, explanation: 'Confidential data is already leaving. Waiting without reporting lets the damage grow and leaves the response to one person.' },
      ],
    },
  ],
};

export const m03Teach: MissionTeaching = {
  situation:
    'A DLP alert fired overnight: confidential R&D designs left the network. The data was taken from inside, using valid credentials. Four employees had the opportunity. Only one has the evidence against them.',
  orders: [
    { text: 'Pull the log evidence on everyone who had the opportunity.', objective: '4.9' },
    { text: 'Decide who the evidence actually supports.', objective: '2.4' },
    { text: 'Escalate your finding through the proper channel.', objective: '4.8' },
    { text: 'Survive the malware and reach the exit.', objective: '2.4' },
  ],
  keyTerms: ['insider threat', 'data exfiltration', 'correlation', 'endpoint logs', 'data classification', 'intellectual property', 'chain of custody'],
  lessons: {
    'report-insider': {
      objective: '2.1',
      done: 'You reported the right person. Badge, file-server and endpoint logs each showed one piece, and correlated they told the whole story (4.9). That is how insider cases are built.',
      missed: 'The insider is still on the floor with confidential designs. The answer was in the logs: an after-hours badge-in, bulk access outside his role and a USB write, all from one person.',
    },
    'no-false-accuse': {
      objective: '2.4',
      done: 'No innocent colleague was accused. You waited until the evidence corroborated before you acted.',
      missed: 'You accused someone the evidence did not support. Working late, handling lots of data for the role, or looking nervous are not indicators on their own. False accusations hurt people and tip off the real culprit.',
    },
    exit: {
      objective: '4.8',
      done: 'Case handed off to incident response.',
      missed: 'You did not reach the exit.',
    },
  },
  examTip: 'For investigation questions, pick the data source that actually recorded the event. USB copy = endpoint logs. Who entered the building = badge/physical logs. What crossed the network = firewall/NetFlow/packet capture. Who logged in where = OS security logs.',
};
