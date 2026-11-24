import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { objectiveById } from '../src/content/objectives';
import { rebind, resolveBindings } from '../src/engine/bindings';
import { canDraw, measureChunky, measureText } from '../src/render/font';
import { BASE_W } from '../src/render/res';
import { SKILLS } from '../src/missions/difficulty';
import { sortedTools } from '../src/tools';
import {
  TITLE_HELP_COLS,
  TITLE_HELP_MAX_LINES,
  TITLE_HELP_WIDTH_PX,
  titleHelpLines,
  titleHelpWidth,
} from '../src/ui/titleHelp';
import { fitObjective, PINNED_COLS, pinnedObjectiveLine, stripObjectiveLine } from '../src/ui/objectiveLine';
import { briefingControlsBlocks, layoutKitObjectives, skillHelp, THREAT_HELP, threatMarks } from '../src/ui/briefingHelp';
import { DB_BODY_ROWS, DB_TEXT_W, paginate, pixelSafe } from '../src/ui/debrief-layout';

const defaults = resolveBindings({});

describe('title READ THIS! help', () => {
  const lines = titleHelpLines(defaults, sortedTools());
  const text = lines.join('\n');

  it('names every registered tool, whole, on one line', () => {
    for (const tool of sortedTools()) {
      expect(lines.some((line) => line.includes(`${tool.slot} ${tool.name}`)), tool.name).toBe(true);
    }
  });

  it('lists every control from the bindings plus the fixed keys', () => {
    for (const needle of ['W/S MOVE', 'A/D STRAFE', 'SHIFT RUN', 'E/SPACE INTERACT', 'LMB/F USE TOOL', 'M MAP', 'L LOG', 'TAB OBJECTIVES', 'ESC PAUSE', 'F5 SAVE', 'F9 LOAD', '1-9']) {
      expect(text, needle).toContain(needle);
    }
    expect(text).toMatch(/CAPTURES THE MOUSE/);
  });

  it('fits the panel: no line wider than the panel, no more rows than it holds', () => {
    expect(lines.length).toBeLessThanOrEqual(TITLE_HELP_MAX_LINES);
    expect(titleHelpWidth(lines)).toBeLessThanOrEqual(TITLE_HELP_WIDTH_PX);
    for (const line of lines) {
      expect(line.length, line).toBeLessThanOrEqual(TITLE_HELP_COLS);
      expect(canDraw(line, 'tiny'), line).toBe(true);
    }
  });

  it('shows rebinds and still fits with long key names', () => {
    let keys = rebind(defaults, 'fire', 'KeyG');
    expect(titleHelpLines(keys, sortedTools()).join(' ')).toContain('LMB/G USE TOOL');
    keys = rebind(rebind(rebind(keys, 'map', 'BracketLeft'), 'log', 'BracketRight'), 'use', 'NumpadEnter');
    const long = titleHelpLines(keys, sortedTools());
    expect(long.length).toBeLessThanOrEqual(TITLE_HELP_MAX_LINES);
    expect(titleHelpWidth(long)).toBeLessThanOrEqual(TITLE_HELP_WIDTH_PX);
  });
});

/** Every objective string a mission can put on the HUD, with and without a progress count. */
function hudObjectiveTexts(): { id: string; text: string }[] {
  return missionRegistry.all().flatMap((m) =>
    m.missionObjectives.flatMap((o) => [
      { id: `${m.id}:${o.id}`, text: o.text },
      { id: `${m.id}:${o.id}+progress`, text: `${o.text} (10/12)` },
    ]),
  );
}

describe('objective HUD line', () => {
  it('is one line within the ticker columns for every mission objective', () => {
    for (const { id, text } of hudObjectiveTexts()) {
      const line = pinnedObjectiveLine([{ text, done: false, failed: false }], { done: 10, total: 12 })!;
      expect(line.head).toBe('OBJ 10/12');
      expect(`${line.head}  ${line.body}`.length, id).toBeLessThanOrEqual(PINNED_COLS);
      expect(line.body, id).not.toContain('\n');
      expect(canDraw(line.body, 'tiny'), id).toBe(true);
    }
  });

  it('keeps the progress count when a long objective is cut', () => {
    const siem = 'Read the SIEM queue (earns SOC badge access) (1/3)';
    const fitted = fitObjective(siem, 30);
    expect(fitted.length).toBeLessThanOrEqual(30);
    expect(fitted.endsWith('(1/3)')).toBe(true);
    expect(fitted).toContain('…');
    expect(fitObjective('Short one', 30)).toBe('SHORT ONE');
  });

  it('the objective-change strip never wraps, whatever the head', () => {
    for (const head of ['OBJECTIVE', 'DONE', 'FAILED', 'OBJ 10/12']) {
      const avail = BASE_W - (13 + measureChunky(head) + 6) - 3;
      for (const { id, text } of hudObjectiveTexts()) {
        const line = stripObjectiveLine(text, avail);
        const width = line.font === 'chunky' ? measureChunky(line.text) : measureText(line.text, 'small');
        expect(width, `${head} ${id}`).toBeLessThanOrEqual(avail);
        expect(line.text, id).not.toContain('\n');
      }
    }
  });

  it('M12 SIEM objective (the one that used to wrap) fits one line', () => {
    const m12 = missionRegistry.get('m12')!;
    const siem = m12.missionObjectives.find((o) => /SIEM/i.test(o.text));
    expect(siem).toBeDefined();
    const avail = BASE_W - (13 + measureChunky('OBJECTIVE') + 6) - 3;
    const line = stripObjectiveLine(siem!.text, avail);
    expect(line.font === 'chunky' ? measureChunky(line.text) : measureText(line.text, 'small')).toBeLessThanOrEqual(avail);
  });
});

describe('briefing', () => {
  // drawKit geometry in ui/briefing.ts: objective column at x=196 on a 400px canvas
  const cols = Math.floor((400 - 22 - 196) / 6);

  it('overview objectives are shown whole, never with an ellipsis', () => {
    for (const m of missionRegistry.all()) {
      const texts = m.objectives.flatMap((id) => {
        const o = objectiveById(id);
        return o ? [pixelSafe(`${id} ${o.title}`)] : [];
      });
      for (const top of [154, 175]) {
        const kit = layoutKitObjectives(texts, cols, top, 226);
        expect(kit.lines.some((l) => l.text.includes('…')), m.id).toBe(false);
        for (const l of kit.lines) {
          expect(l.text.length, `${m.id}: ${l.text}`).toBeLessThanOrEqual(cols);
          expect(l.y + 9, m.id).toBeLessThanOrEqual(226 + 2);
        }
        const shown = new Set(kit.lines.filter((l) => l.index >= 0).map((l) => l.index));
        expect(shown.size + kit.hidden, m.id).toBe(texts.length);
        // a shown objective is shown in full
        for (const index of shown) {
          const joined = kit.lines.filter((l) => l.index === index).map((l) => l.text).join(' ');
          expect(joined, m.id).toBe(texts[index].replace(/\s+/g, ' ').trim());
        }
      }
    }
  });

  it('DETAILS gains a CONTROLS page that explains threat level and skill', () => {
    const pages = paginate(briefingControlsBlocks(defaults, {
      skill: 'analyst', difficulty: 7, gold: '#g', text: '#t', dim: '#d',
    }));
    expect(pages).toHaveLength(1);
    expect(pages[0].length).toBeLessThanOrEqual(DB_BODY_ROWS);
    const text = pages[0].map((l) => l.text).join(' ');
    expect(pages[0][0].text).toBe('CONTROLS');
    expect(text).toContain('E/SPACE INTERACT');
    expect(text).toContain('THREAT LEVEL');
    expect(text).toContain('SKILL ANALYST');
    expect(text).toContain(`THIS MISSION: ${threatMarks(7)}`);
    for (const l of pages[0]) expect(measureText(l.text, 'small'), l.text).toBeLessThanOrEqual(DB_TEXT_W);
  });

  it('threat and skill explanations are one short drawable line each', () => {
    expect(measureText(THREAT_HELP, 'small')).toBeLessThanOrEqual(DB_TEXT_W + 60);
    expect(canDraw(THREAT_HELP)).toBe(true);
    for (const skill of SKILLS) {
      const help = skillHelp(skill.id);
      expect(canDraw(help), help).toBe(true);
      expect(help).toContain(skill.label);
      expect(help.length, help).toBeLessThanOrEqual(110);
    }
    expect(threatMarks(1)).toBe('!');
    expect(threatMarks(12)).toBe('!!!!');
  });
});
