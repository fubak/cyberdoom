import './ui/style.css';
import { EventBus } from './core/events';
import type { Entity, Gender, Mission, Projectile, Screen } from './core/types';
import { WorldMap } from './engine/map';
import { Input } from './engine/input';
import { EYE_HEIGHT, Player } from './engine/player';
import { alertNear, damageEntity, hurtEntity, traceShot, updateEntities, updateProjectiles } from './engine/ai';
import { enemyInTheWay, exitEdge } from './engine/interact';
import { doorUseHint, resolveUse, type UseTargetContext } from './engine/useTarget';
import { Audio } from './engine/audio';
import { Feel } from './engine/feel';
import { ParticleSystem } from './engine/fx';
import { lookProbe, placeThreat } from './render/probe';
import { Renderer } from './render/renderer';
import { prewarmLazySpriteFrames, prioritizeLazySprites, spriteSets } from './render/sprites';
import { textureRegistry } from './render/textures';
import { Hud } from './ui/hud';
import { Automap } from './ui/automap';
import { setupPresentation } from './ui/present';
import { RES } from './render/res';
import { Dossier } from './ui/dossier';
import * as screens from './ui/screens';
import { MissionRuntime } from './missions/runtime';
import { mfaPending } from './tools/badge';
import { aimIsHostile, HintFader } from './tools/hint';
import { missionRegistry } from './content/missions';
import { objectiveById } from './content/objectives';
import { toolForSlot } from './tools';
import { Arsenal } from './tools/arsenal';
import { USB_PLUG_RANGE } from './tools/usb';
import { characterSelect } from './ui/characterSelect';
import { applyBack, LOOK_HINT, MENU_HINT } from './ui/nav';
import { pauseMenu } from './ui/pause';
import { markCompleted } from './missions/progress';
import { registerThreatSprites } from './missions/threatSprites';
import { genDebugCompare } from './render/genpool';

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
  private pauseNode: HTMLElement | null = null;
  private paused = false;
  private prepGen = 0;
  private cross!: HTMLElement;
  /** sharp-bilinear compositor for fractional presentation; no-op on integer fit. */
  private composeFrame: () => void = () => {};

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
  private wasOnExit = false;
  private lastAimWarnT = -Infinity;
  private stepPan = 1;
  // HUD action prompt: computed at ~15 Hz; banner on tool switch.
  private prompt = {
    lmb: null as { text: string; ready: boolean } | null,
    use: null as string | null,
    lmbHot: false,
    banner: null as { title: string; blurb: string } | null,
    footer: null as string | null,
  };
  private promptNextT = 0;
  private lastFireT = -Infinity;
  private lmbHintFader = new HintFader();
  private bannerUntil = 0;
  private lastToolId = '';
  private switchedTool = false;
  /** entityId -> simT until which a tool-specific impact FX replaced the generic burst. */
  private toolFxUntil = new Map<string, number>();
  /** EDR pulse window: lightning column per hurt target, capped at 96 particles. */
  private edrPulseUntil = -Infinity;
  private edrPulseCount = 0;
  /** doorIds currently sealed by a live ransomware (encryption-as-denial). */
  private sealedDoors = new Set<string>();
  /** threat types whose mechanic explainer was already tickered this mission. */
  private noticedThreats = new Set<string>();

  constructor(app: HTMLElement) {
    const viewport = document.createElement('div');
    viewport.id = 'viewport';
    app.appendChild(viewport);
    this.composeFrame = setupPresentation(viewport);
    this.renderer = new Renderer(viewport);
    // warm lazy sprite frames in idle slices from boot — the player sits on
    // title/menus for seconds before the first level render, plenty of idle
    prewarmLazySpriteFrames();
    this.renderer.canvas.classList.add('gl');
    this.input = new Input(this.renderer.canvas, () => this.audio.unlock());
    this.hud = new Hud(viewport);
    this.automap = new Automap(this.hud.canvas);
    window.addEventListener('keydown', (event) => {
      if (event.repeat || this.screen !== 'play') return;
      if (event.code === 'KeyM') {
        if (this.paused || this.dossier.isOpen) return;
        event.preventDefault();
        this.automap.toggle();
        return;
      }
      if (event.code !== 'Escape') return;
      // The dossier listener runs first and closes itself on Escape.
      if (this.dossier.isOpen) return;
      event.preventDefault();
      const overlay = this.paused ? 'pause' : this.automap.isOpen ? 'automap' : 'none';
      const next = applyBack({ screen: 'play', overlay });
      if (next.overlay === 'pause') this.showPause();
      else if (overlay === 'pause') this.hidePause(true);
      else if (overlay === 'automap') this.automap.close();
    });
    window.addEventListener('blur', () => this.automap.close());
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    viewport.appendChild(cross);
    this.cross = cross;
    this.dossier = new Dossier(
      () => this.runtime?.evidence ?? [],
      (entityId, action) => this.bus.emit('call-pick', { entityId, action }),
    );
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
      if (this.simT < this.edrPulseUntil && this.edrPulseCount < 96) {
        this.particles.toolImpact('edr', e.x, e.y, 0.4);
        this.edrPulseCount += 8;
      } else if (!((this.toolFxUntil.get(entityId) ?? -Infinity) >= this.simT)) {
        this.particles.burst(e.x, e.y, 0.4, 'hit');
      }
      this.audio.sfx('enemy-pain', { x: e.x, y: e.y });
    });
    this.bus.on('tool-hit', ({ toolId, entityId, good }) => {
      if (toolId === 'edr') {
        this.edrPulseUntil = this.simT + 0.5;
        this.edrPulseCount = 0;
        return;
      }
      if (!entityId || !good || toolId === 'usb') return;
      const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
      if (!e?.alive) return;
      this.particles.toolImpact(toolId, e.x, e.y, 0.4, this.player?.x, this.player?.y, good);
      this.toolFxUntil.set(entityId, this.simT + 0.2);
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
    this.bus.on('ambush-spawn', ({ entityId }) => {
      const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
      if (!e) return;
      this.particles.spawn(e.x, e.y);
      this.renderer.spawnTeleport(e.x, e.y);
      this.audio.sfx('spawn', { x: e.x, y: e.y });
    });
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
    this.paused = false;
    this.pauseNode?.remove();
    this.pauseNode = null;
    this.dossier.enabled = s === 'play';
    if (this.overlay) this.overlay.remove();
    this.overlay = node;
    if (node) document.getElementById('viewport')!.appendChild(node);
    this.syncChrome();
  }

  private showTitle(): void {
    this.setScreen('title', screens.titleScreen(() => this.showCharSelect()));
  }

  private showCharSelect(): void {
    this.setScreen('character-select', characterSelect((g) => {
      this.gender = g;
      this.audio.sfx('click');
      this.showMissionSelect();
    }, () => this.showTitle(), this.gender));
  }

  private showMissionSelect(): void {
    this.audio.stopAmbience();
    document.exitPointerLock?.();
    this.automap.close();
    this.setScreen('mission-select', screens.missionSelect((id) => this.showBriefing(id), () => this.showCharSelect()));
  }

  private showBriefing(id: string): void {
    const m = missionRegistry.require(id);
    this.prepareMission(id);
    this.setScreen('briefing', screens.briefing(m, () => this.deploy(id), () => this.showMissionSelect()));
  }

  private showPause(): void {
    if (this.paused || this.screen !== 'play' || !this.runtime || this.runtime.finished) return;
    this.paused = true;
    this.automap.close();
    this.dossier.enabled = false;
    document.exitPointerLock?.();
    this.pauseNode = pauseMenu({
      onResume: () => this.hidePause(true),
      onRestart: () => {
        const id = this.runtime?.mission.id;
        if (id) this.startMission(id);
        else this.showMissionSelect();
      },
      onQuit: () => this.showMissionSelect(),
    });
    document.getElementById('viewport')!.appendChild(this.pauseNode);
    this.syncChrome();
  }

  private hidePause(relock: boolean): void {
    this.paused = false;
    this.pauseNode?.remove();
    this.pauseNode = null;
    if (this.screen === 'play') this.dossier.enabled = true;
    this.syncChrome();
    if (relock && this.screen === 'play') this.input.requestLock();
  }

  /** Crosshair only while actively looking around a mission. */
  private syncChrome(): void {
    const live = this.screen === 'play' && !this.paused && !this.automap.isOpen && !this.dossier.isOpen;
    this.cross.style.visibility = live ? 'visible' : 'hidden';
  }

  // ---------- mission prep (background work while the briefing is up) ----------

  private prepared: {
    id: string;
    map: WorldMap | null;
    built: boolean;
    textures: Parameters<Renderer['initTexture']>[0][];
    texIndex: number;
    stage: number;
    ready: boolean;
  } | null = null;

  private scheduleIdle(cb: () => void): void {
    const w = window as Window & {
      requestIdleCallback?: (c: () => void, opts?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 200 });
    else window.setTimeout(cb, 0);
  }

  /** Idle-slice setup for a mission the player is about to deploy into. */
  private prepareMission(id: string): void {
    // palette-recolored threat sets must exist before syncEntities builds meshes
    registerThreatSprites();
    const p = { id, map: null as WorldMap | null, built: false, textures: [] as Parameters<Renderer['initTexture']>[0][], texIndex: 0, stage: 0, ready: false };
    this.prepared = p;
    const step = () => {
      if (this.prepared !== p || p.ready) return; // superseded or finished
      const t0 = performance.now();
      while (performance.now() - t0 < 3 && !p.ready) this.prepStep(p);
      if (!p.ready) this.scheduleIdle(step);
    };
    this.scheduleIdle(step);
  }

  private prepStep(p: NonNullable<Game['prepared']>): void {
    const mission = missionRegistry.require(p.id);
    switch (p.stage) {
      case 0: // pure setup: parse the map
        p.map = new WorldMap(mission.map);
        p.stage++;
        break;
      case 1: { // level geometry + light
        this.renderer.buildLevel(p.map!, mission.map, mission.id);
        p.built = true;
        // texture warm list: every level texture + already-materialized sprite
        // frames for the sets this mission uses (lazy getters are skipped so
        // prep never forces a raster here)
        const setIds = [...new Set(mission.entities.map((e) => e.sprite))];
        const texs: Parameters<Renderer['initTexture']>[0][] = [...textureRegistry.all()];
        for (const id of setIds) {
          const set = spriteSets.get(id);
          if (!set) continue;
          for (const desc of Object.values(Object.getOwnPropertyDescriptors(set.frames))) {
            if (!desc.get && desc.value) texs.push(desc.value);
          }
        }
        p.textures = texs;
        p.stage++;
        break;
      }
      case 2: { // GPU texture uploads, a few per slice
        const setIds = [...new Set(mission.entities.map((e) => e.sprite))];
        prioritizeLazySprites(setIds);
        for (let i = 0; i < 8 && p.texIndex < p.textures.length; i++) {
          this.renderer.initTexture(p.textures[p.texIndex++]);
        }
        if (p.texIndex >= p.textures.length) p.stage++;
        break;
      }
      case 3: { // throwaway runtime on a dead bus: builds initial entities so
        // syncEntities can create their meshes/materials during prep; startMission
        // still builds its own runtime on the real bus
        const rt = new MissionRuntime(mission, new EventBus());
        this.renderer.syncEntities(rt.entities, []);
        p.stage++;
        break;
      }
      case 4: // shader compile (scene now includes the sprite materials)
        this.renderer.compileScene();
        p.stage++;
        break;
      case 5: { // first-frame uploads/program links off the critical path
        const sp = mission.map.spawn;
        this.renderer.warmRender(sp.x, sp.y, sp.angle);
        p.stage++;
        break;
      }
      case 6: // HUD glyph/bar caches
        this.warmHud(mission);
        p.ready = true;
        break;
    }
  }

  /** One offscreen-style hud.draw so glyph/bar caches are hot before the first in-level frame. */
  private warmHud(mission: Mission): void {
    const ars = this.arsenal;
    ars.reset(mission, this.gender);
    this.hud.draw({
      integrity: 100,
      ammo: ars.ammoFor(),
      ammoName: ars.current.ammo?.resource ?? '',
      tool: ars.current,
      bob: 0,
      cooldownFrac: 0,
      gender: this.gender,
      anim: ars.anim(),
      owned: [...ars.owned],
      resources: ars.resources(),
      face: (g, x, y) => ars.drawFace(g, x, y, 100),
      credentials: this.role,
      objectives: mission.objectives.map((id) => ({ text: objectiveById(id)?.title ?? id, done: false, failed: false })),
      progress: { done: 0, total: mission.objectives.length, failed: false },
      prompt: {
        lmb: { text: 'INSPECT WORKSTATION', ready: true },
        use: 'INSPECT FIRST (MOUSE 2)',
        banner: { title: '2 MOUSE', blurb: 'INSPECT / FLAG' },
        footer: '1-8 / WHEEL / Q: SWITCH TOOL',
      },
    });
    // entry message glyphs + the forced objective strip
    this.hud.pushMessage(`${mission.title} — good luck, analyst`, 'info');
    this.hud.warmDraw({
      integrity: 94,
      ammo: ars.ammoFor(),
      ammoName: ars.current.ammo?.resource ?? '',
      tool: ars.current,
      bob: 0,
      cooldownFrac: 0.4,
      gender: this.gender,
      anim: ars.anim(),
      owned: [...ars.owned],
      resources: ars.resources(),
      face: (g, x, y) => ars.drawFace(g, x, y, 94),
      credentials: this.role,
      objectives: mission.objectives.map((id) => ({ text: objectiveById(id)?.title ?? id, done: false, failed: false })),
      progress: { done: 0, total: mission.objectives.length, failed: false },
    });
    this.hud.clearMessages();
  }

  /** Leave the loading plate and return to the briefing for this mission. */
  private abortLoad(id: string, gen: number): void {
    if (this.prepGen !== gen) return;
    this.prepGen += 1;
    this.prepared = null;
    this.showBriefing(id);
  }

  /** DEPLOY: enter immediately if prep is done; otherwise plate up and finish it off-screen. */
  private deploy(id: string): void {
    const p = this.prepared;
    if (p && p.id === id && !p.ready) {
      const gen = this.prepGen;
      this.setScreen('loading', screens.loadingScreen(() => this.abortLoad(id, gen)));
      // two rAFs: let the plate paint, then finish remaining prep synchronously
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (this.prepGen !== gen || this.screen !== 'loading') return;
          try {
            let steps = 0;
            while (!p.ready) {
              this.prepStep(p);
              if (++steps > 400) throw new Error('mission prep did not finish');
            }
            if (this.prepGen !== gen || this.screen !== 'loading') return;
            this.startMission(id);
          } catch (err) {
            console.error(err);
            this.abortLoad(id, gen);
          }
        }),
      );
      return;
    }
    this.startMission(id);
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
      stats: rt.stats(),
      loss: rt.lossCause,
      onRedeploy: () => this.startMission(mission.id),
      onDone: () => this.showMissionSelect(),
    }));
  }

  // ---------- mission lifecycle ----------

  private startMission(id: string): void {
    const mission = missionRegistry.require(id);
    registerThreatSprites();
    const prep = this.prepared && this.prepared.id === id ? this.prepared : null;
    this.prepared = null; // prep is consumed; a retry re-runs the synchronous path
    this.map = prep?.map ?? new WorldMap(mission.map);
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
    this.wasOnExit = false;
    this.lastAimWarnT = -Infinity;
    this.prompt = { lmb: null, use: null, lmbHot: false, banner: null, footer: null };
    this.promptNextT = 0;
    this.lastFireT = -Infinity;
    this.lmbHintFader = new HintFader();
    this.bannerUntil = 0;
    this.lastToolId = this.arsenal.current.id;
    this.switchedTool = false;
    this.toolFxUntil.clear();
    this.edrPulseUntil = -Infinity;
    this.edrPulseCount = 0;
    this.sealedDoors.clear();
    this.noticedThreats.clear();
    if (!prep?.built) this.renderer.buildLevel(this.map, mission.map, mission.id);
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
    this.syncChrome();
    if (this.screen === 'play' && this.map && this.player && this.runtime) {
      const mouseDX = this.input.consumeMouseDX();
      if (!this.paused && !this.dossier.isOpen && this.runtime.finished === null) {
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
        prompt: this.prompt,
      });
      this.automap.draw(
        this.map.def,
        this.runtime.visited,
        this.player,
        (doorId) => this.runtime?.isSecretDoorRevealed(doorId) ?? false,
        this.runtime ? `${this.runtime.mission.id.toUpperCase()}: ${this.runtime.mission.title}` : undefined,
      );
      this.dossier.draw();
      this.composeFrame();
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
    if (this.paused) {
      this.consumeDossierInput();
      return;
    }
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
    if (!ending && this.input.cyclePressed) this.arsenal.cycle(1);
    const wheel = this.input.consumeWheel();
    if (!ending && wheel !== 0) this.arsenal.cycle(wheel);

    // Switch banner + first-switch tracking (title swaps when the raise begins).
    if (this.arsenal.current.id !== this.lastToolId) {
      this.lastToolId = this.arsenal.current.id;
      this.bannerUntil = this.simT + 1.4;
      this.switchedTool = true;
    }
    this.updatePrompt(ending);

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
      hasBadge: this.arsenal.owns('badge'),
    });
    if (this.dossier.isOpen) {
      this.consumeDossierInput();
      return;
    }
    this.particles.update(dt);

    // fire (windup → impact → recover, ammo, auto-repeat and input buffering live in the arsenal)
    const fired = !ending && (this.input.firePressed || this.debugFire);
    if (fired) this.lastFireT = this.simT;
    if (fired && ['mouse', 'patch', 'usb'].includes(this.arsenal.current.id)) {
      const blocker = enemyInTheWay(runtime.entities, p.x, p.y, p.angle, map);
      if (blocker && this.simT - this.lastAimWarnT >= 1) {
        this.lastAimWarnT = this.simT;
        this.hud.pushMessage(
          `${blocker.def.inspect?.label ?? 'Malware process'} is in the way — deal with the threat first`,
          'warn',
        );
      }
    }
    this.debugFire = false;
    this.arsenal.update(dt, !ending && this.input.fireHeld, fired, () => this.toolCtx());

    if (!ending && !this.arsenal.switching && this.input.usePressed && this.useCd <= 0) {
      const r = resolveUse(this.useCtx());
      if (r.kind === 'door') {
        // runtime.update() handled the door above (open / swipe / reader info).
        this.useCd = 0.3;
        if (r.door.accessRole !== undefined && !runtime.roles.includes(r.door.accessRole)) {
          this.audio.sfx('oof');
        }
      } else if (r.kind === 'bump') {
        this.audio.sfx('oof');
      } else {
        this.useCd = 0.3;
        if (r.kind === 'entity') this.bus.emit('interact', { entityId: r.entity.def.id });
        else this.hud.pushMessage('Nothing in reach — aim at it and get closer.', 'info');
      }
    }

    updateEntities(runtime.entities, map, p, dt, {
      onSight: (e) => this.audio.sfx(`sight-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y }),
      onWindup: (e, dur) => this.audio.sfx('windup', { x: e.x, y: e.y, dur }),
      onMelee: (e, dmg) => {
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx('bite', { x: e.x, y: e.y });
        this.hurtPlayer(dmg, e.x, e.y, e);
      },
      onFire: (e, projectile) => {
        this.projectiles.push({ ...projectile, alive: true, traveled: 0 });
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx('enemy-fire', { x: e.x, y: e.y });
      },
      onGrowl: (e) => this.audio.sfx('growl', { x: e.x, y: e.y, gain: 0.6 }),
      onSpawn: (e) => {
        this.particles.spawn(e.x, e.y);
        this.renderer.spawnTeleport(e.x, e.y);
        this.audio.sfx('spawn', { x: e.x, y: e.y });
      },
      onSeal: (_e, seal) => {
        if (seal.kind === 'door') this.sealedDoors.add(seal.id);
        this.renderer.sealMark(seal.id, seal.x, seal.y, seal.kind);
        this.audio.sfx('seal', { x: seal.x, y: seal.y });
      },
      onUnseal: (_e, seal) => {
        if (seal.kind === 'door') this.sealedDoors.delete(seal.id);
        this.renderer.unsealMark(seal.id);
        this.audio.sfx('unseal', { x: seal.x, y: seal.y });
        this.hud.pushMessage('Lock released.', 'good');
      },
      onNotice: (e, text) => {
        const key = e.def.threat ?? e.def.sprite;
        if (this.noticedThreats.has(key)) return;
        this.noticedThreats.add(key);
        this.hud.pushMessage(text, 'warn');
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
        const srcId = projectile.source?.startsWith('enemy:') ? projectile.source.slice(6) : null;
        const src = srcId ? runtime.entities.find((ent) => ent.def.id === srcId) : undefined;
        this.hurtPlayer(projectile.damage ?? 10, x - projectile.dx, y - projectile.dy, src);
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
            this.particles.toolImpact('usb', x, y, 0.4);
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
    const onExit = map.cellAtF(p.x, p.y)?.kind === 'exit';
    if (exitEdge(this.wasOnExit, onExit, runtime.finished !== null)) {
      this.bus.emit('reach-exit', {});
    }
    this.wasOnExit = onExit;

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

  private hurtPlayer(dmg: number, sourceX: number, sourceY: number, source?: Entity): void {
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
    const by = source?.def.inspect?.label ?? runtime.entities.find((e) => e.x === sourceX && e.y === sourceY)?.def.inspect?.label;
    if (this.simT - this.lastHurtMessageT >= 1.5) {
      this.lastHurtMessageT = this.simT;
      this.hud.pushMessage(`${by ?? 'Malware'} is draining your integrity!`, 'bad');
    }
    if (!p.alive) {
      this.audio.sfx('death');
      this.hud.pushMessage(`INTEGRITY DEPLETED${by ? ` - ${by}` : ''}`, 'bad');
      this.bus.emit('player-down', { by: source?.def.inspect?.label, threat: source?.def.sprite });
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

  /** E/Space target context: shared by the E action and the HUD prompt. */
  private useCtx(): UseTargetContext {
    const tool = this.toolCtx();
    const map = this.map!;
    const rt = this.runtime!;
    return {
      isDoorAhead: tool.isDoorAhead,
      isDoorOpen: (doorId) => map.isDoorOpen(doorId),
      aimEntity: tool.aimEntity,
      wallDistance: tool.wallDistance,
      roles: rt.roles,
      hasBadge: this.arsenal.owns('badge'),
      mfaPending: mfaPending(rt.entities),
    };
  }

  /**
   * Action prompt (~15 Hz): what LMB does (current tool's hint(), with the
   * ammo-0 override) and what E does (resolveUse -> interactHint/doorUseHint).
   * Hidden while switching tools, in dossier/automap, or at mission end.
   * With the pointer free, a click-to-look line replaces the action prompt.
   */
  private updatePrompt(ending: boolean): void {
    this.prompt.lmbHot = this.simT - this.lastFireT < 0.25;
    const unlockedLook = !this.input.pointerLocked && !DEBUG;
    if (unlockedLook && !ending && !this.dossier.isOpen && !this.automap.isOpen) {
      this.prompt.lmb = null;
      this.prompt.use = null;
      this.prompt.banner = null;
      this.prompt.footer = LOOK_HINT;
      return;
    }
    this.prompt.banner = this.simT < this.bannerUntil
      ? { title: `${this.arsenal.current.slot} ${this.arsenal.current.name}`, blurb: this.arsenal.current.blurb ?? '' }
      : null;
    this.prompt.footer = !ending && !this.switchedTool && this.simT < 25 ? MENU_HINT : null;
    const hidden =
      ending ||
      this.arsenal.switching ||
      this.dossier.isOpen ||
      this.automap.isOpen ||
      (!this.input.pointerLocked && !DEBUG);
    if (this.simT < this.promptNextT || hidden) {
      if (hidden) {
        this.prompt.lmb = null;
        this.prompt.use = null;
      }
      return;
    }
    this.promptNextT = this.simT + 1 / 15;
    const tool = this.arsenal.current;
    const ctx = this.toolCtx();
    let lmb = tool.hint?.(ctx) ?? null;
    // fade an unchanged COMBAT hint after a few seconds so it stops crowding
    // combat; interactable hints (workstation/door/console/pickup) stay up
    lmb = this.lmbHintFader.apply(lmb, aimIsHostile(ctx), this.simT);
    const ammo = tool.ammo ? this.arsenal.ammoFor(tool) : null;
    if (ammo === 0) lmb = { text: `OUT OF ${tool.ammo!.resource.toUpperCase()}`, ready: false };
    this.prompt.lmb = lmb;
    const r = resolveUse(this.useCtx());
    if (r.kind === 'door') this.prompt.use = doorUseHint(this.useCtx(), r.door);
    else if (r.kind === 'entity') this.prompt.use = this.runtime!.interactHint(r.entity);
    else this.prompt.use = null;
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
      isInspected: (entityId: string) => rt.wasInspected(entityId),
      needsCall: (entityId: string) => rt.callPending(entityId),
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
          paused: g.paused,
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
          callsPending:
            g.runtime?.entities.filter((e) => g.runtime?.callPending(e.def.id)).map((e) => e.def.id) ?? [],
          entities:
            g.runtime?.entities.map((e) => ({
              id: e.def.id,
              kind: e.def.kind,
              sprite: e.def.sprite,
              x: e.x,
              y: e.y,
              hp: e.hp,
              alive: e.alive,
              infected: e.infected,
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
      call(entityId: string, action: string) {
        g.bus.emit('call-pick', { entityId, action: action as 'quarantine' });
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
      /** Trigger the portrait's hurt reaction (dir -1/0/1 = glance left/center/right). */
      hurt(dir: number) {
        g.arsenal.hurt(dir);
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
      /** LOOK: byte-compare installed (worker-produced) pixels vs a local rerun of the same job. */
      genCompare(keys: string[]) {
        return keys.map((key) => ({ key, ...(genDebugCompare(key) ?? { same: null, diffs: -1 }) }));
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
    if (this.sealedDoors.has(doorId)) {
      this.audio.sfx('denied');
      this.hud.pushMessage('ENCRYPTED: a ransomware sealed this door — neutralize it to release the lock.', 'warn');
      return;
    }
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
