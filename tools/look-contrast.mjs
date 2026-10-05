// LOOK: threat-readability gate. Requires a running dev server.
//   npm run dev  &&  npm run look:contrast [-- http://localhost:5173]
// CDP_URL=http://localhost:29229 attaches to an existing Chrome instead of launching one.
// Pass: every worm/trojan/ransomware at 6 and 10 tiles in M01/M03/M09 has >=3:1
// luminance contrast against its background, and the darkest 10% of the 3D view
// (no sprite) has luma > 10.
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const MISSIONS = ['m01', 'm03', 'm09'];
const KINDS = ['worm', 'trojan', 'ransomware'];
const DISTS = [6, 10];

const browser = process.env.CDP_URL
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fail = 0;
const rows = [];
for (const m of MISSIONS) {
  await page.goto(`${base}/?debug=1&mission=${m}&gender=male`);
  await page.waitForFunction(() => window.__cd?.state().mission != null, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  for (const k of KINDS) {
    for (const d of DISTS) {
      const r = await page.evaluate(([k, d]) => window.__cd.probe(k, d), [k, d]);
      const ok = r.spritePx >= 8 && r.contrast >= 3 && r.p10 > 10;
      if (!ok) fail++;
      rows.push({ mission: m, kind: k, dist: d, px: r.spritePx, sprite: r.spriteLum, bg: r.bgLum, contrast: r.contrast, p10: r.p10, light: +r.at.light.toFixed(2), ok });
    }
  }
}
console.table(rows);
if (errors.length) console.log('page errors:\n' + errors.join('\n'));
console.log(fail || errors.length ? `FAIL: ${fail} probe(s) below target` : 'PASS: all threats >= 3:1 contrast, p10 > 10');
await page.close();
if (!process.env.CDP_URL) await browser.close();
process.exit(fail || errors.length ? 1 : 0);
