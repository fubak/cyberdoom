import './ui/style.css';
import { EventBus } from './core/events';
import type { Entity, Gender, Projectile, Screen } from './core/types';
import { WorldMap } from './engine/map';
import { Input } from './engine/input';
import { EYE_HEIGHT, Player } from './engine/player';
import { alertNear, damageEntity, hurtEntity, traceShot, updateEntities, updateProjectiles } from './engine/ai';
import { Audio } from './engine/audio';
import { Feel } from './engine/feel';
import { ParticleSystem } from './engine/fx';
import { lookProbe, placeThreat } from './render/probe';
import { Renderer } from './render/renderer';
import { spriteSets } from './render/sprites';
import { textureRegistry } from './render/textures';
import { Hud } from './ui/hud';
import { Automap } from './ui/automap';
import { setupPresentation } from './ui/present';
import { RES } from './render/res';
import { Dossier } from './ui/dossier';
import * as screens from './ui/screens';
import { MissionRuntime } from './missions/runtime';
import { missionRegistry } from './content/missions';
import { toolForSlot } from './tools';
import { Arsenal } from './tools/arsenal';
import { USB_PLUG_RANGE } from './tools/usb';
import { characterSelect } from './ui/characterSelect';
import { markCompleted } from './missions/progress';
import { registerThreatSprites } from './missions/threatSprites';

/**
 * main.ts — boot + top-level state machine:
 *   title → character-select → mission-select → briefing → play → debrief
 * Owns the fixed-timestep loop and wires engine/render/tools/missions/ui
 * together through core contracts only.
 */

const FIXED_DT = 1 / 60;
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';

function muzzleHeight(e: Entity): number {
  const scale = e.def.sprite === 'worm' ? 0.6 : e.def.sprite === 'trojan' ? 0.75 : 0.85;
  const height = e.def.sprite === 'worm' ? 0.95 : e.def.sprite === 'trojan' ? 1.05 : 1.15;
  return height * scale;
}

class Game {
  private bus = new EventBus();
  private audio = new Audio();
  private feel = new Feel();
  private particles = new ParticleSystem();
  private renderer!: Renderer;
  private hud!: Hud;
  private automap!: Automap;
  private dossier!: Dossier;
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
  private arsenal = new Arsenal(this.bus);
  private useCd = 0;
  private debugFire = false;
  private acc = 0;
  private last = 0;
  private simT = 0;
  private lastHurtMessageT = -Infinity;
  private lastHurtT = -Infinity;
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
    setupPresentation(viewport);
    this.renderer = new Renderer(viewport);
    registerThreatSprites();
    this.renderer.canvas.classList.add('gl');
    this.input = new Input(this.renderer.canvas, () => this.audio.unlock());
    this.hud = new Hud(viewport);
    this.automap = new Automap(this.hud.canvas);
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyM' || event.repeat || this.screen !== 'play' || this.dossier?.isOpen) return;
      this.automap.toggle();
    });
    window.addEventListener('blur', () => this.automap.close());
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    viewport.appendChild(cross);
    this.dossier = new Dossier(() => this.runtime?.evidence ?? []);
    viewport.appendChild(this.dossier.canvas);

    this.bus.on('message', ({ text, kind }) => this.hud.pushMessage(text, kind ?? 'info'));
    this.bus.on('evidence', (evidence) => {
      if (this.screen === 'play') this.dossier.show(evidence.id);
    });
    // tool sfx are the arsenal's (per-tool, per-phase); using a tool still wakes nearby enemies
    this.bus.on('tool-used', () => {
      if (this.player && this.runtime) alertNear(this.runtime.entities, this.player.x, this.player.y, 8);
    });
    this.bus.on('cleaned', ({ entityId }) => {
      queueMicrotask(() => {
        const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
        if (!e || e.alive) return;
        if (e.def.kind === 'enemy') {
          this.audio.sfx('enemy-death', { x: e.x, y: e.y });
          this.particles.burst(e.x, e.y, 0.4, 'kill');
        } else {
          this.audio.sfx('clean');
        }
      });
    });
    this.bus.on('entity-hurt', ({ entityId, fromX, fromY, applied }) => {
      const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
      if (!e?.alive) return;
      if (!applied) hurtEntity(e, e.x - fromX, e.y - fromY);
      this.particles.burst(e.x, e.y, 0.4, 'hit');
      this.audio.sfx('enemy-pain', { x: e.x, y: e.y });
    });
    this.bus.on('badge-door', ({ doorId, allowed }) => {
      if (allowed) {
        this.openDoor(doorId);
      } else {
        this.audio.sfx('denied');
      }
    });
    this.bus.on('inspect', () => this.audio.sfx('inspect', this.player ? { x: this.player.x, y: this.player.y } : {}));
    this.bus.on('pickup', () => {
      this.feel.bonus();
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
    this.dossier.enabled = s === 'play';
    if (this.overlay) this.overlay.remove();
    this.overlay = node;
    if (node) document.getElementById('viewport')!.appendChild(node);
  }

  private showTitle(): void {
    this.setScreen('title', screens.titleScreen(() => this.showCharSelect()));
  }

  private showCharSelect(): void {
    this.setScreen('character-select', characterSelect((g) => {
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
      evidence: rt.evidence,
      onDone: () => this.showMissionSelect(),
    }));
  }

  // ---------- mission lifecycle ----------

  private startMission(id: string): void {
    const mission = missionRegistry.require(id);
    this.map = new WorldMap(mission.map);
    this.runtime = new MissionRuntime(mission, this.bus);
    this.dossier.reset();
    const sp = mission.map.spawn;
    this.player = new Player(sp.x, sp.y, sp.angle);
    this.player.snap();
    this.projectiles = [];
    this.particles.clear();
    this.feel = new Feel();
    this.arsenal.reset(mission, this.gender);
    this.useCd = 0;
    this.simT = 0;
    this.lastHurtMessageT = -Infinity;
    this.lastHurtT = -Infinity;
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
      if (!this.dossier.isOpen && this.runtime.finished === null) {
        this.player.angle += mouseDX * 0.0028;
      }
      this.audio.setListener(this.player.x, this.player.y, this.player.angle);
      this.renderer.syncEntities(this.runtime.entities, this.projectiles);
      this.renderer.syncParticles(this.particles.view());
      const alpha = this.acc / FIXED_DT;
      const shake = this.feel.shake(this.simT);
      const lostEnd = this.runtime.finished === 'lost' && this.endTimer !== null;
      const pose = {
        x: this.player.prevX + (this.player.x - this.player.prevX) * alpha + shake.x,
        y: this.player.prevY + (this.player.y - this.player.prevY) * alpha + shake.y,
        angle: this.player.angle + shake.yaw,
        dz: lostEnd ? -(EYE_HEIGHT - 0.15) * this.deathDrop : this.player.viewBobZ,
        roll: lostEnd ? this.deathRoll : 0,
        hurt: this.feel.red,
        hurtSide: this.feel.hurtSide,
        bonus: this.feel.bonusAmt,
      };
      this.renderer.render(this.player, pose);
      const ars = this.arsenal;
      const integrity = this.player.integrity;
      this.hud.draw({
        integrity,
        ammo: ars.ammoFor(),
        ammoName: ars.current.ammo?.resource ?? '',
        tool: ars.current,
        bob: this.player.bob,
        cooldownFrac: ars.cooldownFrac,
        gender: this.gender,
        anim: ars.anim(),
        owned: [...ars.owned],
        resources: ars.resources(),
        got: ars.got(),
        face: (g, x, y) => ars.drawFace(g, x, y, integrity),
        // lower/raise on switch comes from anim.lower; death drops the hands off-screen
        viewmodelOffset: {
          x: this.player.weaponBobX,
          y: this.player.weaponBobY + (lostEnd ? 240 : 0),
        },
        credentials: this.runtime.roles[this.runtime.roles.length - 1] ?? this.role,
        objectives: this.runtime.objectiveSummary(),
        progress: this.runtime.hudProgress(),
      });
      this.automap.draw(
        this.map.def,
        this.runtime.visited,
        this.player,
        (doorId) => this.runtime?.isSecretDoorRevealed(doorId) ?? false,
      );
      this.dossier.draw();
    }
  }

  private consumeDossierInput(): void {
    this.input.firePressed = false;
    this.input.usePressed = false;
    this.input.slotPressed = null;
    this.input.consumeWheel();
    this.input.consumeMouseDX();
    this.debugFire = false;
  }

  private tick(dt: number): void {
    if (this.screen !== 'play' || !this.map || !this.player || !this.runtime) return;
    if (this.dossier.isOpen) {
      this.consumeDossierInput();
      return;
    }
    const p = this.player;
    const map = this.map;
    const runtime = this.runtime;
    this.simT += dt;
    this.feel.update(dt);

    // Tool switching (lower → swap → raise) is owned by the arsenal.
    const ending = runtime.finished !== null;
    if (!ending && this.input.slotPressed) this.arsenal.select(this.input.slotPressed);
    const wheel = this.input.consumeWheel();
    if (!ending && wheel !== 0) this.arsenal.cycle(wheel);

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
    this.useCd = Math.max(0, this.useCd - dt);
    this.hud.tick(dt);
    this.runtime.update(dt, {
      player: p,
      map: this.map,
      use: this.input.usePressed,
      openDoor: (doorId) => this.openDoor(doorId),
    });
    if (this.dossier.isOpen) {
      this.consumeDossierInput();
      return;
    }
    this.particles.update(dt);

    // fire (windup → impact → recover, ammo, auto-repeat and input buffering live in the arsenal)
    const fired = !ending && (this.input.firePressed || this.debugFire);
    this.debugFire = false;
    this.arsenal.update(dt, !ending && this.input.fireHeld, fired, () => this.toolCtx());

    if (!ending && !this.arsenal.switching && this.input.usePressed && this.useCd <= 0) {
      const ctx = this.toolCtx();
      const door = ctx.isDoorAhead();
      if (door && !map.isDoorOpen(door.doorId)) {
        // runtime.update() opens plain doors and explains badge/locked ones
        if (door.accessRole !== undefined) this.audio.sfx('oof');
      } else if (!ctx.aimEntity(1.4, 0.5) && ctx.wallDistance < 1.2) {
        this.audio.sfx('oof');
      } else {
        this.useCd = 0.3;
        const target = ctx.aimEntity(1.5, 0.5);
        if (target) this.bus.emit('interact', { entityId: target.def.id });
      }
    }

    updateEntities(runtime.entities, map, p, dt, {
      onSight: (e) => this.audio.sfx(`sight-${e.def.sprite}`, { x: e.x, y: e.y }),
      onWindup: (e, dur) => this.audio.sfx('windup', { x: e.x, y: e.y, dur }),
      onMelee: (e, dmg) => {
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx('bite', { x: e.x, y: e.y });
        this.hurtPlayer(dmg, e.x, e.y);
      },
      onFire: (e, projectile) => {
        this.projectiles.push({ ...projectile, alive: true, traveled: 0 });
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx('enemy-fire', { x: e.x, y: e.y });
      },
    });

    for (const e of runtime.entities) {
      if (!e.alive || e.state.mode !== 'windup') continue;
      const windupT = (e.state.windupT as number | undefined) ?? 0;
      const windupDur = (e.state.windupDur as number | undefined) ?? 1;
      this.particles.charge(e.x, e.y, muzzleHeight(e), windupT / windupDur);
    }

    for (const { p: projectile, hit, hitPlayer, x, y } of updateProjectiles(
      this.projectiles,
      runtime.entities,
      map,
      dt,
      p,
    )) {
      if (projectile.cosmetic) continue;
      if (projectile.source === 'usb-scanner' && !projectile.hostile) {
        this.resolveScannerHit(hit, x, y, projectile.dx, projectile.dy, projectile.traveled);
        continue;
      }
      this.audio.sfx('impact', { x, y, gain: projectile.hostile || !hit ? 1 : 0.5 });
      if (hitPlayer && projectile.hostile) {
        this.hurtPlayer(projectile.damage ?? 10, x - projectile.dx, y - projectile.dy);
      }
      if (hit && hit.def.kind === 'workstation' && projectile.traveled > USB_PLUG_RANGE) {
        this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: false });
        this.hud.pushMessage('Workstations are cleaned at arm\'s length: walk up and plug the scanner stick in.', 'warn');
      } else if (hit) {
        if (hit.infected) {
          const dmg = hit.state.flagCorrect ? 4 : 2;
          const result = damageEntity(hit, dmg, projectile.dx, projectile.dy);
          this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: true });
          if (result === 'killed') {
            this.bus.emit('cleaned', { entityId: hit.def.id });
          } else {
            this.particles.burst(x, y, 0.4, 'hit');
            if (hit.def.kind === 'enemy') {
              this.audio.sfx('enemy-pain', { x: hit.x, y: hit.y });
            }
          }
        } else {
          this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: false });
          this.bus.emit('scan-miss', { entityId: hit.def.id });
          this.hud.pushMessage('Scan session wasted: that target is not infected.', 'warn');
        }
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.alive);

    for (const e of runtime.entities) {
      if (!e.alive || e.def.kind !== 'item' || !e.def.grants) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 0.6) {
        e.alive = false;
        const { resource, amount } = e.def.grants;
        let text: string;
        if (resource === 'integrity') {
          p.integrity = Math.min(100, p.integrity + amount);
          text = `+${amount} INTEGRITY`;
        } else if (resource.startsWith('role:')) {
          text = `Access granted: ${resource.slice(5).toUpperCase()}`;
        } else {
          text = this.arsenal.grant(resource, amount);
        }
        this.bus.emit('pickup', { entityId: e.def.id });
        this.hud.pushMessage(text, 'good');
      }
    }
    const cell = map.cellAtF(p.x, p.y);
    if (cell?.kind === 'exit' && !runtime.finished && !this.exitReached) {
      this.exitReached = true;
      this.bus.emit('reach-exit', {});
    }

    map.updateDoors(dt);

    const combat = runtime.entities.some((e) =>
      e.alive &&
      e.def.kind === 'enemy' &&
      Math.hypot(e.x - p.x, e.y - p.y) <= 12 &&
      ['chase', 'windup', 'recover', 'pain'].includes(String(e.state.mode)),
    );
    this.audio.setCombat(combat || this.simT - this.lastHurtT < 3);

    if (runtime.finished && this.endTimer === null) {
      this.endTimer = runtime.finished === 'lost' ? 1.6 : 0.5;
      if (runtime.finished === 'won') markCompleted(runtime.mission.id);
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

  private hurtPlayer(dmg: number, sourceX: number, sourceY: number): void {
    const p = this.player;
    const runtime = this.runtime;
    if (!p || !runtime || runtime.finished) return;
    const awayX = p.x - sourceX;
    const awayY = p.y - sourceY;
    const distance = Math.hypot(awayX, awayY) || 1;
    p.damage(dmg, sourceX, sourceY);
    this.lastHurtT = this.simT;
    const sourceDx = sourceX - p.x;
    const sourceDy = sourceY - p.y;
    const side = Math.max(
      -1,
      Math.min(1, (sourceDx * -Math.sin(p.angle) + sourceDy * Math.cos(p.angle)) / distance),
    );
    this.feel.hurt(dmg, side);
    this.audio.sfx('hurt');
    let da = Math.atan2(sourceY - p.y, sourceX - p.x) - p.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.arsenal.hurt(Math.abs(da) < 0.35 ? 0 : Math.sign(da));
    p.knockback(awayX, awayY, Math.min(0.35, 0.1 + dmg * 0.01));
    if (this.simT - this.lastHurtMessageT >= 1.5) {
      this.lastHurtMessageT = this.simT;
      this.hud.pushMessage(`${runtime.entities.find((e) => e.x === sourceX && e.y === sourceY)?.def.inspect?.label ?? 'Malware'} is draining your integrity!`, 'bad');
    }
    if (!p.alive) {
      this.audio.sfx('death');
      this.bus.emit('player-down', {});
    }
  }

  private resolveScannerHit(hit: Entity | null, x: number, y: number, dx: number, dy: number, dist: number): void {
    this.audio.sfx('impact', { x, y, gain: hit ? 0.5 : 1 });
    if (hit && hit.def.kind === 'workstation' && dist > USB_PLUG_RANGE) {
      this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: false });
      this.hud.pushMessage('Workstations are cleaned at arm\'s length: walk up and plug the scanner stick in.', 'warn');
    } else if (hit) {
      if (hit.infected) {
        const dmg = hit.state.flagCorrect ? 4 : 2;
        const result = damageEntity(hit, dmg, dx, dy);
        this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: true });
        if (result === 'killed') {
          this.bus.emit('cleaned', { entityId: hit.def.id });
        } else {
          this.particles.burst(x, y, 0.4, 'hit');
          if (hit.def.kind === 'enemy') this.audio.sfx('enemy-pain', { x: hit.x, y: hit.y });
        }
      } else {
        this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: false });
        this.bus.emit('scan-miss', { entityId: hit.def.id });
        this.hud.pushMessage('Scan session wasted: that target is not infected.', 'warn');
      }
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
        if (c?.kind === 'door' && !c.locked) {
          return { doorId: c.doorId ?? '', accessRole: c.accessRole, dist: r.dist, mfa: c.mfa };
        }
        return null;
      },
      openDoor: (doorId: string) => {
        this.openDoor(doorId);
      },
      bus: this.bus,
      fireProjectile: (proj: Omit<Projectile, 'alive' | 'traveled'>) => {
        if (proj.source === 'usb-scanner') {
          const shot = traceShot(p.x, p.y, proj.dx, proj.dy, proj.range, rt.entities, map);
          this.resolveScannerHit(shot.hit, shot.x, shot.y, proj.dx, proj.dy, shot.dist);
          this.projectiles.push({
            ...proj,
            speed: 30,
            range: shot.dist,
            alive: true,
            traveled: 0,
            cosmetic: true,
          });
          return;
        }
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
      authorizedRoles: rt.roles,
      role: rt.roles[rt.roles.length - 1] ?? this.role,
      lineOfSight: (x0: number, y0: number, x1: number, y1: number) => {
        const d = Math.hypot(x1 - x0, y1 - y0);
        return map.raycast(x0, y0, Math.atan2(y1 - y0, x1 - x0), d).dist >= d - 0.3;
      },
    };
  }

  // ---------- debug hooks ----------

  private exposeDebug(): void {
    const g = this;
    (window as unknown as { __cd: unknown }).__cd = {
      hurtUniform() {
        return g.renderer.debugHurtUniform();
      },
      state() {
        return {
          screen: g.screen,
          mission: g.runtime?.mission.id ?? null,
          x: g.player?.x ?? null,
          y: g.player?.y ?? null,
          angle: g.player?.angle ?? null,
          integrity: g.player?.integrity ?? null,
          tool: g.arsenal.current.id,
          owned: [...g.arsenal.owned],
          ammo: Object.fromEntries(g.arsenal.ammo),
          score: g.runtime?.score ?? null,
          dossier: {
            open: g.dossier.isOpen,
            mode: g.dossier.mode,
            page: g.dossier.page,
            entries: g.runtime?.evidence.length ?? 0,
          },
          stats: g.runtime?.stats() ?? null,
          roles: g.runtime?.roles ?? [],
          inventory: [...(g.runtime?.inventory ?? [])],
          lossReason: g.runtime?.lossReason ?? null,
          objectives:
            g.runtime?.objectives.map((o) => ({
              id: o.def.id,
              done: o.done,
              failed: o.failed,
              progress: o.progress,
            })) ?? [],
          entities:
            g.runtime?.entities.map((e) => ({
              id: e.def.id,
              kind: e.def.kind,
              sprite: e.def.sprite,
              x: e.x,
              y: e.y,
              hp: e.hp,
              alive: e.alive,
              mode: e.state.mode,
            })) ?? [],
        };
      },
      startMission(id: string, gender?: string) {
        g.gender = gender === 'female' ? 'female' : 'male';
        g.startMission(id);
      },
      evidence() {
        return g.runtime?.evidence ?? [];
      },
      toggleLog() {
        g.dossier.toggleLog();
      },
      teleport(x: number, y: number, angle?: number) {
        if (!g.player || !g.map) return;
        const map = g.map;
        // never drop the camera inside a wall (renders black): snap to nearest open tile
        if (map.blockedF(x, y)) {
          let best: { x: number; y: number } | null = null;
          for (let r = 1; r < 8 && !best; r++) {
            for (let ty = Math.floor(y) - r; ty <= Math.floor(y) + r && !best; ty++) {
              for (let tx = Math.floor(x) - r; tx <= Math.floor(x) + r && !best; tx++) {
                if (!map.blocked(tx, ty)) best = { x: tx + 0.5, y: ty + 0.5 };
              }
            }
          }
          if (best) ({ x, y } = best);
        }
        ({ x, y } = map.resolve(x, y, 0.25));
        g.player.x = x;
        g.player.y = y;
        if (angle !== undefined) g.player.angle = angle;
        g.player.snap();
      },
      /** Pull the trigger once (works without pointer lock). */
      fire() {
        g.debugFire = true;
      },
      /** LOOK: set integrity (HUD / low-HP portrait / hurt-tint captures). */
      setIntegrity(v: number) {
        if (g.player) g.player.integrity = Math.max(1, Math.min(100, v));
      },
      /** LOOK: threat-readability probe (see tools/look-contrast.mjs). */
      probe(kind: string, dist: number, withImages = false) {
        if (!g.map || !g.runtime || !g.player) throw new Error('no mission running');
        return lookProbe(g.renderer, g.map, g.runtime.entities, g.player, kind, dist, withImages);
      },
      stage(kind: string, dist: number) {
        if (!g.map || !g.runtime || !g.player) throw new Error('no mission running');
        const { target, line } = placeThreat(g.map, g.runtime.entities, g.player, kind, dist);
        return { id: target.def.id, x: target.x, y: target.y, light: line.light };
      },
      texInfo() {
        const dimensions = (id: string) => {
          const image = textureRegistry.require(id).image as { width: number; height: number };
          return [image.width, image.height];
        };
        const worm = spriteSets.require('worm').frames.walk0.image as { width: number; height: number };
        return { wall: dimensions('wall-panel'), flat: dimensions('floor'), worm: [worm.width, worm.height], RES };
      },
      setTool(slot: number) {
        const t = toolForSlot(slot);
        if (!t) return;
        if (!g.arsenal.owns(t.id)) g.arsenal.grant(`tool:${t.id}`, 1);
        else g.arsenal.select(slot);
      },
      audioMeter() {
        return g.audio.meter();
      },
      playSfx(name: string) {
        g.audio.sfx(name);
      },
      setCombat(active: boolean) {
        g.audio.setCombat(active);
      },
    };
  }

  private openDoor(doorId: string): void {
    const map = this.map;
    if (!map || map.doorFrac(doorId) >= 1) return;
    const firstOpen = map.doorFrac(doorId) === 0;
    map.startOpening(doorId);
    if (!firstOpen) return;
    this.renderer.setDoorOpen(doorId);
    const cell = map.def.grid
      .flatMap((row, y) => [...row].map((ch, x) => ({ ch, x, y })))
      .find(({ ch }) => map.def.legend[ch]?.doorId === doorId);
    this.audio.sfx('door', cell ? { x: cell.x + 0.5, y: cell.y + 0.5 } : {});
  }

}

const app = document.getElementById('app')!;
new Game(app);
