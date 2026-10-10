import { describe, expect, it } from 'vitest';
import type { Gender, ToolDef, ViewmodelAnim } from '../src/core/types';
import { drawToolViewmodel } from '../src/render/viewmodels';
import { useDuration, vmLine } from '../src/tools/anim';
import { toolRegistry } from '../src/tools';
import { FakeCanvas, FakeCtx, installFakeCanvas } from './fakecanvas';

/**
 * Renders every held tool (rest, bob, and each windup/impact/recover frame, with its
 * fx) into a tiny software 2D canvas and checks that nothing covers the aim area:
 * no opaque pixel above the clearance line (62% of the 3D view) and none in the
 * centre 20%x20% aim box.
 */
installFakeCanvas();

// VIEW_W x VIEW3D_H (render/renderer.ts)
const W = 320;
const H = 168;
const LINE = vmLine(H);
/** "Opaque enough to hide a target": anything above ~16% alpha. */
const MAX_A = 40 / 255;
const SKIN: [string, string, string] = ['#c8885a', '#9a6038', '#e8b080'];

type Sample = { label: string; bob: number; cd: number; sinceUse: number; sinceConfirm: number };

function samples(t: ToolDef): Sample[] {
  const wind = t.windup ?? 0;
  const out: Sample[] = [];
  for (let i = 0; i < 8; i++) out.push({ label: `rest bob=${i}`, bob: (i * Math.PI) / 4, cd: 0, sinceUse: 9, sinceConfirm: 9 });
  for (let s = 0; s <= useDuration(wind) + 0.05; s += 0.01) {
    out.push({ label: `use t=${s.toFixed(2)}`, bob: 0, cd: Math.max(0, 1 - s / t.cooldown), sinceUse: s, sinceConfirm: s - wind });
  }
  return out;
}

function render(tool: ToolDef, gender: Gender, s: Sample, good: boolean): FakeCtx {
  const c = new FakeCanvas();
  c.width = W;
  c.height = H;
  const g = c.getContext();
  const anim: ViewmodelAnim = {
    sinceUse: s.sinceUse,
    sinceConfirm: s.sinceConfirm,
    confirmGood: good,
    time: s.sinceUse,
    ammo: tool.ammo ? 3 : null,
    skin: SKIN,
    lower: 0,
  };
  drawToolViewmodel(g as unknown as CanvasRenderingContext2D, tool, W, H, s.bob, gender, s.cd, s.sinceUse, anim);
  return g;
}

describe('held tools never hide the target', () => {
  const tools = toolRegistry.all();
  it('covers all 8 tools', () => expect(tools.length).toBeGreaterThanOrEqual(8));

  for (const tool of tools) {
    it(`${tool.id}: nothing above ${Math.round(0.62 * 100)}% of view height or in the aim box, at rest/bob/every use frame`, () => {
      const bad: string[] = [];
      let restCoverage = 0;
      for (const gender of ['male', 'female'] as Gender[]) {
        for (const s of samples(tool)) {
          for (const good of [true, false]) {
            const img = render(tool, gender, s, good).getImageData(0, 0, W, H).data;
            let worst: string | null = null;
            for (let y = 0; y < H && !worst; y++) {
              const inBoxY = y >= H * 0.4 && y < H * 0.6;
              if (y >= LINE && !inBoxY) continue;
              for (let x = 0; x < W; x++) {
                const inBox = inBoxY && x >= W * 0.4 && x < W * 0.6;
                if ((y < LINE || inBox) && img[(y * W + x) * 4 + 3] / 255 > MAX_A) {
                  worst = `${gender} ${s.label} good=${good}: pixel (${x},${y}) a=${img[(y * W + x) * 4 + 3]}`;
                  break;
                }
              }
            }
            if (worst) bad.push(worst);
            if (s.label === 'rest bob=0' && good) {
              for (let i = 3; i < img.length; i += 4) if (img[i] > 200) restCoverage++;
            }
          }
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
      // and the tool is actually on screen, not pushed out of view
      expect(restCoverage).toBeGreaterThan(2 * 600);
    });
  }
});
