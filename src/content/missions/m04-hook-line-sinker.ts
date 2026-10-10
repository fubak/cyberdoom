import type { EntityDef, MapDef, Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, floorSpot, liveThreats, retex, stagedThreatWave } from './campaign-map';

const map: MapDef = {
  grid: [
    '########################################',
    '##################..E..#################',
    '##################..X..#################',
    '##################.....#################',
    '##.........................WW......#####',
    '##..........................W......#####',
    '##...1.............................#####',
    '##.................................#####',
    '##.................................#####',
    '####################O###################',
    '####....W.....................WW....#.##',
    '####....W......................W....#.##',
    '####................................2.##',
    '####................................#.##',
    '####................................B.##',
    '####................................#.##',
    '####................................#.##',
    '##...###############Q################.##',
    '##...#.........................WW.....##',
    '##...#..............................#.##',
    '##...3..............................#.##',
    '##...#..............................#.##',
    '##...#....W.........S.S....WW.......#.##',
    '######....WW.......S...S....W.......#.##',
    '######.............S...S............#.##',
    '######..............S.S.............####',
    '######...............A..............####',
    '##################.......###############',
    '##################.......###############',
    '########################################',
  ],
  legend: {
    '#': { kind: 'wall', tex: 'wall-panel' },
    W: { kind: 'wall', tex: 'wall-brick' },
    S: { kind: 'wall', tex: 'wall-server' },
    '.': { kind: 'floor', tex: 'floor' },
    E: { kind: 'exit', tex: 'exit' },
    A: { kind: 'door', tex: 'door', doorId: 'mailroom', accessRole: 'analyst' },
    O: { kind: 'door', tex: 'door', doorId: 'mail-operations', accessRole: 'analyst' },
    Q: { kind: 'door', tex: 'door', doorId: 'mail-queue', locked: true, lockText: 'Clear the message queue before entering the gateway.' },
    B: { kind: 'door', tex: 'door', doorId: 'mail-backtrack', locked: true, lockText: 'The return route opens after gateway controls are applied.' },
    X: { kind: 'door', tex: 'door', doorId: 'mail-exit', locked: true, lockText: 'Complete the incident objectives before exiting.' },
    '1': { kind: 'door', tex: 'wall-brick', doorId: 'mail-secret-1', secret: true },
    '2': { kind: 'door', tex: 'wall-server', doorId: 'mail-secret-2', secret: true },
    '3': { kind: 'door', tex: 'wall-brick', doorId: 'mail-secret-3', secret: true },
  },
  spawn: { x: 21.5, y: 28.5, angle: -Math.PI / 2 },
  defaultLight: 0.65,
  lights: lightRects([
    [18, 21, 24, 26, 1],
    [6, 18, 35, 26, 0.72],
    [4, 10, 35, 16, 0.82],
    [5, 4, 34, 8, 0.82],
    [18, 1, 22, 3, 1],
  ]),
};

const terminals: EntityDef[] = [
  {
    id: 'mail-bec', kind: 'workstation', x: 12.5, y: 25.5, sprite: 'workstation-infected',
    infected: true, tags: ['triage', 'mail-malicious', 'spoofed'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-01',
      detail: 'From: CEO <ceo@cyberdoom.example>; Reply-To: ceo.wire@cyberdoorn.example; Return-Path: bounce@wire-notice.example; SPF=fail; DKIM=none; Link host=wire-notice.example; Body: "Urgent wire transfer; keep this request confidential."',
      category: 'item',
      objectives: ['5.6', '2.2'],
    },
  },
  {
    id: 'mail-brand', kind: 'workstation', x: 28.5, y: 20.5, sprite: 'workstation-infected',
    infected: true, tags: ['triage', 'mail-malicious'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-02',
      detail: 'From: Support <service@micros0ft-support.com>; Reply-To: service@micros0ft-support.com; Return-Path: bounces@micros0ft-support.com; SPF=pass; DKIM=pass; Link host=micros0ft-support.com; Body: "Verify your mailbox before the support session expires."',
      category: 'item',
      objectives: ['5.6', '2.2'],
    },
  },
  {
    id: 'mail-bill', kind: 'workstation', x: 12.5, y: 20.5, sprite: 'workstation-infected',
    infected: true, tags: ['triage', 'mail-malicious'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-03',
      detail: 'From: Accounts Payable <billing@vendor-payments.example>; Reply-To: billing@vendor-payments.example; Return-Path: batch@vendor-payments.example; SPF=pass; DKIM=fail; Link host=vendor-invoice.example; Body: "Review the attached invoice and confirm the revised bank details."',
      category: 'item',
      objectives: ['5.6', '2.2'],
    },
  },
  {
    id: 'mail-reset', kind: 'workstation', x: 28.5, y: 18.5, sprite: 'workstation-infected',
    infected: true, tags: ['triage', 'mail-malicious'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-04',
      detail: 'From: Identity Team <alerts@cyberdoom-login.example>; Reply-To: alerts@cyberdoom-login.example; Return-Path: relay@cyberdoom-login.example; SPF=softfail; DKIM=none; Link host=cyberdoom-login.example; Body: "Your account will be disabled unless you sign in today."',
      category: 'item',
      objectives: ['5.6', '2.2'],
    },
  },
  {
    id: 'mail-sms', kind: 'workstation', x: 25.5, y: 25.5, sprite: 'workstation-infected',
    infected: true, tags: ['triage', 'mail-malicious'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-08',
      detail: 'From: +1-555-0107; Reply-To: none; Return-Path: none; SPF=not applicable; DKIM=not applicable; Link host=micros0ft-support.com; Body: "Payroll account suspended. Sign in within one hour."',
      category: 'item',
      objectives: ['5.6', '2.2'],
    },
  },
  {
    id: 'mail-legit-a', kind: 'workstation', x: 16.5, y: 25.5, sprite: 'workstation',
    infected: false, tags: ['triage', 'triage-legit'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-05',
      detail: 'From: Benefits <benefits@cyberdoom.example>; Reply-To: benefits@cyberdoom.example; Return-Path: bounce@cyberdoom.example; SPF=pass; DKIM=pass; Link host=portal.cyberdoom.example; Body: "Open enrollment closes Friday."',
      category: 'item',
      objectives: ['5.6'],
    },
  },
  {
    id: 'mail-legit-b', kind: 'workstation', x: 30.5, y: 20.5, sprite: 'workstation',
    infected: false, tags: ['triage', 'triage-legit'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-06',
      detail: 'From: Service Desk <help@cyberdoom.example>; Reply-To: help@cyberdoom.example; Return-Path: help@cyberdoom.example; SPF=pass; DKIM=pass; Link host=support.cyberdoom.example; Body: "Your requested ticket update is ready."',
      category: 'item',
      objectives: ['5.6'],
    },
  },
  {
    id: 'mail-legit-c', kind: 'workstation', x: 9.5, y: 18.5, sprite: 'workstation',
    infected: false, tags: ['triage', 'triage-legit'],
    inspect: {
      call: 'auto',
      label: 'Message terminal M-07',
      detail: 'From: Payroll <payroll@cyberdoom.example>; Reply-To: payroll@cyberdoom.example; Return-Path: payroll@cyberdoom.example; SPF=pass; DKIM=pass; Link host=payroll.cyberdoom.example; Body: "The scheduled pay statement is available."',
      category: 'item',
      objectives: ['5.6'],
    },
  },
];

const consoles: EntityDef[] = [
  {
    id: 'gateway-spf', kind: 'console', x: 10.5, y: 13.5, sprite: 'console', tags: ['gateway-control'],
    log: 'MAIL GATEWAY: SPF policy set to -all for cyberdoom.example.',
    inspect: { label: 'SPF gateway control', detail: 'Outbound sender policy configuration.', category: 'legit', objectives: ['4.5'] },
  },
  {
    id: 'gateway-dkim', kind: 'console', x: 29.5, y: 13.5, sprite: 'console', tags: ['gateway-control'],
    log: 'MAIL GATEWAY: DKIM signing enabled for cyberdoom.example.',
    inspect: { label: 'DKIM gateway control', detail: 'Message-signing configuration.', category: 'legit', objectives: ['4.5'] },
  },
  {
    id: 'gateway-dmarc', kind: 'console', x: 20.5, y: 12.5, sprite: 'console', tags: ['gateway-control'],
    log: 'MAIL GATEWAY: DMARC policy p=reject; aggregate reporting enabled.',
    inspect: { label: 'DMARC gateway control', detail: 'Domain-based policy enforcement configuration.', category: 'legit', objectives: ['4.5'] },
  },
  {
    id: 'signin-log', kind: 'console', x: 12.5, y: 5.5, sprite: 'console', tags: ['signin-log'],
    implicates: ['mailbox-j-ortiz'],
    log: 'SIGN-IN AUDIT — last 24 hours\n08:14 m.chen@cyberdoom.example — Boston / managed laptop / success\n08:18 r.patel@cyberdoom.example — Boston / managed laptop / success\n09:00 j.ortiz@cyberdoom.example — Chicago / browser / success\n09:20 j.ortiz@cyberdoom.example — Singapore / browser / success\n09:21 j.ortiz@cyberdoom.example — Chicago / browser / success / session active\n09:48 a.reed@cyberdoom.example — Denver / managed laptop / success',
    inspect: {
      label: 'Sign-in audit console',
      detail: 'Raw session records, timestamps, mailbox names, locations, device types and outcomes.',
      category: 'legit',
      objectives: ['2.4'],
    },
  },
  {
    id: 'report-console', kind: 'console', x: 25.5, y: 5.5, sprite: 'console', tags: ['report-console'],
    log: 'ACCOUNT ACTION: lock the mailbox with the impossible-travel session records.',
    inspect: { label: 'Mailbox security console', detail: 'Account containment actions for reported sessions.', category: 'legit', objectives: ['2.4'] },
  },
  {
    id: 'mfa-walkup', kind: 'console', x: 31.5, y: 25.5, sprite: 'console', tags: ['mail-hub'],
    log: 'MAILROOM QUEUE: incoming messages awaiting triage.',
    inspect: { label: 'Mailroom queue console', detail: 'Message queue overview.', category: 'legit', objectives: ['5.6'] },
  },
];

const pickups: EntityDef[] = [
  { id: 'usb-charge-mail-a', kind: 'item', x: 24.5, y: 26.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-b', kind: 'item', x: 7.5, y: 20.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-c', kind: 'item', x: 32.5, y: 13.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-d', kind: 'item', x: 15.5, y: 7.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-e', kind: 'item', x: 27.5, y: 11.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-f', kind: 'item', x: 8.5, y: 14.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-g', kind: 'item', x: 13.5, y: 22.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 7 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-h', kind: 'item', x: 15.5, y: 20.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 7 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-i', kind: 'item', x: 24.5, y: 19.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 7 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-mail-j', kind: 'item', x: 21.5, y: 14.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 7 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'medkit-mail-a', kind: 'item', x: 7.5, y: 25.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  { id: 'medkit-mail-b', kind: 'item', x: 33.5, y: 18.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  {
    id: 'found-edr-mail', kind: 'item', x: 7.5, y: 12.5, sprite: 'tool-edr',
    tags: ['arsenal-pickup'], grants: { resource: 'tool:edr', amount: 1 },
    inspect: { label: 'EDR console (found)', detail: 'Endpoint detection and response console with containment.', category: 'item', objectives: ['4.5'] },
  },
  {
    id: 'edr-cell-mail-a', kind: 'item', x: 33.5, y: 12.5, sprite: 'edr-cell',
    tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
    inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
  },
  {
    id: 'edr-cell-mail-b', kind: 'item', x: 8.5, y: 5.5, sprite: 'edr-cell',
    tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
    inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
  },
  {
    id: 'pcap-mail-a', kind: 'item', x: 30.5, y: 7.5, sprite: 'pcap',
    tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
    inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
  },
  {
    id: 'pcap-mail-b', kind: 'item', x: 9.5, y: 7.5, sprite: 'pcap',
    tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
    inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
  },
];

const ratWave = stagedThreatWave(map, 'rat', 'rat', [...terminals, ...consoles, ...pickups], [
  [7, 10, 14, 15],
  [25, 10, 32, 15],
  [7, 17, 14, 22],
  [25, 17, 32, 22],
]);
const waveIds = (start: number, end: number) => ratWave.slice(start, end).map((enemy) => enemy.id);

export const m04: Mission = {
  id: 'm04',
  title: 'HOOK, LINE & SINKER',
  difficulty: 4,
  objectives: ['5.6', '2.2', '4.5', '2.4'],
  briefing: 'The reported-phishing queue is overflowing and finance just got an "urgent" wire request from the CEO.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'tap'],
  map,
  entities: [
    ...terminals,
    ...consoles,
    ...pickups,
    {
      id: 'mailbox-j-ortiz', kind: 'npc', x: 16.5, y: 5.5, sprite: 'npc-m',
      reportable: true, culprit: true, tags: ['mailbox'],
      inspect: {
        label: 'j.ortiz@cyberdoom.example',
        detail: 'Mailbox owner assigned to the paired Chicago and Singapore browser sessions in the sign-in records.',
        category: 'suspicious',
        objectives: ['2.4'],
      },
    },
    ...ratWave,
  ],
  missionObjectives: [
    { id: 'quarantine', text: 'Quarantine the five malicious messages', kind: 'clean', tag: 'mail-malicious', count: 5 },
    { id: 'release', text: 'Release the three legitimate messages', kind: 'interact', tag: 'triage-legit', count: 3 },
    { id: 'gateway', text: 'Enforce SPF, DKIM and DMARC p=reject', kind: 'interact', tag: 'gateway-control', count: 3 },
    { id: 'signin', text: 'Read the raw sign-in records', kind: 'interact', tag: 'signin-log' },
    { id: 'report', text: 'Lock the mailbox with impossible travel and concurrent sessions', kind: 'report', requires: ['signin'] },
    { id: 'false-report', text: 'Do not lock a mailbox without matching evidence', kind: 'avoid', tag: 'false-accuse' },
    { id: 'wrong-call', text: 'Avoid incorrect quarantine or release calls', kind: 'avoid', tag: 'wrong-call', strikes: 3 },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 240,
    outbreak: {
      tag: 'spoofed', every: 14, until: 'gateway',
      message: 'A spoofed-domain message reappeared while the gateway policy is incomplete.',
    },
    triggers: [
      { id: 'mail-ambush-west', area: [7, 10, 14, 15], spawn: waveIds(0, 5), kind: 'bad', message: 'A RAT session opened near the west gateway.' },
      { id: 'mail-ambush-east', area: [25, 10, 32, 15], spawn: waveIds(5, 10), kind: 'bad', message: 'Remote sessions are active in the east mailroom.' },
      { id: 'mail-ambush-records', area: [7, 17, 14, 22], spawn: waveIds(10, 15), kind: 'bad', message: 'A second wave entered through the archive network.' },
      { id: 'mail-ambush-final', after: ['gateway'], spawn: waveIds(15, 20), kind: 'bad', message: 'An attacker session tried to persist after the gateway changes.' },
      { id: 'queue-cleared', after: ['quarantine', 'release'], openDoors: ['mail-queue'], kind: 'good', message: 'Queue cleared: the mailroom gate is open.' },
      { id: 'mail-backtrack', after: ['gateway'], openDoors: ['mail-backtrack'], kind: 'good', message: 'Gateway policy applied: the return route is open.' },
      { id: 'mail-exit', after: ['gateway', 'report'], openDoors: ['mail-exit'], kind: 'good', message: 'The mailbox is locked and gateway policy is enforced. Exit open.' },
    ],
    secrets: [
      { id: 'mail-secret-1', area: [2, 4, 4, 8], label: 'Archive alcove', grant: { resource: 'usb-charge', amount: 16 } },
      { id: 'mail-secret-2', area: [35, 10, 37, 15], label: 'Gateway service nook', grant: { resource: 'usb-charge', amount: 16 } },
      { id: 'mail-secret-3', area: [2, 17, 4, 22], label: 'Quiet mailroom store', grant: { resource: 'integrity', amount: 40 } },
    ],
  },
  debriefQuestions: [
    q('q1', ['5.6'], 'A user receives an email "from IT": their mailbox is full and they must sign in at micros0ft-support.com within one hour or lose their mail. What should the user do?', 2, [
      ['Click the link to check whether the page looks genuine', 'Simply visiting can deliver a drive-by download, and a convincing clone page is how credentials get harvested.'],
      ['Reply to the sender and ask whether it is legitimate', 'The reply goes to the attacker. It confirms the address is live, and the attacker will just say yes.'],
      ['Report it with the phishing-report button without clicking anything', 'Reporting lets the SOC pull the same message from every inbox and block the domain. That is the trained response to a suspicious message.'],
      ['Delete it and move on', 'You are safe, but colleagues who got the same message are not. Without a report the SOC never learns of the campaign.'],
    ]),
    q('q2', ['2.2'], 'The CFO gets an email from what looks like the CEO’s own account: "Wire $48,000 to our new supplier today. I’m in meetings, don’t call." Which attack is this?', 0, [
      ['Business email compromise (BEC)', 'Impersonating (or taking over) an executive’s email to authorize a payment is the definition of BEC. The "don’t call" line exists to block out-of-band verification.'],
      ['Vishing', 'Vishing is voice phishing over a phone call. This arrived by email.'],
      ['Watering hole', 'A watering-hole attack compromises a website the targets visit. Nothing here involves a website.'],
      ['Typosquatting', 'A look-alike domain might be used, but the defining feature here is executive impersonation to authorize a payment, which is BEC.'],
    ]),
    q('q3', ['4.5', '2.2'], 'Attackers are sending mail that spoofs your exact domain in the From header. Which control lets receiving servers authenticate your mail AND tells them to reject what fails?', 3, [
      ['SPF', 'SPF lists the IPs allowed to send for the domain, but it checks the envelope sender, not the visible From, and has no policy telling receivers to reject.'],
      ['DKIM', 'DKIM signs messages so tampering can be detected, but on its own it gives receivers no instruction on what to do with failures.'],
      ['A web filter with URL reputation', 'Web filtering blocks malicious sites. It does nothing to authenticate who sent an email.'],
      ['DMARC with a p=reject policy', 'DMARC requires SPF/DKIM results to align with the From domain and publishes a policy (reject) for receivers to apply to failures.'],
    ]),
    q('q4', ['2.4'], 'Sign-in logs show j.ortiz authenticating from Chicago at 09:00 and from Singapore at 09:20, and both sessions are still active. Which indicators are present?', 1, [
      ['Account lockout and blocked content', 'Lockout follows repeated failed logins, and blocked content is a filter firing. Both of these sign-ins succeeded.'],
      ['Impossible travel and concurrent session usage', 'No one travels 15,000 km in 20 minutes, and two simultaneous sessions from different continents point to stolen credentials.'],
      ['Out-of-cycle logging', 'Out-of-cycle logging is activity logged at times there should be none. These are business-hours sign-ins; the anomaly is location and concurrency.'],
      ['Resource inaccessibility', 'That would be users unable to reach their data. Here the attacker has too much access, not too little.'],
    ]),
  ],
};

export const m04Teach: MissionTeaching = {
  tagline: 'Triage the queue, enforce domain policy, and lock the mailbox shown in the sign-in log.',
  situation: 'A reported-phishing queue is overflowing while finance has received an urgent CEO wire request.',
  orders: [
    { text: 'Inspect each message before quarantining or releasing it.', objective: '5.6' },
    { text: 'Enforce SPF/DKIM/DMARC policy against spoofed mail.', objective: '4.5' },
    { text: 'Read sign-in logs; lock the mailbox with impossible travel.', objective: '2.4' },
  ],
  keyTerms: ['phishing', 'social engineering', 'security awareness reporting', 'indicators of malicious activity'],
  lessons: {
    quarantine: { objective: '5.6', done: 'Malicious messages were quarantined after inspection.', missed: 'Inspect each message before choosing quarantine or release.' },
    release: { objective: '5.6', done: 'Legitimate messages were released.', missed: 'The queue is not clear until legitimate mail is released.' },
    gateway: { objective: '4.5', done: 'SPF and DKIM are enabled and DMARC is set to p=reject.', missed: 'Spoofed-domain mail keeps spawning until the gateway policy is enforced.' },
    signin: { objective: '2.4', done: 'The sign-in records were read.', missed: 'Read the raw session times, mailbox, and locations before reporting.' },
    report: { objective: '2.4', done: 'The mailbox with impossible travel and concurrent sessions was locked.', missed: 'Contain the mailbox supported by the sign-in evidence.' },
    'false-report': { objective: '2.4', done: 'No unsupported mailbox was locked.', missed: 'Only report the account supported by the raw sign-in evidence.' },
    'wrong-call': { objective: '5.6', done: 'The quarantine and release decisions matched the inspected messages.', missed: 'Review raw headers before making a quarantine or release decision.' },
    exit: { objective: '5.6', done: 'The queue was cleared before exit.', missed: 'Clear the queue and complete the gateway and mailbox actions before exiting.' },
  },
  examTip: 'BEC uses business-mail impersonation for actions such as fraudulent payments; SPF, DKIM, and DMARC p=reject address domain spoofing.',
};

export const m04Walkthrough: WalkStep[] = [
  { goto: [21, 27] },
  { badge: [21, 26] },
  { goto: [25, 25] },
  { inspect: 'mail-sms' },
  { call: 'mail-sms' },
  { clean: 'mail-sms' },
  { goto: [12, 25] },
  { inspect: 'mail-bec' },
  { call: 'mail-bec' },
  { clean: 'mail-bec' },
  { goto: [16, 25] },
  { inspect: 'mail-legit-a' },
  { call: 'mail-legit-a' },
  { interact: 'mail-legit-a' },
  { goto: [28, 20] },
  { inspect: 'mail-brand' },
  { call: 'mail-brand' },
  { clean: 'mail-brand' },
  { goto: [12, 20] },
  { inspect: 'mail-bill' },
  { call: 'mail-bill' },
  { clean: 'mail-bill' },
  { goto: [30, 20] },
  { inspect: 'mail-legit-b' },
  { call: 'mail-legit-b' },
  { interact: 'mail-legit-b' },
  { goto: [28, 18] },
  { inspect: 'mail-reset' },
  { call: 'mail-reset' },
  { clean: 'mail-reset' },
  { goto: [9, 18] },
  { inspect: 'mail-legit-c' },
  { call: 'mail-legit-c' },
  { interact: 'mail-legit-c' },
  { goto: [20, 18] },
  { goto: [20, 16] },
  { goto: [10, 13] },
  { interact: 'gateway-spf' },
  { goto: [29, 13] },
  { interact: 'gateway-dkim' },
  { goto: [20, 12] },
  { interact: 'gateway-dmarc' },
  { wait: 0.1 },
  { goto: [20, 10] },
  { badge: [20, 9] },
  { goto: [20, 8] },
  { goto: [12, 5] },
  { interact: 'signin-log' },
  { goto: [16, 5] },
  { inspect: 'mailbox-j-ortiz' },
  { interact: 'mailbox-j-ortiz' },
  { goto: [25, 5] },
  { interact: 'report-console' },
  { wait: 0.1 },
  { goto: [20, 1] },
];

// F1: encounter pacing — the phishing floor finally bites back: live trojans,
// an office-floor ambush and an exit surge, plus scanner supplies.
liveThreats(m04, 'open-trojan', 'trojan', 2, [8, 4, 36, 8]);
addThreatEncounter(m04, 'mid-trojan', 'trojan', 2, {
  id: 'floor-ambush', area: [18, 10, 36, 15], kind: 'bad',
  message: 'Clicked links spawn trojans across the office floor.',
}, [4, 10, 17, 15]);
addThreatEncounter(m04, 'exit-trojan', 'trojan', 1, {
  id: 'exit-ambush', area: [18, 17, 36, 26], kind: 'bad',
  message: 'One more trojan between you and the lifts.',
}, [18, 17, 36, 26]);
m04.entities.push(
  { id: 'chg-n', kind: 'item', ...floorSpot(m04, [8, 4, 36, 8]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-mid', kind: 'item', ...floorSpot(m04, [5, 10, 17, 15]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-se', kind: 'item', ...floorSpot(m04, [18, 17, 36, 26]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-se2', kind: 'item', ...floorSpot(m04, [18, 17, 36, 26]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
);

// — rF2 landmarks: mail-ops hall = bright grid floor with sorting displays;
// gateway wing (east) + back stores = dim rust service corridors.
m04.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m04.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m04, [4, 10, 34, 16], 'floor', ',');
retex(m04, [30, 4, 39, 26], 'floor', ';');
retex(m04, [2, 17, 6, 26], 'floor', ';');
m04.map.lights = { ...m04.map.lights, ...lightRects([[30, 4, 39, 26, 0.5], [2, 17, 6, 26, 0.55]]) };
m04.entities.push(
  { id: 'ops-board-a', kind: 'prop', x: 15.5, y: 11.5, sprite: 'console' },
  { id: 'ops-board-b', kind: 'prop', x: 18.5, y: 11.5, sprite: 'console' },
  { id: 'arch-cache', kind: 'item', x: 3.5, y: 6.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'gw-cache', kind: 'item', x: 37.5, y: 12.5, sprite: 'pcap', tags: ['arsenal-pickup'],
    grants: { resource: 'pcap', amount: 6 } },
  { id: 'store-med', kind: 'item', x: 3.5, y: 19.5, sprite: 'medkit',
    grants: { resource: 'integrity', amount: 40 } },
);
