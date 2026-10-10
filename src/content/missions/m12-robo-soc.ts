import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, mixedThreatEncounter, floorSpot, retex } from './campaign-map';

/**
 * M12 "Robo SOC": automate the SOC by Friday — the finale (difficulty 12).
 * Alert volume tripled, and the attackers know the deadline.
 * Critical path, four gates:
 *   1. SIEM HALL (analyst badge): read the alert queue to earn the SOC role.
 *      Inspect the raw evidence behind each rule, then commit one grouped pick
 *      per rule. Silencing a live detection FAILS the mission.
 *   2. SOAR LAB (soc badge): assemble the playbook IN ORDER — auto-ticket,
 *      auto-contain with approval gates, then redundancy. Auto-containing a
 *      privileged account with no approval FAILS the mission.
 *   3. FAIL-MODE ROOMS (soc badge; the crypto vault also wants MFA): fail-closed
 *      for the payment segment and the vault, fail-open for life-safety egress.
 *   4. EVIDENCE (2.5): verify MDM enforcement and the allow list on every
 *      kiosk, then sign off at the war-room console to open the exit.
 * Secrets: egress supply cache (found EDR), NOC cache.
 */
export const m12: Mission = {
  id: 'm12',
  title: 'ROBO SOC',
  difficulty: 12,
  objectives: ['4.7', '4.4', '3.2', '2.5'],
  briefing:
    'Alert volume tripled. Leadership wants the SOC automated by Friday, and the attackers know it. ' +
    'Your kit: MOUSE (2) inspects, KEYBOARD (1) operates consoles, USB SCANNER (3) cleans hostiles, ' +
    'BADGE (4) opens doors your roles cover, MFA (7) opens the crypto vault.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'mfa', 'tap', 'patch'],
  map: {
    grid: [
    '################################################',
    '#.......###.................#..........#########',
    '#.......###......EEEE.......#..........#########',
    '#.........#......EEEE.......#..........#########',
    '#.........#..B........B..B..####.......#####..##',
    '#.........#..B........B..B..###........#####..##',
    '#.........#.................###........#####..##',
    '#####P#############X#############M##########..##',
    '#.........#..SSS.......SSS..#..........#####4###',
    '#.........#..SSS.......SSS..#..........####..###',
    '#.........#.................#..........###....##',
    '#.........#.................#..........##......#',
    '#.........#......SSSSSSSSSSS#..........##......#',
    '#.........#......SSSSSSSSSSS#..........T...##..#',
    '#.........W......SSSSS......L..........#...##..#',
    '#.........#......SSSSS......#..........##..##..#',
    '#...B..B..#.................#..B...B...##......#',
    '#...B..B..#.................#..B...B...##......#',
    '#.........#.................#..........###....##',
    '#.........#.................#..........####..###',
    '#####G#############s#############g#########5####',
    '#BBB......#.................#......BBB.###...###',
    '#B.B......#.................#......B.B.###...###',
    '#B1B......#.................#......B2B.###...###',
    '#.........e.................n..........#########',
    '#.........#.................#..........#########',
    '#.........#.................#..........#########',
    '####################6#########v#################',
    '####################.#########.#################',
    '####################.#########.#################',
    '########...............................#########',
    '########...............................#########',
    '################################################',
  ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      'S': { kind: 'wall', tex: 'wall-server' },
      'B': { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      'E': { kind: 'exit', tex: 'exit' },
      'P': { kind: 'door', tex: 'door', doorId: 'pay-door', accessRole: 'soc' },
      'X': {
        kind: 'door', tex: 'door', doorId: 'exit', locked: true,
        lockText: 'EXIT: sealed until the automation program is signed off at the war-room console',
      },
      'M': { kind: 'door', tex: 'door', doorId: 'vault-door', accessRole: 'soc', mfa: true },
      'W': { kind: 'door', tex: 'door', doorId: 'siem-door', accessRole: 'analyst' },
      'L': { kind: 'door', tex: 'door', doorId: 'lab-door', accessRole: 'soc' },
      'G': { kind: 'door', tex: 'door', doorId: 'egress-door', accessRole: 'analyst' },
      's': { kind: 'door', tex: 'door', doorId: 'sc-door' },
      'g': { kind: 'door', tex: 'door', doorId: 'noc-door' },
      'e': { kind: 'door', tex: 'door', doorId: 'egress-sc-door', accessRole: 'analyst' },
      'n': { kind: 'door', tex: 'door', doorId: 'noc-sc-door' },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-egress', secret: true },
      '2': { kind: 'door', tex: 'wall-brick', doorId: 'secret-noc', secret: true },
    },
    defaultLight: 0.6,
    lights: lightRects([
      [1, 1, 9, 6, 0.85],
      [11, 1, 27, 6, 0.5],
      [29, 1, 38, 6, 0.85],
      [1, 8, 9, 19, 0.7],
      [11, 8, 27, 19, 0.62],
      [29, 8, 38, 19, 0.72],
      [1, 21, 9, 26, 0.55],
      [11, 21, 27, 26, 0.78],
      [29, 21, 38, 26, 0.62],
      [1, 21, 3, 23, 0.35],
      [35, 21, 37, 23, 0.35],
      [17, 2, 20, 3, 1.0],
    ]),
    spawn: { x: 19.5, y: 24.5, angle: -2.11 },
  },
  entities: [
    {
      id: 'prime', kind: 'enemy', x: 14, y: 15, sprite: 'ransomware', threat: 'ransomware',
      ai: 'chase', hp: 30, infected: true, dormant: true,
      inspect: {
        label: 'RANSOMWARE PRIME',
        detail: 'Enterprise-grade encryptor process - oversized, overprivileged and holding the war room.',
        category: 'malware',
        objectives: ['4.5'],
      },
    },
    {
      id: 'prime-escort-a', kind: 'enemy', x: 25, y: 15, sprite: 'rat', threat: 'rat',
      ai: 'chase', hp: 2, infected: true, dormant: true,
      inspect: { label: 'RAT escort session', detail: 'Attacker remote session guarding the prime encryptor.', category: 'malware', objectives: ['4.5'] },
    },
    {
      id: 'prime-escort-b', kind: 'enemy', x: 13, y: 17, sprite: 'rat', threat: 'rat',
      ai: 'chase', hp: 2, infected: true, dormant: true,
      inspect: { label: 'RAT escort session', detail: 'Attacker remote session guarding the prime encryptor.', category: 'malware', objectives: ['4.5'] },
    },

    // --- Security Center: war board, spawn lobby ---
    {
      id: 'sc-brief', kind: 'console', x: 19.5, y: 22.5, sprite: 'console', tags: [],
      log: 'AUTOMATION WAR BOARD - DUE FRIDAY\n' +
        '[ ] tune SIEM: kill the noise, keep the catches\n' +
        '[ ] SOAR playbook: ticket -> contain -> resilience\n' +
        '[ ] failure modes for every automated control\n' +
        '[ ] proof the MDM push landed on every kiosk\n' +
        'then sign off at the war-room console.',
      inspect: { label: 'Automation war board', detail: 'Leadership\u2019s checklist for automating the SOC by Friday.', category: 'item', objectives: ['4.7'] },
    },
    // --- SIEM hall: the queue, rule evidence, tuning consoles ---
    {
      id: 'alert-queue', kind: 'console', x: 7.5, y: 9.5, sprite: 'console',
      tags: ['queue-read'],
      grants: { resource: 'role:soc', amount: 1 },
      log: 'SIEM QUEUE 07:55 - 1,183 alerts in 24 h (was ~400/day)\n' +
        'R1 FAILED-LOGIN STORM .... 412/d   svc-scan -> DC-02 every 90 s\n' +
        'R2 AUTH ANOMALY ..........   3/d   10.66.6.66 sweeping accounts\n' +
        'R3 DNS TUNNEL ............   1/mo  ws-fin-07 hourly TXT lookups\n' +
        'Analyst note: "we mostly just ack R1 now"\n' +
        'SOC role granted: lab, vault and payment consoles unlocked.',
      inspect: { label: 'SIEM alert queue', detail: 'Aggregated alerts from every rule, ranked by volume. Three rules account for almost all of it.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'night-analyst', kind: 'npc', x: 4.5, y: 9.5, sprite: 'npc-m', ai: 'stand',
      inspect: { label: 'Dev, outgoing shift lead', detail: 'Spent the night clearing 400 near-identical login alerts by hand. Wants automation; fears a script doing the wrong thing fast.', category: 'person', objectives: ['4.4'] },
    },
    {
      id: 'rule-svc', kind: 'console', x: 2.5, y: 11.5, sprite: 'console',
      tags: ['rule-evidence'],
      log: 'R1 RULE CARD\nFires on >3 failed logins / 10 min / source.\n412 alerts/day, all svc-scan.',
      inspect: { label: 'Rule R1: failed-login storm', detail: 'Every alert: svc-scan vs DC-02, exactly every 90 s, 24/7, starting right after a config push.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'rule-spray', kind: 'console', x: 5.5, y: 11.5, sprite: 'console',
      tags: ['rule-evidence'],
      log: 'R2 RULE CARD\nFires on auth failures across >=10 accounts / source.\n3 alerts today, still rising.',
      inspect: { label: 'Rule R2: auth anomaly', detail: 'TODAY: 10.66.6.66 failed exactly once per account across 41 accounts in 20 min.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'rule-beacon', kind: 'console', x: 7.5, y: 11.5, sprite: 'console',
      tags: ['rule-evidence'],
      log: 'R3 RULE CARD\nCorrelation: periodic 90-byte TXT lookups\n+ off-hours timing. 1 alert this month.',
      inspect: { label: 'Rule R3: DNS tunnel correlation', detail: 'A correlation rule over endpoint + DNS logs. One alert this month: ws-fin-07, confirmed DNS exfiltration, already quarantined. Zero false positives on record.', category: 'item', objectives: ['4.4'] },
    },
    // Tuning picks: one grouped choice per rule; the mission fails if a live detection dies.
    {
      id: 'tune-r1', kind: 'console', x: 2.5, y: 13.5, sprite: 'console',
      tags: ['tune'], group: 'r1',
      log: 'R1 kept. svc-scan re-credentialed; exception scoped to svc-scan@DC-02 only. Noise gone, coverage kept.',
      inspect: { label: 'R1: fix the account, narrow exception', detail: 'Re-credential svc-scan and add an exception for that account/target pair only.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'kill-r1', kind: 'console', x: 4.5, y: 13.5, sprite: 'console',
      tags: ['wrong'], group: 'r1',
      log: 'Wrong call: R1 disabled outright. Tomorrow\u2019s brute-force attempt has no failed-login coverage — the fix was the stale account, not silence.',
      inspect: { label: 'R1: disable the rule', detail: 'Disables the rule and stops all failed-login alerts from it.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'tune-r2', kind: 'console', x: 6.5, y: 13.5, sprite: 'console',
      tags: ['tune'], group: 'r2',
      log: 'R2 re-written as a correlation rule: one source failing on >15 distinct accounts in 30 min pages the on-call. Today\u2019s 41-account sweep still trips it.',
      inspect: { label: 'R2: correlate across accounts', detail: 'Re-write to fire on one source failing across many accounts, and page the on-call.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'silence-r2', kind: 'console', x: 8.5, y: 13.5, sprite: 'console',
      tags: ['tune', 'silence'], group: 'r2',
      log: 'R2 threshold raised to 200 failures/source.',
      inspect: { label: 'R2: raise threshold to 200/source', detail: 'Raises the firing threshold to 200 failures per source.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'keep-r3', kind: 'console', x: 3.5, y: 15.5, sprite: 'console',
      tags: ['tune'], group: 'r3',
      log: 'R3 untouched: one true positive a month beats forty false ones. Routed to the threat-hunt queue for periodic review.',
      inspect: { label: 'R3: keep as-is, route to threat hunt', detail: 'Leaves the rule unchanged and routes its alerts to the threat-hunt queue.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'raise-r3', kind: 'console', x: 5.5, y: 15.5, sprite: 'console',
      tags: ['wrong'], group: 'r3',
      log: 'Wrong call: R3 now needs three correlated hits before firing, so a single confirmed exfiltration no longer pages anyone.',
      inspect: { label: 'R3: triple the hit threshold', detail: 'Requires three correlated hits before the rule fires.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'blanket-x10', kind: 'console', x: 7.5, y: 15.5, sprite: 'console',
      tags: ['tune', 'silence'],
      log: 'Emergency quiet hours: every threshold x10.',
      inspect: { label: 'All rules: raise every threshold x10', detail: 'Multiplies every rule\u2019s firing threshold by ten.', category: 'item', objectives: ['4.4'] },
    },
    // --- Mid hall: sign-off, kiosks under management, tap rack ---
    {
      id: 'signoff', kind: 'console', x: 19.5, y: 9.5, sprite: 'console',
      tags: ['signoff'],
      log: 'SIGNED OFF: ticketing live, containment gated on approval for privileged accounts, second SOAR node standing by, MDM verified on every kiosk. Exit unsealed.',
      inspect: { label: 'War-room console: sign off', detail: 'Releases the automation program to production. Every workstream must be verified first.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'desk-1', kind: 'console', x: 14.5, y: 10.5, sprite: 'workstation', tags: [],
      inspect: { label: 'Analyst desk', detail: 'A stack of acked alerts and cold coffee. Nobody reads R1 any more.', category: 'item', objectives: ['4.4'] },
    },
    {
      id: 'kiosk-1', kind: 'workstation', x: 16.5, y: 10.5, sprite: 'workstation',
      tags: ['kiosk'],
      inspect: { label: 'Kiosk K-114 (lobby)', detail: 'MDM push 06:00: baseline v14 enforced — screen lock 5 min, disk encryption on, local admin revoked. Allow list v9: 12 approved apps; "freegame.exe" blocked at 06:12, event logged.', category: 'legit', objectives: ['2.5'] },
    },
    {
      id: 'kiosk-2', kind: 'workstation', x: 23.5, y: 10.5, sprite: 'workstation',
      tags: ['kiosk'],
      inspect: { label: 'Kiosk K-207 (warehouse)', detail: 'MDM push 06:00: baseline v14 applied, drift check clean. Allow list v9: only the 12 approved apps can execute; a dropped USB drive\u2019s "setup.exe" was denied at 07:40.', category: 'legit', objectives: ['2.5'] },
    },
    {
      id: 'desk-2', kind: 'console', x: 25.5, y: 10.5, sprite: 'workstation', tags: [],
      inspect: { label: 'Analyst desk', detail: 'Empty chair, screen full of the same alert on repeat.', category: 'item' },
    },
    {
      id: 'pcap-rack', kind: 'console', x: 19.5, y: 17.5, sprite: 'console', tags: [],
      log: 'TAP RACK: passive copies of traffic for the correlation engine.\nA tap can watch — it cannot block. Blocking needs an inline control.',
      inspect: { label: 'Network tap rack', detail: 'Feeds mirrored traffic to the SIEM. Passive by design: detection, never containment.', category: 'item', objectives: ['4.4'] },
    },
    // --- SOAR lab: build the playbook in order ---
    {
      id: 'soar-brief', kind: 'console', x: 30.5, y: 9.5, sprite: 'console', tags: [],
      log: 'DESIGN NOTE, SOAR LEAD:\n"Ticket every high-sev alert. Contain fast where a mistake is cheap.\nGate anything privileged on a human. Assume the engine itself dies."',
      inspect: { label: 'SOAR design brief', detail: 'The playbook must (1) ticket every high-severity alert, (2) auto-contain with approval gates for privileged identities, (3) survive a node failure.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'pb-ticket', kind: 'console', x: 32.5, y: 9.5, sprite: 'console',
      tags: ['soar-step'], group: 'soar-a', priority: 1,
      log: 'Step 1 wired: every high-severity alert opens a ticket, enriches it with host + identity context, and escalates on age. Nothing falls through the floorboards.',
      inspect: { label: 'Step: auto-ticket + enrich + escalate', detail: 'First stage of any playbook: a tracked artifact per alert, enriched automatically, escalated if it ages out.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'pb-email', kind: 'console', x: 34.5, y: 9.5, sprite: 'console',
      tags: ['wrong'], group: 'soar-a',
      log: 'Wrong call: alerts batched into an hourly email digest. A live takeover moves in minutes; the digest lands after the deal is done.',
      inspect: { label: 'Step: hourly email digest', detail: 'Batches alerts into a readable hourly summary for the team inbox.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'pb-contain', kind: 'console', x: 36.5, y: 9.5, sprite: 'console',
      tags: ['soar-step'], group: 'soar-b', priority: 2,
      log: 'Step 2 wired: isolate the host and disable the account on confirmed high-sev — STANDARD accounts only. Privileged identities queue for human approval with a 5-min timer.',
      inspect: { label: 'Step: auto-contain, approval gate on privileged', detail: 'Isolates the host and disables the account on confirmed high-sev; privileged identities queue for human approval with a 5-min timer.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'pb-contain-all', kind: 'console', x: 30.5, y: 11.5, sprite: 'console',
      tags: ['soar-step', 'admin-lockout'], group: 'soar-b',
      log: 'Contain-all armed.',
      inspect: { label: 'Step: auto-contain all accounts, no approval', detail: 'Disables every flagged identity, privileged accounts included, immediately without human review.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'pb-ha', kind: 'console', x: 33.5, y: 11.5, sprite: 'console',
      tags: ['soar-step'], group: 'soar-c', priority: 3,
      log: 'Step 3 wired: second SOAR node in the DR room, playbook state replicated, manual runbooks printed and drilled. One engine dying mid-incident stops nothing.',
      inspect: { label: 'Step: redundant node + maintained runbooks', detail: 'Adds a second SOAR node in the DR room with replicated playbook state and maintained manual runbooks.', category: 'item', objectives: ['4.7'] },
    },
    {
      id: 'pb-single', kind: 'console', x: 35.5, y: 11.5, sprite: 'console',
      tags: ['wrong'], group: 'soar-c',
      log: 'Wrong call: shipped on one SOAR server, "redundancy later". One crashed engine mid-incident and every playbook halts — a single point of failure.',
      inspect: { label: 'Step: single SOAR node now, HA later', detail: 'Runs every playbook on a single SOAR engine to ship sooner.', category: 'item', objectives: ['4.7'] },
    },
    // --- Payment segment: fail-closed vs fail-open ---
    {
      id: 'pay-policy', kind: 'console', x: 2.5, y: 2.5, sprite: 'console', tags: [],
      log: 'SEGMENT POLICY, PAYMENT:\nCardholder data lives here. Confidentiality outranks availability.\nIf a control dies, traffic stops — that is the design, not a bug.',
      inspect: { label: 'Payment segment policy', detail: 'PCI segment. The stated priority: confidentiality over availability. A down control must not leave card data on an unfiltered path.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'pay-closed', kind: 'console', x: 4.5, y: 4.5, sprite: 'console',
      tags: ['failmode'], group: 'fm-pay',
      log: 'Payment firewall set FAIL-CLOSED: if it dies, all segment traffic stops. Checkout queues, card data stays sealed.',
      inspect: { label: 'Set fail-CLOSED', detail: 'On failure the firewall denies all traffic until it recovers.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'pay-open', kind: 'console', x: 6.5, y: 4.5, sprite: 'console',
      tags: ['wrong'], group: 'fm-pay',
      log: 'Wrong call: payment firewall set FAIL-OPEN. Any crash leaves card data on an unfiltered path — the opposite of the stated priority.',
      inspect: { label: 'Set fail-OPEN', detail: 'On failure the firewall passes all traffic unfiltered, keeping transactions flowing.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'pay-tap', kind: 'console', x: 7.5, y: 2.5, sprite: 'console',
      tags: ['wrong'], group: 'fm-pay',
      log: 'Wrong call: inline firewall converted to a passive tap. A tap watches; it cannot block — that is fail-open by another name.',
      inspect: { label: 'Convert to tap / monitor mode', detail: 'On failure the device falls back to passive traffic copies so nothing is ever dropped.', category: 'item', objectives: ['3.2'] },
    },
    // --- Crypto vault: fail-closed where the keys live ---
    {
      id: 'vault-policy', kind: 'console', x: 31.5, y: 2.5, sprite: 'console', tags: [],
      log: 'VAULT POLICY:\nKey material and signing service. Unavailable is painful;\nexposed is fatal. Deny on failure.',
      inspect: { label: 'Crypto vault policy', detail: 'Key material lives behind the crypto gateway. An outage costs uptime; a bypass costs the keys.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'vault-closed', kind: 'console', x: 33.5, y: 4.5, sprite: 'console',
      tags: ['failmode'], group: 'fm-vault',
      log: 'Crypto gateway set FAIL-CLOSED: dead gateway means denied requests. Signing queues until failover, keys stay sealed.',
      inspect: { label: 'Set fail-CLOSED', detail: 'On failure the gateway denies every request until it recovers.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'vault-open', kind: 'console', x: 35.5, y: 4.5, sprite: 'console',
      tags: ['wrong'], group: 'fm-vault',
      log: 'Wrong call: crypto gateway set FAIL-OPEN. A crashed gateway now passes requests around the key protections entirely.',
      inspect: { label: 'Set fail-OPEN', detail: 'On failure the gateway admits requests so signing never stalls.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'vault-reboot', kind: 'console', x: 37.5, y: 2.5, sprite: 'console',
      tags: ['wrong'], group: 'fm-vault',
      log: 'Wrong call: "reboot until it recovers" is not a failure mode. During the reboot loop, traffic handling is undefined — which means uncontrolled.',
      inspect: { label: 'Set auto-reboot loop', detail: 'On failure the gateway restarts repeatedly until it comes back.', category: 'item', objectives: ['3.2'] },
    },
    // --- Egress: fail-open where life safety rules ---
    {
      id: 'egress-read', kind: 'console', x: 5.5, y: 22.5, sprite: 'console', tags: [],
      log: 'EGRESS POLICY (fire marshal):\nMagnet locks may hold smoke doors shut ONLY while the release\ncircuit is healthy. On alarm or control failure, doors MUST release.\nCode requirement, not a preference.',
      inspect: { label: 'Life-safety egress policy', detail: 'Fire code: egress magnet locks must release on alarm or control failure so occupants can always get out.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'egress-open', kind: 'console', x: 4.5, y: 24.5, sprite: 'console',
      tags: ['failmode'], group: 'fm-egress',
      log: 'Egress locks set FAIL-OPEN: on alarm or control failure every door releases. People evacuate; the badge system logs the openings for review.',
      inspect: { label: 'Set fail-OPEN', detail: 'On failure the magnet locks release so every door opens.', category: 'item', objectives: ['3.2'] },
    },
    {
      id: 'egress-closed', kind: 'console', x: 6.5, y: 24.5, sprite: 'console',
      tags: ['wrong'], group: 'fm-egress',
      log: 'Wrong call: egress locks set FAIL-CLOSED. A dead control now traps occupants behind locked doors in a fire — security cannot outrank life safety.',
      inspect: { label: 'Set fail-CLOSED', detail: 'On failure the magnet locks stay engaged so no one passes without a working badge read.', category: 'item', objectives: ['3.2'] },
    },
    // --- NOC annex: MDM evidence + third kiosk ---
    {
      id: 'annex-read', kind: 'console', x: 33.5, y: 24.5, sprite: 'console', tags: [],
      log: 'MDM / CONFIG REPORT:\nBaseline v14 enforced: 214/214 kiosks compliant.\nAllow list v9 deployed: 214/214.\nDrift check: 0 non-compliant. Zero-touch re-push on enrolment.',
      inspect: { label: 'MDM push console', detail: 'Automation enforcing configuration: every kiosk receives the baseline and the application allow list, verified by drift checks.', category: 'item', objectives: ['2.5'] },
    },
    {
      id: 'kiosk-3', kind: 'workstation', x: 31.5, y: 24.5, sprite: 'workstation',
      tags: ['kiosk'],
      inspect: { label: 'Kiosk K-033 (NOC annex)', detail: 'MDM push 06:00: baseline v14 enforced. Allow list v9 active — an unapproved remote-admin tool failed to launch at 07:02 and the attempt was logged for the SOC.', category: 'legit', objectives: ['2.5'] },
    },
    {
      id: 'kiosk-user', kind: 'npc', x: 36.5, y: 24.5, sprite: 'npc-f', ai: 'stand',
      inspect: { label: 'Mara, front-desk staff', detail: 'Tried to install a game on her kiosk at lunch. The allow list blocked it and logged the attempt.', category: 'person', objectives: ['2.5'] },
    },
    // --- Pickups: scanner charges, pcap, patch disks, EDR ---
    {
      id: 'charge-sc', kind: 'item', x: 13.5, y: 25.5, sprite: 'charge', tags: ['arsenal-pickup'],
      grants: { resource: 'usb-charge', amount: 5 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions for the USB scanner.', category: 'item' },
    },
    {
      id: 'charge-hall', kind: 'item', x: 13.5, y: 16.5, sprite: 'charge', tags: ['arsenal-pickup'],
      grants: { resource: 'usb-charge', amount: 5 },
      inspect: { label: 'Scanner charges', detail: 'Antimalware definitions for the USB scanner.', category: 'item' },
    },
    {
      id: 'pcap-sc', kind: 'item', x: 16.5, y: 25.5, sprite: 'pcap', tags: ['arsenal-pickup'],
      grants: { resource: 'pcap', amount: 3 },
      inspect: { label: 'Packet captures', detail: 'Recorded traffic for the TAP tool.', category: 'item' },
    },
    {
      id: 'pcap-hall', kind: 'item', x: 21.5, y: 16.5, sprite: 'pcap', tags: ['arsenal-pickup'],
      grants: { resource: 'pcap', amount: 3 },
      inspect: { label: 'Packet captures', detail: 'Recorded traffic for the TAP tool.', category: 'item' },
    },
    {
      id: 'patch-egress', kind: 'item', x: 8.5, y: 25.5, sprite: 'patch-disk', tags: ['arsenal-pickup'],
      grants: { resource: 'patch-disk', amount: 2 },
      inspect: { label: 'Patch disks', detail: 'Signed vendor updates for the PATCH tool.', category: 'item' },
    },
    {
      id: 'edr-cell-sc', kind: 'item', x: 24.5, y: 25.5, sprite: 'edr-cell', tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: 2 },
      inspect: { label: 'EDR cells', detail: 'Licence and compute for two EDR containment pulses.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'edr-cell-noc', kind: 'item', x: 29.5, y: 25.5, sprite: 'edr-cell', tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: 1 },
      inspect: { label: 'EDR cell', detail: 'Licence and compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'medkit-hall', kind: 'item', x: 24.5, y: 16.5, sprite: 'medkit',
      grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' },
    },
    {
      id: 'medkit-noc', kind: 'item', x: 35.5, y: 25.5, sprite: 'medkit',
      grants: { resource: 'integrity', amount: 25 },
      inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' },
    },
    // EDR console sits on the main path in the spawn lobby — the finale's key tool.
    {
      id: 'find-edr', kind: 'item', x: 20.5, y: 23.5, sprite: 'tool-edr', tags: ['arsenal-pickup'],
      grants: { resource: 'tool:edr', amount: 1 },
      inspect: { label: 'EDR console (found)', detail: 'Endpoint detection and response console with containment.', category: 'item', objectives: ['4.5'] },
    },
    // Secret enclave contents (behind brick doors).
    {
      id: 'edr-cache', kind: 'item', x: 2.5, y: 22.5, sprite: 'edr-cell', tags: ['arsenal-pickup'],
      grants: { resource: 'edr-cell', amount: 2 },
      inspect: { label: 'EDR cells', detail: 'Licence and compute for EDR containment pulses.', category: 'item', objectives: ['4.5'] },
    },
    {
      id: 'patch-secret', kind: 'item', x: 36.5, y: 22.5, sprite: 'patch-disk', tags: ['arsenal-pickup'],
      grants: { resource: 'patch-disk', amount: 2 },
      inspect: { label: 'Patch disks', detail: 'Signed vendor updates for the PATCH tool.', category: 'item' },
    },
    // Dormant single hostiles behind the vault doors (area triggers wake them).
    {
      id: 'vault-rootkit', kind: 'enemy', x: 36.5, y: 5.5, sprite: 'rootkit', ai: 'chase',
      hp: 3, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Rootkit process', detail: 'Persistence record: service restart and privileged file access recorded.', category: 'malware', objectives: ['2.4'] },
    },
    {
      id: 'pay-bomb', kind: 'enemy', x: 7.5, y: 5.5, sprite: 'logicbomb', ai: 'chase',
      hp: 1, infected: true, dormant: true, tags: ['malware'],
      inspect: { label: 'Logic bomb', detail: 'Scheduled task and execution condition recorded.', category: 'malware', objectives: ['2.4'] },
    },
  ],
  missionObjectives: [
    { id: 'queue', text: 'Read the SIEM queue (earns SOC badge access)', kind: 'interact', tag: 'queue-read' },
    { id: 'inspect-rules', text: 'Review the raw evidence behind each SIEM rule', kind: 'inspect', tag: 'rule-evidence', count: 3, requires: ['queue'] },
    { id: 'tune', text: 'Tune the SIEM: cut the noise, keep every live detection', kind: 'interact', tag: 'tune', count: 3, requires: ['inspect-rules'] },
    { id: 'playbook', text: 'Assemble the SOAR playbook in order', kind: 'interact', tag: 'soar-step', count: 3, ordered: true, requires: ['queue'] },
    { id: 'failmode', text: 'Set a failure mode for each automated control', kind: 'interact', tag: 'failmode', count: 3, requires: ['queue'] },
    { id: 'kiosk-evidence', text: 'Verify MDM enforcement and allow lists on the kiosks', kind: 'inspect', tag: 'kiosk', count: 3 },
    { id: 'signoff', text: 'Sign off on the automation program at the war-room console', kind: 'interact', tag: 'signoff', requires: ['tune', 'playbook', 'failmode', 'kiosk-evidence'] },
    { id: 'no-silence', text: 'Never silence a live detection', kind: 'avoid', tag: 'silence' },
    { id: 'no-admin-lockout', text: 'Privileged accounts need human approval to contain', kind: 'avoid', tag: 'admin-lockout' },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 300,
    triggers: [
      { id: 'pay-ambush', area: [1, 1, 9, 6], spawn: ['pay-bomb'], kind: 'bad', message: 'A logic bomb ticks over the payment segment.' },
      { id: 'vault-ambush', area: [29, 1, 38, 6], spawn: ['vault-rootkit'], kind: 'bad', message: 'A rootkit wakes inside the crypto vault.' },
      { id: 'prime-rise', area: [11, 12, 27, 18], spawn: ['prime', 'prime-escort-a', 'prime-escort-b'], kind: 'bad',
        message: 'RANSOMWARE PRIME: an enterprise encryptor is holding the war room. Clear the arena.' },
    ],
    secrets: [
      { id: 'egress-cache', area: [2, 22, 2, 22], label: 'Egress supply cache', grant: { resource: 'patch-disk', amount: 3 } },
      { id: 'noc-cache', area: [36, 22, 36, 22], label: 'NOC supply cache', grant: { resource: 'pcap', amount: 6 } },
    ],
  },
  debriefQuestions: [
    q('q1', ['4.7'], 'A SOAR playbook disables any account that shows impossible travel. A false positive could lock the CEO out mid-deal. What design is BEST?', 3, [
      ['Turn the automation off and handle everything manually', 'This throws away the reaction-time benefit, and attackers act in minutes.'],
      ['Automate it for everyone, with no exceptions', 'There are no guard rails, so one bad signal can disrupt the business at the highest level.'],
      ['Send an email alert only', 'Too slow for an account takeover in progress.'],
      ['Auto-contain standard accounts, require human approval for privileged/VIP accounts, and auto-create and escalate a ticket', 'Guard rails keep automation fast where it is safe and put a human in the loop where the impact is high.'],
    ]),
    q('q2', ['4.7'], 'The single SOAR server that runs every playbook goes down mid-incident, and nobody remembers the manual steps. Which automation consideration was ignored?', 1, [
      ['Workforce multiplier', 'That is a benefit of automation, not the risk that bit the team.'],
      ['Single point of failure / ongoing supportability', 'Automation that everything depends on needs redundancy and maintained manual runbooks.'],
      ['Enforcing baselines', 'Another benefit, unrelated to the outage.'],
      ['Employee retention', 'A benefit (less toil), not the failure here.'],
    ]),
    q('q3', ['4.4'], 'You need one console that aggregates logs from firewalls, servers and endpoints, correlates them, and raises alerts. Which tool is it?', 2, [
      ['NetFlow collector', 'NetFlow gives network flow metadata only, not server or endpoint logs.'],
      ['SNMP traps', 'SNMP traps are device status notifications, not log correlation.'],
      ['SIEM', 'A SIEM aggregates logs across sources, correlates events, and alerts and reports on them.'],
      ['SCAP scanner', 'SCAP is a standard for automated configuration and compliance checks, not log correlation.'],
    ]),
    q('q4', ['3.2'], 'An inline firewall protects the payment segment. Policy says confidentiality outranks availability for card data. If the firewall crashes, it should:', 0, [
      ['Fail closed: block all traffic', 'Failing closed protects confidentiality by sacrificing availability, which matches the stated priority.'],
      ['Fail open: pass all traffic', 'Unfiltered traffic would reach card data, which violates the stated priority.'],
      ['Switch to tap/monitor mode', 'A passive device cannot block anything, so this is effectively failing open.'],
      ['Reboot repeatedly until it recovers', 'That is not a failure-mode design. Traffic handling during the outage is still undefined.'],
    ]),
    q('q5', ['2.5'], 'Automation pushes an application allow list to every kiosk. What is the effect?', 1, [
      ['Known-bad applications are blocked and everything else runs', 'That describes a deny list.'],
      ['Only explicitly approved applications can run, and everything else is blocked', 'Allow listing is default-deny for software, so unknown malware cannot execute.'],
      ['Every application runs inside a sandbox', 'Sandboxing isolates software. It does not decide what may run.'],
      ['Applications auto-update to the latest version', 'That is patching, a different mitigation.'],
    ]),
    q('q6', ['4.4'], 'The SIEM fires 400 "failed login" alerts a day, almost all from one misconfigured service account, and analysts now ignore that rule. What is BEST?', 1, [
      ['Disable the rule', 'You would also lose real password-spraying and brute-force alerts.'],
      ['Fix the service account and tune the rule (a narrow exception or threshold), then validate it still catches real attacks', 'Alert tuning cuts false positives while keeping true positives. Alert fatigue is how real attacks get missed.'],
      ['Hire more analysts to read every alert', 'More people reading noise does not fix the noise.'],
      ['Raise every rule\u2019s threshold tenfold', 'A blanket change hides real attacks across every rule, not just the noisy one.'],
    ]),
  ],
};

export const m12Teach: MissionTeaching = {
  tagline: 'Automate the SOC without automating away the detection — or the admins.',
  situation:
    'Alert volume tripled overnight. Leadership wants the SOC automated by Friday, and the attackers know it — a live spray and a quiet tunnel are hiding inside the noise.',
  orders: [
    { text: 'Tune SIEM rules by evidence — never silence a live detection.', objective: '4.4' },
    { text: 'SOAR playbook: ticket -> gated contain -> resilience.', objective: '4.7' },
    { text: 'Fail-closed for payments; fail-open where life safety requires.', objective: '3.2' },
  ],
  keyTerms: ['SIEM', 'SOAR', 'playbook', 'password spraying', 'alert fatigue', 'fail closed', 'fail open', 'application allow list', 'single point of failure'],
  lessons: {
    'queue': {
      objective: '4.4',
      done: 'You read the queue before touching it: 412 of 1,183 alerts were one misconfigured service account — and a live spray was hiding in the noise.',
      missed: 'You never read the queue, so the automation was built blind on top of alerts nobody trusted.',
    },
    'inspect-rules': {
      objective: '4.4',
      done: 'Each rule was judged on its own evidence: R1 was a stale service password, R2 a live spray, R3 a precise correlation already working.',
      missed: 'Rules were changed without reading the logs behind them. Tuning without evidence is guessing.',
    },
    'tune': {
      objective: '4.4',
      done: 'Noise cut, coverage kept: the spray still fires, the beacon still pages, and svc-scan is fixed instead of silenced.',
      missed: 'The SIEM stayed loud — analysts keep acking real alerts along with the noise.',
    },
    'playbook': {
      objective: '4.7',
      done: 'Playbook assembled in order: auto-ticket, auto-contain standard accounts with human approval for privileged ones, plus a second node and drilled runbooks.',
      missed: 'The playbook was never finished — manual response keeps pace with machine-speed alerts only until it doesn\u2019t.',
    },
    'failmode': {
      objective: '3.2',
      done: 'Every control got a deliberate failure mode: fail-closed where confidentiality wins (payment, vault), fail-open where life safety does (egress).',
      missed: 'Controls shipped with undefined failure behavior — when one dies, nobody designed what happens to the traffic or the people.',
    },
    'kiosk-evidence': {
      objective: '2.5',
      done: 'Verified on every kiosk: configuration enforcement and the allow list actually landed — blocked installs prove it, drift checks keep it true.',
      missed: 'The automation claims enforcement, but nobody verified the push reached the endpoints.',
    },
    'signoff': {
      objective: '4.7',
      done: 'Signed off: ticketing, gated containment, redundancy and validated tuning — automation worth the name.',
      missed: 'Never signed off — the program stayed a pile of half-connected consoles.',
    },
    'no-silence': {
      objective: '4.4',
      done: 'Every live detection kept firing. Password spraying still pages the on-call.',
      missed: 'You silenced a rule that was firing on a real attack. Over-tuning manufactures false negatives: the spray walked through a SOC that chose quiet over coverage.',
    },
    'no-admin-lockout': {
      objective: '4.7',
      done: 'Privileged accounts stay behind human approval — one bad signal can never lock out the incident responders.',
      missed: 'Auto-contain disabled a privileged account with no approval. One false positive just removed the domain admin mid-incident — the automation did the attacker\u2019s job.',
    },
    'bad-choice': {
      objective: '4.4',
      done: 'No wrong calls logged.',
      missed: 'A wrong call was logged. The case file explains what it would have broken — read it before your next pick.',
    },
    'priority-miss': {
      objective: '4.7',
      done: 'Playbook steps wired in order.',
      missed: 'You tried a later playbook step first. Order matters: there is nothing to contain with until the pipeline exists.',
    },
    'exit': {
      objective: '4.7',
      done: 'SOC automated. Friday met.',
      missed: 'You did not reach the exit.',
    },
  },
  examTip: 'SOAR questions hinge on guard rails: human approval for privileged identities, redundancy so one outage cannot stall response, and tuning that cuts false positives without creating false negatives. Fail-closed protects confidentiality; fail-open protects availability and life safety.',
};

addThreatEncounter(m12, 'spike-rat', 'rat', 3, {
  id: 'spike-rats',
  after: ['queue'],
  kind: 'bad',
  message: 'QUEUE SPIKE: something is loose on the floor — the attackers know the deadline too.',
}, [11, 16, 27, 19]);
addThreatEncounter(m12, 'spike-worm', 'worm', 2, {
  id: 'spike-worms',
  after: ['queue'],
  kind: 'bad',
}, [1, 16, 9, 19]);
addThreatEncounter(m12, 'lab-trojan', 'trojan', 3, {
  id: 'lab-ambush',
  after: ['playbook'],
  kind: 'bad',
  message: 'Automation went live — and the lab vents rattle. Trojans drop in!',
}, [29, 8, 38, 19]);
addThreatEncounter(m12, 'exit-ransomware', 'ransomware', 2, {
  id: 'exit-open',
  after: ['signoff'],
  openDoors: ['exit'],
  kind: 'good',
  message: 'EXIT OPEN. Automation is live — punch through to the exit!',
}, [11, 1, 27, 6]);
addThreatEncounter(m12, 'exit-worm', 'worm', 2, {
  id: 'exit-worms',
  after: ['signoff'],
  kind: 'bad',
}, [11, 16, 27, 19]);

// F1: encounter pacing — live skirmishers, room ambushes, objective waves,
// signoff finale, and supplies. All six malware families appear in the capstone.
m12.entities.push(
  { id: 'sc-worm', kind: 'enemy', x: 14.5, y: 15.5, sprite: 'worm', ai: 'wander',
    hp: 3, infected: true, tags: ['malware'],
    inspect: { label: 'Worm', detail: 'Self-replicating process roaming the security centre lobby.', category: 'malware', objectives: ['2.4'] } },
  { id: 'hall-worm-c', kind: 'enemy', x: 13.5, y: 17.5, sprite: 'worm', ai: 'wander',
    hp: 3, infected: true, tags: ['malware'],
    inspect: { label: 'Worm', detail: 'Self-replicating process roaming the SOC floor.', category: 'malware', objectives: ['2.4'] } },
  { id: 'hall-rat-c', kind: 'enemy', x: 25.5, y: 17.5, sprite: 'rat', ai: 'wander',
    hp: 2, infected: true, tags: ['malware'],
    inspect: { label: 'RAT', detail: 'Remote-access implant beaconing out of the SOC floor.', category: 'malware', objectives: ['2.4'] } },
);
addThreatEncounter(m12, 'siem-rat', 'rat', 4, {
  id: 'siem-ambush', area: [1, 9, 9, 15], kind: 'bad',
  message: 'RAT implants surface in the SIEM hall — the noise was cover.',
}, [1, 8, 9, 19]);
addThreatEncounter(m12, 'noc-trojan', 'trojan', 4, {
  id: 'noc-ambush', area: [29, 21, 38, 26], kind: 'bad',
  message: 'Trojans drop from the NOC annex racks.',
}, [29, 21, 38, 26]);
addThreatEncounter(m12, 'egress-worm', 'worm', 4, {
  id: 'egress-ambush', area: [4, 21, 9, 26], kind: 'bad',
  message: 'Worms boil out of the life-safety egress room.',
}, [4, 21, 9, 26]);
addThreatEncounter(m12, 'vault-rk', 'rootkit', 2, {
  id: 'vault-pack', area: [31, 1, 38, 6], kind: 'bad',
  message: 'More persistence wakes inside the crypto vault.',
}, [29, 1, 38, 6]);
addThreatEncounter(m12, 'signoff-rs', 'ransomware', 4, {
  id: 'signoff-surge', after: ['signoff'], kind: 'bad',
  message: 'Sign-off triggered the attackers’ last push — ransomware on the floor!',
}, [11, 8, 27, 19]);
addThreatEncounter(m12, 'signoff-bomb', 'logicbomb', 2, {
  id: 'signoff-bombs', after: ['signoff'], kind: 'bad',
}, [11, 1, 27, 6]);
m12.entities.push(
  { id: 'charge-sc2', kind: 'item', x: 17.5, y: 24.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'charge-noc2', kind: 'item', x: 33.5, y: 21.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'medkit-sc', kind: 'item', x: 19.5, y: 26.5, sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

export const m12Walkthrough: WalkStep[] = [
  { goto: [19, 21] }, { use: [19, 20] },
  { goto: [12, 14] }, { badge: [10, 14] }, { goto: [8, 14] },
  { goto: [7, 10] }, { interact: 'alert-queue' }, { wait: 0.5 },
  { goto: [2, 12] }, { inspect: 'rule-svc' },
  { goto: [5, 12] }, { inspect: 'rule-spray' },
  { goto: [7, 12] }, { inspect: 'rule-beacon' },
  { goto: [2, 14] }, { interact: 'tune-r1' },
  { goto: [6, 14] }, { interact: 'tune-r2' },
  { goto: [3, 16] }, { interact: 'keep-r3' },
  { goto: [8, 14] }, { goto: [12, 14] },
  { goto: [16, 10] }, { inspect: 'kiosk-1' },
  { goto: [23, 11] }, { inspect: 'kiosk-2' },
  { goto: [27, 14] }, { badge: [28, 14] }, { goto: [30, 12] },
  { goto: [32, 10] }, { interact: 'pb-ticket' },
  { goto: [36, 10] }, { interact: 'pb-contain' },
  { goto: [33, 12] }, { interact: 'pb-ha' },
  { goto: [33, 19] }, { use: [33, 20] }, { goto: [33, 22] },
  { goto: [31, 24] }, { inspect: 'kiosk-3' },
  { goto: [33, 21] }, { goto: [33, 19] }, { goto: [30, 14] }, { goto: [27, 14] },
  { goto: [5, 8] }, { badge: [5, 7] }, { goto: [5, 5] },
  { goto: [4, 5] }, { interact: 'pay-closed' },
  { goto: [5, 8] },
  { goto: [33, 8] }, { badge: [33, 7] }, { goto: [33, 5] },
  { interact: 'vault-closed' },
  { goto: [33, 8] }, { goto: [12, 14] },
  { goto: [8, 14] }, { goto: [5, 19] }, { badge: [5, 20] }, { goto: [5, 21] },
  { goto: [4, 24] }, { interact: 'egress-open' },
  { goto: [5, 21] }, { goto: [5, 19] }, { goto: [8, 14] }, { goto: [12, 14] },
  { goto: [19, 10] }, { interact: 'signoff' }, { wait: 0.5 },
  { goto: [19, 6] }, { goto: [19, 3] },
];

m12.entities.push(
  { id: 'chg-x1', kind: 'item', ...floorSpot(m12, [11, 21, 27, 26]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x2', kind: 'item', ...floorSpot(m12, [29, 21, 38, 26]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x3', kind: 'item', ...floorSpot(m12, [11, 8, 27, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-x4', kind: 'item', ...floorSpot(m12, [1, 8, 9, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
);

// — rF2 landmarks: NOC annex (SE) = bright grid floor + console video wall;
// egress offices (SW) = dim rust bullpen; crypto vault (NE) = ribbed walls.
m12.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m12.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
m12.map.legend['U'] = { kind: 'wall', tex: 'wall-ribs' };
retex(m12, [28, 21, 38, 26], 'floor', ',');
retex(m12, [0, 21, 10, 26], 'floor', ';');
retex(m12, [21, 0, 39, 6], 'wall', 'U');
m12.map.lights = { ...m12.map.lights, ...lightRects([[28, 21, 38, 26, 0.9], [0, 21, 10, 26, 0.5], [21, 1, 38, 6, 0.45]]) };
m12.entities.push(
  { id: 'noc-wall-a', kind: 'prop', x: 29.5, y: 23.5, sprite: 'console' },
  { id: 'noc-wall-b', kind: 'prop', x: 31.5, y: 23.5, sprite: 'console' },
  { id: 'noc-wall-c', kind: 'prop', x: 33.5, y: 23.5, sprite: 'console' },
  { id: 'egress-desk-a', kind: 'prop', x: 4.5, y: 21.5, sprite: 'workstation' },
  { id: 'egress-desk-b', kind: 'prop', x: 7.5, y: 21.5, sprite: 'workstation' },
);

// rF4: 48x33 silhouette — NE octagonal SOC arena with cut corners around a
// sealed core pillar, plus a long south response sweep; a locked loop door
// opens after sign-off and two secret war-room caches sit off the arena.
m12.map.legend.T = { kind: 'door', tex: 'door', doorId: 'rf4-arena' };
m12.map.legend.v = { kind: 'door', tex: 'door', doorId: 'rf4-sweep' };
m12.map.legend['6'] = { kind: 'door', tex: 'door', doorId: 'rf4-sweep-loop', locked: true,
  lockText: 'The sweep return door unlocks after the runbook sign-off.' };
m12.map.legend['4'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-war-n' };
m12.map.legend['5'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-war-s' };
m12.entities.push(
  { id: 'rf4-war-n-item', kind: 'item', x: 44.5, y: 5.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-war-s-item', kind: 'item', x: 43.5, y: 22.5, sprite: 'medkit' },
);
m12.script!.secrets!.push(
  { id: 'rf4-war-n', area: [44, 4, 45, 7], label: 'War-room north cache', grant: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-war-s', area: [42, 21, 44, 23], label: 'War-room south cache', grant: { resource: 'integrity', amount: 20 } },
);
mixedThreatEncounter(m12, 'arena-mix', [['ransomware', 2], ['rat', 4]],
  { id: 'arena-ambush', area: [41, 9, 46, 19], kind: 'bad',
    message: 'The SOC arena is a live firefight — ransomware anchors a rat swarm.' },
  [41, 9, 46, 19]);
addThreatEncounter(m12, 'sweep-worms', 'worm', 5,
  { id: 'sweep-ambush', area: [8, 30, 38, 31], kind: 'bad',
    message: 'Worm traffic surges down the response sweep.' },
  [8, 30, 38, 31]);
m12.script!.triggers!.push({ id: 'sweep-loop-open', after: ['signoff'], kind: 'good',
  message: 'Runbook signed off — the sweep return door releases for the exit run.',
  openDoors: ['rf4-sweep-loop'] });
m12.map.lights = { ...m12.map.lights, ...lightRects([[41, 9, 46, 19, 0.7], [8, 30, 38, 31, 0.55], [44, 4, 45, 7, 0.85], [42, 21, 44, 23, 0.85], [44, 9, 44, 9, 0.35], [43, 19, 43, 19, 0.35]]) };
