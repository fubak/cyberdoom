import type { Entity, Projectile } from '../core/types';
import type { WorldMap } from './map';
import type { Player } from './player';

export interface AiHooks {
  onSight(e: Entity): void;
  onWindup(e: Entity, dur: number): void;
  onMelee(e: Entity, dmg: number): void;
  onFire(e: Entity, proj: Omit<Projectile, 'alive' | 'traveled'>): void;
  onStep?(e: Entity): void;
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
}

export const ENEMY_PROFILES: Record<string, EnemyProfile> = {
  worm: { speed: 2.6, ranged: false, damage: 6, painChance: 0.8, range: 0.95, windup: 0.3 },
  trojan: { speed: 1.8, ranged: true, damage: 10, painChance: 0.6, projectileSpeed: 5.5, windup: 0.5 },
  ransomware: { speed: 1.3, ranged: true, damage: 18, painChance: 0.4, projectileSpeed: 4, windup: 0.7 },
  logicbomb: { speed: 0, ranged: false, damage: 22, painChance: 0, range: 2.2, windup: 1.4, aggroRange: 4, logicBomb: true },
  rat: { speed: 3.2, ranged: true, damage: 8, painChance: 0.6, projectileSpeed: 7, windup: 0.35, retreatAfterShot: 0.7 },
  rootkit: { speed: 1.6, ranged: false, damage: 12, painChance: 0.4, range: 0.95, windup: 0.5, regenerate: true },
};

export const ENEMY_RADIUS = 0.3;

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => [
  Math.cos((i * Math.PI) / 4),
  Math.sin((i * Math.PI) / 4),
]);
const randomCooldown = () => 1.2 + Math.random() * 0.8;

function mode(e: Entity): string {
  return (e.state.mode as string | undefined) ?? 'idle';
}

function lineOfSight(e: Entity, player: Player, map: WorldMap, dist: number): boolean {
  const angle = Math.atan2(player.y - e.y, player.x - e.x);
  return map.raycast(e.x, e.y, angle, dist + 0.2).dist >= dist - 0.2;
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
  e.state.scale = currentMode === 'windup' ? 1 : 1 + 0.25 * pop;
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
    if (!e.alive) continue;
    if (e.def.kind === 'enemy') {
      const knockX = (e.state.knockVx as number | undefined) ?? 0;
      const knockY = (e.state.knockVy as number | undefined) ?? 0;
      if (knockX !== 0 || knockY !== 0) {
        enemyMoveTo(e, e.x + knockX * dt, e.y + knockY * dt, map, player);
        e.state.knockVx = knockX * Math.exp(-5 * dt);
        e.state.knockVy = knockY * Math.exp(-5 * dt);
      }
    }
    const ai = e.def.ai ?? 'stand';
    if (ai === 'chase') {
      const profile = ENEMY_PROFILES[e.def.threat ?? e.def.sprite] ?? ENEMY_PROFILES.worm;
      const speed = profile.speed * ((e.state.speedMul as number | undefined) ?? 1);
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
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);
      let currentMode = mode(e);
      e.state.flashT = Math.max(0, ((e.state.flashT as number | undefined) ?? 0) - dt);
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

      if (currentMode === 'idle') {
        const facing = e.state.facing as number;
        const toPlayer = Math.atan2(dy, dx);
        const inFront = Math.abs(Math.atan2(Math.sin(toPlayer - facing), Math.cos(toPlayer - facing))) <= Math.PI / 2;
        const baseAggro = (e.state.aggro as number | undefined) ?? 10;
        const hiddenAggro = (e.def.threat ?? e.def.sprite) === 'rootkit' ? baseAggro / 2 : baseAggro;
        const aggro = Math.min(
          hiddenAggro,
          profile.aggroRange ?? Infinity,
        );
        if (profile.logicBomb) {
          if (los && dist <= aggro) {
            e.state.mode = 'windup';
            e.state.windupDur = profile.windup;
            e.state.windupT = 0;
            e.state.sighted = true;
            hooks.onSight(e);
            hooks.onWindup(e, profile.windup);
            currentMode = 'windup';
          }
        } else if ((los && dist < aggro && inFront) || dist < 2.5) {
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
      if (currentMode === 'chase') {
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
        if (attackCooldown <= 0 && los && checkT <= 0) {
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
          if (profile.logicBomb) {
            if (dist <= (profile.range ?? 2.2)) hooks.onMelee(e, profile.damage);
            e.alive = false;
          } else if (profile.ranged) {
            const aimDx = player.x - e.x;
            const aimDy = player.y - e.y;
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
              damage: profile.damage,
            });
          } else if (dist < (profile.range ?? 0.95) + 0.25) {
            hooks.onMelee(e, profile.damage);
          }
          e.state.mode = profile.retreatAfterShot ? 'retreat' : 'recover';
          if (profile.retreatAfterShot) e.state.retreatT = profile.retreatAfterShot;
          else e.state.recoverT = 0.3;
          e.state.popT = 0;
          e.state.attackCooldown = randomCooldown();
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
  e.state.lastHurtAt = (e.state.aiClock as number | undefined) ?? 0;
  const wasIdle = mode(e) === 'idle';
  if (wasIdle) e.state.sighted = true;
  const chasing = e.def.ai === 'chase';
  e.state.mode = chasing ? 'chase' : 'pain';
  e.state.painT = 0.3;
  e.state.flashT = 0.12;
  e.hurtT = 0.25;
  e.state.knockVx = (fromDx / length) * 1.5;
  e.state.knockVy = (fromDy / length) * 1.5;
  if (chasing && wasIdle) {
    e.state.reaction = 0.25;
    e.state.sighted = true;
  }
  const painChance = (ENEMY_PROFILES[e.def.threat ?? e.def.sprite] ?? ENEMY_PROFILES.worm).painChance;
  if (painChance > 0 && rng() < painChance) {
    e.state.mode = 'pain';
    e.state.painT = 0.2;
  }
}

export function alertNear(entities: Entity[], x: number, y: number, radius: number): void {
  for (const e of entities) {
    if (!e.alive || e.def.ai !== 'chase' || mode(e) !== 'idle') continue;
    if (Math.hypot(e.x - x, e.y - y) > radius) continue;
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
      if (player && Math.hypot(player.x - p.x, player.y - p.y) < player.radius + 0.15) {
        p.alive = false;
        events.push({ p, hit: null, hitPlayer: true, x: p.x, y: p.y });
      }
    } else {
      for (const e of entities) {
        if (!e.alive) continue;
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
