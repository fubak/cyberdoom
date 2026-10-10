import type { Entity, ToolHint, ToolUseContext } from '../core/types';

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
 * True when the nearest entity in the aim cone is a live enemy. Only hostile
 * hints may repeat-fade: the HUD must always say what a click does on a
 * workstation, door, console, pickup or other interactable.
 */
export function aimIsHostile(ctx: ToolUseContext): boolean {
  return ctx.aimEntity(9, 0.6)?.def.kind === 'enemy';
}

/**
 * Repeat suppression for the LMB prompt: an unchanged hint aimed at a hostile
 * is dropped after `after` seconds of repetition (combat noise), while the same
 * hint on any interactable stays up as long as it is aimed at.
 */
export class HintFader {
  private text: string | null = null;
  private since = 0;

  apply(hint: ToolHint | null, hostile: boolean, now: number, after = 4): ToolHint | null {
    if (!hint || hint.text !== this.text) {
      this.text = hint?.text ?? null;
      this.since = now;
      return hint;
    }
    if (hostile && now - this.since > after) return null;
    return hint;
  }
}
