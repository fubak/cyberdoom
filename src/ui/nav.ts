/**
 * Menu and overlay back-stack.
 *
 * Escape / Back always leaves the current surface. Title (no overlay) and the
 * debrief grade are the only states that stay put: title is the root, and the
 * debrief leaves through its Continue control after the knowledge check.
 * Play opens the pause menu, which itself backs out to play; the pause menu
 * also offers restart and mission select so play is never a dead end.
 */

export type MenuScreen =
  | 'title'
  | 'character-select'
  | 'mission-select'
  | 'briefing'
  | 'loading'
  | 'play'
  | 'debrief';

export type MenuOverlay =
  | 'none'
  | 'read-this'
  | 'briefing-details'
  | 'automap'
  | 'dossier'
  | 'pause'
  | 'evidence'
  | 'evidence-detail';

export interface NavState {
  screen: MenuScreen;
  overlay: MenuOverlay;
}

/** HUD / map strings. Kept short enough for the 320px status width. */
export const LOOK_HINT = 'CLICK TO LOOK - ESC MENU';
export const MENU_HINT = 'ESC MENU - M MAP - L LOG';
export const MAP_HINT = 'WASD MOVE - M OR ESC CLOSE';

export function applyBack(state: NavState): NavState {
  switch (state.overlay) {
    case 'read-this':
      return { screen: 'title', overlay: 'none' };
    case 'briefing-details':
      return { screen: 'briefing', overlay: 'none' };
    case 'evidence-detail':
      return { screen: 'debrief', overlay: 'evidence' };
    case 'evidence':
      return { screen: 'debrief', overlay: 'none' };
    case 'automap':
    case 'dossier':
    case 'pause':
      return { screen: 'play', overlay: 'none' };
    case 'none':
      break;
    default: {
      const uncovered: never = state.overlay;
      return uncovered;
    }
  }
  switch (state.screen) {
    case 'title':
    case 'debrief':
      return state;
    case 'character-select':
      return { screen: 'title', overlay: 'none' };
    case 'mission-select':
      return { screen: 'character-select', overlay: 'none' };
    case 'briefing':
      return { screen: 'mission-select', overlay: 'none' };
    case 'loading':
      return { screen: 'briefing', overlay: 'none' };
    case 'play':
      return { screen: 'play', overlay: 'pause' };
    default: {
      const uncovered: never = state.screen;
      return uncovered;
    }
  }
}
