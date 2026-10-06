import type { Gender } from '../core/types';
import { missionRegistry } from '../content/missions';
import { playableCoverageLine } from '../content/curriculum';
import { objectiveById } from '../content/objectives';
import { missionRowStates } from '../missions/progress';
import { mountTitle } from '../render/title';

/**
 * ARSENAL/LOOK: HTML overlay screens — title, character select, mission
 * select, briefing, debrief quiz. Each returns a DOM element; main.ts
 * swaps them in/out of #app.
 */

function el(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function titleScreen(onStart: () => void): HTMLElement {
  const s = el('div', 'screen title');
  mountTitle(s, onStart, [
    'A DOOM-STYLE TRAINING GROUND FOR COMPTIA SECURITY+ SY0-701.',
    'YOUR WEAPONS ARE IT TOOLS: KEYBOARD, MOUSE, USB SCANNER, BADGE,',
    'NETWORK TAP, EDR, MFA TOKEN, PATCH DISK. FIND MORE IN THE FIELD.',
    'CLEAN MALWARE. ENFORCE LEAST PRIVILEGE. CATCH THE INSIDER.',
    '',
    'WASD MOVE - MOUSE LOOK - ARROWS TURN - SHIFT RUN',
    'LMB USE TOOL - E/SPACE INTERACT - 1-8 / WHEEL / Q SELECT TOOL',
    '',
    'PRESS ANY KEY OR CLICK TO GO BACK',
  ]);
  return s;
}

function drawPortrait(canvas: HTMLCanvasElement, gender: Gender): void {
  const g = canvas.getContext('2d')!;
  canvas.width = 48;
  canvas.height = 48;
  const skin = gender === 'female' ? '#f0c8a0' : '#e8b98a';
  const hair = gender === 'female' ? '#620' : '#432';
  const shirt = gender === 'female' ? '#7a2d8e' : '#27407a';
  g.fillStyle = '#0a0a10';
  g.fillRect(0, 0, 48, 48);
  g.fillStyle = shirt;
  g.fillRect(12, 34, 24, 14);
  g.fillStyle = skin;
  g.fillRect(16, 12, 16, 16);
  g.fillStyle = hair;
  g.fillRect(15, 8, 18, 6);
  if (gender === 'female') {
    g.fillRect(13, 12, 4, 22);
    g.fillRect(31, 12, 4, 22);
  }
  g.fillStyle = '#111';
  g.fillRect(19, 19, 3, 3);
  g.fillRect(26, 19, 3, 3);
  g.fillRect(21, 26, 6, 2);
  // headset
  g.fillStyle = '#39d353';
  g.fillRect(14, 20, 2, 6);
  g.fillRect(14, 26, 8, 2);
}

export function characterSelect(onPick: (g: Gender) => void): HTMLElement {
  const s = el('div', 'screen');
  s.appendChild(el('h2', '', 'SELECT YOUR ANALYST'));
  const cards = el('div', 'char-cards');
  const mk = (gender: Gender, name: string, role: string) => {
    const c = el('div', 'char-card');
    const cv = document.createElement('canvas');
    drawPortrait(cv, gender);
    c.appendChild(cv);
    c.appendChild(el('div', 'name', name));
    c.appendChild(el('div', 'role', role));
    c.addEventListener('click', () => onPick(gender));
    return c;
  };
  cards.appendChild(mk('male', 'RAY', 'SOC Analyst'));
  cards.appendChild(mk('female', 'VEGA', 'SOC Analyst'));
  s.appendChild(cards);
  return s;
}

export function missionSelect(onPick: (id: string) => void): HTMLElement {
  const s = el('div', 'screen mission-select');
  s.appendChild(el('h2', '', 'SELECT MISSION'));
  s.appendChild(el('div', 'playable-coverage', playableCoverageLine()));
  const missions = missionRegistry.all();
  const orderedIds = missions.map((m) => m.id);
  const states = missionRowStates(orderedIds);
  let nextRow: HTMLElement | null = null;
  for (const m of missions) {
    const state = states.get(m.id) ?? 'locked';
    const unlocked = state !== 'locked';
    const row = el('div', `mission-row ${state}`);
    row.appendChild(el('span', 'diff', '☣'.repeat(Math.min(3, Math.ceil(m.difficulty / 3)))));
    const body = el('div');
    const badge =
      state === 'cleared' ? ' — CLEARED'
      : state === 'next' ? ' — NEXT'
      : state === 'locked' ? ' — LOCKED'
      : '';
    body.appendChild(el('div', 'mtitle', `M${m.id.slice(1)} — ${m.title}${badge}`));
    body.appendChild(
      el(
        'div',
        'objs',
        m.objectives
          .map((id) => `${id} ${objectiveById(id)?.title ?? ''}`)
          .join('<br>'),
      ),
    );
    row.appendChild(body);
    row.setAttribute('aria-disabled', String(!unlocked));
    if (unlocked) row.addEventListener('click', () => onPick(m.id));
    if (state === 'next') nextRow = row;
    s.appendChild(row);
  }
  // Keep the heading visible and scroll the NEXT row into view on open:
  // if NEXT fits on the first screen, stay at scrollTop 0 (heading visible);
  // otherwise scroll so NEXT is visible with a couple of rows of context.
  requestAnimationFrame(() => {
    if (!nextRow) {
      s.scrollTop = 0;
      return;
    }
    const viewH = s.clientHeight || globalThis.innerHeight || 0;
    if (nextRow.offsetTop + nextRow.offsetHeight <= viewH) {
      s.scrollTop = 0;
    } else {
      s.scrollTop = Math.max(0, nextRow.offsetTop - 96);
    }
  });
  return s;
}

/** DEPLOY pressed before background prep finished: Doom-style plate while the last steps run. */
export function loadingScreen(): HTMLElement {
  const s = el('div', 'screen cd-inter');
  const inner = el('div', 'cd-loading-plate');
  inner.appendChild(el('h1', '', 'LOADING SECTOR…'));
  inner.appendChild(el('p', '', 'STAND BY'));
  s.appendChild(inner);
  return s;
}

export { briefing } from './briefing';
export { debrief } from './debrief';
