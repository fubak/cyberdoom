# CYBERDOOM Audio Design

All music and SFX are 100% original procedural Web Audio — no samples, no
melodies lifted from Doom or any commercial track. Bobby Prince's work was
the study reference (tempo maps, riff grammar, how a track's density tracks
level intensity); every composition below is written from scratch for
CYBERDOOM.

## Sonic identity

Industrial/cyber metal on a darksynth skeleton, quantized like the rest of
the game: gritty, driving, minor-key, slightly lo-fi. Doom taught us the
grammar — a track that *states* the level's mood before the player sees a
threat — so each mission tier owns a theme and a tempo band:

- **early** (m01–m04): somber mid-tempo groove, ~112 BPM in E. Palm-muted
  chug arrives only when threats prowl — Prince's "slower ambient" lesson:
  restraint reads louder than speed.
- **mid** (m05–m08): driving 16th-note bass at 128 BPM, tritone stabs —
  E1M4-style menace without copying its melody.
- **late** (m09+): relentless 150 BPM chromatic push in D, double-kick
  pressure, dissonant stack — the E1M1 function (fast metal under combat),
  original construction.
- **title / briefing / debrief**: screen beds — darksynth drone (92 BPM),
  tense pulse (100 BPM), warm pads+bells (84 BPM) respectively.
- **rick**: the RICKROLL cheat tier — a jaunty major-key bounce at 120 BPM
  in C, deliberately cheerful against the industrial palette. Original tune;
  the joke is the contrast.
- **Stingers**: `sting-win` (E-riff + snare roll), `sting-lose` (doom slide),
  `sting-death` (power-chord slam), `sting-boss` (dissonant double-kick
  reveal — wired to the first ambush on boss-tier missions).

## Architecture

```
score (songs.ts) → sequencer.ts → instruments.ts ─┐
                                                  ├─→ dsp.ts render graph
sfx recipes (sfxdef.ts) ──────────────────────────┘      (deterministic)
                                                        ↓
audio.ts facade: AudioBuffer cache → bus graph → limiter → out
```

- **Deterministic render graph** (`src/engine/audio/dsp.ts`): seeded
  mulberry32 noise, RBJ biquads, Karplus-Strong plucks, formant voices.
  `Math.random` never runs in a render path — every buffer is reproducible
  bit-for-bit (proved in `tests/audio-overhaul.test.ts`).
- **Sequencer** (`sequencer.ts`): 16-step bars, `{inst, layer, bars}`
  tracks, semitone offsets from a song root, `Hit` objects for chords and
  multi-step sustains. Real song structure: 8–16 bar loops with
  intro/verse/chorus/bridge phrasing.
- **Instruments** (`instruments.ts`): synthesized kick/snare/hats, sub +
  saw bass, **palm-muted guitar** = Karplus-Strong root+fifth with heavy
  damping through a waveshaper and a ~3.4 kHz cab-sim lowpass (the chug),
  detuned-saw pads, square lead, bell partials.
- **SFX** (`sfxdef.ts`): every event name = layered recipe
  (transient + body + tail), rendered once to a mono buffer. Pain voices
  ship 2 deterministic variants (round-robin) so repeats don't replay a
  sample.
- **Runtime** (`audio.ts`): one `AudioContext`. Playing a sound = one
  `AudioBufferSourceNode` + gain + stereo panner — flat cost, no per-call
  oscillator storms. `tools/sfx.ts` delegates to the same engine
  (`bindAudio`), retiring its second context.

## Adaptive layering

Each theme renders three parallel loops — **bed**, **threat**, **combat** —
onto separate gain lanes. Mixing is live, per frame:

- `bed`: always on — the tier's identity.
- `threat`: swells (~0.55) while hostile voices have sounded in the last
  3.5 s (`growl/idle/pain/attack/fire/sight-*` all poke it), ~0.85 under
  combat — the "something is near" warning Bobby Prince never had the
  hardware for.
- `combat`: full stack only while `setCombat(true)` (already driven by the
  enemy-chase check in the sim).
- `musicDuck` still dips the whole score ~-7 dB under combat so hits read.

## SFX list (target character)

Tool use/impact, enemy voices, world events — every name in the registry:

| name | character |
|---|---|
| `kb-swing` / `kb-impact` | whoosh → hard crack + key-clack burst (keyboard melee) |
| `mouse-click` / `mouse-flag` | click tick; two-note flag chirp |
| `usb-fire` / `usb-hit` | scan crack + rising squelch; square zap hit |
| `badge-swipe` / `badge-ok` / `badge-deny` | card hiss; accept double-beep; low detuned rejection |
| `door-clunk` | dead-bolt thud + clack after reader accepts |
| `tap-sweep` | fast 6-step sweep chirps — packet-sniff scan |
| `edr-charge` / `edr-blast` | rising charge whine → discharge crack + low boom |
| `patch-insert` / `patch-fire` | insert clack; 4 write-chirps + commit thunk |
| `mfa-beep`, `confirm`, `ammo`, `new-tool` | auth beeps, UI confirms, pickup jingles |
| `dry` / `lower` / `raise` | empty-tool tick; holster/draw foley |
| `menu-move/pick/back`, `fizzle`, `click` | UI blips; failed-action fizzle |
| `fire`, `scan`, `clean`, `inspect`, `pickup` | legacy engine reports kept on registry |
| `step` (×2 variants) | soft boot scuff, low thud |
| `windup` | rising telegraph whine (stretchable to enemy windup dur) |
| `growl/idle/pain/death/attack/fire-<threat>` | per-threat vocal timbre — worm chirps, trojan servo garble, ransomware chain-slams, logicbomb beeps→detonation, rat chitter, rootkit sub-bass burrow |
| `sight-<threat>` | one-shot sighting bark per threat |
| `door`, `seal`, `unseal`, `switch`, `denied` | world machinery |
| `spawn`, `alarm` | teleport fog + thump; ambush klaxon |
| `evidence`, `objective` | pen-scratch + stamp (case file); objective-complete fanfare |
| `hurt`, `oof`, `death`, `bite`, `impact`, `enemy-*`, `kill` | player/enemy combat body — formant cries, crack+sub thump, kill punctuation |
| `win`, `lose`, `clean` | chime fanfare, doom slide, three-note clean chime |
| `vox-<pain|grunt|ready|pickup|death>` | gendered analyst voice — real vocal-tract formant banks (P&B 1952), not pitch-shifted |

## Mix plan

- **Buses**: `sfxBus → 32-step quant grit + 5.5 kHz LP`, `ambBus`,
  `layerGains → musicDuck → musicBus`, all into `master (0.45) → glue comp
  (-10 dB thr, 4 ms att) → brickwall limiter (-2 dB, ratio 20) → analyser →
  out`. `__cd.audioMeter()` taps post-limiter RMS/peak.
- **Sends**: sfx grit-tap → convolver (0.3); music duck → convolver (0.12).
- **Reverb**: synthesized stereo IR (decaying seeded noise + 3 early taps),
  `setRoomSize(openFrac)` from each mission's grid — 0.4–2.6 s tails.
- **Headroom**: every rendered buffer peak-normalizes at ≤0.95 (sfx) and
  every song's full 3-layer stack is scaled so it can't crest the limiter.
  Verified: all evidence clips peak ≤ -2.6 dBFS, nothing clips.
- **Loudness**: music lands ≈ -16..-22 LUFS integrated at unity mix; sfx
  sit ~18-20 dB above the bed so hits punch. Voice caps + steal-fade keep
  stacked combat inside budget.
- **CPU**: one buffer source per played event; ≤24 live voices; ambience is
  2 oscillators + 1 looped noise; songs are 3 looped buffers + 3 gains.
