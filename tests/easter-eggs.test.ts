import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { MissionRuntime } from '../src/missions/runtime';
import { missionById } from '../src/content/missions';
import { m04 } from '../src/content/missions/m04-hook-line-sinker';
import { m13 } from '../src/content/missions/m13-honeypot';
import { CHEATS, CheatBuffer, KonamiBuffer, KONAMI } from '../src/eggs/cheats';
import type { Mission } from '../src/core/types';

/** BFS from spawn, treating every door as openable (player roles + Use). */
function reachableCells(m: Mission): Set<string> {
  const grid = m.map.grid;
  const h = grid.length;
  const w = grid[0].length;
  const pass = (x: number, y: number) => {
    const c = m.map.legend[grid[y]?.[x]];
    return c && c.kind !== 'wall';
  };
  const sx = Math.floor(m.map.spawn.x);
  const sy = Math.floor(m.map.spawn.y);
  const seen = new Set<string>([`${sx},${sy}`]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seen.has(`${nx},${ny}`) || !pass(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return seen;
}

/** The four neighbor cells of a tile. */
function around(x: number, y: number): [number, number][] {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
}

describe('cheat codes', () => {
  it('matches every code typed letter by letter, Doom-style', () => {
    for (const cheat of CHEATS) {
      const buf = new CheatBuffer();
      let hit: string | null = null;
      for (const ch of cheat.code) hit = buf.push(ch);
      expect(hit, cheat.code).toBe(cheat.id);
    }
  });

  it('suffix-matches like Doom (prefix letters do not matter)', () => {
    const buf = new CheatBuffer();
    let hit: string | null = null;
    for (const ch of 'XYZSUDO') hit = buf.push(ch);
    expect(hit).toBe('god');
  });

  it('is case-insensitive and resets on non-letters', () => {
    const buf = new CheatBuffer();
    let hit: string | null = null;
    for (const ch of 'sudo') hit = buf.push(ch);
    expect(hit).toBe('god');
    const buf2 = new CheatBuffer();
    for (const ch of ['s', 'u', '5', 'd', 'o']) hit = buf2.push(ch);
    expect(hit).toBeNull();
  });

  it('reports a live prefix so hotkeys can be eaten mid-code', () => {
    const buf = new CheatBuffer();
    buf.push('r');
    expect(buf.hot()).toBe(false); // first letter alone must not eat movement
    buf.push('i');
    expect(buf.hot()).toBe(true); // 'RI' is a strict prefix of RICKROLL
    for (const ch of 'ckrol') buf.push(ch);
    expect(buf.push('l')).toBe('music'); // the 'l' reaches the buffer
    expect(buf.hot()).toBe(false);
  });

  it('matches the Konami code only in order', () => {
    const k = new KonamiBuffer();
    let done = false;
    for (const key of KONAMI) done = k.push(key);
    expect(done).toBe(true);
    const bad = new KonamiBuffer();
    for (const key of [...KONAMI.slice(0, 4), 'x', ...KONAMI.slice(4)]) {
      done = bad.push(key);
    }
    expect(done).toBe(false);
  });
});

describe('m04 secret exit (E1M9 pattern)', () => {
  it('has a hidden pad that routes to m13', () => {
    const cells: [string, { x: number; y: number }][] = [];
    m04.map.grid.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const cell = m04.map.legend[ch];
        if (cell?.secretExit) cells.push([cell.secretExit, { x, y }]);
      }),
    );
    expect(cells).toEqual([['m13', { x: 14, y: 31 }]]);
  });

  it('pad is walled on all sides but its tell door, which is reachable', () => {
    const reach = reachableCells(m04);
    expect(reach.has('15,31')).toBe(true); // the tell door cell
    expect(reach.has('14,31')).toBe(true); // pad reachable once the door opens
    const walls = around(14, 31).filter(
      ([x, y]) => m04.map.legend[m04.map.grid[y][x]].kind === 'wall',
    );
    expect(walls.length).toBe(3);
  });

  it('every m04 egg id is declared and its entity is reachable', () => {
    const reach = reachableCells(m04);
    const eggs = m04.script?.eggs ?? [];
    expect(eggs.map((e) => e.id).sort()).toEqual(['link-report', 'quack']);
    for (const egg of eggs) {
      const ent = m04.entities.find((e) => e.egg === egg.id);
      expect(ent, egg.id).toBeTruthy();
      const tx = Math.floor(ent!.x);
      const ty = Math.floor(ent!.y);
      const near = around(tx, ty).some(([x, y]) => reach.has(`${x},${y}`));
      expect(reach.has(`${tx},${ty}`) || near, egg.id).toBe(true);
    }
    // the secret-exit area secret is declared too
    expect(m04.script?.secrets?.some((s) => s.id === 'egg-exit')).toBe(true);
  });
});

describe('m13 honeypot (the secret level)', () => {
  it('is off the campaign registry but reachable via missionById', () => {
    expect(missionById('m13')).toBe(m13);
    expect(missionById('m04')).not.toBe(m13);
  });

  it('map is rectangular, walled, and the exit is reachable', () => {
    const g = m13.map.grid;
    expect(new Set(g.map((r) => r.length)).size).toBe(1);
    const reach = reachableCells(m13);
    let exit = '';
    g.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (m13.map.legend[ch].kind === 'exit') exit = `${x},${y}`;
      }),
    );
    expect(exit).toBeTruthy();
    expect(reach.has(exit)).toBe(true);
  });

  it('every declared egg has a reachable entity trigger', () => {
    const reach = reachableCells(m13);
    for (const egg of m13.script!.eggs!) {
      const ent = m13.entities.find((e) => e.egg === egg.id);
      expect(ent, egg.id).toBeTruthy();
      const tx = Math.floor(ent!.x);
      const ty = Math.floor(ent!.y);
      const near = around(tx, ty).some(([x, y]) => reach.has(`${x},${y}`));
      expect(reach.has(`${tx},${ty}`) || near, egg.id).toBe(true);
    }
    // no entity points at an undeclared egg
    for (const e of m13.entities) {
      if (e.egg) expect(m13.script!.eggs!.some((x) => x.id === e.egg), e.egg).toBe(true);
    }
  });

  it('the dev room secret area and credits mural exist', () => {
    expect(m13.script!.secrets!.some((s) => s.id === 'dev-room')).toBe(true);
    let mural = 0;
    m13.map.grid.forEach((row) =>
      [...row].forEach((ch) => {
        if (m13.map.legend[ch].tex === 'wall-devs') mural++;
      }),
    );
    expect(mural).toBeGreaterThan(0);
  });
});

describe('runtime plumbing', () => {
  it('inspecting an egg entity counts toward the secrets tally', () => {
    const bus = new EventBus();
    const rt = new MissionRuntime(m13, bus);
    expect(rt.stats().secrets).toBe(0);
    bus.emit('inspect', { entityId: 'bobby' });
    expect(rt.stats().secrets).toBe(1);
    expect(rt.stats().secretsTotal).toBe(
      m13.script!.secrets!.length + m13.script!.eggs!.length,
    );
    expect(rt.revealedSecretIds()).toContain('bobby');
    // re-inspecting does not double-count
    bus.emit('inspect', { entityId: 'bobby' });
    expect(rt.stats().secrets).toBe(1);
  });

  it('a secret exit wins the mission and routes onward', () => {
    const bus = new EventBus();
    const rt = new MissionRuntime(m04, bus);
    bus.emit('reach-exit', { secretTo: 'm13' });
    expect(rt.finished).toBe('won');
    expect(rt.nextMission).toBe('m13');
  });

  it('a normal exit still requires objectives', () => {
    const bus = new EventBus();
    const rt = new MissionRuntime(m13, bus);
    bus.emit('reach-exit', {});
    expect(rt.finished).toBeNull();
  });

  it('cheat codes mark the run unscored', () => {
    const bus = new EventBus();
    const rt = new MissionRuntime(m13, bus);
    rt.markUnscored('god');
    expect(rt.unscored).toBe(true);
    expect(rt.scoreLog.some((e) => e.text.includes('CHEAT ACTIVE'))).toBe(true);
    // the win tally still lands (the run completes, it just scores nothing)
    rt.markUnscored('map');
    expect(rt.scoreLog.filter((e) => e.text.includes('CHEAT ACTIVE')).length).toBe(1);
  });

  it('revealAllSecretDoors exposes hidden doors on the automap', () => {
    const bus = new EventBus();
    const rt = new MissionRuntime(m13, bus);
    rt.revealAllSecretDoors();
    expect(rt.isSecretDoorRevealed('dev-door')).toBe(true);
  });
});
