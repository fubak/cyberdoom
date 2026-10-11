# CYBERDOOM easter eggs — research and design

The ask: research Doom's (1993 / Doom II) easter eggs, write up what makes each
delightful, then design and build the same spirit into CYBERDOOM with a
security/IT twist. Every egg is discoverable through an in-world hint, never
breaks mission flow or objective counts, and stays workplace-safe.

## What makes Doom's eggs delightful

Research notes (GameFAQs cheat listings, the Official Doom FAQ, speedrun and
community write-ups; doomwiki.org is Cloudflare-blocked from this VM):

| Doom egg | What it is | Why it is delightful |
| --- | --- | --- |
| **IDDQD** | Typed during play — no console, no Enter — grants "degreelessness" god mode. | It is *diegetic input*: the game is watching the same keys you play with. Finding it works makes the game feel like it has a backdoor of its own. |
| **IDKFA / IDFA** | Typed codes granting every weapon, ammo, keys. | "Very Happy Ammo." The fantasy of having everything, earned by knowing something. |
| **IDDT** | Full automap; typed twice, shows every entity. | Turns the map from fog-of-war into an omniscient view — a debugger's delight. |
| **IDMUS** | Swaps the level music on the fly. | Cheats as playful toys, not just power. |
| **IDCLEV / noclip IDSPISPOPD** | Level warp / walk through walls. | Breaking the rules is the point — the game acknowledges it's a game. |
| **E1M3 → E1M9 "Military Base"** | A hidden exit inside a secret area leads to a whole extra level that doesn't appear on the map list. | The deepest delight in Doom: a *world* that isn't on the box art, reachable only by being curious. The exit looks ordinary until you step on it. |
| **Doom II MAP15→31, MAP16→32** | Wolfenstein 3D-themed secret levels behind chained secret exits. | Stacking secrets on secrets rewards systematic exploration. |
| **Icon of Sin / Romero head** | Behind the final boss wall: John Romero's head on a stick + a reversed voice line. | The devs hiding *themselves* inside the game, and the only way to see it is to cheat (noclip) — an egg whose discovery required another egg. |
| **God-mode grin** | The status-bar face pulls a huge evil grin under god mode. | A tiny cosmetic payoff that makes the cheat feel *felt*, not just flagged. |
| **Texture-tell secret doors** | Walls that push open if you press Use; "A secret is revealed!" | The texture is a hint to the attentive eye; the payoff line makes it official. |
| **In-joke textures** | Developer names, jokes, and oddities painted into walls. | Rewards reading the world closely. |

The through-line: Doom rewards **typing like you own the place** and
**touching walls that look slightly wrong**, then celebrates with a message, a
tally, or a whole hidden level. The discovery is the reward; the payoff is the
signature.

## Design constraints (hard rules)

- All eggs go through the existing secret system (`MissionScript.secrets`,
  `MissionRuntime.revealedSecrets`, the "A secret is revealed!" message) so
  they land in the debrief `Secrets x/y` tally automatically.
- Cheat codes mark the run **UNSCORED**: the mission stays completable but the
  debrief says so and mastery/completion is not recorded for that run.
- The bonus mission (`m13`, the "honeypot") is **not** registered in
  `missionRegistry` — it would shift the curriculum's mission list, question
  coverage weights, and walkthrough/pickup contracts. It lives in a separate
  `bonusMissions` lookup that `missionById` resolves after the registry.
- Every discovery path has a hint: a wall-tell, an inspect detail, or a log
  line. Nothing requires reading the source.
- The sim stays deterministic: cheats only mutate runtime/player state; the
  typed-code buffer records keys at the DOM layer (like Doom's own).

## The eggs

### Typed cheat codes (the IDDQD family) — run becomes UNSCORED

Typed letter-by-letter during play on the keyboard, no console. Each fires a
ticker line, plays a SFX, grins the HUD face, and flags the run unscored.
Discoverable via the build-notes console in the m13 dev room and via duck lore
in m04.

| Code | Egg | Effect | Wink |
| --- | --- | --- | --- |
| `SUDO` | **Root shell** | Toggles god mode (integrity can't drop; the face holds its grin). | "Privilege escalation achieved." You should never *need* it — least privilege. |
| `HUNTER2` | **All access** | Grants every door role on the map (every door opens). | The classic IRC "password shows as stars" in-joke; also a wink at choosing weak, guessable credentials. |
| `WIRESHARK` | **Full capture** | Reveals the whole automap, including every secret door. | The packet sniffer that sees everything on the wire. |
| `RICKROLL` | **Track swap** | Swaps the mission music for the jaunty `rick` tier loop. | Never gonna give you uptime. |
| `ITSDNS` | **It's always DNS** | Flash diagnostic line + honk SFX. Pure gag. | The answer to half of all incident tickets. |

Typing is buffered on letter keys only (`CheatBuffer`, suffix-matched like
Doom); movement/fire keys are never swallowed.

### World eggs

6. **`m04` secret exit → `m13` HONEYPOT** (the E1M9 egg). A wall-tell door on
   the west end of the south cage corridor hides a one-cell exit pad
   (`CellDef.secretExit`). Once the mission's objectives are done, stepping on it
   finishes the mission *won* like the normal exit, but routes the debrief to a briefing for `m13`. The
   nearby cage console logs a lure-domain note hinting that easy links go
   somewhere else. Payoff: an entire level nobody told you about.

7. **`m13` HONEYPOT — the secret mission.** A small bunker whose front room is
   a "too-good-to-be-true" lure: a honeypot server rack to inspect (egg log:
   decoys waste an attacker's time for free), loot lying suspiciously in the
   open, and a scripted ambush (it's a trap — that IS the lesson). Two
   objectives, an exit, and a par time; no debrief quiz (it's off the exam
   arc). Completing it returns to mission select.

8. **The dev room** (Icon-of-Sin/Dev-alcove egg). Inside `m13`, a
   `wall-secret` door in the back leads to a closet whose mural walls are the
   `wall-devs` credits texture — "BUILT BY DEVIN / LOOK FEEL ARSENAL ENEMIES
   LEVELS CURRICULUM EGGS". Inside: the **build-notes console** (logs every
   cheat code above — the in-world cheat manual) and **Bobby T.**, an intern
   NPC named for Bobby Tables (inspect: still sanitizing his inputs). The room
   itself counts as a script secret; the consoles and Bobby are `egg`
   discoveries.

9. **The rubber duck** (m04). A `duck` item sprite sits in the m04 archive
   alcove behind the `wall-quack` tell door (its wall gets a faint yellow duck
   print — the texture is the hint). Inspecting it (`egg: quack`) gives the
   rubber-duck-debugging + rogue-USB gag: *it's for debugging AND it's
   precisely the kind of removable media you plug in last, if ever.*

10. **The rickroll capture** (m13 dev room). A PCAP console labelled with a
    suspicious capture file; operating it plays the `rick` jingle and logs a
    packet-peek gag (the flag inside the capture says the analysts got rolled
    by a music video disguised as exfil — always verify the payload).

11. **"It's always DNS"** (m13 dev room). A ticket-console whose every line is
    a DNS misdiagnosis — the office legend in joke form; winks at how often
    the true root cause is the boring one you checked last.

12. **Title-screen Konami code.** `↑ ↑ ↓ ↓ ← → ← → B A` typed on the title
    screen unlocks every campaign mission in the selector (persists) and shows
    a toast. The one cheat deliberately left scored: it touches the menu, not
    a run.

13. **The god-mode grin.** While `SUDO` is active the HUD face holds its grin
    between damage events (`Face.god`), matching Doom's grin-on-god face.
    Damage ticks still bounce off it visually.

### In-world discovery table

| Egg | Hint | Trigger | Payoff |
| --- | --- | --- | --- |
| SUDO / HUNTER2 / WIRESHARK / RICKROLL / ITSDNS | m13 build-notes console lists them; duck inspect jokes about `HUNTER2` | Type the code in play | Effect + "CHEAT ACTIVE … run unscored" + face grin |
| Secret exit | m04 cage-console log about lure domains; `wall-secret` tell at the corridor's dead end | Push door, step on pad once the mission objectives are done | Mission completes → `m13` briefing; counts in Secrets tally |
| m13 honeypot | Reach it via the m04 secret exit (or `__cd.startMission('m13')` / `?mission=m13`) | Inspect the honeypot server + trigger the ambush + exit | Egg log about deception tech; Secrets tally |
| Dev room | `wall-secret` door inside m13 | Enter the closet | Credits mural, build-notes console, Bobby T., rickroll + DNS consoles |
| Rubber duck | `wall-quack` door + duck silhouette visible through it | Inspect the duck | Egg log + USB-hygiene wink |
| Konami | Code itself is the legend | Title-screen arrow combo | All missions unlocked + toast |
| God grin | SUDO cheat | Take damage while god | Face grins instead of grimacing |

## Mechanics added (the plumbing)

- `CellDef.secretExit?: string` — an `exit` cell that marks the run won and
  stores `nextMission`; `reach-exit` carries `{ secretTo }`; the debrief's
  done-route goes to that mission's briefing.
- `MissionScript.eggs?: { id, label }[]` + `EntityDef.egg?: string` — an egg id
  on an entity reveals a labeled secret on first inspect/interact and joins
  the `Secrets x/y` tally (`secretsTotal` includes declared eggs).
- `MissionRuntime.unscored` + `markUnscored(reason)` — logs a `CHEAT ACTIVE`
  score line, sets a flag the debrief renders as an **UNSCORED** stamp, and
  suppresses `markCompleted`/mastery for that run.
- `CheatBuffer` + `KONAMI` matcher in `src/eggs/cheats.ts` — pure, unit-tested.
- Debug hooks: `__cd.cheat(code)`, `__cd.eggs()` (declared + revealed),
  `__cd.unscored()`. `__cd.startMission('m13')` and `?mission=m13` work via
  `missionById`.
- `MusicTier 'rick'` — an original jaunty two-bar loop (procedural, like all
  our audio) for the rickroll gag.

## Sources

- GameFAQs DOOM (1993) cheats listing (IDDQD/IDKFA/IDDT/IDMUS/IDCLEV family).
- The Official DOOM FAQ §9–10 (cheat semantics; E1M3 secret-exit walk to E1M9).
- Community write-ups on MAP15→MAP31/MAP32 (Wolfenstein levels), the Icon of
  Sin / Romero head, and the god-mode status-bar grin.
