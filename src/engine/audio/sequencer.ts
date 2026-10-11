/**
 * AUDIO: song model + deterministic sequencer.
 *
 * A song is a fixed grid: `bars` bars of 16 sixteenth-note steps. Each
 * track owns an instrument and an intensity layer (`bed` always plays,
 * `threat` fades in when enemies prowl nearby, `combat` only under fire)
 * and a list of bar patterns looped in order — real song structure lives
 * in the bar order (intro/verse/chorus/bridge is just the bar list).
 *
 * Hits are semitone offsets from the song's root (null = rest). A bare
 * number is a full-length hit; {s, v, d} overrides velocity (0-1 gain
 * scale) and length in steps.
 */

export type MusicLayer = 'bed' | 'threat' | 'combat';

export type InstName =
  | 'kick' | 'snare' | 'hat' | 'ohat' | 'bass' | 'gtr' | 'pad' | 'lead'
  | 'stab' | 'arp' | 'bell' | 'sub';

export interface Hit {
  s: number | null;
  v?: number;
  d?: number;
  /** extra semitone offsets played in the same hit (chords) */
  c?: number[];
}

export type Bar = (number | Hit | null)[];

export interface TrackDef {
  inst: InstName;
  layer: MusicLayer;
  gain?: number;
  /** octave multiplier on the root (0.5, 1, 2, 4); default by instrument */
  oct?: number;
  bars: Bar[];
}

export interface SongDef {
  bpm: number;
  /** root frequency Hz */
  root: number;
  bars: number;
  tracks: TrackDef[];
}

export interface NoteEvent {
  /** seconds from song start */
  t: number;
  dur: number;
  inst: InstName;
  freq: number;
  gain: number;
  layer: MusicLayer;
  /** index within the song — deterministic seed input */
  n: number;
}

const DEFAULT_OCT: Record<InstName, number> = {
  kick: 1, snare: 1, hat: 1, ohat: 1, bass: 1, gtr: 2, pad: 2, lead: 4,
  stab: 2, arp: 4, bell: 4, sub: 0.5,
};

const DEFAULT_GAIN: Record<InstName, number> = {
  kick: 0.9, snare: 0.5, hat: 0.16, ohat: 0.2, bass: 0.42, gtr: 0.3, pad: 0.16,
  lead: 0.2, stab: 0.2, arp: 0.16, bell: 0.24, sub: 0.34,
};

/** Default note length in sixteenth-steps when a hit doesn't set `d`. */
const DEFAULT_DUR: Record<InstName, number> = {
  kick: 1.2, snare: 1, hat: 0.4, ohat: 1.6, bass: 0.9, gtr: 0.95, pad: 64,
  lead: 1, stab: 3, arp: 0.9, bell: 6, sub: 64,
};

/** Pure: song -> ordered note events. Same input, same output, always. */
export function scheduleSong(song: SongDef): NoteEvent[] {
  const stepDur = 60 / song.bpm / 4;
  const out: NoteEvent[] = [];
  let n = 0;
  for (const track of song.tracks) {
    const oct = track.oct ?? DEFAULT_OCT[track.inst];
    for (let bar = 0; bar < song.bars; bar++) {
      const pat = track.bars[bar % track.bars.length];
      if (!pat) continue;
      for (let step = 0; step < 16 && step < pat.length; step++) {
        const raw = pat[step];
        if (raw === null || raw === undefined) continue;
        const hit: Hit = typeof raw === 'number' ? { s: raw } : raw;
        if (hit.s === null || hit.s === undefined) continue;
        const steps = hit.d ?? DEFAULT_DUR[track.inst];
        const semis = [hit.s, ...(hit.c ?? [])];
        for (const s of semis) {
          out.push({
            t: (bar * 16 + step) * stepDur,
            dur: steps * stepDur,
            inst: track.inst,
            freq: song.root * oct * 2 ** (s / 12),
            gain: (track.gain ?? DEFAULT_GAIN[track.inst]) * (hit.v ?? 1),
            layer: track.layer,
            n: n++,
          });
        }
      }
    }
  }
  out.sort((a, b) => a.t - b.t || a.n - b.n);
  return out;
}

export function songLength(song: SongDef): number {
  return (song.bars * 16 * 60) / song.bpm / 4;
}
