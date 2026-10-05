import './ui/style.css';
import { EventBus } from './core/events';
import type { Entity, Gender, Projectile, Screen, ToolDef } from './core/types';
import { WorldMap } from './engine/map';
import { Input } from './engine/input';
import { EYE_HEIGHT, MOVE, Player } from './engine/player';
import { alertNear, hurtEntity, updateEntities, updateProjectiles } from './engine/ai';
import { Audio } from './engine/audio';
import { Feel, WeaponSwitch } from './engine/feel';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import * as screens from './ui/screens';
import { MissionRuntime } from './missions/runtime';
import { missionRegistry } from './content/missions';
import { toolForSlot, sortedTools } from './tools';

/**
 * main.ts — boot + top-level state machine:
 *   title → character-select → mission-select → briefing → play → debrief
 * Owns the fixed-timestep loop and wires engine/render/tools/missions/ui
 * together through core contracts only.
 */

const FIXED_DT = 1 / 60;
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';

class Game {
  private bus = new EventBus();
  private audio = new Audio();
  private feel = new Feel();
  private renderer!: Renderer;
  private hud!: Hud;
  private input!: Input;
  private screen: Screen = 'title';
  private gender: Gender = 'male';
  private role = 'analyst';
  private overlay: HTMLElement | null = null;

  // play-state
  private map: WorldMap | null = null;
  private runtime: MissionRuntime | null = null;
  private player: Player | null = null;
  private projectiles: Projectile[] = [];
  private currentTool: ToolDef = sortedTools()[0];
  private weaponSwitch = new WeaponSwitch(this.currentTool);
  private ammo = new Map<string, number>();
  private cooldown = 0;
  private acc = 0;
  private last = 0;
  private simT = 0;
  private fireQueued = false;
  private lastHurtMessageT = -Infinity;
  private endTimer: number | null = null;
  private endCalled = false;
  private deathDrop = 0;
  private deathRoll = 0;
  private exitReached = false;
  private stepPan = 1;

  constructor(app: HTMLElement) {
    const viewport = document.createElement('div');
    viewport.id = 'viewport';
    app.appendChild(viewport);
    this.renderer = new Renderer(viewport);
    this.renderer.canvas.classList.add('gl');
    this.input = new Input(this.renderer.canvas, () => this.audio.unlock());
    this.hud = new Hud(viewport);
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    viewport.appendChild(cross);

    this.bus.on('message', ({ text, kind }) => this.hud.pushMessage(text, kind ?? 'info'));
    this.bus.on('tool-used', ({ toolId }) => {
      const sound = toolId === 'usb' ? 'scan'
        : toolId === 'keyboard' ? 'keyboard'
          : toolId === 'mouse' ? 'mouse'
            : toolId === 'badge' ? 'badge' : 'click';
      this.audio.sfx(sound, this.player ? { x: this.player.x, y: this.player.y } : {});
    });
    this.bus.on('cleaned', ({ entityId }) => {
      const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
      if (e?.def.kind === 'enemy') {
        this.audio.sfx('enemy-death', { x: e.x, y: e.y });
      } else {
        this.audio.sfx('clean');
      }
    });
    this.bus.on('badge-door', ({ doorId, allowed }) => {
      if (allowed) {
        if (this.map && this.map.doorFrac(doorId) < 1) {
          const firstOpen = this.map.doorFrac(doorId) === 0;
          this.map.startOpening(doorId);
          if (firstOpen) {
            this.renderer.setDoorOpen(doorId);
            const cell = this.map.def.grid.flatMap((row, y) =>
              [...row].map((ch, x) => ({ ch, x, y })),
            ).find(({ ch }) => this.map?.def.legend[ch]?.doorId === doorId);
            this.audio.sfx('door', cell ? { x: cell.x + 0.5, y: cell.y + 0.5 } : {});
          }
        }
      } else {
        this.audio.sfx('denied');
      }
    });
    this.bus.on('inspect', () => this.audio.sfx('inspect', this.player ? { x: this.player.x, y: this.player.y } : {}));
    this.bus.on('pickup', () => {
      this.audio.sfx('pickup', this.player ? { x: this.player.x, y: this.player.y } : {});
    });
    this.bus.on('reach-exit', () => this.audio.sfx('win'));
    // deep link: ?mission=m01&gender=female
    const dm = params.get('mission');
    const dg = params.get('gender');
    if (dm && missionRegistry.get(dm)) {
      this.gender = dg === 'female' ? 'female' : 'male';
      this.startMission(dm);
    } else {
      this.showTitle();
    }

    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
  }

  // ---------- screens ----------

  private setScreen(s: Screen, node: HTMLElement | null): void {
    this.screen = s;
    if (this.overlay) this.overlay.remove();
    this.overlay = node;
    if (node) document.getElementById('viewport')!.appendChild(node);
  }

  private showTitle(): void {
    this.setScreen('title', screens.titleScreen(() => this.showCharSelect()));
  }

  private showCharSelect(): void {
    this.setScreen('character-select', screens.characterSelect((g) => {
      this.gender = g;
      this.audio.sfx('click');
      this.showMissionSelect();
    }));
  }

  private showMissionSelect(): void {
    this.setScreen('mission-select', screens.missionSelect((id) => this.showBriefing(id)));
  }

  private showBriefing(id: string): void {
    const m = missionRegistry.require(id);
    this.setScreen('briefing', screens.briefing(m, () => this.startMission(id)));
  }

  private showDebrief(): void {
    const rt = this.runtime!;
    const mission = rt.mission;
    document.exitPointerLock?.();
    this.setScreen('debrief', screens.debrief({
      mission,
      won: rt.finished === 'won',
      score: rt.score,
      scoreLog: rt.scoreLog,
      objectives: rt.objectiveSummary(),
      onDone: () => this.showMissionSelect(),
    }));
  }

  // ---------- mission lifecycle ----------

  private startMission(id: string): void {
    const mission = missionRegistry.require(id);
    this.map = new WorldMap(mission.map);
    this.runtime = new MissionRuntime(mission, this.bus);
    const sp = mission.map.spawn;
    this.player = new Player(sp.x, sp.y, sp.angle);
    this.player.snap();
    this.projectiles = [];
    this.feel = new Feel();
    this.ammo.clear();
    for (const t of sortedTools()) {
      if (t.ammo) this.ammo.set(t.ammo.resource, t.ammo.start);
    }
    this.currentTool = sortedTools()[0];
    this.weaponSwitch = new WeaponSwitch(this.currentTool);
    this.cooldown = 0;
    this.fireQueued = false;
    this.simT = 0;
    this.lastHurtMessageT = -Infinity;
    this.endTimer = null;
    this.endCalled = false;
    this.deathDrop = 0;
    this.deathRoll = 0;
    this.exitReached = false;
    this.renderer.buildLevel(this.map, mission.map);
    this.audio.setVoice(this.gender);
    this.audio.setListener(this.player.x, this.player.y, this.player.angle);
    this.audio.startAmbience();
    this.setScreen('play', null);
    if (!DEBUG) this.input.requestLock();
    this.hud.clearMessages();
    this.hud.pushMessage(`${mission.title} — good luck, analyst`, 'info');
  }

  private endMission(): void {
    if (this.endCalled) return;
    this.endCalled = true;
    this.audio.stopAmbience();
    this.showDebrief();
  }

  // ---------- per-frame ----------

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      this.input.poll();
      this.tick(FIXED_DT);
      this.acc -= FIXED_DT;
    }
    if (this.screen === 'play' && this.map && this.player && this.runtime) {
      const mouseDX = this.input.consumeMouseDX();
      if (this.runtime.finished === null) this.player.angle += mouseDX * 0.0028;
      this.audio.setListener(this.player.x, this.player.y, this.player.angle);
      this.renderer.syncEntities(this.runtime.entities, this.projectiles);
      const alpha = this.acc / FIXED_DT;
      const shake = this.feel.shake(this.simT);
      const lostEnd = this.runtime.finished === 'lost' && this.endTimer !== null;
      const pose = {
        x: this.player.prevX + (this.player.x - this.player.prevX) * alpha + shake.x,
        y: this.player.prevY + (this.player.y - this.player.prevY) * alpha + shake.y,
        angle: this.player.angle + shake.yaw,
        dz: lostEnd ? -(EYE_HEIGHT - 0.15) * this.deathDrop : this.player.viewBobZ,
        roll: lostEnd ? this.deathRoll : 0,
      };
      this.renderer.render(this.player, pose);
      const ammoSpec = this.currentTool.ammo;
      this.hud.draw({
        integrity: this.player.integrity,
        ammo: ammoSpec ? (this.ammo.get(ammoSpec.resource) ?? 0) : null,
        ammoName: ammoSpec?.resource ?? '',
        tool: this.currentTool,
        bob: this.player.bob,
        cooldownFrac: this.cooldown / this.currentTool.cooldown,
        gender: this.gender,
        viewmodelOffset: {
          x: this.player.weaponBobX,
          y: this.player.weaponBobY + this.weaponSwitch.offsetY + (lostEnd ? 240 : 0),
        },
        credentials: this.role,
        objectives: this.runtime.objectiveSummary(),
      });
    }
  }

  private tick(dt: number): void {
    if (this.screen !== 'play' || !this.map || !this.player || !this.runtime) return;
    const p = this.player;
    const map = this.map;
    const runtime = this.runtime;
    this.simT += dt;
    this.feel.update(dt);

    // Weapon changes lower before swapping and raise afterward.
    const ending = runtime.finished !== null;
    if (!ending && this.input.slotPressed) {
      const t = toolForSlot(this.input.slotPressed);
      if (t) this.weaponSwitch.request(t);
    }
    const wheel = this.input.consumeWheel();
    if (!ending && wheel !== 0) {
      const tools = sortedTools();
      const i = tools.indexOf(this.currentTool);
      this.weaponSwitch.request(tools[(i + wheel + tools.length) % tools.length]);
    }
    const switched = this.weaponSwitch.update(dt);
    if (switched) {
      this.currentTool = switched;
      this.audio.sfx('switch');
    }

    const solids = runtime.entities
      .filter((e) => e.alive && ['enemy', 'npc', 'workstation', 'console'].includes(e.def.kind))
      .map((e) => ({ x: e.x, y: e.y, r: 0.3 }));
    const fwd =
      !ending ? (this.input.down('KeyW') ? 1 : 0) - (this.input.down('KeyS') ? 1 : 0) : 0;
    const strafe =
      !ending ? (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0) : 0;
    const keyTurn =
      !ending ? (this.input.down('ArrowLeft') ? -1 : 0) + (this.input.down('ArrowRight') ? 1 : 0) : 0;
    const run = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    p.move(map, fwd, strafe, run, keyTurn, dt, solids);
    if (p.consumeStep()) {
      this.audio.sfx('step', { pan: this.stepPan * 0.15 });
      this.stepPan *= -1;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hud.tick(dt);

    let fireIntent = !ending && this.input.firePressed;
    const spec = this.currentTool.ammo;
    if (this.weaponSwitch.ready && fireIntent && this.cooldown > 0 && this.cooldown <= 0.15) {
      this.fireQueued = true;
    }
    fireIntent ||= !ending && (this.fireQueued || (!!spec && this.input.fireHeld));
    if (!this.weaponSwitch.ready) fireIntent = false;
    if (fireIntent && this.cooldown <= 0) {
      const have = spec ? (this.ammo.get(spec.resource) ?? 0) : Infinity;
      if (have <= 0) {
        this.hud.pushMessage(`Out of ${spec!.resource} — find more charges`, 'warn');
        this.audio.sfx('denied');
      } else {
        if (spec) this.ammo.set(spec.resource, have - 1);
        this.cooldown = this.currentTool.cooldown;
        this.useTool(this.currentTool);
      }
      this.fireQueued = false;
    } else if (this.cooldown <= 0) {
      this.fireQueued = false;
    }

    if (!ending && this.weaponSwitch.ready && this.input.usePressed && this.cooldown <= 0) {
      const ctx = this.toolCtx();
      const door = ctx.isDoorAhead();
      if (door && !map.isDoorOpen(door.doorId)) {
        this.audio.sfx('oof');
        this.hud.pushMessage('Door is badge-controlled — switch to BADGE (4)', 'warn');
      } else if (!ctx.aimEntity(1.4, 0.5) && ctx.wallDistance < 1.2) {
        this.audio.sfx('oof');
      } else {
        this.cooldown = 0.3;
        this.useTool(toolForSlot(1)!);
      }
    }

    updateEntities(runtime.entities, map, p, dt, {
      onSight: (e) => this.audio.sfx(`sight-${e.def.sprite}`, { x: e.x, y: e.y }),
      onWindup: (e, dur) => this.audio.sfx('windup', { x: e.x, y: e.y, dur }),
      onMelee: (e, dmg) => {
        this.audio.sfx('bite', { x: e.x, y: e.y });
        this.hurtPlayer(dmg, e.x, e.y);
      },
      onFire: (e, projectile) => {
        this.projectiles.push({ ...projectile, alive: true, traveled: 0 });
        this.audio.sfx('enemy-fire', { x: e.x, y: e.y });
      },
    });

    for (const { p: projectile, hit, hitPlayer, x, y } of updateProjectiles(
      this.projectiles,
      runtime.entities,
      map,
      dt,
      p,
    )) {
      this.audio.sfx('impact', { x, y, gain: projectile.hostile ? 1 : 0.5 });
      if (hitPlayer && projectile.hostile) {
        this.hurtPlayer(projectile.damage ?? 10, x - projectile.dx, y - projectile.dy);
      }
      if (hit) {
        if (hit.infected) {
          hit.hp -= 1;
          if (hit.hp <= 0) {
            this.bus.emit('cleaned', { entityId: hit.def.id });
          } else {
            if (hit.def.kind === 'enemy' && hit.hp > 1) {
              hurtEntity(hit, projectile.dx, projectile.dy);
              this.audio.sfx('enemy-pain', { x: hit.x, y: hit.y });
            }
            this.hud.pushMessage('Hit! It needs another charge.', 'info');
          }
        } else {
          this.hud.pushMessage('The charge fizzles — that target is not infected.', 'warn');
        }
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.alive);

    for (const e of runtime.entities) {
      if (!e.alive || e.def.kind !== 'item' || !e.def.grants) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 0.6) {
        e.alive = false;
        const { resource, amount } = e.def.grants;
        this.ammo.set(resource, Math.min(20, (this.ammo.get(resource) ?? 0) + amount));
        this.bus.emit('pickup', { entityId: e.def.id });
        this.hud.pushMessage(`+${amount} ${resource}`, 'good');
      }
    }
    const cell = map.cellAtF(p.x, p.y);
    if (cell?.kind === 'exit' && !runtime.finished && !this.exitReached) {
      this.exitReached = true;
      this.bus.emit('reach-exit', {});
    }

    map.updateDoors(dt);

    if (runtime.finished && this.endTimer === null) {
      this.endTimer = runtime.finished === 'lost' ? 1.6 : 0.5;
    }
    if (this.endTimer !== null) {
      if (runtime.finished === 'lost') {
        this.deathDrop += (1 - this.deathDrop) * Math.min(1, dt * 4);
        this.deathRoll += (0.35 - this.deathRoll) * Math.min(1, dt * 4);
      }
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.endMission();
    }
  }

  private useTool(tool: ToolDef): void {
    if (!this.player || !this.runtime || !this.weaponSwitch.ready) return;
    alertNear(this.runtime.entities, this.player.x, this.player.y, 8);
    tool.use(this.toolCtx());
  }

  private hurtPlayer(dmg: number, sourceX: number, sourceY: number): void {
    const p = this.player;
    const runtime = this.runtime;
    if (!p || !runtime || runtime.finished) return;
    const awayX = p.x - sourceX;
    const awayY = p.y - sourceY;
    const distance = Math.hypot(awayX, awayY) || 1;
    p.damage(dmg, sourceX, sourceY);
    this.feel.hurt(dmg);
    this.audio.sfx('hurt');
    const impulse = MOVE.friction * (0.3 + 0.2 * Math.min(1, dmg / 20));
    p.applyImpulse((awayX / distance) * impulse, (awayY / distance) * impulse);
    if (this.simT - this.lastHurtMessageT >= 1.5) {
      this.lastHurtMessageT = this.simT;
      this.hud.pushMessage(`${runtime.entities.find((e) => e.x === sourceX && e.y === sourceY)?.def.inspect?.label ?? 'Malware'} is draining your integrity!`, 'bad');
    }
    if (!p.alive) {
      this.audio.sfx('death');
      this.bus.emit('player-down', {});
    }
  }

  // ---------- tool context ----------

  private toolCtx() {
    const p = this.player!;
    const map = this.map!;
    const rt = this.runtime!;
    return {
      playerX: p.x,
      playerY: p.y,
      playerAngle: p.angle,
      entities: rt.entities,
      projectiles: this.projectiles,
      wallDistance: map.raycast(p.x, p.y, p.angle).dist,
      isDoorAhead: () => {
        const r = map.raycast(p.x, p.y, p.angle, 1.6);
        const c = r.cell;
        if (c?.kind === 'door') {
          return { doorId: c.doorId ?? '', accessRole: c.accessRole, dist: r.dist };
        }
        return null;
      },
      openDoor: (doorId: string) => {
        const firstOpen = map.doorFrac(doorId) === 0;
        map.startOpening(doorId);
        if (firstOpen) {
          this.renderer.setDoorOpen(doorId);
          this.audio.sfx('door', { x: p.x, y: p.y });
        }
      },
      bus: this.bus,
      fireProjectile: (proj: Omit<Projectile, 'alive' | 'traveled'>) => {
        this.projectiles.push({ ...proj, alive: true, traveled: 0 });
      },
      aimEntity: (maxDist: number, maxAngle: number) => {
        let best: Entity | null = null;
        let bestD = maxDist;
        for (const e of rt.entities) {
          if (!e.alive) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > bestD) continue;
          let da = Math.atan2(dy, dx) - p.angle;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > maxAngle) continue;
          // line of sight
          if (map.raycast(p.x, p.y, p.angle, d).dist < d - 0.3) continue;
          best = e;
          bestD = d;
        }
        return best;
      },
      authorizedRoles: this.runtime!.mission.authorizedRoles,
      role: this.role,
    };
  }

  // ---------- debug hooks ----------

  private exposeDebug(): void {
    const g = this;
    (window as unknown as { __cd: unknown }).__cd = {
      state() {
        return {
          screen: g.screen,
          mission: g.runtime?.mission.id ?? null,
          x: g.player?.x ?? null,
          y: g.player?.y ?? null,
          angle: g.player?.angle ?? null,
          integrity: g.player?.integrity ?? null,
          tool: g.currentTool.id,
          score: g.runtime?.score ?? null,
          objectives:
            g.runtime?.objectives.map((o) => ({
              id: o.def.id,
              done: o.done,
              failed: o.failed,
              progress: o.progress,
            })) ?? [],
        };
      },
      startMission(id: string, gender?: string) {
        g.gender = gender === 'female' ? 'female' : 'male';
        g.startMission(id);
      },
      teleport(x: number, y: number, angle?: number) {
        if (!g.player) return;
        g.player.x = x;
        g.player.y = y;
        if (angle !== undefined) g.player.angle = angle;
        g.player.snap();
      },
      setTool(slot: number) {
        const t = toolForSlot(slot);
        if (t) {
          g.currentTool = t;
          g.weaponSwitch = new WeaponSwitch(t);
        }
      },
    };
  }
}

const app = document.getElementById('app')!;
new Game(app);
