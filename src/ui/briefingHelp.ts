import { wrapText } from '../render/font';
import { skillById } from '../missions/difficulty';
import { block, heading, type PLine } from './debrief-layout';
import { controlLines, type Bindings } from './controlsHelp';

/**
 * Briefing helpers (pure): the THREAT LEVEL and SKILL explanations, the
 * DETAILS > CONTROLS page, and the overview's objective list laid out without
 * any '…' (an objective that doesn't fit whole moves to DETAILS instead).
 */

/** 1..4 '!' marks; difficulty 1-3 = !, 4-6 = !!, ... */
export function threatMarks(difficulty: number): string {
  return '!'.repeat(Math.max(1, Math.ceil(difficulty / 3)));
}

export const THREAT_HELP = 'THREAT LEVEL: MORE ! MEANS TOUGHER, FASTER, HARDER-HITTING MALWARE.';

/** One line on what the selected skill changes (skill = difficulty). */
export function skillHelp(skillId: string): string {
  const s = skillById(skillId);
  const x = (n: number) => `X${Number(n.toFixed(2))}`;
  return `SKILL ${s.label}: MALWARE DAMAGE ${x(s.dmg)}, SPEED ${x(s.speed)}, PICKUPS ${x(s.pickup)}. K CHANGES IT.`;
}

/** DETAILS > CONTROLS page: live key bindings plus the threat/skill explanations. */
export function briefingControlsBlocks(
  bindings: Bindings,
  opts: { skill: string; difficulty: number; gold: string; text: string; dim: string },
): PLine[][] {
  return [
    heading('CONTROLS', opts.gold),
    block(controlLines(bindings).join('\n'), opts.text),
    block('FIRST CLICK IN PLAY CAPTURES THE MOUSE. THE KEYBOARD WORKS WITHOUT IT.', opts.dim),
    heading('THREAT AND SKILL', opts.gold),
    block(`${THREAT_HELP} THIS MISSION: ${threatMarks(opts.difficulty)}`, opts.text),
    block(skillHelp(opts.skill), opts.text),
  ];
}

export interface KitLine {
  text: string;
  /** Index into the objective list, or -1 for the "more in details" line. */
  index: number;
  y: number;
}

/**
 * Lay out whole objectives (never cut) between `top` and `bottom`. Any that
 * don't fit are counted and a single "+N MORE IN DETAILS [D]" row replaces them.
 */
export function layoutKitObjectives(
  texts: readonly string[],
  cols: number,
  top: number,
  bottom: number,
  rowH = 9,
  gap = 2,
): { lines: KitLine[]; hidden: number } {
  const wrapped = texts.map((t) => wrapText(t, cols, Infinity));
  const place = (reserve: number) => {
    const lines: KitLine[] = [];
    let y = top;
    let shown = 0;
    for (const [index, rows] of wrapped.entries()) {
      if (y + rows.length * rowH > bottom - reserve) break;
      for (const text of rows) {
        lines.push({ text, index, y });
        y += rowH;
      }
      y += gap;
      shown++;
    }
    return { lines, shown, y };
  };
  const all = place(0);
  if (all.shown === wrapped.length) return { lines: all.lines, hidden: 0 };
  const some = place(rowH + gap);
  const hidden = wrapped.length - some.shown;
  return { lines: [...some.lines, { text: `+${hidden} MORE IN DETAILS [D]`, index: -1, y: some.y }], hidden };
}
