import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';

/**
 * M1 "Patch Tuesday" — malware indicators, endpoint protection, removable media.
 * Difficulty 1. Clean infected workstations with the USB scanner (slot 3),
 * do NOT plug in the found USB, reach the exit.
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
  map: {
    grid: [
      '############',
      '#..........#',
      '#.##....##.#',
      '#.#......#.#',
      '#.#......#.#',
      '#.##.##.##.#',
      '#..........#',
      '#....E.....#',
      '############',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      '.': { kind: 'floor', tex: 'floor' },
      'E': { kind: 'exit', tex: 'exit' },
    },
    spawn: { x: 2, y: 1.5, angle: Math.PI / 2 },
    defaultLight: 0.85,
  },
  entities: [
    {
      id: 'ws1', kind: 'workstation', x: 5, y: 3.5, sprite: 'workstation-infected',
      infected: true, tags: ['infected'],
      inspect: {
        label: 'WS-04 (accounts payable)',
        detail: 'Pop-ups: "VIRUS DETECTED, call 1-800 support". Browser homepage changed overnight. New toolbar; proxy log shows it contacting tr4ck-cdn.biz every 60 s, even when idle.',
        category: 'malware',
        objectives: ['2.4'],
        flags: ['unexpected pop-ups', 'changed settings', 'unknown outbound beacon'],
      },
    },
    {
      id: 'ws2', kind: 'workstation', x: 8, y: 4.5, sprite: 'workstation-infected',
      infected: true, tags: ['infected'],
      inspect: {
        label: 'WS-07 (finance)',
        detail: 'Resource inaccessibility: every file in Documents now ends in .lkd and will not open. New file README_RESTORE.txt: "Pay 0.5 BTC for your key." Disk activity spiked at 02:00.',
        category: 'malware',
        objectives: ['2.4', '3.4'],
        flags: ['resource inaccessibility', 'ransom note', 'mass file renames'],
      },
    },
    {
      id: 'ws3', kind: 'workstation', x: 2, y: 6.5, sprite: 'workstation-infected',
      infected: true, tags: ['infected'],
      inspect: {
        label: 'WS-12 (reception)',
        detail: 'Resource consumption: CPU pinned at 100%. Firewall log: SMB (445) connections to 63 internal hosts it has never contacted before. User: "I didn\'t open or run anything."',
        category: 'malware',
        objectives: ['2.4'],
        flags: ['resource consumption', 'internal scanning on 445', 'no user action'],
      },
    },
    {
      id: 'found-usb', kind: 'item', x: 6, y: 1.5, sprite: 'usb',
      tags: ['found-usb'],
      inspect: {
        label: 'USB stick labeled "Q3 BONUSES"',
        detail: 'Found on the corridor floor near the lifts. No name, no asset tag. Generic 32 GB drive.',
        category: 'item',
        objectives: ['2.2', '5.6'],
      },
    },
    {
      id: 'charge1', kind: 'item', x: 10, y: 1.5, sprite: 'charge',
      tags: ['charge'], grants: { resource: 'usb-charge', amount: 4 },
      inspect: {
        label: 'Scanner charges',
        detail: 'Fresh antimalware definitions. Signature-based protection is only as good as its latest update (2.5).',
        category: 'item',
        objectives: ['2.5'],
      },
    },
  ],
  missionObjectives: [
    { id: 'clean-all', text: 'Clean all 3 infected workstations', kind: 'clean', tag: 'infected', count: 3 },
    { id: 'no-usb', text: 'Handle the found USB stick per policy', kind: 'avoid', tag: 'found-usb' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
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

export const m01Teach: MissionTeaching = {
  situation:
    'Patch Tuesday went wrong. Three workstations on the 4th floor are throwing indicators of malicious activity, and someone left a USB stick in the corridor. You are first on scene.',
  orders: [
    { text: 'Read each workstation\'s indicators. You will be asked what malware each one has.', objective: '2.4' },
    { text: 'Restore every affected host to a clean state.', objective: '2.5' },
    { text: 'Decide what to do about the unclaimed USB stick.', objective: '2.2' },
    { text: 'Reach the exit.', objective: '5.6' },
  ],
  keyTerms: ['indicators of malicious activity', 'ransomware', 'worm', 'spyware', 'removable device', 'endpoint protection', 'backups'],
  lessons: {
    'clean-all': {
      objective: '2.5',
      done: 'All infected hosts were cleaned. Endpoint protection is a hardening control (2.5), but cleaning only fixes the symptom. Patch the hole the worm used, or it comes back.',
      missed: 'Some infected hosts are still live. A worm on WS-12 keeps scanning port 445 and infecting peers, so every minute you wait adds hosts to clean up. Contain and clean first.',
    },
    'no-usb': {
      objective: '2.2',
      done: 'You left the found drive alone. Removable devices are a listed threat vector (2.2). The correct awareness response is to hand them to security and report (5.6).',
      missed: 'You plugged in unknown media. A "Q3 BONUSES" label is bait, and the drive could install malware or pose as a keyboard the moment it is connected. Never connect found media; report it (5.6).',
    },
    exit: {
      objective: '5.6',
      done: 'Floor cleared and reported.',
      missed: 'You did not reach the exit, so the incident was never reported.',
    },
  },
  examTip: 'Exam questions identify malware by its behavior. Self-spreads with no user action = worm. Disguised and run by the user = trojan. Encrypts files and demands payment = ransomware. Hides and collects data = spyware. Triggers on a condition = logic bomb.',
};
