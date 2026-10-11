/**
 * Render the composed viewmodel (tool art + rig hands) into FakeCanvas at
 * native RES and dump PNGs to /tmp/vm/.
 * Run: npx vite-node tools/vm-preview.ts [toolId]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { installFakeCanvas } from '../tests/fakecanvas';
installFakeCanvas();
import { drawToolViewmodel } from '../src/render/viewmodels';
import { toolRegistry } from '../src/tools';
import { png } from './hand-preview';
import { RES } from '../src/render/res';
import { useDuration } from '../src/tools/anim';

const W = 320;
const H = 168;
mkdirSync('/tmp/vm', { recursive: true });
const only = process.argv[2];

// FakeCanvas draws in unscaled units; drawToolViewmodel works in base units
// against a canvas at native res — render via a scaled ctx
for (const tool of toolRegistry.all()) {
  if (only && tool.id !== only) continue;
  const times = [9, (tool.windup ?? 0) + 0.03, (tool.windup ?? 0) + 0.07];
  times.forEach((sinceUse, i) => {
    const c = (globalThis as any).document.createElement();
    c.width = W * RES;
    c.height = H * RES;
    const g = c.getContext();
    g.scale(RES, RES);
    drawToolViewmodel(g as any, tool, W, H, 0, 'male', 0, sinceUse, {
      sinceUse, sinceConfirm: 9, confirmGood: true, time: sinceUse, ammo: 3,
      skin: ['#c8885a', '#9a6038', '#e8b080'], lower: 0,
    });
    const d = g.getImageData(0, 0, W * RES, H * RES);
    writeFileSync(`/tmp/vm/${tool.id}-${i}.png`, png(W * RES, H * RES, new Uint8ClampedArray(d.data)));
    console.log(tool.id, i);
  });
}
