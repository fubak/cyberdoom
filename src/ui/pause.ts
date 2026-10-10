import { h, bigButton } from './briefing';

/**
 * In-mission hold. Resume returns to play, restart redeploys the same
 * mission, and mission select leaves without finishing. Escape is handled
 * by the game (resume) so this menu does not also see that key.
 */
export function pauseMenu(actions: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  /** Music volume 0-1 shown on the MUSIC button; click cycles the level. */
  musicVol?: number;
  onMusicVol?: (v: number) => void;
}): HTMLElement {
  const s = h('div', 'screen cd-inter cd-pause');
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-modal', 'true');
  s.setAttribute('aria-label', 'Paused');
  s.appendChild(h('div', 'cd-kicker', 'SECTOR HOLD'));
  s.appendChild(h('h1', 'cd-title', 'PAUSED'));

  const items: { id: string; label: string; go: () => void; alt: boolean }[] = [
    { id: 'resume', label: 'RESUME  [ESC]', go: actions.onResume, alt: false },
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

  if (actions.onMusicVol) {
    const STEPS = [1, 0.7, 0.4, 0.15, 0];
    let vol = actions.musicVol ?? 0.7;
    const label = () => `MUSIC ${vol <= 0.001 ? 'MUTED' : `${Math.round(vol * 100)}%`}`;
    const b = bigButton(label(), () => {
      // step down through the ladder; below the last step wraps back to full
      const next = STEPS.findIndex((step) => step < vol - 0.001);
      vol = next < 0 ? STEPS[0] : STEPS[next];
      b.textContent = label();
      actions.onMusicVol!(vol);
    }, 'cd-btn alt');
    b.type = 'button';
    b.dataset.menuItem = 'music';
    row.appendChild(b);
    buttons.push(b);
  }

  const help = h('ul', 'cd-pause-help');
  for (const line of [
    'WASD MOVE  ·  ARROWS TURN  ·  SHIFT RUN',
    'CLICK TO LOOK  ·  LMB USE TOOL  ·  E / SPACE INTERACT',
    '1-8 / WHEEL / Q SWITCH TOOL',
    'TAB OBJECTIVES  ·  M MAP  ·  L EVIDENCE LOG',
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
