import {
  ACTION_LABELS,
  keyLabel,
  rebind,
  resolveBindings,
  type Action,
} from '../engine/bindings';
import { h, bigButton, pixelTitle } from './briefing';
import { RAMP } from './debrief';

const ACTIONS = Object.keys(ACTION_LABELS) as Action[];

export function controlsPanel(
  initial: Partial<Record<Action, string[]>>,
  onBindings: (bindings: Partial<Record<Action, string[]>>) => void,
  onBack: () => void,
): HTMLElement {
  const screen = h('div', 'screen cd-inter cd-pause cd-controls');
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Controls');
  screen.dataset.controlsPanel = 'true';
  screen.appendChild(h('div', 'cd-kicker', 'INPUT CONFIGURATION'));
  screen.appendChild(pixelTitle('h1', 'cd-title', 'CONTROLS', RAMP.red, 4));
  screen.appendChild(h('p', 'cd-controls-instruction', 'SELECT AN ACTION TO CHANGE ITS KEY'));

  let bindings = resolveBindings(initial);
  let capture: Action | null = null;
  let selected = 0;
  const rows = h('div', 'cd-controls-list');
  const rowButtons = new Map<Action, HTMLButtonElement>();
  const note = h('p', 'cd-controls-note', '');

  const rowLabel = (action: Action) => {
    if (capture === action) return 'PRESS A KEY  (ESC CANCELS)';
    const keys = [...new Set(bindings[action].map(keyLabel))].join(' / ') || 'UNBOUND';
    return `${ACTION_LABELS[action]}  ......  ${keys}`;
  };
  const refreshRows = () => {
    for (const [action, button] of rowButtons) button.textContent = rowLabel(action);
  };
  const beginCapture = (action: Action) => {
    capture = action;
    selected = ACTIONS.indexOf(action);
    note.textContent = '';
    refreshRows();
    rowButtons.get(action)?.focus();
  };

  const buttons: HTMLButtonElement[] = [];
  for (const action of ACTIONS) {
    const button = bigButton(rowLabel(action), () => beginCapture(action), 'cd-btn alt cd-control-row');
    button.type = 'button';
    button.dataset.action = action;
    button.dataset.menuItem = action;
    rows.appendChild(button);
    rowButtons.set(action, button);
    buttons.push(button);
  }
  screen.appendChild(rows);
  screen.appendChild(note);

  const footer = h('div', 'cd-controls-actions');
  const reset = bigButton('RESET DEFAULTS', () => {
    capture = null;
    selected = ACTIONS.length;
    bindings = resolveBindings({});
    note.textContent = 'DEFAULTS RESTORED.';
    refreshRows();
    onBindings({});
  }, 'cd-btn alt');
  reset.type = 'button';
  reset.dataset.menuItem = 'reset-defaults';
  const back = bigButton('BACK', onBack, 'cd-btn');
  back.type = 'button';
  back.dataset.menuItem = 'back';
  footer.append(reset, back);
  screen.appendChild(footer);
  buttons.push(reset, back);

  const focusSelected = () => buttons[selected]?.focus();
  const onKeyDown = (event: KeyboardEvent) => {
    if (!screen.isConnected) {
      window.removeEventListener('keydown', onKeyDown, true);
      return;
    }
    if (capture) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') {
        capture = null;
        note.textContent = '';
        refreshRows();
        return;
      }
      if (/^(Digit|Numpad)[1-9]$/.test(event.code)) {
        note.textContent = 'SLOT NUMBER KEYS STAY FIXED.';
        return;
      }
      if (event.code === 'Tab') {
        note.textContent = 'TAB STAYS FIXED.';
        return;
      }
      bindings = rebind(bindings, capture, event.code);
      capture = null;
      note.textContent = '';
      refreshRows();
      onBindings(bindings);
      return;
    }
    if (event.repeat) return;
    const down = event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 's' || event.key === 'S';
    const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'w' || event.key === 'W';
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      onBack();
      return;
    }
    if (down || up) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selected = (selected + (down ? 1 : buttons.length - 1)) % buttons.length;
      focusSelected();
      return;
    }
    event.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKeyDown, true);
  requestAnimationFrame(focusSelected);
  return screen;
}
