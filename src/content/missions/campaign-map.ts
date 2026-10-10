import type { MapDef, Mission, MissionTrigger, TileRect } from '../../core/types';
import { WorldMap } from '../../engine/map';

export function setMapCell(map: MapDef, x: number, y: number, cell: string): void {
  const row = map.grid[y];
  if (!row || x < 0 || x >= row.length) return;
  map.grid[y] = `${row.slice(0, x)}${cell}${row.slice(x + 1)}`;
}

/** LEVELS: landmark dressing — swap every cell of kind `from` inside `region`
 *  for `glyph` (which must map to a cell of the same kind in the legend).
 *  Floors stay floors, walls stay walls; doors/exits/props are untouched. */
export function retex(mission: Mission, region: TileRect, from: 'floor' | 'wall', glyph: string): void {
  if (mission.map.legend[glyph]?.kind !== from) return;
  const [x0, y0, x1, y1] = region;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ch = mission.map.grid[y]?.[x];
      if (ch !== undefined && mission.map.legend[ch]?.kind === from) setMapCell(mission.map, x, y, glyph);
    }
  }
}

export function threatWave(
  map: MapDef,
  prefix: string,
  sprite: string,
  occupied: { x: number; y: number }[],
  count = 20,
  region?: [number, number, number, number],
  /** Spawn-safety for live enemies: reject candidates within `minDist` tiles of
   *  the player start or with a clear line of sight to it. */
  spawnSafe?: { minDist: number; los: boolean },
): Array<{
  id: string;
  kind: 'enemy';
  x: number;
  y: number;
  sprite: string;
  ai: 'chase';
  hp: number;
  infected: true;
  dormant: true;
  tags: string[];
  inspect: { label: string; detail: string; category: 'malware' };
}> {
  const baseHp: Record<string, number> = {
    worm: 2,
    trojan: 3,
    ransomware: 4,
    logicbomb: 1,
    rat: 2,
    rootkit: 3,
  };
  const positions: { x: number; y: number }[] = [];
  const world = spawnSafe?.los ? new WorldMap(map) : null;
  const minSpawnDist = spawnSafe ? Math.max(5, spawnSafe.minDist) : 5;
  const [rx1, ry1, rx2, ry2] = region ?? [2, 4, map.grid[0].length - 3, map.grid.length - 3];
  for (let y = Math.max(4, ry1); y <= Math.min(map.grid.length - 3, ry2); y++) {
    for (let x = Math.max(2, rx1); x <= Math.min(map.grid[0].length - 3, rx2); x++) {
      if (map.legend[map.grid[y][x]]?.kind !== 'floor') continue;
      const spawnDist = Math.hypot(x + 0.5 - map.spawn.x, y + 0.5 - map.spawn.y);
      if (spawnDist < minSpawnDist) continue;
      if (world && world.raycast(map.spawn.x, map.spawn.y, Math.atan2(y + 0.5 - map.spawn.y, x + 0.5 - map.spawn.x), spawnDist).dist >= spawnDist - 0.2) continue;
      if (occupied.some((entity) => Math.hypot(entity.x - (x + 0.5), entity.y - (y + 0.5)) < 1.8)) continue;
      if (positions.some((point) => Math.hypot(point.x - (x + 0.5), point.y - (y + 0.5)) < 2.4)) continue;
      positions.push({ x: x + 0.5, y: y + 0.5 });
      if (positions.length >= count) break;
    }
    if (positions.length >= count) break;
  }
  return positions.map(({ x, y }, index) => ({
    id: `${prefix}-${index + 1}`,
    kind: 'enemy',
    x, y, sprite, ai: 'chase', hp: baseHp[sprite] ?? 1, infected: true, dormant: true,
    tags: ['malware'],
    inspect: {
      label: ({
        worm: 'Worm',
        trojan: 'Trojan',
        logicbomb: 'Logic bomb',
        rat: 'RAT',
        rootkit: 'Rootkit process',
        ransomware: 'Ransomware',
      } as Record<string, string>)[sprite] ?? 'Malware process',
      detail: ({
        worm: 'Self-propagating process scanning reachable hosts.',
        trojan: 'Process installed after a user ran a disguised file.',
        logicbomb: 'Scheduled task and execution condition recorded.',
        rat: 'Remote access session: source account and destination host recorded.',
        rootkit: 'Persistence record: service restart and privileged file access recorded.',
        ransomware: 'File-encryption process and ransom note recorded.',
      } as Record<string, string>)[sprite] ?? 'Malicious process recorded by endpoint telemetry.',
      category: 'malware',
    },
  }));
}

/** Place live (non-dormant) wanderers on floor cells away from the spawn point.
 *  Live enemies must be Doom-safe: at least 8 tiles from the player start AND
 *  out of its line of sight. */
export function liveThreats(
  mission: Mission,
  prefix: string,
  sprite: string,
  count: number,
  region?: [number, number, number, number],
): void {
  const wave = threatWave(
    mission.map,
    prefix,
    sprite,
    mission.entities.map(({ x, y }) => ({ x, y })),
    count,
    region,
    { minDist: 8, los: true },
  ).map((enemy) => ({ ...enemy, ai: 'wander' as const, dormant: false }));
  mission.entities.push(...wave);
}

/** First floor-cell centre inside a tile region not crowding an existing entity. */
export function floorSpot(mission: Mission, region: TileRect): { x: number; y: number } {
  const [rx1, ry1, rx2, ry2] = region;
  for (let y = ry1; y <= ry2; y++) {
    for (let x = rx1; x <= rx2; x++) {
      if (mission.map.legend[mission.map.grid[y]?.[x] ?? '']?.kind !== 'floor') continue;
      const px = x + 0.5;
      const py = y + 0.5;
      if (mission.entities.some((e) => Math.hypot(e.x - px, e.y - py) < 1.0)) continue;
      return { x: px, y: py };
    }
  }
  return { x: rx1 + 0.5, y: ry1 + 0.5 };
}

export function addThreatEncounter(
  mission: Mission,
  prefix: string,
  sprite: string,
  count: number,
  trigger: Omit<MissionTrigger, 'spawn'>,
  region?: [number, number, number, number],
): void {
  const wave = threatWave(
    mission.map,
    prefix,
    sprite,
    mission.entities.map(({ x, y }) => ({ x, y })),
    count,
    region,
  );
  mission.entities.push(...wave);
  if (!mission.script) mission.script = { par: 0 };
  mission.script.triggers ??= [];
  mission.script.triggers.push({ ...trigger, spawn: wave.map((enemy) => enemy.id) });
}

/** LEVELS rF4: a mixed-type ambush pack — several sprite waves sharing one
 *  region under ONE trigger, so the player meets a combined pack (e.g. a worm
 *  swarm screening a ranged trojan) instead of single-type groups. */
export function mixedThreatEncounter(
  mission: Mission,
  prefix: string,
  sprites: [sprite: string, count: number][],
  trigger: Omit<MissionTrigger, 'spawn'>,
  region?: [number, number, number, number],
): void {
  const spawn: string[] = [];
  for (const [sprite, count] of sprites) {
    const wave = threatWave(
      mission.map,
      `${prefix}-${sprite}`,
      sprite,
      mission.entities.map(({ x, y }) => ({ x, y })),
      count,
      region,
    );
    mission.entities.push(...wave);
    spawn.push(...wave.map((enemy) => enemy.id));
  }
  if (!mission.script) mission.script = { par: 0 };
  mission.script.triggers ??= [];
  mission.script.triggers.push({ ...trigger, spawn });
}

export function stagedThreatWave(
  map: MapDef,
  prefix: string,
  sprite: string,
  occupied: { x: number; y: number }[],
  regions: TileRect[],
  countPerWave = 5,
): ReturnType<typeof threatWave> {
  const wave: ReturnType<typeof threatWave> = [];
  for (const [index, region] of regions.entries()) {
    wave.push(...threatWave(map, `${prefix}-${index + 1}`, sprite, [...occupied, ...wave], countPerWave, region));
  }
  return wave;
}
