import { keyLabel, type Action } from '../engine/bindings';

/**
 * Player-facing control copy generated from the live key bindings, so a
 * rebind shows up everywhere the game explains its keys (title READ THIS!,
 * briefing CONTROLS page, first-run ticker tips). Pure: takes the resolved
 * bindings, returns upper-case strings.
 */
export type Bindings = Readonly<Record<Action, readonly string[]>>;

/** 'E/SPACE' for an action with two keys; '-' when unbound. */
export function bindingLabel(bindings: Bindings, action: Action): string {
  return [...new Set(bindings[action].map(keyLabel))].join('/') || '-';
}

/** Only the first key ("E", not "E/SPACE"), for compact HUD plates. */
export function primaryKey(bindings: Bindings, action: Action): string {
  const first = bindings[action][0];
  return first ? keyLabel(first) : '-';
}

/** Fixed (non-rebindable) keys handled outside the binding table. */
export const FIXED_KEYS = {
  objectives: 'TAB',
  pause: 'ESC',
  quicksave: 'F5',
  quickload: 'F9',
} as const;

/** The full control list, one action group per line (no line wraps at 72 tiny columns with default keys). */
export function controlLines(bindings: Bindings): string[] {
  const k = (action: Action) => bindingLabel(bindings, action);
  return [
    `${k('forward')}/${k('back')} MOVE - ${k('strafeLeft')}/${k('strafeRight')} STRAFE - MOUSE OR ${k('turnLeft')}/${k('turnRight')} TURN - ${k('run')} RUN`,
    `LMB/${k('fire')} USE TOOL - ${k('use')} INTERACT: READ HOSTS, DOORS, CONSOLES`,
    `1-9 / WHEEL / ${k('cycle')} SELECT TOOL`,
    `${FIXED_KEYS.objectives} OBJECTIVES - ${k('map')} MAP - ${k('log')} LOG - ${FIXED_KEYS.pause} PAUSE - ${FIXED_KEYS.quicksave} SAVE - ${FIXED_KEYS.quickload} LOAD`,
  ];
}

/**
 * First-run ticker tips for the opening mission, in play order: move/look,
 * interact with a workstation, pick a tool, then map/log. Each is short
 * enough for one two-line ticker page (tested).
 */
export function onboardingTips(bindings: Bindings): string[] {
  const k = (action: Action) => bindingLabel(bindings, action);
  return [
    `Move ${k('forward')}/${k('back')}, strafe ${k('strafeLeft')}/${k('strafeRight')}. Look with the mouse or ${k('turnLeft')}/${k('turnRight')}. ${k('run')} runs.`,
    `Press ${k('use')} at a workstation to read it. ${primaryKey(bindings, 'use')} also opens doors and uses consoles.`,
    `Number keys 1-9 select a tool. LMB or ${k('fire')} uses it.`,
    `${k('map')} opens the map, ${k('log')} the evidence log, ${FIXED_KEYS.objectives} lists objectives.`,
  ];
}
