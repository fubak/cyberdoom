# CYBERDOOM

A Doom-style first-person cybersecurity training game built with Three.js.
Play an SOC analyst clearing 12 missions that teach CompTIA Security+ SY0-701
objectives — your weapons are IT tools: keyboard, mouse, USB scanner, badge,
network tap, EDR console, MFA token, patch disk, and firewall blaster.

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
| `src/tools/`    | Tool registry + tool modules (`ToolDef`: id/name/slot/blurb/viewmodel draw/`use(ctx)`/`hint(ctx)`/ammo). All 9 slots below.                                                                                                                                                                                                                                                                                                                                                            |
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
| 9    | FIREWALL BLASTER | Network firewall / ingress packet filtering            | Fires a 5-rule packet-filter spread that shreds close-range malware and botnet swarms. Shares scan sessions with the USB scanner; does not clean workstations. |

BADGE (4) and MFA TOKEN (7) are passive: they act when you press **E** at a
door reader, not on LMB. The slot strip draws every slot 1–9 with its digit
(owned bright, unowned dim) and the ammo block lists only resources for tools
you own. The title's **READ THIS!** panel is generated from this registry and
the live key bindings, so it always lists every tool and control.

## Missions

Twelve-mission campaign arc (`src/content/curriculum.ts`); all twelve are
built and playable, plus a hidden bonus mission, M13 HONEYPOT, reached through
the secret exit in M04 (or the `/?mission=m13` deep link). It sits outside the
campaign arc and the mission-select list.

| #   | Title               | Difficulty | Objectives              | Status |
| --- | ------------------- | ---------- | ----------------------- | ------ |
| M01 | PATCH TUESDAY       | 1          | 2.4, 2.2, 2.5, 3.4, 5.6 | built  |
| M02 | NEED TO KNOW        | 3          | 4.6, 1.2, 5.6           | built  |
| M03 | THE QUIET ONE       | 6          | 4.9, 2.1, 2.4, 3.3, 4.8 | built  |
| M04 | HOOK, LINE & SINKER | 6          | 5.6, 2.2, 4.5, 2.4      | built  |
| M05 | CHANGE FREEZE       | 6          | 1.3, 1.1, 4.3, 5.1      | built  |
| M06 | KEYMASTER           | 7          | 1.4, 3.3, 4.6           | built  |
| M07 | SEGMENT FAULT       | 7          | 3.2, 3.1, 4.5, 2.3      | built  |
| M08 | ZERO DAY            | 8          | 2.3, 4.3, 4.1           | built  |
| M09 | LOCKED OUT          | 8          | 4.8, 3.4, 4.9           | built  |
| M10 | THIRD PARTY         | 9          | 5.3, 5.2, 2.2, 3.1      | built  |
| M11 | AUDIT NIGHT         | 9          | 4.2, 5.4, 5.5, 5.1      | built  |
| M12 | ROBO SOC            | 10         | 4.7, 4.4, 3.2, 2.5      | built  |

## Controls

- **WASD** move · **mouse** look (click to capture) · **←→** turn · **Shift** run
- **LMB** (or **F**) use the current tool · **E/Space** interact (read a
  flagged workstation, open doors, use badge/MFA readers, turn items in at a desk)
- **1–9 / Numpad / mouse wheel / Q** select tool
- **Tab** (hold) objective list, paged when long · **M** automap (**+/−** or
  wheel zoom, **G** follow / free pan) · **L** evidence log (case files)
- **F5** quicksave · **F9** quickload · **Esc** pause menu / back
- **E** is the primary interact key: doors, consoles, hosts, hand-ins and
  reports. A mission-ending or irreversible action (e.g. plugging in unknown
  USB, filing a report) asks for a second **E** within 4 s; the prompt reads
  PRESS E AGAIN TO CONFIRM. LMB with the keyboard tool still works on
  consoles but the HUD no longer offers a competing LMB line for them.
- Debrief quiz: **S** skips a question, **Esc** (or **SKIP QUIZ [S]** on the
  report) skips the rest. Skipped questions earn no knowledge credit.
- Briefing: **D** details, **←/→** or **A/D** page (or the on-screen
  **◀ PREV / NEXT ▶** buttons), **K** skill level, **Enter** deploy. The last
  details page lists the controls and explains threat level and skill.
- The keyboard plays without mouse capture: the first click in play only
  captures the mouse, and until then the HUD says so and the tool prompt
  names **F** instead of **LMB**.
- The HUD shows **[LMB]** and **[E]** action prompts for whatever you're
  aiming at, so you always know what a click or keypress will do. The
  reticle changes shape as well as colour: green ring (idle), amber ring
  with a centre pip (the tool will act on the target), grey dashed ring with
  a slash (out of range, wrong target or out of ammo), white X (hit).
- The top line pins the open objective with progress (`OBJ 1/3 …`) on a
  single line; the full text is on **Tab**, in the pause menu and in the log.
  New evidence shows a `LOG +N [L]` ticker badge until you open the log.

### Menus and options

- The title menu has **Continue** (when a saved checkpoint exists), **New Game**,
  **Missions**, **Options**, **Controls** and **Read This!**; the pause menu has Resume, Options, Controls, Restart
  Mission and Mission Select.
- **Options**: music and SFX volume, mouse sensitivity, field of view, view
  bob, colour-blind HUD palette and **reduced flashing** (dims the hurt tint,
  tool and impact light flashes, and skips the reticle hit flash). Settings persist in `localStorage`.
- **Controls**: rebind movement, use, tool and map/log keys; every on-screen
  key hint (help, tips, prompts, log) follows the rebinds.

### First run

The first time you deploy into M01 (no cleared missions, nothing saved), the
ticker pages four short tips: moving and looking, pressing **E** at a
workstation, selecting and using tools, and the map/log/objective keys. A
returning player skips them (`cyberdoom.onboarding.seen` in `localStorage`).

## Debug hooks (Playwright automation)

Append `?debug=1` to expose `window.__cd`:

- `__cd.state()` → `{ screen, mission, x, y, angle, integrity, tool, owned, ammo, score, dossier, automap, stats, roles, inventory, lossReason, objectives[], entities[] }` (`dossier.emptyLines` is the log's empty-state copy while it is on screen)
- `__cd.hud()` → what the last HUD frame drew: objective line (mode + rows), prompt rows with key-plate geometry, capture footer, ticker rows
- `__cd.startMission(id, gender)` — skip menus
- `__cd.teleport(x, y, angle?)` — snaps to a walkable tile
- `__cd.fire()` — pull the trigger once (no pointer lock needed)
- `__cd.setTool(slot)`
- `__cd.setIntegrity(v)`
- `__cd.evidence()` — collected evidence entries
- `__cd.toggleLog()` — open/close the evidence log
- `__cd.probe(kind, dist, withImages?)` / `__cd.stage(kind, dist)` — threat-readability probe / place a staged threat for captures
- `__cd.openerProbe(withImages?)` — spawn-view legibility (mean luma, black share, ceiling/floor bands; look-gate opener rows)
- `__cd.reticle()` — current reticle class (`ret-idle` / `ret-target` / `ret-blocked` / `ret-hit`, plus `ret-flash`)
- `__cd.texInfo()` / `__cd.hurtUniform()` — render internals
- `__cd.genCompare(keys)` — byte-compare worker-generated pixels vs a local rerun
- `__cd.audioMeter()` / `__cd.playSfx(name)` — audio debug

Deep link: `/?mission=m01&gender=female` jumps straight into a mission
(combine with `debug=1`). Add `freemouse=1` to a debug run to get the prompt
band a player sees with the mouse not captured (capture hint, **F** key plate).

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
navigation, title Options/Controls, deploy→play, the pause menu, and a full
M01 win through `?debug=1` hooks. `first-run.spec.ts` walks a new player's
journey from fresh storage: title, READ THIS!, briefing paging (keys and
buttons, no orphan headings), deploy, the onboarding tips, the capture hint
and prompts while the mouse is free, the single-line objective, the E key
plate (checked against F in HUD pixels), the automap and the empty log. Vitest only picks up `tests/**/*.test.ts`, so the specs
never run under `npm run test`.

## Known limitations

- All performance numbers so far come from SwiftShader software rendering
  only: steady-state p95 frame ≈ 33 ms, plus one ≈240 ms texture-upload /
  shader-compile frame at deploy. Real-GPU numbers have not been measured.
- M05 Change Freeze wins in the walkthrough test but has not been confirmed
  winnable by hand.
- There is no vertical look axis (Doom-style), so there is no invert-Y
  option. There is no HUD size / high-contrast HUD option yet.
- Real pointer-lock mouse look, a full hand-played mission and the debrief
  quiz have not had a human playtest pass since the UX remediation
  (`docs/ux-critique-and-remediation-plan.md`, Status); automation covers
  them through `?debug=1` hooks only.
