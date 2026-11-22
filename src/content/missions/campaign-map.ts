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
    botnet: 3,
    wiper: 6,
    'boss-locker': 16,
    'boss-ghostledger': 30,
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
        botnet: 'Botnet drone',
        wiper: 'Wiper unit',
        'boss-locker': 'Boss-Locker Overlord',
        'boss-ghostledger': 'Boss-Ghostledger Core',
      } as Record<string, string>)[sprite] ?? 'Malware process',
      detail: ({
        worm: 'Self-propagating process scanning reachable hosts.',
        trojan: 'Process installed after a user ran a disguised file.',
        logicbomb: 'Scheduled task and execution condition recorded.',
        rat: 'Remote access session: source account and destination host recorded.',
        rootkit: 'Persistence record: service restart and privileged file access recorded.',
        ransomware: 'File-encryption process and ransom note recorded.',
        botnet: 'C2 botnet drone firing rapid twin-bolt packet volleys.',
        wiper: 'Destructive disk-wiper unit firing 3-bolt fan spreads.',
        'boss-locker': 'GHOSTLEDGER primary encryptor node — 3-bolt encryption volley and door-sealing daemon.',
        'boss-ghostledger': 'GHOSTLEDGER final C2 monolith — 5-bolt fan volley and full war-room persistence.',
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

export interface MissionTheme {
  wall: string;
  floor: string;
  props: readonly string[];
}

export const MISSION_THEMES: Record<string, MissionTheme> = {
  m01: { wall: 'wall-office', floor: 'floor-carpet', props: ['whiteboard', 'office-plant', 'water-cooler'] },
  m02: { wall: 'wall-datacenter', floor: 'floor-datacenter', props: ['server-rack', 'whiteboard', 'warning-beacon'] },
  m03: { wall: 'wall-office', floor: 'floor-carpet', props: ['office-plant', 'water-cooler', 'whiteboard'] },
  m04: { wall: 'wall-office', floor: 'floor-carpet', props: ['whiteboard', 'office-plant', 'water-cooler'] },
  m05: { wall: 'wall-vault', floor: 'floor-datacenter', props: ['hazard-barrel', 'warning-beacon', 'server-rack'] },
  m06: { wall: 'wall-vault', floor: 'floor-datacenter', props: ['server-rack', 'warning-beacon', 'hazard-barrel'] },
  m07: { wall: 'wall-datacenter', floor: 'floor-datacenter', props: ['server-rack', 'warning-beacon', 'whiteboard'] },
  m08: { wall: 'wall-datacenter', floor: 'floor-datacenter', props: ['server-rack', 'hazard-barrel', 'warning-beacon'] },
  m09: { wall: 'wall-vault', floor: 'floor-datacenter', props: ['warning-beacon', 'hazard-barrel', 'server-rack'] },
  m10: { wall: 'wall-datacenter', floor: 'floor-datacenter', props: ['server-rack', 'whiteboard', 'office-plant'] },
  m11: { wall: 'wall-vault', floor: 'floor-datacenter', props: ['hazard-barrel', 'server-rack', 'warning-beacon'] },
  m12: { wall: 'wall-soc', floor: 'floor-soc', props: ['whiteboard', 'server-rack', 'warning-beacon'] },
};

export const POWERUP_SPECS = {
  armor: {
    sprite: 'firewall-vest',
    amount: 50,
    label: 'Firewall vest',
    detail: 'Absorbs 50% of incoming damage (+50 shield).',
  },
  overclock: {
    sprite: 'overclock-chip',
    amount: 15,
    label: 'SOC overclock chip',
    detail: '2x fire rate and +25% move speed for 15s.',
  },
  airgap: {
    sprite: 'airgap-shield',
    amount: 12,
    label: 'Air-gap shield',
    detail: 'Brief invulnerability against network attacks (12s).',
  },
  'siem-map': {
    sprite: 'siem-map',
    amount: 1,
    label: 'SIEM topology map',
    detail: 'Syncs floor blueprint to your automap.',
  },
} as const;

export type PowerupKind = keyof typeof POWERUP_SPECS;

const MISSION_POWERUP_PLACEMENTS: Record<string, ReadonlyArray<{ id: string; kind: PowerupKind; area: TileRect }>> = {
  m01: [
    { id: 'pwr-m01-siem', kind: 'siem-map', area: [1, 23, 2, 25] },
    { id: 'pwr-m01-vest', kind: 'armor', area: [43, 15, 44, 16] },
  ],
  m02: [
    { id: 'pwr-m02-vest', kind: 'armor', area: [27, 25, 31, 28] },
    { id: 'pwr-m02-siem', kind: 'siem-map', area: [42, 5, 44, 7] },
  ],
  m04: [
    { id: 'pwr-m04-vest', kind: 'armor', area: [2, 4, 4, 8] },
    { id: 'pwr-m04-oc', kind: 'overclock', area: [43, 10, 44, 12] },
  ],
  m05: [
    { id: 'pwr-m05-vest', kind: 'armor', area: [2, 4, 4, 8] },
    { id: 'pwr-m05-airgap', kind: 'airgap', area: [40, 6, 41, 8] },
  ],
  m07: [
    { id: 'pwr-m07-oc', kind: 'overclock', area: [14, 9, 16, 10] },
    { id: 'pwr-m07-airgap', kind: 'airgap', area: [34, 3, 36, 5] },
  ],
  m10: [
    { id: 'pwr-m10-vest', kind: 'armor', area: [2, 5, 4, 9] },
    { id: 'pwr-m10-siem', kind: 'siem-map', area: [2, 21, 4, 26] },
  ],
  m11: [
    { id: 'pwr-m11-oc', kind: 'overclock', area: [2, 5, 3, 7] },
    { id: 'pwr-m11-airgap', kind: 'airgap', area: [40, 25, 42, 26] },
  ],
};

/** Ensure every campaign mission has meaningful Doom-style powerups placed in
 *  secret caches and tactical rooms without overlapping existing entities. */
export function applyMissionPowerups(mission: Mission): void {
  const placements = MISSION_POWERUP_PLACEMENTS[mission.id];
  if (!placements) return;
  for (const p of placements) {
    if (mission.entities.some((e) => e.id === p.id)) continue;
    const spec = POWERUP_SPECS[p.kind];
    const spot = floorSpot(mission, p.area);
    mission.entities.push({
      id: p.id,
      kind: 'item',
      x: spot.x,
      y: spot.y,
      sprite: spec.sprite,
      grants: { resource: p.kind, amount: spec.amount },
      inspect: { label: spec.label, detail: spec.detail, category: 'item' },
    });
  }
}

/** Populate wall-adjacent environmental props across a mission so every floor
 *  feels inhabited (target ~18 props) while keeping doorways, narrow corridors,
 *  and spawn lanes completely clear. */
function populateThemeProps(mission: Mission, theme: MissionTheme, targetCount = 18): void {
  const existingProps = mission.entities.filter((e) => e.kind === 'prop');
  if (existingProps.length >= targetCount) return;

  const { map } = mission;
  const h = map.grid.length;
  const w = map.grid[0]?.length ?? 0;
  const cellKind = (x: number, y: number): string | undefined =>
    map.legend[map.grid[y]?.[x] ?? '']?.kind;

  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (cellKind(x, y) !== 'floor') continue;
      const n = cellKind(x, y - 1);
      const s = cellKind(x, y + 1);
      const e = cellKind(x + 1, y);
      const west = cellKind(x - 1, y);
      const ortho = [n, s, e, west];
      // Hug a wall, never block a door or exit, and keep 1-tile corridors clear
      if (!ortho.includes('wall')) continue;
      if (ortho.includes('door') || ortho.includes('exit')) continue;
      const floorNeighbors = ortho.filter((k) => k === 'floor').length;
      if (floorNeighbors < 2) continue;
      // Avoid diagonal door clearance crowding
      const diags = [
        cellKind(x - 1, y - 1),
        cellKind(x + 1, y - 1),
        cellKind(x - 1, y + 1),
        cellKind(x + 1, y + 1),
      ];
      if (diags.includes('door') || diags.includes('exit')) continue;

      const px = x + 0.5;
      const py = y + 0.5;
      if (Math.hypot(px - map.spawn.x, py - map.spawn.y) < 2.2) continue;
      if (mission.entities.some((ent) => Math.hypot(ent.x - px, ent.y - py) < 1.6)) continue;
      candidates.push({ x: px, y: py });
    }
  }

  // Spread props evenly across the map by stepping through candidates and enforcing spacing
  const needed = targetCount - existingProps.length;
  const placed: Array<{ x: number; y: number }> = existingProps.map((e) => ({ x: e.x, y: e.y }));
  const stride = Math.max(1, Math.floor(candidates.length / Math.max(1, needed * 2)));
  let added = 0;

  for (const minGap of [3.2, 2.2]) {
    for (let offset = 0; offset < stride && added < needed; offset++) {
      for (let i = offset; i < candidates.length && added < needed; i += stride) {
        const c = candidates[i]!;
        if (placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < minGap)) continue;
        const sprite = theme.props[(existingProps.length + added) % theme.props.length]!;
        mission.entities.push({
          id: `theme-prop-${mission.id}-${added + 1}`,
          kind: 'prop',
          x: c.x,
          y: c.y,
          sprite,
        });
        placed.push(c);
        added += 1;
      }
    }
  }
}

/** Apply per-mission wall/floor textures and environmental prop sprites so
 *  corporate offices, data centers, vaults, and the SOC look visually distinct. */
export function applyMissionTheme(mission: Mission): void {
  const theme = MISSION_THEMES[mission.id];
  if (!theme) return;
  for (const def of Object.values(mission.map.legend)) {
    if (def.kind === 'wall' && def.tex === 'wall-panel') def.tex = theme.wall;
    if (def.kind === 'floor' && def.tex === 'floor') def.tex = theme.floor;
  }
  let propIdx = 0;
  for (const ent of mission.entities) {
    if (ent.kind !== 'prop') continue;
    if (ent.sprite === 'duck') continue;
    ent.sprite = theme.props[propIdx % theme.props.length]!;
    propIdx += 1;
  }
  populateThemeProps(mission, theme, 18);
}

function pickUnusedGlyph(legend: MapDef['legend'], candidates: string): string | null {
  for (const ch of candidates) {
    if (!(ch in legend)) return ch;
  }
  return null;
}

/** Add Doom-style architectural accents (open-air skylight wells, raised exit
 *  dais platforms, and reinforced glass observation windows) without altering
 *  walkability, doors, secrets, or mission scripting. */
export function applyArchitecture(mission: Mission): void {
  const { map } = mission;
  const h = map.grid.length;
  const w = map.grid[0]?.length ?? 0;
  if (h < 5 || w < 5) return;

  const baseFloorTex = Object.values(map.legend).find((d) => d.kind === 'floor')?.tex ?? 'floor';
  const baseWallTex = Object.values(map.legend).find((d) => d.kind === 'wall' && d.tex !== 'wall-secret')?.tex ?? 'wall-panel';
  const spawnX = Math.floor(map.spawn.x);
  const spawnY = Math.floor(map.spawn.y);

  // 1. Raised dais on exit cells (subtle 0.16-unit podium)
  for (const def of Object.values(map.legend)) {
    if (def.kind === 'exit' && def.floorHeight === undefined) {
      def.floorHeight = 0.16;
    }
  }

  // 2. Skylight well in a wide open 3x3 floor chamber (away from spawn)
  const skyGlyph = pickUnusedGlyph(map.legend, '~$%^&*@');
  if (skyGlyph) {
    let best: { x: number; y: number; dist: number } | null = null;
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let allFloor = true;
        for (let oy = -1; oy <= 1 && allFloor; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const def = map.legend[map.grid[y + oy]?.[x + ox] ?? ''];
            if (!def || def.kind !== 'floor') {
              allFloor = false;
              break;
            }
          }
        }
        if (!allFloor) continue;
        const dist = Math.hypot(x - spawnX, y - spawnY);
        if (dist < 3) continue;
        if (!best || dist < best.dist) best = { x, y, dist };
      }
    }
    if (best) {
      map.legend[skyGlyph] = { kind: 'floor', tex: baseFloorTex, sky: true };
      setMapCell(map, best.x, best.y, skyGlyph);
      // Expand skylight to a 2x2 well if the adjacent ring is also open floor
      const neighbors: [number, number][] = [[1, 0], [0, 1], [1, 1]];
      if (
        neighbors.every(([ox, oy]) => {
          const def = map.legend[map.grid[best!.y + oy]?.[best!.x + ox] ?? ''];
          return def?.kind === 'floor';
        })
      ) {
        for (const [ox, oy] of neighbors) setMapCell(map, best.x + ox, best.y + oy, skyGlyph);
      }
    }
  }

  // 3. Reinforced glass observation windows on interior divider walls
  const winGlyph = pickUnusedGlyph(map.legend, '=+;:?/');
  if (winGlyph) {
    let placed = 0;
    for (let y = 2; y < h - 2 && placed < 2; y++) {
      for (let x = 2; x < w - 2 && placed < 2; x++) {
        const ch = map.grid[y]?.[x];
        const def = ch ? map.legend[ch] : undefined;
        if (!def || def.kind !== 'wall' || def.secret || def.tex === 'wall-secret') continue;
        const n = map.legend[map.grid[y - 1]?.[x] ?? ''];
        const s = map.legend[map.grid[y + 1]?.[x] ?? ''];
        const e = map.legend[map.grid[y]?.[x + 1] ?? ''];
        const we = map.legend[map.grid[y]?.[x - 1] ?? ''];
        const horizWindow = n?.kind === 'floor' && s?.kind === 'floor' && e?.kind === 'wall' && we?.kind === 'wall';
        const vertWindow = e?.kind === 'floor' && we?.kind === 'floor' && n?.kind === 'wall' && s?.kind === 'wall';
        if (!horizWindow && !vertWindow) continue;
        // Skip walls adjacent to any door or secret
        let nearDoor = false;
        for (let oy = -1; oy <= 1 && !nearDoor; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const adj = map.legend[map.grid[y + oy]?.[x + ox] ?? ''];
            if (adj && (adj.kind === 'door' || adj.secret)) nearDoor = true;
          }
        }
        if (nearDoor) continue;
        if (placed === 0) {
          map.legend[winGlyph] = { kind: 'wall', tex: baseWallTex, window: true };
        }
        setMapCell(map, x, y, winGlyph);
        placed++;
        x += 3; // space out windows
      }
    }
  }
}
