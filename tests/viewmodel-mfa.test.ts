import { describe, expect, it } from 'vitest';
import type { Gender, ViewmodelAnim } from '../src/core/types';
import { drawToolViewmodel, mfaFrameForUse } from '../src/render/viewmodels';
import { currentSkin, setSkin, skinTriple } from '../src/tools/look';
import { IMPACT, RECOVER, vmLine } from '../src/tools/anim';
import { mfaTool } from '../src/tools/mfa';
import { FakeCanvas, installFakeCanvas } from './fakecanvas';

installFakeCanvas();

const W = 320;
const H = 168;
const LINE = vmLine(H);
const MAX_A = 40 / 255;
const WINDUP = mfaTool.windup ?? 0;

const frames = [
  { name: 'rest', sinceUse: 9 },
  { name: 'touch', sinceUse: WINDUP * 0.5 },
  { name: 'glow', sinceUse: WINDUP + IMPACT * 0.5 },
  { name: 'release', sinceUse: WINDUP + IMPACT + RECOVER * 0.25 },
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
    mfaTool,
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

describe('mfa token viewmodel', () => {
  it('selects the authored frame at each use phase boundary', () => {
    expect(mfaFrameForUse(9, WINDUP)).toBe('rest');
    expect(mfaFrameForUse(WINDUP * 0.5, WINDUP)).toBe('touch');
    expect(mfaFrameForUse(WINDUP, WINDUP)).toBe('glow');
    expect(mfaFrameForUse(WINDUP + IMPACT + RECOVER * 0.01, WINDUP)).toBe('release');
    expect(mfaFrameForUse(WINDUP + IMPACT + RECOVER * 0.45, WINDUP)).toBe('release');
    expect(mfaFrameForUse(WINDUP + IMPACT + RECOVER * 0.55, WINDUP)).toBe('rest');
    expect(mfaFrameForUse(WINDUP + IMPACT + RECOVER, WINDUP)).toBe('rest');
  });

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
  });
});
