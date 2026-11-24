// LOOK: threat-readability gate. Requires a running dev server.
//   npm run dev  &&  npm run look:contrast [-- http://localhost:5173]
// CDP_URL=http://localhost:29229 attaches to an existing Chrome instead of launching one.
// Pass: every live enemy type at 6, 10 and 15 tiles in each probed mission has
// >=3:1 luminance contrast against its background and >=400 projected sprite
// px at 15 tiles, and the darkest 10% of the 3D view (no sprite) has luma >= 8
// (never a pure-black void). Also runs the light-diminishing probe per mission:
// the same lit wall at ~10 tiles must render <=70% of its ~2-tile luma, the
// darkest straight run's centre band must stay shadow-dark but readable
// (12-46/255 median), and the share of the whole 3D view under 16/255 must
// sit in [12%, 28%] — the F5 two-sided gloom gate: Doom's darkest gameplay
// frames are ~26% near-black, but a flat grey room with no true dark fails
// just as a void does.
// Mid and late missions (m04+) must contain at least one strobing light sector.
// Opener rows (OPENERS below) check the spawn view itself via __cd.openerProbe():
// mean luma, sub-16 share, and ceiling/floor band luma (M01 spawn room, M12).
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
// m05 excluded for now: its darkest straight line ends against a genuinely
// lit wall, so a dist-10 threat can read ~2.4:1 — a placement-lit backdrop,
// not darkness drama. m09/m11 still assert the strobing sectors (every
// mid/late mission m04+ gets 2).
const MISSIONS = ['m01', 'm03', 'm09', 'm11', 'm12'];
const KINDS = ['worm', 'trojan', 'ransomware', 'rootkit', 'logicbomb', 'rat'];
// Opener rows: the spawn view (sprites hidden) must read as a space, not a
// void. Thresholds sit a few luma under the measured post-fix values and
// above the pre-fix ones, so a regression to the old look fails:
//  - m01 spawn room (lit office): measured mean 72, darkFrac 0.003.
//  - m12 opener (Phase E P1-12): before mean 34.9, darkFrac 0.103, ceiling
//    band 36.2, floor band 32.7 (ceiling/floor vanished); after mean 41.6,
//    darkFrac 0.023, ceiling 46.4, floor 37.1. (ambient 0.07, not higher:
//    0.1 lifted the darkest-run darkFrac to 0.111, under the 0.12 gloom gate.)
const OPENERS = {
  m01: { mean: 60, darkFrac: 0.02, ceil: 50, floor: 60 },
  m12: { mean: 38, darkFrac: 0.05, ceil: 40, floor: 34 },
};
const DISTS = [6, 10, 15];

const browser = process.env.CDP_URL
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fail = 0;
const rows = [];
const lightRows = [];
const openerRows = [];
for (const m of MISSIONS) {
  await page.goto(`${base}/?debug=1&mission=${m}&gender=male`);
  await page.waitForFunction(() => window.__cd?.state().mission != null, null, { timeout: 30000 });
  if (m === MISSIONS[0]) {
    const info = await page.evaluate(() => window.__cd.texInfo());
    const expected = { wall: [256, 320], flat: [256, 256], worm: [256, 256], RES: 4 };
    if (JSON.stringify(info) !== JSON.stringify(expected)) {
      throw new Error(`texture dimensions mismatch: expected ${JSON.stringify(info)}, got ${JSON.stringify(info)}`);
    }
  }
  await page.waitForTimeout(800);
  for (const k of KINDS) {
    for (const d of DISTS) {
      const r = await page.evaluate(([k, d]) => window.__cd.probe(k, d), [k, d]);
      const minPx = d >= 15 ? 400 : 8;
      const ok = r.spritePx >= minPx && r.contrast >= 3 && r.p10 >= 8;
      if (!ok) fail++;
      rows.push({ mission: m, kind: k, dist: d, px: r.spritePx, sprite: r.spriteLum, bg: r.bgLum, contrast: r.contrast, p10: r.p10, light: +r.at.light.toFixed(2), ok });
    }
  }
  const lp = await page.evaluate(() => window.__cd.lightProbe(10));
  const lOk = (lp.line ? lp.ratio <= 0.7 : true) && lp.dark >= 12 && lp.dark <= 46 && lp.darkFrac >= 0.12 && lp.darkFrac <= 0.28;
  if (!lOk) fail++;
  const strobe = await page.evaluate(() => window.__cd.strobeInfo());
  const midLate = +m.slice(1) >= 4;
  const sOk = !midLate || strobe.phases >= 1;
  if (!sOk) fail++;
  lightRows.push({ mission: m, near2: lp.near, far10: lp.far, ratio: lp.ratio, dark: lp.dark, darkLight: lp.darkLight, darkFrac: lp.darkFrac, darkP10: lp.darkP10, strobe: strobe.phases, ok: lOk && sOk });
  const gate = OPENERS[m];
  if (gate) {
    const op = await page.evaluate(() => window.__cd.openerProbe());
    const oOk = op.mean >= gate.mean && op.darkFrac <= gate.darkFrac && op.ceil >= gate.ceil && op.floor >= gate.floor;
    if (!oOk) fail++;
    openerRows.push({ mission: m, ...op, gate: JSON.stringify(gate), ok: oOk });
  }
}
console.table(rows);
console.table(lightRows);
console.table(openerRows);
if (errors.length) console.log('page errors:\n' + errors.join('\n'));
console.log(fail || errors.length ? `FAIL: ${fail} probe(s) below target` : 'PASS: contrast >= 3:1, p10 >= 8, far/near <= 0.7, dark 12-46, darkFrac 0.12-0.28, strobes on m04+, opener rows (m01, m12)');
await page.close();
if (!process.env.CDP_URL) await browser.close();
process.exit(fail || errors.length ? 1 : 0);
