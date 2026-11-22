// Capture USB viewmodel states for both analysts and the lightest/darkest skins.
// Usage: node tools/usb-proto-capture.mjs <output-dir> [base-url]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const output = process.argv[2];
if (!output) throw new Error('Usage: node tools/usb-proto-capture.mjs <output-dir> [base-url]');

const outDir = resolve(output);
const base = new URL(process.argv[3] ?? 'http://localhost:5173');
base.searchParams.set('debug', '1');
const baseUrl = base.href;
const dimensions = { width: 1920, height: 1080 };
const analysts = ['male', 'female'];
const skins = ['s1', 's5'];
const fireSamples = [
  { name: 'fire-020ms', at: 20 },
  { name: 'fire-060ms', at: 60 },
  { name: 'fire-110ms', at: 110 },
  { name: 'fire-200ms', at: 200 },
  { name: 'fire-350ms', at: 350 },
];
const errors = [];
const timings = [];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

try {
  for (const gender of analysts) {
    for (const skin of skins) {
      const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor: 1 });
      await context.addInitScript((skinId) => localStorage.setItem('cyberdoom.skin', skinId), skin);
      const pages = await Promise.all(fireSamples.map(async () => {
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(`${gender}/${skin}: ${error.message}`));
        await page.goto(baseUrl, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__cd?.startMission === 'function', null, { timeout: 30000 });
        await page.evaluate((analyst) => {
          window.__cd.startMission('m12', analyst);
          window.__cd.setTool(3);
        }, gender);
        await page.waitForTimeout(900);
        return page;
      }));

      await pages[0].screenshot({ path: resolve(outDir, `${gender}-${skin}-rest.png`) });
      await Promise.all(pages.map((page) => page.evaluate(() => window.__cd.fire())));
      const firedAt = Date.now();
      const fireTimings = await Promise.all(pages.map(async (page, index) => {
        const sample = fireSamples[index];
        await page.waitForTimeout(sample.at);
        const requestedMs = Date.now() - firedAt;
        await page.screenshot({ path: resolve(outDir, `${gender}-${skin}-${sample.name}.png`) });
        return {
          analyst: gender,
          skin,
          state: sample.name,
          requestedMs,
          completedMs: Date.now() - firedAt,
        };
      }));
      timings.push(...fireTimings);

      await pages[0].keyboard.down('w');
      await pages[0].waitForTimeout(300);
      await pages[0].screenshot({ path: resolve(outDir, `${gender}-${skin}-walk.png`) });
      await pages[0].waitForTimeout(300);
      await pages[0].keyboard.up('w');
      await Promise.all(pages.map((page) => page.close()));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const python = String.raw`
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

root = Path(sys.argv[1])
states = [
    "rest",
    "fire-020ms",
    "fire-060ms",
    "fire-110ms",
    "fire-200ms",
    "fire-350ms",
    "walk",
]
skins = ["s1", "s5"]
crop_box = (640, 560, 1280, 1080)
tile_w, tile_image_h, label_h = 640, 520, 24
columns = 4
rows = 4

for analyst in ["male", "female"]:
    sheet = Image.new("RGB", (columns * tile_w, rows * (tile_image_h + label_h)), "#111218")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    index = 0
    for skin in skins:
        for state in states:
            name = f"{analyst}-{skin}-{state}.png"
            image = Image.open(root / name).convert("RGB")
            crop = image.crop(crop_box)
            crop.resize((crop.width * 3, crop.height * 3), Image.Resampling.NEAREST).save(
                root / f"{analyst}-{skin}-{state}-crop-3x.png"
            )
            x = (index % columns) * tile_w
            y = (index // columns) * (tile_image_h + label_h)
            sheet.paste(crop, (x, y + label_h))
            draw.text((x + 8, y + 5), f"{skin} / {state}", fill="#f0ece4", font=font)
            index += 1
    sheet.save(root / f"{analyst}-contact.png")
`;
const processed = spawnSync('python3', ['-c', python, outDir], { stdio: 'inherit' });
if (processed.status !== 0) throw new Error(`Contact-sheet generation failed (${processed.status ?? processed.signal})`);
await writeFile(resolve(outDir, 'capture-timings.json'), `${JSON.stringify(timings, null, 2)}\n`);
if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
console.log(`Captured USB prototype evidence into ${outDir}`);
