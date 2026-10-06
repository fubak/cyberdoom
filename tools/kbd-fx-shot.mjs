import { chromium } from '@playwright/test';
const b = await chromium.connectOverCDP('http://localhost:29229');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1280, height: 800 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://127.0.0.1:5181/?debug=1&mission=m01&gender=female');
await p.waitForFunction(() => window.__cd?.state()?.mission, null, { timeout: 60000 });
await p.waitForTimeout(4000);
await p.evaluate(() => window.__cd.stage('worm', 1.0));
await p.keyboard.press('1'); // KEYBOARD
await p.waitForTimeout(400);
// fire and catch the burst mid-flight
await p.evaluate(() => window.__cd.fire());
await p.waitForTimeout(90);
await p.screenshot({ path: '/home/ubuntu/play/hud-shots/check-kbd-fx-fixed.png' });
await p.waitForTimeout(200);
await p.screenshot({ path: '/home/ubuntu/play/hud-shots/check-kbd-fx-fixed-2.png' });
console.log('errors:', errs.slice(0, 10));
await p.close();
process.exit(0);
