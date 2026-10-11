/**
 * AUDIO: bridge between the deterministic render graph (dsp/sequencer/
 * instruments/songs) and concrete Float32Array renders. Used by the Audio
 * facade for playback buffers, by vitest for determinism/headroom checks,
 * and by tools/render-audio.mjs for the evidence clips.
 */

import { mixInto, mulberry32 } from './dsp';
import { renderNote } from './instruments';
import { scheduleSong, songLength, type MusicLayer, type SongDef } from './sequencer';
import { STINGS } from './songs';

const LAYERS: MusicLayer[] = ['bed', 'threat', 'combat'];

/** Render every layer of a song to separate mono buffers (adaptive mixing). */
export function renderSong(song: SongDef, sr: number, seed: number): Record<MusicLayer, Float32Array> {
  const total = Math.ceil(songLength(song) * sr) + Math.ceil(sr * 0.5); // decay tail
  const bufs: Record<MusicLayer, Float32Array> = {
    bed: new Float32Array(total),
    threat: new Float32Array(total),
    combat: new Float32Array(total),
  };
  let noteIndex = 0;
  for (const ev of scheduleSong(song)) {
    const rng = mulberry32(seed + noteIndex * 2654435761);
    const note = renderNote(ev.inst, ev.freq, ev.dur, ev.gain, sr, Math.floor(rng() * 2 ** 31));
    mixInto(bufs[ev.layer], note, Math.floor(ev.t * sr), 1);
    noteIndex++;
  }
  // every layer is mixed at full gain in the worst case — scale all three
  // by one factor so a bed+threat+combat stack never crests the limiter
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const s = Math.abs(bufs.bed[i] + bufs.threat[i] + bufs.combat[i]);
    if (s > peak) peak = s;
  }
  if (peak > 0.98) {
    const scale = 0.98 / peak;
    for (const l of LAYERS) for (let i = 0; i < total; i++) bufs[l][i] *= scale;
  }
  return bufs;
}

/** Render a sting (win/lose/death/boss) to one mixed mono buffer. */
export function renderSting(name: string, sr: number, seed: number): Float32Array | null {
  const song = STINGS[name];
  if (!song) return null;
  const layers = renderSong(song, sr, seed);
  const total = Math.max(...LAYERS.map((l) => layers[l].length));
  const mix = new Float32Array(total);
  for (const l of LAYERS) mixInto(mix, layers[l], 0, 1);
  return mix;
}
