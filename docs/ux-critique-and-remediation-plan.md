# CYBERDOOM — Playtest Critique & Remediation Plan

Source: hands-on session against https://fubak.github.io/cyberdoom/ (2026-11-23), in the
built-in browser pane (1024x768 viewport), plus `?debug=1` hooks to reach M01 and M12
states, and a cross-check of the code paths behind each finding.

**Coverage and limits (read first)**
- Seen: title, READ THIS, character select, mission select, briefing + details (4 pages),
  M01 in-level (worm enemy, workstation, HUD, automap, evidence log), M12 opening room.
- NOT seen / NOT verified: real pointer-lock mouse look (the pane never engaged it),
  moving by WASD in the live game, a full mission win, the debrief quiz, death screen,
  M02–M11 interiors, audio. Items marked (verify) below need a human with a real browser.
- Confidence tags: [CONFIRMED] seen on screen and/or traced in code; [LIKELY] inferred; [VERIFY].

---

## 1. Findings catalog

### P0 — blocks or misleads a new player

| # | Finding | Evidence |
|---|---------|----------|
| P0-1 | **Briefing "A/D PAGE" label is wrong.** Next page = `A` or `→`, previous = `Q` or `←`. `D` does nothing on the details screen (it is the "open details" key). Players press D and nothing happens. [CONFIRMED] | `src/ui/briefing.ts:241` label vs `:289-295` handlers; I pressed D twice, stayed on 1/4. No on-screen page buttons. |
| P0-2 | **Details page 1 ends with an orphaned "SY0-701 OBJECTIVES" header and empty body**; the list starts on page 2. Page 2 then clips the glossary ("ransomware" heading with no body at the bottom edge). [CONFIRMED] | Details page 1/4 and 2/4 screenshots. Paginator splits header from its block. |
| P0-3 | **Help ("READ THIS!") contradicts the README and the game.** It lists "FIREWALL BLASTER" (slot 9) but never explains slots 7 (MFA) or how objectives/HUD work; it says "LMB use tool" while the in-level prompt shows **F = INSPECT HOST** and README says F = use tool. Says "TAP, EOR" — the pixel font renders D like O, so EDR reads "EOR". [CONFIRMED] | `src/ui/screens.ts:28-34`; `src/missions/runtime.ts:940`; screenshot. |
| P0-4 | **No onboarding at spawn.** Level starts with an empty room, "CLICK TO LOOK", and only a one-line objective. Controls, what the HUD counters mean, and the first action are never shown in-level. The first ticker tip ("AT RANGE, THE SCANNER (3) IS THE RIGHT TOOL") appears with no target in view. [CONFIRMED] | First M01 frames. |
| P0-5 (DOWNGRADED, see §3) | **Movement/look gated on pointer lock with no fallback or explanation.** In my session clicking the canvas did not engage lock and WASD did not move the player; the HUD just kept saying "CLICK TO LOOK". If lock fails (iframe, permission, Esc-cooldown, Windows/Chrome re-lock delay) the game appears frozen. [CONFIRMED in pane / VERIFY in a normal tab] | `src/engine/input.ts:106,123,213`; no visible "lock failed" state. |
| P0-6 | **Conflicting guidance in M01.** Order 1 is "Read every flagged host before you act", but the first enemy encountered shows the prompt "[LMB] KILL PROCESS: MALWARE" and tips push you to strike. Nothing explains that workstations (not roaming worms) are the "hosts" to read, or that the F key inspects. [CONFIRMED] | M01 screenshots. |

### P1 — significant clarity / polish problems

| # | Area | Finding |
|---|------|---------|
| P1-1 | HUD | Counter block `SCAN 8/30 · PCAP 0/12 · CELL 0/9 · OISK 0/6` is cryptic; "DISK" renders as "OISK" in the pixel font; it never says which are *held* vs *max*, and shows all four from minute one even when you own only the keyboard. |
| P1-2 | HUD | Tool slot strip shows `T 2 3 [badge] 5 / 6 [dash] 8 9` — slot 1 is a "T" glyph, slot 7 is a dash, owned/unowned/selected states are low-contrast. README promises "1–9"; players can't tell which keys do anything. |
| P1-3 | HUD | `0/3 OBJ` tells the count but not the target; the single objective line at top truncates ("HANDLE THE FOUND USB STICK PER POLICY") and wraps over two lines at M12, covering the scene. Ticker tips stack 3 deep, with trailing ".." truncations ("TWO STOP..", "SLOW.."), and a literal `( )` placeholder glyph where a slot icon should be. |
| P1-4 | HUD | Persistent red "(!) WORM IS DRAINING YOUR INTEGRITY!" with no indication of *which* worm, from where, or how to stop it; integrity dropped 100→97 with no directional damage cue seen. |
| P1-5 | HUD | Face/status cell shows "STAFF"/"ANALYST" badge-role label with no explanation of what role changes; looks like a rank, is actually an access-control mechanic. |
| P1-6 (REFUTED, see §3) | Menu | Title menu: skull cursor is clear, but mouse hit-areas are DOM buttons offset from the drawn art (my coordinate clicks on the art did nothing; only the hidden buttons worked). Hover/selected state feedback weak. [CONFIRMED via click on drawn text] |
| P1-7 | Menu | Character select: stray skull cursor sprite floats inside Ray's card; the per-character viewmodel preview is tiny and shows only a hand, not the character. Skin-tone swatches 1–5 have no label of what they change. |
| P1-8 | Menu | Mission select / briefing / details use a different typeface (system mono + heavy pixel font) than the title/HUD pixel font; locked rows are very low contrast; the `!`/`!!` threat markers are unexplained. Large black letterbox bars waste ~15% of the viewport. |
| P1-9 | Briefing | Objectives in the briefing are cut with "…" (2.4, 2.5) with no way to read them except Details; "THREAT LEVEL !" is cryptic; `SKILL: ANALYST [K]` is not explained (what does skill change?). Briefing never shows the control scheme. |
| P1-10 | Sprites | Point-blank enemies upscale to a huge, blurry, flat-red blob (worm at 1.3 tiles fills the screen and hides the reticle and hit feedback). Cap near-plane scale, or fade/dither, or push enemies' stop distance out. |
| P1-11 | Visuals | Wall lighting shows hard vertical seams (adjacent wall segments with different vertex-colour sector light give a visible stripe in the very first room). Texture repetition on the brown/orange corridor is heavy. |
| P1-12 | Lighting | M12 opens extremely dark: large pure-black masses with floating UI-like bar charts; the SOC reader is readable but ceilings/floors vanish. Contrast between lit props and environment is good, but navigation space is not legible. |
| P1-13 | Automap | Objective diamond renders far outside the discovered area in black void (spoils or confuses); map is small and off-centre at default zoom; legend uses "ITOPS" which is not defined; wall colour for doors vs locks hard to separate. |
| P1-14 | Evidence log | Empty state says only "NO EVIDENCE LOGGED" — no hint how to produce entries (inspect hosts). The log is the core learning artifact but is not introduced. |
| P1-15 | Hint copy | Tips are long, truncated, and sometimes lecture ("each strike runs a kill-process / isolate command on the malware in front of you (containment)"). They duplicate the objective line and the LMB prompt, adding noise. |

### P2 — polish / minor

- Cursor/reticle: green ring with no hit/miss differentiation until a hit lands.
- Viewmodel (keyboard held in two hands) is large and overlaps the lower prompt bar; the prompt bar overlaps the weapon.
- "BUSY" state replaces the weapon-state HUD cell right after a strike with no cooldown meter.
- Briefing page paging uses invisible keys; pointer users have no next/prev buttons.
- No settings screen seen (volume, sensitivity, invert, FOV, reduced-motion/flash). [VERIFY: may be in pause menu]
- Heavy upscale means text legibility depends on integer scaling; 1024x768 shows 800x600 art with large black borders.
- Accessibility: red/green HUD states (green OBJ vs red integrity) with no shape/text alternative; flashing hurt overlay (check `engine-flashlimit` coverage).

### What works well (keep)

- Title art and logo are strong; the pixel title face (#130) sells the theme.
- The worm sprite at mid range has a clear silhouette and good readable face.
- Per-tool context prompts ("[LMB] KILL PROCESS: MALWARE", "[LMB] PLUG IN: SCAN & QUARANTINE −1 SCAN", "[F] INSPECT HOST") are exactly the right idea — compact and actionable.
- Workstation prop is crisp and unmistakable as an interactable.
- Mission copy and curriculum alignment (SY0-701 objective list, glossary key terms) are a real differentiator.
- M12's SOC reader and server-room set dressing read well.

---

## 2. Remediation plan

Ordered so each phase ships independently. Every item gets a regression test where it can
(vitest for logic and layout; Playwright for flows) per the repo's TDD rules.

### Phase A — Fix wrong/misleading text and keys (small, ship first)

1. **Briefing paging** (`src/ui/briefing.ts`): label `A/D` → `←/→ PAGE`; accept `A`/`D`/`←`/`→` for next/prev (D only pages in details mode; Q stays as alias); add on-screen `◀ ▶` buttons. Unit-test key handling.
2. **Orphan header** (`paginate`): keep-with-next so a section header is never the last line of a page; re-measure glossary clipping (page 2 bottom). Extend `tests/debrief-layout.test.ts`-style test to briefing pages.
3. **Help screen** (`src/ui/screens.ts`): regenerate from the tool registry so it lists all 9 slots correctly, states F vs LMB vs E accurately, and mentions M/L/Esc. Add a test that every registered tool name appears. Fix README controls to match.
4. **Pixel font D/O ambiguity** (`src/tools/pixelfont.ts`): distinguish D from O (flat left edge, notch) so EDR/DISK stop reading "EOR/OISK". Add to `font-chunky` test.
5. **Truncated copy**: replace trailing `..`/`…` truncation with wrap or shorter authored strings; add a content test that no hint/objective string exceeds the allotted width at the HUD font size; remove the literal `( )` slot placeholder.

### Phase B — Onboarding and objective clarity (highest player impact)

6. **First-run overlay in M01**: a 3-step coach strip (look/move, select tool with 1-4, read a workstation with F), dismissible, persisted in localStorage, skipped for returning players. Replace the free-floating "scanner is the right tool" tip with a contextual one shown only when a workstation is in range.
7. **Objective HUD**: show the active objective with progress (`1/3 CLEAN INFECTED HOSTS`), single line, truncated-by-design with full text in the log/pause; objective marker arrow or compass ping to next target (toggle in settings).
8. **M01 narrative fix**: reconcile "Read before you act" with enemy prompts — enemies marked infected only after inspection, or the first enemy is a clearly labelled tutorial target; hint order: inspect → decide → act.
9. **Pointer-lock resilience** (`src/engine/input.ts`): show a clear "CLICK TO CAPTURE MOUSE — or press Enter to play with keyboard" state; allow WASD + ←→ turn without lock (already documented); detect lock failure/timeouts and surface a message with the Esc-cooldown hint. (verify in a normal browser first; may be pane-only.)
10. **Briefing**: show full objective text (wrap, no ellipsis), explain THREAT LEVEL and SKILL:ANALYST in a one-line tooltip, add a "CONTROLS" page to Details.

### Phase C — HUD redesign for readability

11. **Ammo block**: show only owned resources, label with icon + number (`SCAN 8`), grey out when empty, flash when low; spell out DISK.
12. **Slot strip**: render slots 1–9 uniformly with numerals; owned = bright, unowned = hidden/dim with a lock glyph, selected = highlight box; fix slot-1 "T" and slot-7 dash glyphs.
13. **Role/badge cell**: rename to `BADGE: STAFF`, color by privilege tier, with one-time explanation when a door denies access.
14. **Damage feedback**: directional hurt indicator + source label; replace persistent "WORM IS DRAINING" text with a timed, named alert (`WORM @ HUB — 3 tiles E`).
15. **Ticker discipline**: max 2 lines, priority queue (objective > damage > tip), no repeats within N minutes, tips auto-dismiss.

### Phase D — Menus and flow

16. **Hit areas**: align DOM buttons with drawn labels on the title; add hover/selected highlight; keyboard focus ring.
17. **Character select**: remove stray skull cursor from the card, scale/replace the viewmodel preview with a bust, label skin tone.
18. **Unify type**: use the pixel title/body face across mission select, briefing and details (system-mono fallback only for dense glossary text); raise locked-row contrast to meet 4.5:1; explain `!`/`!!`.
19. **Letterbox**: fill the black bars with the themed background so the 4:3 frame doesn't read as a bug on 16:10/16:9 (or scale up where integer scale allows).
20. **Settings screen** (or confirm existing): volume, mouse sensitivity/invert, FOV, reduced flashing, high-contrast HUD, text size.

### Phase E — Visuals, lighting, enemies

21. (SUPERSEDED, see §3) **Enemy near-plane**: clamp billboard scale and add a near-fade/dither under ~1.5 tiles; ensure reticle and hit-flash draw above the sprite; consider melee stop distance of 1.8 tiles.
22. **Hit feedback**: distinct reticle states (hover target / hit / blocked / out of range) and a short audio+flash on contact.
23. **Wall-light seams**: audit sector-light vertex colours at wall joins (average shared-corner light) in `src/render`; add a seam-detector probe to the look tests.
24. **Texture variety**: add 2–3 wall variants plus decals (cable runs, signage, stains) per mission theme to break repetition in M01 corridors.
25. **M12 lighting**: raise ambient floor, add rim lights on key props and floor strips along the route; extend the `look` gate rows with an M12 opener check similar to the m09/m13 openers.
26. **Enemy variety audit** across M02–M11 (verify): silhouette readability at 3/6/10 tiles using existing `__cd.probe`, flag any that fail.

### Phase F — Automap and evidence log

27. **Automap**: only draw objective markers inside discovered space (or draw as an edge arrow when outside); auto-centre/auto-zoom to explored area; define "ITOPS" or replace the legend label; differentiate doors vs locks by icon, not just colour.
28. **Evidence log empty state**: "INSPECT A HOST (F) TO COLLECT EVIDENCE" with the key; show a count badge on the HUD when new evidence arrives.

### Phase G — Verification and rollout

29. Add a Playwright **first-time-player journey**: title → help → deploy → briefing paging → first 30 s of M01, asserting visible help text and no clipped/orphan UI (screenshot diffs).
30. Run the existing look gates after lighting changes; add M01 spawn-room and M12 opener rows.
31. Human playtest pass in a normal desktop Chrome (mouse look, WASD, a full M01 win, debrief quiz, death flow) and on a laptop-size viewport; log anything the pane could not reach.
32. Update README controls, Known Limitations, and `docs/` to match.

### Suggested PR slicing

1. A (text/keys/font) 2. B6–B10 (onboarding/objectives/briefing) 3. C (HUD) 4. D (menus) 5. E21–E23 (enemy near-plane, hit feedback, seams) 6. E24–E26 + F (visual breadth, automap, log) 7. G (verification).

### Open questions for the owner

- Should unowned tool slots be hidden (surprise unlocks) or shown locked (teaches the full kit)?
- Is the mouse-capture failure I saw an artifact of the preview pane? If not, P0-5 becomes the top priority.
- Is the dark M12 look intentional ("SOC at night") or a regression?


---

## 3. Code-verified corrections (Opus review against `src/`)

The review checked each P0 and several P1 findings in source. These **override** the text above.

**Refuted / withdrawn**
- **P1-6 title hit areas:** buttons are laid out in the same box as the canvas and cover the labels; my failed clicks were pane coordinate scaling (screenshot 800x600 vs viewport 1024x768). Drop item 16 (optionally keep a stronger hover style).
- **P1-10 / item 21 enemy near-plane:** scaling is already capped (`render/renderer.ts:1565-1607`, `render/melee.ts:24-28`); the swell is the deliberate "loom" effect. The "1.8-tile stop distance" idea would break the worm (melee range 0.95, `engine/ai.ts:125`) — **remove it**. Reduce to a human-playtest tuning call on `LOOM_CAP_FRAC` / `LOOM_FILL_FRAC` / `CHASE_BOOST`.
- **P0-5 pointer-lock gating:** WASD/arrows work without capture (`main.ts:1403-1422`); recapture-after-failure and pause-on-loss exist. The pane likely lacked keyboard focus. **Real issue:** while the mouse is uncaptured, all [LMB]/[E] prompts are hidden (`main.ts:1882-1900`), the first click only captures (`input.ts:106-113`), and `LOOK_HINT` (`ui/nav.ts:36`) never says the keyboard works. Fix = keep prompts visible while free + reword hint; confirm in a normal browser.
- **Settings (#20):** Options and key rebinding already exist under Pause (`ui/pause.ts:39-81`, `ui/controls.ts`). Missing: FOV, invert, reduced flash, text size, and access to Options/Controls from the title menu. Shrink #20 to that.
- **Onboarding (#6):** `Arsenal.introduce()` ticker tips (`tools/arsenal.ts:96-98`) and a 9-second nav hint (`main.ts:1894`) exist. Extend them (movement, "press E to inspect"); don't build a parallel coach system. The odd "scanner is the right tool" tip comes from the keyboard tool's long `control.use` (`tools/keyboard.ts:35`) — trim it.
- **Help screen (P0-3):** it does list all tools incl. MFA (`ui/screens.ts:27-28`). The **README** is stale (tools table stops at slot 8, no FIREWALL BLASTER). Help is hard-coded and omits F/E, M, L, Tab, Esc, F5/F9; generate it from the bindings as `pause.ts:116-127` does.
- **Font file:** the D/O ambiguity ("EOR", "OISK") is in the TINY font `src/render/font.ts:48,50`, not `src/tools/pixelfont.ts`.
- **P0-2:** it is a page break, not clipping: header and body are separate blocks and `paginate` (`ui/debrief-layout.ts:94-113`) has no keep-with-next. Fix helps the debrief too.

**New findings**
1. **E key plate renders as "F"** (`ui/hud.ts:749-750`): 7px plate, glyph drawn 1px low, so the bottom row that distinguishes E from F lands on the dark background; "LMB" plate has the same clipping. This is why I read "[F] INSPECT HOST" — the real key is **E** (`missions/runtime.ts:906,940`). Fix: 8px plate or glyph at `y`. (**P0**)
2. **Automap leaks the triage answer** (`missions/runtime.ts:1351-1352`): the "clean" objective marks exactly the infected hosts and skips the decoy PRN-02, contradicting "Read every flagged host". (**P0**)
3. Automap objective diamond drawn without an explored check (`ui/automap.ts:208-224`); "ITOPS" is the raw role id (`:46`) — map to "IT OPS".
4. Slot strip: passive slots 4 and 7 never draw a digit (`barLayout.ts:149`); an unowned passive slot shows only a 1px bevel (the "dash", `hud.ts:908-913`). Ammo rows for unowned tools are always drawn, just dimmed (`barLayout.ts:165-173`).
5. Key inconsistencies: A/D = left/right on character select but A = next page in briefing; Q = cycle tool in play but "previous page" in briefing; README/help omit F5/F9 quicksave, Tab objectives, G follow, K skill; README says twelve missions but `m13-honeypot` exists.
6. `content/curriculum.ts:52` says the USB turn-in uses "(Keyboard)"; it is E at the Security Desk (`runtime.ts:597`).
7. Stray skull in character select is deliberate (`ui/characterSelect.ts:160`) but poorly placed; swatches are already labelled "SKIN TONE". Move the skull out of the card.
8. Dead code: old `characterSelect`/`drawPortrait` in `src/ui/screens.ts:39-100+` is unused.

## 4. Revised phase order

- **Phase A (first PR, all small and testable):** E/F plate clipping; TINY `D` glyph; briefing key map + label (+ on-screen arrows); keep-with-next in `paginate`; automap marker gating, "IT OPS" label and the answer leak; README tools/controls corrections; M01 order-1 copy ("flagged *workstation*, press E"); curriculum "(Keyboard)" copy.
- **Phase B:** prompts visible while mouse is free + reworded `LOOK_HINT` (after real-browser check); extend `introduce()`/prompt band for movement and E-inspect; trim keyboard `control.use`; generate title help from bindings; objective HUD with progress; briefing full text + CONTROLS page.
- **Phase C:** HUD (collapse unowned ammo rows, slot digits for passive slots, role cell label, damage source, ticker discipline).
- **Phase D:** drop #16; character-select skull; typeface unification and contrast; letterbox; add missing options and title access to Options/Controls.
- **Phase E:** drop #21 clamp/stop-distance; loom tuning as a playtest decision; hit feedback, wall-seam audit, texture variety, M12 lighting.
- **Phase F/G:** evidence-log empty state; first-time-player Playwright journey; human playtest in a normal browser.

---

## 5. Status (2026-11-23)

All seven phases have landed or are in review. Each PR carries its own unit
tests; the Playwright suite runs on every PR.

| Phase | PR | What shipped |
|-------|----|--------------|
| A — text, keys, glyphs | #134 | 9px key plates so **[E]** keeps its bottom bar (no more "[F] INSPECT HOST"); TINY `D` with a square stem (EDR/DISK, not EOR/OISK); briefing paging ←/→ or A/D with on-screen PREV/NEXT; keep-with-next in `paginate` (no orphan headings, debrief too); automap markers only on explored tiles, "IT OPS" label, clean objective marks every lookalike host (no triage spoiler); README tools/controls/M13; M01 order 1 and curriculum USB copy. |
| B — onboarding and objectives | #135 | Prompts stay visible while the mouse is free (tool line names the fire key) and `LOOK_HINT` says the keyboard works; first-run M01 control tips through `Arsenal.introduce()` (persisted, skipped for returning players); trimmed tool `control.use` copy; READ THIS! generated from the tool registry and bindings; single-line objective HUD keeping `(n/m)`; briefing objectives shown whole, CONTROLS page, THREAT/SKILL explained. |
| C — HUD readability | #136 | Owned-only ammo rows with empty/low states; slot strip 1–9 with digits (passive 4 and 7 included); `BADGE:` cell coloured by privilege tier with a one-time denial explanation; timed, named damage alert with distance/bearing and a non-strobing edge tint; ticker priority queue, max 2 messages, no repeats, no ellipsis. |
| D — menus and options | #137 | Title OPTIONS and CONTROLS (shared with pause); new options: field of view, reduced flashing (1/s flash budget, 0.35x strength); character-select skull moved out of the card, larger preview; pixel-face mission select, threat legend, ≥4.5:1 locked rows; themed letterbox. |
| E — visuals | #139 | Reticle states by shape and colour (idle / target / blocked / hit) with a rate-limited hit flash; wall light from shared corners (no seams); office wall alternates and decals; M12 opener lighting with `__cd.openerProbe()` look-gate rows for M01 and M12. |
| F — automap and evidence log | #138 | Automap auto-fit on first open, edge arrows for off-map objectives, door/lock/exit icons; evidence-log empty state that says how to log evidence; `LOG +N [L]` ticker badge; paged TAB objectives overlay. |
| G — verification | this PR (`fix/phase-g-verify`) | `tests/e2e/first-run.spec.ts`: fresh storage → title (OPTIONS/CONTROLS) → READ THIS! (all nine tools, key controls) → New Game → M01 briefing paging by keys and buttons with no orphan heading on any page → deploy → the four onboarding tips, capture hint while the mouse is free, single-line objective, **[E]** plate checked against **[F]** in HUD pixels, automap (M), empty log (L). New debug hooks: `__cd.hud()`, `state().automap`, `state().dossier.emptyLines`, `?freemouse=1`, and an accessible text copy of READ THIS! (`[data-read-this]`). TINY `+`, `[` and `]` now render crisp, so the badge reads "LOG +1 [L]" instead of "LOG •1 (L)". README controls/tools/options/first-run/limitations updated. |

**Intentionally skipped or withdrawn**
- **Invert-Y** (#20): the game has no vertical look axis (Doom-style yaw only), so there is nothing to invert.
- **HUD size / high-contrast HUD option** (#20): not cheap with the fixed 320x200 pixel HUD; colour-blind palette and the shape-coded reticle cover part of the need. Still open.
- **Title hit areas** (P1-6 / #16): refuted in §3 (pane coordinate scaling); not changed.
- **Enemy near-plane clamp / 1.8-tile stop distance** (P1-10 / #21): the loom clamp already existed and the stop distance would break worm melee; left as a playtest tuning call on `LOOM_CAP_FRAC` / `LOOM_FILL_FRAC` / `CHASE_BOOST`.
- **Text size option**, **objective compass ping** (#7) and **M01 tutorial-target narrative rework** (#8 beyond the copy fix): not done.

**Still needs a human (not verifiable in automation)**
- Real pointer-lock mouse look in a normal desktop browser, a full hand-played M01 win, the debrief quiz and death flow, a laptop-size viewport pass (#31).
- M05 Change Freeze is still only confirmed winnable by the walkthrough test, not by hand.
- Enemy variety audit across M02–M11 at 3/6/10 tiles (#26) with `__cd.probe`.
- Loom tuning (P1-10) and whether M12's darker "SOC at night" look is now right.

**Remaining ideas**
- A HUD scale / high-contrast toggle once the bar layout is parameterised.
- An optional objective compass ping on the automap edge arrow's bearing.
- Screenshot-diff baselines for the first-run journey (it attaches screenshots today but does not diff them).
