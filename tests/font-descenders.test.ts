import { describe, expect, it } from 'vitest';
import { drawBigText, drawChunky, drawText } from '../src/render/font';
import { FakeCanvas, installFakeCanvas } from './fakecanvas';

installFakeCanvas();

const DESCENDERS = ['g', 'p', 'q', 'y', 'j'] as const;

const PATHS = [
  {
    name: 'small',
    height: 8,
    draw: (g: CanvasRenderingContext2D, ch: string) => drawText(g, ch, 0, 0, '#fff', 'small', null),
  },
  {
    name: 'chunky',
    height: 8,
    draw: (g: CanvasRenderingContext2D, ch: string) => drawChunky(g, ch, 0, 0, '#fff', null),
  },
  {
    name: 'big',
    height: 16,
    draw: (g: CanvasRenderingContext2D, ch: string) => drawBigText(g, ch, 0, 0, ['#fff'], '#00000000'),
  },
  {
    name: 'bigfat',
    height: 16,
    draw: (g: CanvasRenderingContext2D, ch: string) => drawBigText(g, ch, 0, 0, ['#fff'], '#00000000', true),
  },
] as const;

function renderBitmap(draw: (g: CanvasRenderingContext2D, ch: string) => void, ch: string): boolean[][] {
  const canvas = new FakeCanvas();
  canvas.width = 24;
  canvas.height = 24;
  const g = canvas.getContext();
  draw(g as unknown as CanvasRenderingContext2D, ch);
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  return Array.from({ length: canvas.height }, (_, y) =>
    Array.from({ length: canvas.width }, (_, x) => image.data[(y * canvas.width + x) * 4 + 3] > 0));
}

describe.each(PATHS)('$name font descenders', ({ draw, height }) => {
  it('renders lowercase g differently from 9', () => {
    expect(renderBitmap(draw, 'g')).not.toEqual(renderBitmap(draw, '9'));
  });

  it.each(DESCENDERS)('draws %s below the baseline', (ch) => {
    const rows = renderBitmap(draw, ch);
    expect(rows[height - 1].some(Boolean), `${ch} has ink in its descender row`).toBe(true);
  });
});
