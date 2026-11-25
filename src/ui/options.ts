import { h, bigButton, pixelTitle } from './briefing';
import { RAMP } from './debrief';
import { consoleFrame } from './menuArt';
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

/** Meter beside an option: `lit` of `of` pips. A toggle is a one-pip meter. */
export interface OptionMeter {
  lit: number;
  of: number;
  kind: 'steps' | 'toggle';
}

export interface OptionItem {
  id: string;
  name: string;
  value: (s: Settings) => string;
  meter: (s: Settings) => OptionMeter;
  /** Full row text, "NAME VALUE": what a screen reader and the tests read. */
  label: (s: Settings) => string;
  next: (s: Settings) => Settings;
}

export function horizontalFovDeg(verticalDeg: number, aspect: number): number {
  const half = (verticalDeg * Math.PI) / 360;
  return Math.round((2 * Math.atan(Math.tan(half) * aspect) * 180) / Math.PI);
}

/**
 * Pips for a stepped setting: one per non-zero step, lit up to the current
 * value. A value between steps lights the steps at or below it.
 */
export function stepMeter(steps: readonly number[], value: number): OptionMeter {
  const levels = [...new Set(steps)].filter((step) => step > 0.001).sort((a, b) => a - b);
  return { lit: levels.filter((step) => step <= value + 0.001).length, of: levels.length, kind: 'steps' };
}

const toggleMeter = (on: boolean): OptionMeter => ({ lit: on ? 1 : 0, of: 1, kind: 'toggle' });
const volumeValue = (value: number) => (value <= 0.001 ? 'MUTED' : `${Math.round(value * 100)}%`);
const onOff = (value: boolean) => (value ? 'ON' : 'OFF');

type OptionSpec = Omit<OptionItem, 'label'>;

function toggle(id: string, name: string, key: 'viewBob' | 'colorBlind' | 'reducedFlash'): OptionSpec {
  return {
    id,
    name,
    value: (s) => onOff(s[key]),
    meter: (s) => toggleMeter(s[key]),
    next: (s) => ({ ...s, [key]: !s[key] }),
  };
}

export function optionItems(): OptionItem[] {
  const specs: OptionSpec[] = [
    {
      id: 'music',
      name: 'MUSIC',
      value: (s) => volumeValue(s.musicVol),
      meter: (s) => stepMeter(VOLUME_STEPS, s.musicVol),
      next: (s) => ({ ...s, musicVol: nextStep(VOLUME_STEPS, s.musicVol) }),
    },
    {
      id: 'sfx',
      name: 'SFX',
      value: (s) => volumeValue(s.sfxVol),
      meter: (s) => stepMeter(VOLUME_STEPS, s.sfxVol),
      next: (s) => ({ ...s, sfxVol: nextStep(VOLUME_STEPS, s.sfxVol) }),
    },
    {
      id: 'sensitivity',
      name: 'SENSITIVITY',
      value: (s) => `x${s.sensitivity.toFixed(2)}`,
      meter: (s) => stepMeter(SENS_STEPS, s.sensitivity),
      next: (s) => ({ ...s, sensitivity: nextStep(SENS_STEPS, s.sensitivity) }),
    },
    {
      id: 'fov',
      name: 'FIELD OF VIEW',
      value: (s) => String(horizontalFovDeg(s.fov, VIEW_ASPECT)),
      meter: (s) => stepMeter(FOV_STEPS, s.fov),
      next: (s) => ({ ...s, fov: nextStep(FOV_STEPS, s.fov) }),
    },
    toggle('view-bob', 'VIEW BOB', 'viewBob'),
    toggle('color-blind', 'COLOR-BLIND', 'colorBlind'),
    toggle('reduced-flash', 'REDUCED FLASHING', 'reducedFlash'),
  ];
  return specs.map((spec) => ({ ...spec, label: (s) => `${spec.name} ${spec.value(s)}` }));
}

/** Row content: name, a pip meter and the value. The text reads "NAME VALUE". */
function optionRowContent(item: OptionItem, s: Settings): Node[] {
  const meter = item.meter(s);
  const pips = h('span', `cd-opt-meter ${meter.kind}`);
  pips.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < meter.of; i++) pips.appendChild(h('span', i < meter.lit ? 'cd-opt-pip on' : 'cd-opt-pip'));
  return [h('span', 'cd-opt-name', item.name), document.createTextNode(' '), pips, h('span', 'cd-opt-val', item.value(s))];
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
  const frame = consoleFrame();
  screen.appendChild(frame);
  frame.appendChild(h('div', 'cd-kicker', props.kicker));
  frame.appendChild(pixelTitle('h1', 'cd-title', 'OPTIONS', RAMP.red, 4));

  const mountedAt = performance.now();
  const fresh = (event: MouseEvent) => event.detail === 0 && performance.now() - mountedAt < OPEN_GUARD_MS;
  let settings: Settings = { ...props.settings };
  const row = h('div', 'cd-brief-actions cd-options-list');
  const buttons: HTMLButtonElement[] = [];
  const entries = optionItems().map((item) => {
    const button = bigButton('', () => undefined, 'cd-btn alt cd-setting');
    button.replaceChildren(...optionRowContent(item, settings));
    button.type = 'button';
    button.dataset.menuItem = item.id;
    return { item, button };
  });
  const refresh = () => {
    for (const { item, button } of entries) button.replaceChildren(...optionRowContent(item, settings));
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
  frame.appendChild(row);

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
