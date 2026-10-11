// Capture viewmodel evidence: both genders, all 8 tools, idle + mid-use,
// at 1920x1080 and 3840x2160, against a running dev server (or URL).
// Usage: node tools/hands-capture.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || '/tmp/ev';
const TOOLS = [1, 2, 3, 4, 5, 6, 7, 8];
const NAMES = { 1: 'keyboard', 2: 'mouse', 3: 'usb', 4: 'badge', 5: 'tap', 6: 'edr', 7: 'mfa', 8: 'patch' };

const errors = [];
for (const [w, h] of [[1920, 1080], [3840, 2160]]) {
  const browser = await chromium.launch();
  for (const gender of ['male', 'female']) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', (e) => errors.push(`${w}x${h} ${gender}: ${e.message}`));
    await page.goto(`${BASE}/?debug=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__cd, { timeout: 20000 });
    await page.evaluate((g) => window.__cd.startMission('m01', g), gender);
    await page.waitForTimeout(1200);
    for (const slot of TOOLS) {
      await page.evaluate((s) => window.__cd.setTool(s), slot);
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${OUT}/${w}x${h}-${gender}-${NAMES[slot]}-idle.png` });
      await page.evaluate(() => window.__cd.fire());
      await page.waitForTimeout(90);
      await page.screenshot({ path: `${OUT}/${w}x${h}-${gender}-${NAMES[slot]}-use.png` });
      await page.waitForTimeout(500);
    }
    await page.close();
  }
  await browser.close();
}
console.log('errors:', errors.length ? errors : 'none');
