/**
 * AUDIO: the CYBERDOOM score. All original compositions — industrial /
 * cyber-metal in the mission tiers, darksynth on the menus — built on the
 * song model in sequencer.ts. Nothing here quotes Doom's soundtrack or any
 * other track; the DNA is the same genre, not the same notes.
 *
 * Bar convention: arrays of 16 sixteenth-steps, semitone offsets from the
 * song root (0 = root, 3 = minor third, 6 = tritone, 7 = fifth, 12 = oct).
 * Layers: 'bed' always plays, 'threat' joins when enemies prowl, 'combat'
 * tops it off under fire.
 */

import type { Bar, SongDef } from './sequencer';

const H = (s: number, v?: number, d?: number, c?: number[]) => ({ s, v, d, c });

// ---------- TITLE: slow darksynth, a mainframe humming to itself ----------
const title: SongDef = {
  bpm: 92,
  root: 82.41, // E2
  bars: 8,
  tracks: [
    {
      inst: 'sub', layer: 'bed',
      bars: [
        [H(0, 0.8, 17)], [H(-2, 0.8, 18)], [H(3, 0.8, 18)], [H(0, 0.8, 17)],
        [H(0, 0.8, 17)], [H(-4, 0.8, 18)], [H(3, 0.8, 18)], [H(-2, 0.8, 18)],
      ],
    },
    {
      inst: 'pad', layer: 'bed',
      bars: [
        [H(0, 0.5, 64, [3, 7])], [], [], [],
        [H(-2, 0.5, 64, [1, 5])], [], [H(3, 0.45, 48, [6, 10])], [],
      ],
    },
    {
      inst: 'arp', layer: 'bed', gain: 0.12,
      bars: [
        [12, null, 15, null, 19, null, 15, null, 12, null, 15, null, 19, null, 22, null],
        [12, null, 15, null, 19, null, 15, null, 12, null, 15, null, 17, null, 15, null],
        [10, null, 14, null, 17, null, 14, null, 10, null, 14, null, 17, null, 19, null],
        [12, null, 15, null, 19, null, 15, null, 12, null, 15, null, 22, null, 19, null],
        [12, null, 15, null, 19, null, 15, null, 12, null, 15, null, 19, null, 22, null],
        [8, null, 12, null, 15, null, 12, null, 8, null, 12, null, 15, null, 17, null],
        [10, null, 13, null, 17, null, 13, null, 10, null, 13, null, 17, null, 20, null],
        [12, null, 15, null, 19, null, 15, null, 12, null, 14, null, 15, null, 12, null],
      ],
    },
    {
      inst: 'bell', layer: 'bed', gain: 0.2,
      bars: [
        [null, null, null, null, H(19, 0.6, 8), null, null, null, null, null, H(15, 0.5, 4)],
        [null, null, null, null, null, null, null, null, H(12, 0.5, 10)],
        [],
        [null, null, null, null, H(19, 0.55, 6), null, null, null, null, null, null, null, H(22, 0.5, 4)],
        [null, null, null, null, null, null, null, null, H(19, 0.5, 12)],
        [],
        [null, null, H(14, 0.45, 6), null, null, null, null, null, H(15, 0.5, 8)],
        [],
      ],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.5,
      bars: [[0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null], [], [], [], [], [], [], []],
    },
  ],
};

// ---------- BRIEFING: a tense quiet pulse while orders come in ----------
const briefing: SongDef = {
  bpm: 100,
  root: 55, // A1
  bars: 4,
  tracks: [
    {
      inst: 'sub', layer: 'bed',
      bars: [[H(0, 0.7, 17)], [H(0, 0.7, 18)], [H(-2, 0.7, 18)], [H(1, 0.65, 18)]],
    },
    {
      inst: 'bass', layer: 'bed', gain: 0.24,
      bars: [
        [0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null],
        [0, null, null, null, 0, null, null, null, -2, null, null, null, -2, null, null, null],
        [0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null],
        [1, null, null, null, 1, null, null, null, 3, null, null, null, 1, null, null, null],
      ],
    },
    {
      inst: 'hat', layer: 'bed', gain: 0.1,
      bars: [
        [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null],
        [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, 0],
        [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null],
        [null, null, 0, null, null, null, 0, null, null, null, 0, 0, null, null, 0, 0],
      ],
    },
    {
      inst: 'pad', layer: 'bed', gain: 0.12,
      bars: [[H(0, 0.5, 64, [3, 7])], [], [H(-2, 0.45, 64, [2, 5])], []],
    },
  ],
};

// ---------- EARLY (m01-m04): somber groove, the graveyard shift ----------
const early: SongDef = {
  bpm: 112,
  root: 82.41, // E2
  bars: 8,
  tracks: [
    // bed: bass pulse + basic kit
    {
      inst: 'bass', layer: 'bed',
      bars: [
        [0, null, 0, null, -2, null, 0, null, 0, null, 0, null, -4, null, -2, null],
        [0, null, 0, null, -2, null, 0, null, 3, null, 3, null, 1, null, 0, null],
        [0, null, 0, null, -2, null, 0, null, 0, null, 0, null, -4, null, -2, null],
        [0, null, 0, null, -2, null, 0, null, 3, null, 5, null, 3, null, 1, null],
        [0, null, 0, null, -2, null, 0, null, 0, null, 0, null, -4, null, -2, null],
        [0, null, 0, null, -2, null, 0, null, 3, null, 3, null, 1, null, 0, null],
        [0, null, 0, null, -2, null, 0, null, 0, null, 0, null, -4, null, -2, null],
        [5, null, 5, null, 3, null, 3, null, 1, null, 0, null, -2, null, -4, null],
      ],
    },
    {
      inst: 'sub', layer: 'bed', gain: 0.22,
      bars: [[H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(-2, 0.5, 32)]],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.7,
      bars: [
        [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null],
        [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, 0, null],
      ],
    },
    {
      inst: 'snare', layer: 'bed', gain: 0.4,
      bars: [[null, null, null, null, null, null, null, null, null, null, null, null, 0, null, null, null]],
    },
    {
      inst: 'pad', layer: 'bed', gain: 0.1,
      bars: [[H(0, 0.5, 64, [3, 7])], [], [H(-2, 0.4, 64, [2, 5])], [], [H(0, 0.45, 64, [3, 7])], [], [H(3, 0.4, 64, [7, 10])], []],
    },
    // threat: palm-muted chug + hats
    {
      inst: 'gtr', layer: 'threat', gain: 0.24,
      bars: [
        [0, 0, -2, 0, 0, -2, 0, 0, 0, 0, -2, 0, 0, 3, 0, -2],
        [0, 0, -2, 0, 0, -2, 0, 0, 0, 0, 3, 0, 0, 5, 3, 1],
        [0, 0, -2, 0, 0, -2, 0, 0, 0, 0, -2, 0, 0, 3, 0, -2],
        [0, 0, -2, 0, 0, -2, 0, 0, 5, 5, 3, 5, 3, 1, 0, -2],
      ],
    },
    {
      inst: 'hat', layer: 'threat',
      bars: [
        [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null],
        [null, null, 0, null, null, null, 0, 0, null, null, 0, null, null, null, 0, 0],
      ],
    },
    {
      inst: 'snare', layer: 'threat', gain: 0.35,
      bars: [[null, null, null, null, 0, null, null, null, null, null, null, null, 0, null, null, 0]],
    },
    // combat: lead motif + double-time kick + stab accents
    {
      inst: 'lead', layer: 'combat', gain: 0.16,
      bars: [
        [12, null, null, 10, null, null, 7, null, null, null, 12, null, null, null, null, null],
        [14, null, null, 12, null, null, 10, null, null, 7, null, null, null, null, null, null],
        [12, null, null, 10, null, null, 7, null, null, null, 15, null, 14, null, 12, null],
        [10, null, 12, null, 7, null, null, null, null, null, null, null, null, null, null, null],
      ],
    },
    {
      inst: 'kick', layer: 'combat', gain: 0.65,
      bars: [
        [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null],
      ],
    },
    {
      inst: 'ohat', layer: 'combat',
      bars: [[null, null, null, null, 0, null, null, null, null, null, null, null, 0, null, null, null]],
    },
    {
      inst: 'stab', layer: 'combat', gain: 0.14,
      bars: [[H(0, 0.8, 3, [3, 7]), null, null, null, null, null, null, null, H(-2, 0.7, 3, [2, 5])]],
    },
  ],
};

// ---------- MID (m05-m08): driving 16ths, the network is fighting back ----------
const mid: SongDef = {
  bpm: 128,
  root: 82.41, // E2
  bars: 8,
  tracks: [
    {
      inst: 'bass', layer: 'bed', gain: 0.4,
      bars: [
        [0, 0, -2, 0, 3, 0, -2, 3, 0, 0, 5, 3, -2, 0, -4, -2],
        [0, 0, -2, 0, 3, 0, -2, 3, 0, 0, 5, 3, -2, 0, 7, 5],
        [0, 0, -2, 0, 3, 0, -2, 3, 0, 0, 5, 3, -2, 0, -4, -2],
        [0, 0, -2, 0, 3, 0, -2, 3, 5, 5, 7, 5, 3, 1, 0, -2],
      ],
    },
    {
      inst: 'sub', layer: 'bed', gain: 0.18,
      bars: [[H(0, 0.45, 32)], [H(0, 0.45, 32)], [H(0, 0.45, 32)], [H(-2, 0.45, 32)]],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.75,
      bars: [[0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null]],
    },
    {
      inst: 'snare', layer: 'bed', gain: 0.45,
      bars: [[null, null, null, null, 0, null, null, null, null, null, null, null, 0, null, null, null]],
    },
    {
      inst: 'hat', layer: 'bed', gain: 0.12,
      bars: [[null, null, 0, null, null, null, 0, 0, null, null, 0, null, null, null, 0, 0]],
    },
    {
      inst: 'pad', layer: 'bed', gain: 0.09,
      bars: [[H(0, 0.5, 64, [3, 6])], [], [], [], [H(-2, 0.45, 64, [1, 5])], [], [], []],
    },
    // threat: chug answers the bass, faster hats
    {
      inst: 'gtr', layer: 'threat', gain: 0.26,
      bars: [
        [0, -2, 0, 0, -2, 0, 0, 3, 0, -2, 0, 0, -2, 0, 0, 1],
        [0, -2, 0, 0, -2, 0, 0, 3, 5, 3, 5, 5, 3, 1, 0, -2],
      ],
    },
    {
      inst: 'hat', layer: 'threat', gain: 0.13,
      bars: [[0, null, 0, 0, 0, null, 0, 0, 0, null, 0, 0, 0, null, 0, 0]],
    },
    {
      inst: 'snare', layer: 'threat', gain: 0.3,
      bars: [[null, null, null, null, 0, null, null, 0, null, null, null, null, 0, null, 0, 0]],
    },
    // combat: stabbing dissonance and a running lead
    {
      inst: 'lead', layer: 'combat', gain: 0.15,
      bars: [
        [12, null, 12, null, 15, null, 14, null, 12, null, 10, null, 12, null, null, null],
        [15, null, 14, null, 12, null, 10, null, 7, null, 10, null, null, null, null, null],
      ],
    },
    {
      inst: 'stab', layer: 'combat', gain: 0.13,
      bars: [
        [H(0, 0.8, 3, [3, 6]), null, null, null, null, null, H(-1, 0.7, 3, [2, 5]), null, H(1, 0.7, 3, [4, 7])],
      ],
    },
    {
      inst: 'kick', layer: 'combat', gain: 0.6,
      bars: [[null, null, 0, null, null, null, 0, 0, null, null, 0, null, null, null, 0, 0]],
    },
    {
      inst: 'ohat', layer: 'combat',
      bars: [[null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null]],
    },
  ],
};

// ---------- LATE (m09-m12): relentless, dissonant, all units down ----------
const late: SongDef = {
  bpm: 150,
  root: 73.42, // D2
  bars: 8,
  tracks: [
    {
      inst: 'bass', layer: 'bed', gain: 0.42,
      bars: [
        [0, 0, -1, 0, 0, 3, -1, 0, 0, 0, 5, 0, 3, 0, -1, -2],
        [0, 0, -1, 0, 0, 3, -1, 0, 6, 6, 5, 6, 3, 1, 0, -1],
        [0, 0, -1, 0, 0, 3, -1, 0, 0, 0, 5, 0, 3, 0, -1, -2],
        [1, 1, 0, 1, 1, 4, 1, 0, 6, 6, 5, 6, 8, 6, 5, 3],
      ],
    },
    {
      inst: 'sub', layer: 'bed', gain: 0.2,
      bars: [[H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(0, 0.5, 32)], [H(1, 0.45, 32)]],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.8,
      bars: [[0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, 0, null]],
    },
    {
      inst: 'snare', layer: 'bed', gain: 0.5,
      bars: [[null, null, null, null, 0, null, null, null, null, null, null, null, 0, null, null, 0]],
    },
    {
      inst: 'hat', layer: 'bed', gain: 0.13,
      bars: [[0, null, 0, 0, 0, null, 0, 0, 0, null, 0, 0, 0, null, 0, 0]],
    },
    // threat: chromatic chug wall
    {
      inst: 'gtr', layer: 'threat', gain: 0.28,
      bars: [
        [0, -1, 0, 0, -1, 0, 0, -1, 0, -1, 0, 0, 3, 0, -1, 0],
        [0, -1, 0, 0, -1, 0, 0, -1, 6, 5, 6, 6, 3, 1, 0, -1],
      ],
    },
    {
      inst: 'hat', layer: 'threat', gain: 0.14,
      bars: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    },
    {
      inst: 'snare', layer: 'threat', gain: 0.35,
      bars: [[null, null, null, null, 0, null, 0, null, null, null, null, null, 0, null, 0, 0]],
    },
    // combat: tritone lead, double-kick roll
    {
      inst: 'lead', layer: 'combat', gain: 0.16,
      bars: [
        [12, 13, null, 12, null, 10, 12, null, 18, null, 15, 13, null, 12, 10, 8],
        [13, null, 12, 10, null, 12, 13, null, 12, null, 10, null, 8, null, 6, null],
      ],
    },
    {
      inst: 'stab', layer: 'combat', gain: 0.14,
      bars: [
        [H(0, 0.8, 3, [6]), null, null, H(-1, 0.75, 3, [5]), null, null, H(1, 0.75, 3, [7]), null, H(0, 0.8, 2, [6])],
      ],
    },
    {
      inst: 'kick', layer: 'combat', gain: 0.7,
      bars: [[0, null, 0, null, 0, null, 0, 0, 0, null, 0, null, 0, null, 0, 0]],
    },
    {
      inst: 'ohat', layer: 'combat',
      bars: [[null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null]],
    },
  ],
};

// ---------- DEBRIEF: exhaled pads while the report prints ----------
const debrief: SongDef = {
  bpm: 84,
  root: 110, // A2
  bars: 4,
  tracks: [
    {
      inst: 'pad', layer: 'bed', gain: 0.16,
      bars: [
        [H(0, 0.6, 64, [4, 7])], [H(-4, 0.55, 64, [0, 3])],
        [H(-2, 0.55, 64, [2, 5])], [H(0, 0.5, 64, [3, 7])],
      ],
    },
    {
      inst: 'sub', layer: 'bed', gain: 0.18,
      bars: [[H(0, 0.5, 18)], [H(-4, 0.5, 18)], [H(-2, 0.5, 18)], [H(0, 0.5, 18)]],
    },
    {
      inst: 'bell', layer: 'bed', gain: 0.18,
      bars: [
        [null, null, H(12, 0.5, 8), null, null, null, null, null, H(16, 0.45, 8)],
        [null, null, null, null, null, null, H(14, 0.45, 10)],
        [null, null, H(12, 0.5, 8), null, null, null, null, null, H(19, 0.4, 8)],
        [null, null, null, null, null, null, H(16, 0.45, 12)],
      ],
    },
    {
      inst: 'arp', layer: 'bed', gain: 0.08,
      bars: [
        [12, null, null, 16, null, null, 19, null, null, 16, null, null, 12, null, null, null],
        [11, null, null, 14, null, null, 16, null, null, 14, null, null, 11, null, null, null],
        [12, null, null, 15, null, null, 19, null, null, 15, null, null, 12, null, null, null],
        [14, null, null, 17, null, null, 21, null, null, 17, null, null, 14, null, null, null],
      ],
    },
  ],
};

// ---------- RICK (cheat): jaunty major-key bounce, original melody ----------
const rick: SongDef = {
  bpm: 120,
  root: 130.81, // C3
  bars: 4,
  tracks: [
    {
      inst: 'bass', layer: 'bed', gain: 0.4,
      bars: [
        [0, null, 4, null, 7, null, 4, null, 0, null, 4, null, 7, null, 9, null],
        [5, null, 9, null, 12, null, 9, null, 7, null, 4, null, 0, null, -5, null],
        [0, null, 4, null, 7, null, 4, null, 0, null, 4, null, 7, null, 9, null],
        [5, null, 9, null, 7, null, 5, null, 4, null, 7, null, 12, null, 11, null],
      ],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.75,
      bars: [[0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null]],
    },
    {
      inst: 'snare', layer: 'bed', gain: 0.45,
      bars: [[null, null, null, null, 0, null, null, null, null, null, null, null, 0, null, null, null]],
    },
    {
      inst: 'hat', layer: 'bed', gain: 0.13,
      bars: [[0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, 0]],
    },
    {
      inst: 'stab', layer: 'bed', gain: 0.14,
      bars: [
        [H(0, 0.7, 3, [4, 7]), null, null, null, null, null, null, null, H(5, 0.7, 3, [9, 12])],
        [H(7, 0.7, 3, [11, 14]), null, null, null, null, null, null, null, H(4, 0.7, 3, [7, 11])],
      ],
    },
    {
      inst: 'lead', layer: 'bed', gain: 0.2,
      bars: [
        [12, null, 16, null, 19, 16, null, 12, null, 14, null, 16, 19, null, 21, null],
        [23, null, 19, 21, 23, null, 19, null, 16, null, 14, null, 12, null, null, null],
        [12, null, 16, null, 19, 16, null, 12, null, 14, null, 16, 19, null, 21, null],
        [19, null, 16, null, 14, null, 12, null, 14, null, 16, null, 12, null, 12, null],
      ],
    },
    {
      inst: 'bell', layer: 'bed', gain: 0.12,
      bars: [[], [null, null, null, null, null, null, null, null, null, null, null, null, null, null, H(24, 0.5, 8)], []],
    },
  ],
};

// ---------- stingers (one-shot, not loops) ----------
const stingWin: SongDef = {
  bpm: 130,
  root: 82.41,
  bars: 2,
  tracks: [
    {
      inst: 'kick', layer: 'bed', gain: 0.8,
      bars: [[0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null], [0, null, null, null, 0, null, null, null, 0, null, null, null, null, null, null, null]],
    },
    {
      inst: 'snare', layer: 'bed',
      bars: [[null, null, null, null, 0, null, null, null, null, null, null, null, 0, null, 0, 0], [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]],
    },
    {
      inst: 'gtr', layer: 'bed', gain: 0.3,
      bars: [
        [H(0, 1, 6, [7]), null, null, null, H(3, 1, 6, [10]), null, null, null, H(5, 1, 6, [12]), null, null, null],
        [H(7, 1, 14, [12, 16])],
      ],
    },
    {
      inst: 'bell', layer: 'bed', gain: 0.22,
      bars: [[], [H(19, 0.6, 6), null, H(16, 0.55, 6), null, H(12, 0.5, 8), null, H(7, 0.5, 10)]],
    },
    {
      inst: 'sub', layer: 'bed',
      bars: [[H(0, 0.6, 34)], [H(7, 0.6, 34)]],
    },
  ],
};

const stingLose: SongDef = {
  bpm: 96,
  root: 55, // A1
  bars: 2,
  tracks: [
    {
      inst: 'sub', layer: 'bed', gain: 0.4,
      bars: [[H(0, 0.8, 34)], [H(-5, 0.7, 34)]],
    },
    {
      inst: 'pad', layer: 'bed', gain: 0.2,
      bars: [[H(0, 0.6, 64, [3, 6])], [H(-1, 0.55, 64, [2, 6])]],
    },
    {
      inst: 'gtr', layer: 'bed', gain: 0.22,
      bars: [
        [H(0, 1, 8, [6]), null, null, null, null, null, null, null, null, null, null, null],
        [H(-1, 0.9, 12, [5]), null, null, null, null, null, null, null],
      ],
    },
    {
      inst: 'bell', layer: 'bed', gain: 0.16,
      bars: [[], [H(3, 0.4, 16), null, null, null, null, null, null, null, H(1, 0.35, 12)]],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.6,
      bars: [[0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null], [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]],
    },
  ],
};

const stingDeath: SongDef = {
  bpm: 120,
  root: 61.74, // B1
  bars: 1,
  tracks: [
    {
      inst: 'gtr', layer: 'bed', gain: 0.5,
      bars: [[H(0, 1, 16, [6])]],
    },
    {
      inst: 'sub', layer: 'bed', gain: 0.5,
      bars: [[H(-12, 0.8, 18)]],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.8,
      bars: [[0, null, null, null, 0, null, null, null, null, null, null, null, null, null, null, null]],
    },
    {
      inst: 'snare', layer: 'bed', gain: 0.5,
      bars: [[0, null, null, null, 0, null, 0, 0]],
    },
    {
      inst: 'bell', layer: 'bed', gain: 0.14,
      bars: [[null, null, null, null, null, null, null, null, H(1, 0.4, 24)]],
    },
  ],
};

const stingBoss: SongDef = {
  bpm: 140,
  root: 73.42, // D2
  bars: 2,
  tracks: [
    {
      inst: 'gtr', layer: 'bed', gain: 0.4,
      bars: [
        [H(0, 1, 3, [6]), null, null, H(0, 0.9, 3, [6]), null, null, H(0, 1, 3, [6]), null, H(-1, 0.9, 3, [5]), null, null, null, null, null],
        [H(1, 1, 4, [7]), null, null, null, H(0, 1, 6, [6])],
      ],
    },
    {
      inst: 'kick', layer: 'bed', gain: 0.75,
      bars: [
        [0, null, null, 0, null, null, 0, null, 0, null, null, null, null, null, null, null],
        [0, null, null, null, 0, null, 0, null, 0, null, null, null, null, null, null, null],
      ],
    },
    {
      inst: 'snare', layer: 'bed', gain: 0.45,
      bars: [[], [null, null, null, null, 0, null, 0, 0, 0, null, null, null, null, null, null, null]],
    },
    {
      inst: 'lead', layer: 'bed', gain: 0.18,
      bars: [[], [H(6, 0.7, 4), null, null, null, H(12, 0.75, 4), null, null, null, H(13, 0.8, 8)]],
    },
    {
      inst: 'sub', layer: 'bed', gain: 0.4,
      bars: [[H(0, 0.7, 34)], [H(0, 0.7, 18)]],
    },
  ],
};

export const SONGS: Record<string, SongDef> = {
  title, briefing, early, mid, late, debrief, rick,
};

export const STINGS: Record<string, SongDef> = {
  'sting-win': stingWin,
  'sting-lose': stingLose,
  'sting-death': stingDeath,
  'sting-boss': stingBoss,
};
