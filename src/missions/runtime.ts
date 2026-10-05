import type { EventBus } from '../core/events';
import type {
  Entity,
  EvidenceEntry,
  Mission,
  MissionObjective,
  ScoreEvent,
} from '../core/types';
import { objectiveById } from '../content/objectives';
import type { WorldMap } from '../engine/map';

/**
 * LEVELS: mission runtime.
 * Loads a Mission, owns spawned entities, tracks objective progress and
 * scoring, decides win/lose, and records ScoreEvents for the debrief.
 */
export interface ObjectiveStatus {
  def: MissionObjective;
  done: boolean;
  failed: boolean;
  progress: number;
  target: number;
  violations: number;
}

type UpdateWorld = {
  player: { x: number; y: number; angle: number; integrity: number };
  map: WorldMap;
  use: boolean;
  openDoor: (doorId: string) => void;
};

export class MissionRuntime {
  readonly mission: Mission;
  entities: Entity[];
  objectives: ObjectiveStatus[];
  evidence: EvidenceEntry[] = [];
  scoreLog: ScoreEvent[] = [];
  score = 0;
  roles: string[];
  inventory = new Set<string>();
  elapsed = 0;
  lossReason: string | null = null;

  private pendingAccusation: Entity | null = null;
  private inspected = new Set<string>();
  private triageScored = new Set<string>();
  private falsePositiveSources = new Set<string>();
  private counted = new Map<string, Set<string>>();
  private cleaned = new Set<string>();
  private initialHp = new Map<string, number>();
  private initialInfected = new Map<string, boolean>();
  private firedTriggers = new Set<string>();
  private revealedSecrets = new Set<string>();
  private doorAccessScored = new Set<string>();
  private grantApplied = new Set<string>();
  private outbreakElapsed = 0;
  private lastExitMessage = -Infinity;
  private tallied = false;

  finished: 'won' | 'lost' | null = null;

  constructor(mission: Mission, private bus: EventBus) {
    this.mission = mission;
    this.roles = [...mission.authorizedRoles];
    this.entities = mission.entities.map((def) => {
      const hp = def.hp ?? 1;
      this.initialHp.set(def.id, hp);
      this.initialInfected.set(def.id, def.infected ?? false);
      return {
        def,
        x: def.x,
        y: def.y,
        hp,
        alive: !def.dormant,
        infected: def.infected ?? false,
        state: {},
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
      entry = {
        id,
        entityId: e.def.id,
        label,
        detail,
        source,
        category: e.def.inspect?.category,
      };
      this.evidence.push(entry);
    }
    this.bus.emit('evidence', entry);
  }

  private falsePositive(e: Entity, points: number, source: 'scan' | 'flag'): void {
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
    if (objective.progress >= objective.target) objective.done = true;
  }

  private objectivesFor(kind: MissionObjective['kind'], e: Entity): ObjectiveStatus[] {
    return this.objectives.filter(
      (o) => o.def.kind === kind && !!o.def.tag && e.def.tags?.includes(o.def.tag),
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

  revokeRole(role: string): void {
    const index = this.roles.indexOf(role);
    if (index < 0) return;
    this.roles.splice(index, 1);
    this.message(`Access revoked: ${role.toUpperCase()}`, 'warn');
  }

  private requiredObjectives(): ObjectiveStatus[] {
    return this.objectives.filter((o) => o.def.kind !== 'avoid' && o.def.kind !== 'doors');
  }

  private rejectRequirements(objective: ObjectiveStatus | undefined): boolean {
    const unmet = this.firstUnmet(objective?.def.requires);
    if (!unmet) return false;
    this.message(`First: ${unmet.def.text}`, 'warn');
    return true;
  }

  private violate(obj: ObjectiveStatus, points = -50): void {
    obj.violations++;
    this.log(`Violation: ${obj.def.text}`, points, [obj.def.id]);
    if (obj.violations >= (obj.def.strikes ?? 1)) {
      obj.failed = true;
      this.finished = 'lost';
      this.lossReason = obj.def.text;
      this.scoreLog.push({
        text: `Mission failed: ${obj.def.text}`,
        points: 0,
        good: false,
        objectives: [obj.def.id],
      });
    } else {
      this.message(
        `Warning: ${(obj.def.strikes ?? 1) - obj.violations} more and the mission is failed`,
        'warn',
      );
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

  private bind(): void {
    this.bus.on('inspect', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e?.def.inspect) return;
      const info = e.def.inspect;
      this.message(`CASE FILE: ${info.label.slice(0, 29)}`);
      this.record(e, 'inspect', info.label, info.detail);
      if (this.inspected.has(entityId)) return;
      this.inspected.add(entityId);
      for (const objective of this.objectivesFor('inspect', e)) {
        if (!this.rejectRequirements(objective)) this.countEntity(objective, entityId);
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

    this.bus.on('scan-miss', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e || this.initialInfected.get(entityId)) return;
      this.falsePositive(e, -25, 'scan');
    });

    this.bus.on('cleaned', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e || !e.alive || !e.infected) return;
      e.infected = false;
      e.alive = false;
      e.state.cleaned = true;
      this.cleaned.add(entityId);
      this.log(`Cleaned ${e.def.inspect?.label ?? 'host'}`, 25, e.def.inspect?.objectives ?? []);
      for (const objective of this.objectivesFor('clean', e)) this.countEntity(objective, entityId);
      this.checkWin();
    });

    this.bus.on('interact', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e || !e.alive) return;

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
        if (matching.some((objective) => this.rejectRequirements(objective))) return;
        this.inventory.delete(item.def.id);
        if (this.violateMatchingAvoid(e)) {
          this.bus.emit('plugged-usb', { entityId: item.def.id });
          return;
        }
        this.log(`Turned in: ${item.def.inspect?.label ?? item.def.id}`, 50,
          e.def.inspect?.objectives ?? []);
        for (const objective of matching) this.countEntity(objective, e.def.id);
        this.applyRoleGrant(e);
        this.checkWin();
        return;
      }

      if (e.def.reportable) {
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
        if (this.pendingAccusation && e.def.tags?.includes('report-console')) {
          const report = this.objectives.find((o) => o.def.kind === 'report');
          if (this.rejectRequirements(report)) return;
          if (matching.some((objective) => this.rejectRequirements(objective))) return;
          this.resolveAccusation(this.pendingAccusation);
          for (const objective of matching) this.countEntity(objective, e.def.id);
          this.checkWin();
          return;
        }
        if (matching.some((objective) => this.rejectRequirements(objective))) return;
        if (this.violateMatchingAvoid(e)) return;
        const text = e.def.log ?? e.def.inspect?.detail ?? '';
        if (text.trim()) {
          const label = e.def.inspect?.label ?? e.def.id;
          this.message(`READ: ${label}`, 'info');
          this.record(e, 'log', label, text);
        }
        for (const objective of matching) this.countEntity(objective, e.def.id);
        this.applyRoleGrant(e);
        this.checkWin();
        return;
      }

      if (e.def.kind === 'workstation' && e.infected) {
        this.log('Manual patch applied — faster with the scanner', 5, e.def.inspect?.objectives ?? []);
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

    this.bus.on('reach-exit', () => {
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
      exit.done = true;
      this.checkWin();
    });

    this.bus.on('player-down', () => {
      this.finished = 'lost';
      this.lossReason ??= 'Player integrity depleted';
    });
  }

  private resolveAccusation(e: Entity): void {
    const report = this.objectives.find((o) => o.def.kind === 'report');
    if (this.rejectRequirements(report)) return;
    if (e.def.culprit) {
      this.log('Correct! The insider is contained', 100, e.def.inspect?.objectives ?? []);
      for (const objective of this.objectives) {
        if (objective.def.kind === 'report' ||
            objective.def.id === 'report-insider' ||
            objective.def.id === 'report-admin') {
          objective.done = true;
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

  update(dt: number, w: UpdateWorld): void {
    if (!this.finished) this.elapsed += dt;

    if (w.use) {
      const hit = w.map.raycast(w.player.x, w.player.y, w.player.angle, 1.6);
      if (hit.cell?.kind === 'door' && !w.map.isDoorOpen(hit.cell.doorId ?? '')) {
        const door = hit.cell;
        if (door.locked) this.message(door.lockText ?? 'Locked.', 'warn');
        else if (door.accessRole !== undefined) {
          this.message(`Badge reader: ${door.accessRole.toUpperCase()} only — select BADGE [4]`, 'warn');
        } else {
          w.openDoor(door.doorId ?? '');
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
  }

  private updateTriggers(w: UpdateWorld): void {
    for (const trigger of this.mission.script?.triggers ?? []) {
      if (this.firedTriggers.has(trigger.id)) continue;
      const tx = Math.floor(w.player.x);
      const ty = Math.floor(w.player.y);
      const area = trigger.area;
      const inside = !area || (tx >= area[0] && tx <= area[2] && ty >= area[1] && ty <= area[3]);
      if (!inside || trigger.after?.some((id) => !this.obj(id)?.done)) continue;
      this.firedTriggers.add(trigger.id);
      if (trigger.message) this.message(trigger.message, trigger.kind ?? 'info');
      for (const id of trigger.spawn ?? []) {
        const e = this.byId(id);
        if (e && e.def.dormant) e.alive = true;
      }
      for (const doorId of trigger.openDoors ?? []) w.openDoor(doorId);
      for (const role of trigger.grantRoles ?? []) this.grantRole(role);
      for (const role of trigger.revokeRoles ?? []) this.revokeRole(role);
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
      this.message(`A secret is revealed! ${secret.label}`, 'good');
      this.log(`Secret revealed: ${secret.label}`, 25);
    }
  }

  private updateOutbreak(dt: number): void {
    const outbreak = this.mission.script?.outbreak;
    if (!outbreak || this.obj(outbreak.until)?.done) return;
    this.outbreakElapsed += dt;
    if (this.outbreakElapsed < outbreak.every) return;
    this.outbreakElapsed -= outbreak.every;
    const e = this.entities.find(
      (candidate) => this.cleaned.has(candidate.def.id) &&
        candidate.def.tags?.includes(outbreak.tag),
    );
    if (!e) return;
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
      secretsTotal: this.mission.script?.secrets?.length ?? 0,
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
  objectiveSummary(): { text: string; done: boolean; failed: boolean }[] {
    return this.objectives.map((o) => ({
      text: o.def.text,
      done: o.done,
      failed: o.failed,
    }));
  }

  objectiveTitle(id: string): string {
    return objectiveById(id)?.title ?? id;
  }
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
