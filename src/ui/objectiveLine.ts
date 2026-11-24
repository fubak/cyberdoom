import { ellipsizeWords, measureChunky, measureText } from '../render/font';

/**
 * Single-line objective text for the HUD. The HUD line is a summary and is
 * truncated by design (at a word boundary, with '…'); the full objective is
 * always reachable on TAB, in the pause menu and in the log. A trailing
 * progress count such as "(2/5)" is kept when the body is cut, so the line
 * never loses the number the player is chasing. Never returns more than one
 * line, so a long objective (M12's SIEM queue) can't wrap over the scene.
 */
const PROGRESS = /\s*\((\d+\/\d+)\)\s*$/;

export interface ObjectiveLike {
  text: string;
  done: boolean;
  failed: boolean;
}

/** Fit `text` (upper-cased) into `maxChars`, keeping any "(n/m)" progress suffix. */
export function fitObjective(text: string, maxChars: number): string {
  const upper = text.toUpperCase().replace(/\s+/g, ' ').trim();
  if (upper.length <= maxChars) return upper;
  const match = PROGRESS.exec(upper);
  const suffix = match ? ` (${match[1]})` : '';
  const body = match ? upper.slice(0, match.index) : upper;
  const room = maxChars - suffix.length;
  if (room < 4) return ellipsizeWords(upper, maxChars);
  return `${ellipsizeWords(body, room)}${suffix}`;
}

/** Tiny-font columns of the pinned objective line (matches the ticker's 52-col wrap). */
export const PINNED_COLS = 52;

/** The slim always-on line: head 'OBJ 1/3' and the open objective, together within PINNED_COLS. */
export function pinnedObjectiveLine(
  objs: readonly ObjectiveLike[],
  progress?: { done: number; total: number },
  cols = PINNED_COLS,
): { head: string; body: string } | null {
  if (objs.length === 0) return null;
  const open = objs.find((o) => !o.done && !o.failed);
  const done = progress?.done ?? objs.filter((o) => o.done).length;
  const total = progress?.total ?? objs.length;
  const head = `OBJ ${done}/${total}`;
  // head + 1 space gap (drawn as 5px) + body
  const body = fitObjective(open ? open.text : 'ALL OBJECTIVES SETTLED', Math.max(8, cols - head.length - 2));
  return { head, body };
}

/**
 * The objective-change strip line: the chunky face when it fits, else the
 * small face, cut to one line of `availPx` pixels either way.
 */
export function stripObjectiveLine(text: string, availPx: number): { text: string; font: 'chunky' | 'small' } {
  const upper = text.toUpperCase().replace(/\s+/g, ' ').trim();
  if (measureChunky(upper) <= availPx) return { text: upper, font: 'chunky' };
  const cols = Math.max(4, Math.floor((availPx + 1) / 6));
  const fitted = fitObjective(upper, cols);
  return { text: measureText(fitted, 'small') <= availPx ? fitted : fitObjective(upper, cols - 1), font: 'small' };
}
