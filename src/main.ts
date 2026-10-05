import './ui/style.css';
import { EventBus } from './core/events';
import type { Entity, Gender, Projectile, Screen, ToolDef } from './core/types';
import { WorldMap } from './engine/map';
import { Input } from './engine/input';
import { Player } from './engine/player';
import { updateEntities, updateProjectiles } from './engine/ai';
import { Audio } from './engine/audio';
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
  private ammo = new Map<string, number>();
  private cooldown = 0;
  private acc = 0;
  private last = 0;

  constructor(app: HTMLElement) {
    const viewport = document.createElement('div');
    viewport.id = 'viewport';
    app.appendChild(viewport);
    this.renderer = new Renderer(viewport);
    this.renderer.canvas.classList.add('gl');
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(viewport);
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    viewport.appendChild(cross);

    this.bus.on('message', ({ text, kind }) => this.hud.pushMessage(text, kind ?? 'info'));
    this.bus.on('tool-used', ({ toolId }) => {
      this.audio.sfx(toolId === 'usb' ? 'scan' : toolId === 'keyboard' ? 'keyboard' : 'click');
    });
    this.bus.on('cleaned', () => this.audio.sfx('clean'));
    this.bus.on('badge-door', ({ doorId, allowed }) => {
      if (allowed) {
        this.map?.openDoor(doorId);
        this.renderer.setDoorOpen(doorId);
        this.audio.sfx('door');
      } else {
        this.audio.sfx('denied');
      }
    });
    this.bus.on('inspect', () => this.audio.sfx('inspect'));
    this.bus.on('pickup', () => this.audio.sfx('pickup'));
    this.bus.on('reach-exit', () => this.audio.sfx('win'));
    this.bus.on('player-down', () => this.audio.sfx('lose'));

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
    this.projectiles = [];
    this.ammo.clear();
    for (const t of sortedTools()) {
      if (t.ammo) this.ammo.set(t.ammo.resource, t.ammo.start);
    }
    this.currentTool = sortedTools()[0];
    this.cooldown = 0;
    this.renderer.buildLevel(this.map, mission.map);
    this.setScreen('play', null);
    if (!DEBUG) this.input.requestLock();
    this.hud.clearMessages();
    this.hud.pushMessage(`${mission.title} — good luck, analyst`, 'info');
  }

  private endMission(): void {
    this.showDebrief();
  }

  // ---------- per-frame ----------

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.acc += dt;
    this.input.poll();
    while (this.acc >= FIXED_DT) {
      this.tick(FIXED_DT);
      this.acc -= FIXED_DT;
    }
    if (this.screen === 'play' && this.map && this.player && this.runtime) {
      this.renderer.syncEntities(this.runtime.entities, this.projectiles);
      this.renderer.render(this.player);
      const ammoSpec = this.currentTool.ammo;
      this.hud.draw({
        integrity: this.player.integrity,
        ammo: ammoSpec ? (this.ammo.get(ammoSpec.resource) ?? 0) : null,
        ammoName: ammoSpec?.resource ?? '',
        tool: this.currentTool,
        bob: this.player.bob,
        cooldownFrac: this.cooldown / this.currentTool.cooldown,
        gender: this.gender,
        credentials: this.role,
        objectives: this.runtime.objectiveSummary(),
      });
    }
  }

  private tick(dt: number): void {
    if (this.screen !== 'play' || !this.map || !this.player || !this.runtime) return;
    const p = this.player;

    // tool switching
    if (this.input.slotPressed) {
      const t = toolForSlot(this.input.slotPressed);
      if (t) {
        this.currentTool = t;
        this.audio.sfx('click');
      }
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) {
      const tools = sortedTools();
      const i = tools.indexOf(this.currentTool);
      this.currentTool = tools[(i + wheel + tools.length) % tools.length];
      this.audio.sfx('click');
    }

    // movement
    const fwd =
      (this.input.down('KeyW') ? 1 : 0) - (this.input.down('KeyS') ? 1 : 0);
    const strafe =
      (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0);
    const keyTurn =
      (this.input.down('ArrowLeft') ? -1 : 0) + (this.input.down('ArrowRight') ? 1 : 0);
    const mouseTurn = this.input.consumeMouseDX() * 0.0028;
    p.angle += mouseTurn;
    p.move(this.map, fwd, strafe, this.input.down('ShiftLeft') || this.input.down('ShiftRight'),
      keyTurn * 2.6, dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hud.tick(dt);

    // fire / use
    if (this.input.firePressed && this.cooldown <= 0) {
      const spec = this.currentTool.ammo;
      const have = spec ? (this.ammo.get(spec.resource) ?? 0) : Infinity;
      if (have <= 0) {
        this.hud.pushMessage(`Out of ${spec!.resource} — find more charges`, 'warn');
        this.audio.sfx('denied');
      } else {
        if (spec) this.ammo.set(spec.resource, have - 1);
        this.cooldown = this.currentTool.cooldown;
        this.currentTool.use(this.toolCtx());
      }
    }
    // E/Space = keyboard interact (convenience: same as keyboard use)
    if (this.input.usePressed && this.cooldown <= 0) {
      this.cooldown = 0.3;
      const kb = toolForSlot(1)!;
      kb.use(this.toolCtx());
    }

    // entity AI
    updateEntities(this.runtime.entities, this.map, p, dt, (e) => {
      if ((e.state.lastHitT as number | undefined) === undefined ||
          performance.now() - (e.state.lastHitT as number) > 800) {
        e.state.lastHitT = performance.now();
        p.damage(8);
        this.audio.sfx('hurt');
        this.hud.pushMessage(`${e.def.inspect?.label ?? 'Malware'} is draining your integrity!`, 'bad');
        if (!p.alive) {
          this.runtime!.finished = 'lost';
          this.bus.emit('player-down', {});
        }
      }
    });

    // projectiles
    for (const { p: pr, hit } of updateProjectiles(this.projectiles, this.runtime.entities, this.map, dt)) {
      if (hit) {
        if (hit.infected) {
          hit.hp -= 1;
          if (hit.hp <= 0) this.bus.emit('cleaned', { entityId: hit.def.id });
          else this.hud.pushMessage('Hit! It needs another charge.', 'info');
        } else {
          this.hud.pushMessage('The charge fizzles — that target is not infected.', 'warn');
        }
      }
      void pr;
    }
    this.projectiles = this.projectiles.filter((x) => x.alive);

    // pickups & exit
    for (const e of this.runtime.entities) {
      if (!e.alive || e.def.kind !== 'item' || !e.def.grants) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 0.6) {
        e.alive = false;
        const { resource, amount } = e.def.grants;
        this.ammo.set(resource, Math.min(20, (this.ammo.get(resource) ?? 0) + amount));
        this.bus.emit('pickup', { entityId: e.def.id });
        this.hud.pushMessage(`+${amount} ${resource}`, 'good');
      }
    }
    const cell = this.map.cellAtF(p.x, p.y);
    if (cell?.kind === 'exit' && !this.runtime.finished) {
      this.bus.emit('reach-exit', {});
    }

    if (this.runtime.finished) {
      // brief delay then debrief
      this.screen = 'play'; // ensure single call
      this.endMission();
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
        map.openDoor(doorId);
        this.renderer.setDoorOpen(doorId);
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
      },
      setTool(slot: number) {
        const t = toolForSlot(slot);
        if (t) g.currentTool = t;
      },
    };
  }
}

const app = document.getElementById('app')!;
new Game(app);
