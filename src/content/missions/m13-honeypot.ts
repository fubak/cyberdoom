import type { Mission } from '../../core/types';
import type { MissionTeaching } from '../curriculum';
import { lightRects } from '../../missions/levelkit';
import { CHEATS } from '../../eggs/cheats';

/**
 * EGGS — M13 "HONEYPOT": the hidden bonus mission (our E1M9). Reached only
 * through the secret exit pad in m04 (or a deep link), it is deliberately NOT
 * registered in missionRegistry — see bonusMissions in ./index.ts.
 *
 * Layout, three north rooms off one south corridor:
 *   west  x1-8   the lure: a rack-texture door, free loot in the open, a decoy
 *                console — walking deep trips a dormant malware ambush (the
 *                room is the lesson: it is a trap AND a tripwire).
 *   mid   x10-13 the lab bench: ticket-wall (DNS) and capture-player consoles.
 *   east  x19-20 the monitor nook: the honeypot's tripwire feed.
 *   dev   x15-17 the dev room behind a wall-secret door: credits mural
 *                (wall-devs), the build-notes console (cheat manual) and
 *                Bobby T., the intern who sanitizes his inputs.
 */
export const m13: Mission = {
  id: 'm13',
  title: 'HONEYPOT',
  difficulty: 4,
  objectives: ['1.2'],
  briefing:
    'The link was too easy, and now you are standing inside the lure. ' +
    'This annex is a honeypot: a decoy wired to watch anyone greedy enough to touch it. ' +
    'Scout the decoy systems, learn what defenders gain from a trap, and get out. ' +
    'And if the walls look like they are keeping secrets — walls do that here.',
  authorizedRoles: ['analyst'],
  loadout: ['keyboard', 'mouse', 'usb', 'badge', 'mfa', 'tap', 'patch', 'edr'],
  map: {
    grid: [
      '######################',
      '#........#....#DDD#..#',
      '#..H.....#....#...#..#',
      '#........#....#...#..#',
      '###h#######p####d##..#',
      '#....................#',
      '#....................#',
      '#..........E.........#',
      '######################',
    ],
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      '.': { kind: 'floor', tex: 'floor' },
      'H': { kind: 'wall', tex: 'wall-server' },
      'D': { kind: 'wall', tex: 'wall-devs' },
      'E': { kind: 'exit', tex: 'exit' },
      'h': { kind: 'door', tex: 'wall-server', doorId: 'pot-door' },
      'p': { kind: 'door', tex: 'door', doorId: 'lab-door' },
      'd': { kind: 'door', tex: 'wall-secret', doorId: 'dev-door', secret: true },
    },
    defaultLight: 0.55,
    lights: lightRects([
      [1, 1, 8, 3, 0.75],
      [10, 1, 13, 3, 0.65],
      [15, 2, 17, 3, 0.9],
      [19, 1, 20, 3, 0.7],
      [1, 5, 20, 7, 0.55],
      [11, 7, 11, 7, 1.0],
    ]),
    spawn: { x: 11.5, y: 6.5, angle: -Math.PI / 2 },
  },
  entities: [
    // The lure — a console posing as an open server. Inspecting it names the
    // decoy; touching the free loot trips the ambush.
    {
      id: 'honeypot-srv', kind: 'console', x: 4.5, y: 2.5, sprite: 'console',
      tags: ['decoy'], egg: 'honeypot',
      inspect: {
        label: 'Decoy server rack',
        detail:
          'This "server" is a honeypot — a decoy with no legitimate users, so every ' +
          'packet it sees is hostile by definition. High-fidelity alerts, zero noise.',
        category: 'item',
      },
      log:
        'HONEYPOT-NET-01 > session log\n' +
        'attacker probed /etc/passwd ... logged\n' +
        'attacker downloaded payroll.xlsx.honeyfile ... ALERT FIRED\n' +
        'note: every touch here is an incident by definition.',
    },
    // The tripwire feed — the defender's side of the deception.
    {
      id: 'overwatch', kind: 'console', x: 19.5, y: 2.5, sprite: 'console',
      tags: ['decoy'], egg: 'monitor',
      inspect: {
        label: 'Tripwire feed',
        detail:
          'Deception tech earns its keep here: the decoy wastes attacker time while ' +
          'this feed turns every probe into a high-confidence alert.',
        category: 'item',
      },
      log:
        'TRIPWIRE FEED > live\n' +
        '12:04 honeypot-srv: port sweep, confidence HIGH\n' +
        '12:06 honeypot-srv: honeyfile opened, confidence CERTAIN\n' +
        'verdict: never ignore a honeypot alert — nobody innocent trips it.',
    },
    // Lab bench: the office legend.
    {
      id: 'dns-console', kind: 'console', x: 10.5, y: 3.5, sprite: 'console',
      egg: 'dns',
      inspect: {
        label: 'Ticket wall of shame',
        detail: 'A shrine to the first rule of incident triage.',
        category: 'item',
      },
      log:
        'TICKET WALL > resolved this week\n' +
        '#4471 "internet is down" — DNS\n' +
        '#4472 "app is broken" — DNS\n' +
        '#4473 "email is gone" — DNS\n' +
        '#4474 "it is NOT dns" — it was DNS.\n' +
        'It is always DNS.',
    },
    // The rickroll packet capture.
    {
      id: 'rickroll-console', kind: 'console', x: 12.5, y: 3.5, sprite: 'console',
      egg: 'rickroll',
      inspect: {
        label: 'Capture player',
        detail: 'A suspicious .pcap someone flagged for review.',
        category: 'item',
      },
      log:
        'exfil-suspect.pcap > replay\n' +
        'frame 1-4: TLS handshake, looks like exfil...\n' +
        'frame 5-999: an audio stream. It is a music video.\n' +
        'The payload was never gonna give you up.\n' +
        'Lesson: verify the payload before you report the channel.',
    },
    // The dev room.
    {
      id: 'build-notes', kind: 'console', x: 15.5, y: 3.5, sprite: 'console',
      egg: 'manual',
      inspect: {
        label: 'Build notes',
        detail: 'The field manual every operator swears is classified.',
        category: 'item',
      },
      log:
        'BUILD NOTES > undocumented backdoors\n' +
        CHEATS.map((c) => `${c.doc}`).join('\n') +
        '\nTyping any code during a mission marks the run UNSCORED.\n' +
        'The title screen also answers to a very old cheat. It involves arrows.',
    },
    {
      id: 'bobby', kind: 'npc', x: 16.5, y: 2.5, sprite: 'npc-m',
      egg: 'bobby',
      inspect: {
        label: 'Bobby T., intern',
        detail:
          'Intern. Named his tables carefully and sanitizes every input twice. ' +
          'His mother says hi.',
        category: 'person',
      },
    },
    // Bait loot: lying suspiciously in the open next to the decoy rack.
    { id: 'bait-charge', kind: 'item', x: 6.5, y: 1.5, sprite: 'charge',
      tags: ['arsenal-pickup'], grants: { resource: 'usb-charge', amount: 8 } },
    { id: 'bait-medkit', kind: 'item', x: 2.5, y: 1.5, sprite: 'medkit',
      tags: ['arsenal-pickup'], grants: { resource: 'integrity', amount: 40 } },
    { id: 'bait-pcap', kind: 'item', x: 7.5, y: 1.5, sprite: 'pcap',
      tags: ['arsenal-pickup'], grants: { resource: 'pcap', amount: 4 } },
    // The ambush sleeping in the lure room.
    { id: 'lure-rat-1', kind: 'enemy', x: 2.5, y: 3.5, sprite: 'rat', threat: 'rat', dormant: true },
    { id: 'lure-rat-2', kind: 'enemy', x: 6.5, y: 3.5, sprite: 'rat', threat: 'rat', dormant: true },
    { id: 'lure-worm', kind: 'enemy', x: 5.5, y: 3.5, sprite: 'worm', threat: 'worm', dormant: true },
  ],
  missionObjectives: [
    { id: 'scout', text: 'Identify the decoy systems', kind: 'inspect', tag: 'decoy', count: 2 },
    { id: 'exit', text: 'Reach the exit', kind: 'reach-exit' },
  ],
  debriefQuestions: [],
  script: {
    par: 90,
    triggers: [
      {
        id: 'lure-tripped', area: [5, 1, 8, 3], kind: 'bad',
        message: 'The free rack was bait — dormant malware floods the room!',
        spawn: ['lure-rat-1', 'lure-rat-2', 'lure-worm'],
      },
    ],
    secrets: [
      { id: 'dev-room', area: [15, 2, 17, 3], label: 'The dev room', grant: { resource: 'integrity', amount: 30 } },
    ],
    eggs: [
      { id: 'honeypot', label: 'The decoy rack' },
      { id: 'monitor', label: 'The tripwire feed' },
      { id: 'dns', label: 'The ticket wall' },
      { id: 'rickroll', label: 'A suspicious capture' },
      { id: 'manual', label: 'The build notes' },
      { id: 'bobby', label: 'Bobby T., intern' },
    ],
  },
};

export const m13Teach: MissionTeaching = {
  tagline: 'A hidden annex that teaches why defenders build decoys.',
  situation:
    'You followed a link that was too easy and landed inside a deception zone. ' +
    'Everything here is a decoy watching whoever touches it.',
  orders: [
    { text: 'Inspect the decoy systems', objective: '1.2' },
    { text: 'Reach the exit', objective: '1.2' },
  ],
  keyTerms: ['honeypot', 'honeynet', 'honeytoken'],
  lessons: {
    scout: {
      objective: '1.2',
      done: 'You spotted the deception tech: a honeypot is a decoy whose every alert is real, because nobody legitimate ever touches it.',
      missed: 'The decoy was the point — a honeypot diverts attackers and turns every probe into a high-confidence alert.',
    },
    exit: {
      objective: '1.2',
      done: 'You got out of the lure — and left the decoy doing its job for whoever comes next.',
      missed: 'You left before identifying the trap: the whole room was the detection system.',
    },
  },
  examTip:
    'Honeypot, honeyfile, honeytoken: decoys with no legitimate use, so any access is a reliable alert. Deception is an early-warning AND a diversion control.',
};
