import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';

/**
 * M2 "Need to Know" — least privilege, RBAC, accountability.
 * Difficulty 3. Badge only doors your role ('analyst') is authorized for.
 * A sysadmin NPC offers a shared password — refuse it and report. Reach the exit.
 */
export const m02: Mission = {
  id: 'm02',
  title: 'NEED TO KNOW',
  difficulty: 3,
  objectives: ['4.6', '1.2', '5.6'],
  briefing:
    'New floor, first day. Your badge carries the ANALYST role. The doors here use ' +
    'role-based access control, and every badge attempt, allowed or denied, is logged to your name. ' +
    'Word is that someone on the floor is handing out "the shared admin password". ' +
    'Your kit: BADGE (4) presents your credential to a door. MOUSE (2) inspects. ' +
    'KEYBOARD (1) flags a person, and on the security console it files a report. ' +
    'Get across the floor to the exit.',
  authorizedRoles: ['analyst'],
  map: {
    grid: [
      '################',
      '#......#.......#',
      '#..##..D..###..#',
      '#..#...#....#..#',
      '#..#...#....#..#',
      '#..#####.####..#',
      '#..............#',
      '#..#....d...#..#',
      '#..#....#...#..#',
      '#..######.###..#',
      '#.......E......#',
      '################',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      '.': { kind: 'floor', tex: 'floor' },
      'D': { kind: 'door', tex: 'door', doorId: 'admin-door', accessRole: 'admin' },
      'd': { kind: 'door', tex: 'door', doorId: 'lab-door', accessRole: 'analyst' },
      'E': { kind: 'exit', tex: 'exit' },
    },
    spawn: { x: 1.5, y: 1.5, angle: 0 },
    defaultLight: 0.85,
    lights: { '7,7': 1.0 },
  },
  entities: [
    {
      id: 'sysadmin', kind: 'npc', x: 7.5, y: 6.5, sprite: 'npc-suit',
      ai: 'stand', reportable: true, culprit: true, tags: ['shared-pw-offer'],
      inspect: {
        label: 'M. Grant, sysadmin',
        detail: '"Tickets take forever. Here: admin / Winter2024!, the whole team uses it." SERVER AUTH LOG (24 h): 212 logins as "admin" from 4 different workstations; 0 logins by named accounts.',
        category: 'person',
        objectives: ['1.2', '5.6'],
        flags: ['offers shared credentials', 'bypasses individual accounts'],
      },
    },
    {
      id: 'analyst-npc', kind: 'npc', x: 5, y: 8.5, sprite: 'npc-f',
      ai: 'wander', reportable: true, culprit: false,
      inspect: {
        label: 'A. Chen, analyst',
        detail: 'BADGE LOG: ANALYST badge, lab door x3 today, no denied attempts. "Need server access? Raise a ticket and it gets approved for the task."',
        category: 'person',
        objectives: ['4.6'],
      },
    },
    {
      id: 'console1', kind: 'console', x: 12, y: 6.5, sprite: 'console',
      tags: ['report-console'],
      inspect: {
        label: 'Security reporting console',
        detail: 'Security reporting console: the official channel for reporting policy violations. KEYBOARD (1) files a report on whoever you have flagged.',
        category: 'item',
        objectives: ['5.6'],
      },
    },
    {
      id: 'worm1', kind: 'enemy', x: 11, y: 1.5, sprite: 'worm',
      ai: 'chase', hp: 1, infected: true, tags: ['infected'],
      inspect: {
        label: 'Worm process',
        detail: 'Self-replicating malware moving host to host with no user action (2.4). One scanner charge cleans it.',
        category: 'malware',
        objectives: ['2.4'],
      },
    },
  ],
  missionObjectives: [
    { id: 'no-violations', text: 'No unauthorized badge attempts', kind: 'doors' },
    { id: 'report-admin', text: 'Deal with the credential-sharing problem', kind: 'interact', tag: 'report-console' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  debriefQuestions: [
    {
      id: 'q1',
      prompt: 'Your badge opens the ANALYST lab but not the ADMIN server room. A teammate suggests asking for server-room access "just in case you ever need it." Under least privilege, what should you do?',
      objectives: ['4.6'],
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
      objectives: ['4.6'],
      options: [
        { id: 'a', text: 'Role-based access control (RBAC)', correct: true, explanation: 'Permissions attach to the role, and people inherit them by being assigned the role. Change someone\u2019s job and you change their role, not every door.' },
        { id: 'b', text: 'Discretionary access control (DAC)', correct: false, explanation: 'In DAC the resource owner decides who gets access on a case-by-case basis. Here, a centrally defined role decides.' },
        { id: 'c', text: 'Mandatory access control (MAC)', correct: false, explanation: 'MAC compares clearance labels with classification labels (e.g. Secret vs Top Secret), and users cannot change them. No labels are involved here.' },
        { id: 'd', text: 'Rule-based access control', correct: false, explanation: 'Rule-based control applies the same conditions to everyone (e.g. "no entry after 22:00"), whatever their role.' },
      ],
    },
  ],
};

export const m02Teach: MissionTeaching = {
  situation:
    'Day one on a new floor. Your badge carries the ANALYST role and nothing else. Word is that the sysadmins have been passing one shared admin password around.',
  orders: [
    { text: 'Cross the floor using the access your role actually has.', objective: '4.6' },
    { text: 'Find out who is spreading the shared credential and why it matters.', objective: '1.2' },
    { text: 'Deal with it the way policy expects an analyst to.', objective: '5.6' },
    { text: 'Reach the exit.', objective: '4.6' },
  ],
  keyTerms: ['least privilege', 'role-based access control', 'shared credentials', 'accounting', 'non-repudiation', 'privileged access management'],
  lessons: {
    'no-violations': {
      objective: '4.6',
      done: 'You used only the access your role grants. That is least privilege: no access just in case, and less damage if your badge is ever stolen.',
      missed: 'You badged a door your role does not cover. Even a failed attempt is logged as unauthorized access. Under least privilege, get access through approval when a task needs it.',
    },
    'report-admin': {
      objective: '5.6',
      done: 'You reported the shared-password practice through the official channel. Security can now replace it with named accounts and PAM.',
      missed: 'The shared password was never reported, so four people still act as "admin" and nobody can be held accountable. Refusing is not enough; report it (5.6).',
    },
    exit: {
      objective: '4.6',
      done: 'Floor cleared.',
      missed: 'You did not reach the exit.',
    },
  },
  examTip: 'Exam clue words: "only what the job requires" = least privilege. "Assigned by job role" = RBAC. "Cannot prove who did it" = a non-repudiation / accounting failure, usually caused by shared accounts.',
};
