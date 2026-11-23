import { describe, expect, it } from 'vitest';
import type { Gender, ViewmodelAnim } from '../src/core/types';
import { keyboardFrameForUse, drawToolViewmodel } from '../src/render/viewmodels';
import { currentSkin, setSkin, skinTriple } from '../src/tools/look';
import { IMPACT, RECOVER, vmLine } from '../src/tools/anim';
import { keyboardTool } from '../src/tools/keyboard';
import { FakeCanvas, installFakeCanvas } from './fakecanvas';

installFakeCanvas();

const W = 320;
const H = 168;
const LINE = vmLine(H);
const MAX_A = 40 / 255;
const WINDUP = keyboardTool.windup ?? 0;

const frames = [
  { name: 'rest', sinceUse: 9 },
  { name: 'raise', sinceUse: WINDUP * 0.5 },
  { name: 'swing', sinceUse: WINDUP + IMPACT * 0.399 },
  { name: 'contact', sinceUse: WINDUP + IMPACT * 0.4 },
  { name: 'recover', sinceUse: WINDUP + IMPACT + RECOVER * 0.5 },
] as const;

function render(gender: Gender, sinceUse: number): Uint8ClampedArray {
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
  };
  drawToolViewmodel(
    g as unknown as CanvasRenderingContext2D,
    keyboardTool,
    W,
    H,
    0,
    gender,
    0,
    sinceUse,
    anim,
  );
  return g.getImageData(0, 0, W, H).data;
}

describe('keyboard viewmodel', () => {
  it('selects the authored frame at each use phase boundary', () => {
    expect(keyboardFrameForUse(9, WINDUP)).toBe('rest');
    expect(keyboardFrameForUse(WINDUP * 0.5, WINDUP)).toBe('raise');
    expect(keyboardFrameForUse(WINDUP, WINDUP)).toBe('swing');
    expect(keyboardFrameForUse(WINDUP + IMPACT * 0.399, WINDUP)).toBe('swing');
    expect(keyboardFrameForUse(WINDUP + IMPACT * 0.4, WINDUP)).toBe('contact');
    expect(keyboardFrameForUse(WINDUP + IMPACT, WINDUP)).toBe('recover');
    expect(keyboardFrameForUse(WINDUP + IMPACT + RECOVER, WINDUP)).toBe('rest');
  });

  // Rasterises every frame of the tool's art; takes 5-7 s under parallel load, so allow 30 s.
  it('keeps every frame below the clearance line and out of the aim box for both analysts and endpoint skins', () => {
    const previousSkin = currentSkin().id;
    const errors: string[] = [];
    try {
      for (const skin of ['s1', 's5']) {
        setSkin(skin);
        for (const gender of ['male', 'female'] as Gender[]) {
          for (const frame of frames) {
            const pixels = render(gender, frame.sinceUse);
            let painted = 0;
            let worst: string | null = null;
            const flashLive = frame.sinceUse >= WINDUP && frame.sinceUse - WINDUP < IMPACT;
            for (let y = 0; y < H && !worst; y++) {
              const inBoxY = y >= H * 0.4 && y < H * 0.6;
              for (let x = 0; x < W; x++) {
                const alpha = pixels[(y * W + x) * 4 + 3] / 255;
                if (alpha <= MAX_A) continue;
                painted++;
                const inBox = inBoxY && x >= W * 0.4 && x < W * 0.6;
                const edgeFlash = flashLive && (y < H * 0.29 || y >= H * 0.71 || x < W * 0.24 || x >= W * 0.76);
                if ((y < LINE || inBox) && !edgeFlash) {
                  worst = `${gender}/${skin}/${frame.name}: (${x},${y}) alpha=${alpha.toFixed(2)}`;
                  break;
                }
              }
            }
            if (painted < 500) errors.push(`${gender}/${skin}/${frame.name}: only ${painted} visible pixels`);
            if (worst) errors.push(worst);
          }
        }
      }
    } finally {
      setSkin(previousSkin);
    }
    expect(errors).toEqual([]);
  }, 30_000);
});
