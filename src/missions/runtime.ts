import type { EventBus } from '../core/events';
import type {
  Entity,
  Mission,
  MissionObjective,
  ScoreEvent,
} from '../core/types';
import { objectiveById } from '../content/objectives';

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
}

export class MissionRuntime {
  readonly mission: Mission;
  entities: Entity[];
  objectives: ObjectiveStatus[];
  scoreLog: ScoreEvent[] = [];
  score = 0;
  /** Player's selected suspect for 'report' — set when Keyboard is used on an npc. */
  private pendingAccusation: Entity | null = null;
  finished: 'won' | 'lost' | null = null;

  constructor(mission: Mission, private bus: EventBus) {
    this.mission = mission;
    this.entities = mission.entities.map((def) => ({
      def,
      x: def.x,
      y: def.y,
      hp: def.hp ?? 1,
      alive: true,
      infected: def.infected ?? false,
      state: {},
    }));
    this.objectives = mission.missionObjectives.map((def) => ({
      def,
      done: false,
      failed: false,
      progress: 0,
      target: def.count ?? 1,
    }));
    this.bind();
  }

  private log(text: string, points: number, objectives: string[] = []): void {
    this.score += points;
    this.scoreLog.push({ text, points, good: points >= 0, objectives });
    this.bus.emit('message', {
      text: `${text} ${points >= 0 ? '+' : ''}${points}`,
      kind: points >= 0 ? 'good' : 'bad',
    });
  }

  private obj(id: string): ObjectiveStatus | undefined {
    return this.objectives.find((o) => o.def.id === id);
  }

  private bind(): void {
    this.bus.on('inspect', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e?.def.inspect) return;
      const info = e.def.inspect;
      this.bus.emit('message', { text: `${info.label}: ${info.detail}`, kind: 'info' });
      if (info.category === 'malware' || info.category === 'suspicious') {
        this.log('Identified an indicator', 10, info.objectives ?? []);
      }
      for (const o of this.objectives) {
        if (o.def.kind === 'inspect' && o.def.tag && e.def.tags?.includes(o.def.tag)) {
          o.progress++;
          if (o.progress >= o.target) o.done = true;
        }
      }
    });

    this.bus.on('cleaned', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e) return;
      e.infected = false;
      e.alive = false;
      this.log(`Cleaned ${e.def.inspect?.label ?? 'host'}`, 25, e.def.inspect?.objectives ?? []);
      for (const o of this.objectives) {
        if (o.def.kind === 'clean' && e.def.tags?.includes(o.def.tag ?? '')) {
          o.progress++;
          if (o.progress >= o.target) o.done = true;
        }
      }
      this.checkWin();
    });

    this.bus.on('interact', ({ entityId }) => {
      const e = this.byId(entityId);
      if (!e) return;
      if (e.def.kind === 'console') {
        for (const o of this.objectives) {
          if (o.def.kind === 'interact' && e.def.tags?.includes(o.def.tag ?? '')) {
            if (!o.done) {
              o.done = true;
              if (this.pendingAccusation) this.resolveAccusation(this.pendingAccusation);
              else this.log('Report filed — nothing to accuse yet', 5, ['4.8']);
            }
          }
        }
        // 'report' objective: filing at console with an accusation
        if (this.obj('report-insider') && this.pendingAccusation && !this.obj('report-insider')!.done) {
          this.resolveAccusation(this.pendingAccusation);
        }
        this.checkWin();
        return;
      }
      if (e.def.kind === 'npc' && e.def.reportable) {
        // mark suspect; actual report happens at console OR immediately if no console
        this.pendingAccusation = e;
        const hasConsole = this.entities.some((x) => x.def.kind === 'console' && x.alive);
        if (hasConsole) {
          this.bus.emit('message', {
            text: `Suspect marked: ${e.def.inspect?.label ?? e.def.id}. File the report at the console.`,
            kind: 'warn',
          });
        } else {
          this.resolveAccusation(e);
        }
        return;
      }
      if (e.def.kind === 'workstation' && e.infected) {
        this.log('Manual patch applied — faster with the scanner', 5, e.def.inspect?.objectives ?? []);
        e.infected = false;
        e.alive = false;
        for (const o of this.objectives) {
          if (o.def.kind === 'clean' && e.def.tags?.includes(o.def.tag ?? '')) {
            o.progress++;
            if (o.progress >= o.target) o.done = true;
          }
        }
        this.checkWin();
        return;
      }
      if (e.def.tags?.includes('found-usb')) {
        this.bus.emit('plugged-usb', { entityId });
        this.log('You connected an unknown removable device — malware delivered', -50, ['2.2']);
        e.alive = false;
        for (const o of this.objectives) {
          if (o.def.kind === 'avoid' && e.def.tags?.includes(o.def.tag ?? '')) o.failed = true;
        }
      }
    });

    this.bus.on('report', ({ entityId }) => {
      const e = this.byId(entityId);
      if (e) this.resolveAccusation(e);
    });

    this.bus.on('badge-door', ({ accessRole, allowed }) => {
      if (allowed) {
        this.log('Authorized badge access', 10, ['4.6']);
      } else {
        this.log(
          `Least-privilege violation: role lacks ${accessRole ?? 'access'}`,
          -30,
          ['4.6', '1.2'],
        );
        for (const o of this.objectives) {
          if (o.def.kind === 'doors') o.failed = true;
        }
      }
    });

    this.bus.on('reach-exit', () => {
      const o = this.obj('exit');
      if (o) o.done = true;
      this.checkWin();
    });

    this.bus.on('player-down', () => {
      this.finished = 'lost';
    });
  }

  private resolveAccusation(e: Entity): void {
    const reportObj = this.obj('report-insider');
    if (e.def.culprit) {
      this.log('Correct! The insider is contained', 100, ['2.1', '2.4']);
      if (reportObj) reportObj.done = true;
      const inter = this.obj('report-admin');
      if (inter) inter.done = true;
      e.alive = false;
    } else {
      this.log(`False accusation — ${e.def.inspect?.label ?? 'innocent'} harmed`, -60, ['2.4']);
      for (const o of this.objectives) {
        if (o.def.kind === 'avoid' && o.def.tag === 'false-accuse') o.failed = true;
      }
    }
    this.checkWin();
  }

  byId(id: string): Entity | undefined {
    return this.entities.find((e) => e.def.id === id);
  }

  checkWin(): void {
    if (this.finished) return;
    // win requires all non-avoid objectives done (failed avoid objectives
    // only cost points, they don't block the win)
    const required = this.objectives.filter((o) => o.def.kind !== 'avoid');
    if (required.length > 0 && required.every((o) => o.done)) {
      this.finished = 'won';
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
