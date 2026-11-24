/**
 * Mission-select row colours that must meet WCAG 4.5:1 body-text contrast.
 * Locked rows used to fade the whole row to 45% opacity (roughly 2.4:1 for the
 * tagline); they now use solid colours set as CSS custom properties on the
 * screen, so the unit tests check the same values the page renders.
 */
export const LOCKED_ROW = {
  bg: '#171212',
  title: '#c8bcb0',
  text: '#a8a098',
} as const;

export const LOCKED_TITLE_RAMP = ['#d8ccc0', LOCKED_ROW.title, '#b0a498'] as const;

export function applyLockedRowTokens(node: HTMLElement): void {
  node.style.setProperty('--row-locked-bg', LOCKED_ROW.bg);
  node.style.setProperty('--row-locked-title', LOCKED_ROW.title);
  node.style.setProperty('--row-locked-text', LOCKED_ROW.text);
}
