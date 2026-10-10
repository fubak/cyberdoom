import type { Mission } from '../core/types';
import { ARC, arcIndex } from '../content/curriculum';
import { define } from '../content/glossary';
import { teachingRegistry } from '../content/missions';
import { objectiveById } from '../content/objectives';
import { drawChunky, drawText, measureChunky } from '../render/font';
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
  block,
  DB_BODY_TOP,
  DB_H,
  DB_LINE,
  DB_W,
  DB_X,
  paginate,
  pixelSafe,
  type PLine,
} from './debrief-layout';
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

export function bigButton(label: string, onClick: () => void, cls = 'cd-btn'): HTMLButtonElement {
  const b = h('button', cls, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
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

export function briefing(mission: Mission, onGo: () => void, onBack: () => void): HTMLElement {
  const teach = teachingRegistry.get(mission.id);
  const idx = arcIndex(mission.id);
  const orders = teach?.orders ?? mission.missionObjectives.map((o) => ({ text: o.text, objective: '' }));
  const s = h('div', 'screen cd-inter cd-pixel cd-briefing');
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
    drawText(g, 'D DETAILS   ENTER DEPLOY   ESC BACK', 22, DB_H - 34, C.orange);
    return canvas;
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

  const detailBlocks = (): PLine[][] => {
    const blocks: PLine[][] = [];
    blocks.push(block('SITUATION', C.gold));
    blocks.push(block(teach?.situation ?? mission.briefing, C.text, { font: 'chunky' }));
    blocks.push(block('ALL ORDERS', C.gold));
    for (const [i, order] of orders.entries()) {
      blocks.push(block(order.text, C.text, { prefix: String(i + 1), prefixColor: C.gold, font: 'chunky' }));
    }
    const objRows: PLine[] = [];
    for (const id of mission.objectives) {
      const objective = objectiveById(id);
      if (!objective) continue;
      objRows.push(...block(`${id} ${objective.title}`, DOMAIN_COLOR[objective.domain] ?? C.text, { font: 'chunky' }));
    }
    if (objRows.length) {
      blocks.push(block('SY0-701 OBJECTIVES', C.gold));
      blocks.push(objRows);
    }
    if (teach?.keyTerms.length) {
      const terms: PLine[] = [];
      for (const term of teach.keyTerms) {
        const definition = define(term);
        if (!definition) continue;
        terms.push(...block(term, C.orange, { font: 'chunky' }));
        terms.push(...block(definition.replace(/\s*\[[\d., ]+\]\s*$/, ''), C.dim, { indent: 10 }));
      }
      if (terms.length) {
        blocks.push(block('KEY TERMS', C.gold));
        blocks.push(terms);
      }
    }
    return blocks;
  };

  const details = () => {
    const { canvas, g } = makeCanvas();
    frame(g);
    drawText(g, `${kicker} - DETAILS`, 22, 22, C.dim);
    drawText(g, 'DETAILS', 22, 32, C.gold);
    const pages = paginate(detailBlocks());
    const lines = pages[Math.min(page, pages.length - 1)] ?? [];
    lines.forEach((l, i) => drawLine(g, l, DB_BODY_TOP + i * DB_LINE));
    const foot = pages.length > 1 ? `A/D PAGE ${Math.min(page, pages.length - 1) + 1}/${pages.length}   ESC BACK   ENTER DEPLOY` : 'ESC BACK   ENTER DEPLOY';
    drawText(g, foot, 22, DB_H - 34, C.orange);
    return canvas;
  };

  const render = () => {
    s.replaceChildren();
    const pg = h('div', mode === 'details' ? 'cd-briefing-page cd-briefing-details-page' : 'cd-briefing-page');
    pg.appendChild(mode === 'details' ? details() : overview());
    const buttons = h('div', 'cd-brief-actions');
    buttons.appendChild(bigButton('BACK  [ESC]', () => {
      if (mode === 'details') { mode = 'overview'; render(); } else onBack();
    }, 'cd-btn alt'));
    if (mode === 'overview') {
      buttons.appendChild(bigButton('DETAILS  [D]', () => { mode = 'details'; page = 0; render(); }, 'cd-btn alt'));
    }
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
    } else if (mode === 'details' && (e.key === 'ArrowRight' || e.key.toLowerCase() === 'a')) {
      e.preventDefault();
      page = Math.min(page + 1, paginate(detailBlocks()).length - 1);
      render();
    } else if (mode === 'details' && (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'q')) {
      e.preventDefault();
      page = Math.max(0, page - 1);
      render();
    }
  });
  return s;
}
