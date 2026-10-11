import type { Entity, Projectile } from '../core/types';
import type { WorldMap } from './map';
import type { Player } from './player';

export interface AiHooks {
  onSight(e: Entity): void;
  onWindup(e: Entity, dur: number): void;
  onMelee(e: Entity, dmg: number): void;
  /** Infighting: a grudge-bearing melee attacker landed its hit on another enemy. */
  onEnemyMelee?(e: Entity, target: Entity, dmg: number): void;
  onFire(e: Entity, proj: Omit<Projectile, 'alive' | 'traveled'>): void;
  onStep?(e: Entity): void;
  /** Occasional positional growl while actively hunting. */
  onGrowl?(e: Entity): void;
  /** Unalerted idle vocalization: a quiet positional mutter so a live threat
   *  can be heard before it is seen (hidden/disguised enemies stay silent). */
  onIdle?(e: Entity): void;
  /** A new enemy materialised (worm self-propagation). */
  onSpawn?(e: Entity): void;
  /** Ransomware sealed a door or console. */
  onSeal?(e: Entity, seal: SealTarget): void;
  /** Ransomware died — its seal is released. */
  onUnseal?(e: Entity, seal: SealTarget): void;
  /** One-line mechanic explainer the first time the player meets it. */
  onNotice?(e: Entity, text: string): void;
  /** LEVELS: shared mission budget for worm copies (see wormPropagateCap);
   *  a copy only spawns while `remaining > 0`. Omitted = uncapped. */
  wormCopyBudget?: { remaining: number };
}

/** Something ransomware encrypted: a map door, or an entity (e.g. a console). */
export interface SealTarget {
  kind: 'door' | 'entity';
  id: string;
  x: number;
  y: number;
}

interface EnemyProfile {
  speed: number;
  ranged: boolean;
  damage: number;
  painChance: number;
  range?: number;
  projectileSpeed?: number;
  windup: number;
  aggroRange?: number;
  logicBomb?: boolean;
  retreatAfterShot?: number;
  regenerate?: boolean;
  hidesWhenIdle?: boolean;
  /** worm: self-propagates once sighted (spawns copies on a timer). */
  propagates?: boolean;
  /** trojan: reads as a harmless pickup until close range, an inspect, or damage. */
  disguised?: boolean;
  /** ransomware: seals the nearest door/console in its zone while alive. */
  seals?: boolean;
  /** rootkit: invisible beyond ~2 tiles until tap/EDR/damage/close contact. */
  stealthy?: boolean;
}

export const ENEMY_PROFILES: Record<string, EnemyProfile> = {
  worm: { speed: 2.6, ranged: false, damage: 3, painChance: 0.8, range: 0.95, windup: 0.55, propagates: true },
  trojan: { speed: 1.8, ranged: true, damage: 10, painChance: 0.6, projectileSpeed: 5.5, windup: 0.5, disguised: true },
  ransomware: { speed: 1.3, ranged: true, damage: 18, painChance: 0.4, projectileSpeed: 4, windup: 0.7, seals: true },
  logicbomb: { speed: 0, ranged: false, damage: 22, painChance: 0, range: 2.2, windup: 1.4, aggroRange: 4, logicBomb: true },
  rat: { speed: 3.2, ranged: true, damage: 8, painChance: 0.6, projectileSpeed: 7, windup: 0.5, retreatAfterShot: 0.7 },
  rootkit: { speed: 1.6, ranged: false, damage: 12, painChance: 0.4, range: 0.95, windup: 0.5, regenerate: true, hidesWhenIdle: true, stealthy: true },
};

export const ENEMY_RADIUS = 0.3;

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => [
  Math.cos((i * Math.PI) / 4),
  Math.sin((i * Math.PI) / 4),
]);
// Doom-ish melee cadence: cooldown + windup + recover lands a ~1.2-1.6 s cycle
// (melee windups telegraph >=0.5 s like Doom's 0.51-0.69 s attack frames).
// Every attack telegraphs >=0.45 s — ranged windups included (RAT is 0.5 s).
// Ranged attackers (trojan, ransomware, rat) keep the slower volley cadence.
const meleeCooldown = () => 0.45 + Math.random() * 0.3;
const rangedCooldown = () => 1.2 + Math.random() * 0.8;

// Malware-type mechanics (SY0-701 2.4): timers, caps and reveal distances.
export const WORM_PROPAGATE_DELAY = 8;
export const WORM_PROPAGATE_MAX = 2;
/** LEVELS: mission-wide cap on spawned worm copies — a worm snowball can no
 *  longer decide a mission on its own. Rises with difficulty: +2 copies total
 *  at d1 up to +8 at d12. The per-worm WORM_PROPAGATE_MAX still applies. */
export function wormPropagateCap(difficulty: number): number {
  return Math.min(8, 2 + Math.round(((difficulty - 1) * 6) / 11));
}
export const TROJAN_REVEAL_DIST = 3;
export const ROOTKIT_SPOT_DIST = 2.5;
export const SEAL_RADIUS = 7;

function mode(e: Entity): string {
  return (e.state.mode as string | undefined) ?? 'idle';
}

function lineOfSight(e: Entity, player: Player, map: WorldMap, dist: number): boolean {
  const angle = Math.atan2(player.y - e.y, player.x - e.x);
  return map.raycast(e.x, e.y, angle, dist + 0.2).dist >= dist - 0.2;
}

/** Wake an enemy into chase mode (shared by sight, sound and damage paths). */
function aggroChase(e: Entity, hooks: AiHooks): void {
  e.state.aggroed = true;
  e.state.mode = 'chase';
  e.state.reaction = 0.25;
  e.state.attackCooldown = 0.25;
  e.state.sighted = true;
  hooks.onSight(e);
}

/**
 * True when `goal` is reachable from `start` treating `doorId` as a wall.
 * All other doors count as passable (the player can open them); only the
 * candidate seal would be truly impassable.
 */
export function reachableWithoutDoor(
  map: WorldMap,
  start: [number, number],
  goal: [number, number],
  doorId: string,
): boolean {
  const key = (x: number, y: number) => `${x},${y}`;
  const sx = Math.floor(start[0]);
  const sy = Math.floor(start[1]);
  const gx = Math.floor(goal[0]);
  const gy = Math.floor(goal[1]);
  const seen = new Set<string>([key(sx, sy)]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [cx, cy] = q.shift()!;
    if (cx === gx && cy === gy) return true;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || seen.has(key(nx, ny))) continue;
      const cell = map.cellAt(nx, ny);
      if (!cell || cell.kind === 'wall') continue;
      if (cell.kind === 'door' && cell.doorId === doorId) continue;
      seen.add(key(nx, ny));
      q.push([nx, ny]);
    }
  }
  return false;
}

/**
 * Pick what a ransomware seals: the nearest closed player-openable door in its
 * zone that the ransomware does not itself sit behind, else the nearest
 * console. Returns null when the zone has nothing worth sealing.
 */
export function pickSealTarget(
  e: Entity,
  entities: Entity[],
  map: WorldMap,
  player: Player,
): SealTarget | null {
  const taken = new Set<string>();
  for (const o of entities) {
    if (o === e) continue;
    const s = o.state.seal as SealTarget | undefined;
    if (s) taken.add(`${s.kind}:${s.id}`);
  }
  let best: SealTarget | null = null;
  let bestD = SEAL_RADIUS;
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const cell = map.cellAt(tx, ty);
      if (!cell || cell.kind !== 'door' || !cell.doorId || cell.locked || cell.secret) continue;
      if (map.doorFrac(cell.doorId) > 0.05 || taken.has(`door:${cell.doorId}`)) continue;
      const d = Math.hypot(tx + 0.5 - e.x, ty + 0.5 - e.y);
      if (d >= bestD) continue;
      if (!reachableWithoutDoor(map, [player.x, player.y], [e.x, e.y], cell.doorId)) continue;
      best = { kind: 'door', id: cell.doorId, x: tx + 0.5, y: ty + 0.5 };
      bestD = d;
    }
  }
  if (best) return best;
  let bestE: SealTarget | null = null;
  let bestEd = SEAL_RADIUS;
  for (const t of entities) {
    if (!t.alive || t === e || t.def.kind !== 'console') continue;
    if (t.state.sealedBy || taken.has(`entity:${t.def.id}`)) continue;
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (d < bestEd) {
      bestE = { kind: 'entity', id: t.def.id, x: t.x, y: t.y };
      bestEd = d;
    }
  }
  return bestE;
}

/** A free spot near `e` to materialise a worm copy, or null if boxed in. */
export function findSpawnSpot(e: Entity, map: WorldMap, player: Player): { x: number; y: number } | null {
  const dirs = [...DIRECTIONS].sort(() => Math.random() - 0.5);
  for (const r of [0.8, 1.2]) {
    for (const [vx, vy] of dirs) {
      const nx = e.x + vx * r;
      const ny = e.y + vy * r;
      if (Math.hypot(nx - player.x, ny - player.y) < 0.9) continue;
      const res = map.resolve(nx, ny, ENEMY_RADIUS);
      if (Math.hypot(res.x - nx, res.y - ny) < 0.01) return { x: res.x, y: res.y };
    }
  }
  return null;
}

/**
 * One-mechanic-per-malware-type behaviours (SY0-701 2.4). Each fires a
 * one-line ticker explanation the first time it triggers.
 */
function runMalwareMechanics(
  e: Entity,
  entities: Entity[],
  map: WorldMap,
  player: Player,
  dt: number,
  hooks: AiHooks,
): void {
  const profile = ENEMY_PROFILES[e.def.threat ?? e.def.sprite] ?? ENEMY_PROFILES.worm;
  const distP = Math.hypot(player.x - e.x, player.y - e.y);
  // TROJAN: disguised payload — looks like a harmless pickup until the player
  // closes in, inspects it, or damages it; then it reveals and attacks.
  if (profile.disguised && !e.state.revealedTrojan) {
    const exposed =
      (distP <= TROJAN_REVEAL_DIST && lineOfSight(e, player, map, distP)) ||
      e.state.revealed === true ||
      e.state.lastHurtAt !== undefined;
    if (exposed) {
      e.state.revealedTrojan = true;
      aggroChase(e, hooks);
      hooks.onNotice?.(e, 'TROJAN: disguised payload — it posed as a harmless pickup until you got close.');
    }
  }
  // WORM: self-propagating — once sighted it keeps copying itself (capped).
  if (profile.propagates && e.state.sighted === true) {
    if (e.state.propT === undefined) {
      e.state.propT = WORM_PROPAGATE_DELAY;
      hooks.onNotice?.(e, 'WORM: self-propagating — clean it before it copies itself.');
    } else if (((e.state.propN as number | undefined) ?? 0) < WORM_PROPAGATE_MAX) {
      e.state.propT = (e.state.propT as number) - dt;
      if ((e.state.propT as number) <= 0) {
        const spot = findSpawnSpot(e, map, player);
        if (spot && (hooks.wormCopyBudget === undefined || hooks.wormCopyBudget.remaining > 0)) {
          const n = (e.state.propN as number | undefined) ?? 0;
          const copy: Entity = {
            def: { ...e.def, id: `${e.def.id}-c${n + 1}`, tags: [] },
            x: spot.x,
            y: spot.y,
            hp: (e.state.maxHp as number | undefined) ?? e.def.hp ?? e.hp,
            alive: true,
            infected: e.infected,
            state: {
              aggroed: true,
              mode: 'chase',
              spawnGrace: 0.75,
              sighted: true,
              propT: 1e9,
              propN: WORM_PROPAGATE_MAX,
            },
          };
          entities.push(copy);
          e.state.propN = n + 1;
          e.state.propT = WORM_PROPAGATE_DELAY;
          if (hooks.wormCopyBudget) hooks.wormCopyBudget.remaining -= 1;
          hooks.onSpawn?.(copy);
        } else {
          e.state.propT = 1;
        }
      }
    }
  }
  // RANSOMWARE: encryption-as-denial — seals the nearest door/console in its
  // zone until killed. Never a door required to reach the ransomware itself.
  if (profile.seals && e.state.sighted === true && e.state.sealChecked !== true) {
    e.state.sealChecked = true;
    const seal = pickSealTarget(e, entities, map, player);
    if (seal) {
      e.state.seal = seal;
      if (seal.kind === 'entity') {
        const t = entities.find((t) => t.def.id === seal.id);
        if (t) t.state.sealedBy = e.def.id;
      }
      hooks.onSeal?.(e, seal);
      hooks.onNotice?.(e, seal.kind === 'door'
        ? 'RANSOMWARE: it encrypted a nearby door — kill it to release the lock.'
        : 'RANSOMWARE: it encrypted a nearby console — kill it to release the lock.');
    }
  }
  // ROOTKIT: hides from plain sight — telemetry (tap), an inspect, damage, or
  // a point-blank encounter exposes it for good.
  if (profile.stealthy && !e.state.revealedRootkit) {
    const spotted =
      e.state.captured === true ||
      e.state.revealed === true ||
      e.state.lastHurtAt !== undefined ||
      (distP <= ROOTKIT_SPOT_DIST && lineOfSight(e, player, map, distP));
    if (spotted) {
      e.state.revealedRootkit = true;
      hooks.onNotice?.(e, 'ROOTKIT: it hides from plain sight — telemetry, damage, or getting close exposes it.');
    }
  }
  // Occasional positional growl while actively hunting.
  if (e.state.sighted === true) {
    e.state.growlT = ((e.state.growlT as number | undefined) ?? (2 + Math.random() * 4)) - dt;
    if ((e.state.growlT as number) <= 0) {
      e.state.growlT = 4 + Math.random() * 5;
      hooks.onGrowl?.(e);
    }
  }
  // Unalerted idle vocalization: quiet positional mutter while the threat
  // hasn't noticed the player yet, so it can be heard before it's seen.
  const hidden = (profile.disguised && !e.state.revealedTrojan) || (profile.stealthy && !e.state.revealedRootkit);
  if (e.state.sighted !== true && e.state.aggroed !== true && !hidden) {
    e.state.idleT = ((e.state.idleT as number | undefined) ?? (1.5 + Math.random() * 4)) - dt;
    if ((e.state.idleT as number) <= 0) {
      e.state.idleT = 3 + Math.random() * 5;
      hooks.onIdle?.(e);
    }
  }
}

function turnToward(e: Entity, angle: number, dt: number, rate: number): void {
  let current = (e.state.facing as number | undefined) ?? angle;
  const difference = Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
  current += Math.max(-rate * dt, Math.min(rate * dt, difference));
  e.state.facing = current;
}

function pickMoveDir(e: Entity, map: WorldMap, dx: number, dy: number): number {
  const angle = Math.atan2(dy, dx);
  const direct = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  const xDir = dx >= 0 ? 0 : 4;
  const yDir = dy >= 0 ? 2 : 6;
  const candidates = [direct, xDir, yDir];
  const randomDirs = Array.from({ length: 8 }, (_, i) => i).sort(() => Math.random() - 0.5);
  for (const dir of [...candidates, ...randomDirs]) {
    const [vx, vy] = DIRECTIONS[dir];
    const res = map.resolve(e.x + vx * 0.02, e.y + vy * 0.02, ENEMY_RADIUS);
    if (Math.hypot(res.x - e.x, res.y - e.y) > 0.001) return dir;
  }
  return direct;
}

export function enemyMoveTo(e: Entity, nx: number, ny: number, map: WorldMap, player: Player): boolean {
  const res = map.resolve(nx, ny, ENEMY_RADIUS);
  const currentDist = Math.hypot(e.x - player.x, e.y - player.y);
  const nextDist = Math.hypot(res.x - player.x, res.y - player.y);
  const contact = player.radius + ENEMY_RADIUS;
  if (currentDist < contact ? nextDist <= currentDist : nextDist < contact) return false;
  if (Math.hypot(res.x - e.x, res.y - e.y) < 0.001) return false;
  e.x = res.x;
  e.y = res.y;
  return true;
}

function setRenderState(e: Entity, now: number): void {
  const currentMode = mode(e);
  const pop = Math.max(0, 1 - ((e.state.popT as number | undefined) ?? 0) / 0.24);
  // ENEMIES: the windup rears toward ~1.5x so the strike telegraphs and looms
  // like Doom's bite, then the recover pops back down; a hit squashes it.
  const wu = currentMode === 'windup'
    ? Math.min(1, ((e.state.windupT as number | undefined) ?? 0) / Math.max(0.01, (e.state.windupDur as number | undefined) ?? 0.4))
    : 0;
  const wuEase = wu * wu * (3 - 2 * wu);
  e.state.scale = currentMode === 'windup'
    ? 1 + 0.5 * wuEase
    : currentMode === 'recover'
      ? 1 + 0.45 * pop
      : currentMode === 'pain'
        ? 0.94
        : 1 + 0.25 * pop;
  e.state.tint = currentMode === 'pain' || (e.state.flashT as number) > 0
    ? 0xff3030
    : 0xffffff;
  if (typeof e.state.phase !== 'number') {
    let hash = 0;
    for (const ch of e.def.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    e.state.phase = (hash % 6283) / 1000; // deterministic phase in [0, 2π)
  }
  e.state.hop = currentMode === 'chase'
    ? Math.abs(Math.sin(now * 11 + (e.state.phase as number))) * 0.04
    : 0;
}

export function updateEntities(
  entities: Entity[],
  map: WorldMap,
  player: Player,
  dt: number,
  hooks: AiHooks,
): void {
  const now = ((entities[0]?.state.aiClock as number | undefined) ?? 0) + dt;
  for (const e of entities) {
    e.state.aiClock = now;
    e.hurtT = Math.max(0, (e.hurtT ?? 0) - dt);
  }
  for (const e of entities) {
    if (!e.alive) {
      // A dead ransomware releases whatever it sealed.
      const seal = e.state.seal as SealTarget | undefined;
      if (seal) {
        delete e.state.seal;
        if (seal.kind === 'entity') {
          const t = entities.find((t) => t.def.id === seal.id);
          if (t) delete t.state.sealedBy;
        }
        hooks.onUnseal?.(e, seal);
      }
      continue;
    }
    if (e.def.kind === 'enemy') {
      const knockX = (e.state.knockVx as number | undefined) ?? 0;
      const knockY = (e.state.knockVy as number | undefined) ?? 0;
      if (knockX !== 0 || knockY !== 0) {
        enemyMoveTo(e, e.x + knockX * dt, e.y + knockY * dt, map, player);
        e.state.knockVx = knockX * Math.exp(-5 * dt);
        e.state.knockVy = knockY * Math.exp(-5 * dt);
      }
      runMalwareMechanics(e, entities, map, player, dt, hooks);
    }
    const ai = e.def.kind === 'enemy' && e.state.aggroed === true ? 'chase' : (e.def.ai ?? 'stand');
    if (ai === 'chase') {
      const profile = ENEMY_PROFILES[e.def.threat ?? e.def.sprite] ?? ENEMY_PROFILES.worm;
      const speed = profile.speed * ((e.state.speedMul as number | undefined) ?? 1);
      // A still-disguised trojan is a planted pickup: it neither spots the
      // player nor moves until the reveal path flips revealedTrojan.
      const disguisedActive = profile.disguised === true && e.state.revealedTrojan !== true;
      if (profile.regenerate) {
        if (e.state.lastHurtAt === undefined) e.state.lastHurtAt = now;
        const sinceHurt = now - (e.state.lastHurtAt as number);
        if (sinceHurt >= 3) {
          let regenT = ((e.state.regenT as number | undefined) ?? 0) + dt;
          while (regenT >= 3) {
            e.hp = Math.min((e.state.maxHp as number | undefined) ?? (e.def.hp ?? e.hp), e.hp + 1);
            regenT -= 3;
          }
          e.state.regenT = regenT;
        } else {
          e.state.regenT = 0;
        }
      }
      let dx = player.x - e.x;
      let dy = player.y - e.y;
      let dist = Math.hypot(dx, dy);
      let currentMode = mode(e);
      e.state.flashT = Math.max(0, ((e.state.flashT as number | undefined) ?? 0) - dt);
      // Materialise grace: freshly spawned enemies can turn/move but cannot start an attack.
      const spawnGrace = Math.max(0, ((e.state.spawnGrace as number | undefined) ?? 0) - dt);
      e.state.spawnGrace = spawnGrace;
      if (e.state.facing === undefined) {
        e.state.facing = Math.atan2(map.h / 2 - e.y, map.w / 2 - e.x);
      }
      let losT = ((e.state.losT as number | undefined) ?? 0) - dt;
      let los = (e.state.los as boolean | undefined) ?? false;
      if (losT <= 0) {
        los = lineOfSight(e, player, map, dist);
        losT = 0.1;
      }
      e.state.los = los;
      e.state.losT = losT;

      // Doom-style infighting: a grudge target (set when another enemy's
      // attack hurt this one) overrides the player as the objective.
      const grudgeId = e.state.grudgeId as string | undefined;
      const grudgeT = Math.max(0, ((e.state.grudgeT as number | undefined) ?? 0) - dt);
      e.state.grudgeT = grudgeT;
      const grudge = grudgeId && grudgeT > 0
        ? entities.find((t) => t.def.id === grudgeId && t.alive && t.def.kind === 'enemy')
        : undefined;
      if (grudgeId && !grudge) delete e.state.grudgeId;
      if (grudge) {
        dx = grudge.x - e.x;
        dy = grudge.y - e.y;
        dist = Math.hypot(dx, dy);
        los = map.raycast(e.x, e.y, Math.atan2(dy, dx), dist + 0.25).dist >= dist - 0.1;
      }

      if (currentMode === 'idle') {
        const facing = e.state.facing as number;
        const toPlayer = Math.atan2(dy, dx);
        const inFront = Math.abs(Math.atan2(Math.sin(toPlayer - facing), Math.cos(toPlayer - facing))) <= Math.PI / 2;
        const baseAggro = (e.state.aggro as number | undefined) ?? 10;
        const hiddenAggro = profile.hidesWhenIdle ? baseAggro / 2 : baseAggro;
        const aggro = Math.min(
          hiddenAggro,
          profile.aggroRange ?? Infinity,
        );
        if (profile.logicBomb) {
          if (los && dist <= aggro && spawnGrace <= 0) {
            e.state.mode = 'windup';
            e.state.windupDur = profile.windup;
            e.state.windupT = 0;
            e.state.sighted = true;
            hooks.onSight(e);
            hooks.onWindup(e, profile.windup);
            currentMode = 'windup';
          }
        } else if (!disguisedActive && spawnGrace <= 0 && ((los && dist < aggro && inFront) || dist < 2.5)) {
          e.state.mode = 'chase';
          e.state.reaction = 0.25;
          e.state.attackCooldown = 0.25;
          e.state.sighted = true;
          hooks.onSight(e);
          currentMode = 'chase';
        }
      }

      const movedirFromAngle = (angle: number) =>
        ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
      if (currentMode === 'chase' && !disguisedActive) {
        e.state.attackCooldown = Math.max(0, ((e.state.attackCooldown as number | undefined) ?? 0) - dt);
        e.state.movecount = ((e.state.movecount as number | undefined) ?? 0) - dt;
        const tryMove = () => {
          const dir = (e.state.movedir as number | undefined) ?? movedirFromAngle(Math.atan2(dy, dx));
          const [mx, my] = DIRECTIONS[dir];
          if (!enemyMoveTo(e, e.x + mx * speed * dt, e.y + my * speed * dt, map, player)) {
            return false;
          }
          turnToward(e, Math.atan2(my, mx), dt, 8);
          e.state.stepT = ((e.state.stepT as number | undefined) ?? 0) - dt;
          if ((e.state.stepT as number) <= 0) {
            hooks.onStep?.(e);
            e.state.stepT = 0.35;
          }
          return true;
        };
        if ((e.state.movecount as number) <= 0) {
          e.state.movedir = pickMoveDir(e, map, dx, dy);
          e.state.movecount = Math.floor(Math.random() * 16) / 35;
        }
        if (!tryMove()) {
          e.state.movedir = pickMoveDir(e, map, dx, dy);
          e.state.movecount = Math.floor(Math.random() * 16) / 35;
          tryMove();
        }
        e.state.reaction = Math.max(0, ((e.state.reaction as number | undefined) ?? 0) - dt);
        const attackCooldown = e.state.attackCooldown as number;
        let checkT = ((e.state.attackCheckT as number | undefined) ?? 0) - dt;
        if (attackCooldown <= 0 && los && checkT <= 0 && spawnGrace <= 0) {
          checkT = 0.1;
          const inAttackRange = profile.ranged
            ? dist < 12 && Math.random() < Math.max(0.08, 0.35 - dist * 0.02)
            : dist < (profile.range ?? 0.95) + 0.1;
          if (((e.state.reaction as number) <= 0) && inAttackRange) {
            e.state.mode = 'windup';
            e.state.windupDur = profile.windup;
            e.state.windupT = 0;
            hooks.onWindup(e, profile.windup);
            currentMode = 'windup';
          }
        }
        e.state.attackCheckT = checkT;
      } else if (currentMode === 'retreat') {
        const retreatT = ((e.state.retreatT as number | undefined) ?? 0) - dt;
        e.state.retreatT = retreatT;
        const away = Math.atan2(e.y - player.y, e.x - player.x);
        const res = map.resolve(
          e.x + Math.cos(away) * speed * dt,
          e.y + Math.sin(away) * speed * dt,
          0.3,
        );
        e.x = res.x;
        e.y = res.y;
        turnToward(e, away, dt, 8);
        if (retreatT <= 0) e.state.mode = 'chase';
      } else if (currentMode === 'windup') {
        const windupT = ((e.state.windupT as number | undefined) ?? 0) + dt;
        e.state.windupT = windupT;
        if (windupT >= (e.state.windupDur as number)) {
          // melee lethality scales with the mission's difficulty dial (speedMul),
          // so late-mission melee drains faster while ranged damage stays flat
          const meleeDmg = Math.max(
            1,
            Math.round(profile.damage * ((e.state.speedMul as number | undefined) ?? 1)),
          );
          if (profile.logicBomb) {
            if (dist <= (profile.range ?? 2.2)) hooks.onMelee(e, meleeDmg);
            e.alive = false;
          } else if (profile.ranged) {
            const aimDx = (grudge ? grudge.x : player.x) - e.x;
            const aimDy = (grudge ? grudge.y : player.y) - e.y;
            const aimDist = Math.hypot(aimDx, aimDy) || 1;
            hooks.onFire(e, {
              x: e.x,
              y: e.y,
              dx: aimDx / aimDist,
              dy: aimDy / aimDist,
              speed: profile.projectileSpeed ?? 5,
              range: 16,
              source: `enemy:${e.def.id}`,
              hostile: true,
              damage: Math.round(profile.damage * ((e.state.dmgMul as number | undefined) ?? 1)),
            });
          } else if (dist < (profile.range ?? 0.95) + 0.25) {
            if (grudge) hooks.onEnemyMelee?.(e, grudge, meleeDmg);
            else hooks.onMelee(e, meleeDmg);
          }
          e.state.mode = profile.retreatAfterShot ? 'retreat' : 'recover';
          if (profile.retreatAfterShot) e.state.retreatT = profile.retreatAfterShot;
          else e.state.recoverT = profile.ranged ? 0.3 : 0.25;
          e.state.popT = 0;
          e.state.attackCooldown = profile.ranged ? rangedCooldown() : meleeCooldown();
        }
      } else if (currentMode === 'recover') {
        const recoverT = ((e.state.recoverT as number | undefined) ?? 0) - dt;
        e.state.recoverT = recoverT;
        if (recoverT <= 0) e.state.mode = 'chase';
      } else if (currentMode === 'pain') {
        const painT = ((e.state.painT as number | undefined) ?? 0) - dt;
        e.state.painT = painT;
        if (painT <= 0) e.state.mode = 'chase';
      }
      const attackJustLanded = currentMode === 'windup' && mode(e) === 'recover';
      e.state.popT = attackJustLanded
        ? 0
        : Math.min(0.24, ((e.state.popT as number | undefined) ?? 0) + dt);
      setRenderState(e, now);
    } else if (ai === 'wander') {
      if (mode(e) === 'pain') {
        const painT = ((e.state.painT as number | undefined) ?? 0) - dt;
        e.state.painT = Math.max(0, painT);
        if (painT <= 0) delete e.state.mode;
        continue;
      }
      if (e.def.kind === 'enemy') {
        // Wanderers aggro on sight/sound like a chaser once the player is
        // close, in front of them, and visible (or point-blank).
        const wdx = player.x - e.x;
        const wdy = player.y - e.y;
        const wdist = Math.hypot(wdx, wdy);
        const wProfile = ENEMY_PROFILES[e.def.threat ?? e.def.sprite] ?? ENEMY_PROFILES.worm;
        const wFacing = (e.state.facing as number | undefined) ?? Math.atan2(wdy, wdx);
        const toPlayer = Math.atan2(wdy, wdx);
        const inFront =
          Math.abs(Math.atan2(Math.sin(toPlayer - wFacing), Math.cos(toPlayer - wFacing))) <= Math.PI / 2;
        const baseAggro = (e.state.aggro as number | undefined) ?? 10;
        const aggro = Math.min(
          wProfile.hidesWhenIdle ? baseAggro / 2 : baseAggro,
          wProfile.aggroRange ?? Infinity,
        );
        const spawnGrace = Math.max(0, ((e.state.spawnGrace as number | undefined) ?? 0) - dt);
        e.state.spawnGrace = spawnGrace;
        if (spawnGrace <= 0 && ((lineOfSight(e, player, map, wdist) && wdist < aggro && inFront) || wdist < 2.5)) {
          aggroChase(e, hooks);
          continue;
        }
      }
      const t = (e.state.wanderT = ((e.state.wanderT as number) ?? 0) + dt);
      if (t > 2) {
        e.state.wanderT = 0;
        e.state.wanderA = Math.random() * Math.PI * 2;
      }
      const a = (e.state.wanderA as number) ?? 0;
      const nx = e.x + Math.cos(a) * 0.5 * dt;
      const ny = e.y + Math.sin(a) * 0.5 * dt;
      if (e.def.kind === 'enemy') {
        enemyMoveTo(e, nx, ny, map, player);
      } else {
        const res = map.resolve(nx, ny, ENEMY_RADIUS);
        e.x = res.x;
        e.y = res.y;
      }
      turnToward(e, a, dt, 2.5);
    }
  }

  const enemies = entities.filter((e) => e.alive && e.def.kind === 'enemy' && e.def.ai === 'chase');
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      if (dist >= 0.6) continue;
      const push = (0.6 - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      enemyMoveTo(a, a.x - nx * push, a.y - ny * push, map, player);
      enemyMoveTo(b, b.x + nx * push, b.y + ny * push, map, player);
    }
  }
}

export function damageEntity(e: Entity, dmg: number, fromDx: number, fromDy: number): 'killed' | 'hurt' {
  e.hp -= dmg;
  if (e.hp <= 0) return 'killed';
  hurtEntity(e, fromDx, fromDy);
  return 'hurt';
}

export function hurtEntity(e: Entity, fromDx: number, fromDy: number, rng = Math.random): void {
  const length = Math.hypot(fromDx, fromDy) || 1;
  // Hit-flash window: ~100 ms pinned so the full-sprite flash holds >=0.9
  // brightness for the ~90 ms the eye needs to register it (renderer reads
  // hurtT each frame, then the flash decays).
  e.hurtT = 0.1;
  // Melee-range hits knock back much less so follow-up swings still connect
  // (a full 1.5 impulse shoved worms out of the 1.5-tile keyboard arc and
  // turned a 3-hit kill into a 7-swing chase); ranged hits keep the shove.
  const knock = length < 2 ? 0.55 : 1.5;
  e.state.knockVx = (fromDx / length) * knock;
  e.state.knockVy = (fromDy / length) * knock;
  if ((e.def.ai === 'chase' || e.def.ai === 'wander') && mode(e) === 'idle') {
    e.state.aggroed = true;
    e.state.mode = 'chase';
    e.state.reaction = 0.25;
    e.state.sighted = true;
  }
  e.state.lastHurtAt = (e.state.aiClock as number | undefined) ?? 0;
  const painChance = ENEMY_PROFILES[e.def.threat ?? e.def.sprite]?.painChance ?? 0;
  if (painChance > 0 && rng() < painChance) {
    e.state.mode = 'pain';
    e.state.painT = 0.2;
  }
}

export function alertNear(entities: Entity[], x: number, y: number, radius: number): void {
  for (const e of entities) {
    if (!e.alive || (e.def.ai !== 'chase' && e.def.ai !== 'wander') || mode(e) !== 'idle') continue;
    if (Math.hypot(e.x - x, e.y - y) > radius) continue;
    e.state.aggroed = true;
    e.state.mode = 'chase';
    e.state.reaction = 0.25;
    e.state.attackCooldown = 0.25;
    e.state.sighted = true;
  }
}

export function traceShot(
  x: number,
  y: number,
  dx: number,
  dy: number,
  range: number,
  entities: Entity[],
  map: WorldMap,
): { hit: Entity | null; dist: number; x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length === 0 || range <= 0) return { hit: null, dist: 0, x, y };
  const dirX = dx / length;
  const dirY = dy / length;
  const maxD = Math.min(range, map.raycast(x, y, Math.atan2(dirY, dirX), range).dist);
  let hit: Entity | null = null;
  let dist = maxD;
  for (const e of entities) {
    if (!e.alive) continue;
    // floor pickups (charges, medkits, disks) shouldn't soak scan shots
    if (e.def.kind === 'item') continue;
    const toX = e.x - x;
    const toY = e.y - y;
    const along = toX * dirX + toY * dirY;
    const perpendicular = Math.abs(toX * dirY - toY * dirX);
    if (along <= 0 || along > maxD || perpendicular >= 0.45 || along >= dist) continue;
    hit = e;
    dist = along;
  }
  return { hit, dist, x: x + dirX * dist, y: y + dirY * dist };
}

export function updateProjectiles(
  projectiles: Projectile[],
  entities: Entity[],
  map: WorldMap,
  dt: number,
  player?: Player,
): { p: Projectile; hit: Entity | null; hitPlayer?: boolean; x: number; y: number }[] {
  const events: { p: Projectile; hit: Entity | null; hitPlayer?: boolean; x: number; y: number }[] = [];
  for (const p of projectiles) {
    if (!p.alive) continue;
    const step = p.speed * dt;
    p.x += p.dx * step;
    p.y += p.dy * step;
    p.traveled += step;
    if (p.cosmetic) {
      if (p.traveled >= p.range || map.blockedF(p.x, p.y)) p.alive = false;
      continue;
    }
    if (p.traveled >= p.range || map.blockedF(p.x, p.y)) {
      p.alive = false;
      events.push({ p, hit: null, x: p.x, y: p.y });
      continue;
    }
    if (p.hostile) {
      const shooterId = p.source?.startsWith('enemy:') ? p.source.slice(6) : null;
      if (player && Math.hypot(player.x - p.x, player.y - p.y) < player.radius + 0.15) {
        p.alive = false;
        events.push({ p, hit: null, hitPlayer: true, x: p.x, y: p.y });
      } else {
        // hostile projectiles can strike other enemies → Doom-style infighting
        for (const e of entities) {
          if (!e.alive || e.def.kind !== 'enemy' || e.def.id === shooterId) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < 0.45) {
            p.alive = false;
            events.push({ p, hit: e, x: p.x, y: p.y });
            break;
          }
        }
      }
    } else {
      for (const e of entities) {
        if (!e.alive) continue;
        // floor pickups (charges, medkits, disks) shouldn't eat tool fire
        if (e.def.kind === 'item') continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 0.45) {
          p.alive = false;
          events.push({ p, hit: e, x: p.x, y: p.y });
          break;
        }
      }
    }
  }
  return events;
}
