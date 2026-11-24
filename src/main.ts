import './ui/style.css';
import { EventBus } from './core/events';
import type { Entity, Gender, Mission, Projectile, Screen } from './core/types';
import { resolveBindings } from './engine/bindings';
import { WorldMap } from './engine/map';
import { Input } from './engine/input';
import { EYE_HEIGHT, Player } from './engine/player';
import { alertNear, damageEntity, ENEMY_PROFILES, hurtEntity, traceShot, updateEntities, updateProjectiles, wormPropagateCap } from './engine/ai';
import type { SealTarget } from './engine/ai';
import { enemyInTheWay } from './engine/interact';
import { doorUseHint, resolveUse, type UseTargetContext } from './engine/useTarget';
import { Audio, musicTierForMission } from './engine/audio';
import { isSkillId, loadSettings, saveSettings, type Settings } from './ui/settings';
import { Feel, FlashRateLimiter } from './engine/feel';
import { CueGate, spawnCueText } from './engine/spawnCue';
import { ParticleSystem } from './engine/fx';
import { lightProbe, lookProbe, openerProbe, placeThreat } from './render/probe';
import { HitConfirm, reticleClass, reticleState, type ReticleHint } from './ui/reticle';
import { Renderer } from './render/renderer';
import { prewarmLazySpriteFrames, prioritizeLazySprites, spriteSets } from './render/sprites';
import { textureRegistry } from './render/textures';
import { SHOW_HANDS, TOOL_FLASH } from './render/viewmodels';
import { bakeRig } from './render/handrig';
import { POSES, TOOL_HANDS } from './render/handposes';
import { currentSkin } from './tools/look';
import { Hud } from './ui/hud';
import { Automap } from './ui/automap';
import { setupPresentation } from './ui/present';
import { RES } from './render/res';
import { Dossier } from './ui/dossier';
import * as screens from './ui/screens';
import { MissionRuntime, scaledPickupGrant, type UpdateWorld } from './missions/runtime';
import { latestRetryCheckpoint, objectiveCheckpointLabel, type Checkpoint } from './missions/checkpoint';
import { PadMenuNav, dispatchPadKey } from './engine/padmenu';
import {
  clearSavedCheckpoints,
  loadSavedCheckpoints,
  persistCheckpoints,
  resumeCheckpoint,
} from './missions/checkpoint-store';
import { mfaPending } from './tools/badge';
import { Arsenal, ammoUnit } from './tools/arsenal';
import { bindAudio } from './tools/sfx';
import { missionById, newToolsFor, requireMission } from './content/missions';
import { objectiveById } from './content/objectives';
import { CHEATS, CheatBuffer, KonamiBuffer } from './eggs/cheats';
import { toolForSlot, toolRegistry } from './tools';

import { USB_PLUG_RANGE } from './tools/usb';
import { characterSelect } from './ui/characterSelect';
import { applyBack } from './ui/nav';
import { promptGate } from './ui/promptGate';
import { bindingLabel, onboardingTips, primaryKey } from './ui/controlsHelp';
import {
  EMPTY_EVIDENCE_UNREAD,
  evidenceEmptyLines,
  evidenceLogBadge,
  markEvidenceRead,
  noteEvidence,
  type EvidenceUnread,
} from './ui/evidenceHints';
import { markOnboardingSeen, shouldOnboard } from './ui/onboarding';
import { relativeBearing, tileDistance } from './ui/damageAlert';
import { claimRoleHint, roleDenialExplainer } from './ui/roleBadge';
import { pauseMenu } from './ui/pause';
import { controlsPanel } from './ui/controls';
import { optionsPanel } from './ui/options';
import { flashBudget, flashStrength } from './engine/flashPolicy';
import { completedIds, markCompleted, unlockEverything } from './missions/progress';
import { registerThreatSprites } from './missions/threatSprites';
import { genDebugCompare } from './render/genpool';

/**
 * main.ts — boot + top-level state machine:
 *   title → character-select → mission-select → briefing → play → debrief
 * Owns the fixed-timestep loop and wires engine/render/tools/missions/ui
 * together through core contracts only.
 */

import { springStep, swayTarget, SWAY, breath as breathF } from './render/vmotion';
import { handMods } from './render/viewmodels';
const FIXED_DT = 1 / 60;
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const clampInputAxis = (value: number): number => Math.max(-1, Math.min(1, value));

/** Per-tool muzzle-flash colour (0-1 rgb) for the world light flood. */
const TOOL_FIRE_RGB: Record<string, [number, number, number]> = Object.fromEntries(
  Object.entries(TOOL_FLASH).map(([k, v]) => [
    k,
    v.split(',').map((n) => parseInt(n, 10) / 255) as [number, number, number],
  ]),
);

/** Tools that fire a world light flood — damaging attacks only, like Doom
 *  weapons. Inspect/utility tools (mouse, badge, mfa) don't flash. */
const ATTACK_TOOLS = new Set(['keyboard', 'usb', 'edr', 'firewall', 'patch', 'tap']);

/** World light-flood strength per tool. The flood used to run at 1.5 for everything (2.0 for the EDR),
 *  which bleached the whole view on every use: mean view luma roughly doubled, and the patch disk and
 *  network tap - utility tools, not weapons - turned the screen solid green / pink. Weapons keep a
 *  clear muzzle flash; utility tools get a tint, not a wash. */
const TOOL_FIRE_STRENGTH: Record<string, number> = {
  keyboard: 0.95,
  usb: 0.95,
  firewall: 1.05,
  edr: 1.25,
  patch: 0.45,
  tap: 0.45,
};

/** Data-blood spray tint per threat (matches each enemy's palette). */
const THREAT_BLOOD: Record<string, [number, number, number]> = {
  worm: [1, 0.18, 0.05],
  trojan: [0.78, 0.32, 1],
  ransomware: [1, 0.52, 0.06],
  logicbomb: [1, 0.3, 0.1],
  rat: [0.22, 0.9, 0.38],
  rootkit: [0.48, 0.32, 1],
  botnet: [0.25, 0.88, 1],
  wiper: [1, 0.25, 0.12],
  'boss-locker': [1, 0.65, 0.12],
  'boss-ghostledger': [0.85, 0.22, 1],
  'boss-phish': [0.22, 0.95, 0.55],
  'boss-zeroday': [1, 0.35, 0.12],
};
const bloodOf = (e: Entity): [number, number, number] =>
  THREAT_BLOOD[e.def.threat ?? e.def.sprite] ?? [1, 0.28, 0.08];

/** Viewmodel recoil jolt per tool — heavy attacks kick harder. */
const TOOL_KICK: Record<string, number> = {
  keyboard: 1.3,
  edr: 1.5,
  firewall: 1.4,
  usb: 1,
  patch: 0.6,
  tap: 0.5,
  mouse: 0.4,
  badge: 0.45,
  mfa: 0.45,
};

function muzzleHeight(e: Entity): number {
  // ENEMIES: melee threats carry ~1.0x close-range presence now — particle
  // origin heights match the bigger drawn sprites
  const scale = e.def.sprite === 'worm' ? 0.95 : e.def.sprite === 'trojan' ? 0.9 : 1.0;
  const height =
    e.def.sprite === 'worm' ? 0.95
    : e.def.sprite === 'trojan' ? 1.05
    : e.def.sprite === 'logicbomb' ? 0.62
    : e.def.sprite === 'rat' ? 0.78
    : 1.15;
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
  /** EGGS: typed-cheat state — Doom-style letter buffer + Konami matcher. */
  private cheatBuf = new CheatBuffer();
  private konamiBuf = new KonamiBuffer();
  private god = false;
  private bossStung = false;
  private deathStung = false;
  private lastAmbushAlarm = -Infinity;
  private gender: Gender = 'male';
  private role = 'analyst';
  private overlay: HTMLElement | null = null;
  private pauseNode: HTMLElement | null = null;
  private hadLock = false;
  private releasedLock = false;
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
  private automaticCheckpoint: Checkpoint | null = null;
  private quickCheckpoint: Checkpoint | null = null;
  private checkpointClock = 0;
  private padMenu = new PadMenuNav();
  private arsenal = new Arsenal(this.bus);
  private useCd = 0;
  private debugFire = false;
  private acc = 0;
  private last = 0;
  private simT = 0;
  /** Objective count seen at the last nudge; -1 until the first tick. */
  private objectivesDone = -1;
  /** Sim-time when the next "stuck?" hint may fire (45 s after each reset). */
  private nudgeAt = 0;
  /** Sim-time of the next objective-progress scan (2 Hz cadence). */
  private nudgeScanT = 0;
  /** Objective ids already checkpointed — replaces a per-tick Set rebuild. */
  private checkpointDone = new Set<string>();
  /** Reused UpdateWorld for the 240 Hz runtime tick (no per-tick allocation). */
  private updateWorld: UpdateWorld = {
    player: { x: 0, y: 0, angle: 0, integrity: 0 },
    map: undefined as unknown as WorldMap,
    use: false,
    openDoor: (doorId) => this.openDoor(doorId),
    flashTool: (toolId) => this.arsenal.flash(toolId),
  };
  /** Debug: freeze sim ticks while look probes capture frames (?debug=1 only). */
  probeLock = false;
  /** Viewmodel sway/lag state: lags mouse yaw + strafe, springs back to rest. */
  private vmSway = { x: 0, y: 0 };
  private vmLight = 1;
  private swayX = { x: 0, v: 0, acc: 0 };
  private swayY = { x: 0, v: 0, acc: 0 };
  private lastHurtT = -Infinity;
  private endTimer: number | null = null;
  private endCalled = false;
  private deathDrop = 0;
  private deathRoll = 0;
  private lastAimWarnT = -Infinity;
  private stepPan = 1;
  // HUD action prompt: computed at ~15 Hz; banner on tool switch.
  private prompt = {
    lmb: null as { text: string; ready: boolean; fleeting?: boolean; cost?: string | null } | null,
    use: null as string | null,
    lmbHot: false,
    banner: null as { title: string; blurb: string } | null,
    footer: null as string | null,
    lmbKey: 'LMB',
  };
  private promptNextT = 0;
  private lastFireT = -Infinity;
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
  /** Entities whose evidence already auto-opened the dossier this mission. */
  private dossierOpened = new Set<string>();
  /** Evidence ids seen this mission and how many arrived unopened (LOG +N badge). */
  private evidenceUnread: EvidenceUnread = EMPTY_EVIDENCE_UNREAD;
  /** threat types whose mechanic explainer was already tickered this mission. */
  private noticedThreats = new Set<string>();
  /** attacker id -> {label, simT until it counts as actively draining}. */
  private drainers = new Map<string, { label: string; until: number }>();
  /** LEVELS: mission-wide worm-copy budget (reset per mission, shared into ai hooks). */
  private wormBudget = { remaining: 0 };
  /** Kill hit-stop: remaining sim-time freeze (seconds). */
  private hitStopT = 0;
  private flagHintAt = -99;
  /** WCAG 2.3.1: shared budget for all full-screen flashes (muzzle flood,
   *  landed-hit bloom, pain wash) — at most 3 per second, always. */
  /** Reticle feedback: hit marker + its own budgeted flash (src/ui/reticle.ts). */
  private hitConfirm = new HitConfirm();
  private reticleHint: ReticleHint | null = null;
  private reticleCls = '';
  private settings: Settings = loadSettings();
  private flashLimit = new FlashRateLimiter(flashBudget(this.settings.reducedFlash));
  /** Title-menu Options/Controls panel on screen (keeps the Konami listener off). */
  private titlePanel = false;

  constructor(app: HTMLElement) {
    const viewport = document.createElement('div');
    viewport.id = 'viewport';
    app.appendChild(viewport);
    this.composeFrame = setupPresentation(viewport);
    this.renderer = new Renderer(viewport);
    this.audio.setMusicVolume(this.settings.musicVol);
    this.audio.setSfxVolume(this.settings.sfxVol);
    // warm lazy sprite frames in idle slices from boot — the player sits on
    // title/menus for seconds before the first level render, plenty of idle
    prewarmLazySpriteFrames();
    this.renderer.canvas.classList.add('gl');
    this.input = new Input(this.renderer.canvas, () => this.audio.unlock(), () => this.lockWanted());
    this.input.setBindings(resolveBindings(this.settings.bindings));
    this.hud = new Hud(viewport);
    this.hud.setColorBlind(this.settings.colorBlind);
    this.hud.setReducedFlash(this.settings.reducedFlash);
    this.renderer.setFov(this.settings.fov);
    this.feel.setWashScale(flashStrength(this.settings.reducedFlash));
    this.automap = new Automap(this.hud.canvas);
    // EGGS: Doom-style typed cheats during play; the Konami code on title.
    // Capture phase: this listener is registered before the dossier's capture
    // listener (new Dossier below), so a live cheat prefix can swallow keys —
    // otherwise 'l' opens the case file mid-RICKROLL and kills the code.
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (this.screen === 'title') {
        if (this.titlePanel) return;
        if (this.konamiBuf.push(event.key)) this.applyKonami();
        return;
      }
      if (this.screen !== 'play' || this.paused || this.dossier.isOpen) return;
      if (
        this.input.matchesAction('map', event.code) ||
        this.input.matchesAction('log', event.code)
      ) return;
      const cheat = this.cheatBuf.push(event.key);
      // A completed code, or a live prefix deep enough to be unambiguous,
      // eats the key so in-play hotkeys (L log, M map, E use, digit tools)
      // don't fire mid-code and kill the sequence — Doom lets cheat letters
      // keep their side effects, but losing the rest of the code is worse.
      if (cheat || this.cheatBuf.hot()) event.stopImmediatePropagation();
      if (cheat) this.applyCheat(cheat);
    }, true);
    window.addEventListener('keydown', (event) => {
      if (event.repeat || this.screen !== 'play') return;
      if (event.code === 'F5') {
        event.preventDefault();
        if (!this.paused && this.runtime && !this.runtime.finished) {
          this.quickCheckpoint = this.captureCheckpoint('QUICKSAVE');
          this.saveCheckpoints();
          this.hud.pushMessage('QUICKSAVED', 'good');
        }
        return;
      }
      if (event.code === 'F9') {
        event.preventDefault();
        if (this.quickCheckpoint) this.restoreCheckpoint(this.quickCheckpoint);
        else this.hud.pushMessage('NO QUICKSAVE', 'warn');
        return;
      }
      if (this.input.matchesAction('map', event.code)) {
        if (this.paused || this.dossier.isOpen) return;
        event.preventDefault();
        this.automap.toggle();
        return;
      }
      // Automap controls (Doom-style): +/- zoom, G toggles follow/free-pan.
      if (this.automap.isOpen && !this.paused && !this.dossier.isOpen && this.player) {
        if (event.code === 'Equal' || event.code === 'NumpadAdd') {
          event.preventDefault();
          this.automap.zoomBy(1);
          return;
        }
        if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
          event.preventDefault();
          this.automap.zoomBy(-1);
          return;
        }
        if (event.code === 'KeyG') {
          event.preventDefault();
          this.automap.toggleFollow(this.player);
          return;
        }
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
    // Unexpected pointer-lock loss (Esc eaten by the browser, alt-tab, an OS
    // popup) pauses the run instead of leaving an unsteerable live game.
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.canvas;
      const lost = this.hadLock && !locked;
      this.hadLock = locked;
      const ours = this.releasedLock;
      this.releasedLock = false;
      if (!lost || ours) return;
      if (this.lockWanted()) this.showPause();
    });
    // While paused, a click on the dimmed area outside the menu resumes and
    // relocks; clicks on the menu buttons reach them normally.
    document.addEventListener('mousedown', (e) => {
      if (!this.paused || e.button !== 0) return;
      const target = e.target as Element | null;
      if (target?.closest?.('button, a, input, select, textarea')) return;
      this.hidePause(true);
    });
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    viewport.appendChild(cross);
    this.cross = cross;
    this.dossier = new Dossier(
      () => this.runtime?.evidence ?? [],
      (entityId, action) => this.bus.emit('call-pick', { entityId, action }),
      (code) => this.input.matchesAction('log', code),
      () => evidenceEmptyLines(resolveBindings(this.settings.bindings)),
    );
    viewport.appendChild(this.dossier.canvas);

    bindAudio(this.audio);
    this.bus.on('message', ({ text, kind, priority }) => this.hud.pushMessage(text, kind ?? 'info', priority));
    // first role-based badge denial ever: explain what the BADGE cell's role means
    this.bus.on('role-denied', ({ accessRole, roles }) => {
      if (claimRoleHint()) this.hud.pushMessage(roleDenialExplainer(accessRole, roles), 'info', 'alert');
    });
    this.bus.on('evidence', (evidence) => {
      if (this.screen !== 'play') return;
      this.audio.sfx('evidence', { gain: 0.6 });
      // Auto-open the dossier on an entity's FIRST inspection. Later evidence
      // for the same entity — or any evidence while a hostile is within 6
      // tiles — goes to the ticker instead so combat is never interrupted;
      // L (evidence log) still opens the full case file. If the dossier is
      // already open (e.g. the player is mid triage-call) refresh it so the
      // picked answer renders.
      if (this.dossier.isOpen) {
        this.evidenceUnread = noteEvidence(this.evidenceUnread, evidence.id, true).state;
        this.dossier.show(evidence.id);
        return;
      }
      const hostileNear = !!this.player && !!this.runtime?.entities.some(
        (e) => e.alive && e.def.kind === 'enemy' && Math.hypot(e.x - this.player!.x, e.y - this.player!.y) <= 6,
      );
      const autoOpen = !hostileNear && !this.dossierOpened.has(evidence.entityId);
      const noted = noteEvidence(this.evidenceUnread, evidence.id, autoOpen);
      this.evidenceUnread = noted.state;
      if (autoOpen) {
        this.dossierOpened.add(evidence.entityId);
        this.dossier.show(evidence.id);
        return;
      }
      // New, unopened evidence gets the LOG +N [L] badge at alert rank: it
      // answers the player's own action, so queued onboarding tips must not
      // bury it, yet as an equal it never bumps a damage alert off screen. A
      // re-read is only a reminder of where the file lives (tip).
      const bindings = resolveBindings(this.settings.bindings);
      if (noted.isNew) {
        this.hud.pushMessage(`${evidenceLogBadge(this.evidenceUnread.unread, bindings)} ${evidence.label}`, 'info', 'alert');
      } else {
        this.hud.pushMessage(`${evidence.label} — in the case file [${primaryKey(bindings, 'log')}]`, 'info', 'tip');
      }
    });
    this.bus.on('objective-done', () => this.audio.sfx('objective'));
    // tool sfx are the arsenal's (per-tool, per-phase); using a tool still wakes nearby enemies
    this.bus.on('tool-used', ({ toolId }) => {
      if (this.player && this.runtime) alertNear(this.runtime.entities, this.player.x, this.player.y, 8);
      // Doom fire-frame punch: flood walls/floor with tool-coloured light for
      // ~110 ms and jolt the viewmodel down like a recoil kick. Only damaging
      // attack tools flood — inspect/utility tools (mouse, badge, mfa) keep
      // just the small kick.
      const rgb = TOOL_FIRE_RGB[toolId];
      if (rgb && ATTACK_TOOLS.has(toolId) && this.flashLimit.allow(this.simT))
        this.renderer.fireLight(rgb[0], rgb[1], rgb[2], (TOOL_FIRE_STRENGTH[toolId] ?? 1) * flashStrength(this.settings.reducedFlash));
      this.feel.kick(TOOL_KICK[toolId] ?? 1);
    });
    this.bus.on('cleaned', ({ entityId }) => {
      queueMicrotask(() => {
        const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
        if (!e || e.alive) return;
        if (e.def.kind === 'enemy') {
          this.audio.sfx(`death-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y });
          this.audio.sfx('kill', { x: e.x, y: e.y });
          this.particles.burst(e.x, e.y, 0.4, 'kill', bloodOf(e));
          // a bigger threat-coloured flash marks the kill from the hit sparks
          this.particles.flash(e.x, e.y, 0.5, bloodOf(e));
          this.impactBloom(e.x, e.y, bloodOf(e));
          // kill punctuation: a ~70 ms sim-time hit-stop plus a camera punch
          this.feel.punch(1);
          this.hitStopT = Math.max(this.hitStopT, 0.07);
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
        // directional shards spraying away from the shooter — a lighter echo
        // of the kill burst, keyed off the hit coordinates
        this.particles.burst(e.x, e.y, 0.4, 'hit', bloodOf(e), e.x - fromX, e.y - fromY);
      }
      // threat-coloured light burst at the impact point, so a connected hit reads instantly
      this.particles.flash(e.x, e.y, 0.45, bloodOf(e));
      this.hitConfirm.hit(this.simT, !this.settings.reducedFlash);
      this.impactBloom(e.x, e.y, bloodOf(e));
      this.audio.sfx(`pain-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y });
    });
    this.bus.on('tool-hit', ({ toolId, entityId, good }) => {
      if (toolId === 'edr') {
        this.edrPulseUntil = this.simT + 0.5;
        this.edrPulseCount = 0;
        return;
      }
      if (entityId && good) this.hitConfirm.hit(this.simT, !this.settings.reducedFlash);
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
    // Secret payoffs: runtime emits the grant; apply it like a floor pickup and
    // say what was found so every secret visibly pays off.
    this.bus.on('grant-item', ({ resource, amount }) => {
      const text = this.applyResourceGrant(resource, amount);
      this.audio.sfx('pickup', this.player ? { x: this.player.x, y: this.player.y } : {});
      this.hud.pushPickup(text);
    });
    this.bus.on('reach-exit', () => this.audio.sfx('win'));
    this.bus.on('ambush-spawn', ({ entityId }) => {
      const e = this.runtime?.entities.find((entity) => entity.def.id === entityId);
      if (!e) return;
      this.particles.spawn(e.x, e.y);
      this.renderer.spawnTeleport(e.x, e.y);
      this.audio.sfx('spawn', { x: e.x, y: e.y });
      // ambushes get the klaxon — once per ambush trigger, not once per
      // spawned entity (ambush-spawn emits per entity)
      const now = performance.now();
      if (now - this.lastAmbushAlarm > 500) {
        this.lastAmbushAlarm = now;
        this.audio.sfx('alarm', { gain: 0.45 });
      }
      // the FIRST ambush on a boss-tier mission gets the reveal stinger
      // (there is no literal boss entity — the ambush IS the boss moment)
      if (!this.bossStung && (this.runtime?.mission.difficulty ?? 0) >= 9) {
        this.bossStung = true;
        this.audio.playSting('sting-boss');
      }
      this.spawnCue(e, 'ambush');
    });
    // deep link: ?mission=m01&gender=female
    const dm = params.get('mission');
    const dg = params.get('gender');
    if (dm && missionById(dm)) {
      this.gender = dg === 'female' ? 'female' : 'male';
      this.startMission(dm);
    } else {
      this.showTitle();
    }

    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
  }

  // ---------- screens ----------

  /** ENEMIES: when a threat materialises off-screen, the teleport column can't
   *  be seen — ticker a one-line bearing cue so the ambush still telegraphs.
   *  `ambush` is a level-scripted spawn; `replica` is worm self-propagation —
   *  differently worded and throttled so burst copies don't spam the ticker. */
  private replicaGate = new CueGate(4);

  private spawnCue(e: Entity, kind: 'ambush' | 'replica'): void {
    const p = this.player;
    if (!p) return;
    const rel = Math.atan2(e.y - p.y, e.x - p.x) - p.angle;
    const label = (e.def.threat ?? e.def.sprite ?? 'threat').toUpperCase();
    const text = spawnCueText(kind, label, rel);
    if (!text) return;
    if (kind === 'replica' && !this.replicaGate.allow(this.runtime?.elapsed ?? 0)) return;
    this.hud.pushMessage(text, 'warn');
  }

  private applyResourceGrant(resource: string, amount: number): string {
    const runtime = this.runtime;
    const p = this.player;
    const scaledAmount = runtime
      ? scaledPickupGrant(resource, amount, this.arsenal.ammo, (n) => runtime.pickupAmount(n))
      : amount;
    if (resource === 'integrity') {
      if (p) p.integrity = Math.min(100, p.integrity + scaledAmount);
      return `PICKED UP ${scaledAmount} INTEGRITY.`;
    }
    if (resource === 'armor') {
      if (p) p.addArmor(scaledAmount);
      return `EQUIPPED FIREWALL VEST (+${scaledAmount} SHIELD).`;
    }
    if (resource === 'overclock') {
      const secs = Math.max(5, amount);
      if (p) p.overclockT = Math.max(p.overclockT, secs);
      return `SOC OVERCLOCK ACTIVE (${secs}S — 2X FIRE RATE & SPEED).`;
    }
    if (resource === 'airgap') {
      const secs = Math.max(5, amount);
      if (p) p.airgapT = Math.max(p.airgapT, secs);
      return `AIR-GAP SHIELD ACTIVE (${secs}S — DAMAGE IMMUNITY).`;
    }
    if (resource === 'siem-map') {
      runtime?.revealAll();
      return 'SIEM TOPOLOGY SYNCED — FULL FLOOR MAP REVEALED.';
    }
    if (resource.startsWith('role:')) {
      return `Access granted: ${resource.slice(5).toUpperCase()}`;
    }
    return this.arsenal.grant(resource, scaledAmount);
  }

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

  private showTitle(initialItem?: string): void {
    this.audio.startMusic('title');
    const saved = loadSavedCheckpoints();
    const onContinue = saved && missionById(saved.missionId) ? () => this.continueSaved() : undefined;
    this.titlePanel = false;
    this.setScreen('title', screens.titleScreen({
      onStart: () => this.showCharSelect(),
      onMissions: () => this.showMissionSelect(),
      onContinue,
      onOptions: () => this.showTitlePanel('options'),
      onControls: () => this.showTitlePanel('controls'),
      initialItem,
      bindings: this.settings.bindings,
    }));
  }

  /** Title menu OPTIONS / CONTROLS: the pause menu's panels; Esc or BACK returns to the title. */
  private showTitlePanel(kind: 'options' | 'controls'): void {
    this.audio.sfx('click');
    const back = () => {
      const next = applyBack({ screen: 'title', overlay: kind });
      if (next.screen === 'title') this.showTitle(kind);
    };
    const node = kind === 'options'
      ? optionsPanel({
        settings: this.settings,
        onSettings: (next) => this.applySettings(next),
        onBack: back,
        kicker: 'SYSTEM SETUP',
      })
      : controlsPanel(
        this.settings.bindings,
        (bindings) => this.applySettings({ ...this.settings, bindings }),
        back,
      );
    this.setScreen('title', node);
    this.titlePanel = true;
  }

  private showCharSelect(): void {
    this.setScreen('character-select', characterSelect((g) => {
      this.gender = g;
      this.audio.sfx('click');
      this.showMissionSelect();
    }, () => this.showTitle(), this.gender));
  }

  private showMissionSelect(): void {
    this.clearCheckpoints();
    this.audio.stopAmbience();
    this.audio.startMusic('title');
    this.releaseLock();
    this.automap.close();
    this.setScreen('mission-select', screens.missionSelect((id) => this.showBriefing(id), () => this.showCharSelect()));
  }

  private showBriefing(id: string): void {
    const m = requireMission(id);
    this.prepareMission(id);
    this.audio.startMusic('briefing');
    // warm the mission's tier on the worker so Deploy hits a cached buffer
    this.audio.prefetchMusic(musicTierForMission(m.id, m.difficulty));
    if (m.entities.some((e) => ENEMY_PROFILES[e.threat ?? e.sprite]?.boss)) {
      this.audio.prefetchMusic('boss');
    }
    this.setScreen('briefing', screens.briefing(
      m,
      () => this.deploy(id),
      () => this.showMissionSelect(),
      (skill) => {
        this.settings = { ...this.settings, skill };
        saveSettings(this.settings);
      },
      this.settings.skill,
      this.settings.bindings,
    ));
    // warm the WebGL hand-bake path during briefing only when the legacy 3D rig is enabled
    if (SHOW_HANDS) {
      this.scheduleIdle(() => {
        try {
          const th = TOOL_HANDS.keyboard;
          bakeRig(th.rest, POSES[th.rest], { gender: this.gender, skin: currentSkin() });
        } catch { /* lazy bake covers it */ }
      });
    }
  }

  private applySettings(next: Settings): void {
    this.settings = next;
    saveSettings(next);
    this.input.setBindings(resolveBindings(next.bindings));
    this.audio.setMusicVolume(next.musicVol);
    this.audio.setSfxVolume(next.sfxVol);
    this.hud.setColorBlind(next.colorBlind);
    this.hud.setReducedFlash(next.reducedFlash);
    this.renderer.setFov(next.fov);
    this.feel.setWashScale(flashStrength(next.reducedFlash));
    this.flashLimit = new FlashRateLimiter(flashBudget(next.reducedFlash));
    if (this.player) this.player.bobScale = next.viewBob ? 1 : 0;
  }

  private makePauseMenu(): HTMLElement {
    return pauseMenu({
      settings: this.settings,
      onOptions: () => this.showPauseOptions(),
      onControls: () => this.showControls(),
      onResume: () => this.hidePause(true),
      onRestart: () => {
        const id = this.runtime?.mission.id;
        if (id) this.startMission(id);
        else this.showMissionSelect();
      },
      onQuit: () => this.showMissionSelect(),
    });
  }

  private showPauseOptions(): void {
    if (!this.paused || !this.pauseNode) return;
    const node = optionsPanel({
      settings: this.settings,
      onSettings: (next) => this.applySettings(next),
      onBack: () => {
        const menu = this.makePauseMenu();
        this.pauseNode?.replaceWith(menu);
        this.pauseNode = menu;
      },
      kicker: 'SECTOR HOLD',
    });
    this.pauseNode.replaceWith(node);
    this.pauseNode = node;
  }

  private showControls(): void {
    if (!this.paused || !this.pauseNode) return;
    const node = controlsPanel(
      this.settings.bindings,
      (bindings) => this.applySettings({ ...this.settings, bindings }),
      () => {
        const menu = this.makePauseMenu();
        this.pauseNode?.replaceWith(menu);
        this.pauseNode = menu;
      },
    );
    this.pauseNode.replaceWith(node);
    this.pauseNode = node;
  }

  private showPause(): void {
    if (this.paused || this.screen !== 'play' || !this.runtime || this.runtime.finished) return;
    this.paused = true;
    this.automap.close();
    this.dossier.enabled = false;
    this.releaseLock();
    this.pauseNode = this.makePauseMenu();
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

  /** Pointer lock belongs to live play only (not menus or overlays). */
  private lockWanted(): boolean {
    return this.screen === 'play' && !this.paused &&
      !!this.runtime && !this.runtime.finished &&
      !this.automap.isOpen && !this.dossier.isOpen;
  }

  /** Our own exits so the lock-loss handler can tell them from the browser's. */
  private releaseLock(): void {
    if (!document.pointerLockElement) return;
    this.releasedLock = true;
    document.exitPointerLock?.();
  }

  /** Reticle state class (idle / target / blocked / hit + budgeted flash). */
  private syncReticle(): void {
    const now = this.simT;
    const state = reticleState(this.reticleHint, this.hitConfirm.marked(now));
    const cls = reticleClass(state, this.hitConfirm.flashing(now));
    if (cls === this.reticleCls) return;
    this.reticleCls = cls;
    this.cross.className = cls;
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
    handWarm: number;
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
    const p = { id, map: null as WorldMap | null, built: false, textures: [] as Parameters<Renderer['initTexture']>[0][], texIndex: 0, stage: 0, ready: false, handWarm: 0 };
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
    const mission = requireMission(p.id);
    switch (p.stage) {
      case 0: // pure setup: parse the map
        p.map = new WorldMap(mission.map);
        p.stage++;
        break;
      case 1: { // level geometry + light
        this.renderer.buildLevel(p.map!, mission.map, mission.id, mission.entities);
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
        p.stage++;
        break;
      case 7: { // hand bakes: only needed when legacy 3D rig hands are enabled
        if (!SHOW_HANDS) {
          p.ready = true;
          break;
        }
        const tools = Object.keys(TOOL_HANDS);
        if (p.handWarm >= tools.length) {
          p.ready = true;
          break;
        }
        const rest = TOOL_HANDS[tools[p.handWarm++] as keyof typeof TOOL_HANDS].rest;
        try { bakeRig(rest, POSES[rest], { gender: this.gender, skin: currentSkin() }); } catch { /* bake warms lazily at draw */ }
        break;
      }
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
      // two rAFs: let the plate paint, then finish prep in ~24ms slices per
      // frame — a monolithic drain piles every warm (e.g. hand bakes) into
      // one giant stall frame
      let steps = 0;
      const drain = () => {
        if (this.prepGen !== gen || this.screen !== 'loading') return;
        try {
          const t0 = performance.now();
          while (!p.ready && performance.now() - t0 < 24) {
            this.prepStep(p);
            if (++steps > 400) throw new Error('mission prep did not finish');
          }
          if (!p.ready) {
            requestAnimationFrame(drain);
            return;
          }
          if (this.prepGen !== gen || this.screen !== 'loading') return;
          this.startMission(id);
        } catch (err) {
          console.error(err);
          this.abortLoad(id, gen);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(drain));
      return;
    }
    this.startMission(id);
  }

  private showDebrief(): void {
    const rt = this.runtime!;
    const mission = rt.mission;
    const retryCheckpoint = rt.finished === 'lost'
      ? latestRetryCheckpoint(this.automaticCheckpoint, this.quickCheckpoint)
      : null;
    this.releaseLock();
    this.audio.startMusic('debrief');
    this.setScreen('debrief', screens.debrief({
      mission,
      won: rt.finished === 'won',
      score: rt.score,
      scoreLog: rt.scoreLog,
      objectives: rt.objectiveSummary(),
      evidence: rt.evidence,
      stats: rt.stats(),
      loss: rt.lossCause,
      unscored: rt.unscored,
      retryCheckpoint: retryCheckpoint
        ? { label: retryCheckpoint.label, onRetry: () => this.restoreCheckpoint(retryCheckpoint) }
        : undefined,
      onRedeploy: () => this.startMission(mission.id),
      onDone: () => {
        this.clearCheckpoints();
        // EGGS: a secret exit routes onward to the hidden mission's briefing.
        if (rt.nextMission) this.showBriefing(rt.nextMission);
        else this.showMissionSelect();
      },
    }));
  }

  // ---------- mission lifecycle ----------

  private startMission(id: string, opts: { keepSave?: boolean } = {}): void {
    const mission = requireMission(id);
    this.clearCheckpoints();
    if (!opts.keepSave) clearSavedCheckpoints();
    registerThreatSprites();
    const prep = this.prepared && this.prepared.id === id ? this.prepared : null;
    this.prepared = null; // prep is consumed; a retry re-runs the synchronous path
    this.map = prep?.map ?? new WorldMap(mission.map);
    const seed = DEBUG ? 0 : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
    this.runtime = new MissionRuntime(mission, this.bus, this.settings.skill, seed);
    this.dossier.reset();
    const sp = mission.map.spawn;
    this.player = new Player(sp.x, sp.y, sp.angle);
    this.player.bobScale = this.settings.viewBob ? 1 : 0;
    this.player.snap();
    this.vmLight = 1;
    this.projectiles = [];
    this.particles.clear();
    this.feel = new Feel();
    this.feel.setWashScale(flashStrength(this.settings.reducedFlash));
    this.arsenal.reset(mission, this.gender);
    const firstRun = shouldOnboard(mission.id, completedIds());
    this.arsenal.introduce(
      newToolsFor(mission.id).map((toolId) => toolRegistry.require(toolId)),
      firstRun ? onboardingTips(resolveBindings(this.settings.bindings)) : [],
    );
    if (firstRun) markOnboardingSeen();
    this.god = false;
    this.arsenal.face.god = false;
    this.cheatBuf = new CheatBuffer();
    this.useCd = 0;
    this.simT = 0;
    this.replicaGate.reset();
    this.lastHurtT = -Infinity;
    this.endTimer = null;
    this.endCalled = false;
    this.deathDrop = 0;
    this.deathRoll = 0;

    this.lastAimWarnT = -Infinity;
    this.prompt = { lmb: null, use: null, lmbHot: false, banner: null, footer: null, lmbKey: 'LMB' };
    this.promptNextT = 0;
    this.lastFireT = -Infinity;
    this.hitConfirm.reset();
    this.reticleHint = null;
    this.bannerUntil = 0;
    this.objectivesDone = -1;
    this.nudgeAt = 45;
    this.nudgeScanT = 0;
    this.checkpointDone.clear();
    this.lastToolId = this.arsenal.current.id;
    this.switchedTool = false;
    this.toolFxUntil.clear();
    this.edrPulseUntil = -Infinity;
    this.edrPulseCount = 0;
    this.sealedDoors.clear();
    this.dossierOpened.clear();
    this.evidenceUnread = EMPTY_EVIDENCE_UNREAD;
    this.automap.reset();
    this.noticedThreats.clear();
    this.drainers.clear();
    this.wormBudget.remaining = wormPropagateCap(mission.difficulty);
    this.hitStopT = 0;
    if (!prep?.built) this.renderer.buildLevel(this.map, mission.map, mission.id, mission.entities);
    this.audio.setVoice(this.gender);
    this.audio.setListener(this.player.x, this.player.y, this.player.angle);
    this.audio.startAmbience();
    this.audio.setMusicVolume(this.settings.musicVol);
    this.audio.setSfxVolume(this.settings.sfxVol);
    // room-scale reverb: open-floor share of the grid is the room-size proxy
    let open = 0;
    for (const row of mission.map.grid) {
      for (const ch of row) {
        const kind = mission.map.legend[ch]?.kind;
        if (kind === 'floor' || kind === 'door' || kind === 'exit') open++;
      }
    }
    const cells = Math.max(1, mission.map.grid.length * (mission.map.grid[0]?.length ?? 0));
    this.audio.setRoomSize(Math.max(0.15, Math.min(1, (open / cells) * 1.9)));
    this.bossStung = false;
    this.deathStung = false;
    this.audio.startMusic(musicTierForMission(mission.id, mission.difficulty));
    this.setScreen('play', null);
    if (!DEBUG) this.input.requestLock();
    this.hud.clearMessages();
    this.hud.pushMessage(`${mission.title} — good luck, analyst`, 'info');
    this.automaticCheckpoint = this.captureCheckpoint('MISSION START');
    // finish warming the legacy 3D tool hand bakes only when enabled
    if (SHOW_HANDS) {
      let hw = 0;
      const warmTools = Object.keys(TOOL_HANDS);
      const warmStep = () => {
        if (hw >= warmTools.length || this.screen !== 'play') return;
        const rest = TOOL_HANDS[warmTools[hw++] as keyof typeof TOOL_HANDS].rest;
        try { bakeRig(rest, POSES[rest], { gender: this.gender, skin: currentSkin() }); } catch { /* lazy bake covers it */ }
        if (hw < warmTools.length) this.scheduleIdle(warmStep);
      };
      this.scheduleIdle(warmStep);
    }
  }

  private captureCheckpoint(label: string): Checkpoint {
    const runtime = this.runtime!;
    this.checkpointClock = Math.max(performance.now(), this.checkpointClock + 0.001);
    return {
      label,
      runtime: runtime.snapshot(),
      player: this.player!.snapshot(),
      arsenal: this.arsenal.snapshot(),
      doors: this.map!.snapshot(),
      elapsedAt: this.checkpointClock,
    };
  }

  private clearCheckpoints(): void {
    this.automaticCheckpoint = null;
    this.quickCheckpoint = null;
  }

  private saveCheckpoints(): void {
    if (!this.runtime) return;
    persistCheckpoints({
      missionId: this.runtime.mission.id,
      skill: this.settings.skill,
      gender: this.gender,
      automatic: this.automaticCheckpoint,
      quick: this.quickCheckpoint,
    });
  }

  /** Resume the checkpoint persisted before the last reload. */
  private continueSaved(): void {
    const saved = loadSavedCheckpoints();
    const checkpoint = saved ? resumeCheckpoint(saved) : null;
    if (!saved || !checkpoint || !missionById(saved.missionId)) {
      clearSavedCheckpoints();
      this.showTitle();
      return;
    }
    this.gender = saved.gender === 'female' ? 'female' : 'male';
    if (isSkillId(saved.skill)) this.settings.skill = saved.skill;
    this.startMission(saved.missionId, { keepSave: true });
    this.automaticCheckpoint = saved.automatic;
    this.quickCheckpoint = saved.quick;
    this.checkpointClock = Math.max(
      this.checkpointClock,
      saved.automatic?.elapsedAt ?? 0,
      saved.quick?.elapsedAt ?? 0,
    );
    this.restoreCheckpoint(checkpoint);
  }

  private restoreCheckpoint(checkpoint: Checkpoint): void {
    const alreadyPlaying = this.screen === 'play';
    this.runtime!.restore(checkpoint.runtime);
    this.player!.restore(checkpoint.player as ReturnType<Player['snapshot']>);
    this.arsenal.restore(checkpoint.arsenal as ReturnType<Arsenal['snapshot']>);
    this.arsenal.face.god = this.god;
    this.map!.restore(checkpoint.doors as ReturnType<WorldMap['snapshot']>);
    // The renderer must mirror every open door in the restored snapshot: slabs
    // built as closed would otherwise stay drawn while collision is open —
    // you could walk through a door that looks shut. Seals live in runtime
    // state (the snapshot covers them), but sealedDoors and the padlock
    // overlays live here, so rebuild both.
    for (const cellDef of Object.values(this.map!.def.legend)) {
      if (cellDef.kind === 'door' && cellDef.doorId && this.map!.isDoorOpen(cellDef.doorId)) {
        this.renderer.clearDoor(cellDef.doorId);
      }
    }
    this.sealedDoors.clear();
    for (const e of this.runtime!.entities) {
      const seal = e.alive ? (e.state.seal as SealTarget | undefined) : undefined;
      if (seal?.kind === 'door') this.sealedDoors.add(seal.id);
      if (seal) this.renderer.sealMark(seal.id, seal.x, seal.y, seal.kind);
    }
    this.projectiles = [];
    this.particles.clear();
    this.endTimer = null;
    this.endCalled = false;
    this.deathDrop = 0;
    this.deathRoll = 0;
    this.deathStung = false;

    this.useCd = 0;
    this.automap.close();
    this.dossier.close();
    this.audio.setListener(this.player!.x, this.player!.y, this.player!.angle);
    this.audio.setCombat(false);
    if (!alreadyPlaying) {
      this.audio.stopMusic();
      this.audio.startAmbience();
      this.audio.startMusic(musicTierForMission(this.runtime!.mission.id, this.runtime!.mission.difficulty));
    }
    this.setScreen('play', null);
    this.hud.clearMessages();
    this.hud.pushMessage(`RESTORED: ${checkpoint.label}`, 'good');
    if (!DEBUG) this.input.requestLock();
  }

  private endMission(): void {
    if (this.endCalled) return;
    this.endCalled = true;
    this.audio.stopAmbience();
    this.audio.stopMusic();
    // death already played sting-death; sting-lose is for non-death failures
    const endSting = this.runtime?.finished === 'won' ? 'sting-win' : this.deathStung ? null : 'sting-lose';
    if (endSting) this.audio.playSting(endSting);
    this.showDebrief();
  }

  // ---------- per-frame ----------

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      // probeLock freezes the sim while the look probes capture frames, so a
      // game tick can't drift the camera or the staged enemy between shots.
      if (!this.probeLock) {
        const runtime = this.runtime;
        this.input.poll();
        this.tick(FIXED_DT);
        if (runtime && this.runtime === runtime) {
          // checkpointDone persists between ticks so the completion diff is a
          // scan, not a 240 Hz Set allocation.
          const label = objectiveCheckpointLabel(this.checkpointDone, runtime.objectives, runtime.finished !== null);
          if (label) {
            for (const objective of runtime.objectives) if (objective.done) this.checkpointDone.add(objective.def.id);
            this.automaticCheckpoint = this.captureCheckpoint(label);
            this.saveCheckpoints();
            this.hud.pushMessage('CHECKPOINT SAVED', 'good');
          }
        }
      }
      this.acc -= FIXED_DT;
    }
    this.syncChrome();
    this.pollPadMenu(dt);
    if (this.screen === 'play' && this.map && this.player && this.runtime) {
      const mouseDX = this.input.consumeMouseDX();
      if (!this.paused && !this.dossier.isOpen && this.runtime.finished === null) {
        this.player.angle += mouseDX * 0.0028 * this.settings.sensitivity;
      }
      // hand sway (spec §5.6): second-order springs on the fixed 240 Hz step —
      // x: spring(16,.70) target ±28 from mouse dx + lateral velocity;
      // y: spring(13,.85) target ±16 from forward velocity. Frame-rate free.
      const latV = -this.player.vx * Math.sin(this.player.angle) + this.player.vy * Math.cos(this.player.angle);
      const fwdV = this.player.vx * Math.cos(this.player.angle) + this.player.vy * Math.sin(this.player.angle);
      const [swTx, swTy] = swayTarget(this.paused || this.dossier.isOpen ? 0 : mouseDX / Math.max(dt, 1e-4), latV, fwdV, 0);
      const swX = springStep(this.swayX, swTx, dt, SWAY.xw, SWAY.xz);
      const swY = springStep(this.swayY, swTy, dt, SWAY.yw, SWAY.yz);
      this.vmSway.x = swX;
      this.vmSway.y = swY;
      // hand roll/scale couple off the sway; bob pitch feeds the baked variants
      handMods.roll = SWAY.rollK * swX;
      handMods.bobPitch = this.player.bobPitchDeg;
      // idle breathing (spec §5.4): 1.6px @ 0.22 Hz + 0.6px @ 0.14 Hz
      const [, breath] = this.paused ? [0, 0] : breathF(this.simT);
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
        dz: lostEnd ? -(EYE_HEIGHT - 0.15) * this.deathDrop : this.player.viewBobZ - this.feel.punchDip,
        roll: (lostEnd ? this.deathRoll : 0) + this.feel.hurtRoll,
        pitch: this.feel.hurtPitch,
        hurt: this.feel.red,
        hurtSide: this.feel.hurtSide,
        bonus: this.feel.bonusAmt,
      };
      this.renderer.render(this.player, pose);
      const targetLight = this.renderer.viewLight(this.player.x, this.player.y);
      this.vmLight += (targetLight - this.vmLight) * Math.min(1, dt * 6);
      const ars = this.arsenal;
      const integrity = this.player.integrity;
      const activeBoss = this.runtime.entities.find(
        (e) => e.alive && e.state.awake && ENEMY_PROFILES[e.def.threat ?? e.def.sprite]?.boss,
      );
      this.hud.draw({
        integrity,
        armor: this.player.armor,
        overclockT: this.player.overclockT,
        airgapT: this.player.airgapT,
        boss: activeBoss
          ? {
              name:
                activeBoss.def.inspect?.label ??
                (activeBoss.def.sprite === 'boss-ghostledger'
                  ? 'GHOSTLEDGER C2 CORE'
                  : activeBoss.def.sprite === 'boss-locker'
                    ? 'LOCKER OVERLORD'
                    : activeBoss.def.sprite === 'boss-phish'
                      ? 'VISHING BROKER'
                      : activeBoss.def.sprite === 'boss-zeroday'
                        ? 'CVE-0DAY EXPLOIT'
                        : activeBoss.def.sprite.toUpperCase()),
              hp: activeBoss.hp,
              maxHp: Math.max(activeBoss.hp, (activeBoss.state.maxHp as number | undefined) ?? activeBoss.def.hp ?? 100),
              phase: (activeBoss.state.bossPhase as number | undefined) ?? 1,
              phaseCount: (activeBoss.state.bossPhaseCount as number | undefined) ?? 1,
              phaseLabel: (activeBoss.state.bossPhaseLabel as string | undefined) ?? '',
              telegraph: (activeBoss.state.bossTelegraph as string | undefined) || null,
            }
          : null,
        ammo: ars.ammoFor(),
        ammoName: ars.current.ammo?.resource ?? '',
        tool: ars.current,
        viewTool: ars.viewTool,
        bob: this.settings.viewBob ? this.player.bob : 0,
        cooldownFrac: ars.cooldownFrac,
        gender: this.gender,
        anim: { ...ars.anim(), light: this.vmLight },
        owned: [...ars.owned],
        resources: ars.resources(),
        got: ars.got(),
        face: (g, x, y) => ars.drawFace(g, x, y, integrity),
        // lower/raise on switch comes from anim.lower; death drops the hands off-screen
        viewmodelOffset: {
          x: this.player.weaponBobX + Math.round(this.vmSway.x),
          y: this.player.weaponBobY + (lostEnd ? 240 : 0) + Math.round(this.feel.viewKick * 22) + Math.round(this.vmSway.y + breath),
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
        this.runtime?.automapOverlay(),
      );
      this.dossier.draw();
      this.composeFrame();
    }
  }

  private pollPadMenu(dt: number): void {
    const inMenu = this.screen !== 'play' || this.paused;
    const pad = this.input.standardGamepad();
    if (!inMenu || !pad) {
      this.padMenu.prime(pad);
      return;
    }
    for (const key of this.padMenu.step(pad, dt, { startConfirms: this.screen !== 'play' })) {
      dispatchPadKey(key);
    }
  }

  /**
   * Resolve an E press against the crosshair target. `worldTicked` says whether
   * runtime.update already ran this frame (normal path) — when the dossier is
   * open it didn't, so doors get a zero-dt runtime pass for reader/swipe logic.
   */
  private resolveUsePress(worldTicked: boolean): void {
    const runtime = this.runtime;
    const p = this.player;
    const map = this.map;
    if (!runtime || !p || !map) return;
    const r = resolveUse(this.useCtx());
    if (r.kind === 'door') {
      if (!worldTicked) {
        const uw = this.updateWorld;
        uw.player = p;
        uw.map = map;
        uw.use = true;
        uw.hasBadge = this.arsenal.owns('badge');
        uw.hasToken = this.arsenal.owns('mfa');
        runtime.update(0, uw);
      }
      this.useCd = 0.3;
      if (r.door.accessRole !== undefined && !runtime.roles.includes(r.door.accessRole)) {
        this.audio.sfx('oof');
      }
    } else if (r.kind === 'bump') {
      this.audio.sfx('oof');
    } else {
      this.useCd = 0.3;
      const aheadLift =
        map.cellAt(Math.floor(p.x + Math.cos(p.angle) * 1.1), Math.floor(p.y + Math.sin(p.angle) * 1.1))?.lift ??
        map.cellAt(Math.floor(p.x), Math.floor(p.y))?.lift;
      if (r.kind === 'entity') this.bus.emit('interact', { entityId: r.entity.def.id });
      else if (aheadLift && map.activateLift(aheadLift.id)) {
        this.audio.sfx('door', { x: p.x, y: p.y });
        this.hud.pushMessage('LIFT ENGAGED', 'info');
      } else this.hud.pushMessage('Nothing in reach — aim at it and get closer.', 'info');
    }
  }

  private consumeDossierInput(): void {
    this.input.bankFire();
    this.input.firePressed = false;
    this.input.usePressed = false;
    this.input.slotPressed = null;
    this.input.consumeWheel();
    this.input.consumeMouseDX();
    this.debugFire = false;
  }

  private tick(dt: number): void {
    if (this.screen !== 'play' || !this.map || !this.player || !this.runtime) return;
    if (this.input.pausePressed) {
      if (this.dossier.isOpen) this.dossier.close();
      else if (this.paused) this.hidePause(true);
      else if (this.automap.isOpen) this.automap.close();
      else this.showPause();
    }
    if (!this.paused) {
      if (this.input.mapPressed && !this.dossier.isOpen) this.automap.toggle();
      if (this.input.logPressed) this.dossier.toggleLog();
    }
    if (this.paused) {
      this.consumeDossierInput();
      return;
    }
    if (this.dossier.isOpen) {
      // the log is open: the LOG +N badge count starts over
      this.evidenceUnread = markEvidenceRead(this.evidenceUnread);
      // The world stays paused for reading, but E still resolves the
      // crosshair target — fresh evidence swaps the dossier to it. useCd must
      // tick here: its normal decrement sits below this early-return.
      this.useCd = Math.max(0, this.useCd - dt);
      if (this.input.usePressed && this.useCd <= 0) this.resolveUsePress(false);
      this.consumeDossierInput();
      return;
    }
    // Kill hit-stop: a ~50 ms sim-time freeze makes each kill land; the
    // render frame still draws (and the player can still turn).
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      this.input.unpoll();
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
    if (!ending && this.input.cyclePrevPressed) this.arsenal.cycle(-1);
    const wheel = this.input.consumeWheel();
    if (!ending && wheel !== 0) this.arsenal.cycle(wheel);

    // Switch banner + first-switch tracking (title swaps when the raise begins).
    if (this.arsenal.current.id !== this.lastToolId) {
      this.lastToolId = this.arsenal.current.id;
      this.bannerUntil = this.simT + 1.4;
      this.switchedTool = true;
    }
    this.updatePrompt(ending);
    this.syncReticle();

    const solids = runtime.entities
      .filter((e) => e.alive && ['enemy', 'npc', 'workstation', 'console'].includes(e.def.kind))
      .map((e) => ({ x: e.x, y: e.y, r: 0.3 }));
    const fwd =
      !ending
        ? clampInputAxis(
            (this.input.actionDown('forward') ? 1 : 0) -
              (this.input.actionDown('back') ? 1 : 0) +
              this.input.padMove.y,
          )
        : 0;
    const strafe =
      !ending
        ? clampInputAxis(
            (this.input.actionDown('strafeRight') ? 1 : 0) -
              (this.input.actionDown('strafeLeft') ? 1 : 0) +
              this.input.padMove.x,
          )
        : 0;
    const keyTurn =
      !ending ? (this.input.actionDown('turnRight') ? 1 : 0) - (this.input.actionDown('turnLeft') ? 1 : 0) : 0;
    const run = this.input.actionDown('run') || this.input.padRun;
    p.move(map, fwd, strafe, run, keyTurn, dt, solids);
    if (!ending) p.angle += this.input.padTurn * 2.6 * dt * this.settings.sensitivity;
    if (p.consumeStep()) {
      this.audio.sfx('step', { pan: this.stepPan * 0.15 });
      this.stepPan *= -1;
    }
    this.useCd = Math.max(0, this.useCd - dt);
    this.hud.tick(dt);
    this.guidanceNudge(runtime);
    // updateWorld is reused every 240 Hz tick — only the per-tick fields move.
    const uw = this.updateWorld;
    uw.player = p;
    uw.map = this.map!;
    uw.use = this.input.usePressed;
    uw.hasBadge = this.arsenal.owns('badge');
    uw.hasToken = this.arsenal.owns('mfa');
    this.runtime.update(dt, uw);
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
    const arsenalDt = this.player.overclockT > 0 ? dt * 2 : dt;
    this.arsenal.update(arsenalDt, !ending && this.input.fireHeld, fired, () => this.toolCtx());

    if (!ending && !this.arsenal.switching && this.input.usePressed && this.useCd <= 0) {
      this.resolveUsePress(true);
    }

    updateEntities(runtime.entities, map, p, dt, {
      onSight: (e) => this.audio.sfx(`sight-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y }),
      onWindup: (e, dur) => this.audio.sfx('windup', { x: e.x, y: e.y, dur }),
      onMelee: (e, dmg) => {
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx(`attack-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y });
        this.hurtPlayer(dmg, e.x, e.y, e);
      },
      onFire: (e, projectile) => {
        this.projectiles.push({ ...projectile, alive: true, traveled: 0 });
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx(`fire-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y });
      },
      onGrowl: (e) => this.audio.sfx(`growl-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y, gain: 0.6 }),
      onIdle: (e) => this.audio.sfx(`idle-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y, gain: 0.5 }),
      onEnemyMelee: (e, target, dmg) => {
        // infighting: the attacker's melee lands on its grudge target
        this.particles.pop(e.x, e.y, muzzleHeight(e));
        this.audio.sfx(`attack-${e.def.threat ?? e.def.sprite}`, { x: e.x, y: e.y });
        const result = damageEntity(target, dmg, target.x - e.x, target.y - e.y);
        if (result === 'killed') {
          this.bus.emit('cleaned', { entityId: target.def.id });
        } else {
          this.particles.burst(target.x, target.y, 0.4, 'hit', bloodOf(target), target.x - e.x, target.y - e.y);
          this.impactBloom(target.x, target.y, bloodOf(target));
          this.audio.sfx(`pain-${target.def.threat ?? target.def.sprite}`, { x: target.x, y: target.y });
          target.state.grudgeId = e.def.id;
          target.state.grudgeT = 8;
          target.state.aggroed = true;
          target.state.sighted = true;
          if (!target.state.mode || target.state.mode === 'idle') target.state.mode = 'chase';
        }
      },
      onSpawn: (e) => {
        this.particles.spawn(e.x, e.y);
        this.renderer.spawnTeleport(e.x, e.y);
        this.audio.sfx('spawn', { x: e.x, y: e.y });
        this.spawnCue(e, 'replica');
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
        const isBoss = ENEMY_PROFILES[key]?.boss === true;
        const dedupKey = isBoss ? `${key}:${text}` : key;
        if (this.noticedThreats.has(dedupKey)) return;
        this.noticedThreats.add(dedupKey);
        this.hud.pushMessage(text, isBoss ? 'bad' : 'warn');
      },
      wormCopyBudget: this.wormBudget,
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
      if (hit && projectile.hostile && hit.def.kind === 'enemy') {
        // hostile fire struck another enemy — damage it and turn it on the shooter
        const srcId = projectile.source?.startsWith('enemy:') ? projectile.source.slice(6) : null;
        const result = damageEntity(hit, projectile.damage ?? 8, projectile.dx, projectile.dy);
        this.particles.burst(x, y, 0.4, 'hit', bloodOf(hit), projectile.dx, projectile.dy);
        this.impactBloom(x, y, bloodOf(hit));
        if (result === 'killed') {
          this.bus.emit('cleaned', { entityId: hit.def.id });
        } else {
          this.audio.sfx(`pain-${hit.def.threat ?? hit.def.sprite}`, { x: hit.x, y: hit.y });
          if (srcId && srcId !== hit.def.id) {
            hit.state.grudgeId = srcId;
            hit.state.grudgeT = 8;
            hit.state.aggroed = true;
            hit.state.sighted = true;
            if (!hit.state.mode || hit.state.mode === 'idle') hit.state.mode = 'chase';
          }
        }
        continue;
      }
      if (hit && hit.def.kind === 'workstation' && projectile.traveled > USB_PLUG_RANGE) {
        this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: false });
        this.hud.pushMessage('Workstations are cleaned at arm\'s length: walk up and plug the scanner stick in.', 'warn');
      } else if (hit) {
        if (hit.infected) {
          const dmg = hit.state.flagCorrect ? 4 : 2;
          if (hit.def.kind === 'enemy' && !hit.state.flagCorrect && this.simT - this.flagHintAt > 8) {
            this.flagHintAt = this.simT;
            this.hud.pushMessage(
              'UNFLAGGED PROCESS: inspect + flag it with the MOUSE for double scan damage',
              'info',
            );
          }
          const result = damageEntity(hit, dmg, projectile.dx, projectile.dy);
          this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: true });
          if (result === 'killed') {
            this.bus.emit('cleaned', { entityId: hit.def.id });
          } else {
            this.particles.toolImpact('usb', x, y, 0.4);
            if (hit.def.kind === 'enemy') {
              this.audio.sfx(`pain-${hit.def.threat ?? hit.def.sprite}`, { x: hit.x, y: hit.y });
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
        const text = this.applyResourceGrant(resource, amount);
        this.bus.emit('pickup', { entityId: e.def.id });
        this.hud.pushPickup(text);
      }
    }
    const cell = map.cellAtF(p.x, p.y);
    const onExit = cell?.kind === 'exit';
    // Standing on the pad re-emits every tick so a locked exit keeps
    // re-explaining itself (the handler throttles its own message) instead of
    // going silent after the first touch.
    if (onExit && runtime.finished === null) {
      this.bus.emit('reach-exit', { secretTo: cell?.secretExit });
    }

    map.updateDoors(dt);
    map.updateLifts(dt);
    if (map.stepOnLift(Math.floor(p.x), Math.floor(p.y))) {
      this.audio.sfx('door', { x: p.x, y: p.y });
    }

    const combat = runtime.entities.some((e) =>
      e.alive &&
      e.def.kind === 'enemy' &&
      Math.hypot(e.x - p.x, e.y - p.y) <= 12 &&
      ['chase', 'windup', 'recover', 'pain'].includes(String(e.state.mode)),
    );
    const bossEngaged = runtime.entities.some((e) =>
      e.alive &&
      e.def.kind === 'enemy' &&
      ENEMY_PROFILES[e.def.threat ?? e.def.sprite]?.boss === true &&
      ['chase', 'windup', 'recover', 'pain'].includes(String(e.state.mode)),
    );
    const activeTier = this.audio.activeMusicTier();
    if (bossEngaged && activeTier !== 'boss' && activeTier !== 'rick') {
      this.audio.startMusic('boss');
    } else if (!bossEngaged && activeTier === 'boss' && !runtime.entities.some((e) =>
      e.alive && ENEMY_PROFILES[e.def.threat ?? e.def.sprite]?.boss === true,
    )) {
      this.audio.startMusic(musicTierForMission(runtime.mission.id, runtime.mission.difficulty));
    }
    this.audio.setCombat(combat || bossEngaged || this.simT - this.lastHurtT < 3);

    if (runtime.finished && this.endTimer === null) {
      this.endTimer = runtime.finished === 'lost' ? 1.6 : 0.5;
      if (runtime.finished === 'won') clearSavedCheckpoints();
      // EGGS: a cheated run wins but never records completion/progress.
      if (runtime.finished === 'won' && !runtime.unscored) markCompleted(runtime.mission.id);
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

  /** Landed-hit world bloom at the hit point — the WCAG 2.3.1 flash budget
   *  caps the full-screen component; the sprite flash stays ungated. */
  private impactBloom(x: number, y: number, blood: [number, number, number]): void {
    if (this.flashLimit.allow(this.simT)) {
      this.renderer.impactLight(x, y, blood[0], blood[1], blood[2], 0.9 * flashStrength(this.settings.reducedFlash));
    }
  }

  // ---------- EGGS: cheat codes ----------

  /** Doom-style typed cheat: applies the effect, marks the run unscored,
   *  grins the HUD face. `id` comes from CHEATS (see eggs/cheats.ts). */
  private applyCheat(id: string): void {
    const rt = this.runtime;
    const map = this.map;
    if (!rt || rt.finished || !map) return;
    switch (id) {
      case 'god': {
        this.god = !this.god;
        this.arsenal.face.god = this.god;
        this.audio.sfx('oof');
        this.hud.pushMessage(this.god ? 'CHEAT: SUDO — privilege escalation engaged' : 'CHEAT: root shell dropped', 'warn');
        break;
      }
      case 'keys': {
        const roles = new Set<string>();
        for (const cell of Object.values(map.def.legend)) {
          if (cell.accessRole) roles.add(cell.accessRole);
        }
        for (const role of roles) rt.grantRole(role);
        this.audio.sfx('pickup');
        this.hud.pushMessage('CHEAT: HUNTER2 — all access granted (it shows as *******)', 'warn');
        break;
      }
      case 'map': {
        rt.revealAll();
        rt.revealAllSecretDoors();
        this.audio.sfx('pickup');
        this.hud.pushMessage('CHEAT: WIRESHARK — full capture (map + secrets revealed)', 'warn');
        break;
      }
      case 'music': {
        this.audio.startMusic('rick');
        this.hud.pushMessage('CHEAT: RICKROLL — never gonna give you uptime', 'warn');
        break;
      }
      case 'dns': {
        this.audio.sfx('oof');
        this.hud.pushMessage('DIAGNOSTIC COMPLETE: it is always DNS.', 'warn');
        break;
      }
      default:
        return;
    }
    rt.markUnscored(id);
    this.arsenal.face.grin();
  }

  /** EGGS: Konami code on the title screen — unlock every mission. */
  private applyKonami(): void {
    unlockEverything();
    this.audio.unlock();
    this.audio.sfx('win');
    const el = document.createElement('div');
    el.textContent = 'ALL MISSIONS UNLOCKED';
    el.style.cssText =
      'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99;' +
      'background:#1a0f08;border:3px solid #ffb010;color:#ffd040;padding:12px 26px;' +
      'font:bold 20px monospace;letter-spacing:3px;image-rendering:pixelated';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  private hurtPlayer(dmg: number, sourceX: number, sourceY: number, source?: Entity): void {
    const p = this.player;
    const runtime = this.runtime;
    if (!p || !runtime || runtime.finished) return;
    // EGGS (SUDO): god mode — hits bounce off; the face keeps its grin.
    if (this.god) {
      this.audio.sfx('oof');
      return;
    }
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
    // the pain wash is a full-screen flash: it shares the WCAG 2.3.1 budget
    // with the fire flood and the hit bloom; the view kick always lands
    this.feel.hurt(dmg, side, this.flashLimit.allow(this.simT));
    this.audio.sfx('hurt');
    let da = Math.atan2(sourceY - p.y, sourceX - p.x) - p.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.arsenal.hurt(Math.abs(da) < 0.35 ? 0 : Math.sign(da));
    p.knockback(awayX, awayY, Math.min(0.35, 0.1 + dmg * 0.01));
    const by = source?.def.inspect?.label ?? runtime.entities.find((e) => e.x === sourceX && e.y === sourceY)?.def.inspect?.label;
    const label = (by ?? 'Malware').toUpperCase();
    this.drainers.set(source?.def.id ?? `?${sourceX},${sourceY}`, { label, until: this.simT + 3 });
    for (const [id, d] of this.drainers) if (d.until <= this.simT) this.drainers.delete(id);
    // timed, named alert ('WORM - 3 TILES BEHIND') + edge tint toward the attacker;
    // it fades ~2 s after the damage stops instead of a persistent ticker line
    this.hud.noteDamage({
      label,
      bearing: relativeBearing(sourceDx, sourceDy, p.angle),
      tiles: tileDistance(distance),
      others: Math.max(0, this.drainers.size - 1),
    });
    if (!p.alive) {
      this.audio.sfx('death');
      this.deathStung = true;
      this.audio.playSting('sting-death');
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
        if (
          hit.def.kind === 'enemy' &&
          !hit.state.flagCorrect &&
          this.simT - this.flagHintAt > 8
        ) {
          this.flagHintAt = this.simT;
          this.hud.pushMessage(
            'UNFLAGGED PROCESS: inspect + flag it with the MOUSE for double scan damage',
            'info',
          );
        }
        const result = damageEntity(hit, dmg, dx, dy);
        this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: true });
        if (result === 'killed') {
          this.bus.emit('cleaned', { entityId: hit.def.id });
        } else {
          this.particles.burst(x, y, 0.4, 'hit', bloodOf(hit), dx, dy);
          this.impactBloom(x, y, bloodOf(hit));
          if (hit.def.kind === 'enemy') this.audio.sfx(`pain-${hit.def.threat ?? hit.def.sprite}`, { x: hit.x, y: hit.y });
        }
      } else {
        this.bus.emit('tool-hit', { toolId: 'usb', entityId: hit.def.id, good: false });
        this.bus.emit('scan-miss', { entityId: hit.def.id });
        this.hud.pushMessage('Scan session wasted: that target is not infected.', 'warn');
      }
    }
  }

  private resolveFirewallHit(hit: Entity | null, x: number, y: number, dx: number, dy: number, dmg: number): void {
    if (!hit) {
      this.particles.burst(x, y, 0.25, 'hit', [255, 144, 48], dx, dy);
      return;
    }
    if (hit.def.kind === 'workstation') {
      this.hud.pushMessage('Firewall blocks network threats — plug in the USB Scanner (3) to clean endpoints.', 'info');
      return;
    }
    if (hit.infected) {
      const result = damageEntity(hit, dmg, dx, dy);
      this.bus.emit('tool-hit', { toolId: 'firewall', entityId: hit.def.id, good: true });
      if (result === 'killed') {
        this.bus.emit('cleaned', { entityId: hit.def.id });
      } else {
        this.particles.burst(x, y, 0.35, 'hit', bloodOf(hit), dx, dy);
        this.impactBloom(x, y, bloodOf(hit));
        if (hit.def.kind === 'enemy') this.audio.sfx(`pain-${hit.def.threat ?? hit.def.sprite}`, { x: hit.x, y: hit.y });
      }
    }
  }

  /** E/Space target context: shared by the E action and the HUD prompt. */
  private useCtx(tool?: ReturnType<typeof this.toolCtx>): UseTargetContext {
    tool ??= this.toolCtx();
    const map = this.map!;
    const rt = this.runtime!;
    return {
      isDoorAhead: tool.isDoorAhead,
      isDoorOpen: (doorId) => map.isDoorOpen(doorId),
      aimEntity: tool.aimEntity,
      wallDistance: tool.wallDistance,
      roles: rt.roles,
      hasBadge: this.arsenal.owns('badge'),
      hasToken: this.arsenal.owns('mfa'),
      mfaPending: mfaPending(rt.entities),
      // Name the entity that can badge the player into a role-gated door so a
      // "READER: ITOPS ONLY" reader tells you where to go, not just "no".
      roleSource: (role) => {
        const giver = rt.entities.find(
          (e) => e.alive && e.def.grants?.resource === `role:${role}`,
        );
        return giver ? giver.def.inspect?.label ?? giver.def.id : null;
      },
    };
  }

  /**
   * Action prompt (~15 Hz): what LMB does (current tool's hint(), with the
   * ammo-0 override) and what E does (resolveUse -> interactHint/doorUseHint).
   * Hidden while switching tools, in dossier/automap, or at mission end.
   * With the pointer free the prompts stay up (the keyboard still plays):
   * the tool line shows the fire key, since a click only captures the mouse,
   * and the footer says so (promptGate).
   */
  private updatePrompt(ending: boolean): void {
    this.prompt.lmbHot = this.simT - this.lastFireT < 0.25;
    const gate = promptGate({
      pointerLocked: this.input.pointerLocked,
      debug: DEBUG,
      ending,
      switching: this.arsenal.switching,
      overlayOpen: this.dossier.isOpen || this.automap.isOpen,
      switchedTool: this.switchedTool,
      simT: this.simT,
      fireKey: bindingLabel(resolveBindings(this.settings.bindings), 'fire'),
    });
    this.prompt.banner = this.simT < this.bannerUntil
      ? { title: `${this.arsenal.current.slot} ${this.arsenal.current.name}`, blurb: this.arsenal.current.blurb ?? '' }
      : null;
    this.prompt.footer = gate.footer;
    this.prompt.lmbKey = gate.toolKey;
    const hidden = !gate.showActions;
    if (this.simT < this.promptNextT || hidden) {
      if (hidden) {
        this.prompt.lmb = null;
        this.prompt.use = null;
        this.reticleHint = null;
      }
      return;
    }
    this.promptNextT = this.simT + 1 / 15;
    const tool = this.arsenal.current;
    const ctx = this.toolCtx();
    let lmb = tool.hint?.(ctx) ?? null;
    const ammo = tool.ammo ? this.arsenal.ammoFor(tool) : null;
    // the reticle shows range failure whenever aimed (the text prompt only
    // flashes it after a failed action, below)
    this.reticleHint = ammo === 0 && lmb ? { ready: false } : lmb;
    // range-failure hints only show for ~1.5 s after the failed action
    if (lmb?.fleeting && this.simT - this.lastFireT > 1.5) lmb = null;
    if (ammo === 0) lmb = { text: `OUT OF ${tool.ammo!.resource.toUpperCase()}`, ready: false };
    // ammo cost in tool-native units (-1 SCAN / -1 PCAP / ...) so the
    // trigger badge can't be misread as a file size ('1 MB')
    const cost = lmb?.ready && tool.ammo ? `-1 ${ammoUnit(tool.ammo.resource)}` : null;
    this.prompt.lmb = lmb ? { ...lmb, cost } : lmb;
    const uctx = this.useCtx(ctx);
    const r = resolveUse(uctx);
    if (r.kind === 'door') this.prompt.use = doorUseHint(uctx, r.door);
    else if (r.kind === 'entity') this.prompt.use = this.runtime!.interactHint(r.entity);
    else this.prompt.use = null;
  }

  // ---------- tool context ----------

  /**
   * "Stuck?" ticker nudge: when no required objective has advanced for 45 s of
   * live play, re-surface the active objective and where to look for targets.
   * Any progress, or any message the game already shows, resets the clock so
   * the nudge only fires when the player is actually drifting.
   */
  private guidanceNudge(runtime: MissionRuntime): void {
    // Progress polling at 2 Hz — the 45 s timer doesn't need per-frame scans.
    if (this.simT < this.nudgeScanT) return;
    this.nudgeScanT = this.simT + 0.5;
    // Partial progress counts too: cleaning 2 of 5 hosts resets the clock.
    const done = runtime.objectiveSummary().reduce(
      (sum, o) => sum + o.progress + (o.done ? 1 : 0),
      0,
    );
    if (done !== this.objectivesDone) {
      this.objectivesDone = done;
      this.nudgeAt = this.simT + 45;
      return;
    }
    if (this.simT < this.nudgeAt) return;
    const overlay = runtime.automapOverlay();
    if (!overlay.objectiveText) return;
    this.nudgeAt = this.simT + 45;
    const tip =
      overlay.objectivePoints.length > 0
        ? 'targets you have explored are marked on the automap [M]; full list on [TAB]'
        : 'check the automap [M] or the objective list [TAB] for the next step';
    this.hud.pushMessage(`OBJECTIVE: ${overlay.objectiveText} — ${tip}`, 'info', 'objective');
  }

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
        if (proj.source === 'firewall-pellet') {
          const shot = traceShot(p.x, p.y, proj.dx, proj.dy, proj.range, rt.entities, map);
          this.resolveFirewallHit(shot.hit, shot.x, shot.y, proj.dx, proj.dy, proj.damage ?? 1);
          this.projectiles.push({
            ...proj,
            speed: 36,
            range: shot.dist,
            alive: true,
            traveled: 0,
            cosmetic: true,
          });
          return;
        }
        this.projectiles.push({ ...proj, alive: true, traveled: 0 });
      },
      aimEntity: (maxDist: number, maxAngle: number, interactablesOnly = false) => {
        // Cheap cone/range cull first; the LOS raycast only runs on distance-
        // sorted survivors, and stops once the 0.25 crosshair-tie window closes.
        let candidates: { e: Entity; d: number; da: number }[] | null = null;
        for (const e of rt.entities) {
          if (!e.alive) continue;
          // E/Space presses aim past live malware to the console/host/item
          // under it; combat tools keep aiming at everything. Walk-over
          // pickups are never interact targets either — a charge parked on a
          // console's cell shouldn't shadow it.
          if (interactablesOnly && (e.def.kind === 'enemy' || e.def.kind === 'item')) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > maxDist) continue;
          let da = Math.atan2(dy, dx) - p.angle;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > maxAngle) continue;
          (candidates ??= []).push({ e, d, da });
        }
        if (!candidates) return null;
        candidates.sort((a, b) => a.d - b.d);
        let best: Entity | null = null;
        let bestD = 0;
        let bestDa = 0;
        for (const c of candidates) {
          // Nearest wins; stacked candidates within 0.25 fall to the one
          // closest to the crosshair. Past that window no later entry can win.
          if (best && c.d > bestD + 0.25) break;
          // line of sight
          if (map.raycast(p.x, p.y, p.angle, c.d).dist < c.d - 0.3) continue;
          if (best && c.d > bestD - 0.25 && Math.abs(c.da) >= bestDa) continue;
          best = c.e;
          bestD = c.d;
          bestDa = Math.abs(c.da);
        }
        return best;
      },
      authorizedRoles: rt.roles,
      role: rt.roles[rt.roles.length - 1] ?? this.role,
      scanHit: (e: Entity) =>
        this.resolveScannerHit(
          e, e.x, e.y,
          Math.cos(p.angle), Math.sin(p.angle),
          Math.hypot(e.x - p.x, e.y - p.y),
        ),
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
      spriteTops() {
        return g.renderer.debugSpriteTops();
      },
      state() {
        return {
          screen: g.screen,
          paused: g.paused,
          hudMessages: g.hud.debugMessages(),
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
          projectiles: g.projectiles.map((p) => ({
            x: p.x,
            y: p.y,
            alive: p.alive,
            hostile: p.hostile,
            src: p.source,
            traveled: p.traveled,
          })),
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
      openCaseFile(entityId: string) {
        g.dossier.show(`${entityId}:inspect`);
      },
      /** LEVELS: reveal every tile on the automap (screenshot/QA aid). */
      revealMap() {
        g.runtime?.revealAll();
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
      /** Take a real hit (dir -1/0/1 = attacker left/center/right): runs the
       *  same hurtPlayer path as enemy damage — integrity loss, pain wash,
       *  view kick, portrait reaction — so debug stills match play. */
      hurt(dir: number, dmg = 8) {
        const p = g.player;
        if (!p) {
          g.arsenal.hurt(dir);
          return;
        }
        const a = p.angle + dir * 0.9;
        g.hurtPlayer(dmg, p.x + Math.cos(a) * 1.2, p.y + Math.sin(a) * 1.2);
      },
      /** LOOK: threat-readability probe (see tools/look-contrast.mjs). */
      probe(kind: string, dist: number, withImages = false) {
        if (!g.map || !g.runtime || !g.player) throw new Error('no mission running');
        g.probeLock = true;
        return lookProbe(g.renderer, g.map, g.runtime.entities, g.player, kind, dist, withImages).finally(
          () => (g.probeLock = false),
        );
      },
      /** LOOK: light-diminishing probe — wall luma at ~2 vs ~10 tiles + dark-sector luma. */
      lightProbe(dist = 10, withImages = false) {
        if (!g.map || !g.runtime || !g.player) throw new Error('no mission running');
        g.probeLock = true;
        return lightProbe(g.renderer, g.map, g.runtime.entities, g.player, dist, withImages).finally(
          () => (g.probeLock = false),
        );
      },
      /** FEEL: current reticle class (ret-idle / ret-target / ret-blocked / ret-hit [+ ret-flash]). */
      reticle() {
        return g.cross.className;
      },
      /** LOOK: spawn-view legibility — mean luma, black share, ceiling/floor bands (opener rows). */
      openerProbe(withImages = false) {
        if (!g.map || !g.runtime || !g.player) throw new Error('no mission running');
        g.probeLock = true;
        return openerProbe(g.renderer, g.map, g.runtime.entities, g.player, withImages).finally(
          () => (g.probeLock = false),
        );
      },
      /** LOOK: strobing-sector presence — tiles covered + phase count (Doom blink sectors). */
      strobeInfo() {
        return g.renderer.strobeStats();
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
      /** FEEL: muzzle-flash world-light hook (same uniform the game uses on fire). */
      fireLight(r: number, g2: number, b: number, strength = 1.5) {
        g.renderer.fireLight(r, g2, b, strength);
      },
      /** FEEL: current muzzle-flash intensity 0-1, for capture/tests. */
      fireLevel() {
        return g.renderer.fireLevel();
      },
      /** LOOK: raw RGBA bytes of the next rendered 3D view (post-palette). */
      captureView() {
        return g.renderer.captureView();
      },
      /** FEEL: median luma of the next rendered frame's centre band. */
      viewLuma() {
        return g.renderer.captureView().then((v) => {
          const ls: number[] = [];
          for (let y = Math.floor(v.h * 0.2); y < v.h * 0.8; y++) {
            for (let x = Math.floor(v.w * 0.3); x < v.w * 0.7; x++) {
              const i = (y * v.w + x) * 4;
              ls.push(0.2126 * v.data[i] + 0.7152 * v.data[i + 1] + 0.0722 * v.data[i + 2]);
            }
          }
          ls.sort((a, b) => a - b);
          return ls[Math.floor(ls.length / 2)] ?? 0;
        });
      },
      /** EGGS: fire a cheat by id or code, e.g. cheat('god') or cheat('SUDO'). */
      cheat(code: string) {
        const id = CHEATS.find(
          (c) => c.id === code.toLowerCase() || c.code === code.toUpperCase(),
        )?.id;
        if (!id) return `unknown cheat ${code}`;
        g.applyCheat(id);
        return id;
      },
      /** EGGS: declared + revealed secrets/eggs, unscored + next-mission flags. */
      eggs() {
        const rt = g.runtime;
        if (!rt) return null;
        return {
          unscored: rt.unscored,
          god: g.god,
          nextMission: rt.nextMission ?? null,
          declared: [
            ...(rt.mission.script?.secrets ?? []).map((s) => s.id),
            ...(rt.mission.script?.eggs ?? []).map((e) => e.id),
          ],
          revealed: rt.revealedSecretIds(),
        };
      },
      unscored() {
        return g.runtime?.unscored ?? null;
      },
    };
  }

  /** Rough compass bearing from the player to a point, for refusal text. */
  private bearingTo(x: number, y: number): string {
    const p = this.player;
    if (!p) return 'nearby';
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) < 1.5) return 'right here';
    const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    return `to the ${dirs[i]}`;
  }

  private openDoor(doorId: string): void {
    const map = this.map;
    if (!map || map.doorFrac(doorId) >= 1) return;
    if (this.sealedDoors.has(doorId)) {
      this.audio.sfx('denied');
      const sealer = this.runtime?.entities.find(
        (e) => e.alive && (e.state.seal as SealTarget | undefined)?.kind === 'door' && (e.state.seal as SealTarget).id === doorId,
      );
      const where = sealer && this.player ? this.bearingTo(sealer.x, sealer.y) : '';
      this.hud.pushMessage(`ENCRYPTED: a ransomware sealed this door${where ? ` ${where}` : ''} — kill the ransomware to release the lock.`, 'warn');
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
