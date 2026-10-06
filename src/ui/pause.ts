import { bigButton, h, onKeysWhileMounted } from './briefing';
import './curriculum.css';

/** In-mission pause overlay: resume, return to mission select, or title. */
export function pauseMenu(opts: {
  onResume: () => void;
  onMissionSelect: () => void;
  onTitle: () => void;
}): HTMLElement {
  const s = h('div', 'screen cd-inter cd-pause');
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-label', 'Paused');
  s.appendChild(h('div', 'cd-kicker', 'MISSION PAUSED'));
  s.appendChild(h('h1', 'cd-title cd-brief-title', 'PAUSED'));
  s.appendChild(
    h(
      'p',
      'cd-body',
      'Pointer lock is released so you can use the mouse on these buttons. Resume to continue the mission.',
    ),
  );
  const buttons = h('div', 'cd-brief-actions');
  buttons.appendChild(bigButton('RESUME  [ESC / ENTER]', opts.onResume));
  buttons.appendChild(
    bigButton('MISSION SELECT  [M]', opts.onMissionSelect, 'cd-btn alt'),
  );
  buttons.appendChild(
    bigButton('TITLE SCREEN  [T]', opts.onTitle, 'cd-btn alt'),
  );
  s.appendChild(buttons);
  s.appendChild(
    h(
      'p',
      'cd-body',
      'Automap: M (while playing). Case file log: L. Close overlays with Esc.',
    ),
  );

  onKeysWhileMounted(s, (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      opts.onResume();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      opts.onMissionSelect();
    } else if (e.code === 'KeyT') {
      e.preventDefault();
      opts.onTitle();
    }
  });
  return s;
}
