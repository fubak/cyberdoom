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
  const idx = arcIndex(mission.id);
  const orders = teach?.orders ?? mission.missionObjectives.map((o) => ({ text: o.text, objective: '' }));
  const s = h('div', 'screen cd-inter cd-briefing');
  let detailsOpen = false;
  const kicker = `MISSION ${idx + 1}/${ARC.length} · THREAT LEVEL ${'☣'.repeat(Math.max(1, Math.ceil(mission.difficulty / 3)))}`;

  const render = () => {
    s.replaceChildren();
    if (!detailsOpen) {
      const page = h('div', 'cd-briefing-page');
      page.appendChild(h('div', 'cd-kicker', kicker));
      page.appendChild(h('h1', 'cd-title cd-brief-title', mission.title));
      page.appendChild(h('div', 'cd-brief-tagline', teach?.tagline ?? mission.title));
      const ol = h('ol', 'cd-brief-orders');
      for (const order of orders.slice(0, 3)) ol.appendChild(h('li', '', order.text));
      page.appendChild(ol);
      const buttons = h('div', 'cd-brief-actions');
      buttons.appendChild(bigButton('DETAILS  [D]', () => {
        detailsOpen = true;
        render();
      }, 'cd-btn alt'));
      buttons.appendChild(bigButton('DEPLOY  [ENTER]', onGo));
      page.appendChild(buttons);
      s.appendChild(page);
    } else {
      const page = h('div', 'cd-briefing-page cd-briefing-details-page');
      page.appendChild(h('div', 'cd-kicker', `${kicker} · DETAILS`));
      page.appendChild(h('h1', 'cd-title cd-details-title', 'DETAILS'));
      const grid = h('div', 'cd-brief-details');
      const situation = h('section', 'cd-panel');
      situation.appendChild(h('h3', '', 'SITUATION'));
      situation.appendChild(h('p', 'cd-body', teach?.situation ?? mission.briefing));
      situation.appendChild(h('h3', '', 'ALL ORDERS'));
      const ol = h('ol', 'cd-orders');
      for (const order of orders) ol.appendChild(h('li', '', order.text));
      situation.appendChild(ol);
      grid.appendChild(situation);

      const intel = h('section', 'cd-panel cd-intel');
      intel.appendChild(h('h3', '', 'SY0-701 OBJECTIVES'));
      for (const id of mission.objectives) {
        const objective = objectiveById(id);
        if (!objective) continue;
        const row = h('div', 'cd-obj');
        row.appendChild(h('span', `cd-chip d${objective.domain}`, id));
        row.appendChild(h('span', '', objective.title));
        row.title = domainById(objective.domain)?.title ?? '';
        intel.appendChild(row);
      }
      if (teach?.keyTerms.length) {
        intel.appendChild(h('h3', '', 'KEY TERMS'));
        const dl = h('dl', 'cd-terms');
        for (const term of teach.keyTerms) {
          const definition = define(term);
          if (!definition) continue;
          dl.appendChild(h('dt', '', term.toUpperCase()));
          dl.appendChild(h('dd', '', definition.replace(/\s*\[[\d., ]+\]\s*$/, '')));
        }
        intel.appendChild(dl);
      }
      grid.appendChild(intel);
      page.appendChild(grid);
      const buttons = h('div', 'cd-brief-actions');
      buttons.appendChild(bigButton('BACK  [D/ESC]', () => {
        detailsOpen = false;
        render();
      }, 'cd-btn alt'));
      buttons.appendChild(bigButton('DEPLOY  [ENTER]', onGo));
      page.appendChild(buttons);
      s.appendChild(page);
    }
  };

  render();
  onKeysWhileMounted(s, (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onGo();
    } else if (e.key.toLowerCase() === 'd' || (e.key === 'Escape' && detailsOpen)) {
      e.preventDefault();
      detailsOpen = !detailsOpen;
      render();
    }
  });
  return s;
}
