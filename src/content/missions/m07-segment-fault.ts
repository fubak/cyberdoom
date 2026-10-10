import type { Mission } from '../../core/types';
import { lightRects } from '../../missions/levelkit';
import type { WalkStep } from '../../missions/walkthroughs';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import { addThreatEncounter, floorSpot, liveThreats, retex } from './campaign-map';

// M07 SEGMENT FAULT (SY0-701 3.2 placement, 3.1 ICS isolation, 4.5 ruleset order, 2.3 device audit)
// The plant is one flat subnet. Survey it, audit every device, then rebuild it
// into zones: firewall on the chokepoint, IPS inline in front of DB-01, a jump
// server as the only admin path, and SCADA-01 in its own zone. A worm keeps
// re-infecting cleaned flat-LAN hosts until the firewall is in place.
//
// Wrong choices are real consoles tagged 'wrong' (scored -15, explained in the
// case file): firewall inside the segment or at the WAN edge, IPS on SPAN/TAP,
// direct RDP paths, vendor VPN into SCADA, monitor-only, and three bad ACL
// rules (any-any, any->1433, any-port DMZ). Deploying deny-all before the
// allows is refused once, then fails the 'acl-order' avoid objective.

export const m07: Mission = {
  id: 'm07',
  title: 'SEGMENT FAULT',
  difficulty: 7,
  objectives: ['3.2', '3.1', '4.5', '2.3'],
  briefing:
    'The plant network is flat: web server, database, admin PCs and a 20-year-old SCADA controller all on one subnet. ' +
    'Your kit: MOUSE (2) inspects, KEYBOARD (1) operates consoles, USB SCANNER (3) cleans malware, BADGE (4) opens doors your role covers.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge'],
  map: {
    grid: [
      '########################################',
      '########################################',
      '##................####...........SSSSS##',
      '##.BBBB...........####.......SS..S...S##',
      '##.B..B...........####.......SS..2...S##',
      '##.B..B...........####..SS.......S...S##',
      '##.BKBB...........####..SS.......SSSSS##',
      '##................####................##',
      '##...........BBBBB####................##',
      '##...........1...B####.......SS.......##',
      '##...........B...B####................##',
      '##...........BBBBB####................##',
      '########C####################D##########',
      '##....................................##',
      '##....................................##',
      '##.............SSSSS......BBBBBBB.....##',
      '##.............SSSSS......B.....B.....##',
      '##.............SSSSS......B.....V.....##',
      '##.............SSSSS......B.....B.....##',
      '##.............SSSSS......B.....B.....##',
      '##........................BBBBBBB.....##',
      '########A#############X#################',
      '##BBB...............#.................##',
      '##...B..............#..........E......##',
      '##...3..............#.................##',
      '##...B..............#.................##',
      '##BBBB..............#.................##',
      '########################################',
      '########################################',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      S: { kind: 'wall', tex: 'wall-server' },
      B: { kind: 'wall', tex: 'wall-brick' },
      '.': { kind: 'floor', tex: 'floor' },
      // The single cable run between the legacy LAN and the core hall.
      C: { kind: 'door', tex: 'door', doorId: 'chokepoint' },
      D: { kind: 'door', tex: 'door', doorId: 'dmz-access' },
      K: { kind: 'door', tex: 'door', doorId: 'ics-cage', accessRole: 'ot' },
      V: { kind: 'door', tex: 'door', doorId: 'db-room' },
      A: { kind: 'door', tex: 'door', doorId: 'admin-office' },
      X: {
        kind: 'door',
        tex: 'door',
        doorId: 'exit',
        locked: true,
        lockText: 'Exit opens after the new segmentation is validated.',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: 'secret-switch', secret: true },
      '2': { kind: 'door', tex: 'wall-server', doorId: 'secret-dmz', secret: true },
      '3': { kind: 'door', tex: 'wall-brick', doorId: 'secret-admin', secret: true },
      E: { kind: 'exit', tex: 'exit' },
    },
    spawn: { x: 20.5, y: 18.5, angle: -Math.PI / 2 },
    defaultLight: 0.55,
    lights: lightRects([
      [2, 2, 17, 11, 0.5],
      [22, 2, 37, 11, 0.5],
      [2, 13, 37, 20, 0.65],
      [2, 22, 19, 26, 0.6],
      [21, 22, 37, 26, 0.5],
      [4, 4, 5, 5, 0.75],
      [14, 9, 16, 10, 0.4],
      [34, 3, 36, 5, 0.4],
      [2, 23, 4, 25, 0.4],
      [27, 16, 31, 19, 0.45],
    ]),
  },
  entities: [
    // --- survey ---
    {
      id: 'net-design', kind: 'console', x: 19, y: 14, sprite: 'console',
      tags: ['net-design'],
      grants: { resource: 'role:ot', amount: 1 },
      inspect: {
        label: 'Network design board',
        detail: 'The plant network redesign brief: one flat /24 holding every device. Read it before touching anything.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'TOPOLOGY SURVEY: single subnet 10.0.0.0/24\n' +
        'WEB-01    storefront        flat\n' +
        'DB-01     MSSQL 1433        flat\n' +
        'ADMIN     PC pool           flat\n' +
        'SCADA-01  plant control     flat\n' +
        'One broadcast domain: every host can reach every host.\n' +
        'REDESIGN: screened subnet for WEB-01, an isolated DB zone,\n' +
        'a jump-server admin path, and SCADA in its own ICS zone.\n' +
        'OT access granted for the controller cage.',
    },
    // --- device audit (tag: device-review) ---
    {
      id: 'sw-legacy', kind: 'console', x: 12, y: 4, sprite: 'console',
      tags: ['device-review'],
      inspect: {
        label: 'SW-LEGACY access switch',
        detail: 'Firmware 8.1, end-of-life 2024: no more patches. Credentials still the factory admin/admin. Every VLAN rides one trunk.',
        category: 'legit',
        objectives: ['2.3'],
      },
    },
    {
      id: 'scada-01', kind: 'console', x: 5, y: 5, sprite: 'console',
      tags: ['device-review'],
      inspect: {
        label: 'SCADA-01 plant controller',
        detail: 'Runs a vendor-certified legacy OS that cannot be patched without voiding certification. Vendor support ended in 2019. Reachable from every host on the LAN.',
        category: 'legit',
        objectives: ['2.3', '3.1'],
      },
    },
    {
      id: 'web-01', kind: 'workstation', x: 26, y: 9, sprite: 'workstation',
      tags: ['device-review'],
      inspect: {
        label: 'WEB-01 storefront',
        detail: 'Internet-facing web server on a 2014 OS image. Sits on the same subnet as the database, the admin PCs and the plant controller.',
        category: 'legit',
        objectives: ['2.3'],
      },
    },
    {
      id: 'db-01', kind: 'workstation', x: 29, y: 17, sprite: 'workstation',
      tags: ['device-review'],
      inspect: {
        label: 'DB-01 database',
        detail: 'Production database. tcp/1433 accepts connections from every host on the LAN - no filtering anywhere on the path.',
        category: 'legit',
        objectives: ['2.3'],
      },
    },
    {
      id: 'pc-04', kind: 'workstation', x: 10, y: 23, sprite: 'workstation',
      tags: ['device-review'],
      inspect: {
        label: 'ADMIN PC-04',
        detail: 'Admin workstation still on out-of-box default configuration: telnet and SMBv1 enabled, guest shares on.',
        category: 'legit',
        objectives: ['2.3'],
      },
    },
    // --- firewall placement (group: fw) ---
    {
      id: 'fw-chokepoint', kind: 'console', x: 9, y: 13, sprite: 'console',
      tags: ['fw-place'], group: 'fw',
      inspect: {
        label: 'TRUNK PORT: chokepoint',
        detail: 'The only cable run between the legacy LAN and the core hall - every packet between the plant floor and the rest of the network crosses this link.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Firewall installed inline on the chokepoint.\n' +
        'Zones: LEGACY-LAN and CORE are now separated.\n' +
        'Policy rack unlocked: append rules in order - first match wins.',
    },
    {
      id: 'fw-inside-legacy', kind: 'console', x: 15, y: 6, sprite: 'console',
      tags: ['wrong'], group: 'fw',
      inspect: {
        label: 'PATCH PANEL: inside legacy LAN',
        detail: 'A port deep inside the legacy segment, past the chokepoint. Traffic between the LAN and the core hall never crosses it.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Wrong call: a firewall inside the legacy segment filters nothing between zones. ' +
        'Lateral traffic still crosses the chokepoint freely. A firewall only inspects what passes through it, so it belongs on the boundary.',
    },
    {
      id: 'fw-edge', kind: 'console', x: 35, y: 9, sprite: 'console',
      tags: ['wrong'], group: 'fw',
      inspect: {
        label: 'WAN EDGE PORT',
        detail: 'A port facing the internet feed on the edge of the screened subnet.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Wrong call: an edge firewall guards inbound internet traffic but leaves every zone-to-zone path inside the plant unfiltered. ' +
        'The flat LAN stays flat.',
    },
    // --- IPS placement (group: ips) ---
    {
      id: 'ips-inline', kind: 'console', x: 34, y: 17, sprite: 'console',
      tags: ['ips-place'], group: 'ips',
      inspect: {
        label: 'INLINE LINK: DB uplink',
        detail: 'The only network path into the DB room - every packet to or from DB-01 crosses this segment.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'IPS installed inline in front of DB-01.\n' +
        'Traffic is inspected in the path and attacks are blocked, not just logged.\n' +
        'Failure mode set: fail-closed for a payment-tier database.',
    },
    {
      id: 'ips-span', kind: 'console', x: 14, y: 17, sprite: 'console',
      tags: ['wrong'], group: 'ips',
      inspect: {
        label: 'SPAN/mirror port on SW-CORE',
        detail: 'A mirror port that receives a copy of selected traffic for analysis.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Wrong call: a SPAN port is passive monitoring - an IDS role. ' +
        'Mirrored copies can alert, but the original attack packets still reach DB-01. ' +
        'An IPS that must block has to sit in the traffic path.',
    },
    {
      id: 'ips-tap', kind: 'console', x: 22, y: 17, sprite: 'console',
      tags: ['wrong'], group: 'ips',
      inspect: {
        label: 'Passive TAP on the DB uplink',
        detail: 'A network tap that copies traffic off the wire without touching it.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Wrong call: a tap is passive, just like SPAN - fine for an IDS. ' +
        'An IPS sitting on a copy of the traffic can never drop the real packet.',
    },
    // --- admin path (group: admin-path) ---
    {
      id: 'jump-01', kind: 'console', x: 8, y: 24, sprite: 'console',
      tags: ['admin-path'], group: 'admin-path',
      inspect: {
        label: 'Provision JUMP-01 jump server',
        detail: 'A hardened, monitored host between the admin office and the server zones. MFA and session logging on every session.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'JUMP-01 provisioned.\n' +
        'Direct admin-to-server protocols are policy-dropped; all administrative\n' +
        'sessions now bounce through the jump server with MFA and session logging.\n' +
        'One path to harden and watch.',
    },
    {
      id: 'rdp-all', kind: 'console', x: 12, y: 24, sprite: 'console',
      tags: ['wrong'], group: 'admin-path',
      inspect: {
        label: 'Allow RDP from every admin PC',
        detail: 'Permit tcp/3389 from each admin workstation straight to every server and controller.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Wrong call: every admin PC becomes a management path. ' +
        'One phished workstation then reaches everything, including the unpatchable controller. ' +
        'Admin access belongs behind a single hardened jump server.',
    },
    {
      id: 'rdp-scada', kind: 'console', x: 16, y: 24, sprite: 'console',
      tags: ['wrong'], group: 'admin-path',
      inspect: {
        label: 'Direct RDP to SCADA-01 (maintenance)',
        detail: 'A temporary 3389 hole from the admin PCs straight to the plant controller - just for the maintenance window.',
        category: 'legit',
        objectives: ['3.2'],
      },
      log:
        'Wrong call: a temporary hole is still a hole. ' +
        'Direct RDP to an unpatchable controller is exactly the lateral path segmentation exists to remove. ' +
        'Route maintenance through the jump server instead.',
    },
    // --- SCADA isolation (group: ics) ---
    {
      id: 'ics-zone', kind: 'console', x: 8, y: 7, sprite: 'console',
      tags: ['ics-zone'], group: 'ics',
      inspect: {
        label: 'Dedicated ICS zone for SCADA-01',
        detail: 'Move the controller behind the firewall into its own zone: only the required historian flows allowed, everything else denied, plus monitoring.',
        category: 'legit',
        objectives: ['3.1'],
      },
      log:
        'SCADA-01 isolated into ICS-ZONE.\n' +
        'Only historian reads on tcp/502 cross the boundary; all else is denied and logged.\n' +
        'An unpatchable system is protected by removing reachability.',
    },
    {
      id: 'ics-airgap', kind: 'console', x: 10, y: 7, sprite: 'console',
      tags: ['ics-zone'], group: 'ics',
      inspect: {
        label: 'Air gap SCADA-01',
        detail: 'Pull the controller off the network entirely - no connectivity and no remote reachability at all.',
        category: 'legit',
        objectives: ['3.1'],
      },
      log:
        'SCADA-01 air-gapped: no network path exists to the controller.\n' +
        'Maximum isolation - physical access is now the only way to operate it.',
    },
    {
      id: 'ics-vpn', kind: 'console', x: 12, y: 7, sprite: 'console',
      tags: ['wrong'], group: 'ics',
      inspect: {
        label: 'Vendor remote-support VPN',
        detail: 'The vendor asks for a standing VPN path so their engineers can reach SCADA-01 for support.',
        category: 'legit',
        objectives: ['3.1'],
      },
      log:
        'Wrong call: a standing third-party VPN gives an unpatchable controller a routable path through a party you do not control. ' +
        'Vendor remote access belongs behind the jump server with time-limited credentials.',
    },
    {
      id: 'ics-flat', kind: 'console', x: 14, y: 7, sprite: 'console',
      tags: ['wrong'], group: 'ics',
      inspect: {
        label: 'Monitor only, stay on flat LAN',
        detail: 'Leave SCADA-01 where it is and rely on network monitoring to catch attacks.',
        category: 'legit',
        objectives: ['3.1'],
      },
      log:
        'Wrong call: monitoring detects the compromise but cannot prevent it. ' +
        'On the flat LAN the controller stays one hop from every infected host.',
    },
    // --- firewall ruleset (tags: acl / acl-deny, and three wrong rules) ---
    {
      id: 'rule-443', kind: 'console', x: 11, y: 13, sprite: 'console',
      tags: ['acl'],
      inspect: {
        label: 'Rule: HTTPS to screened subnet',
        detail: 'PERMIT tcp any -> DMZ 10.20.0.0/24 eq 443. Public web traffic reaches the screened subnet on TLS only.',
        category: 'legit',
        objectives: ['4.5'],
      },
      log: 'Rule appended: PERMIT tcp any -> 10.20.0.0/24 eq 443.',
    },
    {
      id: 'rule-1433', kind: 'console', x: 13, y: 13, sprite: 'console',
      tags: ['acl'],
      inspect: {
        label: 'Rule: SQL web->DB only',
        detail: 'PERMIT tcp WEB-01 10.20.0.5 -> DB-01 10.30.0.8 eq 1433. Only the storefront may query the database.',
        category: 'legit',
        objectives: ['4.5'],
      },
      log: 'Rule appended: PERMIT tcp 10.20.0.5 -> 10.30.0.8 eq 1433.',
    },
    {
      id: 'rule-deny', kind: 'console', x: 13, y: 14, sprite: 'console',
      tags: ['acl-deny'],
      inspect: {
        label: 'Rule: deny-all (log)',
        detail: 'DENY ip any any, logged. Everything not explicitly permitted hits this rule.',
        category: 'legit',
        objectives: ['4.5'],
      },
      log:
        'Rule appended last: DENY ip any any (log).\n' +
        'Everything not explicitly allowed now falls through to a logged deny.\n' +
        'First match wins: the allows had to be written above it,\n' +
        'or the catch-all would swallow the permitted traffic too.',
    },
    {
      id: 'rule-any', kind: 'console', x: 15, y: 13, sprite: 'console',
      tags: ['wrong'],
      inspect: {
        label: 'Rule: PERMIT ip any any (temp)',
        detail: 'A temporary any-any permit for testing - parked near the top of the list for convenience.',
        category: 'legit',
        objectives: ['4.5'],
      },
      log:
        'Wrong call: an any-any permit placed above the specific rules makes the rest of the ACL decorative. ' +
        'First match wins, so everything is allowed and the deny-all below never sees a packet.',
    },
    {
      id: 'rule-1433-any', kind: 'console', x: 11, y: 14, sprite: 'console',
      tags: ['wrong'],
      inspect: {
        label: 'Rule: any -> DB-01 :1433',
        detail: 'PERMIT tcp any -> DB-01 eq 1433. Opens the database listener to every host on the LAN.',
        category: 'legit',
        objectives: ['4.5'],
      },
      log:
        'Wrong call: the requirement is web->DB only. ' +
        'Opening 1433 to every host defeats isolating the database zone.',
    },
    {
      id: 'rule-web-any', kind: 'console', x: 15, y: 14, sprite: 'console',
      tags: ['wrong'],
      inspect: {
        label: 'Rule: any -> DMZ any port',
        detail: 'PERMIT tcp any -> DMZ any port. The screened subnet gets traffic on every service.',
        category: 'legit',
        objectives: ['4.5'],
      },
      log:
        'Wrong call: the screened subnet should receive 443 only. ' +
        'Every port left open is attack surface.',
    },
    // --- validation ---
    {
      id: 'validate', kind: 'console', x: 24, y: 20, sprite: 'console',
      tags: ['validate'],
      inspect: {
        label: 'Validation console',
        detail: 'Replays the ruleset and probes every zone boundary to confirm the segmentation holds.',
        category: 'legit',
        objectives: ['4.5', '3.2'],
      },
      log:
        'VALIDATION PASS:\n' +
        'internet -> DMZ:443          OK\n' +
        'WEB-01 -> DB-01:1433         OK\n' +
        'LAN    -> DB-01:1433         DENIED\n' +
        'LAN    -> SCADA-01           unreachable\n' +
        'admin path                   JUMP-01 only\n' +
        'all other flows              final deny (logged)',
    },
    // --- flat-LAN hosts infected by the worm (tag: flat-host) ---
    {
      id: 'ws-plant1', kind: 'workstation', x: 9, y: 9, sprite: 'workstation-infected',
      infected: true, hp: 1, tags: ['flat-host'],
      inspect: {
        call: 'auto',
        label: 'Plant workstation WS-PLANT-1',
        detail: 'A worm process is beaconing to peers on the flat LAN and scanning SMB on every reachable host.',
        category: 'malware',
        objectives: ['2.4'],
      },
    },
    {
      id: 'ws-plant2', kind: 'workstation', x: 11, y: 10, sprite: 'workstation-infected',
      infected: true, hp: 1, tags: ['flat-host'],
      inspect: {
        call: 'auto',
        label: 'Plant workstation WS-PLANT-2',
        detail: 'Same worm family as WS-PLANT-1 - it replicates to any host still reachable on the flat subnet.',
        category: 'malware',
        objectives: ['2.4'],
      },
    },
    {
      id: 'ws-plant3', kind: 'workstation', x: 15, y: 25, sprite: 'workstation-infected',
      infected: true, hp: 1, tags: ['flat-host'],
      inspect: {
        call: 'auto',
        label: 'Plant workstation WS-PLANT-3',
        detail: 'Worm process spawning outbound connections toward the admin PCs - the flat office LAN is a lateral highway.',
        category: 'malware',
        objectives: ['2.4'],
      },
    },
    // --- roaming worms ---
    {
      id: 'worm-hall', kind: 'enemy', x: 10, y: 16, sprite: 'worm', threat: 'worm',
      ai: 'wander', hp: 2, infected: true,
      inspect: {
        label: 'Lateral-movement worm',
        detail: 'Self-propagating process scanning every host on the flat subnet for SMB and RDP listeners.',
        category: 'malware',
        objectives: ['2.4'],
      },
    },
    {
      id: 'worm-legacy', kind: 'enemy', x: 8, y: 10, sprite: 'worm', threat: 'worm',
      ai: 'wander', hp: 2, infected: true,
      inspect: {
        label: 'Lateral-movement worm',
        detail: 'Self-propagating process scanning every host on the flat subnet for SMB and RDP listeners.',
        category: 'malware',
        objectives: ['2.4'],
      },
    },
    // --- items ---
    {
      id: 'tool-edr', kind: 'item', x: 36, y: 19, sprite: 'tool-edr',
      grants: { resource: 'tool:edr', amount: 1 },
      inspect: {
        label: 'EDR console (found)',
        detail: 'A portable EDR agent - scans and kills malicious processes in a burst.',
        category: 'item',
        objectives: ['4.4'],
      },
    },
    { id: 'edr-cell-1', kind: 'item', x: 18, y: 20, sprite: 'edr-cell', grants: { resource: 'edr-cell', amount: 1 }, inspect: { label: 'EDR cell', detail: 'One EDR scan charge.', category: 'item' } },
    { id: 'edr-cell-2', kind: 'item', x: 35, y: 3, sprite: 'edr-cell', grants: { resource: 'edr-cell', amount: 1 }, inspect: { label: 'EDR cell', detail: 'One EDR scan charge.', category: 'item' } },
    { id: 'edr-cell-3', kind: 'item', x: 33, y: 24, sprite: 'edr-cell', grants: { resource: 'edr-cell', amount: 1 }, inspect: { label: 'EDR cell', detail: 'One EDR scan charge.', category: 'item' } },
    { id: 'charge-1', kind: 'item', x: 15, y: 9, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'charge-2', kind: 'item', x: 5, y: 14, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'charge-3', kind: 'item', x: 9, y: 19, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'charge-4', kind: 'item', x: 30, y: 13, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'charge-5', kind: 'item', x: 14, y: 23, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'charge-6', kind: 'item', x: 3, y: 25, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'charge-7', kind: 'item', x: 34, y: 23, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 }, inspect: { label: 'Scanner charge', detail: 'USB scanner ammunition.', category: 'item' } },
    { id: 'medkit-1', kind: 'item', x: 15, y: 10, sprite: 'medkit', grants: { resource: 'integrity', amount: 30 }, inspect: { label: 'Field kit', detail: 'Restores integrity.', category: 'item' } },
    { id: 'medkit-2', kind: 'item', x: 18, y: 25, sprite: 'medkit', grants: { resource: 'integrity', amount: 30 }, inspect: { label: 'Field kit', detail: 'Restores integrity.', category: 'item' } },
    { id: 'medkit-3', kind: 'item', x: 3, y: 23, sprite: 'medkit', grants: { resource: 'integrity', amount: 30 }, inspect: { label: 'Field kit', detail: 'Restores integrity.', category: 'item' } },
  ],
  missionObjectives: [
    { id: 'survey', text: 'Read the network design board (core hall)', kind: 'interact', tag: 'net-design' },
    { id: 'audit', text: 'Inspect every device on the flat LAN', kind: 'inspect', tag: 'device-review', count: 5, requires: ['survey'] },
    { id: 'fw-place', text: 'Install the firewall at the zone boundary', kind: 'interact', tag: 'fw-place', requires: ['audit'] },
    { id: 'ips-place', text: 'Deploy the IPS inline in front of DB-01', kind: 'interact', tag: 'ips-place', requires: ['audit'] },
    { id: 'admin-path', text: 'Make the jump server the only admin path', kind: 'interact', tag: 'admin-path', requires: ['audit'] },
    { id: 'ics-zone', text: 'Isolate SCADA-01 from the flat network', kind: 'interact', tag: 'ics-zone', requires: ['audit'] },
    { id: 'flat-host', text: 'Clean the worm off the plant hosts', kind: 'clean', tag: 'flat-host', count: 3, requiresInspect: true },
    { id: 'acl-allows', text: 'Write the specific allow rules', kind: 'interact', tag: 'acl', count: 2, requires: ['fw-place'] },
    { id: 'acl-deny', text: 'Append deny-all as the LAST rule', kind: 'interact', tag: 'acl-deny', requires: ['acl-allows'], earlyViolates: 'acl-order' },
    { id: 'acl-order', text: 'Keep deny-all below the allows - first match wins', kind: 'avoid', tag: 'acl-order-breach' },
    { id: 'wrong-call', text: 'Make the right call on each case file', kind: 'avoid', tag: 'wrong-call', strikes: 3 },
    {
      id: 'validate', text: 'Validate the new segmentation', kind: 'interact', tag: 'validate',
      requires: ['fw-place', 'ips-place', 'admin-path', 'ics-zone', 'acl-allows', 'acl-deny', 'flat-host'],
    },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  debriefQuestions: [
    q('q1', ['3.2'], 'Admins must manage servers in a high-security zone from the user network. Which design MOST reduces the attack surface?', 3, [
      ['Allow RDP into the zone from every workstation', 'Every workstation becomes a path into the zone, so one phished PC reaches the servers.'],
      ['Port-forward each server\u2019s management port through the firewall', 'This exposes many management interfaces instead of one controlled path.'],
      ['Put admin workstations on the same subnet as the servers', 'That removes the zone boundary entirely.'],
      ['Allow access only through a hardened jump server with MFA and session logging', 'A jump server is the single, monitored entry point into the zone, so there is only one door to harden and watch.'],
    ]),
    q('q2', ['3.2'], 'An IPS must block attacks in real time in front of the database. How must it be deployed?', 0, [
      ['Inline (active), choosing whether a failure should fail-open or fail-closed', 'Only an inline device sits in the traffic path and can drop packets. Its failure mode is a trade-off between availability and security.'],
      ['On a network tap', 'A tap gives the device a copy of the traffic. It can detect and alert, but it cannot block.'],
      ['On a SPAN/mirror port', 'Mirroring is also passive monitoring, so the original packets still reach the database.'],
      ['On the admin\u2019s workstation', 'A host there protects only that workstation, not the database\u2019s network path.'],
    ]),
    q('q3', ['3.1'], 'A plant\u2019s SCADA controller runs an OS the vendor no longer patches, and it cannot be replaced for three years. What is BEST?', 1, [
      ['Connect it to the internet so the vendor can support it remotely', 'This exposes an unpatchable system to the whole internet, the worst possible move.'],
      ['Isolate it (air gap or a strictly segmented zone), allow only required flows, and monitor it', 'When you cannot patch, you reduce reachability. Segmentation plus monitoring compensates for the inability to patch.'],
      ['Force-install the newest desktop OS updates on it', 'Updates for a different OS can break an industrial controller, and none exist for its own OS.'],
      ['Accept the risk with no additional controls', 'Acceptance should be a documented decision after reasonable controls, not a substitute for them.'],
    ]),
    q('q4', ['4.5', '3.2'], 'Firewall rules are evaluated top-down, first match wins. Where does an explicit "deny any any" rule belong?', 2, [
      ['First, so nothing slips through', 'As the first rule it matches everything, and no traffic ever reaches the allow rules below.'],
      ['In the middle, between inbound and outbound rules', 'Every allow rule below it would become unreachable.'],
      ['Last, after the specific allow rules', 'Specific allows match first, and everything else falls through to the final deny (implicit deny made explicit and logged).'],
      ['Nowhere; firewalls allow by default', 'A secure firewall denies by default. Allow-by-default is the misconfiguration.'],
    ]),
    q('q5', ['2.3'], 'A core switch still uses its factory admin/admin login, and the vendor stopped releasing firmware for it last year. Which vulnerability types apply?', 1, [
      ['Zero-day and race condition', 'Both problems are well known, so neither is a zero-day, and nothing here involves timing.'],
      ['Misconfiguration and end-of-life hardware', 'Unchanged defaults are a misconfiguration. A device with no more firmware updates is end-of-life, so future flaws will never be fixed.'],
      ['VM escape and resource reuse', 'Those are virtualization vulnerabilities, and the switch is physical hardware.'],
      ['Cross-site scripting', 'XSS is a web-application flaw. This is a network device problem.'],
    ]),
  ],
  script: {
    par: 270,
    triggers: [
      {
        id: 'audit-done',
        after: ['audit'],
        kind: 'info',
        message: 'Audit complete: an unpatchable controller, an end-of-life switch and defaults everywhere. This flat LAN is one host away from a plant-wide outage.',
      },
      {
        id: 'fw-inline',
        after: ['fw-place'],
        kind: 'good',
        message: 'Firewall inline: zones separated - lateral traffic now stops at the chokepoint.',
      },
      {
        id: 'validated-exit',
        after: ['validate'],
        openDoors: ['exit'],
        kind: 'good',
        message: 'Segmentation validated: allows work, everything else hits the final deny. Exit open.',
      },
    ],
    secrets: [
      { id: 'switch-cache', area: [14, 9, 16, 10], label: 'Switch cache', grant: { resource: 'usb-charge', amount: 16 } },
      { id: 'dmz-cage', area: [34, 3, 36, 5], label: 'DMZ supply cage', grant: { resource: 'integrity', amount: 40 } },
      { id: 'admin-store', area: [2, 23, 4, 25], label: 'Admin storeroom', grant: { resource: 'usb-charge', amount: 16 } },
    ],
    outbreak: {
      tag: 'flat-host',
      every: 18,
      until: 'fw-place',
      message: 'LATERAL MOVEMENT: the worm re-infected a cleaned host. On a flat LAN it always comes back - segment first.',
    },
  },
};

// Dormant pressure: worms wake as the player crosses the flat network, and the
// attacker escalates to hands-on-keyboard trojans once the easy path dies.
addThreatEncounter(
  m07, 'worm-legacy-pack', 'worm', 3,
  {
    id: 'flat-worm-pack',
    area: [2, 2, 17, 11],
    kind: 'warn',
    message: 'Worm pack loose on the flat LAN - it scans every host in reach.',
  },
  [2, 2, 17, 11],
);
addThreatEncounter(
  m07, 'worm-hall-pack', 'worm', 2,
  {
    id: 'core-worm-pack',
    area: [2, 13, 14, 20],
    kind: 'warn',
    message: 'Worms are churning through the unsegmented core hall.',
  },
  [2, 13, 16, 20],
);
addThreatEncounter(
  m07, 'worm-office', 'worm', 2,
  {
    id: 'office-worm-pack',
    area: [2, 22, 19, 26],
    kind: 'warn',
    message: 'A worm is loose in the admin office.',
  },
  [6, 22, 19, 26],
);
addThreatEncounter(
  m07, 'worm-db', 'worm', 2,
  {
    id: 'db-approach-worm',
    area: [33, 14, 37, 20],
    kind: 'warn',
    message: 'The worm followed you to the DB uplink.',
  },
  [33, 14, 37, 20],
);
addThreatEncounter(
  m07, 'trojan-hok', 'trojan', 2,
  {
    id: 'hok-drop',
    after: ['ics-zone'],
    kind: 'bad',
    message: 'SCADA isolated. The attacker drops hands-on-keyboard trojans in the core!',
  },
  [2, 13, 24, 20],
);

export const m07Walkthrough: WalkStep[] = [
  // survey: read the design board (grants the ot role for the cage door)
  { goto: [18, 14] },
  { interact: 'net-design' },
  // legacy room: audit the switch and the caged controller
  { goto: [8, 13] },
  { use: [8, 12] },
  { goto: [8, 11] },
  { goto: [12, 5] },
  { inspect: 'sw-legacy' },
  { goto: [4, 7] },
  { badge: [4, 6] },
  { goto: [4, 5] },
  { inspect: 'scada-01' },
  { goto: [4, 7] },
  { goto: [8, 10] },
  { goto: [8, 13] },
  // screened subnet: audit WEB-01
  { goto: [29, 13] },
  { use: [29, 12] },
  { goto: [29, 11] },
  { goto: [26, 10] },
  { inspect: 'web-01' },
  { goto: [29, 11] },
  { goto: [29, 13] },
  // DB room: audit DB-01
  { goto: [33, 17] },
  { use: [32, 17] },
  { goto: [30, 17] },
  { inspect: 'db-01' },
  { goto: [33, 17] },
  // admin office: audit PC-04, then provision the jump server
  { goto: [8, 20] },
  { use: [8, 21] },
  { goto: [8, 22] },
  { goto: [10, 22] },
  { inspect: 'pc-04' },
  { goto: [8, 23] },
  { interact: 'jump-01' },
  // back to the chokepoint: install the firewall (stops re-infection)
  { goto: [8, 22] },
  { goto: [8, 20] },
  { goto: [8, 13] },
  { interact: 'fw-chokepoint' },
  // IPS inline on the DB uplink
  { goto: [33, 17] },
  { interact: 'ips-inline' },
  // move SCADA-01 into its own zone
  { goto: [8, 13] },
  { goto: [8, 11] },
  { goto: [8, 6] },
  { interact: 'ics-zone' },
  // ruleset: allows first, deny-all last
  { goto: [8, 11] },
  { goto: [8, 13] },
  { goto: [10, 13] },
  { interact: 'rule-443' },
  { goto: [12, 13] },
  { interact: 'rule-1433' },
  { goto: [12, 14] },
  { interact: 'rule-deny' },
  // clean the worm off the flat hosts (no more re-infection)
  { goto: [9, 8] },
  { inspect: 'ws-plant1' },
  { call: 'ws-plant1' },
  { clean: 'ws-plant1' },
  { goto: [11, 9] },
  { inspect: 'ws-plant2' },
  { call: 'ws-plant2' },
  { clean: 'ws-plant2' },
  { goto: [8, 11] },
  { goto: [8, 13] },
  { goto: [8, 20] },
  { goto: [8, 22] },
  { goto: [15, 24] },
  { inspect: 'ws-plant3' },
  { call: 'ws-plant3' },
  { clean: 'ws-plant3' },
  // validate, then leave
  { goto: [8, 22] },
  { goto: [8, 20] },
  { goto: [24, 19] },
  { interact: 'validate' },
  { wait: 0.2 },
  { goto: [22, 20] },
  { goto: [22, 22] },
  { goto: [31, 23] },
];

export const m07Teach: MissionTeaching = {
  tagline: 'One flat subnet, a worm loose, and a controller nobody can patch.',
  situation:
    'The plant LAN is a single broadcast domain: the web storefront, the database, the admin PCs and a 20-year-old SCADA controller can all reach each other, and a worm is already spreading. Rebuild it into zones before it reaches the controller.',
  orders: [
    { text: 'Read the design board, then inspect every device.', objective: '2.3' },
    { text: 'Place the firewall, inline IPS and jump server.', objective: '3.2' },
    { text: 'Isolate SCADA-01; specific allows, deny-all last.', objective: '4.5' },
  ],
  keyTerms: [
    'network segmentation',
    'security zone',
    'screened subnet',
    'jump server',
    'intrusion prevention system',
    'intrusion detection system',
    'air gap',
    'access control list',
    'implicit deny',
    'scada',
    'lateral movement',
  ],
  lessons: {
    'wrong-call': { objective: '2.4', done: 'Every plant host got the right triage call before cleaning.', missed: 'A wrong call was logged on a plant host. Confirm the indicator, then act.' },
    survey: {
      objective: '3.2',
      done: 'The design board showed one flat /24 and the zones it needed. Segmentation starts from the topology: you cannot place boundaries you have not mapped.',
      missed: 'The board was never read, so the zone design and the OT access for the controller cage were missed.',
    },
    audit: {
      objective: '2.3',
      done: 'Every device was inspected: an end-of-life switch on factory defaults, a legacy-OS SCADA controller the vendor abandoned, a 2014 web image, an unfiltered database and a default-config admin PC. EOL firmware, default configuration and legacy OS are exam-listed vulnerability types.',
      missed: 'Devices were left uninspected. Placement decisions need evidence: EOL firmware, default configuration and legacy OS are what justify isolation here.',
    },
    'fw-place': {
      objective: '3.2',
      done: 'The firewall went inline on the chokepoint - the only path between the legacy LAN and the core. A firewall controls only the traffic that crosses it, so it belongs on the zone boundary.',
      missed: 'A firewall inside a segment or at the WAN edge filters nothing between the zones. Zone separation happens at the boundary link, not deep inside a segment.',
    },
    'ips-place': {
      objective: '3.2',
      done: 'The IPS went inline in front of DB-01. Only a device in the traffic path can drop attack packets in real time.',
      missed: 'SPAN and TAP are passive copies - IDS roles. An IPS that must block has to sit inline, and its failure mode (fail-open vs fail-closed) is a design choice.',
    },
    'admin-path': {
      objective: '3.2',
      done: 'JUMP-01 became the only admin path: hardened, MFA, session logging. One door to harden and watch instead of a management path from every PC.',
      missed: 'Direct RDP from every admin PC (or straight to SCADA-01) makes every workstation a management path - one phish away from the controller.',
    },
    'ics-zone': {
      objective: '3.1',
      done: 'SCADA-01 moved into its own zone (or was air-gapped). When a system cannot be patched, you reduce its reachability: dedicated zone or air gap, required flows only, plus monitoring.',
      missed: 'A standing vendor VPN or monitor-only keeps the unpatchable controller reachable from every host. Compensate for the un-patchable by removing reachability.',
    },
    'flat-host': {
      objective: '3.1',
      done: 'The worm came off the plant hosts - and it stopped coming back once the zones were separated. Cleaning without segmenting is a treadmill on a flat LAN.',
      missed: 'Hosts were left infected. On a flat network a worm re-infects cleaned hosts; segment first, then clean.',
    },
    'acl-allows': {
      objective: '4.5',
      done: 'Specific allows were written first: 443 into the screened subnet, and 1433 only from WEB-01 to DB-01. Least-privilege rules: exact sources, destinations and ports.',
      missed: 'Broad permits (any-any, any to 1433, any port to the DMZ) leave the same surface the segmentation was meant to remove.',
    },
    'acl-deny': {
      objective: '4.5',
      done: 'Deny-all went last, logged. First match wins, so the final deny catches only what the allows did not match.',
      missed: 'Deny-all above the allows matches everything first and dead-ends the ruleset.',
    },
    'acl-order': {
      objective: '4.5',
      done: 'Rule order held: allows match first, the explicit deny catches the rest.',
      missed: 'Deny-all was deployed before the allow rules. Evaluated top-down with first match wins, it swallowed the allowed traffic - an unauthorized, breaking change.',
    },
    validate: {
      objective: '4.5',
      done: 'The validation replay proved the design: 443 reaches the DMZ, only WEB-01 reaches DB-01 on 1433, SCADA-01 is unreachable, admin flows go through JUMP-01 and everything else hits the logged deny.',
      missed: 'The new segmentation was never validated. After changing controls, prove they do what the design said.',
    },
    exit: {
      objective: '3.2',
      done: 'Zones placed, admin path consolidated, SCADA isolated, ruleset ordered and validated - the flat network is gone.',
      missed: 'The exit stays locked until the segmentation is placed, ordered and validated.',
    },
    'bad-choice': {
      objective: '3.2',
      done: 'The wrong placements were rejected: a firewall only controls traffic that crosses it, an IPS on a copy can never block, and direct RDP paths recreate the flat network inside the zones.',
      missed: 'Wrong placements were scored: read the case file entries for why a firewall inside a segment, a passive IPS feed or direct RDP fails the design.',
    },
    'false-positive': {
      objective: '4.4',
      done: 'Clean devices left alone after inspection. Evidence first: scan only what the indicators support.',
      missed: 'A clean device was flagged without evidence. Confirm indicators before acting - every false positive costs effort.',
    },
  },
  examTip:
    'Un-patchable means unreachable: segment it into its own zone or air gap it. Firewalls sit on boundaries, IPS sits inline (SPAN/TAP are IDS roles), admins enter through one jump server, and ACLs end in a logged deny-all.',
};

// F1: encounter pacing — live skirmisher, room reveals, supplies.
liveThreats(m07, 'open-worm', 'worm', 1, [12, 13, 25, 19]);
addThreatEncounter(m07, 'ne-trojan', 'trojan', 3, {
  id: 'ne-ambush', area: [22, 2, 37, 11], kind: 'bad',
  message: 'Trojans crawl out of the east server rows.',
}, [22, 2, 37, 11]);
addThreatEncounter(m07, 'exit-rat', 'rat', 2, {
  id: 'exit-ambush', area: [20, 22, 37, 26], kind: 'bad',
  message: 'RATs surge toward the exit corridor.',
}, [20, 22, 37, 26]);
addThreatEncounter(m07, 'vault-trojan', 'trojan', 2, {
  id: 'vault-ambush', area: [26, 15, 33, 20], kind: 'bad',
  message: 'The segmented vault was hiding trojans.',
}, [26, 15, 33, 20]);
m07.entities.push(
  { id: 'chg-c', kind: 'item', ...floorSpot(m07, [12, 13, 25, 19]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-ne', kind: 'item', ...floorSpot(m07, [22, 2, 37, 11]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'chg-ex', kind: 'item', ...floorSpot(m07, [20, 22, 37, 26]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'med-sw', kind: 'item', ...floorSpot(m07, [11, 22, 19, 26]), sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 }, inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

// — rF2 landmarks: central firewall hall = grid floor; the plant annex (east
// cage) + admin stores = dim rust service floors.
m07.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m07.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m07, [2, 13, 37, 20], 'floor', ',');
retex(m07, [26, 15, 33, 20], 'floor', ';');
retex(m07, [2, 21, 6, 26], 'floor', ';');
m07.map.lights = { ...m07.map.lights, ...lightRects([[26, 15, 33, 19, 0.5], [2, 21, 6, 25, 0.5], [10, 13, 30, 19, 0.85]]) };
m07.entities.push(
  { id: 'fw-board-a', kind: 'prop', x: 9.5, y: 16.5, sprite: 'console' },
  { id: 'fw-board-b', kind: 'prop', x: 22.5, y: 16.5, sprite: 'workstation' },
);
