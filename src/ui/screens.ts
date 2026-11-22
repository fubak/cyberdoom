import type { Gender, Mission } from '../core/types';
import { missionRegistry, teachingRegistry } from '../content/missions';
import { episodeForMission, realCaseForMission } from '../content/story';
import { objectiveById } from '../content/objectives';
import { missionRowStates } from '../missions/progress';
import { mountTitle } from '../render/title';
import { bigButton, onKeysWhileMounted } from './briefing';

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

export function titleScreen(onStart: () => void, onMissions?: () => void): HTMLElement {
  const s = el('div', 'screen title');
  mountTitle(s, onStart, [
    'MERIDIAN FREIGHT IS UNDER ATTACK BY GHOSTLEDGER.',
    'YOUR WEAPONS ARE IR TOOLS: KEYBOARD, MOUSE, USB SCANNER, TAP,',
    'EDR, PATCH DISK, FIREWALL BLASTER. BADGE & MFA SWIPE AT DOORS.',
    'CONTAIN MALWARE. ENFORCE LEAST PRIVILEGE. STOP THE BREACH.',
    '',
    'WASD MOVE - MOUSE LOOK - ARROWS TURN - SHIFT RUN',
    'LMB USE TOOL - E/SPACE INTERACT - 1-9 / WHEEL / Q SELECT TOOL',
    '',
    'PRESS ANY KEY OR CLICK TO GO BACK',
  ], onMissions);
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

export interface MissionSelectCard {
  id: string;
  code: string;
  title: string;
  tagline: string;
  threatLevel: number;
  threatLabel: string;
  objectives: string[];
}

export function missionSelectCard(m: Mission): MissionSelectCard {
  const threatLevel = Math.max(1, Math.min(3, Math.ceil(m.difficulty / 3)));
  const threatLabel = threatLevel === 1 ? 'LOW' : threatLevel === 2 ? 'MED' : 'HIGH';
  const tagline = teachingRegistry.get(m.id)?.tagline ?? m.briefing.split('\n')[0];
  return {
    id: m.id,
    code: `M${m.id.slice(1)}`,
    title: m.title,
    tagline,
    threatLevel,
    threatLabel,
    objectives: m.objectives.map((id) => `${id} ${objectiveById(id)?.title ?? ''}`.trim()),
  };
}

export function missionSelect(onPick: (id: string) => void, onBack: () => void): HTMLElement {
  const s = el('div', 'screen mission-select cd-mission-select');
  const bar = el('div', 'menu-bar');
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn small';
  back.dataset.menuItem = 'back';
  back.textContent = 'BACK [ESC]';
  back.addEventListener('click', onBack);
  bar.appendChild(back);
  const missions = missionRegistry.all();
  const orderedIds = missions.map((m) => m.id);
  const states = missionRowStates(orderedIds);
  const clearedCount = orderedIds.filter((id) => states.get(id) === 'cleared').length;
  bar.appendChild(el('h2', '', 'SELECT MISSION'));
  bar.appendChild(el('div', 'playable-coverage', `MERIDIAN FREIGHT CAMPAIGN · ${clearedCount}/${orderedIds.length} SECTORS CLEARED`));
  s.appendChild(bar);

  const layout = el('div', 'mission-layout');
  const listWrap = el('div', 'mission-list');
  const detail = el('aside', 'mission-detail');
  layout.appendChild(listWrap);
  layout.appendChild(detail);
  s.appendChild(layout);

  const renderDetail = (m: Mission) => {
    const card = missionSelectCard(m);
    const state = states.get(m.id) ?? 'locked';
    const ep = episodeForMission(m.id);
    const realCase = realCaseForMission(m.id);
    detail.innerHTML = '';
    if (ep) detail.appendChild(el('div', 'detail-kicker', ep.title));
    detail.appendChild(el('div', 'detail-kicker', `SECTOR INTEL // ${card.code} // THREAT ${card.threatLabel}`));
    detail.appendChild(el('div', 'detail-title', card.title));
    detail.appendChild(el('div', 'detail-tagline', card.tagline));
    detail.appendChild(el('div', 'detail-state', `STATUS: ${state.toUpperCase()}`));
    if (realCase) {
      detail.appendChild(el('div', 'detail-kicker', `BASED ON (${realCase.year})`));
      detail.appendChild(el('div', 'detail-tagline', realCase.name));
    }
    const head = el('div', 'detail-kicker', 'SY0-701 OBJECTIVES');
    detail.appendChild(head);
    const ul = el('ul', 'detail-objs');
    for (const line of card.objectives) {
      ul.appendChild(el('li', '', line));
    }
    detail.appendChild(ul);
  };

  let nextRow: HTMLButtonElement | null = null;
  let initialMission: Mission = missions[0];
  for (const m of missions) {
    const card = missionSelectCard(m);
    const state = states.get(m.id) ?? 'locked';
    const unlocked = state !== 'locked';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `mission-row ${state}`;
    row.disabled = !unlocked;
    row.dataset.missionId = m.id;
    const threat = el('span', `diff threat-${card.threatLevel}`);
    threat.textContent = '!'.repeat(card.threatLevel);
    threat.title = `Threat: ${card.threatLabel}`;
    row.appendChild(threat);
    const body = el('div', 'mrow-body');
    const head = el('div', 'mhead');
    head.appendChild(el('span', 'mtitle', `${card.code} — ${card.title}`));
    const badgeText =
      state === 'cleared' ? 'CLEARED'
      : state === 'next' ? 'NEXT'
      : state === 'locked' ? 'LOCKED'
      : 'OPEN';
    head.appendChild(el('span', `mstate ${state}`, badgeText));
    body.appendChild(head);
    body.appendChild(el('div', 'mtagline', card.tagline));
    row.appendChild(body);
    row.addEventListener('mouseenter', () => renderDetail(m));
    row.addEventListener('focus', () => renderDetail(m));
    if (unlocked) row.addEventListener('click', () => onPick(m.id));
    if (state === 'next') {
      nextRow = row;
      initialMission = m;
    }
    listWrap.appendChild(row);
  }
  if (initialMission) renderDetail(initialMission);
  onKeysWhileMounted(s, (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      onBack();
      return;
    }
    const list = [...s.querySelectorAll<HTMLButtonElement>('button.mission-row:not(:disabled)')];
    if (!list.length) return;
    const current = list.findIndex((row) => row === document.activeElement);
    const down = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
    const up = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
    if (down || up) {
      e.preventDefault();
      const index = current < 0 ? 0 : (current + (down ? 1 : list.length - 1)) % list.length;
      list[index]?.focus();
    }
  });
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
    const focusRow = nextRow ?? s.querySelector<HTMLButtonElement>('button.mission-row:not(:disabled)');
    focusRow?.focus({ preventScroll: true });
  });
  return s;
}

/** DEPLOY pressed before background prep finished: Doom-style plate while the last steps run. */
export function loadingScreen(onAbort: () => void): HTMLElement {
  const s = el('div', 'screen cd-inter');
  const inner = el('div', 'cd-loading-plate');
  inner.appendChild(el('h1', '', 'LOADING SECTOR…'));
  inner.appendChild(el('p', '', 'STAND BY'));
  const abort = bigButton('ABORT  [ESC]', onAbort, 'cd-btn alt');
  abort.type = 'button';
  abort.dataset.menuItem = 'abort';
  inner.appendChild(abort);
  s.appendChild(inner);
  onKeysWhileMounted(s, (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      onAbort();
    }
  });
  return s;
}

export { briefing } from './briefing';
export { debrief } from './debrief';
