/**
 * Tiny typed event bus — the decoupling layer between engine, runtime and UI.
 * Known event names and payloads live in `EventMap`; areas may add their own
 * via declaration merging if needed.
 */

import type { CallAction, EvidenceEntry } from './types';

export interface EventMap {
  /** A tool was used (fired). */
  'tool-used': { toolId: string };
  /** Player inspected an entity with the Mouse. */
  inspect: { entityId: string };
  /** Evidence was logged or re-read; the UI opens the case file. */
  evidence: EvidenceEntry;
  /** Scanner charge hit a non-infected target. */
  'scan-miss': { entityId: string };
  /** Player reported/accused an entity (insider threat). */
  report: { entityId: string };
  /** An infected entity was cleaned by the scanner. */
  cleaned: { entityId: string };
  /** Player interacted (Keyboard) with an entity. */
  interact: { entityId: string };
  /** Player used badge on a door. */
  'badge-door': { doorId: string; accessRole?: string; allowed: boolean };
  /** Player plugged in a suspicious found USB. */
  'plugged-usb': { entityId: string };
  /** Player reached the exit. */
  'reach-exit': Record<string, never>;
  /** Player integrity hit zero. */
  'player-down': { by?: string; threat?: string };
  /** Player picked up an item. */
  pickup: { entityId: string };
  /** A secret area awarded its named payoff; main applies it like a pickup grant. */
  'grant-item': { resource: string; amount: number };
  /** A script trigger spawned a dormant enemy (telegraphing: fog + sfx). */
  'ambush-spawn': { entityId: string };
  /** Player committed a triage verdict on an entity (Mouse, second click). */
  triage: { entityId: string; verdict: 'malicious'; correct: boolean };
  /** Player picked a "WHAT DO YOU DO?" option on an entity's case file. */
  'call-pick': { entityId: string; action: CallAction };
  /** Badge reader refused a repeat swipe (no new violation logged). */
  'badge-confirm': { allowed: boolean };
  /** A tool hit/affected an entity; drives viewmodel hit reactions. */
  'tool-hit': { toolId: string; entityId?: string; good: boolean };
  /** A tool weakened an entity without cleaning it (`applied`: pain/knockback already done via damageEntity). */
  'entity-hurt': { entityId: string; fromX: number; fromY: number; applied?: boolean };
  /** HUD ticker message. */
  message: { text: string; kind?: 'info' | 'warn' | 'good' | 'bad' };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof EventMap>(event: K, fn: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<EventMap[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
