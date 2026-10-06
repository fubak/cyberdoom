import { chromium } from '@playwright/test';
const url = process.argv[2] || 'http://127.0.0.1:5181/?debug=1&mission=m01&gender=female';
const b = await chromium.connectOverCDP('http://localhost:29229');
const DIST = Number(process.env.DIST || 1.0);
const ctx = b.contexts()[0]; const p = await ctx.newPage();
await p.setViewportSize({ width: 1280, height: 800 });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__cd?.state()?.mission, null, { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(Number(process.env.WAIT || 8000));
// stage worms repeatedly so hits keep landing; fire continuously during sampling
await p.evaluate((d) => window.__cd.stage('enemy', d), DIST);
await p.keyboard.press('1');
await p.waitForTimeout(300);
const cdp = await ctx.newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const fps = await p.evaluate((DIST) => new Promise(r => {
  let n = 0, t0 = performance.now(), dts = [], last = t0, alive = 0;
  const iv = setInterval(() => {
    try {
      const s = window.__cd.state();
      if (s.integrity > 0) {
        const e = s.entities.find(e => e.kind === 'enemy' && e.alive && Math.hypot(e.x - s.x, e.y - s.y) < 2);
        if (!e) window.__cd.stage('enemy', DIST);
        window.__cd.fire();
      }
    } catch (err) {}
    if (++alive > 38) clearInterval(iv);
  }, 100);
  function f(t) { n++; dts.push(t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(f); else { clearInterval(iv); dts.sort((a, b) => a - b); r({ fps: n / ((t - t0) / 1000), p50: dts[dts.length >> 1], p95: dts[Math.floor(dts.length * 0.95)], max: dts[dts.length - 1] }); } }
  requestAnimationFrame(f);
}), DIST);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; let tot = 0;
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + dt[i]); tot += dt[i]; });
console.log(JSON.stringify(fps));
[...self].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log((v / tot * 100).toFixed(1) + '%', k));
await p.close();
process.exit(0);
