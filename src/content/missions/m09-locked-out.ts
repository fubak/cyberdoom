import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';

/**
 * M9 "Locked Out": ransomware incident response, run in the right order.
 * Difficulty 8. Find patient zero in NetFlow first. While VLAN 30 is uncontained, cleaned hosts get RE-ENCRYPTED
 * every few seconds, so the player has to contain before eradicating.
 * Critical path, three gates:
 *   1. NETWORK CLOSET (IR role): isolate VLAN 30 at the core switch (contain).
 *   2. BACKUP VAULT opens only once every host is eradicated. Restoring onto
 *      a live infection would re-encrypt the backups.
 *   3. EXIT opens after recovery from offline backups. Lessons learned at the exit.
 * Paying the ransom FAILS the mission.
 * Loop: war room → finance floor → east hall → war room; central server ring.
 * Secrets: war-room storeroom, finance east closet.
 */
export const m09: Mission = {
  id: 'm09',
  title: 'LOCKED OUT',
  difficulty: 8,
  objectives: ['4.8', '3.4', '4.9'],
briefing:
    'Ransomware is encrypting the finance VLAN right now. The CFO wants payroll back by morning. ' +
    'Your kit: MOUSE (2) inspects, KEYBOARD (1) operates consoles, USB SCANNER (3) cleans hosts, ' +
    'BADGE (4) opens doors your IR role covers.',
  authorizedRoles: ['analyst', 'ir'],
  map: {
    grid: [
      'SSSSSSSSSS#####SSSSSSSSSS#####SSSSSSSSSS',
      'S........S#####S...EE...S#####S........S',
      'S........S#####S........S#####S........S',
      'S..SSS...S#####S........S#####S........S',
      'S........S#####S........S#####S........S',
      'S........S#####S........S#####S........S',
      'S........S#####SSSSXXSSSS#####S........S',
      'SSSSSSSNNS#########..#########S........S',
      '#######..##########..#########SSSVSSSSSS',
      '#######..##########..############.######',
      '######............................######',
      '######............................######',
      '######............................######',
      '######....###..............###....######',
      '######...........SSSSSS...........######',
      '######...........SSSSSS...........BBBBBB',
      '######...........SSSSSS...........B....B',
      '######....###..............###....B....B',
      '######............................2....B',
      '######............................B....B',
      '######............................B....B',
      '###################..########..###BBBBBB',
      '###################..########..#########',
      '##########BBBBB..........####..#########',
      '##########B...B..........####..#########',
      '##########B...1..#....#..e.....#########',
      '##########B...B..#....#..###############',
      '##########B...B..........###############',
      '##########BBBBB..........###############',
      '########################################',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      'S': { kind: 'wall', tex: 'wall-server' },
      'B': { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      'E': { kind: 'exit', tex: 'exit' },
      'e': { kind: 'door', tex: 'door', doorId: 'warroom-east' },
      'N': { kind: 'door', tex: 'door', doorId: 'netcloset', accessRole: 'ir' },
      'V': {
        kind: 'door', tex: 'door', doorId: 'vault', locked: true,
        lockText: 'BACKUP VAULT: sealed until every infected host is eradicated. Restoring onto live malware re-encrypts backups',
      },
      'X': {
        kind: 'door', tex: 'door', doorId: 'exit', locked: true,
        lockText: 'Exit opens once finance data is recovered from backup',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-store', secret: true },
      '2': { kind: 'door', tex: 'wall-brick', doorId: 'secret-closet', secret: true },
    },
    spawn: { x: 19.5, y: 27.5, angle: -Math.PI / 2 },
    defaultLight: 0.65,
    lights: lightRects([[15, 23, 24, 28, 0.85], [6, 10, 33, 20, 0.55], [1, 1, 8, 6, 0.45], [31, 1, 38, 7, 0.5], [16, 1, 23, 5, 1.0], [11, 24, 13, 27, 0.3], [35, 16, 38, 20, 0.3], [25, 21, 30, 25, 0.4]]),
  },
  entities: [
    ...(
      [
        ['enc1', 7.5, 11.5, 'FIN-01'],
        ['enc2', 32.5, 11.5, 'FIN-02'],
        ['enc3', 7.5, 19.5, 'FIN-03'],
        ['enc4', 32.5, 19.5, 'FIN-04'],
      ] as const
    ).map(([id, x, y, name]) => ({
      id, kind: 'workstation' as const, x, y, sprite: 'workstation-infected',
      infected: true, tags: ['enc-host'],
      inspect: {
        label: `Workstation ${name}`,
        detail: 'Files renamed *.lockd, HOW_TO_DECRYPT.txt on every share, SMB writes at ~400 files/min to \\\\fin-share.',
        category: 'malware' as const,
        objectives: ['2.4'],
      },
    })),
    {
      id: 'netflow', kind: 'console', x: 16.5, y: 24.5, sprite: 'console', tags: ['netflow'],
      log: 'NETFLOW, VLAN 30 -> internet, last 6 h\n01:52 10.30.0.43 -> 203.0.113.66:443 first seen, then every 60 s\n01:58 10.30.0.12 / .27 / .51 -> 203.0.113.66:443 (each after SMB from 10.30.0.43)\nDHCP: .12 FIN-01, .27 FIN-02, .43 FIN-03, .51 FIN-04',
      inspect: { label: 'Firewall / NetFlow console', detail: 'Connection records: source, destination, port, time.', category: 'legit', objectives: ['4.9'] },
    },
    {
      id: 'ransom-portal', kind: 'console', x: 9.5, y: 10.5, sprite: 'console', tags: ['pay-ransom'],
      log: 'PAYMENT PORTAL: 14 BTC transfer initiated to the attacker wallet.',
      inspect: {
        label: 'Ransom payment portal',
        detail: '"Pay 14 BTC within 48h for the decryptor." Payment does not guarantee decryption and funds the attacker.',
        category: 'suspicious',
        objectives: ['4.8'],
      },
    },
    {
      id: 'core-switch', kind: 'console', x: 2.5, y: 1.5, sprite: 'console', tags: ['contain'],
      log: 'SW-FIN: VLAN 30 isolated, inter-VLAN routing and SMB to fin-share blocked.\nSpread halted.',
      inspect: { label: 'Core switch SW-FIN', detail: 'Network segmentation controls for the finance VLAN.', category: 'legit', objectives: ['4.8'] },
    },
    {
      id: 'restore', kind: 'console', x: 37.5, y: 1.5, sprite: 'console', tags: ['recover'],
      log: 'BACKUP: restoring fin-share from offline immutable snapshot (02:00).\nHashes verified. Finance is back online.',
      inspect: { label: 'Offline backup restore', detail: 'Air-gapped, immutable snapshots: ransomware could not reach them.', category: 'legit', objectives: ['3.4'] },
    },
    {
      id: 'lessons', kind: 'console', x: 16.5, y: 1.5, sprite: 'console', tags: ['lessons'],
      log: 'LESSONS LEARNED filed: root cause phishing macro, add MFA + macro blocking,\nkeep offline backups, re-test the IR plan quarterly.',
      inspect: { label: 'Post-incident review', detail: 'Lessons learned: the final phase of incident response.', category: 'legit', objectives: ['4.8'] },
    },
    { id: 'rw-a', kind: 'enemy', x: 14.5, y: 18.5, sprite: 'ransomware', ai: 'wander', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Ransomware process', detail: 'Enumerating shares and encrypting files.', category: 'malware', objectives: ['2.4'] } },
    { id: 'rw-b', kind: 'enemy', x: 25.5, y: 11.5, sprite: 'ransomware', ai: 'wander', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Ransomware process', detail: 'Enumerating shares and encrypting files.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-closet', kind: 'enemy', x: 5.5, y: 5.5, sprite: 'worm', ai: 'chase', hp: 1, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Propagating via the management VLAN.', category: 'malware', objectives: ['2.4'] } },
    { id: 'hok-a', kind: 'enemy', x: 6.5, y: 15.5, sprite: 'trojan', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Remote-access trojan', detail: 'Attacker hands-on-keyboard after losing the network.', category: 'malware', objectives: ['2.4'] } },
    { id: 'hok-b', kind: 'enemy', x: 33.5, y: 15.5, sprite: 'trojan', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Remote-access trojan', detail: 'Attacker hands-on-keyboard after losing the network.', category: 'malware', objectives: ['2.4'] } },
    { id: 'chg-war', kind: 'item', x: 23.5, y: 23.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
    { id: 'chg-floor-n', kind: 'item', x: 19.5, y: 11.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
    { id: 'chg-floor-s', kind: 'item', x: 19.5, y: 19.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
    { id: 'med-vault', kind: 'item', x: 32.5, y: 6.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'chg-store', kind: 'item', x: 11.5, y: 25.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 6 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
    { id: 'med-store', kind: 'item', x: 12.5, y: 27.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'chg-closet', kind: 'item', x: 37.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 6 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  ],
  missionObjectives: [
    { id: 'identify', text: 'Identify patient zero and the C2 in NetFlow (war room)', kind: 'interact', tag: 'netflow' },
    { id: 'contain', text: 'Contain: isolate VLAN 30 at the core switch', kind: 'interact', tag: 'contain', requires: ['identify'] },
    { id: 'eradicate', text: 'Eradicate: clean all 4 encrypted hosts', kind: 'clean', tag: 'enc-host', count: 4 },
    { id: 'recover', text: 'Recover: restore from offline backup', kind: 'interact', tag: 'recover', requires: ['eradicate'] },
    { id: 'lessons', text: 'File lessons learned', kind: 'interact', tag: 'lessons', requires: ['recover'] },
    { id: 'no-pay', text: 'Do not pay the ransom', kind: 'avoid', tag: 'pay-ransom' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 270,
    outbreak: {
      tag: 'enc-host', every: 8, until: 'contain',
      message: 'Re-encrypted! Ransomware spread back over SMB. Contain VLAN 30 first.',
    },
    triggers: [
      { id: 'hands-on', after: ['contain'], spawn: ['hok-a', 'hok-b'], kind: 'bad',
        message: 'Segment isolated. The attacker drops remote-access trojans on the floor!' },
      { id: 'vault-open', after: ['eradicate'], openDoors: ['vault'], kind: 'good',
        message: 'All hosts eradicated: backup vault released for recovery.' },
      { id: 'exit-open', after: ['recover'], openDoors: ['exit'], kind: 'good',
        message: 'Finance restored from backup. Exit open. File lessons learned on the way out.' },
    ],
    secrets: [
      { id: 'store', area: [11, 24, 13, 27], label: 'IR storeroom' },
      { id: 'closet', area: [35, 16, 38, 20], label: 'Finance closet' },
    ],
  },
debriefQuestions: [
    q('q1', ['4.8'], 'Ransomware is actively spreading across the finance VLAN. You have confirmed it. What is the NEXT incident-response activity?', 1, [
      ['Eradication: re-image the infected hosts', 'While it is still spreading, newly re-imaged hosts get reinfected. Contain first.'],
      ['Containment: isolate the finance VLAN', 'Containment stops the spread so eradication and recovery can succeed. Order: detection, analysis, containment, eradication, recovery, lessons learned.'],
      ['Recovery: restore from backups now', 'Restored systems on a live infected network will be encrypted again.'],
      ['Lessons learned: hold the post-incident review', 'Lessons learned comes after recovery, not while the attack is live.'],
    ]),
    q('q2', ['4.8'], 'An infected laptop may become evidence in court. What must you document from the moment you collect it?', 2, [
      ['Root cause analysis', 'RCA explains why the incident happened. It is not an evidence-handling record.'],
      ['E-discovery', 'E-discovery is identifying and producing electronic information for legal proceedings, not proving how the item was handled.'],
      ['Chain of custody', 'A record of who handled the evidence, when and how. Without it, the defense can argue tampering and the evidence may be excluded.'],
      ['Threat hunting', 'Threat hunting is proactively searching for undetected threats, not evidence handling.'],
    ]),
    q('q3', ['3.4'], 'Payroll must be running again within one hour of losing the primary data center. Which recovery site meets that?', 3, [
      ['Cold site', 'A cold site has space and power but no equipment or data. Recovery takes days to weeks.'],
      ['Warm site', 'A warm site has some hardware but needs data restores and configuration, typically hours to days.'],
      ['Restoring onsite backups at the destroyed data center', 'Onsite backups are lost with the site. That is why geographic dispersion matters.'],
      ['Hot site', 'A hot site is fully equipped with near-current data and can take over in minutes to an hour.'],
    ]),
    q('q4', ['4.9'], 'Which data source BEST shows which internal host first connected to the ransomware\u2019s command-and-control IP, and when?', 0, [
      ['Firewall logs / NetFlow records', 'Network logs record source, destination and time for every connection, so filtering on the C2 IP finds patient zero.'],
      ['Vulnerability scan results', 'Scans show weaknesses, not who talked to whom.'],
      ['Badge access logs', 'Badge logs show people entering doors, not hosts making connections.'],
      ['The payroll application\u2019s log', 'An application log records app events, not outbound connections from every host.'],
    ]),
  ],
};

export const m09Walkthrough: WalkStep[] = [
  { goto: [16, 25] },
  { interact: 'netflow' },
  { goto: [8, 11] },
  { inspect: 'enc1' },
  { goto: [8, 8] },
  { badge: [8, 7] },
  { goto: [2, 2] },
  { interact: 'core-switch' },
  { clean: 'enc1' },
  { clean: 'enc2' },
  { clean: 'enc3' },
  { clean: 'enc4' },
  { wait: 0.2 },
  { goto: [37, 2] },
  { interact: 'restore' },
  { wait: 0.2 },
  { goto: [16, 2] },
  { interact: 'lessons' },
  { goto: [19, 1] },
];

export const m09Teach: MissionTeaching = {
  tagline: 'Finance is encrypting in real time. Payroll is due by morning.',
  situation:
    'Ransomware is encrypting the finance VLAN right now. Four finance hosts are already locked, and the CFO wants payroll back by morning.',
  orders: [
    { text: 'Find where the infection started and where it phones home.', objective: '4.9' },
    { text: 'Stop the spread, then clean every affected host.', objective: '4.8' },
    { text: 'Restore the data and close the incident properly.', objective: '3.4' },
  ],
  keyTerms: ['ransomware', 'backups', 'replication', 'correlation', 'chain of custody'],
  lessons: {
    'identify': {
      objective: '4.9',
      done: 'NetFlow showed 10.30.0.43 (FIN-03) beaconing to 203.0.113.66 first; every other host followed after SMB from it. Network logs find patient zero and the C2.',
      missed: 'You never checked the network logs, so patient zero and the C2 address were unknown and the attacker could return the same way.',
    },
    'contain': {
      objective: '4.8',
      done: 'You isolated VLAN 30 before cleaning. Containment comes before eradication, or cleaned hosts are reinfected.',
      missed: 'The segment was never isolated, so the ransomware kept spreading back to hosts you cleaned.',
    },
    'eradicate': {
      objective: '4.8',
      done: 'Every encrypted host was cleaned after containment.',
      missed: 'Encrypted hosts were left on the network.',
    },
    'recover': {
      objective: '3.4',
      done: 'You restored from offline, immutable backups. The ransomware could not reach them, unlike the replicated shares.',
      missed: 'Payroll was never restored. Replicated shares are encrypted too; recovery needs offline backups.',
    },
    'lessons': {
      objective: '4.8',
      done: 'Lessons learned filed: the IR cycle is complete only after the post-incident review.',
      missed: 'No post-incident review was filed, so the same gaps stay open.',
    },
    'no-pay': {
      objective: '4.8',
      done: 'You did not pay. Payment funds the attacker and does not guarantee a working key.',
      missed: 'You paid the ransom. Payment funds the attacker, may breach sanctions rules, and does not guarantee decryption.',
    },
    'exit': {
      objective: '4.8',
      done: 'Incident closed.',
      missed: 'You did not reach the exit.',
    },
  },
  examTip: 'Incident response order on the exam: preparation, detection, analysis, containment, eradication, recovery, lessons learned. Ransomware recovery = offline/immutable backups, not replicas.',
};
