import { chromium } from '@playwright/test';
const out = process.argv[2] ?? '/home/ubuntu/audit/mouse-2d/lead';
const tag = process.argv[3] ?? 'p';
const url = process.argv[4] ?? 'http://localhost:5173/?debug=1';
const slot = Number(process.argv[5] ?? 2);
const browser = await chromium.launch();
const shots = [];
for (const [gender, skin] of [['male', 's1'], ['female', 's5']]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript((s) => localStorage.setItem('cyberdoom.skin', s), skin);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.clock.install();
  await page.goto(url, { waitUntil: 'load' });
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.evaluate((a) => { window.__cd.startMission('m12', a.g); window.__cd.setTool(a.slot); }, { g: gender, slot });
  await page.clock.runFor(1200);
  const p = `${out}/${tag}-${gender}-rest.png`;
  await page.screenshot({ path: p, clip: { x: 480, y: 480, width: 960, height: 600 } });
  shots.push(p);
}
await browser.close();
console.log(shots.join('\n'));
