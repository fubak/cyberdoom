import { LOOK_HINT, MENU_HINT } from './nav';

/**
 * Pure rules for the in-play action prompt band ([LMB]/[E] lines + nav
 * footer). Kept out of main.ts so the "mouse not captured" behaviour is
 * unit-tested: while the pointer is free the keyboard still plays, so the
 * action prompts stay up and the footer explains that the first click only
 * captures the mouse.
 */
export interface PromptGateInput {
  pointerLocked: boolean;
  /** ?debug=1 runs without pointer lock and never shows the capture hint. */
  debug: boolean;
  ending: boolean;
  switching: boolean;
  /** Dossier or automap covering the view. */
  overlayOpen: boolean;
  /** Player switched tools at least once this mission (retires the nav hint). */
  switchedTool: boolean;
  simT: number;
  /** Label of the keyboard key bound to "use tool" (e.g. 'F'). */
  fireKey: string;
}

export interface PromptGate {
  /** Compute and show the [LMB]/[E] action lines. */
  showActions: boolean;
  /** Key plate for the tool line: LMB when captured, the fire key when free (a click only captures). */
  toolKey: string;
  footer: string | null;
}

/** Seconds the ESC/M/L nav strip stays up at mission start. */
export const NAV_HINT_SECONDS = 9;

export function mouseFree(input: Pick<PromptGateInput, 'pointerLocked' | 'debug'>): boolean {
  return !input.pointerLocked && !input.debug;
}

export function promptGate(input: PromptGateInput): PromptGate {
  const free = mouseFree(input);
  const showActions = !input.ending && !input.switching && !input.overlayOpen;
  const toolKey = free ? input.fireKey || 'LMB' : 'LMB';
  let footer: string | null = null;
  if (!input.ending && !input.overlayOpen) {
    if (free) footer = LOOK_HINT;
    else if (!input.switchedTool && input.simT < NAV_HINT_SECONDS) footer = MENU_HINT;
  }
  return { showActions, toolKey, footer };
}
