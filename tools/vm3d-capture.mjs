// Capture vm3d evidence: hand-study sheets (5 poses x 3 views per analyst),
// 4K idle + deterministic clip frames (TYPE, SWING) as contact sheets,
// 60fps MP4 of each clip, and 1080p full-screen idle/mid-swing stills.
// Usage: node tools/vm3d-capture.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || '.vm3d-evidence';
const POSES = ['open', 'relaxed', 'typing', 'fist', 'bat'];
const VIEWS = ['palm', 'back', 'side'];
const CLIPS = {
  type: { dur: 0.62, stills: [0, 0.06, 0.17, 0.3, 0.46, 0.52, 0.58, 0.62] },
  swing: { dur: 0.6, stills: [0, 0.03, 0.06, 0.105, 0.17, 0.3, 0.45, 0.6] },
};
const SIDES = ['L', 'R'];
const errors = [];
mkdirSync(OUT, { recursive: true });

function ffmpeg(args) {
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); return true; }
  catch (e) { errors.push(`ffmpeg: ${e.message.slice(0, 200)}`); return false; }
}

for (const gender of ['male', 'female']) {
  // ---------- hand study sheet ----------
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', (e) => errors.push(`study ${gender}: ${e.message}`));
  await page.goto(`${BASE}/?debug=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cd, { timeout: 30000 });
  await page.evaluate((g) => window.__cd.startMission('m01', g), gender);
  await page.waitForTimeout(1400);
  for (const side of SIDES) {
    for (const pose of POSES) {
      for (const view of VIEWS) {
        await page.evaluate(([p, v, s]) => window.__cd.vm3d.study(p, v, s), [pose, view, side]);
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${OUT}/study-${gender}-${side}-${pose}-${view}.png` });
      }
    }
  }
  await page.evaluate(() => window.__cd.vm3d.study(null));
  await page.close();
  await browser.close();
  // sheet per hand: rows = poses, cols = views
  for (const side of SIDES) {
    const tiles = POSES.flatMap((p) => VIEWS.map((v) => `${OUT}/study-${gender}-${side}-${p}-${v}.png`));
    try {
      execFileSync('montage', [...tiles, '-tile', '3x5', '-geometry', '+4+4', '-background', '#222',
        `${OUT}/hand-study-${gender}-${side}.png`]);
    } catch (e) { errors.push(`montage study: ${e.message.slice(0, 200)}`); }
  }

  // ---------- 4K idle + clip stills (contact sheets) ----------
  const b4k = await chromium.launch();
  const p4k = await b4k.newPage({ viewport: { width: 3840, height: 2160 } });
  p4k.on('pageerror', (e) => errors.push(`4k ${gender}: ${e.message}`));
  await p4k.goto(`${BASE}/?debug=1`, { waitUntil: 'load' });
  await p4k.waitForFunction(() => window.__cd, { timeout: 30000 });
  await p4k.evaluate((g) => window.__cd.startMission('m01', g), gender);
  await p4k.waitForTimeout(1400);
  await p4k.evaluate(() => window.__cd.setTool(1));
  await p4k.waitForTimeout(600);
  await p4k.screenshot({ path: `${OUT}/4k-${gender}-idle.png` });
  for (const [action, c] of Object.entries(CLIPS)) {
    for (let i = 0; i < c.stills.length; i++) {
      const t = c.stills[i];
      await p4k.evaluate(([a, tt]) => {
        window.__cd.vm3d.play(a);
        window.__cd.vm3d.freeze(tt);
      }, [action, t]);
      await p4k.waitForTimeout(300);
      await p4k.screenshot({ path: `${OUT}/4k-${gender}-${action}-${i}.png` });
    }
    try {
      const frames = c.stills.map((_, i) => `${OUT}/4k-${gender}-${action}-${i}.png`);
      // downscale tiles to 1920 wide for a 4x2 sheet
      execFileSync('montage', [...frames, '-tile', '4x2', '-geometry', '1920x1080+2+2',
        '-background', '#111', `${OUT}/sheet-4k-${gender}-${action}.png`]);
      // review montage: same 8 frames downscaled to 960x540 each
      execFileSync('montage', [...frames, '-tile', '4x2', '-geometry', '960x540+2+2',
        '-background', '#111', `${OUT}/montage-${gender}-${action}.png`]);
    } catch (e) { errors.push(`montage ${action}: ${e.message.slice(0, 200)}`); }
  }
  await p4k.evaluate(() => { window.__cd.vm3d.freeze(null); window.__cd.vm3d.force(null); });
  await p4k.close();
  await b4k.close();

  // ---------- 1080p idle + mid-swing full-screen stills ----------
  const b10 = await chromium.launch();
  const p10 = await b10.newPage({ viewport: { width: 1920, height: 1080 } });
  p10.on('pageerror', (e) => errors.push(`1080 ${gender}: ${e.message}`));
  await p10.goto(`${BASE}/?debug=1`, { waitUntil: 'load' });
  await p10.waitForFunction(() => window.__cd, { timeout: 30000 });
  await p10.evaluate((g) => window.__cd.startMission('m01', g), gender);
  await p10.waitForTimeout(1400);
  await p10.evaluate(() => window.__cd.setTool(1));
  await p10.waitForTimeout(600);
  await p10.screenshot({ path: `${OUT}/1080-${gender}-idle.png` });
  await p10.evaluate(() => {
    window.__cd.vm3d.play('swing');
    window.__cd.vm3d.freeze(0.105);
  });
  await p10.waitForTimeout(300);
  await p10.screenshot({ path: `${OUT}/1080-${gender}-swing.png` });

  // ---------- 60fps MP4 of each clip ----------
  for (const [action, c] of Object.entries(CLIPS)) {
    const n = Math.round(c.dur * 60) + 1;
    for (let i = 0; i < n; i++) {
      const t = (i / 60).toFixed(4);
      await p10.evaluate(([a, tt]) => {
        window.__cd.vm3d.play(a);
        window.__cd.vm3d.freeze(tt);
      }, [action, t]);
      await p10.waitForTimeout(120);
      await p10.screenshot({ path: `${OUT}/seq-${gender}-${action}-${String(i).padStart(3, '0')}.png` });
    }
    ffmpeg(['-framerate', '60', '-i', `${OUT}/seq-${gender}-${action}-%03d.png`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `${OUT}/clip-${gender}-${action}.mp4`]);
  }
  await p10.evaluate(() => { window.__cd.vm3d.freeze(null); window.__cd.vm3d.force(null); });
  await p10.close();
  await b10.close();
}
console.log('errors:', errors.length ? errors : 'none');
console.log('wrote', OUT);
