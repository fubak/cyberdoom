import type { EntityDef, MapDef, Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { q } from '../arc-questions';
import type { WalkStep } from '../../missions/walkthroughs';
import { lightRects } from '../../missions/levelkit';
import { addThreatEncounter, mixedThreatEncounter, floorSpot, liveThreats, retex, stagedThreatWave } from './campaign-map';

const map: MapDef = {
  grid: [
    '################################################',
    '##################..E..#########################',
    '##################..X..#########################',
    '##################.....###################....##',
    '##.........................WW......#######....##',
    '##..........................W......########..###',
    '##...1.............................#####..#..###',
    '##.......WW..................W.....#####..4..###',
    '##...############...X..#################..#..###',
    '#################......####################..###',
    '######W.........#......#........WW.#..####...###',
    '######W.........#......#.........W.#..###.....##',
    '######.............................2..##.......#',
    '######..........#......#..............##.......#',
    '######.......WW.#......#.W.........#...T.......#',
    '######........W.#......#...........#..##.......#',
    '####################O##Q################.......#',
    '##...#W..........................W..#####.....##',
    '##...#..........#...................######...###',
    '##...#W.........#......#.........WW.#######..###',
    '##...3..............................#######..###',
    '##...#.......WW.#......#.W..........#######..###',
    '##...#..........B......#............####..#..###',
    '#################...A..#################..5..###',
    '###..................................###..#..###',
    '###...........SSS....................######..###',
    '###...........SS......................U.......##',
    '###..................................##.......##',
    '################################################',
    '################################################',
  ],
  legend: {
    '#': { kind: 'wall', tex: 'wall-panel' },
    W: { kind: 'wall', tex: 'wall-brick' },
    S: { kind: 'wall', tex: 'wall-server' },
    '.': { kind: 'floor', tex: 'floor' },
    E: { kind: 'exit', tex: 'exit' },
    A: { kind: 'door', tex: 'door', doorId: 'change-board', accessRole: 'analyst' },
    O: { kind: 'door', tex: 'door', doorId: 'change-operations', accessRole: 'analyst' },
    B: { kind: 'door', tex: 'door', doorId: 'change-backtrack', locked: true, lockText: 'Cover the four control gaps before opening the return route.' },
    Q: { kind: 'door', tex: 'door', doorId: 'change-queue', locked: true, lockText: 'Patch every confirmed finding before entering the upper scan wing.' },
    X: { kind: 'door', tex: 'door', doorId: 'change-exit', locked: true, lockText: 'Complete and validate the change before exiting.' },
    '1': { kind: 'door', tex: 'wall-brick', doorId: 'change-secret-1', secret: true },
    '2': { kind: 'door', tex: 'wall-server', doorId: 'change-secret-2', secret: true },
    '3': { kind: 'door', tex: 'wall-brick', doorId: 'change-secret-3', secret: true },
  },
  spawn: { x: 5.5, y: 26.5, angle: -0.26 },
  defaultLight: 0.62,
  lights: lightRects([
    [3, 24, 17, 27, 0.85],
    [23, 24, 36, 27, 0.78],
    [6, 10, 15, 15, 0.68],
    [24, 10, 34, 15, 0.78],
    [6, 17, 15, 22, 0.68],
    [24, 17, 35, 22, 0.78],
    [17, 8, 22, 23, 0.85],
    [5, 4, 34, 7, 0.82],
    [18, 1, 22, 3, 1],
  ]),
};

const evidenceAndWork: EntityDef[] = [
  {
    id: 'impact-analysis', kind: 'console', x: 8.5, y: 25.5, sprite: 'console', tags: ['change-doc'],
    log: 'CHANGE RECORD: impact analysis completed. Payroll, HR export, and downstream timekeeping dependencies reviewed.\nCompensating control noted: manual review for the legacy host during the window.',
    inspect: { label: 'Impact analysis', detail: 'Change impact record for payroll and its dependent services.', category: 'legit', objectives: ['1.3'] },
  },
  {
    id: 'backout-plan', kind: 'console', x: 30.5, y: 25.5, sprite: 'console', tags: ['change-doc'],
    log: 'CHANGE RECORD: backout plan approved. Restore the last known-good payroll image and validate the prior database snapshot.',
    inspect: { label: 'Backout plan', detail: 'Documented rollback steps for the payroll patch.', category: 'legit', objectives: ['1.3'] },
  },
  {
    id: 'owner-approval', kind: 'console', x: 12.5, y: 20.5, sprite: 'console', tags: ['change-doc'],
    log: 'CHANGE RECORD: payroll service owner approved CHG-8821 for the maintenance window.\nBackout plan and test results attached; restricted activities apply during the window.',
    inspect: { label: 'Owner approval', detail: 'Approval record from the payroll service owner.', category: 'legit', objectives: ['1.3'] },
  },
  {
    id: 'payroll-patch', kind: 'console', x: 26.5, y: 25.5, sprite: 'console', tags: ['payroll-patch'],
    log: 'PAYROLL CHANGE: signed patch installed; service health check passed.\nApp control: the allow list runs only signed builds; the deny list blocks the legacy client.',
    inspect: { label: 'Payroll patch console', detail: 'Installation control for the critical payroll patch.', category: 'legit', objectives: ['1.3'] },
  },
  {
    id: 'gap-legacy-edr', kind: 'console', x: 7.5, y: 21.5, sprite: 'console', tags: ['gap-evidence'],
    log: 'Legacy HR server cannot run the EDR agent required by policy.',
    inspect: { label: 'Control gap: HR server', detail: 'Legacy HR server cannot run the EDR agent required by policy.', category: 'legit', objectives: ['1.1'] },
  },
  {
    id: 'gap-payroll-write', kind: 'console', x: 30.5, y: 21.5, sprite: 'console', tags: ['gap-evidence'],
    log: 'Payroll contractors can change bank details without a second approver.',
    inspect: { label: 'Control gap: payroll changes', detail: 'Payroll contractors can change bank details without a second approver.', category: 'legit', objectives: ['1.1'] },
  },
  {
    id: 'gap-access-log', kind: 'console', x: 7.5, y: 13.5, sprite: 'console', tags: ['gap-evidence'],
    log: 'GAP ANALYSIS finding: privileged reads of archived employee records are not logged or reviewed.',
    inspect: { label: 'Control gap: record access', detail: 'Privileged reads of archived employee records are not logged or reviewed.', category: 'legit', objectives: ['1.1'] },
  },
  {
    id: 'gap-restore', kind: 'console', x: 30.5, y: 13.5, sprite: 'console', tags: ['gap-evidence'],
    log: 'Payroll has no tested process to restore the last known-good service state after a failed deployment.',
    inspect: { label: 'Control gap: service recovery', detail: 'Payroll has no tested process to restore the last known-good service state after a failed deployment.', category: 'legit', objectives: ['1.1'] },
  },
  {
    id: 'vuln-hr', kind: 'workstation', x: 15.5, y: 18.5, sprite: 'workstation',
    tags: ['triage', 'vulnerability-confirmed'],
    inspect: { call: 'auto', label: 'Scan finding HR-01', detail: 'Scanner: vulnerable service present on payroll relay. Service banner and package version match the finding.', category: 'item', objectives: ['4.3'] },
  },
  {
    id: 'vuln-db', kind: 'workstation', x: 23.5, y: 18.5, sprite: 'workstation',
    tags: ['triage', 'vulnerability-confirmed'],
    inspect: { call: 'auto', label: 'Scan finding PAY-02', detail: 'Scanner: vulnerable service present on payroll database. Listener and package version match the finding.', category: 'item', objectives: ['4.3'] },
  },
  {
    id: 'vuln-web', kind: 'workstation', x: 15.5, y: 10.5, sprite: 'workstation',
    tags: ['triage', 'vulnerability-confirmed'],
    inspect: { call: 'auto', label: 'Scan finding HR-03', detail: 'Scanner: vulnerable service present on the HR export host. Listener and package version match the finding.', category: 'item', objectives: ['4.3'] },
  },
  {
    id: 'vuln-api', kind: 'workstation', x: 24.5, y: 10.5, sprite: 'workstation',
    tags: ['triage', 'vulnerability-confirmed'],
    inspect: { call: 'auto', label: 'Scan finding PAY-04', detail: 'Scanner: vulnerable service present on the payroll API host. Listener and package version match the finding.', category: 'item', objectives: ['4.3'] },
  },
  {
    id: 'false-positive-old-service', kind: 'workstation', x: 11.5, y: 14.5, sprite: 'workstation',
    infected: false, tags: ['triage'],
    inspect: { call: 'auto', label: 'Scan finding ARCH-05', detail: 'Service inventory: the flagged legacy file-transfer service is absent; package not installed and no listening socket is present.', category: 'item', objectives: ['4.3'] },
  },
  {
    id: 'false-positive-printer', kind: 'workstation', x: 31.5, y: 5.5, sprite: 'workstation',
    infected: false, tags: ['triage'],
    inspect: { call: 'auto', label: 'Scan finding PRINT-06', detail: 'Service inventory: the flagged database listener is absent; package not installed and no listening socket is present.', category: 'item', objectives: ['4.3'] },
  },
];

const choices: EntityDef[] = [
  { id: 'legacy-compensating', kind: 'console', x: 9.5, y: 20.5, sprite: 'console', group: 'legacy-edr', tags: ['fix-gaps'],
    log: 'Apply COMPENSATING control.', inspect: { label: 'Apply COMPENSATING control', detail: 'Apply COMPENSATING control.', category: 'legit' } },
  { id: 'legacy-preventive', kind: 'console', x: 9.5, y: 21.5, sprite: 'console', group: 'legacy-edr', tags: ['wrong-control'],
    log: 'Apply PREVENTIVE control.', inspect: { label: 'Apply PREVENTIVE control', detail: 'Apply PREVENTIVE control.', category: 'legit' } },
  { id: 'legacy-detective', kind: 'console', x: 9.5, y: 22.5, sprite: 'console', group: 'legacy-edr', tags: ['wrong-control'],
    log: 'Apply DETECTIVE control.', inspect: { label: 'Apply DETECTIVE control', detail: 'Apply DETECTIVE control.', category: 'legit' } },
  { id: 'payroll-preventive', kind: 'console', x: 32.5, y: 20.5, sprite: 'console', group: 'payroll-write', tags: ['fix-gaps'],
    log: 'Apply PREVENTIVE control.', inspect: { label: 'Apply PREVENTIVE control', detail: 'Apply PREVENTIVE control.', category: 'legit' } },
  { id: 'payroll-corrective', kind: 'console', x: 32.5, y: 21.5, sprite: 'console', group: 'payroll-write', tags: ['wrong-control'],
    log: 'Apply CORRECTIVE control.', inspect: { label: 'Apply CORRECTIVE control', detail: 'Apply CORRECTIVE control.', category: 'legit' } },
  { id: 'payroll-compensating', kind: 'console', x: 32.5, y: 22.5, sprite: 'console', group: 'payroll-write', tags: ['wrong-control'],
    log: 'Apply COMPENSATING control.', inspect: { label: 'Apply COMPENSATING control', detail: 'Apply COMPENSATING control.', category: 'legit' } },
  { id: 'access-detective', kind: 'console', x: 9.5, y: 12.5, sprite: 'console', group: 'access-log', tags: ['fix-gaps'],
    log: 'Apply DETECTIVE control.', inspect: { label: 'Apply DETECTIVE control', detail: 'Apply DETECTIVE control.', category: 'legit' } },
  { id: 'access-preventive', kind: 'console', x: 9.5, y: 13.5, sprite: 'console', group: 'access-log', tags: ['wrong-control'],
    log: 'Apply PREVENTIVE control.', inspect: { label: 'Apply PREVENTIVE control', detail: 'Apply PREVENTIVE control.', category: 'legit' } },
  { id: 'access-directive', kind: 'console', x: 9.5, y: 14.5, sprite: 'console', group: 'access-log', tags: ['wrong-control'],
    log: 'Apply DIRECTIVE control.', inspect: { label: 'Apply DIRECTIVE control', detail: 'Apply DIRECTIVE control.', category: 'legit' } },
  { id: 'restore-corrective', kind: 'console', x: 32.5, y: 12.5, sprite: 'console', group: 'restore', tags: ['fix-gaps'],
    log: 'Apply CORRECTIVE control.', inspect: { label: 'Apply CORRECTIVE control', detail: 'Apply CORRECTIVE control.', category: 'legit' } },
  { id: 'restore-compensating', kind: 'console', x: 32.5, y: 13.5, sprite: 'console', group: 'restore', tags: ['wrong-control'],
    log: 'Apply COMPENSATING control.', inspect: { label: 'Apply COMPENSATING control', detail: 'Apply COMPENSATING control.', category: 'legit' } },
  { id: 'restore-detective', kind: 'console', x: 32.5, y: 14.5, sprite: 'console', group: 'restore', tags: ['wrong-control'],
    log: 'Apply DETECTIVE control.', inspect: { label: 'Apply DETECTIVE control', detail: 'Apply DETECTIVE control.', category: 'legit' } },
];

const pickups: EntityDef[] = [
  { id: 'usb-charge-change-a', kind: 'item', x: 7.5, y: 25.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-b', kind: 'item', x: 33.5, y: 20.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 4 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-c', kind: 'item', x: 15.5, y: 6.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-d', kind: 'item', x: 24.5, y: 6.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-e', kind: 'item', x: 17.5, y: 27.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-f', kind: 'item', x: 35.5, y: 25.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-g', kind: 'item', x: 12.5, y: 13.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-h', kind: 'item', x: 27.5, y: 13.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-i', kind: 'item', x: 12.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-j', kind: 'item', x: 27.5, y: 18.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-k', kind: 'item', x: 19.5, y: 11.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-l', kind: 'item', x: 20.5, y: 20.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-m', kind: 'item', x: 21.5, y: 25.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'usb-charge-change-n', kind: 'item', x: 14.5, y: 6.5, sprite: 'charge', grants: { resource: 'usb-charge', amount: 8 },
    inspect: { label: 'Scanner charges', detail: 'Antimalware definitions.', category: 'item' } },
  { id: 'patch-disk-change-a', kind: 'item', x: 13.5, y: 25.5, sprite: 'patch-disk', tags: ['arsenal-pickup'],
    grants: { resource: 'patch-disk', amount: 2 }, inspect: { label: 'Patch disks', detail: 'Signed vendor updates (verify the signature before you install).', category: 'item', objectives: ['2.5'] } },
  { id: 'patch-disk-change-b', kind: 'item', x: 35.5, y: 13.5, sprite: 'patch-disk', tags: ['arsenal-pickup'],
    grants: { resource: 'patch-disk', amount: 2 }, inspect: { label: 'Patch disks', detail: 'Signed vendor updates (verify the signature before you install).', category: 'item', objectives: ['2.5'] } },
  { id: 'medkit-change-a', kind: 'item', x: 6.5, y: 18.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  { id: 'medkit-change-b', kind: 'item', x: 33.5, y: 7.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  { id: 'medkit-change-c', kind: 'item', x: 13.5, y: 11.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  { id: 'medkit-change-d', kind: 'item', x: 20.5, y: 12.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  { id: 'medkit-change-e', kind: 'item', x: 27.5, y: 20.5, sprite: 'medkit', grants: { resource: 'integrity', amount: 25 },
    inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
  {
    id: 'find-edr-change', kind: 'item', x: 34.5, y: 18.5, sprite: 'tool-edr',
    tags: ['arsenal-pickup'], grants: { resource: 'tool:edr', amount: 1 },
    inspect: { label: 'EDR console (found)', detail: 'Endpoint detection and response console with containment.', category: 'item', objectives: ['4.5'] },
  },
  {
    id: 'edr-cell-change-a', kind: 'item', x: 6.5, y: 12.5, sprite: 'edr-cell',
    tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
    inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
  },
  {
    id: 'edr-cell-change-b', kind: 'item', x: 33.5, y: 26.5, sprite: 'edr-cell',
    tags: ['arsenal-pickup'], grants: { resource: 'edr-cell', amount: 1 },
    inspect: { label: 'EDR cell', detail: 'Licence/compute for one EDR containment pulse.', category: 'item', objectives: ['4.5'] },
  },
  {
    id: 'pcap-change-a', kind: 'item', x: 8.5, y: 7.5, sprite: 'pcap',
    tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
    inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
  },
  {
    id: 'pcap-change-b', kind: 'item', x: 31.5, y: 7.5, sprite: 'pcap',
    tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 3 },
    inspect: { label: 'Capture buffer', detail: 'Blank capture storage for the network tap.', category: 'item', objectives: ['3.2'] },
  },
];

const rootkitWave = stagedThreatWave(map, 'rootkit', 'rootkit', [...evidenceAndWork, ...choices, ...pickups], [
  [6, 17, 14, 22],
  [25, 17, 33, 22],
  [3, 10, 17, 15],
  [25, 10, 33, 15],
]);
rootkitWave.push({ ...rootkitWave[0], id: 'rootkit-1-extra', x: 11.5, y: 19.5 });
// Keep spawns/idle points >=3 tiles from the required triage hosts so players
// can inspect and patch findings without being drained mid-task.
const triageSafe: Record<string, [number, number]> = {
  'rootkit-1-2': [8.5, 20.5],
  'rootkit-2-1': [28.5, 19.5],
  'rootkit-2-4': [30.5, 20.5],
  'rootkit-3-3': [8.5, 12.5],
  'rootkit-3-4': [12.5, 13.5],
  'rootkit-3-5': [12.5, 15.5],
  'rootkit-4-1': [30.5, 11.5],
  'rootkit-4-4': [30.5, 14.5],
};
for (const e of rootkitWave) {
  const move = triageSafe[e.id];
  if (move) ({ x: e.x, y: e.y } = { x: move[0], y: move[1] });
}
rootkitWave.push({
  id: 'rootkit-payroll-final',
  kind: 'enemy',
  x: 28.5,
  y: 25.5,
  sprite: 'rootkit',
  ai: 'chase',
  hp: 3,
  infected: true,
  dormant: true,
  tags: ['malware'],
  inspect: {
    label: 'Rootkit process',
    detail: 'Persistence record: service restart and privileged file access recorded.',
    category: 'malware',
  },
});
const waveIds = (wave: number) => rootkitWave
  .filter((enemy) => enemy.id.startsWith(`rootkit-${wave}-`))
  .map((enemy) => enemy.id);

export const m05: Mission = {
  id: 'm05',
  title: 'CHANGE FREEZE',
  difficulty: 5,
  objectives: ['1.3', '1.1', '4.3', '5.1'],
  briefing: 'A critical patch has to land on the payroll server tonight, and the change board meets in ten minutes.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'patch'],
  map,
  entities: [...evidenceAndWork, ...choices, ...pickups, ...rootkitWave],
  missionObjectives: [
    { id: 'docs', text: 'Collect the impact analysis, backout plan and owner approval', kind: 'interact', tag: 'change-doc', count: 3 },
    { id: 'payroll-patch', text: 'Patch payroll after the three change records are collected', kind: 'interact', tag: 'payroll-patch', requires: ['docs'], earlyViolates: 'early-patch' },
    { id: 'early-patch', text: 'Do not patch before the required change records', kind: 'avoid', tag: 'early-patch', strikes: 1 },
    { id: 'fix-gaps', text: 'Apply the correct control type to each gap', kind: 'interact', tag: 'fix-gaps', count: 4 },
    { id: 'wrong-control', text: 'Avoid incorrect control choices', kind: 'avoid', tag: 'wrong-control', strikes: 3 },
    { id: 'confirmed-hosts', text: 'Patch the four confirmed vulnerable hosts', kind: 'patch', tag: 'vulnerability-confirmed', count: 4 },
    { id: 'wrong-call', text: 'Do not patch scan findings without confirming the service', kind: 'avoid', tag: 'wrong-call', strikes: 3 },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  script: {
    par: 240,
    triggers: [
      { id: 'change-ambush-west', area: [6, 17, 14, 22], spawn: waveIds(1), kind: 'bad', message: 'A rootkit persistence record reappeared in the HR service zone.' },
      { id: 'change-ambush-east', area: [25, 17, 33, 22], spawn: waveIds(2), kind: 'bad', message: 'Rootkit activity spread into payroll operations.' },
      { id: 'change-ambush-upper', area: [6, 10, 14, 15], spawn: waveIds(3), kind: 'bad', message: 'A hidden persistence task activated near the scan consoles.' },
      { id: 'change-ambush-northeast', area: [25, 10, 33, 15], spawn: waveIds(4).filter((id) => id !== 'rootkit-4-4' && id !== 'rootkit-4-5'), kind: 'bad', message: 'A scan-wing persistence task activated.' },
      { id: 'change-ambush-northeast-deep', area: [29, 10, 33, 15], spawn: ['rootkit-4-4', 'rootkit-4-5'], kind: 'bad', message: 'More persistence records lit up at the back of the scan wing.' },
      { id: 'change-ambush-final', after: ['payroll-patch'], spawn: ['rootkit-payroll-final'], kind: 'bad', message: 'Rootkit persistence attempted to survive the approved patch.' },
      { id: 'change-backtrack', after: ['fix-gaps'], openDoors: ['change-backtrack'], kind: 'good', message: 'The control gaps are covered: the return route is open.' },
      { id: 'change-queue', after: ['confirmed-hosts'], openDoors: ['change-queue'], kind: 'good', message: 'Confirmed vulnerable hosts are patched: the upper scan wing is open.' },
      { id: 'change-exit', after: ['docs', 'payroll-patch', 'fix-gaps', 'confirmed-hosts'], openDoors: ['change-exit'], kind: 'good', message: 'The change is complete and validated. Exit open.' },
    ],
    secrets: [
      { id: 'change-secret-1', area: [2, 4, 4, 8], label: 'Change archive alcove', grant: { resource: 'patch-disk', amount: 3 } },
      { id: 'change-secret-2', area: [35, 10, 37, 15], label: 'Audit storage nook', grant: { resource: 'usb-charge', amount: 16 } },
      { id: 'change-secret-3', area: [2, 17, 4, 22], label: 'Payroll maintenance store', grant: { resource: 'integrity', amount: 40 } },
    ],
  },
  debriefQuestions: [
    q('q1', ['1.3'], 'An emergency patch goes on the payroll server tonight. Which change-management item lets you restore service if the patch breaks payroll?', 2, [
      ['Impact analysis', 'Impact analysis predicts what the change will affect before you make it. It does not undo anything.'],
      ['Maintenance window', 'The window sets WHEN the change happens to limit disruption, not how to reverse it.'],
      ['Backout plan', 'A backout plan is the documented, tested way to roll back to the last good state if the change fails.'],
      ['Stakeholder approval', 'Approval authorizes the change. It gives you nothing to restore from.'],
    ]),
    q('q2', ['1.1'], 'Policy requires EDR on every server, but a legacy server cannot run the agent. It is moved to an isolated VLAN with extra network monitoring. What type of control is the isolation?', 0, [
      ['Compensating', 'A compensating control is an alternative that meets the intent of a required control that cannot be implemented. Here, isolation stands in for EDR.'],
      ['Corrective', 'Corrective controls fix or restore after an incident, like restoring from backup. Nothing has happened yet.'],
      ['Deterrent', 'Deterrents discourage attempts, like warning signs. Isolation actually limits what an attacker can reach.'],
      ['Directive', 'Directive controls tell people what to do, like a policy. This is a technical substitute for a missing control.'],
    ]),
    q('q3', ['1.1'], 'A sign at the data-center fence reads "Area under 24/7 video surveillance." What is the sign’s PRIMARY control type?', 3, [
      ['Detective', 'The cameras record and so detect. The sign itself records nothing.'],
      ['Preventive', 'A preventive control physically or technically stops the act, like a locked door. A sign stops no one.'],
      ['Compensating', 'Nothing is being substituted for an unavailable control.'],
      ['Deterrent', 'The sign works by discouraging intruders with the threat of being seen. That is deterrence.'],
    ]),
    q('q4', ['4.3'], 'A scan flags a critical CVE on 40 servers. You confirm that 12 of them do not run the vulnerable service at all. What are those 12, and what is next?', 1, [
      ['False negatives; rescan with stronger settings', 'A false negative is a real vulnerability the scanner MISSED. These are the opposite.'],
      ['False positives; document them, remediate the other 28 by CVSS and exposure, then rescan to validate', 'Reported but not real = false positive. Confirmed findings get prioritized and fixed, and a rescan validates the remediation.'],
      ['True positives; patch all 40 tonight', 'Patching hosts that are not affected wastes the change window and adds risk for no benefit.'],
      ['Accept the risk on all 40 until the next quarter', 'The 28 confirmed hosts carry a critical vulnerability. Accepting that needs a formal risk decision, not a default.'],
    ]),
    q('q5', ['5.1'], '"All user passwords must be at least 14 characters." In the governance hierarchy, this statement is a:', 0, [
      ['Standard', 'Standards are mandatory, specific, measurable requirements that support a policy. SY0-701 lists password standards explicitly.'],
      ['Policy', 'A policy states high-level intent ("we protect accounts with strong authentication"), not exact numbers.'],
      ['Procedure', 'A procedure is step-by-step instructions, such as how to reset a password.'],
      ['Guideline', 'Guidelines are recommendations, and "must" makes this mandatory.'],
    ]),
      q('q6', ['1.1'], 'A security patch sits undeployed for weeks because nobody told the security team the outage window existed. Which control category does adding a mandatory security review to the change process belong to?', 1, [
      ['Technical control', 'Technical controls enforce with technology - firewalls, encryption, ACLs. A required review step is a management process, not a mechanism.'],
      ['Managerial control', 'Correct. Policies and procedures that steer how people and processes behave - like a required security sign-off in change management - are managerial controls.'],
      ['Physical control', 'Physical controls protect facilities and hardware - guards, locks, lighting. A process step has no physical element.'],
      ['Compensating control', 'Compensating is a control TYPE (an alternative when the primary control is not feasible), not a category. The question asks category.'],
    ]),
    q('q7', ['1.3'], 'The board adopts a rule: \'Every production change requires a written rollback plan and two sign-offs.\' This document is a:', 3, [
      ['Procedure', 'A procedure is the step-by-step how-to. The quote states a required rule, not the numbered steps for doing it.'],
      ['Standard', 'A standard mandates a specific technology or method - \'TLS 1.3 only.\' This sets a requirement on the process itself.'],
      ['Guideline', 'Guidelines are suggestions you may adapt. Mandatory language and board adoption make this binding, not advisory.'],
      ['Policy', 'Correct. A policy is a mandatory, high-level rule from leadership stating what must be done - the rollback-plan and sign-off requirements are exactly that.'],
    ]),
    q('q8', ['1.3'], 'A document reads: \'Step 1: snapshot the VM. Step 2: apply the patch. Step 3: run the smoke test. Step 4: update the change record.\' This is a:', 0, [
      ['Procedure', 'Correct. Ordered, repeatable steps for performing a task are the definition of a standard operating procedure.'],
      ['Policy', 'A policy states what must be true (\'all patches tested before deploy\'), not the numbered clicks to get there.'],
      ['Framework', 'A framework is an external body of guidance like NIST CSF - not an internal step list.'],
      ['Playbook condition', 'Playbooks govern incident response sequences; a routine patch recipe is a procedure, not a response playbook.'],
    ]),
    q('q9', ['5.1'], 'Legal classifies payroll data as confidential. In governance terms, the data steward is the person who:', 2, [
      ['Is legally accountable for the data set', 'That is the data OWNER - accountability sits with the owner, stewardship with day-to-day handling.'],
      ['Processes the data on the controller\'s instructions', 'That describes a processor under privacy law, not a steward.'],
      ['Carries out classification, labeling and handling rules day to day', 'Correct. Stewards implement the owner\'s decisions: applying classifications, enforcing handling, managing access requests.'],
      ['Audits the program on behalf of the board', 'That is the audit committee\'s job, not the steward\'s.'],
    ]),
  ],

};

export const m05Teach: MissionTeaching = {
  tagline: 'Prepare the change, match gaps to controls, confirm findings, then patch payroll.',
  situation: 'A critical payroll patch must be installed tonight before the change board meets.',
  orders: [
    { text: 'Collect impact analysis, backout plan, and owner approval first.', objective: '1.3' },
    { text: 'Read each gap and apply its matching control type.', objective: '1.1' },
    { text: 'Confirm service presence, then patch the vulnerable hosts.', objective: '4.3' },
  ],
  keyTerms: ['false positive', 'endpoint protection', 'patching', 'backups'],
  lessons: {
    docs: { objective: '1.3', done: 'The impact analysis, backout plan, and owner approval were collected.', missed: 'Collect all three change records before patching.' },
    'payroll-patch': { objective: '1.3', done: 'Payroll was patched after the required change records were collected.', missed: 'The patch requires the impact analysis, backout plan, and owner approval.' },
    'early-patch': { objective: '1.3', done: 'The patch was not started prematurely.', missed: 'Patching without the required change records reverts the server and fails the mission.' },
    'fix-gaps': { objective: '1.1', done: 'Each control gap received its matching control type.', missed: 'Match the raw gap to preventive, detective, corrective, or compensating control.' },
    'wrong-control': { objective: '1.1', done: 'No incorrect control options were applied.', missed: 'A control must address the specific gap described by the terminal.' },
    'confirmed-hosts': { objective: '4.3', done: 'Confirmed vulnerable hosts were patched.', missed: 'Confirm the service is present; patch confirmed findings.' },
    'wrong-call': { objective: '4.3', done: 'No false-positive scan results were patched.', missed: 'The service inventory showed that some flagged services were absent.' },
    exit: { objective: '1.3', done: 'The approved change was completed before exit.', missed: 'Complete the change and required validation before exiting.' },
  },
  examTip: 'A backout plan restores the last good state; reported-but-absent services are false positives, while standards are mandatory, specific, measurable requirements.\nFIELD NOTES: control categories are technical, managerial, operational control and physical; types are preventive, deterrent, detective, corrective, compensating and directive. Change-management vocabulary: ownership and stakeholder sign-off, dependencies mapped, test results attached, downtime and the maintenance window, service restart and application restart order, restricted activities during the window, version control tags, updating diagrams, and special handling for a legacy application. Risk terms that show up here: compensating controls, exception, exemption and risk tolerance. Governance stack: the information security policy sets intent, standards mandate it (password, access control standards, physical security standards, encryption standards), procedures cover onboarding and offboarding, and business continuity plus disaster recovery sit beside the software development lifecycle - all bound by regulatory obligations.'
};

export const m05Walkthrough: WalkStep[] = [
  { goto: [8, 25] },
  { interact: 'impact-analysis' },
  { goto: [30, 25] },
  { interact: 'backout-plan' },
  { goto: [20, 24] },
  { badge: [20, 23] },
  { goto: [12, 20] },
  { interact: 'owner-approval' },
  { goto: [26, 25] },
  { interact: 'payroll-patch' },
  { goto: [7, 21] },
  { interact: 'gap-legacy-edr' },
  { goto: [9, 20] },
  { interact: 'legacy-compensating' },
  { goto: [30, 21] },
  { interact: 'gap-payroll-write' },
  { goto: [32, 20] },
  { interact: 'payroll-preventive' },
  { goto: [15, 18] },
  { inspect: 'vuln-hr' },
  { call: 'vuln-hr' },
  { patch: 'vuln-hr' },
  { goto: [23, 18] },
  { inspect: 'vuln-db' },
  { call: 'vuln-db' },
  { patch: 'vuln-db' },
  { goto: [20, 17] },
  { badge: [20, 16] },
  { goto: [7, 13] },
  { interact: 'gap-access-log' },
  { goto: [9, 12] },
  { interact: 'access-detective' },
  { goto: [30, 13] },
  { interact: 'gap-restore' },
  { goto: [32, 12] },
  { interact: 'restore-corrective' },
  { goto: [15, 11] },
  { inspect: 'vuln-web' },
  { call: 'vuln-web' },
  { patch: 'vuln-web' },
  { goto: [24, 11] },
  { inspect: 'vuln-api' },
  { call: 'vuln-api' },
  { patch: 'vuln-api' },
  { wait: 0.1 },
  { goto: [20, 10] },
  { goto: [20, 8] },
  { wait: 0.1 },
  { goto: [20, 1] },
];

// F1: encounter pacing — worms loose on unpatched hosts in the lobby,
// a north-office reveal, and a supply top-up for the extra pressure.
liveThreats(m05, 'open-worm', 'worm', 2, [18, 24, 38, 27]);
addThreatEncounter(m05, 'north-worm', 'worm', 2, {
  id: 'north-ambush', area: [2, 4, 37, 8], kind: 'bad',
  message: 'Worms are still spreading on the unpatched floor — freeze window or not.',
}, [2, 4, 37, 8]);
addThreatEncounter(m05, 'mid-rat', 'rat', 1, {
  id: 'mid-ambush', area: [6, 10, 38, 15], kind: 'bad',
  message: 'A RAT session lights up on a host mid-freeze.',
}, [6, 10, 38, 15]);
m05.entities.push(
  { id: 'chg-lobby', kind: 'item', ...floorSpot(m05, [10, 24, 38, 27]), sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 }, inspect: { label: 'Scan sessions', detail: 'Boot-and-quarantine sessions for the USB scanner.', category: 'item' } },
  { id: 'med-north', kind: 'item', ...floorSpot(m05, [2, 4, 37, 8]), sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 }, inspect: { label: 'Integrity kit', detail: 'Restores 25 integrity.', category: 'item' } },
);

// — rF2 landmarks: change-ops hall (centre) = bright grid floor; upper scan
// wing + side stores = dim rust maintenance corridors; payroll vault (south
// centre SSS) keeps its rack walls and gets a board.
m05.map.legend[','] = { kind: 'floor', tex: 'floor-grid' };
m05.map.legend[';'] = { kind: 'floor', tex: 'floor-rust' };
retex(m05, [6, 9, 35, 22], 'floor', ',');
retex(m05, [30, 4, 39, 23], 'floor', ';');
retex(m05, [2, 4, 6, 23], 'floor', ';');
m05.map.lights = { ...m05.map.lights, ...lightRects([[30, 4, 39, 22, 0.5], [2, 4, 6, 22, 0.55], [14, 24, 18, 26, 0.9]]) };
m05.entities.push(
  { id: 'vault-board', kind: 'prop', x: 19.5, y: 25.5, sprite: 'console' },
  { id: 'arch-disk', kind: 'item', x: 3.5, y: 6.5, sprite: 'patch-disk', tags: ['arsenal-pickup'],
    grants: { resource: 'patch-disk', amount: 5 } },
  { id: 'audit-cache', kind: 'item', x: 36.5, y: 12.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'store-med', kind: 'item', x: 3.5, y: 19.5, sprite: 'medkit',
    grants: { resource: 'integrity', amount: 25 } },
);

// rF4: 48x30 silhouette — octagonal change-control hub with N/S spokes and two
// end caps; a locked loop door opens after hosts are confirmed, and two secret
// control-room closets sit off the spokes.
m05.map.legend.T = { kind: 'door', tex: 'door', doorId: 'rf4-hub' };
m05.map.legend.U = { kind: 'door', tex: 'door', doorId: 'rf4-hub-loop', locked: true,
  lockText: 'The south loop unlocks once every confirmed host is patched.' };
m05.map.legend['4'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-hub-cache-n' };
m05.map.legend['5'] = { kind: 'door', tex: 'wall-secret', secret: true, doorId: 'rf4-hub-cache-s' };
m05.entities.push(
  { id: 'rf4-hub-cache-n-item', kind: 'item', x: 40.5, y: 7.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-hub-cache-s-item', kind: 'item', x: 40.5, y: 23.5, sprite: 'medkit' },
  { id: 'rf4-hub-prop', kind: 'prop', x: 43.5, y: 14.5, sprite: 'console' },
  { id: 'rf4-hub-supply', kind: 'item', x: 44.5, y: 27.5, sprite: 'charge', tags: ['arsenal-pickup'],
    grants: { resource: 'usb-charge', amount: 8 } },
);
m05.script!.secrets!.push(
  { id: 'rf4-hub-cache-n', area: [40, 6, 41, 8], label: 'Freeze-window locker', grant: { resource: 'usb-charge', amount: 8 } },
  { id: 'rf4-hub-cache-s', area: [40, 22, 41, 24], label: 'Rollback kit cage', grant: { resource: 'integrity', amount: 20 } },
);
mixedThreatEncounter(m05, 'hub-mix', [['rootkit', 1], ['rat', 2]],
  { id: 'hub-ambush', area: [39, 14, 46, 18], kind: 'bad',
    message: 'Unchecked change bred rootkits under the review hub — rats swarm with them.' },
  [40, 10, 46, 18]);
addThreatEncounter(m05, 'spoke-worms', 'worm', 2,
  { id: 'spoke-ambush', area: [43, 19, 44, 25], kind: 'bad',
    message: 'Worm processes churn through the south spoke.' },
  [41, 26, 45, 27]);
m05.script!.triggers!.push({ id: 'hub-loop-open', after: ['confirmed-hosts'], kind: 'good',
  message: 'All confirmed hosts patched — the south loop door releases for a clean return.',
  openDoors: ['rf4-hub-loop'] });
m05.map.lights = { ...m05.map.lights, ...lightRects([[40, 10, 46, 18, 0.65], [42, 3, 45, 9, 0.55], [41, 19, 45, 27, 0.55], [40, 6, 41, 8, 0.85], [40, 22, 41, 24, 0.85], [41, 7, 41, 7, 0.35], [41, 23, 41, 23, 0.35]]) };
