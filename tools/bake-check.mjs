import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__cd, { timeout: 20000 });
const res = await page.evaluate(async () => {
  const { bakeRig } = await import('/src/render/handrig.ts');
  const { POSES } = await import('/src/render/handposes.ts');
  const { SKIN_TONES } = await import('/src/tools/look.ts');
  const out = {};
  for (const [name, fr] of Object.entries(POSES)) {
    const s = bakeRig(name, fr, { gender: 'male', skin: SKIN_TONES[1] });
    out[name] = s.c.toDataURL();
  }
  return out;
});
fs.mkdirSync('/tmp/mesh', { recursive: true });
for (const [k, v] of Object.entries(res)) fs.writeFileSync(`/tmp/mesh/${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('baked', Object.keys(res).length);
await browser.close();
