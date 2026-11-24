import type { Mission } from '../core/types';
import { ARC, arcIndex } from '../content/curriculum';
import { teachingRegistry } from '../content/missions';
import { objectiveById } from '../content/objectives';
import { drawBigText, drawChunky, drawText, measureBig, measureChunky, wrapText } from '../render/font';
import { RES } from '../render/res';
import {
  bevel,
  bigScaled,
  brickBackdrop,
  C,
  DOMAIN_COLOR,
  RAMP,
} from './debrief';
import {
  DB_BODY_TOP,
  DB_H,
  DB_LINE,
  DB_W,
  DB_X,
  paginate,
  pixelSafe,
  type PLine,
} from './debrief-layout';
import { SKILLS, skillById, type SkillId } from '../missions/difficulty';
import { toolRegistry } from '../tools';
import { defaultLoadout } from '../tools/arsenal';
import { briefingDetailBlocks } from './briefingDetails';
import { pageLabel, pageStep, stepPage } from './pageKeys';
import './curriculum.css';

/**
 * CURRICULUM: mission briefing, drawn on the same Doom-intermission canvas
 * as the debrief (pixel font, palette, frame) instead of plain DOM text. The
 * details page paginates so nothing scrolls or clips; real DOM buttons keep
 * the screen keyboard- and click-navigable.
 */

export function h(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * A screen title in the game's pixel face (same font and gradient ramps as the canvas screens), as a real
 * heading: the canvas is aria-hidden and the text sits in a visually-hidden span for readers and lookups.
 * Drawn at native pixel size and scaled up by an integer in CSS, so it stays crisp.
 */
export function pixelTitle(tag: 'h1' | 'h2', cls: string, text: string, ramp: string[], scale: number): HTMLElement {
  const e = h(tag, cls);
  const cw = measureBig(text) + 2;
  const ch = 16;
  const c = document.createElement('canvas');
  c.width = cw * RES;
  c.height = ch * RES;
  const g = c.getContext('2d');
  if (g) {
    g.setTransform(RES, 0, 0, RES, 0, 0);
    drawBigText(g, text, 0, 0, ramp);
  }
  c.setAttribute('aria-hidden', 'true');
  c.className = 'cd-pixel-title';
  c.style.width = `${cw * scale}px`;
  c.style.height = `${ch * scale}px`;
  const sr = h('span', 'cd-sr-only', text);
  e.append(c, sr);
  return e;
}

export function bigButton(label: string, onClick: () => void, cls = 'cd-btn'): HTMLButtonElement {
  const b = h('button', cls, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

/** On-screen page turner for pointer users; disabled at either end. */
function pageButton(label: string, dir: 'prev' | 'next', disabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = bigButton(label, onClick, 'cd-btn alt cd-page-btn');
  b.type = 'button';
  b.disabled = disabled;
  b.dataset.page = dir;
  b.setAttribute('aria-label', dir === 'prev' ? 'Previous page' : 'Next page');
  return b;
}

/** Attach a keydown handler that lives only while `node` is in the document. */
export function onKeysWhileMounted(node: HTMLElement, fn: (e: KeyboardEvent) => void): void {
  const handler = (e: KeyboardEvent) => {
    if (!node.isConnected) {
      window.removeEventListener('keydown', handler);
      return;
    }
    fn(e);
  };
  // Defer so the keypress that opened this screen doesn't trigger it.
  setTimeout(() => window.addEventListener('keydown', handler), 250);
}

const makeCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = DB_W * RES;
  canvas.height = DB_H * RES;
  canvas.className = 'cd-pixel-canvas';
  canvas.setAttribute('role', 'img');
  const g = canvas.getContext('2d')!;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  return { canvas, g };
};

export function briefing(
  mission: Mission,
  onGo: () => void,
  onBack: () => void,
  onSkill?: (next: SkillId) => void,
  skill: SkillId = 'analyst',
): HTMLElement {
  const teach = teachingRegistry.get(mission.id);
  const idx = arcIndex(mission.id);
  const orders = teach?.orders ?? mission.missionObjectives.map((o) => ({ text: o.text, objective: '' }));
  const s = h('div', 'screen cd-inter cd-pixel cd-briefing');
  let selectedSkill = skillById(skill).id;
  let skillButton: HTMLButtonElement | null = null;
  const kicker = `MISSION ${idx + 1}/${ARC.length} - THREAT LEVEL ${'!'.repeat(Math.max(1, Math.ceil(mission.difficulty / 3)))}`;
  let mode: 'overview' | 'details' = 'overview';
  let page = 0;
  const backdrop = brickBackdrop();

  const frame = (g: CanvasRenderingContext2D) => {
    g.drawImage(backdrop, 0, 0, DB_W, DB_H);
    bevel(g, 10, 10, DB_W - 20, DB_H - 20, 'rgba(30,14,10,0.82)');
  };

  const drawLine = (g: CanvasRenderingContext2D, l: PLine, y: number) => {
    if (l.font === 'chunky') {
      if (l.prefix) drawChunky(g, l.prefix, DB_X, y, l.prefixColor ?? l.color);
      if (l.text) drawChunky(g, l.text, DB_X + (l.indent ?? 0), y, l.color);
    } else {
      if (l.prefix) drawText(g, l.prefix, DB_X, y, l.prefixColor ?? l.color);
      if (l.text) drawText(g, l.text, DB_X + (l.indent ?? 0), y, l.color);
    }
  };

  const overview = () => {
    const { canvas, g } = makeCanvas();
    frame(g);
    drawText(g, kicker, 22, 22, C.dim);
    const title = pixelSafe(mission.title);
    bigScaled(g, title, 22, 34, RAMP.gold, 1);
    const taglines = wrapChunky(teach?.tagline ?? '', 352);
    taglines.slice(0, 2).forEach((t, i) => drawChunky(g, t, 22, 58 + i * 10, C.gold));
    let y = 86;
    for (const [i, order] of orders.slice(0, 3).entries()) {
      let first = true;
      for (const t of wrapChunky(order.text, 330)) {
        if (first) drawChunky(g, String(i + 1), 22, y, C.gold);
        drawChunky(g, t, 34, y, C.text);
        first = false;
        y += 10;
      }
      if (y < 160) y += 4;
    }
    drawKit(g, Math.max(y + 6, 136));
    return canvas;
  };

  /**
   * Lower half of the overview: the tools issued for this mission and the exam objectives it practises,
   * so the panel carries the two things a player wants before deploying instead of standing two-thirds
   * empty. Rows that would pass the frame are dropped (the DETAILS page has the full objective list).
   */
  const drawKit = (g: CanvasRenderingContext2D, top: number) => {
    const bottom = DB_H - 24, colB = 196, rowH = 9;
    g.fillStyle = 'rgba(240,192,32,0.35)';
    g.fillRect(22, top, DB_W - 44, 1);
    let y = top + 7;
    drawText(g, 'TOOLS ISSUED', 22, y, C.gold);
    drawText(g, 'SY0-701 OBJECTIVES', colB, y, C.gold);
    y += 11;
    const tools = defaultLoadout(mission).map((id) => pixelSafe(toolRegistry.get(id)?.name ?? id.toUpperCase()));
    tools.forEach((name, i) => { if (y + (i + 1) * rowH <= bottom) drawText(g, name, 22, y + i * rowH, C.text); });
    let oy = y;
    const cols = Math.floor((DB_W - 22 - colB) / 6);
    for (const id of mission.objectives) {
      const objective = objectiveById(id);
      if (!objective) continue;
      const lines = wrapText(pixelSafe(`${id} ${objective.title}`), cols, 2);
      if (oy + lines.length * rowH > bottom) break;
      for (const line of lines) { drawText(g, line, colB, oy, DOMAIN_COLOR[objective.domain] ?? C.text); oy += rowH; }
      oy += 2;
    }
  };

  const wrapChunky = (text: string, maxW: number): string[] => {
    const out: string[] = [];
    let line = '';
    for (const word of pixelSafe(text).split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (measureChunky(cand) <= maxW) { line = cand; continue; }
      if (line) out.push(line);
      line = word;
    }
    if (line) out.push(line);
    return out;
  };

  const detailPages = () => paginate(briefingDetailBlocks(mission, C, (domain) => DOMAIN_COLOR[domain] ?? C.text));

  const details = (pages: PLine[][]) => {
    const { canvas, g } = makeCanvas();
    frame(g);
    drawText(g, `${kicker} - DETAILS`, 22, 22, C.dim);
    drawText(g, 'DETAILS', 22, 32, C.gold);
    const lines = pages[Math.min(page, pages.length - 1)] ?? [];
    lines.forEach((l, i) => drawLine(g, l, DB_BODY_TOP + i * DB_LINE));
    if (pages.length > 1) drawText(g, pageLabel(page, pages.length), 22, DB_H - 28, C.orange);
    return canvas;
  };

  const turnPage = (step: number) => {
    const next = stepPage(page, step, detailPages().length);
    if (next === page) return;
    page = next;
    render();
  };

  const skillLabel = () => `SKILL: ${skillById(selectedSkill).label}  [K]`;
  const cycleSkill = () => {
    const index = SKILLS.findIndex((entry) => entry.id === selectedSkill);
    selectedSkill = SKILLS[(index + 1) % SKILLS.length]!.id;
    if (skillButton) skillButton.textContent = skillLabel();
    onSkill?.(selectedSkill);
  };

  const render = () => {
    s.replaceChildren();
    skillButton = null;
    const pg = h('div', mode === 'details' ? 'cd-briefing-page cd-briefing-details-page' : 'cd-briefing-page');
    const pages = mode === 'details' ? detailPages() : [];
    page = stepPage(page, 0, pages.length);
    if (mode === 'details') {
      pg.dataset.page = String(page + 1);
      pg.dataset.pages = String(pages.length);
    }
    pg.appendChild(mode === 'details' ? details(pages) : overview());
    const buttons = h('div', 'cd-brief-actions');
    buttons.appendChild(bigButton('BACK  [ESC]', () => {
      if (mode === 'details') { mode = 'overview'; render(); } else onBack();
    }, 'cd-btn alt'));
    if (mode === 'details' && pages.length > 1) {
      buttons.append(
        pageButton('◀ PREV  [←]', 'prev', page === 0, () => turnPage(-1)),
        pageButton('NEXT  [→] ▶', 'next', page >= pages.length - 1, () => turnPage(1)),
      );
    }
    if (mode === 'overview') {
      buttons.appendChild(bigButton('DETAILS  [D]', () => { mode = 'details'; page = 0; render(); }, 'cd-btn alt'));
    }
    skillButton = bigButton(skillLabel(), cycleSkill, 'cd-btn alt');
    skillButton.type = 'button';
    skillButton.dataset.menuItem = 'skill';
    buttons.appendChild(skillButton);
    buttons.appendChild(bigButton('DEPLOY  [ENTER]', onGo));
    pg.appendChild(buttons);
    s.appendChild(pg);
  };

  render();
  onKeysWhileMounted(s, (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onGo();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      if (mode === 'details') { mode = 'overview'; render(); } else onBack();
    } else if (e.key.toLowerCase() === 'd' && mode === 'overview') {
      e.preventDefault();
      mode = 'details'; page = 0; render();
    } else if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cycleSkill();
    } else if (mode === 'details' && pageStep(e.key) !== 0) {
      // D only reaches here in details mode: on the overview it opens details (above)
      e.preventDefault();
      turnPage(pageStep(e.key));
    }
  });
  return s;
}
