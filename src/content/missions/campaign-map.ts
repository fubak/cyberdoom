import type { MapDef, Mission, MissionTrigger, TileRect } from '../../core/types';

export function setMapCell(map: MapDef, x: number, y: number, cell: string): void {
  const row = map.grid[y];
  if (!row || x < 0 || x >= row.length) return;
  map.grid[y] = `${row.slice(0, x)}${cell}${row.slice(x + 1)}`;
}

export function threatWave(
  map: MapDef,
  prefix: string,
  sprite: string,
  occupied: { x: number; y: number }[],
  count = 20,
  region?: [number, number, number, number],
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
  const [rx1, ry1, rx2, ry2] = region ?? [2, 4, map.grid[0].length - 3, map.grid.length - 3];
  for (let y = Math.max(4, ry1); y <= Math.min(map.grid.length - 3, ry2); y++) {
    for (let x = Math.max(2, rx1); x <= Math.min(map.grid[0].length - 3, rx2); x++) {
      if (map.legend[map.grid[y][x]]?.kind !== 'floor') continue;
      if (Math.hypot(x + 0.5 - map.spawn.x, y + 0.5 - map.spawn.y) < 5) continue;
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
