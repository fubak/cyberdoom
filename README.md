# CYBERDOOM

A Doom-style first-person cybersecurity training game built with Three.js.
Play an SOC analyst clearing 12 missions that teach CompTIA Security+ SY0-701
objectives — your weapons are IT tools: keyboard, mouse, USB scanner, badge,
network tap, EDR console, MFA token, and patch disk.

Play: https://fubak.github.io/cyberdoom/ (deployed from `main` by
`.github/workflows/pages.yml`, which also runs the e2e job on PRs).

## Scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Vite dev server (`--host`)                 |
| `npm run build`     | `tsc --noEmit` + `vite build`              |
| `npm run typecheck` | TypeScript strict check                    |
| `npm run test`      | Vitest unit/content tests                  |
| `npm run verify`    | typecheck + tests                          |
| `npm run e2e`       | Playwright end-to-end suite (`tests/e2e/`) |
| `npm run preview`   | Serve the production build                 |

`BASE_PATH` env var controls the Vite `base` (default `/`) so builds can be
deployed under sub-paths, e.g. `BASE_PATH=/r/3/ npm run build`.

## Architecture

Data-driven, thin typed coupling between areas via `src/core/` contracts
(`types.ts`, `events.ts`, `registry.ts`):

| Area            | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`     | Contracts only: Mission/MapDef/EntityDef/ToolDef types, event bus, registry. The API between areas.                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/engine/`   | Fixed-timestep loop helpers, input (pointer lock, WASD, wheel, slots, Q cycle), Doom-like momentum/friction movement with wall sliding (`map.ts` circle-vs-grid resolve), door state, raycast, NPC/enemy AI, particle system (`fx.ts`), procedural WebAudio SFX (`audio.ts`). Pure logic, no Three.js.                                                                                                                                                                                 |
| `src/render/`   | 4× internal frame: 320×200 base ×4 = 1280×800 render target with a 128 px status bar, integer-scaled to the display. Level geometry from the grid (per-texture merged meshes, per-door removable meshes), procedural textures (64×4 px tiles in `textures.ts`) and billboard sprites generated in module Web Workers (`genpool.ts`, `genworker.ts`) with a synchronous fallback, resumable software rasterizer for monster sprites (`model.ts`), sector light via vertex colors + fog. |
| `src/tools/`    | Tool registry + tool modules (`ToolDef`: id/name/slot/blurb/viewmodel draw/`use(ctx)`/`hint(ctx)`/ammo). All 8 slots below.                                                                                                                                                                                                                                                                                                                                                            |
| `src/content/`  | SY0-701 objective catalog (`objectives.ts`), curriculum arc (`curriculum.ts`), glossary, mission data files (`missions/m0X-*.ts`). Facts must stay accurate to the published objectives.                                                                                                                                                                                                                                                                                               |
| `src/missions/` | `MissionRuntime`: spawns entities, tracks mission objectives, scoring/events for the debrief, win/lose. `prepareMission`-style idle-time setup happens in `main.ts`.                                                                                                                                                                                                                                                                                                                   |
| `src/ui/`       | Canvas HUD status bar (integrity, ammo, gendered face, creds, ticker, objectives, LMB/E action prompt) + HTML/CSS overlay screens (title, char select, mission select, briefing, debrief quiz, pause, automap, evidence log).                                                                                                                                                                                                                                                          |
| `src/main.ts`   | State machine: title → character-select → mission-select → briefing → (loading) → play → debrief. Fixed 60Hz accumulator loop; background mission prep while the briefing is up; wires everything via core contracts.                                                                                                                                                                                                                                                                  |

## Tools

| Slot | Tool        | Security+ concept                                           | What LMB does                                                                                                                                     |
| ---- | ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | KEYBOARD    | Incident response containment (kill process / isolate)      | Point-blank strike (1.5 tiles, infinite): runs a kill-process/isolate on the malware or command on a console in front of you.                     |
| 2    | MOUSE       | Analysis & triage (indicator review)                        | Click to inspect a target's indicators; click again to flag it malicious (flags boost scanner damage; wrong flags are scored).                    |
| 3    | USB SCANNER | Antimalware / endpoint protection (trusted scanner media)   | Plug into a workstation at arm's length to boot a scan & quarantine; fire at roaming malware from range. Limited scan sessions.                   |
| 4    | BADGE       | Access badge + role-based access control                    | Swipe at a badge-reader door; opens only for roles you're authorised for (off-role swipes are logged violations).                                 |
| 5    | NETWORK TAP | Network tap / passive sensor (packet capture)               | Sweeps a cone and copies traffic of every host in view; shows raw flows for you to read — it decides nothing.                                     |
| 6    | EDR CONSOLE | EDR/XDR (automated detection and containment)               | Charge, then release a containment pulse that isolates infected endpoints and malware processes nearby — no line of sight needed. Scarce charges. |
| 7    | MFA TOKEN   | Multifactor authentication (FIDO2 security key + biometric) | After a badge swipe on an MFA reader, touch the token as the second factor; refuses phishing/shared-account prompts.                              |
| 8    | PATCH DISK  | Patch management (vendor security update)                   | Install the security update on a clean workstation at arm's length to close its vulnerability (clean infected hosts first). Limited disks.        |

## Missions

Twelve-mission campaign arc (`src/content/curriculum.ts`). `built: false`
missions are in progress and not playable yet.

| #   | Title               | Difficulty | Objectives              | Status      |
| --- | ------------------- | ---------- | ----------------------- | ----------- |
| M01 | PATCH TUESDAY       | 1          | 2.4, 2.2, 2.5, 3.4, 5.6 | built       |
| M02 | NEED TO KNOW        | 3          | 4.6, 1.2, 5.6           | built       |
| M03 | THE QUIET ONE       | 6          | 4.9, 2.1, 2.4, 3.3, 4.8 | built       |
| M04 | HOOK, LINE & SINKER | 6          | 5.6, 2.2, 4.5, 2.4      | built       |
| M05 | CHANGE FREEZE       | 6          | 1.3, 1.1, 4.3, 5.1      | built       |
| M06 | KEYMASTER           | 7          | 1.4, 3.3, 4.6           | built       |
| M07 | SEGMENT FAULT       | 7          | 3.2, 3.1, 4.5, 2.3      | in progress |
| M08 | ZERO DAY            | 8          | 2.3, 4.3, 4.1           | built       |
| M09 | LOCKED OUT          | 8          | 4.8, 3.4, 4.9           | built       |
| M10 | THIRD PARTY         | 9          | 5.3, 5.2, 2.2, 3.1      | built       |
| M11 | AUDIT NIGHT         | 9          | 4.2, 5.4, 5.5, 5.1      | built       |
| M12 | ROBO SOC            | 10         | 4.7, 4.4, 3.2, 2.5      | built       |

## Controls

- **WASD** move · **mouse** look · **←→** turn · **Shift** run
- **LMB** (or **F**) use the current tool · **E/Space** interact
- **1–9 / Numpad / mouse wheel / Q** select tool
- **L** evidence log (case files) · **M** automap · **Esc** pause menu / back
- The HUD shows **[LMB]** and **[E]** action prompts for whatever you're
  aiming at, so you always know what a click or keypress will do.

## Debug hooks (Playwright automation)

Append `?debug=1` to expose `window.__cd`:

- `__cd.state()` → `{ screen, mission, x, y, angle, integrity, tool, owned, ammo, score, dossier, stats, roles, inventory, lossReason, objectives[], entities[] }`
- `__cd.startMission(id, gender)` — skip menus
- `__cd.teleport(x, y, angle?)` — snaps to a walkable tile
- `__cd.fire()` — pull the trigger once (no pointer lock needed)
- `__cd.setTool(slot)`
- `__cd.setIntegrity(v)`
- `__cd.evidence()` — collected evidence entries
- `__cd.toggleLog()` — open/close the evidence log
- `__cd.probe(kind, dist, withImages?)` / `__cd.stage(kind, dist)` — threat-readability probe / place a staged threat for captures
- `__cd.texInfo()` / `__cd.hurtUniform()` — render internals
- `__cd.genCompare(keys)` — byte-compare worker-generated pixels vs a local rerun
- `__cd.audioMeter()` / `__cd.playSfx(name)` — audio debug

Deep link: `/?mission=m01&gender=female` jumps straight into a mission
(combine with `debug=1`).

## Testing

`tests/` covers content validation (valid objective refs, exactly one correct
answer per question with per-option explanations, rectangular wall-enclosed
maps with BFS-reachable exits, entity reachability), movement/collision, the
tool registry, HUD hint rules (no verdict leaks), engine FX/input, sprite
rasterizer parity, and per-mission walkthrough wins.

Browser end-to-end smoke tests live in `tests/e2e/` (Playwright, Chromium on
SwiftShader — no GPU needed). Run them with:

```sh
npx playwright install --with-deps chromium   # once
npm run e2e
```

`npm run e2e` builds the production bundle with `BASE_PATH=/cyberdoom/` (the
GitHub Pages base), serves it via `vite preview`, and drives boot, menu
navigation, deploy→play, the pause menu, and a full M01 win through
`?debug=1` hooks. Vitest only picks up `tests/**/*.test.ts`, so the specs
never run under `npm run test`.

## Known limitations

- All performance numbers so far come from SwiftShader software rendering
  only: steady-state p95 frame ≈ 33 ms, plus one ≈240 ms texture-upload /
  shader-compile frame at deploy. Real-GPU numbers have not been measured.
- M05 Change Freeze wins in the walkthrough test but has not been confirmed
  winnable by hand.
