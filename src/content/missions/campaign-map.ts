import type { MapDef, Mission, MissionTrigger, TileRect } from '../../core/types';
import { lightRects } from '../../missions/levelkit';

export function campaignMap(theme: 'mail' | 'change'): MapDef {
  const width = 40;
  const height = 30;
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => '#'));
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) cells[y][x] = '.';
    }
  };

  carve(19, 2, 21, 27);
  for (const [top, bottom] of [[4, 8], [10, 15], [17, 22], [24, 27]]) {
    carve(3, top, 17, bottom);
    carve(22, top, 36, bottom);
  }
  for (const y of [6, 12, 20, 25]) carve(17, y, 22, y);

  const stubs = theme === 'mail'
    ? [[10, 5], [11, 5], [11, 6], [29, 12], [30, 12], [30, 13], [9, 19], [10, 19], [10, 20]]
    : [[12, 5], [12, 6], [13, 6], [27, 11], [28, 11], [28, 12], [13, 19], [14, 19], [14, 20]];
  for (const [x, y] of stubs) cells[y][x] = '#';

  for (const y of [3, 9, 16, 23]) {
    for (let x = 1; x < width - 1; x++) cells[y][x] = '#';
  }
  cells[3][20] = 'X';
  cells[9][20] = 'C';
  cells[16][20] = 'B';
  cells[23][20] = 'A';
  cells[16][5] = 'T';

  for (let y = 4; y <= 8; y++) cells[y][5] = '#';
  cells[6][5] = '1';
  for (let y = 10; y <= 15; y++) cells[y][34] = '#';
  cells[12][34] = '2';
  for (let y = 17; y <= 22; y++) cells[y][5] = '#';
  cells[20][5] = '3';

  if (theme === 'mail') {
    for (const y of [25, 26, 27]) cells[y][29] = 'S';
  } else {
    for (const x of [10, 11, 12]) cells[26][x] = 'S';
  }
  cells[1][20] = 'E';

  const grid = cells.map((row) => row.join(''));
  const lights = theme === 'mail'
    ? lightRects([[24, 23, 32, 28, 0.7], [27, 24, 30, 27, 1], [3, 4, 17, 8, 0.8], [22, 10, 36, 15, 0.8], [3, 17, 17, 22, 0.65], [19, 1, 21, 2, 1]])
    : lightRects([[4, 23, 15, 28, 0.75], [9, 24, 13, 27, 1], [3, 4, 17, 8, 0.65], [22, 10, 36, 15, 0.8], [22, 17, 36, 22, 0.65], [19, 1, 21, 2, 1]]);
  return {
    grid,
    legend: {
      '#': { kind: 'wall', tex: 'wall-panel' },
      S: { kind: 'wall', tex: 'wall-server' },
      '.': { kind: 'floor', tex: 'floor' },
      E: { kind: 'exit', tex: 'exit' },
      A: { kind: 'door', tex: 'door', doorId: `${theme}-mailroom`, accessRole: 'analyst' },
      B: { kind: 'door', tex: 'door', doorId: `${theme}-operations`, accessRole: 'analyst' },
      C: {
        kind: 'door', tex: 'door', doorId: `${theme}-queue`,
        locked: true, lockText: 'Clear the queue before moving on.',
      },
      X: {
        kind: 'door', tex: 'door', doorId: `${theme}-exit`,
        locked: true, lockText: 'Complete the incident objectives before exiting.',
      },
      T: {
        kind: 'door', tex: 'door', doorId: `${theme}-backtrack`,
        locked: true, lockText: 'The return route opens after the work is complete.',
      },
      '1': { kind: 'door', tex: 'wall-brick', doorId: `${theme}-secret-1`, secret: true },
      '2': { kind: 'door', tex: 'wall-server', doorId: `${theme}-secret-2`, secret: true },
      '3': { kind: 'door', tex: 'wall-brick', doorId: `${theme}-secret-3`, secret: true },
    },
    spawn: theme === 'mail'
      ? { x: 34.5, y: 26.5, angle: Math.PI }
      : { x: 5.5, y: 26.5, angle: 0 },
    defaultLight: 0.65,
    lights,
  };
}

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
