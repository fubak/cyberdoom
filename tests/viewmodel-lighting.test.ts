import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Gender, ViewmodelAnim } from '../src/core/types';
import { IMPACT } from '../src/tools/anim';
import { currentSkin, setSkin, skinTriple } from '../src/tools/look';
import { usbTool } from '../src/tools/usb';
import { drawToolViewmodel } from '../src/render/viewmodels';
import { FakeCanvas, installFakeCanvas } from './fakecanvas';

installFakeCanvas();

const W = 320;
const H = 168;
const WINDUP = usbTool.windup ?? 0;
const previousSkin = currentSkin().id;

beforeAll(() => setSkin('s1'));
afterAll(() => setSkin(previousSkin));

function render(light: number | undefined, sinceUse = 9): Uint8ClampedArray {
  const canvas = new FakeCanvas();
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext();
  const anim: ViewmodelAnim = {
    sinceUse,
    sinceConfirm: sinceUse - WINDUP,
    confirmGood: true,
    time: sinceUse,
    ammo: null,
    skin: skinTriple(currentSkin()),
    lower: 0,
    ...(light === undefined ? {} : { light }),
  };
  drawToolViewmodel(
    g as unknown as CanvasRenderingContext2D,
    usbTool,
    W,
    H,
    0,
    'male' as Gender,
    0,
    sinceUse,
    anim,
  );
  return g.getImageData(0, 0, W, H).data;
}

describe('viewmodel room lighting', () => {
  it('defaults to full bright when light is undefined', () => {
    expect(render(undefined)).toEqual(render(1));
  });

  it('darkens to the clamped minimum while preserving the alpha mask', () => {
    const bright = render(1);
    const dimmed = render(0.1);
    let alphaMatches = true;
    let brightRgb = 0;
    let dimmedRgb = 0;

    for (let i = 0; i < bright.length; i += 4) {
      if (bright[i + 3] !== dimmed[i + 3]) alphaMatches = false;
      if (bright[i + 3] === 0) continue;
      brightRgb += bright[i] + bright[i + 1] + bright[i + 2];
      dimmedRgb += dimmed[i] + dimmed[i + 1] + dimmed[i + 2];
    }

    expect(alphaMatches).toBe(true);
    const ratio = dimmedRgb / brightRgb;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.45);
  });

  it('keeps lit impact frames full bright', () => {
    const sinceUse = WINDUP + IMPACT * 0.5;
    expect(render(0.1, sinceUse)).toEqual(render(1, sinceUse));
  });

  it('reuses the same quantized light step', () => {
    expect(render(0.62)).toEqual(render(0.64));
  });
});
