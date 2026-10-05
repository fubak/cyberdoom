import { Registry } from '../core/registry';
import type { ToolDef } from '../core/types';
import { keyboardTool } from './keyboard';
import { mouseTool } from './mouse';
import { usbTool } from './usb';
import { badgeTool } from './badge';
import { tapTool } from './tap';
import { edrTool } from './edr';

/**
 * ARSENAL: the tool registry. Add new tools as modules in this directory and
 * register them here.
 */
export const toolRegistry = new Registry<ToolDef>();

for (const t of [keyboardTool, mouseTool, usbTool, badgeTool, tapTool, edrTool]) {
  toolRegistry.register(t.id, t);
}

export function toolForSlot(slot: number): ToolDef | undefined {
  return toolRegistry.all().find((t) => t.slot === slot);
}

export function sortedTools(): ToolDef[] {
  return toolRegistry.all().sort((a, b) => a.slot - b.slot);
}

