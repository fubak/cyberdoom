import type { EventBus } from '../core/events';
import type {
  CallAction,
  Entity,
  EvidenceEntry,
  Mission,
  MissionObjective,
  ScoreEvent,
} from '../core/types';
import { callFeedback, callOptions, requiredCall } from '../content/calls';
import { deriveFrameworkTags } from '../content/frameworks';
import { RADIO_LINES, formatRadioLine } from '../content/radio';
import { applySeededPools } from './seed';
import { objectiveById } from '../content/objectives';
import type { WorldMap } from '../engine/map';
import { ENEMY_PROFILES } from '../engine/ai';
import { completeMfa, refuseMfaPrompt } from '../tools/mfa';
import { swipeBadge } from '../tools/badge';
import { mouseTool } from '../tools/mouse';
import { difficultyScale, skillById, type Skill, type SkillId } from './difficulty';

/**
 * LEVELS: mission runtime.
 * Loads a Mission, owns spawned entities, tracks objective progress and
 * scoring, decides win/lose, and records ScoreEvents for the debrief.
 */
export type LossCause =
  | { kind: 'integrity'; by?: string; threat?: string }
  | { kind: 'objective'; objectiveId: string; text: string; strikes: number; violations: number };

export interface ObjectiveStatus {
  def: MissionObjective;
  done: boolean;
  failed: boolean;
  progress: number;
  target: number;
  violations: number;
}

export function scaledPickupGrant(
  resource: string,
  amount: number,
  ammoResources: Pick<ReadonlyMap<string, number>, 'has'>,
  scale: (amount: number) => number,
): number {
  return resource === 'integrity' || ammoResources.has(resource) ? scale(amount) : amount;
}

export type UpdateWorld = {
  player: { x: number; y: number; angle: number; integrity: number };
  map: WorldMap;
  use: boolean;
  openDoor: (doorId: string) => void;
  /** Whether the badge tool is in the kit (E at a reader swipes it). */
  hasBadge?: boolean;
  /** Whether the MFA token is in the kit (E at an MFA reader completes it). */
  hasToken?: boolean;
  flashTool?: (toolId: 'badge' | 'mfa') => void;
};

export class MissionRuntime {
  readonly mission: Mission;
  readonly skill: Skill;
  entities: Entity[];
  objectives: ObjectiveStatus[];
  evidence: EvidenceEntry[] = [];
  scoreLog: ScoreEvent[] = [];
  score = 0;
  roles: string[];
  inventory = new Set<string>();
  /** Fog-of-war cells as `ty * mapWidth + tx` keys — integer keys avoid the
   * ~1,900 string allocations per 0.1 s sweep that `"x,y"` pairs cost. */
  visited = new Set<number>();
  elapsed = 0;
  lossReason: string | null = null;
  lossCause: LossCause | null = null;

  private pendingAccusation: Entity | null = null;
  private inspected = new Set<string>();
  private callsResolved = new Set<string>();
  private callAttempts = new Map<string, number>();
  private firstCallRight = 0;
  private triageScored = new Set<string>();
  private falsePositiveSources = new Set<string>();
  private priorityMisses = new Set<string>();
  private wrongChoicesScored = new Set<string>();
  private wrongCallStrikes = new Set<string>();
  private earlyWarnAt = new Map<string, number>();
  private rejectedUnconfirmedHosts = new Set<string>();
  private counted = new Map<string, Set<string>>();
  private cleaned = new Set<string>();
  private initialHp = new Map<string, number>();
  private initialInfected = new Map<string, boolean>();
  private firedTriggers = new Set<string>();
  private revealedSecrets = new Set<string>();
  private revealedSecretDoors = new Set<string>();
  private doorAccessScored = new Set<string>();
  private warnedOutOfRoleDoorAt = new Map<string, number>();
  private grantApplied = new Set<string>();
  private radioSent = new Set<'start' | 'midpoint' | 'ready'>();
  private hasToken = false;
  private outbreakElapsed = 0;
  private outbreakTicks = 0;
  private lastExitMessage = -Infinity;
  private currentPlayer: UpdateWorld['player'] | null = null;
  private tallied = false;
  private visitElapsed = 0;

  finished: 'won' | 'lost' | null = null;
  /** EGGS: any cheat fired — the run completes but scores nothing. */
  unscored = false;
  /** EGGS: secret exit taken — debrief routes to this hidden mission's briefing. */
  nextMission?: string;

  readonly seed: number;

  constructor(mission: Mission, private bus: EventBus, skill: SkillId = 'analyst', seed = 0) {
    this.seed = seed;
    const seeded = applySeededPools(mission, seed);
    this.mission = seeded;
    this.skill = skillById(skill);
    this.roles = [...seeded.authorizedRoles];
    const scaling = difficultyScale(seeded.difficulty);
    this.entities = seeded.entities.map((def) => {
      const hp = (def.hp ?? 1) + (def.kind === 'enemy' ? scaling.hpBonus + this.skill.hpBonus : 0);
      this.initialHp.set(def.id, hp);
      this.initialInfected.set(def.id, def.infected ?? false);
      return {
        def,
        x: def.x,
        y: def.y,
        hp,
        alive: !def.dormant,
        infected: def.infected ?? false,
        state: def.kind === 'enemy'
          ? {
              speedMul: scaling.speedMul * this.skill.speed,
              dmgMul: scaling.dmgMul * this.skill.dmg,
              skillDmg: this.skill.dmg,
              aggro: scaling.aggro,
              maxHp: hp,
              // Opening grace: mission-start enemies cannot aggro for ~3 s
              // (dormant/triggered spawns get their own grace when they wake).
              ...(def.dormant ? {} : { spawnGrace: 3 }),
            }
          : {},
      };
    });
    this.objectives = mission.missionObjectives.map((def) => ({
      def,
      done: false,
      failed: false,
      progress: 0,
      target: def.count ?? 1,
      violations: 0,
    }));
    this.bind();
  }

  snapshot(): unknown {
    const excluded = new Set(['mission', 'skill', 'bus', 'currentPlayer']);
    return structuredClone(
      Object.fromEntries(Object.entries(this).filter(([key]) => !excluded.has(key))),
    );
  }

  restore(data: unknown): void {
    Object.assign(this, structuredClone(data as Record<string, unknown>));
    this.finished = null;
    this.lossReason = null;
    this.lossCause = null;
    // Saves written before the integer-key switch still carry "x,y" strings.
    const width = this.mission.map.grid[0]?.length ?? 0;
    this.visited = new Set(
      [...(this.visited as Set<unknown>)].map((k) => {
        if (typeof k !== 'string') return k as number;
        const [tx, ty] = k.split(',').map(Number);
        return ty * width + tx;
      }),
    );
  }

  private log(text: string, points: number, objectives: string[] = [], tag?: string): void {
    this.score += points;
    this.scoreLog.push({ text, points, good: points >= 0, objectives, ...(tag ? { tag } : {}) });
    this.bus.emit('message', {
      text: `${text} ${points >= 0 ? '+' : ''}${points}`,
      kind: points >= 0 ? 'good' : 'bad',
    });
  }

  private record(e: Entity, source: EvidenceEntry['source'], label: string, detail: string): void {
    const id = `${e.def.id}:${source}`;
    let entry = this.evidence.find((candidate) => candidate.id === id);
    if (!entry) {
      const fw = source === 'inspect' ? deriveFrameworkTags(e.def) : { attack: [], irPhase: undefined };
      entry = {
        id,
        entityId: e.def.id,
        label,
        detail,
        source,
        category: e.def.inspect?.category,
        attack: fw.attack.length ? fw.attack : undefined,
        irPhase: fw.irPhase,
      };
      if (source === 'inspect' && requiredCall(e.def)) {
        entry.call = { options: callOptions(), picked: -1, resolved: false };
      }
      this.evidence.push(entry);
    }
    this.bus.emit('evidence', entry);
  }

  private falsePositive(e: Entity, points: number, source: 'scan' | 'flag' | 'patch'): void {
    const key = `${e.def.id}:${source}`;
    if (this.falsePositiveSources.has(key)) return;
    this.falsePositiveSources.add(key);
    const label = e.def.inspect?.label ?? e.def.id;
    this.log(`False positive: ${label} was clean`, points, ['2.4'], 'false-positive');
  }

  private message(text: string, kind: 'info' | 'warn' | 'good' | 'bad' = 'info'): void {
    this.bus.emit('message', { text, kind });
  }

  private obj(id: string): ObjectiveStatus | undefined {
    return this.objectives.find((o) => o.def.id === id);
  }

  private firstUnmet(requires: string[] | undefined): ObjectiveStatus | undefined {
    return requires?.map((id) => this.obj(id)).find((o) => o && !o.done);
  }

  private countEntity(objective: ObjectiveStatus, entityId: string): void {
    let ids = this.counted.get(objective.def.id);
    if (!ids) {
      ids = new Set<string>();
      this.counted.set(objective.def.id, ids);
    }
    if (ids.has(entityId)) return;
    ids.add(entityId);
    objective.progress++;
    if (objective.progress >= objective.target && !objective.done) {
      objective.done = true;
      this.bus.emit('objective-done', { id: objective.def.id });
    }
  }

  private rejectUninspectedClean(e: Entity): boolean {
    if (!this.objectivesFor('clean', e).some((objective) => objective.def.requiresInspect) ||
        this.inspected.has(e.def.id)) return false;
    e.alive = true;
    e.infected = true;
    e.hp = this.initialHp.get(e.def.id) ?? e.hp;
    e.state.cleaned = false;
    this.message(`Not cleaned: inspect ${e.def.inspect?.label ?? e.def.id} first. Analysis before action.`, 'warn');
    return true;
  }

  private objectivesFor(kind: MissionObjective['kind'], e: Entity): ObjectiveStatus[] {
    return this.objectives.filter(
      (o) =>
        o.def.kind === kind &&
        !!o.def.tag &&
        // 'kill' objectives also match a boss's sprite name — spawn-wave
        // bosses (ep1-boss, prime) carry no authored tag.
        (e.def.tags?.includes(o.def.tag) ||
          (kind === 'kill' && e.def.sprite === o.def.tag)),
    );
  }

  private applyRoleGrant(e: Entity): void {
    const resource = e.def.grants?.resource;
    if (!resource?.startsWith('role:') || this.grantApplied.has(e.def.id)) return;
    this.grantApplied.add(e.def.id);
    this.grantRole(resource.slice('role:'.length));
  }

  grantRole(role: string): void {
    if (this.roles.includes(role)) return;
    this.roles.push(role);
    this.message(`Access granted: ${role.toUpperCase()}`, 'good');
  }

  pickupAmount(n: number): number {
    return Math.max(1, Math.round(n * this.skill.pickup));
  }

  revokeRole(role: string): void {
    const index = this.roles.indexOf(role);
    if (index < 0) return;
    this.roles.splice(index, 1);
    this.message(`Access revoked: ${role.toUpperCase()}`, 'warn');
  }

  private requiredObjectives(): ObjectiveStatus[] {
    return this.objectives.filter((o) => o.def.kind !== 'avoid' && o.def.kind !== 'doors');
  }

  private rejectRequirements(objective: ObjectiveStatus | undefined, e?: Entity): boolean {
    const unmet = this.firstUnmet(objective?.def.requires);
    if (!unmet) return false;
    const earlyViolation = objective?.def.earlyViolates && this.obj(objective.def.earlyViolates);
    if (earlyViolation) {
      const key = e?.def.id ?? objective!.def.id;
      const warnedAt = this.earlyWarnAt.get(key);
      if (warnedAt !== undefined && this.elapsed - warnedAt <= 4) {
        this.earlyWarnAt.delete(key);
        this.violate(earlyViolation);
        return true;
      }
      this.earlyWarnAt.set(key, this.elapsed);
      this.message(
        `CHANGE NOT APPROVED — missing: ${unmet.def.text}. Press E again within 4 s to deploy anyway (logged as an unauthorized change.)`,
        'warn',
      );
      return true;
    }
    this.message(`First: ${unmet.def.text}`, 'warn');
    return true;
  }

  /** Rough compass bearing from the player to a point, for refusal text. */
  private bearingTo(x: number, y: number): string {
    const p = this.currentPlayer;
    if (!p) return 'nearby';
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) < 1.5) return 'right here';
    const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    return `to the ${dirs[i]}`;
  }

  private guardUninspectedTriage(e: Entity): boolean {
    if (!e.def.tags?.includes('triage') || this.inspected.has(e.def.id)) return false;
    this.message(
      `Read the evidence first: inspect ${e.def.inspect?.label ?? e.def.id} with MOUSE [2] before deciding.`,
      'warn',
    );
    return true;
  }

  /**
   * Field actions (clean / release / patch) on a call-bearing entity count
   * only after the player made the required "WHAT DO YOU DO?" call on its
   * case file. Reverts clean state the same way rejectUninspectedClean does.
   */
  private rejectUncalled(e: Entity): boolean {
    if (!requiredCall(e.def) || this.callsResolved.has(e.def.id)) return false;
    e.alive = true;
    e.infected = this.initialInfected.get(e.def.id) ?? e.infected;
    e.hp = this.initialHp.get(e.def.id) ?? e.hp;
    e.state.cleaned = false;
    e.state.patched = false;
    this.message(
      `Not acted on: ${e.def.inspect?.label ?? e.def.id} still needs a call. Open the case file (L) and choose WHAT DO YOU DO?`,
      'warn',
    );
    return true;
  }

  /** Each entity may contribute at most one wrong-call strike. */
  private wrongCallOnce(e: Entity, points: number): void {
    if (this.wrongCallStrikes.has(e.def.id)) {
      this.message(`Already logged as a wrong call: ${e.def.inspect?.label ?? e.def.id}.`, 'warn');
      return;
    }
    this.wrongCallStrikes.add(e.def.id);
    this.violateObjective('wrong-call', points);
  }

  private rejectOutOfOrderInteract(e: Entity, matching: ObjectiveStatus[]): boolean {
    for (const objective of matching) {
      if (!objective.def.ordered || !objective.def.tag) continue;
      const counted = this.counted.get(objective.def.id) ?? new Set<string>();
      const lowest = this.entities.reduce((priority, candidate) => {
        if (counted.has(candidate.def.id) || !candidate.def.tags?.includes(objective.def.tag!)) return priority;
        return Math.min(priority, candidate.def.priority ?? Infinity);
      }, Infinity);
      if (e.def.priority === undefined || e.def.priority <= lowest) continue;
      if (!this.priorityMisses.has(e.def.id)) {
        this.priorityMisses.add(e.def.id);
        this.log(
          `Out of risk order: ${e.def.inspect?.label ?? e.def.id}`,
          -20,
          e.def.inspect?.objectives ?? [],
          'priority-miss',
        );
      }
      this.message('Change board: a higher-risk finding is still open. Re-read the scan.', 'warn');
      return true;
    }
    return false;
  }

  private violateObjective(id: string, points: number): void {
    const objective = this.obj(id);
    if (!objective) return;
    this.violate(objective, points);
    if (this.currentPlayer) {
      this.currentPlayer.integrity = Math.max(0, this.currentPlayer.integrity - 10);
    }
  }

  private violate(obj: ObjectiveStatus, points = -50): void {
    obj.violations++;
    const remaining = (obj.def.strikes ?? 1) - obj.violations;
    // One line per strike: the strike counter folds into the violation log
    // instead of a second ticker line.
    this.log(
      remaining > 0 && !obj.def.penaltyOnly
        ? `Violation: ${obj.def.text} — ${remaining} more and the mission is failed`
        : `Violation: ${obj.def.text}`,
      points,
      [obj.def.id],
    );
    if (obj.def.penaltyOnly) {
      obj.failed = true;
      return;
    }
    if (obj.violations >= (obj.def.strikes ?? 1)) {
      obj.failed = true;
      this.finished = 'lost';
      this.lossReason = obj.def.text;
      this.lossCause = { kind: 'objective', objectiveId: obj.def.id, text: obj.def.text, strikes: obj.def.strikes ?? 1, violations: obj.violations };
      this.scoreLog.push({
        text: `Mission failed: ${obj.def.text}`,
        points: 0,
        good: false,
        objectives: [obj.def.id],
      });
    }
  }

  private violateMatchingAvoid(e: Entity, points = -50): boolean {
    let violated = false;
    for (const objective of this.objectives) {
      if (objective.def.kind === 'avoid' && objective.def.tag && e.def.tags?.includes(objective.def.tag)) {
        this.violate(objective, points);
        violated = true;
      }
    }
    return violated;
  }

  private rejectUnconfirmedHost(e: Entity): boolean {
    if (e.def.kind !== 'workstation' || e.state.revealed) return false;
    const text = 'Scanned an unconfirmed host: inspect it (MOUSE) before removing anything';
    e.alive = true;
    e.state.cleaned = false;
    e.hp = this.initialHp.get(e.def.id) ?? e.hp;
    e.infected = true;
    if (this.rejectedUnconfirmedHosts.has(e.def.id)) {
      this.message(text, 'warn');
    } else {
      this.rejectedUnconfirmedHosts.add(e.def.id);
      this.log(text, -10, e.def.inspect?.objectives ?? []);
    }
    return true;
  }

  private bind(): void {
    this.bus.on('inspect', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e) return;
      e.state.revealed = true;
      if (e.def.egg) this.revealEgg(e.def.egg);
      if (!e.def.inspect) return;
      const info = e.def.inspect;
      this.message(`CASE FILE: ${info.label.slice(0, 29)}`);
      this.record(e, 'inspect', info.label, info.detail);
      this.inspected.add(entityId);
      // countEntity dedups via `counted`, so re-reading a console once its
      // objective is active still earns credit — an early read used to be
      // deduped forever and soft-lock inspect objectives (M12 rule consoles).
      for (const objective of this.objectivesFor('inspect', e)) {
        if (!this.rejectRequirements(objective, e)) this.countEntity(objective, entityId);
      }
    });

    this.bus.on('triage', ({ entityId, correct }) => {
      const e = this.byId(entityId);
      if (!e?.def.inspect || this.triageScored.has(entityId)) return;
      this.triageScored.add(entityId);
      if (correct) {
        this.log(`Correct triage: ${e.def.inspect.label}`, 10, e.def.inspect.objectives ?? []);
      } else {
        this.falsePositive(e, -10, 'flag');
      }
    });

    this.bus.on('call-pick', ({ entityId, action }) => {
      const e = this.byId(entityId);
      const need = e ? requiredCall(e.def) : undefined;
      const entry = this.evidence.find((candidate) => candidate.id === `${entityId}:inspect`);
      if (!e || !need || !entry?.call || entry.call.resolved) return;
      const picked = entry.call.options.findIndex((option) => option.action === action);
      if (picked < 0) return;
      const right = action === need;
      const attempt = (this.callAttempts.get(entityId) ?? 0) + 1;
      this.callAttempts.set(entityId, attempt);
      entry.call.picked = picked;
      entry.call.resolved = right;
      entry.call.feedback = callFeedback(e.def, action, right);
      this.bus.emit('evidence', entry);
      if (right) {
        this.callsResolved.add(entityId);
        if (attempt === 1) {
          this.firstCallRight++;
          this.log(`Triage call on ${e.def.inspect?.label ?? entityId}: correct`, 10,
            e.def.inspect?.objectives ?? []);
        } else {
          this.log(`Triage call on ${e.def.inspect?.label ?? entityId}: correct on attempt ${attempt} (first-call points missed)`, 0,
            e.def.inspect?.objectives ?? []);
        }
      } else {
        this.wrongCallOnce(e, -25);
      }
    });

    this.bus.on('scan-miss', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e || this.initialInfected.get(entityId)) return;
      if (e.def.tags?.includes('triage')) {
        if (this.guardUninspectedTriage(e)) return;
        this.wrongCallOnce(e, -25);
        return;
      }
      this.falsePositive(e, -25, 'scan');
    });

    this.bus.on('cleaned', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e || !e.alive || !e.infected) return;
      if (this.rejectUnconfirmedHost(e) || this.rejectUninspectedClean(e) || this.rejectUncalled(e)) return;
      e.infected = false;
      e.alive = false;
      e.state.cleaned = true;
      this.cleaned.add(entityId);
      const boss = ENEMY_PROFILES[e.def.threat ?? e.def.sprite]?.boss === true;
      this.log(
        boss ? `PURGED: ${e.def.inspect?.label ?? e.def.id}` : `Cleaned ${e.def.inspect?.label ?? 'host'}`,
        boss ? 150 : 25,
        e.def.cleanObjectives ?? e.def.inspect?.objectives ?? [],
      );
      if (boss) this.message('THREAT PURGED — arena control restored', 'good');
      for (const objective of this.objectivesFor('clean', e)) this.countEntity(objective, entityId);
      for (const objective of this.objectivesFor('kill', e)) this.countEntity(objective, entityId);
      this.checkWin();
    });

    this.bus.on('interact', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e || !e.alive) return;
      if (this.hasToken) refuseMfaPrompt({ bus: this.bus }, e);
      if (e.def.egg) this.revealEgg(e.def.egg);

      // ENEMIES-owned (ransomware seal): an encrypted console is unusable until
      // the ransomware that sealed it is killed (ai.ts clears state.sealedBy).
      // Name the missing step — which process and where — so a sealed
      // progression console never reads as a dead end.
      if (e.state.sealedBy) {
        const sealer = this.byId(e.state.sealedBy as string);
        this.bus.emit('message', {
          text: `ENCRYPTED: ${e.def.inspect?.label ?? 'this system'} is sealed by a ransomware process${sealer?.alive ? ` ${this.bearingTo(sealer.x, sealer.y)}` : ''} — kill it to release the lock.`,
          kind: 'warn',
        });
        return;
      }

      // E/Space interacts or inspects — it never performs a scored tool
      // action. On an uninspected workstation the press reads the host's
      // indicators (the same 'inspect' a MOUSE click performs); the removal
      // path that follows a blind act stays behind LMB only, so an interact
      // can never produce the "scanned an unconfirmed host" penalty.
      if (e.def.kind === 'workstation' && !e.def.tags?.includes('triage') && !e.def.accepts && !e.state.revealed) {
        this.bus.emit('inspect', { entityId: e.def.id });
        return;
      }

      if (e.def.kind === 'workstation' && e.def.tags?.includes('triage')) {
        if (this.guardUninspectedTriage(e)) return;
        if (e.infected) {
          this.wrongCallOnce(e, -30);
          return;
        }
        if (this.rejectUncalled(e)) return;
        const matching = this.objectivesFor('interact', e);
        if (matching.some((objective) => this.rejectRequirements(objective, e))) return;
        for (const objective of matching) this.countEntity(objective, e.def.id);
        this.checkWin();
        return;
      }

      if (e.def.accepts) {
        const item = this.entities.find(
          (candidate) =>
            this.inventory.has(candidate.def.id) &&
            candidate.def.tags?.includes(e.def.accepts!),
        );
        if (!item) {
          this.message(e.def.log ?? 'Nothing to hand over.', 'info');
          return;
        }
        const matching = this.objectivesFor('interact', e);
        if (matching.some((objective) => this.rejectRequirements(objective, e))) return;
        this.inventory.delete(item.def.id);
        if (this.violateMatchingAvoid(e)) {
          this.bus.emit('plugged-usb', { entityId: item.def.id });
          return;
        }
        this.log(`Turned in: ${item.def.inspect?.label ?? item.def.id}`, 50,
          e.def.inspect?.objectives ?? []);
        for (const objective of matching) this.countEntity(objective, e.def.id);
        if (e.def.group) {
          for (const sibling of this.entities) {
            if (sibling !== e && sibling.def.group === e.def.group) sibling.alive = false;
          }
        }
        this.applyRoleGrant(e);
        this.checkWin();
        return;
      }

      if (e.def.reportable) {
        if (!this.corroborated(e)) {
          this.message(this.corroborationRefusal(e), 'info');
          return;
        }
        this.pendingAccusation = e;
        const hasConsole = this.entities.some(
          (x) => x.alive && x.def.kind === 'console' && x.def.tags?.includes('report-console'),
        );
        if (hasConsole) {
          this.message(
            `Suspect marked: ${e.def.inspect?.label ?? e.def.id}. File the report at the console.`,
            'warn',
          );
        } else {
          this.resolveAccusation(e);
        }
        return;
      }

      if (e.def.kind === 'console') {
        const matching = this.objectivesFor('interact', e);
        if (e.def.tags?.includes('wrong')) {
          const text = e.def.log ?? e.def.inspect?.detail ?? '';
          const label = e.def.inspect?.label ?? e.def.id;
          this.record(e, 'log', label, text);
          if (text.trim()) this.message(`READ: ${label}`, 'info');
          if (!this.wrongChoicesScored.has(e.def.id)) {
            this.wrongChoicesScored.add(e.def.id);
            this.log(`Wrong call: ${label} — read why in the case file (L)`, -15, e.def.inspect?.objectives ?? [], 'bad-choice');
          } else {
            this.message(`Already logged as a wrong call: ${label}.`, 'warn');
          }
          return;
        }
        if (this.pendingAccusation && e.def.tags?.includes('report-console')) {
          const report = this.objectives.find((o) => o.def.kind === 'report');
          if (this.rejectRequirements(report, e)) return;
          if (matching.some((objective) => this.rejectRequirements(objective, e))) return;
          this.resolveAccusation(this.pendingAccusation);
          for (const objective of matching) this.countEntity(objective, e.def.id);
          this.checkWin();
          return;
        }
        if (matching.some((objective) => this.rejectRequirements(objective, e))) return;
        if (this.rejectOutOfOrderInteract(e, matching)) return;
        if (e.def.tags?.includes('pay-ransom')) {
          this.violateMatchingAvoid(e, -250);
          this.message(
            'PAID 14 BTC. The decryptor is slow and corrupts files, and the attacker is still inside. Legal, the insurer and law enforcement now have to be told.',
            'bad',
          );
          return;
        }
        if (this.violateMatchingAvoid(e)) return;
        const text = e.def.log ?? e.def.inspect?.detail ?? '';
        const label = e.def.inspect?.label ?? e.def.id;
        if (text.trim()) {
          this.message(`READ: ${label}`, 'info');
          this.record(e, 'log', label, text);
        }
        // A console feeding an 'inspect' objective counts as reviewed on an
        // E read too (M12 rule-evidence): E and MOUSE earn the same credit.
        if (e.def.inspect?.detail && this.objectivesFor('inspect', e).length) {
          this.bus.emit('inspect', { entityId: e.def.id });
        }
        // Consoles an inspect objective asks the player to read are legit
        // targets — the decoy trap is for consoles nobody should deploy to.
        if (e.def.tags?.includes('decoy') && !this.objectivesFor('inspect', e).length) {
          this.falsePositive(e, -25, 'patch');
          return;
        }
        for (const objective of matching) this.countEntity(objective, e.def.id);
        if (matching.length > 0 && e.def.group) {
          for (const sibling of this.entities) {
            if (sibling !== e && sibling.def.group === e.def.group) sibling.alive = false;
          }
        }
        this.applyRoleGrant(e);
        this.checkWin();
        return;
      }

      if (e.def.kind === 'workstation' && e.infected) {
        if (this.rejectUnconfirmedHost(e) || this.rejectUninspectedClean(e) || this.rejectUncalled(e)) return;
        this.log('Manual patch applied — faster with the scanner', 5,
          e.def.cleanObjectives ?? e.def.inspect?.objectives ?? []);
        e.infected = false;
        e.alive = false;
        e.state.cleaned = true;
        this.cleaned.add(e.def.id);
        for (const objective of this.objectivesFor('clean', e)) this.countEntity(objective, e.def.id);
        this.checkWin();
      }
    });

    this.bus.on('report', ({ entityId }) => {
      const e = this.byId(entityId);
      if (e) this.resolveAccusation(e);
    });

    this.bus.on('tool-hit', ({ toolId, entityId, good }) => {
      if (toolId !== 'patch' || !good || !entityId) return;
      const e = this.byId(entityId);
      if (!e) return;
      if (this.rejectUncalled(e)) return;
      for (const objective of this.objectivesFor('patch', e)) this.countEntity(objective, entityId);
      this.checkWin();
    });

    this.bus.on('badge-door', ({ doorId, accessRole, allowed }) => {
      if (allowed) {
        if (accessRole !== undefined && !this.doorAccessScored.has(doorId)) {
          this.doorAccessScored.add(doorId);
          this.log('Authorized badge access', 10, ['4.6']);
        }
      } else {
        this.log(
          `Least-privilege violation: role lacks ${accessRole ?? 'access'}`,
          -30,
          ['4.6', '1.2'],
        );
        for (const objective of this.objectives) {
          if (objective.def.kind === 'doors') objective.failed = true;
        }
      }
    });

    this.bus.on('pickup', ({ entityId }) => {
      const e = this.byId(entityId);
      if (e) this.applyRoleGrant(e);
    });

    this.bus.on('reach-exit', ({ secretTo }) => {
      const exit = this.objectives.find((o) => o.def.kind === 'reach-exit');
      if (!exit) return;
      const unfinished = this.requiredObjectives().find(
        (objective) => objective !== exit && !objective.done,
      );
      if (unfinished) {
        if (this.elapsed - this.lastExitMessage >= 1) {
          this.lastExitMessage = this.elapsed;
          this.message(`Exit locked: ${unfinished.def.text}`, 'warn');
        }
        return;
      }
      // EGGS: a secret-exit pad routes onward to a bonus mission, like E1M9.
      if (secretTo) {
        this.nextMission = secretTo;
        this.scoreLog.push({
          text: `SECRET ROUTE — ${secretTo.toUpperCase()} unlocked`,
          points: 0,
          good: true,
          objectives: [],
        });
      }
      exit.done = true;
      exit.progress = exit.target;
      this.checkWin();
    });

    this.bus.on('player-down', ({ by, threat }) => {
      this.finished = 'lost';
      this.lossCause ??= { kind: 'integrity', by, threat };
      this.lossReason ??= by ? `Integrity depleted by ${by}` : 'Player integrity depleted';
    });
  }

  /**
   * Corroboration gate for marking/filing a suspect: the suspect must have
   * been inspected, and the case file must hold at least `evidenceRequired`
   * (default 2) entries implicating them — their own inspection counts as
   * one, and each recorded entry from an entity naming them via `implicates`
   * counts as one more.
   */
  private corroborated(e: Entity): boolean {
    return this.inspected.has(e.def.id) && this.corroborationCount(e) >= (e.def.evidenceRequired ?? 2);
  }

  /**
   * Distinct corroborating sources recorded so far: the suspect's own
   * inspection plus each evidence-source entity naming them. A source's
   * inspect and log entries count once — a case is built from separate
   * sources, not from reading the same record twice.
   */
  private corroborationCount(e: Entity): number {
    const sources = new Set<string>();
    for (const entry of this.evidence) {
      if (entry.entityId === e.def.id && entry.source === 'inspect') sources.add(e.def.id);
      else if (this.byId(entry.entityId)?.def.implicates?.includes(e.def.id)) sources.add(entry.entityId);
    }
    return sources.size;
  }

  /**
   * Refusal message built ONLY from evidence the player already holds: the
   * count of corroborating sources collected, their labels, and a generic
   * nudge. It never names an unread source and never varies by whether
   * anything actually implicates the suspect — the answer stays sealed.
   */
  private corroborationRefusal(e: Entity): string {
    const need = e.def.evidenceRequired ?? 2;
    const haveLabels: string[] = [];
    if (this.inspected.has(e.def.id)) haveLabels.push('their own file');
    const seen = new Set<string>();
    for (const entry of this.evidence) {
      if (entry.entityId === e.def.id) continue;
      if (seen.has(entry.entityId)) continue;
      if (!this.byId(entry.entityId)?.def.implicates?.includes(e.def.id)) continue;
      seen.add(entry.entityId);
      haveLabels.push(entry.label);
    }
    const label = (e.def.inspect?.label ?? e.def.id).toUpperCase();
    const parts = [`CASE ON ${label}: ${haveLabels.length}/${need} SOURCES`];
    if (haveLabels.length) parts.push(`HAVE: ${haveLabels.map((s) => s.toUpperCase()).join(' + ')}`);
    if (!this.inspected.has(e.def.id)) parts.push('INSPECT THEM FIRST');
    parts.push('find more corroborating logs or records that name them');
    return `${parts.join(' — ')}.`;
  }

  private resolveAccusation(e: Entity): void {
    const report = this.objectives.find((o) => o.def.kind === 'report');
    if (this.rejectRequirements(report, e)) return;
    if (!this.corroborated(e)) {
      this.message(this.corroborationRefusal(e), 'info');
      return;
    }
    if (e.def.culprit) {
      this.log('Correct! The insider is contained', 100, e.def.inspect?.objectives ?? []);
      for (const objective of this.objectives) {
        if (objective.def.kind === 'report' ||
            objective.def.id === 'report-insider' ||
            objective.def.id === 'report-admin') {
          objective.done = true;
          objective.progress = objective.target;
        }
      }
      e.alive = false;
      this.pendingAccusation = null;
    } else {
      this.pendingAccusation = null;
      let falseAccusationObjective = false;
      for (const objective of this.objectives) {
        if (objective.def.kind === 'avoid' && objective.def.tag === 'false-accuse') {
          falseAccusationObjective = true;
          this.violate(objective, -60);
        }
      }
      if (!falseAccusationObjective) {
        this.log(`False accusation — ${e.def.inspect?.label ?? 'innocent'} harmed`, -60, ['2.4']);
      }
    }
    this.checkWin();
  }

  byId(id: string): Entity | undefined {
    return this.entities.find((e) => e.def.id === id);
  }

  wasInspected(id: string): boolean {
    return this.inspected.has(id);
  }

  /** The call this entity's case file requires (for tools, tests, walkthroughs). */
  callRequiredFor(id: string): CallAction | undefined {
    const e = this.byId(id);
    return e ? requiredCall(e.def) : undefined;
  }

  /** True while an entity's required triage call has not been made yet. */
  callPending(id: string): boolean {
    return this.callRequiredFor(id) !== undefined && !this.callsResolved.has(id);
  }

  /**
   * What E would do on this entity, mirroring the interact handler's branch
   * order without performing it. No verdicts: a 'wrong'/'decoy' console reads
   * the same as any console and no hidden state is revealed.
   */
  interactHint(e: Entity): string | null {
    if (!e.alive) return null;

    if (e.def.kind === 'workstation' && e.def.tags?.includes('triage')) {
      if (!this.inspected.has(e.def.id)) return `INSPECT FIRST (MOUSE ${mouseTool.slot})`;
      if (this.callPending(e.def.id)) return 'MAKE THE CALL (CASE FILE L)';
      return 'FILE TRIAGE CALL';
    }

    if (e.def.accepts) {
      const item = this.entities.find(
        (candidate) =>
          this.inventory.has(candidate.def.id) &&
          candidate.def.tags?.includes(e.def.accepts!),
      );
      if (item) return 'HAND OVER ITEM';
      // Name what the console wants and whether it's still out in the level,
      // so "NOTHING TO HAND OVER" becomes a pointer instead of a dead end.
      const wanted = this.entities.find(
        (candidate) => candidate.alive && candidate.def.tags?.includes(e.def.accepts!),
      );
      const label = wanted?.def.inspect?.label ?? wanted?.def.id;
      return label ? `BRING THE ${label.toUpperCase()}` : 'NOTHING TO HAND OVER';
    }

    if (e.def.reportable) return 'MARK AS SUSPECT';

    if (e.def.kind === 'console') {
      if (this.pendingAccusation && e.def.tags?.includes('report-console')) return 'FILE REPORT';
      return 'USE CONSOLE';
    }

    if (e.def.kind === 'workstation') {
      // infected is only visible once the renderer reveals the infected sprite
      if (!e.state.revealed) return 'INSPECT HOST';
      if (e.infected) return this.callPending(e.def.id) ? 'MAKE THE CALL (CASE FILE L)' : 'MANUAL CLEANUP';
      return null;
    }

    return null;
  }

  update(dt: number, w: UpdateWorld): void {
    this.currentPlayer = w.player;
    this.hasToken = !!w.hasToken;
    if (!this.finished) this.elapsed += dt;
    this.updateVisited(dt, w);

    if (w.use) {
      const hit = w.map.raycast(w.player.x, w.player.y, w.player.angle, 1.6);
      if (hit.cell?.kind === 'door' && !w.map.isDoorOpen(hit.cell.doorId ?? '')) {
        const door = hit.cell;
        const doorId = door.doorId ?? '';
        if (door.locked) {
          this.message(door.lockText ?? 'Locked.', 'warn');
        } else if (door.accessRole !== undefined) {
          if (!this.roles.includes(door.accessRole)) {
            const warnedAt = this.warnedOutOfRoleDoorAt.get(doorId);
            if (warnedAt !== undefined && this.elapsed - warnedAt <= 3) {
              this.warnedOutOfRoleDoorAt.delete(doorId);
              w.flashTool?.('badge');
              swipeBadge(
                { bus: this.bus, entities: this.entities, authorizedRoles: this.roles },
                { doorId, accessRole: door.accessRole, mfa: door.mfa },
              );
            } else {
              this.warnedOutOfRoleDoorAt.set(doorId, this.elapsed);
              const roles = this.roles.map((r) => r.toUpperCase()).join(', ') || 'none';
              this.message(
                `Badge reader: ${door.accessRole.toUpperCase()} only. Your roles: ${roles}. Press E again to swipe anyway (logged as a violation).`,
                'info',
              );
            }
          } else if (!w.hasBadge) {
            this.message(`Badge reader: ${door.accessRole.toUpperCase()} only. You have no badge.`, 'warn');
          } else {
            w.flashTool?.('badge');
            swipeBadge(
              { bus: this.bus, entities: this.entities, authorizedRoles: this.roles },
              { doorId, accessRole: door.accessRole, mfa: door.mfa },
            );
            if (door.mfa) {
              if (w.hasToken) {
                if (completeMfa(
                  { bus: this.bus, entities: this.entities },
                  { doorId, accessRole: door.accessRole, mfa: door.mfa },
                )) w.flashTool?.('mfa');
              } else {
                this.message('This door enforces MFA and you have no enrolled token.', 'warn');
              }
            }
          }
        } else {
          w.openDoor(doorId);
        }
      }
    }

    for (const e of this.entities) {
      if (!e.alive || !e.def.carry) continue;
      if (Math.hypot(e.x - w.player.x, e.y - w.player.y) <= 0.6) {
        e.alive = false;
        this.inventory.add(e.def.id);
        this.message(`Picked up: ${e.def.inspect?.label ?? e.def.id}`, 'info');
      }
    }

    this.updateTriggers(w);
    this.updateSecrets(w);
    this.updateOutbreak(dt);
    this.updateRadio();
  }

  private updateVisited(dt: number, w: UpdateWorld): void {
    this.visitElapsed += dt;
    if (this.visitElapsed < 0.1) return;
    this.visitElapsed %= 0.1;
    for (let i = 0; i < 32; i++) {
      const angle = w.player.angle + (i * Math.PI * 2) / 32;
      const hit = w.map.raycast(w.player.x, w.player.y, angle, 12);
      const distance = hit.cell ? Math.min(hit.dist, 12) : 12;
      for (let d = 0; d <= distance; d += 0.2) {
        const tx = Math.floor(w.player.x + Math.cos(angle) * d);
        const ty = Math.floor(w.player.y + Math.sin(angle) * d);
        if (tx < 0 || ty < 0 || tx >= w.map.w || ty >= w.map.h) break;
        this.visited.add(ty * w.map.w + tx);
      }
      if (hit.tx >= 0 && hit.ty >= 0) this.visited.add(hit.ty * w.map.w + hit.tx);
    }
  }

  /** Debug/QA: mark every map tile visited so the automap shows the full level. */
  revealAll(): void {
    for (let y = 0; y < this.mission.map.grid.length; y++) {
      for (let x = 0; x < this.mission.map.grid[y].length; x++) {
        this.visited.add(y * this.mission.map.grid[y].length + x);
      }
    }
  }

  /** EGGS (WIRESHARK): reveal every hidden door on the automap too. */
  revealAllSecretDoors(): void {
    for (let y = 0; y < this.mission.map.grid.length; y++) {
      for (let x = 0; x < this.mission.map.grid[y].length; x++) {
        const cell = this.mission.map.legend[this.mission.map.grid[y][x]];
        if (cell?.secret && cell.doorId) this.revealedSecretDoors.add(cell.doorId);
      }
    }
  }

  /** EGGS: reveal a declared egg (entity-flagged discovery) once. */
  revealEgg(id: string): void {
    const egg = this.mission.script?.eggs?.find((e) => e.id === id);
    if (!egg || this.revealedSecrets.has(id)) return;
    this.revealedSecrets.add(id);
    this.message(`A secret is revealed! ${egg.label}`, 'good');
    this.log(`Secret revealed: ${egg.label}`, 25);
  }

  /** EGGS (debug): ids of every revealed secret/egg so far. */
  revealedSecretIds(): string[] {
    return [...this.revealedSecrets];
  }

  /** EGGS: a cheat fired — the run completes but the debrief says UNSCORED. */
  markUnscored(reason: string): void {
    this.message(`CHEAT ACTIVE — this run is UNSCORED`, 'warn');
    if (this.unscored) return;
    this.unscored = true;
    this.scoreLog.push({
      text: `CHEAT ACTIVE: ${reason} — run unscored`,
      points: 0,
      good: false,
      objectives: [],
    });
  }

  private updateTriggers(w: UpdateWorld): void {
    for (const trigger of this.mission.script?.triggers ?? []) {
      if (this.firedTriggers.has(trigger.id)) continue;
      const tx = Math.floor(w.player.x);
      const ty = Math.floor(w.player.y);
      const area = trigger.area;
      const inside = !area || (tx >= area[0] && tx <= area[2] && ty >= area[1] && ty <= area[3]);
      if (!inside || trigger.after?.some((id) => !this.obj(id)?.done)) continue;
      if (trigger.unless?.some((id) => this.obj(id)?.done)) {
        this.firedTriggers.add(trigger.id);
        continue;
      }
      this.firedTriggers.add(trigger.id);
      if (trigger.message) this.message(trigger.message, trigger.kind ?? 'info');
      for (const id of trigger.spawn ?? []) {
        const e = this.byId(id);
        if (e && e.def.dormant) {
          this.moveOffPlayer(e, w);
          e.alive = true;
          e.state.spawnGrace = 0.75;
          this.bus.emit('ambush-spawn', { entityId: id });
        }
      }
      for (const doorId of trigger.openDoors ?? []) w.openDoor(doorId);
      for (const role of trigger.grantRoles ?? []) this.grantRole(role);
      for (const role of trigger.revokeRoles ?? []) this.revokeRole(role);
    }
  }

  /** Ambushes authored near an exit pad can land at the player's feet — nudge
   *  a spawn inside ~1.8 tiles to the closest open cell that gives breathing
   *  room. */
  private moveOffPlayer(e: Entity, w: UpdateWorld): void {
    if (Math.hypot(e.x - w.player.x, e.y - w.player.y) >= 1.8) return;
    let best: { x: number; y: number; score: number } | null = null;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const cx = Math.floor(e.x) + dx + 0.5;
        const cy = Math.floor(e.y) + dy + 0.5;
        if (w.map.blockedF(cx, cy)) continue;
        if (Math.hypot(cx - w.player.x, cy - w.player.y) < 1.8) continue;
        if (this.entities.some((o) => o.alive && o !== e && Math.hypot(o.x - cx, o.y - cy) < 1.0)) continue;
        const score = Math.hypot(cx - e.x, cy - e.y);
        if (!best || score < best.score) best = { x: cx, y: cy, score };
      }
    }
    if (best) {
      e.x = best.x;
      e.y = best.y;
    }
  }

  private updateSecrets(w: UpdateWorld): void {
    const tx = Math.floor(w.player.x);
    const ty = Math.floor(w.player.y);
    for (const secret of this.mission.script?.secrets ?? []) {
      if (this.revealedSecrets.has(secret.id)) continue;
      const a = secret.area;
      if (tx < a[0] || tx > a[2] || ty < a[1] || ty > a[3]) continue;
      this.revealedSecrets.add(secret.id);
      this.revealNearestSecretDoor(secret.area);
      this.message(`A secret is revealed! ${secret.label}`, 'good');
      this.log(`Secret revealed: ${secret.label}`, 25);
      // Every secret pays off: award its named grant like a pickup would.
      const grant = secret.grant;
      if (grant) {
        if (grant.resource.startsWith('role:')) this.grantRole(grant.resource.slice(5));
        else this.bus.emit('grant-item', { resource: grant.resource, amount: grant.amount });
      }
    }
  }

  private revealNearestSecretDoor(area: [number, number, number, number]): void {
    let nearest: { id: string; distance: number } | null = null;
    for (let y = 0; y < this.mission.map.grid.length; y++) {
      const row = this.mission.map.grid[y];
      for (let x = 0; x < row.length; x++) {
        const cell = this.mission.map.legend[row[x]];
        if (cell?.kind !== 'door' || !cell.secret || !cell.doorId) continue;
        if (this.revealedSecretDoors.has(cell.doorId)) continue;
        const dx = Math.max(area[0] - x, 0, x - area[2]);
        const dy = Math.max(area[1] - y, 0, y - area[3]);
        const distance = dx + dy;
        if (!nearest || distance < nearest.distance) nearest = { id: cell.doorId, distance };
      }
    }
    if (nearest) this.revealedSecretDoors.add(nearest.id);
  }

  isSecretDoorRevealed(doorId: string): boolean {
    return this.revealedSecretDoors.has(doorId);
  }

  private updateOutbreak(dt: number): void {
    const outbreak = this.mission.script?.outbreak;
    if (!outbreak || this.obj(outbreak.until)?.done) return;
    this.outbreakElapsed += dt;
    if (this.outbreakElapsed < outbreak.every) return;
    this.outbreakElapsed -= outbreak.every;
    const candidates = this.entities.filter(
      (candidate) => this.cleaned.has(candidate.def.id) &&
        candidate.def.tags?.includes(outbreak.tag),
    );
    if (!candidates.length) return;
    // Round-robin the outbreak so the worm hops host to host like lateral
    // movement instead of hammering the same machine every tick.
    const e = candidates[this.outbreakTicks % candidates.length];
    this.outbreakTicks += 1;
    e.alive = true;
    e.infected = this.initialInfected.get(e.def.id) ?? true;
    e.hp = this.initialHp.get(e.def.id) ?? 1;
    e.state.cleaned = false;
    this.cleaned.delete(e.def.id);
    for (const objective of this.objectivesFor('clean', e)) {
      objective.progress = Math.max(0, objective.progress - 1);
      objective.done = false;
      this.counted.get(objective.def.id)?.delete(e.def.id);
    }
    this.message(outbreak.message, 'bad');
  }

  private updateRadio(): void {
    const lines = RADIO_LINES[this.mission.id];
    if (!lines) return;
    if (!this.radioSent.has('start') && this.elapsed >= 4) {
      this.radioSent.add('start');
      this.message(formatRadioLine(lines.start), 'info');
      return;
    }
    const core = this.objectives.filter(
      (o) => o.def.kind !== 'avoid' && o.def.kind !== 'reach-exit',
    );
    if (!core.length) return;
    const doneCount = core.filter((o) => o.done).length;
    if (!this.radioSent.has('midpoint') && doneCount >= 1 && doneCount < core.length) {
      this.radioSent.add('midpoint');
      this.message(formatRadioLine(lines.midpoint), 'info');
    } else if (!this.radioSent.has('ready') && doneCount === core.length) {
      this.radioSent.add('ready');
      this.message(formatRadioLine(lines.ready), 'good');
    }
  }

  private appendWinTally(): void {
    if (this.tallied) return;
    this.tallied = true;
    const stats = this.stats();
    this.scoreLog.push({
      text: `Secrets ${stats.secrets}/${stats.secretsTotal}`,
      points: 0,
      good: true,
      objectives: [],
    });
    const threatsPoints = stats.kills >= stats.killsTotal ? 50 : 0;
    this.score += threatsPoints;
    this.scoreLog.push({
      text: `Threats cleaned ${stats.kills}/${stats.killsTotal}`,
      points: threatsPoints,
      good: true,
      objectives: [],
    });
    const timePoints = stats.par > 0 && stats.time <= stats.par ? 50 : 0;
    this.score += timePoints;
    this.scoreLog.push({
      text: `Time ${formatTime(stats.time)} (par ${formatTime(stats.par)})`,
      points: timePoints,
      good: true,
      objectives: [],
    });
    if (this.callAttempts.size > 0) {
      this.scoreLog.push({
        text: `First-call accuracy: ${this.firstCallRight}/${this.callAttempts.size}`,
        points: 0,
        good: true,
        objectives: [],
      });
    }
  }

  stats(): {
    kills: number;
    killsTotal: number;
    secrets: number;
    secretsTotal: number;
    time: number;
    par: number;
  } {
    const threats = this.entities.filter(
      (e) => (e.def.kind === 'enemy' || e.def.kind === 'workstation') &&
        this.initialInfected.get(e.def.id),
    );
    return {
      kills: threats.filter((e) => this.cleaned.has(e.def.id)).length,
      killsTotal: threats.length,
      secrets: this.revealedSecrets.size,
      secretsTotal: (this.mission.script?.secrets?.length ?? 0) +
        (this.mission.script?.eggs?.length ?? 0),
      time: this.elapsed,
      par: this.mission.script?.par ?? 0,
    };
  }

  checkWin(): void {
    if (this.finished) return;
    const required = this.requiredObjectives();
    if (required.length > 0 && required.every((o) => o.done)) {
      for (const objective of this.objectives) {
        if ((objective.def.kind === 'avoid' || objective.def.kind === 'doors') && !objective.failed) {
          objective.done = true;
        }
      }
      this.finished = 'won';
      this.appendWinTally();
    }
  }

  /** Debrief text mapping objective ids to titles for display. */
  objectiveSummary(): { text: string; done: boolean; failed: boolean; progress: number; target: number; violations: number; kind: MissionObjective['kind'] }[] {
    return this.objectives.map((o) => ({
      text: o.target > 1 && !o.done ? `${o.def.text} (${Math.min(o.progress, o.target)}/${o.target})` : o.def.text,
      done: o.done,
      failed: o.failed,
      progress: o.progress,
      target: o.target,
      violations: o.violations,
      kind: o.def.kind,
    }));
  }

  hudProgress(): { done: number; total: number; failed: boolean } {
    // Count objectives, not summed progress targets, so the HUD counter
    // matches the objective list the player can see (e.g. 0/10, not 0/18).
    const required = this.requiredObjectives();
    return {
      done: required.filter((objective) => objective.progress >= objective.target).length,
      total: required.length,
      failed: this.objectives.some((objective) => objective.failed),
    };
  }

  /** Active objective text, verdict-neutral target points, and secrets count for the automap. */
  automapOverlay(): {
    objectiveText?: string;
    objectivePoints: { x: number; y: number }[];
    secrets: number;
    secretsTotal: number;
  } {
    const stats = this.stats();
    const active = this.requiredObjectives().find((o) => !o.done);
    const points: { x: number; y: number }[] = [];
    if (active) {
      if (active.def.kind === 'reach-exit') {
        const grid = this.mission.map.grid;
        for (let y = 0; y < grid.length; y++) {
          for (let x = 0; x < grid[y].length; x++) {
            if (this.mission.map.legend[grid[y][x]]?.kind === 'exit') {
              points.push({ x: x + 0.5, y: y + 0.5 });
            }
          }
        }
      } else if (active.def.kind === 'report') {
        for (const e of this.entities) {
          if (e.alive && e.def.kind === 'npc') points.push({ x: e.x, y: e.y });
        }
      } else {
        const doneIds = this.counted.get(active.def.id);
        for (const e of this.entities) {
          if (!e.alive || doneIds?.has(e.def.id)) continue;
          if (active.def.tag) {
            if (e.def.tags?.includes(active.def.tag)) points.push({ x: e.x, y: e.y });
          } else if (active.def.kind === 'clean' && e.infected) {
            points.push({ x: e.x, y: e.y });
          } else if (active.def.kind === 'patch' && e.def.kind === 'workstation' && !e.state.patched) {
            points.push({ x: e.x, y: e.y });
          }
        }
      }
    }
    const objectiveText = active
      ? (active.target > 1
          ? `${active.def.text} (${Math.min(active.progress, active.target)}/${active.target})`
          : active.def.text)
      : undefined;
    return {
      objectiveText,
      objectivePoints: points,
      secrets: stats.secrets,
      secretsTotal: stats.secretsTotal,
    };
  }

  objectiveTitle(id: string): string {
    return objectiveById(id)?.title ?? id;
  }
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
