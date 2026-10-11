import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('http://localhost:5174/?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__cd, { timeout: 20000 });
const res = await page.evaluate(async () => {
  const { bakeRig } = await import('/src/render/handrig.ts');
  const { POSES, TOOL_HANDS } = await import('/src/render/handposes.ts');
  const { handCycleFrame, idleFrame } = await import('/src/render/handcycles.ts');
  const { jointLayout, skinSteps, nailColor } = await import('/src/render/handmesh.ts');
  const { SKIN_TONES } = await import('/src/tools/look.ts');
  const { CYCLE_MS } = await import('/src/render/vmotion.ts');
  const RES = 4;
  const spec = (g) => ({ gender: g, skin: SKIN_TONES[1] });

  const hsl = (r, g, b) => {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) {
      const rr = r / 255, gg = g / 255, bb = b / 255;
      if (mx === rr) h = 60 * (((gg - bb) / d) % 6);
      else if (mx === gg) h = 60 * ((bb - rr) / d + 2);
      else h = 60 * ((rr - gg) / d + 4);
    }
    return [(h + 360) % 360, s, l];
  };
  const hexRgb = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const read = (c) => {
    const { width: W, height: H } = c;
    const d = c.getContext('2d').getImageData(0, 0, W, H).data;
    return { W, H, d };
  };
  const alpha = (s, x, y) => (x < 0 || x >= s.W || y < 0 || y >= s.H) ? 0 : s.d[(y * s.W + x) * 4 + 3];
  const isSkin = (s, x, y, hue) => {
    const i = (y * s.W + x) * 4;
    if (s.d[i + 3] <= 16) return false;
    const h = hsl(s.d[i], s.d[i + 1], s.d[i + 2])[0];
    let dh = Math.abs(h - hue) % 360;
    if (dh > 180) dh = 360 - dh;
    return dh <= 30;
  };
  const skinBBox = (s, hue) => {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++)
      if (isSkin(s, x, y, hue)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    return x1 < 0 ? null : { x0, x1, y0, y1 };
  };
  const spikes = (s) => {
    const { W, H } = s;
    const top = new Array(W).fill(H);
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++)
      if (alpha(s, x, y) > 128) { top[x] = y; break; }
    let n = 0;
    for (let x = 0; x < W; x++) {
      if (top[x] === H) continue;
      const l = x - 4 >= 0 ? top[x - 4] : H, r = x + 4 < W ? top[x + 4] : H;
      if (top[x] + 6 <= l && top[x] + 6 <= r) {
        let w = 1;
        for (let k = x + 1; k < W && Math.abs(top[k] - top[x]) <= 2; k++) w++;
        if (w <= 3) n++;
        x += w - 1;
      }
    }
    return n;
  };
  // T1: rows in top 45% of skin bbox; interior dark runs 1-4px bordered by skin.
  const seams = (s, hue, baseLum, x0, x1) => {
    const bb = skinBBox(s, hue);
    if (!bb) return { rows: 0, rowsWith: { 1: 0, 2: 0, 3: 0 } };
    const y0 = bb.y0, y1 = Math.min(s.H - 1, bb.y0 + Math.floor((bb.y1 - bb.y0) * 0.45));
    let rows = 0; const withN = { 1: 0, 2: 0, 3: 0 };
    for (let y = y0; y <= y1; y++) {
      rows++;
      let runs = 0;
      for (let x = Math.max(1, x0); x < Math.min(s.W - 1, x1); x++) {
        const i = (y * s.W + x) * 4;
        const a = s.d[i + 3];
        const l0 = a > 16 ? lum(s.d[i], s.d[i + 1], s.d[i + 2]) : 0;
        if (a > 16 && l0 >= baseLum - 40) continue;
        // dark run start (painted seam/outline OR background gap)
        let w = 0;
        while (x < x1) {
          const j = (y * s.W + x) * 4;
          if (s.d[j + 3] > 16 && lum(s.d[j], s.d[j + 1], s.d[j + 2]) >= baseLum - 40) break;
          w++; x++;
        }
        const before = isSkin(s, x - w - 1, y, hue);
        const after = isSkin(s, x, y, hue);
        if (w >= 1 && w <= 4 && before && after) runs++;
      }
      for (const k of [1, 2, 3]) if (runs >= k) withN[k]++;
    }
    return { rows, rowsWith: withN };
  };
  // T3: solidity = skin area / convex hull area.
  const hullArea = (pts) => {
    if (pts.length < 3) return 0;
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    lo.pop(); hi.pop();
    const hull = lo.concat(hi);
    let area = 0;
    for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; area += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(area) / 2;
  };
  const solidity = (s, hue, x0, x1) => {
    const pts = [];
    let area = 0;
    for (let y = 0; y < s.H; y++) {
      let rowMin = -1, rowMax = -1;
      for (let x = x0; x <= x1; x++) if (isSkin(s, x, y, hue)) { area++; if (rowMin < 0) rowMin = x; rowMax = x; }
      if (rowMin >= 0) { pts.push([rowMin, y], [rowMax, y]); }
    }
    const hull = hullArea(pts);
    return hull > 0 ? area / hull : 1;
  };
  // T7: luminance bins (width 6) over the skin mask.
  const rampBins = (s, hue) => {
    const bins = new Map();
    let total = 0;
    for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
      if (!isSkin(s, x, y, hue)) continue;
      const i = (y * s.W + x) * 4;
      const b = Math.floor(lum(s.d[i], s.d[i + 1], s.d[i + 2]) / 6);
      bins.set(b, (bins.get(b) || 0) + 1);
      total++;
    }
    const kept = [...bins.entries()].filter(([, n]) => n >= total * 0.02);
    return { bins: kept.length, total };
  };
  const perHandReport = (s, places, gender, toolId, frameW) => {
    const cx = (frameW / 2) * RES;
    const steps = skinSteps(SKIN_TONES[1]);
    const [h0] = hsl(...hexRgb(SKIN_TONES[1].base));
    const baseL = lum(...hexRgb(steps.base));
    const hiL = lum(...hexRgb(steps.hi));
    const rep = { seams: [], thumbs: [], solids: [], nails: 0, knuckles: 0, bboxH: 0, bboxW: 0 };
    const bb = skinBBox(s, h0);
    if (bb) { rep.bboxH = bb.y1 - bb.y0 + 1; rep.bboxW = bb.x1 - bb.x0 + 1; }
    places.forEach((p, hi2) => {
      const joints = jointLayout({ ...p, wrist: [p.wrist[0] * RES - cx, p.wrist[1] * RES, p.wrist[2] * RES], size: p.size * RES }, spec(gender));
      // seam coverage per adjacent pair over prox+mid (t .3..1)
      const pairs = [['index', 'middle'], ['middle', 'ring'], ['ring', 'pinky']];
      const covs = pairs.map(([fa, fb]) => {
        const ja = joints[fa], jb = joints[fb];
        let hit = 0, tot = 0;
        for (let sg = 0; sg < 2; sg++) {
          const ax = (ja[sg].x + jb[sg].x) / 2, ay = (ja[sg].y + jb[sg].y) / 2;
          const bx = (ja[sg + 1].x + jb[sg + 1].x) / 2, by = (ja[sg + 1].y + jb[sg + 1].y) / 2;
          const n = Math.ceil(Math.hypot(bx - ax, by - ay));
          for (let i = Math.floor(n * 0.3); i <= n; i++) {
            tot++;
            const x = Math.round(ax + (bx - ax) * (i / n));
            const y = Math.round(s.H - 1 - (ay + (by - ay) * (i / n)));
            let dark = false;
            for (let dy = -1; dy <= 1 && !dark; dy++) for (let dx = -1; dx <= 1 && !dark; dx++) {
              const px = x + dx, py = y + dy;
              if (alpha(s, px, py) > 16) {
                const ii = (py * s.W + px) * 4;
                if (lum(s.d[ii], s.d[ii + 1], s.d[ii + 2]) < baseL - 40) dark = true;
              }
            }
            if (dark) hit++;
          }
        }
        return tot ? hit / tot : 0;
      });
      rep.seams.push(covs);
      // T2 thumb: protrusion past index axis + tip below index knuckle
      const ij = joints.index, tj = joints.thumb;
      const ax = ij[3].x - ij[0].x, ay = ij[3].y - ij[0].y;
      const al = Math.hypot(ax, ay) || 1;
      const perp = Math.abs((tj[3].x - ij[0].x) * ay - (tj[3].y - ij[0].y) * ax) / al;
      const below = ij[0].y - tj[3].y; // + = tip below index MCP (bake y-up)
      rep.thumbs.push({ perp, below });
      // T4 nails: distal-quarter disc, dip<=20 fingers; hi-lum component
      for (const f of ['index', 'middle', 'ring', 'pinky']) {
        const c = p.fingers?.[f];
        const dip = c?.dip ?? ((c?.pip ?? 30) * 2) / 3;
        if (dip > 20) continue;
        const j = joints[f];
        const cx2 = j[3].x + (j[2].x - j[3].x) * 0.25, cy2 = j[3].y + (j[2].y - j[3].y) * 0.25;
        let found = 0;
        for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
          const x = Math.round(cx2 + dx), y = Math.round(s.H - 1 - cy2 + dy);
          if (alpha(s, x, y) > 16) {
            const ii = (y * s.W + x) * 4;
            if (lum(s.d[ii], s.d[ii + 1], s.d[ii + 2]) >= baseL + 24) found++;
          }
        }
        if (found >= 3 && found <= 60) rep.nails++;
        else if (found > 60) rep.nails++; // merged highlight still counts as a nail read
      }
      // T5 knuckles: luminance maxima along the MCP row
      const mcpX = ['index', 'middle', 'ring', 'pinky'].map((f) => joints[f][0]);
      const yrow = Math.round(s.H - 1 - (mcpX.reduce((a, j) => a + j.y, 0) / 4) - 2);
      const xa = Math.round(Math.min(...mcpX.map((j) => j.x))) - 4;
      const xb = Math.round(Math.max(...mcpX.map((j) => j.x))) + 4;
      const prof = [];
      for (let x = xa; x <= xb; x++) {
        let best = -1;
        for (let dy = -3; dy <= 3; dy++) {
          const y = yrow + dy;
          if (alpha(s, x, y) > 16) {
            const ii = (y * s.W + x) * 4;
            best = Math.max(best, lum(s.d[ii], s.d[ii + 1], s.d[ii + 2]));
          }
        }
        prof.push(best);
      }
      let maxima = 0, lastM = -99;
      for (let i = 4; i < prof.length - 4; i++) {
        if (prof[i] < 0) continue;
        const lL = Math.min(...prof.slice(Math.max(0, i - 6), i).filter((v) => v >= 0));
        const lR = Math.min(...prof.slice(i + 1, i + 7).filter((v) => v >= 0));
        if (prof[i] - Math.min(lL, lR) >= 12 && prof[i] >= Math.max(...prof.slice(i - 1, i + 2)) && i - lastM >= 4) { maxima++; lastM = i; }
      }
      rep.knuckles = maxima;
      // T3 solidity per hand (split sprite on x around the place wrist)
    });
    return rep;
  };

  const out = {};
  const counts = {};
  const reports = {};
  const TWO = new Set(['keyboard', 'tap', 'edr']);
  for (const gender of ['male', 'female']) {
    for (const [tool, th] of Object.entries(TOOL_HANDS)) {
      const fr = POSES[th.rest];
      const spec0 = spec(gender);
      const sprite = bakeRig(th.rest, fr, spec0);
      const s = read(sprite.c);
      const hue = hsl(...hexRgb(SKIN_TONES[1].base))[0];
      const rep = perHandReport(s, fr.hands, gender, tool, fr.w);
      const seamRows = seams(s, hue, lum(...hexRgb(skinSteps(SKIN_TONES[1]).base)), 0, s.W);
      const mid = s.W / 2;
      const solids = TWO.has(tool)
        ? [solidity(s, hue, 0, Math.floor(mid)), solidity(s, hue, Math.ceil(mid), s.W - 1)]
        : [solidity(s, hue, 0, s.W - 1)];
      const ramp = rampBins(s, hue);
      const spk = spikes(s);
      counts[`${gender}:${tool}`] = { spikes: spk };
      reports[`${gender}:${tool}`] = { ...rep, solids, seamRows, ramp, top: sprite.top, bot: sprite.bot };
      if (gender === 'male') out[tool] = sprite.c.toDataURL();
      // T11: bake the whole keyed frame set for this tool (rest + cycle steps)
      const def = th.cycles[0];
      const marks = [def.ms.a / 2, def.ms.a, def.ms.a + def.ms.s / 3, def.ms.a + (2 * def.ms.s) / 3, def.ms.a + def.ms.s, def.ms.a + def.ms.s + def.ms.h / 2, def.ms.a + def.ms.s + def.ms.h + 40, def.ms.a + def.ms.s + def.ms.h + 120, def.ms.a + def.ms.s + def.ms.h + 260];
      let vspikes = 0;
      for (const t of marks) {
        const hf = handCycleFrame(tool, t, 0);
        const sp2 = bakeRig(hf.key, hf.frame, spec0);
        vspikes += spikes(read(sp2.c));
      }
      counts[`${gender}:${tool}`].variantSpikes = vspikes;
    }
  }
  return { out, counts, reports };
});
fs.mkdirSync('/tmp/mesh', { recursive: true });
for (const [k, v] of Object.entries(res.out)) fs.writeFileSync(`/tmp/mesh/${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('baked', Object.keys(res.out).length, 'tools x2 analysts x10 frames');
for (const [k, c] of Object.entries(res.counts)) console.log(`  spikes ${k}: ${c.spikes} (variants ${c.variantSpikes})`);
const bad = Object.entries(res.counts).filter(([, c]) => c.spikes > 0 || c.variantSpikes > 0);
console.log(bad.length ? `FAIL ${bad.length} sprites with spikes` : 'T11 SPIKES: all clean');
console.log(JSON.stringify(res.reports, null, 1));
await browser.close();
