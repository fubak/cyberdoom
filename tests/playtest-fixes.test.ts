import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import type { Mission } from '../src/core/types';
import { WorldMap } from '../src/engine/map';
import { updateEntities } from '../src/engine/ai';
import { MissionRuntime } from '../src/missions/runtime';
import { mfaPending } from '../src/tools/badge';
import { STATS_Y, DB_H, DB_W, statsLine, statsSegments } from '../src/ui/debrief-layout';
import { presentSize } from '../src/ui/present';
import { measureText } from '../src/render/font';
import { Arsenal } from '../src/tools/arsenal';
import { toolRegistry } from '../src/tools';

const doorMap = {
  grid: [
    '#######',
    '#.....#',
    '#.d.m.#',
    '#.....#',
    '#...q.#',
    '#######',
  ],
  legend: {
    '#': { kind: 'wall' as const, tex: 'wall' },
    '.': { kind: 'floor' as const, tex: 'floor' },
    d: { kind: 'door' as const, tex: 'door', doorId: 'netops-door', accessRole: 'netops' },
    m: { kind: 'door' as const, tex: 'door', doorId: 'mfa-door', accessRole: 'analyst', mfa: true },
    q: { kind: 'door' as const, tex: 'door', doorId: 'plain-door' },
  },
  spawn: { x: 1.5, y: 2.5, angle: 0 },
};

function mission(overrides: Partial<Mission> & Pick<Mission, 'missionObjectives'>): Mission {
  return {
    id: 'test',
    title: 'TEST',
    difficulty: 1,
    objectives: [],
    briefing: '',
    map: doorMap,
    entities: [],
    debriefQuestions: [],
    authorizedRoles: ['analyst'],
    ...overrides,
  };
}

function setup(m: Mission, bus = new EventBus()) {
  const messages: { text: string; kind?: string }[] = [];
  bus.on('message', (message) => messages.push(message));
  const rt = new MissionRuntime(m, bus);
  const map = new WorldMap(m.map);
  const player = { x: 1.5, y: 2.5, angle: 0, integrity: 100 };
  return { bus, messages, rt, map, player };
}

function pressUse(
  s: ReturnType<typeof setup>,
  opts: { hasBadge?: boolean; hasToken?: boolean; flashes?: string[] } = {},
) {
  s.rt.update(0.05, {
    player: s.player,
    map: s.map,
    use: true,
    openDoor: () => {},
    hasBadge: opts.hasBadge ?? true,
    hasToken: opts.hasToken ?? false,
    flashTool: (toolId) => opts.flashes?.push(toolId),
  });
}

describe('E at access-controlled doors', () => {
  it('out-of-role reader warns first, then logs exactly one violation on a repeat swipe', () => {
    const s = setup(mission({ missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }] }));
    const scoreBefore = s.rt.score;
    const flashes: string[] = [];
    pressUse(s, { flashes }); // facing 'd' door at (3,2): accessRole netops
    expect(s.messages.at(-1)!.text).toBe(
      'Badge reader: NETOPS only. Your roles: ANALYST. Press E again to swipe anyway (logged as a violation).',
    );
    expect(s.rt.score).toBe(scoreBefore);
    pressUse(s, { flashes });
    expect(s.rt.scoreLog.filter((e) => e.text.startsWith('Least-privilege violation'))).toHaveLength(1);
    expect(s.rt.score).toBe(scoreBefore - 30);
    expect(flashes).toEqual(['badge']);
  });

  it('badge and token open an authorized MFA door in one E press', () => {
    const m = mission({ missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }] });
    m.map = { ...m.map, legend: { ...m.map.legend } };
    const s = setup(m);
    let badgeDoor: { doorId: string; allowed: boolean } | null = null;
    s.bus.on('badge-door', (p) => { badgeDoor = p; });
    s.player.x = 4.5; // face 'm' MFA door at (5,2) — analyst authorized
    const flashes: string[] = [];
    pressUse(s, { hasToken: true, flashes });
    expect(s.messages.some((message) => message.text ===
      'MFA PASSED: badge (have) + fingerprint on the token (are). Door released.',
    )).toBe(true);
    expect(mfaPending(s.rt.entities).has('mfa-door')).toBe(false);
    expect(badgeDoor).toMatchObject({ doorId: 'mfa-door', accessRole: 'analyst', allowed: true });
    expect(flashes).toEqual(['badge', 'mfa']);
  });

  it('badge without a token cannot open an MFA door', () => {
    const s = setup(mission({ missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }] }));
    let badgeDoor: { doorId: string; allowed: boolean } | null = null;
    s.bus.on('badge-door', (p) => { badgeDoor = p; });
    s.player.x = 4.5;
    pressUse(s);
    expect(s.messages.at(-1)!.text).toBe('This door enforces MFA and you have no enrolled token.');
    expect(mfaPending(s.rt.entities).has('mfa-door')).toBe(true);
    expect(badgeDoor).toBeNull();
  });

  it('authorized role without a badge is told why the reader stays shut', () => {
    const m = mission({ missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }] });
    (m.map.legend.d as { accessRole?: string }).accessRole = 'analyst';
    const s = setup(m);
    pressUse(s, { hasBadge: false });
    expect(s.messages.at(-1)!.text).toBe('Badge reader: ANALYST only. You have no badge.');
  });

  it('authorized non-mfa door: swipe emits badge-door allowed', () => {
    const s = setup(mission({ missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }] }));
    const m = s.rt.mission;
    // retarget 'd' to analyst so the swipe is authorized
    (m.map.legend.d as { accessRole?: string }).accessRole = 'analyst';
    let badgeDoor: { doorId: string; allowed: boolean } | null = null;
    s.bus.on('badge-door', (p) => { badgeDoor = p; });
    pressUse(s);
    expect(badgeDoor).not.toBeNull();
    expect((badgeDoor as unknown as { allowed: boolean }).allowed).toBe(true);
    expect((badgeDoor as unknown as { doorId: string }).doorId).toBe('netops-door');
  });

  it('authorized badge doors open with every selectable tool current', () => {
    const ids = toolRegistry.all().map((tool) => tool.id);
    for (const tool of toolRegistry.all().filter((candidate) => !candidate.passive)) {
      const bus = new EventBus();
      const m = mission({ missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }] });
      (m.map.legend.d as { accessRole?: string }).accessRole = 'analyst';
      const s = setup(m, bus);
      const arsenal = new Arsenal(bus);
      arsenal.reset({ difficulty: 9, loadout: ids }, 'male');
      if (arsenal.current.id !== tool.id) expect(arsenal.select(tool.slot)).toBe(true);
      for (let i = 0; i < 40; i++) arsenal.update(1 / 60, false, false, () => {
        throw new Error('tool context should not be used while switching');
      });
      expect(arsenal.current.id).toBe(tool.id);

      let allowed = false;
      bus.on('badge-door', ({ allowed: result }) => { allowed = result; });
      pressUse(s, { hasBadge: arsenal.owns('badge') });
      expect(allowed).toBe(true);
    }
  });
});

describe('passive MFA refusal on E', () => {
  it('refuses phishing prompts automatically and leaves shared-account E behavior alone', () => {
    const m = mission({
      entities: [
        {
          id: 'phish', kind: 'npc', x: 2, y: 2, sprite: 'npc-m',
          tags: ['phish-prompt'], inspect: { label: 'Look-alike sign-in', detail: '', category: 'phishing' },
        },
        {
          id: 'shared', kind: 'npc', x: 3, y: 2, sprite: 'npc-m', reportable: true,
          tags: ['shared-account'], inspect: { label: 'Shared operator account', detail: '', category: 'suspicious' },
        },
      ],
      missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }],
    });
    const s = setup(m);
    const mfaHits: boolean[] = [];
    s.bus.on('tool-hit', ({ toolId, good }) => {
      if (toolId === 'mfa') mfaHits.push(good);
    });
    s.rt.update(0.05, {
      player: s.player,
      map: s.map,
      use: false,
      openDoor: () => {},
      hasToken: true,
    });

    s.bus.emit('interact', { entityId: 'phish' });
    expect(s.rt.byId('phish')?.state.mfaRefused).toBe(true);
    expect(s.messages.some((message) => message.text.startsWith('KEY REFUSED:'))).toBe(true);
    s.bus.emit('interact', { entityId: 'shared' });
    expect(s.rt.byId('shared')?.state.mfaRefused).toBeUndefined();
    expect(mfaHits).toEqual([false]);
    expect(s.messages.at(-1)!.text).toMatch(/corrobor/i);
  });
});

describe('triage decisions', () => {
  const triageMission = () => mission({
    entities: [
      { id: 'mail-bad', kind: 'workstation', x: 2, y: 2, sprite: 'workstation-infected', infected: true, tags: ['triage'], inspect: { label: 'Phish', detail: '', category: 'malware' } },
      { id: 'mail-clean', kind: 'workstation', x: 3, y: 2, sprite: 'workstation', tags: ['triage'], inspect: { label: 'Legit mail', detail: '', category: 'legit' } },
    ],
    missionObjectives: [
      { id: 'wrong-call', text: 'Avoid incorrect calls', kind: 'avoid', tag: 'wrong-call', strikes: 3 },
      { id: 'exit', text: 'Exit', kind: 'reach-exit' },
    ],
  });
  const wrongCall = (rt: MissionRuntime) => rt.objectives.find((o) => o.def.id === 'wrong-call')!;

  it('uninspected triage interact warns instead of striking', () => {
    const s = setup(triageMission());
    s.bus.emit('interact', { entityId: 'mail-bad' });
    expect(s.messages.at(-1)!.text).toContain('Read the evidence first: inspect Phish with MOUSE [2]');
    expect(wrongCall(s.rt).violations).toBe(0);
    expect(s.rt.finished).toBeNull();
  });

  it('uninspected triage scan-miss warns instead of striking', () => {
    const s = setup(triageMission());
    s.bus.emit('scan-miss', { entityId: 'mail-clean' });
    expect(s.messages.at(-1)!.text).toContain('MOUSE [2]');
    expect(wrongCall(s.rt).violations).toBe(0);
  });

  it('after inspection a wrong call strikes once — repeats do not stack', () => {
    const s = setup(triageMission());
    s.bus.emit('inspect', { entityId: 'mail-bad' });
    s.bus.emit('interact', { entityId: 'mail-bad' });
    s.bus.emit('interact', { entityId: 'mail-bad' });
    s.bus.emit('interact', { entityId: 'mail-bad' });
    expect(wrongCall(s.rt).violations).toBe(1);
    expect(s.rt.finished).toBeNull();
  });

  it('distinct entities each contribute one strike', () => {
    const s = setup(triageMission());
    s.bus.emit('inspect', { entityId: 'mail-bad' });
    s.bus.emit('inspect', { entityId: 'mail-clean' });
    s.bus.emit('interact', { entityId: 'mail-bad' });
    s.bus.emit('scan-miss', { entityId: 'mail-clean' });
    expect(wrongCall(s.rt).violations).toBe(2);
  });
});

describe('earlyViolates grace', () => {
  const patchMission = () => mission({
    entities: [
      { id: 'patch-console', kind: 'console', x: 2, y: 2, sprite: 'console', tags: ['payroll-patch'], inspect: { label: 'Patch console', detail: '', category: 'legit' } },
    ],
    missionObjectives: [
      { id: 'docs', text: 'Collect the three change records', kind: 'interact', tag: 'change-doc', count: 1 },
      { id: 'patch', text: 'Patch payroll', kind: 'interact', tag: 'payroll-patch', requires: ['docs'], earlyViolates: 'early-patch' },
      { id: 'early-patch', text: 'Do not patch before records', kind: 'avoid', tag: 'early-patch', strikes: 1 },
      { id: 'exit', text: 'Exit', kind: 'reach-exit' },
    ],
  });

  it('first premature attempt warns, does not violate', () => {
    const s = setup(patchMission());
    s.bus.emit('interact', { entityId: 'patch-console' });
    expect(s.messages.at(-1)!.text).toContain('CHANGE NOT APPROVED');
    expect(s.rt.finished).toBeNull();
    expect(s.rt.scoreLog.every((e) => !/violation/i.test(e.text))).toBe(true);
  });

  it('second attempt within 4 s triggers the violation', () => {
    const s = setup(patchMission());
    s.bus.emit('interact', { entityId: 'patch-console' });
    s.rt.update(1, { player: s.player, map: s.map, use: false, openDoor: () => {} });
    s.bus.emit('interact', { entityId: 'patch-console' });
    expect(s.rt.finished).toBe('lost');
  });

  it('attempts 5 s apart are warnings only', () => {
    const s = setup(patchMission());
    s.bus.emit('interact', { entityId: 'patch-console' });
    s.rt.update(5, { player: s.player, map: s.map, use: false, openDoor: () => {} });
    s.bus.emit('interact', { entityId: 'patch-console' });
    expect(s.rt.finished).toBeNull();
    expect(s.messages.at(-1)!.text).toContain('CHANGE NOT APPROVED');
  });
});

describe('ambush telegraphing', () => {
  const ambushMission = () => mission({
    entities: [
      { id: 'amb-a', kind: 'enemy', x: 3, y: 3, sprite: 'worm', ai: 'chase', dormant: true },
      { id: 'amb-b', kind: 'enemy', x: 4, y: 3, sprite: 'worm', ai: 'chase', dormant: true },
    ],
    missionObjectives: [{ id: 'exit', text: 'Exit', kind: 'reach-exit' }],
    script: { par: 30, triggers: [{ id: 'amb', area: [1, 2, 2, 3], spawn: ['amb-a', 'amb-b'], kind: 'bad', message: 'Ambush!' }] },
  });

  it('trigger emits ambush-spawn per spawned entity and grants materialise grace', () => {
    const s = setup(ambushMission());
    const spawned: string[] = [];
    s.bus.on('ambush-spawn', ({ entityId }) => spawned.push(entityId));
    s.rt.update(0.05, { player: s.player, map: s.map, use: false, openDoor: () => {} });
    expect(spawned).toEqual(['amb-a', 'amb-b']);
    expect(s.rt.byId('amb-a')!.state.spawnGrace).toBe(0.75);
  });

  it('spawn grace blocks windup for 0.75 s, then allows it', () => {
    const s = setup(ambushMission());
    s.rt.update(0.05, { player: s.player, map: s.map, use: false, openDoor: () => {} });
    const e = s.rt.byId('amb-a')!;
    e.state.mode = 'chase';
    e.state.reaction = 0;
    e.state.attackCooldown = 0;
    e.state.los = true;
    e.state.losT = 999;
    // put a melee worm right next to the player
    e.x = s.player.x + 0.6;
    e.y = s.player.y;
    const hooks = {
      onSight: () => {}, onWindup: () => {}, onMelee: () => {}, onFire: () => {},
    };
    updateEntities(s.rt.entities, s.map, s.player as never, 0.05, hooks);
    expect(e.state.mode).not.toBe('windup');
    for (let i = 0; i < 30; i++) {
      updateEntities(s.rt.entities, s.map, s.player as never, 0.05, hooks);
      if (e.state.mode === 'windup') break;
    }
    expect(e.state.mode).toBe('windup');
  });
});

describe('debrief intermission tallies', () => {
  const stats = { kills: 7, killsTotal: 9, secrets: 0, secretsTotal: 3, time: 184, par: 150 };

  it('statsLine renders the Doom-style compact line', () => {
    expect(statsLine(stats)).toBe('KILLS 78%   SECRETS 0%   TIME 3:04 / PAR 2:30');
  });

  it('flags over-par time red vs under-par green', () => {
    expect(statsSegments(stats).find((s) => s.text.startsWith('TIME'))!.overPar).toBe(true);
    expect(statsSegments({ ...stats, time: 120 }).find((s) => s.text.startsWith('TIME'))!.overPar).toBe(false);
  });

  it('fits inside DB_W and above the tally rows', () => {
    expect(measureText(statsLine(stats))).toBeLessThanOrEqual(DB_W - 68);
    expect(STATS_Y).toBeGreaterThan(30);
    expect(STATS_Y).toBeLessThan(56);
    expect(STATS_Y).toBeLessThan(DB_H);
  });
});

describe('presentSize', () => {
  it('3840x2160 @1 stays fractional: 2x would fill only 74% of the shorter axis', () => {
    const s = presentSize(3840, 2160, 1);
    expect(s.integer).toBe(false);
    expect(s.cssW).toBe(3456);
    expect(s.cssH).toBe(2160);
  });

  it('3840x2160 @2 (1920x1080 css) is the same fractional case', () => {
    const s = presentSize(1920, 1080, 2);
    expect(s.integer).toBe(false);
    expect(s.cssW).toBe(1728);
    expect(s.cssH).toBe(1080);
  });

  it('integer 2x when it fills >=85% of the shorter axis (was 0.9-ratio before)', () => {
    // phys 2944x1840: fit 2.3, k=2 fills 1600/1840 = 87% -> integer
    const s = presentSize(1472, 920, 2);
    expect(s.integer).toBe(true);
    expect(s.cssW).toBe(1280);
    expect(s.cssH).toBe(800);
  });

  it('just under 85% stays fractional-filtered', () => {
    // phys 3072x1920: fit 2.4, k=2 fills 1600/1920 = 83% -> fractional
    const s = presentSize(1536, 960, 2);
    expect(s.integer).toBe(false);
    expect(s.cssW).toBe(1536);
    expect(s.cssH).toBe(960);
  });

  it('2560x1600 @1 picks exact 2x integer', () => {
    const s = presentSize(2560, 1600, 1);
    expect(s.integer).toBe(true);
    expect(s.cssW).toBe(2560);
    expect(s.cssH).toBe(1600);
  });

  it('1920x1080 @1 uses the 1.35x fractional fit', () => {
    const s = presentSize(1920, 1080, 1);
    expect(s.integer).toBe(false);
    expect(s.cssW).toBe(1728);
    expect(s.cssH).toBe(1080);
  });

  it('2560x1440 @2 (css px) still fits', () => {
    const s = presentSize(2560, 1440, 2);
    // physical fit = 3.6, k=3 fills 2400/2880 = 83% < 85% -> fractional
    expect(s.integer).toBe(false);
    expect(s.cssW).toBe(2304);
    expect(s.cssH).toBe(1440);
  });

  it('2560x1440 @1: 1x fills only 56% -> fractional', () => {
    const s = presentSize(2560, 1440, 1);
    expect(s.integer).toBe(false);
  });

  it('tiny window still fits', () => {
    const s = presentSize(900, 600, 1);
    expect(s.integer).toBe(false);
    expect(s.cssH).toBeLessThanOrEqual(600);
    expect(s.cssW).toBeLessThanOrEqual(900);
  });
});
