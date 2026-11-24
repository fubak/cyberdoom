import { h, bigButton, pixelTitle } from './briefing';
import { RAMP } from './debrief';
import { FOV_STEPS, nextStep, SENS_STEPS, type Settings } from './settings';

/**
 * OPTIONS panel, shared by the title menu and the pause menu. The item list
 * is pure data (label + immutable step) so it is unit tested without a DOM;
 * optionsPanel() only lays the items out as buttons and handles keys.
 */
export const VOLUME_STEPS = [1, 0.7, 0.4, 0.15, 0] as const;
/** The 3D view is 1280x672 (render/res VIEW_W x VIEW3D_H). */
const VIEW_ASPECT = 1280 / 672;
/** Keyboard-made clicks this soon after mount belong to the key that opened the panel. */
const OPEN_GUARD_MS = 350;

export interface OptionItem {
  id: string;
  label: (s: Settings) => string;
  next: (s: Settings) => Settings;
}

export function horizontalFovDeg(verticalDeg: number, aspect: number): number {
  const half = (verticalDeg * Math.PI) / 360;
  return Math.round((2 * Math.atan(Math.tan(half) * aspect) * 180) / Math.PI);
}

const volumeLabel = (name: string, value: number) =>
  `${name} ${value <= 0.001 ? 'MUTED' : `${Math.round(value * 100)}%`}`;
const onOff = (value: boolean) => (value ? 'ON' : 'OFF');

export function optionItems(): OptionItem[] {
  return [
    {
      id: 'music',
      label: (s) => volumeLabel('MUSIC', s.musicVol),
      next: (s) => ({ ...s, musicVol: nextStep(VOLUME_STEPS, s.musicVol) }),
    },
    {
      id: 'sfx',
      label: (s) => volumeLabel('SFX', s.sfxVol),
      next: (s) => ({ ...s, sfxVol: nextStep(VOLUME_STEPS, s.sfxVol) }),
    },
    {
      id: 'sensitivity',
      label: (s) => `SENSITIVITY x${s.sensitivity.toFixed(2)}`,
      next: (s) => ({ ...s, sensitivity: nextStep(SENS_STEPS, s.sensitivity) }),
    },
    {
      id: 'fov',
      label: (s) => `FIELD OF VIEW ${horizontalFovDeg(s.fov, VIEW_ASPECT)}`,
      next: (s) => ({ ...s, fov: nextStep(FOV_STEPS, s.fov) }),
    },
    {
      id: 'view-bob',
      label: (s) => `VIEW BOB ${onOff(s.viewBob)}`,
      next: (s) => ({ ...s, viewBob: !s.viewBob }),
    },
    {
      id: 'color-blind',
      label: (s) => `COLOR-BLIND ${onOff(s.colorBlind)}`,
      next: (s) => ({ ...s, colorBlind: !s.colorBlind }),
    },
    {
      id: 'reduced-flash',
      label: (s) => `REDUCED FLASHING ${onOff(s.reducedFlash)}`,
      next: (s) => ({ ...s, reducedFlash: !s.reducedFlash }),
    },
  ];
}

export interface OptionsPanelProps {
  settings: Settings;
  onSettings: (next: Settings) => void;
  onBack: () => void;
  kicker: string;
}

export function optionsPanel(props: OptionsPanelProps): HTMLElement {
  const screen = h('div', 'screen cd-inter cd-pause cd-options');
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Options');
  screen.dataset.optionsPanel = 'true';
  screen.appendChild(h('div', 'cd-kicker', props.kicker));
  screen.appendChild(pixelTitle('h1', 'cd-title', 'OPTIONS', RAMP.red, 4));

  const mountedAt = performance.now();
  const fresh = (event: MouseEvent) => event.detail === 0 && performance.now() - mountedAt < OPEN_GUARD_MS;
  let settings: Settings = { ...props.settings };
  const row = h('div', 'cd-brief-actions cd-options-list');
  const buttons: HTMLButtonElement[] = [];
  const entries = optionItems().map((item) => {
    const button = bigButton(item.label(settings), () => undefined, 'cd-btn alt');
    button.type = 'button';
    button.dataset.menuItem = item.id;
    return { item, button };
  });
  const refresh = () => {
    for (const { item, button } of entries) button.textContent = item.label(settings);
  };
  for (const { item, button } of entries) {
    button.addEventListener('click', (event) => {
      if (fresh(event)) return;
      settings = item.next(settings);
      refresh();
      props.onSettings({ ...settings });
    });
    row.appendChild(button);
    buttons.push(button);
  }
  const back = bigButton('BACK  [ESC]', () => undefined, 'cd-btn');
  back.type = 'button';
  back.dataset.menuItem = 'options-back';
  back.addEventListener('click', (event) => {
    if (!fresh(event)) props.onBack();
  });
  row.appendChild(back);
  buttons.push(back);
  screen.appendChild(row);

  let selected = 0;
  const focusSelected = () => buttons[selected]?.focus();
  const onKeyDown = (event: KeyboardEvent) => {
    if (!screen.isConnected) {
      window.removeEventListener('keydown', onKeyDown, true);
      return;
    }
    if (event.repeat) return;
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.removeEventListener('keydown', onKeyDown, true);
      props.onBack();
      return;
    }
    const down = event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 's' || event.key === 'S';
    const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'w' || event.key === 'W';
    if (down || up) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (current >= 0) selected = current;
      selected = (selected + (down ? 1 : buttons.length - 1)) % buttons.length;
      focusSelected();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);
  requestAnimationFrame(focusSelected);
  return screen;
}
