/**
 * AUDIO: offline evidence renderer. Runs under vite-node (no browser):
 * renders every score theme (with an adaptive-intensity arc), every sting,
 * and a labelled SFX reel to 16-bit WAV, then prints + writes a peak/loudness
 * report. Usage:
 *
 *   node_modules/.bin/vite-node tools/render-audio.ts -- /path/to/outdir
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav, loudnessLufs, mixInto, peakOf, softClip } from '../src/engine/audio/dsp';
import { renderSfx, SFX_DEFS } from '../src/engine/audio/sfxdef';
import { renderSong, renderSting } from '../src/engine/audio/render';
import { SONGS, STINGS } from '../src/engine/audio/songs';

const SR = 44100;
const OUT = process.argv[2] ?? 'audio-evidence';
mkdirSync(OUT, { recursive: true });

interface Row { file: string; seconds: number; peakDb: number; lufs: number }
const rows: Row[] = [];

const save = (file: string, x: Float32Array): void => {
  softClip(x, 1, 0.98);
  writeFileSync(join(OUT, file), Buffer.from(encodeWav(x, SR)));
  rows.push({
    file,
    seconds: +(x.length / SR).toFixed(2),
    peakDb: +(20 * Math.log10(Math.max(1e-9, peakOf(x)))).toFixed(2),
    lufs: +loudnessLufs(x, SR).toFixed(2),
  });
};

/** Theme clip: calm bed → threat swell (40%) → full combat (70%). */
for (const [name, song] of Object.entries(SONGS)) {
  const layers = renderSong(song, SR, 0xdec0de + name.length * 131);
  const n = layers.bed.length;
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const threat = t < 0.4 ? 0.04 : t < 0.7 ? 0.55 : 0.85;
    const combat = t < 0.7 ? 0 : 1;
    mix[i] = layers.bed[i] + layers.threat[i] * threat + layers.combat[i] * combat;
  }
  save(`theme-${name}.wav`, mix);
}

for (const name of Object.keys(STINGS)) {
  const buf = renderSting(name, SR, 0x5711a + name.length * 137);
  if (buf) save(`${name}.wav`, buf);
}

/** SFX reel: every registered recipe, in groups, 0.18 s gaps. */
const GAP = Math.floor(SR * 0.18);
const groups: Record<string, string[]> = {
  tools: [],
  enemies: [],
  voices: [],
  ui: [],
};
for (const name of Object.keys(SFX_DEFS)) {
  if (name.startsWith('vox-')) groups.voices.push(name);
  else if (/^(growl|idle|pain|death|attack|fire|sight)-/.test(name)) groups.enemies.push(name);
  else if (/^(kb|mouse|usb|badge|door-clunk|tap|edr|dry|lower|raise|new-tool|ammo|menu|fizzle|confirm|mfa|patch)-?/.test(name)) groups.tools.push(name);
  else groups.ui.push(name);
}
for (const [group, names] of Object.entries(groups)) {
  const bufs = names.map((n) => renderSfx(n, SR, 'male')!);
  const total = bufs.reduce((s, b) => s + b.length + GAP, 0);
  const reel = new Float32Array(total);
  let at = 0;
  for (const b of bufs) {
    mixInto(reel, b, at, 1);
    at += b.length + GAP;
  }
  save(`reel-${group}.wav`, reel);
}

writeFileSync(join(OUT, 'audio-report.json'), JSON.stringify(rows, null, 2));
console.log(`wrote ${rows.length} files to ${OUT}`);
for (const r of rows) console.log(`${r.file.padEnd(24)} ${r.seconds}s  peak ${r.peakDb} dBFS  ${r.lufs} LUFS`);
