import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, floorSpot, liveThreats, retex, setMapCell } from './campaign-map';

/**
 * M2 "Need to Know": least privilege, just-in-time access, shared credentials.
 * Difficulty 2. Critical path, three concept gates:
 *   1. ANALYST badge opens the SOC lab (your role is enough).
 *   2. NETOPS door: request JIT access at the IAM kiosk for exactly what ticket
 *      CHG-4471 needs. Requesting DOMAIN ADMIN FAILS the mission.
 *   3. DATACENTER exit door: SOC releases it only after the uplink is restored
 *      AND Greg's shared-password offer is reported.
 * Admin-only shortcut off the atrium: badging it is a logged violation (-30).
 * Loop: lab → NETOPS → switch room → back door → maintenance corridor → lab.
 * Secrets: atrium break room, cable vault behind the lab's west wall.
 */
export const m02: Mission = {
  id: 'm02',
  title: 'NEED TO KNOW',
  difficulty: 2,
  objectives: ['4.6', '1.2', '5.6'],
  briefing:
    'New floor, first day. Your badge carries the ANALYST role. The doors here use ' +
    'role-based access control, and every badge attempt, allowed or denied, is logged to your name. ' +
    'Word is that someone on the floor is handing out "the shared admin password". ' +
    'Your kit: BADGE (4) presents your credential to a door. MOUSE (2) inspects. ' +
    'KEYBOARD (1) flags a person, and on the security console it files a report. ' +
    'Get across the floor to the exit.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'mfa'],
  map: {
    grid: [
    '##############SSSSSSSSSSSS##############',
    '##############S....EE....S##############',
    '##############S..........S##############',
    '##############S..........S##############',
    '##############S..........S##############',
    '##############SSSS....SSSS##############',
    '##################....##################',
    '##################....##################',
    '##################....########SSSSSSSSSS',
    '##################....########S........S',
    '###################XX#########S........S',
    '####BBBBBB....................S........S',
    '####B....B..........SS........S..SSSS..S',
    '####B....2.........SS.........S........S',
    '####B....B...###...SS...###...S........S',
    '####B....B.........SS.........N..SSSS..S',
    '####BBBBBB.........SS.........S........S',
    '##########...###....SS..###...S........S',
    '##########....................S..SSSS..S',
    '##########....................S........S',
    '###################AA######l##S........S',
    '####SSSSSSSSSS............#.##SSSSmmSSSS',
    '####S........S............#.........####',
    '####S........S..#......#..#.........####',
    '####S........R..#......#..BBBBBBB#######',
    '####S........SSSSSS.......B.....B#######',
    '####S........S............1.....B#######',
    '####S........S............B.....B#######',
    '####SSSSSSSSSS............B.....B#######',
    '##########################BBBBBBB#######',
  ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      'S': { kind: 'wall', tex: 'wall-server' },
      'B': { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      'E': { kind: 'exit', tex: 'exit' },
      'A': { kind: 'door', tex: 'door', doorId: 'lab', accessRole: 'analyst' },
      'N': { kind: 'door', tex: 'door', doorId: 'netops', accessRole: 'netops', mfa: true },
      'm': { kind: 'door', tex: 'door', doorId: 'netops-back', accessRole: 'netops' },
      'l': { kind: 'door', tex: 'door', doorId: 'maint' },
      'R': { kind: 'door', tex: 'door', doorId: 'admin', accessRole: 'admin' },
      'X': {
        kind: 'door', tex: 'door', doorId: 'final', locked: true,
        lockText: 'DATACENTER: SOC releases this door once the uplink is restored and the incident is reported',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-break', secret: true },
      '2': { kind: 'door', tex: 'wall-brick', doorId: 'secret-cable', secret: true },
      '3': { kind: 'door', tex: 'wall-panel', doorId: 'secret-server-room', secret: true },
    },
    spawn: { x: 19.5, y: 27.5, angle: -Math.PI / 2 },
    defaultLight: 0.75,
    lights: lightRects([[14, 21, 25, 28, 0.9], [12, 26, 18, 28, 1.0], [10, 11, 29, 19, 0.8], [31, 9, 38, 20, 0.45], [5, 22, 12, 27, 0.4], [18, 5, 21, 9, 0.6], [15, 1, 24, 4, 1.0], [27, 21, 35, 23, 0.4], [27, 25, 31, 28, 0.5], [5, 12, 8, 15, 0.3]]),
  },
  entities: [
    {
      id: 'greg', kind: 'npc', x: 12.5, y: 12.5, sprite: 'npc-m', ai: 'stand',
      reportable: true, culprit: true, tags: ['shared-account'],
      inspect: {
        label: 'M. Grant, sysadmin',
        detail: '"Tickets take forever. Here: admin / Winter2024!, the whole team uses it." SERVER AUTH LOG (24 h): 212 logins as "admin" from 4 different workstations; 0 logins by named accounts.',
        category: 'person',
        objectives: ['1.2', '5.6'],
        flags: ['offers shared credentials', 'bypasses individual accounts'],
      },
    },
    {
      id: 'priya', kind: 'npc', x: 27.5, y: 18.5, sprite: 'npc-f', ai: 'stand',
      reportable: true,
      inspect: {
        label: 'A. Chen, analyst',
        detail: 'BADGE LOG: ANALYST badge, lab door x3 today, no denied attempts. "Need server access? Raise a ticket and it gets approved for the task."',
        category: 'person',
        objectives: ['4.6'],
      },
    },
    {
      id: 'ticket', kind: 'console', x: 11.5, y: 18.5, sprite: 'console', tags: ['ticket'],
      log: 'CHG-4471: core switch SW-B uplink down\nAssignee: you (analyst)\nAccess needed: NETOPS, switch room only, one task',
      inspect: { label: 'Ticket terminal', detail: 'Change ticket queue. Read your assignment with the KEYBOARD.', category: 'legit', objectives: ['4.6'] },
    },
    {
      id: 'iam-netops', kind: 'console', x: 22.5, y: 11.5, sprite: 'console', tags: ['jit-netops'],
      grants: { resource: 'role:netops', amount: 1 },
      log: 'IAM KIOSK: JIT request NETOPS for CHG-4471 approved.\nScope: switch room. Expires when the task closes.',
      inspect: { label: 'IAM kiosk: request NETOPS (switch room)', detail: 'Just-in-time, ticket-scoped access request.', category: 'legit', objectives: ['4.6'] },
    },
    {
      id: 'iam-admin', kind: 'console', x: 24.5, y: 11.5, sprite: 'console', tags: ['over-provision'],
      log: 'IAM KIOSK: request DOMAIN ADMIN (all doors, no expiry) submitted.',
      inspect: { label: 'IAM kiosk: request DOMAIN ADMIN (all doors)', detail: 'Standing, unscoped privileged access request.', category: 'legit', objectives: ['4.6'] },
    },
    {
      id: 'auth-log', kind: 'console', x: 26.5, y: 11.5, sprite: 'console', tags: ['auth-log'],
      implicates: ['greg'],
      log: 'SERVER AUTH LOG (24 h)\n212 logins as "admin" from 4 different workstations\n0 logins by named accounts',
      inspect: {
        label: 'Server authentication log',
        detail: 'Per-account logins on the servers the sysadmin team manages. Named-account accountability is what shared passwords destroy.',
        category: 'legit', objectives: ['1.2', '4.9'],
      },
    },
    {
      id: 'report-console', kind: 'console', x: 17.5, y: 11.5, sprite: 'console', tags: ['report-console'],
      log: 'SOC REPORTING: mark the person with the KEYBOARD, then file here.',
      inspect: { label: 'SOC incident console', detail: 'Files security-awareness and insider reports to the SOC.', category: 'legit', objectives: ['5.6'] },
    },
    {
      id: 'core-switch', kind: 'console', x: 37.5, y: 9.5, sprite: 'console', tags: ['restore'],
      log: 'SW-B: uplink port Gi1/0/48 re-enabled. Link UP. CHG-4471 resolved.',
      inspect: { label: 'Core switch SW-B', detail: 'Uplink Gi1/0/48 administratively down.', category: 'legit' },
    },
    {
      id: 'admin-sign', kind: 'prop', x: 14.5, y: 24.5, sprite: 'console',
      inspect: { label: 'Sign: ADMIN ONLY', detail: 'Domain controllers & backups. Badge reader logs every attempt.', category: 'legit', objectives: ['4.6'] },
    },
    { id: 'trojan-lab', kind: 'enemy', x: 21.5, y: 18.5, sprite: 'trojan', ai: 'wander', hp: 3, infected: true, tags: ['malware'],
      inspect: { label: 'Trojan', detail: 'Arrived as a fake VPN client installer.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-a', kind: 'enemy', x: 37.5, y: 19.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Spreading over the downed switch segment.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-b', kind: 'enemy', x: 31.5, y: 19.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Spreading over the downed switch segment.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-maint', kind: 'enemy', x: 33.5, y: 22.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Hiding in the maintenance VLAN.', category: 'malware', objectives: ['2.4'] } },
    { id: 'chg-atrium', kind: 'item', x: 15.5, y: 22.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-lab', kind: 'item', x: 10.5, y: 11.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-switch', kind: 'item', x: 31.5, y: 9.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'med-break', kind: 'item', x: 29.5, y: 26.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'chg-break', kind: 'item', x: 28.5, y: 27.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    { id: 'chg-cable', kind: 'item', x: 6.5, y: 13.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 6 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick.', category: 'item' } },
    {
      id: 'find-tap', kind: 'item', x: 34.5, y: 10.5, sprite: 'tool-tap',
      tags: ['arsenal-pickup'], grants: { resource: 'tool:tap', amount: 1 },
      inspect: { label: 'Network tap (found)', detail: 'A passive tap: copies traffic out of band, never blocks.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'pcap-switch', kind: 'item', x: 31.5, y: 12.5, sprite: 'pcap',
      tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'pcap-break', kind: 'item', x: 30.5, y: 25.5, sprite: 'pcap',
      tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
      inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'mfa-phish', kind: 'console', x: 28.5, y: 13.5, sprite: 'console', tags: ['phish-prompt'],
      log: 'POP-UP: "Session expired. Sign in to SW-B portal: sw-b-portal.netops-login.co. Touch your key to continue."',
      inspect: {
        label: 'Sign-in prompt (sw-b-portal.netops-login.co)',
        detail: 'Kiosk browser opened a sign-in page by itself. The domain is not the company IdP; it was registered 2 days ago.',
        category: 'phishing',
        objectives: ['2.2', '4.6'],
        flags: ['look-alike domain', 'unsolicited sign-in prompt'],
      },
    },
  ],
  missionObjectives: [
    { id: 'read-ticket', text: 'Read ticket CHG-4471', kind: 'interact', tag: 'ticket' },
    { id: 'jit', text: 'Request only the access the ticket needs (IAM kiosk)', kind: 'interact', tag: 'jit-netops', requires: ['read-ticket'] },
    { id: 'restore', text: 'Restore the switch uplink', kind: 'interact', tag: 'restore', requires: ['jit'] },
    { id: 'report', text: 'Report the shared-password offer (mark, then file at the SOC console)', kind: 'report' },
    { id: 'no-overprov', text: 'Never request more privilege than the task needs', kind: 'avoid', tag: 'over-provision' },
    { id: 'no-false', text: 'No false reports', kind: 'avoid', tag: 'false-accuse', strikes: 2 },
    { id: 'no-violations', text: 'No unauthorized badge attempts', kind: 'doors' },
    { id: 'exit', text: 'Reach the datacenter exit', kind: 'reach-exit' },
  ],
  script: {
    par: 210,
    triggers: [
      { id: 'switch-ambush', area: [31, 14, 32, 16], spawn: ['worm-a', 'worm-b'], kind: 'bad',
        message: 'Worms burst out of the rack aisles!' },
      { id: 'jit-expire', after: ['restore'], revokeRoles: ['netops'], kind: 'info',
        message: 'Task closed: JIT NETOPS access expired automatically.' },
      { id: 'final-door', after: ['restore', 'report'], openDoors: ['final'], kind: 'good',
        message: 'Uplink restored and incident filed: SOC released the datacenter door.' },
    ],
    secrets: [
      { id: 'break', area: [27, 25, 31, 28], label: 'Break room', grant: { resource: 'integrity', amount: 40 } },
      { id: 'cable', area: [5, 12, 8, 15], label: 'Cable vault', grant: { resource: 'usb-charge', amount: 16 } },
      { id: 'server-room', area: [36, 23, 36, 23], label: 'Server-side cache', grant: { resource: 'usb-charge', amount: 16 } },
    ],
  },
  debriefQuestions: [
    {
      id: 'q1',
      prompt: 'Your badge opens the ANALYST lab but not the ADMIN server room. A teammate suggests asking for server-room access "just in case you ever need it." Under least privilege, what should you do?',
      objectives: ['4.6', '1.2'],
      options: [
        { id: 'a', text: 'Request it now; unused access does no harm', correct: false, explanation: 'Unused access is still attack surface. A lost or cloned badge, or a compromised account, gets everything it is entitled to.' },
        { id: 'b', text: 'Borrow an admin\u2019s badge on the day you need it', correct: false, explanation: 'Using someone else\u2019s credential is impersonation. The log then shows the admin entering, so accounting breaks.' },
        { id: 'c', text: 'Request access only when a task requires it, through the approval process, and only for as long as it is needed', correct: true, explanation: 'Least privilege grants the minimum access for the job and no longer than needed (just-in-time). Approval keeps it reviewed.' },
        { id: 'd', text: 'Ask facilities to prop the server-room door open during the day', correct: false, explanation: 'This removes the physical control for everyone and turns a restricted zone into an open one.' },
      ],
    },
    {
      id: 'q2',
      prompt: 'Four admins share the account "admin". A critical server config is deleted, and the logs show only "admin" at 14:02. The investigation cannot say who did it. Which security concept has the shared account broken?',
      objectives: ['1.2'],
      options: [
        { id: 'a', text: 'Availability', correct: false, explanation: 'The deletion harmed availability, but that is the incident itself. The question is why it cannot be attributed.' },
        { id: 'b', text: 'Authorization', correct: false, explanation: 'All four admins were authorized to change the server. Permissions worked; tracing who used them did not.' },
        { id: 'c', text: 'Non-repudiation / accounting', correct: true, explanation: 'Accounting ties each action to an individual, and non-repudiation stops them denying it. With a shared account, any of the four can credibly deny the deletion.' },
        { id: 'd', text: 'Confidentiality', correct: false, explanation: 'Sharing a password does weaken confidentiality, but nothing was disclosed here. The failure is attribution.' },
      ],
    },
    {
      id: 'q3',
      prompt: 'What is the BEST way to give the four admins the access they need while fixing the shared-account problem?',
      objectives: ['4.6'],
      options: [
        { id: 'a', text: 'Keep the shared account but rotate its password every 30 days', correct: false, explanation: 'Rotation limits how long a leaked password works, but four people still use one identity, so actions remain unattributable.' },
        { id: 'b', text: 'Give each admin a named account, assign rights by role, and grant elevation through PAM (password vaulting / just-in-time)', correct: true, explanation: 'Individual accounts restore accounting. RBAC keeps rights matched to the job. PAM issues admin rights only when needed and logs each checkout.' },
        { id: 'c', text: 'Give every admin domain-admin rights on their personal account', correct: false, explanation: 'Named accounts help attribution, but blanket domain-admin breaks least privilege and makes every account a high-value target.' },
        { id: 'd', text: 'Seal the shared password in an envelope in the manager\u2019s desk', correct: false, explanation: 'Break-glass envelopes are for rare emergencies. For daily admin work, the identity is still shared and unattributable.' },
      ],
    },
    {
      id: 'q4',
      prompt: 'In the break room, a sysadmin offers you the shared admin password "so you don\u2019t have to wait for tickets." What is the correct response?',
      objectives: ['5.6'],
      options: [
        { id: 'a', text: 'Accept it but promise yourself never to use it', correct: false, explanation: 'Holding credentials not issued to you is already a policy violation, and the underlying risk goes unreported.' },
        { id: 'b', text: 'Decline politely and say nothing more', correct: false, explanation: 'You stayed clean, but the risky practice continues. Security awareness includes reporting anomalous, risky behavior.' },
        { id: 'c', text: 'Use it once to prove to management how risky it is', correct: false, explanation: 'Unauthorized use is still unauthorized, whatever the intent. Testing needs a sanctioned assessment with rules of engagement.' },
        { id: 'd', text: 'Decline, and report it through the official security reporting channel', correct: true, explanation: 'Refusing protects you. Reporting lets security replace the shared account (5.6: reporting and monitoring).' },
      ],
    },
    {
      id: 'q5',
      prompt: 'The lab door opens for any badge assigned the ANALYST role, whoever the person is. Which access control model is this?',
      objectives: ['4.6', '5.6'],
      options: [
        { id: 'a', text: 'Role-based access control (RBAC)', correct: true, explanation: 'Permissions attach to the role, and people inherit them by being assigned the role. Change someone\u2019s job and you change their role, not every door.' },
        { id: 'b', text: 'Discretionary access control (DAC)', correct: false, explanation: 'In DAC the resource owner decides who gets access on a case-by-case basis. Here, a centrally defined role decides.' },
        { id: 'c', text: 'Mandatory access control (MAC)', correct: false, explanation: 'MAC compares clearance labels with classification labels (e.g. Secret vs Top Secret), and users cannot change them. No labels are involved here.' },
        { id: 'd', text: 'Rule-based access control', correct: false, explanation: 'Rule-based control applies the same conditions to everyone (e.g. "no entry after 22:00"), whatever their role.' },
      ],
    },
    {
      id: 'q6',
      prompt: 'Your team moves remote access to a Zero Trust model. Which component sits in the data plane and actually allows or blocks each connection?',
      objectives: ['1.2'],
      options: [
        { id: 'a', text: 'The policy decision point (PDP)', correct: false, explanation: 'The PDP — the policy engine plus policy administrator — evaluates signals and makes the decision in the control plane. It does not sit in the traffic path.' },
        { id: 'b', text: 'The SIEM', correct: false, explanation: 'A SIEM collects and correlates telemetry for detection. It advises the decision point but enforces nothing.' },
        { id: 'c', text: 'The policy enforcement point (PEP)', correct: true, explanation: 'The PEP is the data-plane component — gateway, agent or proxy — that opens, monitors and closes each connection based on the PDP\u2019s decision.' },
        { id: 'd', text: 'The identity provider', correct: false, explanation: 'The IdP authenticates the subject and feeds trust signals to the decision point. Enforcement happens downstream at the PEP.' },
      ],
    },
    {
      id: 'q7',
      prompt: 'An analyst plants a fake file named "prod-passwords.xlsx" on a file share; it contains no real data, and any read fires an alert. What did they deploy?',
      objectives: ['1.2'],
      options: [
        { id: 'a', text: 'A honeytoken (honeyfile)', correct: true, explanation: 'A honeytoken is a deceptive artifact — a file, credential or record — that has no legitimate use, so any touch is suspicious. The whole file share stays real.' },
        { id: 'b', text: 'A honeypot', correct: false, explanation: 'A honeypot is a whole decoy system built to be probed and attacked. Here only a single bogus file was planted.' },
        { id: 'c', text: 'A honeynet', correct: false, explanation: 'A honeynet is a network of honeypots — multiple decoy systems — not a single deceptive file.' },
        { id: 'd', text: 'A tarpit', correct: false, explanation: 'A tarpit delays an attacker\u2019s connections to waste their time. Nothing here delays anything; it alerts on access.' },
      ],
    },
    {
      id: 'q8',
      prompt: 'A contractor needs admin rights for one four-hour maintenance window, with every use logged and the rights gone automatically afterwards. What is the BEST fit?',
      objectives: ['4.6'],
      options: [
        { id: 'a', text: 'Add them to the shared domain-admin group for the day', correct: false, explanation: 'Group membership is standing privilege — easy to forget to remove, and every other member gets pooled attribution in the logs.' },
        { id: 'b', text: 'PAM: check out a vaulted credential just-in-time, expiring at the end of the window', correct: true, explanation: 'Privileged access management vaults the credential, issues just-in-time elevation scoped to the task, logs each use, and expires the ephemeral access automatically.' },
        { id: 'c', text: 'Create a permanent admin account they promise to stop using', correct: false, explanation: 'A standing account with a promise is exactly the over-privileged, unexpired access PAM exists to eliminate.' },
        { id: 'd', text: 'Text them the domain-admin password, then change it afterwards', correct: false, explanation: 'Sending a privileged password in a message exposes it, gives no per-use logging, and the credential is still shared while it is valid.' },
      ],
    },
    {
      id: 'q9',
      prompt: 'Staff sign in to a third-party SaaS with their company credentials through SSO. Which statement BEST describes the federation?',
      objectives: ['4.6'],
      options: [
        { id: 'a', text: 'The SaaS stores a synced copy of each password and verifies it with LDAP', correct: false, explanation: 'LDAP is a directory access protocol, and syncing passwords to the SaaS is precisely what federation avoids — credentials stay at the identity provider.' },
        { id: 'b', text: 'The SaaS issues OAuth 2.0 access tokens so users can prove their identity', correct: false, explanation: 'OAuth 2.0 delegates authorization for APIs — it grants scoped access, not identity. OpenID Connect layers authentication on top of OAuth.' },
        { id: 'c', text: 'The company binds to the SaaS\u2019s directory with SAML to look users up', correct: false, explanation: 'SAML is not a directory lookup. The identity provider signs a SAML assertion the service provider trusts — no password crosses to the SaaS.' },
        { id: 'd', text: 'The identity provider sends a signed assertion (e.g. SAML) the SaaS trusts; credentials never leave the IdP', correct: true, explanation: 'In federation the service provider trusts the identity provider\u2019s assertion — SAML 2.0 for browser SSO, or OIDC\u2019s ID token — so the SaaS never sees the password.' },
      ],
    },
  ],
};

export const m02Walkthrough: WalkStep[] = [
  { goto: [19, 21] },
  { badge: [19, 20] },
  { goto: [11, 17] },
  { interact: 'ticket' },
  { goto: [22, 12] },
  { interact: 'iam-netops' },
  { goto: [26, 12] },
  { interact: 'auth-log' },
  { goto: [12, 13] },
  { inspect: 'greg' },
  { interact: 'greg' },
  { goto: [17, 12] },
  { interact: 'report-console' },
  { goto: [29, 15] },
  { badge: [30, 15] },
  { goto: [31, 15] },
  { goto: [37, 10] },
  { interact: 'core-switch' },
  { wait: 0.2 },
  { goto: [19, 1] },
];

setMapCell(m02.map, 18, 23, 'S');
setMapCell(m02.map, 20, 23, 'S');
setMapCell(m02.map, 18, 24, 'S');
setMapCell(m02.map, 20, 24, 'S');
setMapCell(m02.map, 35, 23, '3');
setMapCell(m02.map, 36, 23, '.');
m02.map.lights = { ...m02.map.lights, ...lightRects([[17, 22, 21, 25, 1]]) };
addThreatEncounter(m02, 'trojan-restore', 'trojan', 3, {
  id: 'restore-ambush',
  after: ['restore'],
  kind: 'bad',
  message: 'A second trojan wave surfaced after the switch was restored.',
}, [27, 9, 37, 19]);
addThreatEncounter(m02, 'trojan-report', 'trojan', 3, {
  id: 'report-ambush',
  after: ['report'],
  kind: 'bad',
  message: 'The shared-account incident drew another wave into the lab.',
}, [4, 11, 14, 19]);

export const m02Teach: MissionTeaching = {
  tagline: 'Day one. Your badge says ANALYST, and someone is handing out keys.',
  situation:
    'Day one on a new floor. Your badge carries the ANALYST role and nothing else. Word is that the sysadmins have been passing one shared admin password around.',
  orders: [
    { text: 'Cross the floor using the access your role actually has.', objective: '4.6' },
    { text: 'Learn who shares the admin password and why it matters.', objective: '1.2' },
    { text: 'Deal with it the way policy expects an analyst to.', objective: '5.6' },
  ],
  keyTerms: ['least privilege', 'role-based access control', 'shared credentials', 'accounting', 'non-repudiation', 'privileged access management', 'zero trust', 'policy enforcement point', 'honeytoken', 'just-in-time access', 'federation'],
  lessons: {
    'no-violations': {
      objective: '4.6',
      done: 'You used only the access your role grants. That is least privilege: no access just in case, and less damage if your badge is ever stolen.',
      missed: 'You badged a door your role does not cover. Even a failed attempt is logged as unauthorized access. Under least privilege, get access through approval when a task needs it.',
    },
    'report': {
      objective: '5.6',
      done: 'You reported the shared-password practice through the official channel. Security can now replace it with named accounts and PAM.',
      missed: 'The shared password was never reported, so four people still act as "admin" and nobody can be held accountable. Refusing is not enough; report it (5.6).',
    },
    'exit': {
      objective: '4.6',
      done: 'Floor cleared.',
      missed: 'You did not reach the exit.',
    },
    'read-ticket': {
      objective: '4.6',
      done: 'You read the change ticket first. The ticket defines exactly which access the task needs.',
      missed: 'You never read the ticket, so you could not know which access the task actually needed.',
    },
    'jit': {
      objective: '4.6',
      done: 'You requested only NETOPS, scoped to the ticket and time-limited. Just-in-time access is least privilege in practice: it expired when the work was done.',
      missed: 'You never requested the scoped NETOPS access the ticket called for. Access comes through an approved, task-scoped request.',
    },
    'restore': {
      objective: '4.6',
      done: 'Uplink restored with exactly the access the task needed, and the temporary role was revoked afterwards.',
      missed: 'The switch uplink was never restored.',
    },
    'no-overprov': {
      objective: '4.6',
      done: 'You never asked for standing admin rights. Unneeded privilege is attack surface.',
      missed: 'You requested DOMAIN ADMIN for a switch ticket. Standing, unscoped privilege violates least privilege, and it is exactly what attackers hunt for.',
    },
    'no-false': {
      objective: '5.6',
      done: 'Every report you filed was accurate.',
      missed: 'You reported someone for something they did not do. Report what you observed, not a guess.',
    },
  },
  examTip: 'Exam clue words: "only what the job requires" = least privilege. "Assigned by job role" = RBAC. "Cannot prove who did it" = a non-repudiation / accounting failure, usually caused by shared accounts.',
};

// F1: encounter pacing — opening skirmish, room ambushes, supplies.
liveThreats(m02, 'open-rat', 'rat', 1, [12, 11, 25, 19]);
addThreatEncounter(m02, 'north-trojan', 'trojan', 3, {
  id: 'vault-ambush', area: [16, 5, 23, 8], kind: 'bad',
  message: 'Trojans drop inside the records vault — the quiet floor was bait.',
}, [15, 1, 25, 5]);
addThreatEncounter(m02, 'west-rat', 'rat', 2, {
  id: 'west-ambush', area: [4, 11, 10, 16], kind: 'bad',
  message: 'RAT implants nest behind the west office partition.',
}, [5, 12, 8, 15]);
addThreatEncounter(m02, 'se-rat', 'rat', 2, {
  id: 'se-ambush', area: [27, 20, 34, 26], kind: 'bad',
  message: 'RAT implants come alive in the mail room annex.',
}, [28, 21, 34, 26]);
m02.entities.push(
  { id: 'chg-n', kind: 'item', ...floorSpot(m02, [15, 2, 25, 4]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-e', kind: 'item', ...floorSpot(m02, [29, 9, 37, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-w', kind: 'item', ...floorSpot(m02, [5, 12, 8, 15]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-c', kind: 'item', ...floorSpot(m02, [10, 17, 26, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'med-c', kind: 'item', ...floorSpot(m02, [14, 21, 25, 27]), sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 }, inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

// — rF2 landmarks: east datacenter = bright grid floor + console uplink wall;
// admin suite SW = dim rust floor with workstations; break room = rust.
m02.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m02.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m02, [30, 8, 38, 20], 'floor', ',');
retex(m02, [4, 21, 15, 28], 'floor', ';');
retex(m02, [27, 24, 31, 28], 'floor', ';');
m02.map.lights = { ...m02.map.lights, ...lightRects([[31, 8, 38, 19, 0.85], [5, 21, 13, 27, 0.5]]) };
m02.entities.push(
  { id: 'dc-wall-a', kind: 'prop', x: 34.5, y: 9.5, sprite: 'console' },
  { id: 'dc-wall-b', kind: 'prop', x: 36.5, y: 9.5, sprite: 'console' },
  { id: 'adm-desk-a', kind: 'prop', x: 6.5, y: 26.5, sprite: 'workstation' },
  { id: 'adm-desk-b', kind: 'prop', x: 9.5, y: 26.5, sprite: 'workstation' },
  { id: 'srv-cache', kind: 'item', x: 36.5, y: 23.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
);
