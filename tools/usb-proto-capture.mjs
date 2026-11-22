// Capture exact viewmodel frames with a paused Playwright clock.
// Usage: node tools/usb-proto-capture.mjs <output-dir> [base-url] [--slot N --tool ID]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
let output;
let baseUrlArg;
let slot = 3;
let tool = 'usb';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--slot') {
    slot = Number(args[++i]);
    if (!Number.isInteger(slot) || slot < 1) throw new Error('--slot must be a positive integer');
  } else if (args[i] === '--tool') {
    tool = args[++i] ?? '';
    if (!tool) throw new Error('--tool requires a tool ID');
  } else if (args[i].startsWith('--')) {
    throw new Error(`Unknown option ${args[i]}`);
  } else if (!output) output = args[i];
  else if (!baseUrlArg) baseUrlArg = args[i];
  else throw new Error(`Unexpected argument ${args[i]}`);
}
if (!output) throw new Error('Usage: node tools/usb-proto-capture.mjs <output-dir> [base-url] [--slot N --tool ID]');

const outDir = resolve(output);
const base = new URL(baseUrlArg ?? 'http://localhost:5173');
base.searchParams.set('debug', '1');
const baseUrl = base.href;
const dimensions = { width: 1920, height: 1080 };
const crop = { x: 640, y: 560, width: 640, height: 520 };
const analysts = ['male', 'female'];
const skins = ['s1', 's5'];
const fireOffsets = [0, 16, 20, 33, 50, 60, 66, 83, 100, 110, 133, 166, 200, 266, 350, 420];
const cycleOffsets = Array.from({ length: 28 }, (_, i) => Math.round((i * 1000) / 60));
const walkOffsets = [0, 314, 628, 942];
const errors = [];
const timings = [];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

try {
  for (const gender of analysts) {
    for (const skin of skins) {
      const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor: 1 });
      await context.addInitScript((skinId) => localStorage.setItem('cyberdoom.skin', skinId), skin);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${gender}/${skin}: ${error.message}`));
      await page.clock.install();
      await page.goto(baseUrl, { waitUntil: 'load', timeout: 60000 });
      const hasDebug = await page.evaluate(() => typeof window.__cd?.startMission === 'function');
      if (!hasDebug) throw new Error(`${gender}/${skin}: debug hooks did not load`);

      // Let the page load naturally, then stop its real-time clock before the
      // mission starts. All capture-time advancement below uses runFor().
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
      await page.evaluate(({ analyst, slot }) => {
        window.__cd.startMission('m12', analyst);
        window.__cd.setTool(slot);
      }, { analyst: gender, slot });
      await page.clock.runFor(1200);
      const prefix = `${gender}-${skin}`;
      const setup = await page.evaluate(() => {
        const state = window.__cd.state();
        return { clockMs: performance.now(), gameTime: state.stats.time, screen: state.screen, tool: state.tool };
      });
      if (setup.screen !== 'play' || setup.tool !== tool) {
        throw new Error(`${prefix}: expected M12 play with tool ${slot} (${tool}), got ${setup.screen}/${setup.tool}`);
      }
      await page.screenshot({ path: resolve(outDir, `${prefix}-rest.png`) });

      const fireStart = await page.evaluate(() => {
        window.__cd.fire();
        return { clockMs: performance.now(), gameTime: window.__cd.state().stats.time };
      });
      let advanced = 0;
      const fireFrames = [];
      for (const offsetMs of fireOffsets) {
        await page.clock.runFor(offsetMs - advanced);
        advanced = offsetMs;
        const before = await page.evaluate(() => ({
          clockMs: performance.now(),
          gameTime: window.__cd.state().stats.time,
        }));
        const clockOffsetMs = before.clockMs - fireStart.clockMs;
        const gameElapsedMs = (before.gameTime - fireStart.gameTime) * 1000;
        const clockErrorMs = clockOffsetMs - offsetMs;
        const gameErrorMs = gameElapsedMs - offsetMs;
        if (Math.abs(clockErrorMs) > 1) {
          throw new Error(`${prefix} +${offsetMs}ms: fake clock drifted by ${clockErrorMs.toFixed(2)}ms`);
        }
        if (Math.abs(gameErrorMs) > 34) {
          throw new Error(`${prefix} +${offsetMs}ms: game time drifted by ${gameErrorMs.toFixed(2)}ms`);
        }
        const state = `fire-${String(offsetMs).padStart(3, '0')}ms`;
        await page.screenshot({ path: resolve(outDir, `${prefix}-${state}.png`) });
        const afterClockMs = await page.evaluate(() => performance.now());
        if (Math.abs(afterClockMs - before.clockMs) > 0.1) {
          throw new Error(`${prefix} +${offsetMs}ms: screenshot advanced the paused clock`);
        }
        fireFrames.push({ offsetMs, clockOffsetMs, gameElapsedMs, clockErrorMs, gameErrorMs });
      }

      // Capture the whole cycle for WebP at 60 fps from a fresh trigger pull.
      await page.clock.runFor(600);
      const cycleStart = await page.evaluate(() => {
        window.__cd.fire();
        return { clockMs: performance.now(), gameTime: window.__cd.state().stats.time };
      });
      advanced = 0;
      const cycleFrames = [];
      for (const offsetMs of cycleOffsets) {
        await page.clock.runFor(offsetMs - advanced);
        advanced = offsetMs;
        const clockMs = await page.evaluate(() => performance.now());
        if (Math.abs(clockMs - cycleStart.clockMs - offsetMs) > 1) {
          throw new Error(`${prefix} cycle +${offsetMs}ms: fake clock did not land on target`);
        }
        const frame = `${prefix}-cycle-${String(offsetMs).padStart(3, '0')}ms.png`;
        await page.screenshot({ path: resolve(outDir, frame), clip: crop });
        cycleFrames.push(frame);
      }

      await page.clock.runFor(1000);
      await page.keyboard.down('w');
      await page.clock.runFor(600);
      const walkFrames = [];
      for (let i = 0; i < walkOffsets.length; i++) {
        if (i > 0) await page.clock.runFor(walkOffsets[i] - walkOffsets[i - 1]);
        const state = `walk-${i + 1}`;
        const path = resolve(outDir, `${prefix}-${state}.png`);
        await page.screenshot({ path });
        if (i === 1) await page.screenshot({ path: resolve(outDir, `${prefix}-walk.png`) });
        walkFrames.push({ state, offsetMs: walkOffsets[i] });
      }
      await page.keyboard.up('w');
      timings.push({
        analyst: gender,
        skin,
        setup,
        fireStart,
        fireFrames,
        cycleStart,
        cycleFrames,
        walkFrames,
      });
      await page.close();
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const python = String.raw`
from math import ceil
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont
import json
import sys

root = Path(sys.argv[1])
require_diffs = sys.argv[2] == "1"
analysts = ["male", "female"]
skins = ["s1", "s5"]
sample_offsets = [0, 16, 20, 33, 50, 60, 66, 83, 100, 110, 133, 166, 200, 266, 350, 420]
walk_states = ["walk-1", "walk-2", "walk-3", "walk-4"]
crop_box = (640, 560, 1280, 1080)
tile_w, tile_image_h, label_h, columns = 640, 520, 24, 4
diffs = []

def image_for(analyst, skin, state):
    return Image.open(root / f"{analyst}-{skin}-{state}.png").convert("RGB")

def make_crop(analyst, skin, state):
    image = image_for(analyst, skin, state)
    crop = image.crop(crop_box)
    crop.resize((crop.width * 3, crop.height * 3), Image.Resampling.NEAREST).save(
        root / f"{analyst}-{skin}-{state}-crop-3x.png"
    )
    return crop

for analyst in analysts:
    states = ["rest", *[f"fire-{offset:03d}ms" for offset in sample_offsets], *walk_states]
    rows = ceil((len(states) * len(skins)) / columns)
    sheet = Image.new("RGB", (columns * tile_w, rows * (tile_image_h + label_h)), "#111218")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    index = 0
    for skin in skins:
        for state in states:
            crop = make_crop(analyst, skin, state)
            x = (index % columns) * tile_w
            y = (index // columns) * (tile_image_h + label_h)
            sheet.paste(crop, (x, y + label_h))
            draw.text((x + 8, y + 5), f"{skin} / {state}", fill="#f0ece4", font=font)
            index += 1
        cycle_images = []
        for i in range(28):
            source = Image.open(root / f"{analyst}-{skin}-cycle-{round(i * 1000 / 60):03d}ms.png").convert("RGB")
            frame = source.resize((source.width * 3, source.height * 3), Image.Resampling.NEAREST)
            frame.save(root / f"{analyst}-{skin}-cycle-{round(i * 1000 / 60):03d}ms-crop-3x.png")
            cycle_images.append(frame)
        cycle_images[0].save(
            root / f"{analyst}-{skin}-fire-cycle.webp",
            format="WEBP",
            save_all=True,
            append_images=cycle_images[1:],
            duration=17,
            loop=0,
            lossless=True,
        )
        rest = image_for(analyst, skin, "rest").crop(crop_box)
        for offset in (60, 110):
            state = f"fire-{offset:03d}ms"
            sample = image_for(analyst, skin, state).crop(crop_box)
            diff = ImageChops.difference(rest, sample)
            pixels = diff.get_flattened_data()
            changed_pixels = sum(pixel != (0, 0, 0) for pixel in pixels)
            total_abs = sum(sum(pixel) for pixel in pixels)
            bbox = diff.getbbox()
            diff_path = root / f"{analyst}-{skin}-diff-rest-vs-{state}.png"
            ImageEnhance.Brightness(diff).enhance(3).save(diff_path)
            if changed_pixels == 0 and require_diffs:
                raise RuntimeError(f"{analyst}/{skin}: rest and {state} crops are identical")
            diffs.append({
                "analyst": analyst,
                "skin": skin,
                "comparison": f"rest vs {state}",
                "changedPixels": changed_pixels,
                "changedPercent": round(changed_pixels * 100 / (rest.width * rest.height), 4),
                "totalAbsChannelDiff": total_abs,
                "bbox": bbox,
                "diffImage": str(diff_path),
                "different": changed_pixels > 0,
            })
    sheet.save(root / f"{analyst}-contact.png")

(root / "pixel-diffs.json").write_text(json.dumps(diffs, indent=2) + "\n")
`;
const processed = spawnSync('python3', ['-c', python, outDir, process.env.USB_PROTO_ASSERT_DIFFS === '1' ? '1' : '0'], { stdio: 'inherit' });
if (processed.status !== 0) throw new Error(`Contact-sheet and WebP generation failed (${processed.status ?? processed.signal})`);
await writeFile(resolve(outDir, 'capture-timings.json'), `${JSON.stringify(timings, null, 2)}\n`);
if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
console.log(`Captured frame-exact USB prototype evidence into ${outDir}`);
