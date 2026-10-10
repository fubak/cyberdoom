import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:5173/?debug=1&mission=m11&gender=male');
await page.waitForFunction(() => window.__cd?.state().mission != null, null, { timeout: 30000 });
await page.waitForTimeout(800);
// replicate suite order for m11, then inspect vault-bomb-1
for (const k of ['worm','trojan','ransomware','rootkit','logicbomb']) for (const d of [6,10,15]) {
  await page.evaluate(([k,d]) => window.__cd.probe(k,d), [k,d]);
}
const info = await page.evaluate(() => {
  const g = window.__game ?? window.__cdInternals;
  return 'no internals';
});
// use stage to grab internals: placeThreat through probe already ran; inspect via a fresh evaluate with hooks exposed in __cd
const r = await page.evaluate(() => {
  // reach into the live runtime via __cd's closure? Not exposed — use probe target info instead.
  return window.__cd.probe('logicbomb', 6, true);
});
console.log(JSON.stringify({ px: r.spritePx, target: r.target, line: r.at }));
await browser.close();
