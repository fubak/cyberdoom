import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, mixedThreatEncounter, retex, setMapCell } from './campaign-map';

/**
 * M1 "Patch Tuesday" — antimalware, endpoint hygiene, removable media.
 * Difficulty 1 (rookie). Critical path, two concept gates:
 *   1. Turn the found USB in at the Security Desk → IT OPS badge role →
 *      server room (patient zero lives there). Plugging it into the spare PC
 *      FAILS the mission.
 *   2. QUARANTINE exit door opens only once every infected host is clean.
 * Loop: hub → IT OPS door → server room → back door → south corridor → hub.
 * Secrets: lobby supply closet (brick), cable crawlspace above the racks.
 */
export const m01: Mission = {
  id: 'm01',
  title: 'PATCH TUESDAY',
  difficulty: 1,
  objectives: ['2.4', '2.2', '2.5', '3.4', '5.6'],
  briefing:
    'Patch Tuesday went wrong. Three workstations on this floor are behaving abnormally, ' +
    'and a USB stick nobody claims is lying in the corridor. ' +
    'Your kit: MOUSE (2) inspects whatever is under the crosshair. USB SCANNER (3) fires ' +
    'endpoint-protection charges that remove malware from a host. KEYBOARD (1) operates whatever ' +
    'is in front of you; on a device, that means connecting it. Charges are limited. ' +
    'Work out what is wrong, deal with it, and reach the exit.',
  authorizedRoles: ['staff'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge'],
  map: {
    grid: [
    '###############################SSSSSSSSS########',
    '################...EE...#######S.......S########',
    '################........#######S.......S########',
    '################........######SSSSSSS2SS#####..#',
    '################........######S........S#####..#',
    '###################QQ#########S........S#####..#',
    '##.......#....................S..SSSS..S#####5##',
    '##.......#....................S........S#......#',
    '##.......#...##..........##...S........S#......#',
    '##.......d....................S..SSSS..S#......#',
    '##.......#.........SS.........I........S#..##..#',
    '##.......#...##....SS....##...S........S#..##..#',
    '##.......#...##..........##...S..SSSS..S#..##..#',
    '##########....................S........S#..##..#',
    '######........................S........S#..##..#',
    '######........................SSSSJSSSSS#......#',
    '######..##############oo##########.######.4....#',
    '######..##############..##########.######..##..#',
    '######..##############...............####..##..#',
    '######..##############...............####..##..#',
    '###BBB..BBBBBBB###############rr#########..##..#',
    '###B..........B###############..#########..##..#',
    'BBBB..........B#......................###..##..#',
    'B..B..........B#......................###......#',
    'B..1........S.B#....##.....##.........###......#',
    'B..B.......S.Sp.....##.....##..........T.......#',
    'BBBB..........B#......................##########',
    '###B.......S.SB#......................##########',
    '###B........S.B#################################',
    '###BBBBBBBBBBBB#################################',
  ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      'S': { kind: 'wall', tex: 'wall-server' },
      'B': { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      'E': { kind: 'exit', tex: 'exit' },
      'd': { kind: 'door', tex: 'door', doorId: 'secdesk' },
      'o': { kind: 'door', tex: 'door', doorId: 'south' },
      'p': { kind: 'door', tex: 'door', doorId: 'print' },
      'r': { kind: 'door', tex: 'door', doorId: 'print-north' },
      'I': { kind: 'door', tex: 'door', doorId: 'itops', accessRole: 'itops' },
      'J': { kind: 'door', tex: 'door', doorId: 'itops-back', accessRole: 'itops' },
      'Q': {
        kind: 'door', tex: 'door', doorId: 'quarantine', locked: true,
        lockText: 'QUARANTINE: exit stays sealed until every infected host is clean',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-closet', secret: true },
      '2': { kind: 'door', tex: 'wall-server', doorId: 'secret-crawl', secret: true },
      '3': { kind: 'door', tex: 'wall-server', doorId: 'secret-core', secret: true },
    },
    spawn: { x: 7.0, y: 26.5, angle: -1.82 },
    defaultLight: 0.8,
    lights: lightRects([[10, 6, 29, 15, 0.85], [4, 21, 13, 28, 0.9], [10, 24, 14, 28, 1.0], [6, 14, 7, 20, 0.55], [6, 16, 7, 18, 1.0], [2, 6, 8, 12, 0.8], [31, 4, 38, 14, 0.45], [36, 12, 38, 14, 0.7], [32, 1, 38, 2, 0.35], [1, 23, 2, 25, 0.35], [16, 1, 23, 4, 1.0], [22, 16, 36, 19, 0.5], [16, 21, 37, 27, 0.6]]),
  },
  entities: [
    {
      id: 'found-usb', kind: 'item', x: 6.5, y: 17.5, sprite: 'usb', carry: true,
      tags: ['found-usb'],
      inspect: {
        label: 'USB stick labeled "Q3 BONUSES"',
        detail: 'Found on the corridor floor near the lifts. No name, no asset tag. Generic 32 GB drive.',
        category: 'item',
        objectives: ['2.2', '5.6'],
      },
    },
    {
      id: 'sec-desk', kind: 'console', x: 3.5, y: 9.5, sprite: 'console',
      tags: ['security-desk'], accepts: 'found-usb', grants: { resource: 'role:itops', amount: 1 },
      log: 'SECURITY DESK: lost & found / unknown media drop.\nHand over found devices. Do NOT plug them in.',
      inspect: {
        label: 'Security Desk',
        detail: 'Drop point for found or suspicious devices. Security analyses them in an isolated sandbox.',
        category: 'legit',
        objectives: ['2.2', '5.6'],
      },
    },
    {
      id: 'spare-pc', kind: 'workstation', x: 16.5, y: 7.5, sprite: 'workstation',
      tags: ['plug-usb'], accepts: 'found-usb',
      log: 'Spare PC: nobody logged in, front USB port free.',
      inspect: {
        label: 'Unlocked spare PC',
        detail: 'Logged-in session, no owner, open USB port.',
        category: 'legit',
        objectives: ['2.2'],
      },
    },
    {
      id: 'ws1', kind: 'workstation', x: 12.5, y: 10.5, sprite: 'workstation-infected',
      infected: true, tags: ['infected'], cleanObjectives: ['2.5', '4.8'],
      inspect: {
        call: 'auto',
        label: 'WS-07 (finance)',
        detail: 'Resource inaccessibility: every file in Documents now ends in .lkd and will not open. New file README_RESTORE.txt: "Pay 0.5 BTC for your key." Disk activity spiked at 02:00.',
        category: 'malware',
        objectives: ['2.4'],
        flags: ['resource inaccessibility', 'ransom note', 'mass file renames'],
      },
    },
    {
      id: 'ws2', kind: 'workstation', x: 27.5, y: 14.5, sprite: 'workstation-infected',
      infected: true, tags: ['infected'], cleanObjectives: ['2.5', '4.8'],
      inspect: {
        call: 'auto',
        label: 'WS-04 (accounts payable)',
        detail: 'Pop-ups: "VIRUS DETECTED, call 1-800 support". Browser homepage changed overnight. New toolbar; proxy log shows it contacting tr4ck-cdn.biz every 60 s, even when idle.',
        category: 'malware',
        objectives: ['2.4'],
        flags: ['unexpected pop-ups', 'changed settings', 'unknown outbound beacon'],
      },
    },
    {
      id: 'ws3', kind: 'workstation', x: 37.5, y: 13.5, sprite: 'workstation-infected',
      infected: true, tags: ['infected'], cleanObjectives: ['2.5', '4.8'],
      inspect: {
        call: 'auto',
        label: 'WS-12 (reception)',
        detail: 'Resource consumption: CPU pinned at 100%. Firewall log: SMB (445) connections to 63 internal hosts it has never contacted before. User: "I didn\'t open or run anything."',
        category: 'malware',
        objectives: ['2.4'],
        flags: ['resource consumption', 'internal scanning on 445', 'no user action'],
      },
    },
    {
      id: 'ws-clean', kind: 'workstation', x: 14.5, y: 10.5, sprite: 'workstation',
      inspect: {
        call: 'auto',
        label: 'Workstation MKT-11',
        detail: 'Patched last night, AV signatures current, no unusual processes.',
        category: 'legit',
      },
    },
    {
      id: 'ws-decoy', kind: 'workstation', x: 30.5, y: 25.5, sprite: 'workstation-infected', tags: ['decoy'],
      inspect: {
        call: 'auto',
        label: 'Workstation PRN-02 (print room)',
        detail: 'CPU 96%: spoolsv.exe (print spooler, signed by the OS vendor) rendering a 1,400-page job queued by FACILITIES. Firewall log: outbound 9100/tcp to PRN-FLOOR2, its assigned printer, and nothing else. No new processes or services since the patch run. Endpoint protection: signatures updated 06:00, last full scan clean. Pop-up on screen: "Toner low - tray 2".',
        category: 'legit',
        objectives: ['2.4'],
      },
    },
    { id: 'worm-hub', kind: 'enemy', x: 21.5, y: 13.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Self-replicating: spreads host to host with no user action.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-print', kind: 'enemy', x: 33.5, y: 23.5, sprite: 'worm', ai: 'wander', hp: 2, infected: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Scanning the print VLAN for open SMB shares.', category: 'malware', objectives: ['2.4'] } },
    { id: 'worm-lobby', kind: 'enemy', x: 11.5, y: 22.5, sprite: 'worm', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Worm', detail: 'Followed you in from the lobby kiosk.', category: 'malware', objectives: ['2.4'] } },
    { id: 'trojan-a', kind: 'enemy', x: 37.5, y: 4.5, sprite: 'trojan', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Trojan', detail: 'Posed as a legitimate firmware update; opened a remote-access backdoor on the rack.', category: 'malware', objectives: ['2.4'] } },
    { id: 'trojan-b', kind: 'enemy', x: 31.5, y: 13.5, sprite: 'trojan', ai: 'chase', hp: 2, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Trojan', detail: 'Posed as a legitimate firmware update; opened a remote-access backdoor on the rack.', category: 'malware', objectives: ['2.4'] } },
    { id: 'chg-hub', kind: 'item', x: 10.5, y: 6.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
    { id: 'chg-desk', kind: 'item', x: 7.5, y: 7.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
    { id: 'chg-south', kind: 'item', x: 36.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
    { id: 'chg-print', kind: 'item', x: 17.5, y: 26.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
      inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
    { id: 'med-closet', kind: 'item', x: 1.5, y: 24.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    { id: 'med-crawl', kind: 'item', x: 37.5, y: 1.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
    {
      id: 'find-patch', kind: 'item', x: 22.5, y: 22.5, sprite: 'tool-patch',
      tags: ['arsenal-pickup'], grants: { resource: 'tool:patch', amount: 1 },
      inspect: { label: 'Patch disk (found)', detail: 'Vendor security updates for the floor\'s workstations.', category: 'item', objectives: ['2.5'] },
    },
    {
      id: 'disk-hub', kind: 'item', x: 13.5, y: 7.5, sprite: 'patch-disk',
      tags: ['arsenal-pickup'], grants: { resource: 'patch-disk', amount: 2 },
      inspect: { label: 'Patch disks', detail: 'Signed vendor updates (verify the signature before you install).', category: 'item', objectives: ['2.5'] },
    },
    {
      id: 'disk-south', kind: 'item', x: 36.5, y: 19.5, sprite: 'patch-disk',
      tags: ['arsenal-pickup'], grants: { resource: 'patch-disk', amount: 2 },
      inspect: { label: 'Patch disks', detail: 'Signed vendor updates (verify the signature before you install).', category: 'item', objectives: ['2.5'] },
    },
  ],
  missionObjectives: [
    { id: 'turn-in', text: 'Handle the found USB stick per policy', kind: 'interact', tag: 'security-desk' },
    { id: 'clean-all', text: 'Clean all 3 infected workstations', kind: 'clean', tag: 'infected', count: 3, requiresInspect: true },
    { id: 'no-plug', text: 'Never plug in unknown media', kind: 'avoid', tag: 'plug-usb' },
    { id: 'wrong-call', text: 'Make the right call on each case file', kind: 'avoid', tag: 'wrong-call', strikes: 3 },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 150,
    triggers: [
      { id: 'usb-ambush', area: [6, 8, 7, 9], spawn: ['worm-lobby'], kind: 'warn',
        message: 'Worm alert: lateral movement behind you in the lobby!' },
      { id: 'server-ambush', area: [31, 9, 32, 11], spawn: ['trojan-a', 'trojan-b'], kind: 'bad',
        message: 'Trojans were hiding between the racks!' },
      { id: 'containment', after: ['clean-all'], openDoors: ['quarantine'], kind: 'good',
        message: 'All hosts clean: quarantine lifted, exit unsealed.' },
    ],
    secrets: [
      { id: 'closet', area: [1, 23, 2, 25], label: 'Supply closet', grant: { resource: 'usb-charge', amount: 16 } },
      { id: 'crawl', area: [32, 1, 38, 2], label: 'Cable crawlspace', grant: { resource: 'integrity', amount: 40 } },
      { id: 'core', area: [30, 4, 30, 4], label: 'Server core alcove', grant: { resource: 'usb-charge', amount: 16 } },
    ],
  },
  debriefQuestions: [
    {
      id: 'q1',
      prompt: 'A user on WS-07 reports that every file in Documents now ends in ".lkd" and will not open, and a text file demands payment in Bitcoin. Which malware type do these indicators point to?',
      objectives: ['2.4'],
      options: [
        { id: 'a', text: 'Spyware', correct: false, explanation: 'Spyware is built to stay hidden while it collects data. It does not lock files and announce itself with a demand.' },
        { id: 'b', text: 'Ransomware', correct: true, explanation: 'Resource inaccessibility (files that won\u2019t open), mass renaming and a payment demand are the defining indicators of ransomware.' },
        { id: 'c', text: 'Logic bomb', correct: false, explanation: 'A logic bomb is code that runs when a condition is met (a date, an account being deleted). The encryption and ransom note identify the payload as ransomware.' },
        { id: 'd', text: 'Worm', correct: false, explanation: 'A worm is defined by how it spreads (self-propagation), not by encrypting data for payment. Nothing here shows the host scanning or infecting others.' },
      ],
    },
    {
      id: 'q2',
      prompt: 'WS-12\u2019s CPU is pinned at 100%, and firewall logs show it opening SMB connections to dozens of internal hosts it has never contacted. Its user says they did not open or run anything. What BEST explains this?',
      objectives: ['2.4'],
      options: [
        { id: 'a', text: 'A trojan the user installed', correct: false, explanation: 'Trojans need a user to run them and do not spread on their own. The user ran nothing, and the host is actively infecting others.' },
        { id: 'b', text: 'A keylogger', correct: false, explanation: 'Keyloggers quietly record keystrokes with a small footprint. They do not scan the network or max out the CPU.' },
        { id: 'c', text: 'A worm', correct: true, explanation: 'Self-propagation to other hosts with no user action, plus abnormal resource consumption, is the worm signature.' },
        { id: 'd', text: 'Bloatware', correct: false, explanation: 'Bloatware is unwanted preinstalled software. It can waste resources, but it does not try to connect to dozens of peers over SMB.' },
      ],
    },
    {
      id: 'q3',
      prompt: 'A USB drive labeled "Q3 BONUSES" is found in the corridor. A coworker says it is safe to plug in because endpoint protection is up to date. What is the BEST response?',
      objectives: ['2.2', '5.6'],
      options: [
        { id: 'a', text: 'Plug it into a spare PC that is not on the network to find the owner', correct: false, explanation: 'Offline does not mean safe. The device can still compromise that PC (or pose as a keyboard), and identifying the owner is not the finder\u2019s job.' },
        { id: 'b', text: 'Trust the antimalware to scan it when it is inserted', correct: false, explanation: 'Endpoint protection mostly catches known threats. Malicious firmware and keystroke-injection devices act before or outside a file scan, so inserting it is the risk.' },
        { id: 'c', text: 'Throw it away so nobody uses it', correct: false, explanation: 'This removes one drive but leaves security blind. Malicious drives are often dropped in batches, and only a report lets the team warn staff and investigate.' },
        { id: 'd', text: 'Do not connect it; hand it to security and report where it was found', correct: true, explanation: 'Removable devices are an SY0-701 threat vector (2.2), and the awareness response is to report rather than handle it yourself (5.6). Security can analyze it safely.' },
      ],
    },
    {
      id: 'q4',
      prompt: 'All three hosts are now clean. Which action BEST stops them from being reinfected the same way?',
      objectives: ['2.5'],
      options: [
        { id: 'a', text: 'Harden them: patch the OS and apps, keep endpoint protection current, remove unnecessary software', correct: true, explanation: 'These are SY0-701 hardening techniques (2.5). Patching closes the hole the worm used, and updated protection catches the next variant.' },
        { id: 'b', text: 'Re-image them from the same golden image and change nothing else', correct: false, explanation: 'Re-imaging removes the infection but brings back the same unpatched build, so the worm can get in again the same way.' },
        { id: 'c', text: 'Make each user a local administrator so they can install fixes themselves', correct: false, explanation: 'This breaks least privilege. Malware a user runs would then have admin rights too.' },
        { id: 'd', text: 'Disable the host firewall so the scanner can reach them faster', correct: false, explanation: 'A host-based firewall is a hardening control. Removing it widens the attack surface the worm exploited.' },
      ],
    },
    {
      id: 'q5',
      prompt: 'WS-07 is clean, but its files are still encrypted. The organization replicates the Documents share to a second server every 5 minutes and also takes nightly offline backups. How should the files be recovered?',
      objectives: ['3.4'],
      options: [
        { id: 'a', text: 'Restore from the replicated copy on the second server', correct: false, explanation: 'Replication copies changes in near real time, so the encrypted files were replicated too. Replication protects availability, not against corruption.' },
        { id: 'b', text: 'Run the antimalware scan again; removing the ransomware decrypts the files', correct: false, explanation: 'Removing the malware stops further damage but does not reverse encryption. The data is still unreadable.' },
        { id: 'c', text: 'Restore from the last good offline backup', correct: true, explanation: 'Offline backups are out of the malware\u2019s reach, so they are clean point-in-time copies. Restore only after the threat is eradicated.' },
        { id: 'd', text: 'Pay the ransom, since it is the fastest route', correct: false, explanation: 'Paying does not guarantee a working key, funds the attacker, and can break sanctions rules. Backups make it unnecessary.' },
      ],
    },
  ],
};

export const m01Walkthrough: WalkStep[] = [
  { goto: [6, 17] },
  { goto: [10, 9] },
  { use: [9, 9] },
  { goto: [4, 9] },
  { interact: 'sec-desk' },
  { inspect: 'ws1' },
  { call: 'ws1' },
  { clean: 'ws1' },
  { goto: [29, 10] },
  { badge: [30, 10] },
  { goto: [31, 10] },
  { goto: [36, 13] },
  { inspect: 'ws3' },
  { call: 'ws3' },
  { clean: 'ws3' },
  { inspect: 'ws2' },
  { call: 'ws2' },
  { clean: 'ws2' },
  { wait: 0.2 },
  { goto: [19, 1] },
];

setMapCell(m01.map, 6, 22, 'S');
setMapCell(m01.map, 8, 22, 'S');
setMapCell(m01.map, 6, 23, 'S');
setMapCell(m01.map, 8, 23, 'S');
setMapCell(m01.map, 30, 4, '.');
setMapCell(m01.map, 31, 4, '3');
m01.map.lights = { ...m01.map.lights, ...lightRects([[5, 20, 9, 24, 1]]) };
addThreatEncounter(m01, 'worm-turnin', 'worm', 1, {
  id: 'turnin-ambush',
  after: ['turn-in'],
  kind: 'bad',
  message: 'The USB turn-in triggered a second worm wave from the server floor.',
}, [18, 10, 37, 19]);

// F1: encounter pacing — opening skirmish, backtrack ambush, door reveal,
// finale wave on quarantine lift, and supplies for the extra pressure.
m01.entities.push({
  id: 'worm-hall-live', kind: 'enemy', x: 23.5, y: 24.5, sprite: 'worm', ai: 'wander',
  hp: 2, infected: true, tags: ['malware'],
  inspect: { label: 'Worm', detail: 'Roaming the east corridor: self-replicating process.', category: 'malware', objectives: ['2.4'] },
});
addThreatEncounter(m01, 'hub-pack', 'rat', 2, {
  id: 'hub-ambush',
  area: [10, 13, 20, 15],
  kind: 'bad',
  message: 'RAT implants behind you — the infection came through the north corridor!',
}, [6, 6, 29, 12]);
addThreatEncounter(m01, 'south-pack', 'rat', 2, {
  id: 'south-ambush',
  area: [22, 17, 25, 19],
  kind: 'bad',
  message: 'The print-room door was hiding a RAT cluster — they are behind you now.',
}, [20, 21, 38, 25]);
addThreatEncounter(m01, 'exit-worm', 'worm', 1, {
  id: 'exit-surge',
  after: ['clean-all'],
  kind: 'bad',
  message: 'Quarantine lifted — the last of the worm traffic is loose on the floor!',
}, [14, 13, 29, 15]);
addThreatEncounter(m01, 'exit-trojan', 'trojan', 1, {
  id: 'exit-trojan',
  after: ['clean-all'],
  kind: 'bad',
}, [18, 10, 29, 15]);
m01.entities.push(
  { id: 'chg-mid', kind: 'item', x: 25.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
  { id: 'chg-east', kind: 'item', x: 36.5, y: 22.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
  { id: 'chg-lobby-e', kind: 'item', x: 17.5, y: 26.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for your write-protected scanner stick: ammo for the USB scanner.', category: 'item' } },
  { id: 'med-hub', kind: 'item', x: 10.5, y: 13.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

export const m01Teach: MissionTeaching = {
  tagline: 'Screens are screaming and a USB stick is lying by the lifts.',
  situation:
    'Patch Tuesday went wrong. Workstations across the 4th floor are throwing alerts, not all for the same reason, and someone left a USB stick by the lifts. You are first on scene.',
  orders: [
    { text: 'Read every flagged host before you act.', objective: '2.4' },
    { text: 'Clean only what is actually infected.', objective: '2.5' },
    { text: 'Decide what to do with the unclaimed USB stick.', objective: '5.6' },
  ],
  keyTerms: ['indicators of malicious activity', 'ransomware', 'worm', 'spyware', 'removable device', 'false positive', 'endpoint protection', 'backups'],
  lessons: {
    'wrong-call': { objective: '2.4', done: 'Every case file got the right triage call before acting.', missed: 'A wrong call was logged on a case file. Decide from the evidence, not the sprite.' },
    'clean-all': {
      objective: '2.5',
      done: 'All infected hosts were cleaned. Endpoint protection is a hardening control (2.5), but cleaning only fixes the symptom. Patch the hole the worm used, or it comes back.',
      missed: 'Some infected hosts are still live. A worm on WS-12 keeps scanning port 445 and infecting peers, so every minute you wait adds hosts to clean up. Contain and clean first.',
    },
    'no-plug': {
      objective: '2.2',
      done: 'You left the found drive alone. Removable devices are a listed threat vector (2.2). The correct awareness response is to hand them to security and report (5.6).',
      missed: 'You plugged in unknown media. A "Q3 BONUSES" label is bait, and the drive could install malware or pose as a keyboard the moment it is connected. Never connect found media; report it (5.6).',
    },
    'exit': {
      objective: '5.6',
      done: 'Floor cleared and reported.',
      missed: 'You did not reach the exit, so the incident was never reported.',
    },
    'turn-in': {
      objective: '5.6',
      done: 'You carried the unknown drive to the Security Desk instead of connecting it. Removable devices are a threat vector (2.2), and handing found media to security is the trained awareness response (5.6).',
      missed: 'The found drive never reached the Security Desk. Leaving it on the floor means the next person may plug it in. Report and hand over found media (5.6).',
    },
    'false-positive': {
      objective: '2.4',
      done: 'No false positives. PRN-02 looked busy, but its CPU spike was a signed print spooler talking only to its own printer. An indicator needs context before you act on it.',
      missed: 'You hit a clean host. PRN-02\'s CPU spike was a signed spooler job sent to its own printer, and its pop-up was a toner warning. Acting on one indicator without context wastes response effort and disrupts the user.',
    },
  },
  examTip: 'Exam questions identify malware by its behavior. Self-spreads with no user action = worm. Disguised and run by the user = trojan. Encrypts files and demands payment = ransomware. Hides and collects data = spyware. Triggers on a condition = logic bomb.',
};

// — rF2 landmarks: the east server hall reads as the NOC (grid floor, bright,
// console video wall), the south-west brick office as the dim ops bullpen
// (rust floor, workstations) so navigation can be learned without the marker.
m01.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m01.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m01, [30, 1, 38, 15], 'floor', ',');
retex(m01, [0, 19, 14, 28], 'floor', ';');
m01.map.lights = { ...m01.map.lights, ...lightRects([[31, 1, 38, 14, 0.85], [0, 20, 14, 28, 0.55]]) };
m01.entities.push(
  { id: 'noc-wall-a', kind: 'prop', x: 33.5, y: 1.8, sprite: 'console' },
  { id: 'noc-wall-b', kind: 'prop', x: 35.5, y: 1.8, sprite: 'console' },
  { id: 'bullpen-desk-a', kind: 'prop', x: 5.5, y: 22.5, sprite: 'workstation' },
  { id: 'bullpen-desk-b', kind: 'prop', x: 11.5, y: 22.5, sprite: 'workstation' },
  { id: 'core-cache', kind: 'item', x: 30.5, y: 4.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
);

// rF4: 48x30 silhouette — east maintenance-ring annex (ring of corridors around
// a sealed pillar) joined by door 'T'; two secret caches off the ring, cued by
// wall-secret texture + light dips, and a mixed worm+trojan ambush in the ring.
m01.map.legend.T = { kind: 'door', tex: 'door', doorId: 'annex-door' };
m01.map.legend['4'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'annex-cache-a' };
m01.map.legend['5'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'annex-cache-b' };
m01.entities.push(
  { id: 'annex-cache-a-item', kind: 'item', x: 43.5, y: 15.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'annex-cache-a-item-b', kind: 'item', x: 44.5, y: 16.5, sprite: 'medkit' },
  { id: 'annex-cache-b-item', kind: 'item', x: 45.5, y: 4.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
);
m01.script!.secrets!.push(
  { id: 'annex-cache-a', area: [43, 15, 44, 16], label: 'Cold-site cache', grant: { resource: 'usb-charge', amount: 8 } },
  { id: 'annex-cache-b', area: [45, 3, 46, 5], label: 'Roof relay stash', grant: { resource: 'integrity', amount: 25 } },
);
mixedThreatEncounter(m01, 'ring-mix', [['worm', 3], ['trojan', 2]],
  { id: 'ring-ambush', area: [40, 23, 46, 25], kind: 'bad',
    message: 'Dormant processes stirred in the maintenance ring — the annex sweep was not clean.' },
  [41, 7, 46, 25]);
m01.map.lights = { ...m01.map.lights, ...lightRects([[41, 7, 46, 25, 0.55], [43, 15, 44, 16, 0.85], [45, 3, 46, 5, 0.85], [41, 16, 41, 16, 0.35], [44, 7, 44, 7, 0.35]]) };
