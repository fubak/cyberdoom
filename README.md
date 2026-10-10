# CYBERDOOM

A Doom-style first-person cybersecurity training game built with Three.js.
Play an SOC analyst clearing missions that teach CompTIA Security+ SY0-701
objectives — your weapons are IT tools: keyboard, mouse, USB scanner, and badge.

Play: https://fubak.github.io/cyberdoom/ (deployed from `main` by
`.github/workflows/pages.yml`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (`--host`) |
| `npm run build` | `tsc --noEmit` + `vite build` |
| `npm run typecheck` | TypeScript strict check |
| `npm run test` | Vitest unit/content tests |
| `npm run verify` | typecheck + tests |
| `npm run preview` | Serve the production build |

`BASE_PATH` env var controls the Vite `base` (default `/`) so builds can be
deployed under sub-paths, e.g. `BASE_PATH=/r/3/ npm run build`.

## Architecture

Data-driven, thin typed coupling between areas via `src/core/` contracts
(`types.ts`, `events.ts`, `registry.ts`). Each top-level area is owned by one
builder:

| Area | Owner | Responsibility |
|---|---|---|
| `src/core/` | shared | Contracts only: Mission/MapDef/EntityDef/ToolDef types, event bus, registry. The API between areas. |
| `src/engine/` | FEEL | Fixed-timestep loop helpers, input (pointer lock, WASD, wheel, slots), Doom-like momentum/friction movement with wall sliding (`map.ts` circle-vs-grid resolve), door state, raycast, NPC/enemy AI, procedural WebAudio SFX (`audio.ts`). Pure logic, no Three.js. |
| `src/render/` | LOOK | Builds level geometry from the grid (per-texture merged meshes, per-door removable meshes), procedural 64px canvas textures with NearestFilter, billboard sprites, sector light via vertex colors + fog, 320x200 low-res render stretched pixelated. |
| `src/tools/` | ARSENAL | Tool registry + tool modules (`ToolDef`: id/name/slot/viewmodel draw/`use(ctx)`/ammo). v0: 1 Keyboard (melee interact/patch/report), 2 Mouse (hitscan inspect), 3 USB scanner (cleaning projectile), 4 Badge (least-privilege doors). |
| `src/content/` | CURRICULUM | SY0-701 objective catalog (`objectives.ts`), glossary, mission data files (`missions/m0X-*.ts`). Facts must stay accurate to the published objectives. |
| `src/missions/` | LEVELS | `MissionRuntime`: spawns entities, tracks mission objectives, scoring/events for the debrief, win/lose. |
| `src/ui/` | LOOK (HUD) / ARSENAL (menus) | Canvas HUD status bar (integrity, ammo, gendered face, creds, ticker, objectives) + HTML/CSS overlay screens (title, char select, mission select, briefing, debrief quiz). |
| `src/main.ts` | shared boot | State machine: title → character-select → mission-select → briefing → play → debrief. Fixed 60Hz accumulator loop; wires everything via core contracts. |

## Debug hooks (Playwright automation)

Append `?debug=1` to expose `window.__cd`:

- `__cd.state()` → `{ screen, mission, x, y, angle, integrity, tool, score, objectives[] }`
- `__cd.startMission(id, gender)` — skip menus
- `__cd.teleport(x, y, angle?)`
- `__cd.setTool(slot)`

Deep link: `/?mission=m01&gender=female` jumps straight into a mission
(combine with `debug=1`).

## Missions (v0 vertical slice)

1. **Patch Tuesday** (difficulty 1) — clean 3 infected workstations with the
   USB scanner, don't plug in the found USB, reach the exit. (2.4, 4.5, 1.2)
2. **Need to Know** (difficulty 3) — badge only analyst doors, refuse/report a
   shared-password offer. (4.6, 1.2, 5.6)
3. **The Quiet One** (difficulty 6) — inspect NPCs for insider-threat
   indicators and report the right one; roaming malware. (2.1, 2.4, 4.4)

## Controls

WASD move · mouse look · ←→ turn · Shift run · LMB use tool ·
E/Space interact · 1-4 / mouse wheel select tool · L — evidence log (case files).

## Testing

`tests/` covers content validation (valid objective refs, exactly one correct
answer per question with per-option explanations, rectangular wall-enclosed
maps with BFS-reachable exits), movement/collision, and the tool registry.

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
