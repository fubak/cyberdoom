import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { canDraw, measureText } from '../src/render/font';
import { DOSSIER_ROWS, DOSSIER_TEXT_W, layoutCaseFile } from '../src/ui/dossier';

const compact = (text: string) => text.replace(/\s/g, '');

function expectLayout(entry: { label: string; detail: string }, context: string): void {
  const layout = layoutCaseFile(entry);
  expect(layout.title.every((line) => measureText(line, 'small') <= DOSSIER_TEXT_W), `${context} title width`).toBe(true);
  expect(layout.pages.every((page) => page.length <= DOSSIER_ROWS), `${context} page rows`).toBe(true);
  expect(layout.pages.flat().every((line) => measureText(line, 'small') <= DOSSIER_TEXT_W), `${context} detail width`).toBe(true);
  expect([...layout.title, ...layout.pages.flat()].join('')).not.toContain('…');
  expect(compact(layout.title.join(''))).toBe(compact(entry.label));
  expect(compact(layout.pages.flat().join(''))).toBe(compact(entry.detail));
  expect(canDraw(entry.label), `${context} label font glyphs`).toBe(true);
  expect(canDraw(entry.detail), `${context} detail font glyphs`).toBe(true);
}

describe('CASE FILE layout', () => {
  for (const mission of missionRegistry.all()) {
    it(`${mission.id} evidence entries fit and preserve their source text`, () => {
      for (const entity of mission.entities) {
        if (entity.inspect) {
          expectLayout(
            { label: entity.inspect.label, detail: entity.inspect.detail },
            `${mission.id}/${entity.id}/inspect`,
          );
        }
        if (entity.log) {
          expectLayout(
            { label: entity.inspect?.label ?? entity.id, detail: entity.log },
            `${mission.id}/${entity.id}/log`,
          );
        }
      }
    });
  }

  it('lays out long evidence across multiple lossless pages', () => {
    const detail = 'Case evidence from the endpoint and network logs. '.repeat(44);
    const layout = layoutCaseFile({ label: 'Long incident file', detail });
    expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    expect(compact(layout.pages.flat().join(''))).toBe(compact(detail));
  });

  it('hard-splits an unbroken token without losing characters', () => {
    const detail = 'X'.repeat(200);
    const layout = layoutCaseFile({ label: 'Long token', detail }, 60);
    expect(layout.pages.flat().length).toBeGreaterThan(1);
    expect(layout.pages.flat().every((line) => measureText(line, 'small') <= 60)).toBe(true);
    expect(layout.pages.flat().join('')).toBe(detail);
  });

  it('honors explicit newlines as line breaks', () => {
    const layout = layoutCaseFile({ label: 'Newline test', detail: 'first line\nsecond line' });
    expect(layout.pages[0]).toEqual(['first line', 'second line']);
  });
});
