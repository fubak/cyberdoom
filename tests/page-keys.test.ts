import { describe, expect, it } from 'vitest';
import { canDraw, measureText } from '../src/render/font';
import { DB_TEXT_W } from '../src/ui/debrief-layout';
import { DOSSIER_HINT } from '../src/ui/dossier';
import { pageLabel, pageStep, stepPage } from '../src/ui/pageKeys';

describe('briefing / dossier page keys', () => {
  it('Left / A (and Q as an alias) go back a page', () => {
    for (const key of ['ArrowLeft', 'a', 'A', 'q', 'Q']) expect(pageStep(key), key).toBe(-1);
  });

  it('Right / D go forward a page', () => {
    for (const key of ['ArrowRight', 'd', 'D']) expect(pageStep(key), key).toBe(1);
  });

  it('other keys do not page', () => {
    for (const key of ['Enter', 'Escape', 'k', 'w', 's', ' ', 'ArrowUp']) expect(pageStep(key), key).toBe(0);
  });

  it('matches the dossier map: A = previous, D = next', () => {
    expect(DOSSIER_HINT.file).toContain('A/D PAGE');
    expect(pageStep('a')).toBe(-1);
    expect(pageStep('d')).toBe(1);
  });

  it('clamps the page index without wrapping', () => {
    expect(stepPage(0, -1, 4)).toBe(0);
    expect(stepPage(0, 1, 4)).toBe(1);
    expect(stepPage(3, 1, 4)).toBe(3);
    expect(stepPage(2, 0, 4)).toBe(2);
    expect(stepPage(5, -1, 4)).toBe(3);
    expect(stepPage(0, 1, 1)).toBe(0);
  });

  it('labels the keys that actually page, in drawable glyphs that fit the frame', () => {
    const label = pageLabel(1, 4);
    expect(label).toContain('2/4');
    expect(label).toMatch(/←\/→/);
    expect(label).toMatch(/A\/D/);
    expect(canDraw(label, 'small')).toBe(true);
    expect(measureText(label, 'small')).toBeLessThanOrEqual(DB_TEXT_W);
  });
});
