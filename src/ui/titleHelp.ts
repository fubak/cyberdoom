import type { ToolDef } from '../core/types';
import { measureText, wrapText } from '../render/font';
import { controlLines, primaryKey, type Bindings } from './controlsHelp';

/**
 * READ THIS! panel text (title screen), generated from the tool registry and
 * the live key bindings so it can't drift from the game: every tool by slot,
 * the passive keycards, and every control including rebinds.
 *
 * Panel geometry (render/title.ts): 300px wide with a 6px inset, tiny font at
 * 4px per char, 8px rows, from y=72 to just above the footer tag.
 */
export const TITLE_HELP_WIDTH_PX = 300 - 12;
export const TITLE_HELP_COLS = Math.floor((TITLE_HELP_WIDTH_PX + 1) / 4);
export const TITLE_HELP_MAX_LINES = 13;

const STORY = 'MERIDIAN FREIGHT IS UNDER ATTACK BY GHOSTLEDGER. STOP THE BREACH.';
const BACK = 'PRESS ANY KEY OR CLICK TO GO BACK';
const CAPTURE = 'FIRST CLICK IN PLAY CAPTURES THE MOUSE. THE KEYBOARD WORKS WITHOUT IT.';

/** Pack tokens into lines of at most `cols`, joined by `sep`, never splitting a token. */
export function packTokens(tokens: readonly string[], sep: string, cols: number, lead = ''): string[] {
  const lines: string[] = [];
  let cur = lead;
  for (const token of tokens) {
    const cand = cur && cur !== lead ? `${cur}${sep}${token}` : `${cur}${token}`;
    if (cand.length > cols && cur && cur !== lead) {
      lines.push(cur);
      cur = token;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function titleHelpLines(bindings: Bindings, tools: readonly ToolDef[], cols = TITLE_HELP_COLS): string[] {
  const sorted = [...tools].sort((a, b) => a.slot - b.slot);
  const toolLines = packTokens(sorted.map((t) => `${t.slot} ${t.name}`), ' - ', cols, 'TOOLS: ');
  const passive = sorted.filter((t) => t.passive).map((t) => t.name);
  const passiveLine = passive.length
    ? wrapText(`${passive.join(' AND ')} ARE PASSIVE: PRESS ${primaryKey(bindings, 'use')} AT A DOOR READER.`, cols, Infinity)
    : [];
  const controls = controlLines(bindings).flatMap((line) => wrapText(line, cols, Infinity));
  const capture = wrapText(CAPTURE, cols, Infinity);
  const full = [STORY, '', ...toolLines, ...passiveLine, '', ...controls, ...capture, '', BACK];
  if (full.length <= TITLE_HELP_MAX_LINES) return full;
  // long rebinds: drop the spacer rows before anything with content
  const compact = full.filter((line, i) => line !== '' || i === full.length - 2);
  return compact.length <= TITLE_HELP_MAX_LINES ? compact : compact.filter((line) => line !== '');
}

/** Widest help line in pixels (tiny font), for layout checks. */
export function titleHelpWidth(lines: readonly string[]): number {
  return lines.reduce((w, line) => Math.max(w, measureText(line, 'tiny')), 0);
}
