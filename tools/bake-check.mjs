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
  // silhouette spike scan: per-column top-most opaque pixel; flag runs of
  // <=3 columns whose top sits >=6px above BOTH column tops 4px away.
  function spikes(c) {
    const ctx = c.getContext('2d');
    const { width: W, height: H } = c;
    const d = ctx.getImageData(0, 0, W, H).data;
    const top = new Array(W).fill(H);
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++)
        if (d[(y * W + x) * 4 + 3] > 128) { top[x] = y; break; }
    let n = 0;
    for (let x = 0; x < W; x++) {
      if (top[x] === H) continue;
      const l = x - 4 >= 0 ? top[x - 4] : H, r = x + 4 < W ? top[x + 4] : H;
      if (top[x] + 6 <= l && top[x] + 6 <= r) {
        // measure run width of columns sharing this top height (±2)
        let w = 1;
        for (let k = x + 1; k < W && Math.abs(top[k] - top[x]) <= 2; k++) w++;
        if (w <= 3) n++;
        x += w - 1;
      }
    }
    return n;
  }
  const out = {};
  const counts = {};
  for (const gender of ['male', 'female']) {
    for (const [name, fr] of Object.entries(POSES)) {
      const s = bakeRig(name, fr, { gender, skin: SKIN_TONES[1] });
      counts[`${gender}:${name}`] = spikes(s.c);
      if (gender === 'male') out[name] = s.c.toDataURL();
    }
  }
  return { out, counts };
});
fs.mkdirSync('/tmp/mesh', { recursive: true });
for (const [k, v] of Object.entries(res.out)) fs.writeFileSync(`/tmp/mesh/${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
const bad = Object.entries(res.counts).filter(([, n]) => n > 0);
console.log('baked', Object.keys(res.out).length, 'poses x2 analysts');
for (const [k, n] of Object.entries(res.counts)) console.log(`  spikes ${k}: ${n}`);
console.log(bad.length ? `FAIL ${bad.length} sprites with spikes` : 'SPIKES: all clean');
await browser.close();
