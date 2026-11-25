import { h, bigButton, pixelTitle } from './briefing';
import { RAMP } from './debrief';
import { consoleFrame } from './menuArt';
import type { Settings } from './settings';
import { skillById } from '../missions/difficulty';
import { keyLabel, resolveBindings, type Action } from '../engine/bindings';

/**
 * In-mission hold. Resume returns to play, restart redeploys the same
 * mission, and mission select leaves without finishing. Options and Controls
 * swap in the shared panels (ui/options.ts, ui/controls.ts). Escape is handled
 * by the game (resume) so this menu does not also see that key.
 */
export function pauseMenu(actions: {
  onResume: () => void;
  onControls: () => void;
  onOptions: () => void;
  onRestart: () => void;
  onQuit: () => void;
  settings: Settings;
}): HTMLElement {
  const s = h('div', 'screen cd-inter cd-pause');
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-modal', 'true');
  s.setAttribute('aria-label', 'Paused');

  const settings = actions.settings;
  let buttons: HTMLButtonElement[] = [];
  let sel = 0;

  const focusSel = () => buttons[sel]?.focus();

  const render = () => {
    s.replaceChildren();
    buttons = [];
    sel = 0;

    const frame = consoleFrame();
    s.appendChild(frame);
    frame.appendChild(h('div', 'cd-kicker', 'SECTOR HOLD'));
    frame.appendChild(pixelTitle('h1', 'cd-title', 'PAUSED', RAMP.red, 4));

    const items: { id: string; label: string; go: () => void; alt: boolean }[] = [
      { id: 'resume', label: 'RESUME  [ESC]', go: actions.onResume, alt: false },
      { id: 'options', label: 'OPTIONS', go: actions.onOptions, alt: true },
      { id: 'controls', label: 'CONTROLS', go: actions.onControls, alt: true },
      { id: 'restart', label: 'RESTART MISSION', go: actions.onRestart, alt: true },
      { id: 'quit', label: 'MISSION SELECT', go: actions.onQuit, alt: true },
    ];
    const row = h('div', 'cd-brief-actions');
    buttons = items.map((item) => {
      const b = bigButton(item.label, item.go, item.alt ? 'cd-btn alt' : 'cd-btn');
      b.type = 'button';
      b.dataset.menuItem = item.id;
      row.appendChild(b);
      return b;
    });
    frame.appendChild(row);

    const help = h('ul', 'cd-pause-help');
    const bindings = resolveBindings(settings.bindings);
    const key = (action: Action) => [...new Set(bindings[action].map(keyLabel))].join('/') || '—';
    for (const line of [
      `${key('forward')}/${key('back')} MOVE · ${key('strafeLeft')}/${key('strafeRight')} STRAFE`,
      `${key('turnLeft')}/${key('turnRight')} TURN · ${key('run')} RUN`,
      `LMB/${key('fire')} TOOL · ${key('use')} INTERACT`,
      `1-9 / WHEEL / ${key('cycle')} SWITCH TOOL`,
      `TAB OBJECTIVES · ${key('map')} MAP · ${key('log')} LOG`,
      `F5 QUICKSAVE / F9 QUICKLOAD · ${skillById(settings.skill).label}`,
    ]) {
      help.appendChild(h('li', '', line));
    }
    frame.appendChild(help);
    requestAnimationFrame(() => focusSel());
  };

  const onKey = (e: KeyboardEvent) => {
    if (!s.isConnected) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    if (e.repeat) return;
    const down = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 's' || e.key === 'S';
    const up = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'w' || e.key === 'W';
    if (down || up) {
      e.preventDefault();
      sel = (sel + (down ? 1 : buttons.length - 1)) % buttons.length;
      focusSel();
    }
  };
  window.addEventListener('keydown', onKey, true);
  render();
  return s;
}
