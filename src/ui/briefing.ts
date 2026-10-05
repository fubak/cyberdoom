import type { Mission } from '../core/types';
import { ARC, arcIndex } from '../content/curriculum';
import { define } from '../content/glossary';
import { teachingRegistry } from '../content/missions';
import { domainById, objectiveById } from '../content/objectives';
import './curriculum.css';

/**
 * CURRICULUM: mission briefing, styled as a Doom-like intermission. It sets up
 * the situation and the tools but never tells the player the answer.
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

export function briefing(mission: Mission, onGo: () => void): HTMLElement {
  const teach = teachingRegistry.get(mission.id);
  const s = h('div', 'screen cd-inter');
  const idx = arcIndex(mission.id);
  const head = h('div', 'cd-kicker',
    `MISSION ${String(idx + 1).padStart(2, '0')} OF ${ARC.length}  ·  THREAT LEVEL ${'☣'.repeat(Math.max(1, Math.ceil(mission.difficulty / 3)))}`);
  s.appendChild(head);
  s.appendChild(h('h1', 'cd-title', mission.title));

  const grid = h('div', 'cd-grid');
  const left = h('div', 'cd-panel');
  left.appendChild(h('h3', '', 'SITUATION'));
  left.appendChild(h('p', 'cd-body', mission.briefing));
  left.appendChild(h('h3', '', 'OBJECTIVES'));
  const ol = h('ol', 'cd-orders');
  const orders = teach?.orders ?? mission.missionObjectives.map((o) => ({ text: o.text, objective: '' }));
  for (const o of orders) {
    const li = h('li', '', o.text);
    ol.appendChild(li);
  }
  left.appendChild(ol);
  grid.appendChild(left);

  const right = h('div', 'cd-panel cd-intel');
  right.appendChild(h('h3', '', 'SY0-701 ON THE LINE'));
  for (const id of mission.objectives) {
    const o = objectiveById(id);
    if (!o) continue;
    const row = h('div', 'cd-obj');
    row.appendChild(h('span', `cd-chip d${o.domain}`, id));
    row.appendChild(h('span', '', o.title));
    row.title = domainById(o.domain)?.title ?? '';
    right.appendChild(row);
  }
  if (teach?.keyTerms.length) {
    right.appendChild(h('h3', '', 'FIELD MANUAL'));
    const dl = h('dl', 'cd-terms');
    for (const t of teach.keyTerms) {
      const def = define(t);
      if (!def) continue;
      dl.appendChild(h('dt', '', t.toUpperCase()));
      dl.appendChild(h('dd', '', def.replace(/\s*\[[\d., ]+\]\s*$/, '')));
    }
    right.appendChild(dl);
  }
  grid.appendChild(right);
  s.appendChild(grid);

  s.appendChild(bigButton('DEPLOY ▸  [ENTER]', onGo));
  onKeysWhileMounted(s, (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onGo();
    }
  });
  return s;
}
