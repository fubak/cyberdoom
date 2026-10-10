import { describe, expect, it } from 'vitest';
import type { Gender, ToolDef, ViewmodelAnim } from '../src/core/types';
import { drawToolViewmodel } from '../src/render/viewmodels';
import { useDuration } from '../src/tools/anim';
import { toolRegistry } from '../src/tools';
import { FakeCanvas, FakeCtx, installFakeCanvas } from './fakecanvas';

/**
 * Fire-moment readability: at every point of the use cycle (windup → impact →
 * recover, plus rest and walk bob), at least 90% of a held tool's painted art
 * must be above the status-bar line — the tool may never dive under the bar
 * the way Doom's weapons never do. Renders into a canvas taller than the 3D
 * view so anything sunk below the bar line is measured, not clipped away.
 */
installFakeCanvas();

const W = 320;
const H = 168;
const SLACK = 48;
const SKIN: [string, string, string] = ['#c8885a', '#9a6038', '#e8b080'];
/** Alpha counts as "art" once it would read on screen. */
const MIN_A = 40 / 255;
const MIN_VISIBLE = 0.9;

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

function render(tool: ToolDef, gender: Gender, s: Sample): FakeCtx {
  const c = new FakeCanvas();
  c.width = W;
  c.height = H + SLACK;
  const g = c.getContext();
  const anim: ViewmodelAnim = {
    sinceUse: s.sinceUse,
    sinceConfirm: s.sinceConfirm,
    confirmGood: true,
    time: s.sinceUse,
    ammo: tool.ammo ? 3 : null,
    skin: SKIN,
    lower: 0,
  };
  drawToolViewmodel(g as unknown as CanvasRenderingContext2D, tool, W, H, s.bob, gender, s.cd, s.sinceUse, anim);
  return g;
}

export function visibleFraction(tool: ToolDef, gender: Gender, s: Sample): number {
  const img = render(tool, gender, s).getImageData(0, 0, W, H + SLACK).data;
  let above = 0;
  let below = 0;
  for (let y = 0; y < H + SLACK; y++) {
    for (let x = 0; x < W; x++) {
      if (img[(y * W + x) * 4 + 3] / 255 <= MIN_A) continue;
      if (y < H) above++;
      else below++;
    }
  }
  return above / Math.max(1, above + below);
}

describe('held tools keep their art above the status bar', () => {
  const tools = toolRegistry.all();
  it('covers all 8 tools', () => expect(tools.length).toBeGreaterThanOrEqual(8));

  for (const tool of tools) {
    it(`${tool.id}: >=${Math.round(MIN_VISIBLE * 100)}% of painted art visible at rest/bob/every use frame`, () => {
      const bad: string[] = [];
      for (const gender of ['male', 'female'] as Gender[]) {
        for (const s of samples(tool)) {
          const f = visibleFraction(tool, gender, s);
          if (f < MIN_VISIBLE) bad.push(`${gender} ${s.label}: ${(f * 100).toFixed(1)}% visible`);
        }
      }
      expect(bad.slice(0, 8)).toEqual([]);
    });
  }
});
