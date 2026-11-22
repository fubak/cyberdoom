import { h, bigButton } from './briefing';
import { nextStep, SENS_STEPS, type Settings } from './settings';
import { skillById } from '../missions/difficulty';
import { keyLabel, resolveBindings, type Action } from '../engine/bindings';

const VOLUME_STEPS = [1, 0.7, 0.4, 0.15, 0];

/**
 * In-mission hold. Resume returns to play, restart redeploys the same
 * mission, and mission select leaves without finishing. Escape is handled
 * by the game (resume) so this menu does not also see that key.
 */
export function pauseMenu(actions: {
  onResume: () => void;
  onControls: () => void;
  onRestart: () => void;
  onQuit: () => void;
  settings: Settings;
  onSettings: (next: Settings) => void;
}): HTMLElement {
  const s = h('div', 'screen cd-inter cd-pause');
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-modal', 'true');
  s.setAttribute('aria-label', 'Paused');
  s.appendChild(h('div', 'cd-kicker', 'SECTOR HOLD'));
  s.appendChild(h('h1', 'cd-title', 'PAUSED'));

  const items: { id: string; label: string; go: () => void; alt: boolean }[] = [
    { id: 'resume', label: 'RESUME  [ESC]', go: actions.onResume, alt: false },
    { id: 'controls', label: 'CONTROLS', go: actions.onControls, alt: true },
    { id: 'restart', label: 'RESTART MISSION', go: actions.onRestart, alt: true },
    { id: 'quit', label: 'MISSION SELECT', go: actions.onQuit, alt: true },
  ];
  const row = h('div', 'cd-brief-actions');
  const buttons = items.map((item) => {
    const b = bigButton(item.label, item.go, item.alt ? 'cd-btn alt' : 'cd-btn');
    b.type = 'button';
    b.dataset.menuItem = item.id;
    row.appendChild(b);
    return b;
  });
  s.appendChild(row);

  let settings = { ...actions.settings };
  const settingButtons: { button: HTMLButtonElement; label: () => string }[] = [];
  const addSetting = (
    id: string,
    label: () => string,
    update: (current: Settings) => Settings,
  ) => {
    const b = bigButton(label(), () => {
      settings = update(settings);
      actions.onSettings({ ...settings });
      for (const item of settingButtons) item.button.textContent = item.label();
    }, 'cd-btn alt');
    b.type = 'button';
    b.dataset.menuItem = id;
    row.appendChild(b);
    buttons.push(b);
    settingButtons.push({ button: b, label });
  };
  const volumeLabel = (name: string, value: number) =>
    `${name} ${value <= 0.001 ? 'MUTED' : `${Math.round(value * 100)}%`}`;
  addSetting('music', () => volumeLabel('MUSIC', settings.musicVol), (current) => ({
    ...current,
    musicVol: nextStep(VOLUME_STEPS, current.musicVol),
  }));
  addSetting('sensitivity', () => `SENSITIVITY x${settings.sensitivity.toFixed(2)}`, (current) => ({
    ...current,
    sensitivity: nextStep(SENS_STEPS, current.sensitivity),
  }));
  addSetting('sfx', () => volumeLabel('SFX', settings.sfxVol), (current) => ({
    ...current,
    sfxVol: nextStep(VOLUME_STEPS, current.sfxVol),
  }));
  addSetting('view-bob', () => `VIEW BOB ${settings.viewBob ? 'ON' : 'OFF'}`, (current) => ({
    ...current,
    viewBob: !current.viewBob,
  }));

  const help = h('ul', 'cd-pause-help');
  const bindings = resolveBindings(settings.bindings);
  const key = (action: Action) => [...new Set(bindings[action].map(keyLabel))].join('/') || '—';
  for (const line of [
    `${key('forward')}/${key('back')} MOVE  ·  ${key('strafeLeft')}/${key('strafeRight')} STRAFE`,
    `${key('turnLeft')}/${key('turnRight')} TURN  ·  ${key('run')} RUN`,
    `CLICK TO LOOK  ·  LMB/${key('fire')} USE TOOL  ·  ${key('use')} INTERACT`,
    `1-9 / WHEEL / ${key('cycle')} SWITCH TOOL`,
    `TAB OBJECTIVES  ·  ${key('map')} MAP  ·  ${key('log')} EVIDENCE LOG`,
    `SKILL: ${skillById(settings.skill).label}`,
    'F5 QUICKSAVE / F9 QUICKLOAD',
    'ESC PAUSES, OR STEPS BACK THROUGH MENUS',
  ]) {
    help.appendChild(h('li', '', line));
  }
  s.appendChild(help);

  let sel = 0;
  const focusSel = () => buttons[sel]?.focus();
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
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => focusSel());
  return s;
}
