import type { Entity } from '../core/types';

/**
 * Generic noun for the HUD action prompt. Deliberately never returns the
 * entity's inspect label: that label can carry the verdict (e.g. a decoy or
 * 'wrong' console must read the same as any other console).
 */
export function targetNoun(e: Entity): string {
  switch (e.def.kind) {
    case 'enemy':
      return 'MALWARE';
    case 'workstation':
      return 'WORKSTATION';
    case 'console':
      return 'CONSOLE';
    case 'npc':
      return 'EMPLOYEE';
    case 'item':
      return 'ITEM';
    default:
      return 'OBJECT';
  }
}

/**
 * Repeat suppression lives in main.ts's prompt driver: action prompts stay
 * up as long as they are aimed at (owner constraint), and only range-failure
 * hints (ToolHint.fleeting) expire, ~1.5 s after the failed action.
 */
