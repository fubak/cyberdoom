/**
 * Shared contracts for CYBERDOOM.
 * This file is the API surface between the engine (FEEL), renderer/HUD (LOOK),
 * tools (ARSENAL), mission runtime (LEVELS) and content (CURRICULUM).
 * Keep it dependency-free and stable.
 */

export type Gender = 'male' | 'female';

export type Screen =
  | 'title'
  | 'character-select'
  | 'mission-select'
  | 'briefing'
  | 'loading'
  | 'play'
  | 'debrief';

/** One SY0-701 objective reference, e.g. domain 2, objective "2.4". */
export interface ObjectiveRef {
  /** SY0-701 exam domain, 1-5. */
  domain: number;
  /** Objective id like "2.4". */
  id: string;
  title: string;
}

/** A single map cell kind. */
export type CellKind = 'wall' | 'floor' | 'door' | 'exit';

export interface CellDef {
  kind: CellKind;
  /** Texture id from the render texture atlas. */
  tex: string;
  /** For doors: which door group this cell belongs to. */
  doorId?: string;
  /** For doors: role required to badge it open. Undefined = any role. */
  accessRole?: string;
  /**
   * For doors: a hidden door drawn with `tex` (looks like wall). Opens with
   * Use (E) or the badge like any unrestricted door. LEVELS-owned.
   */
  secret?: boolean;
  /** For doors: opened only by a MissionTrigger (`openDoors`), never by
   *  Use or the badge. `lockText` is shown when the player tries it. */
  locked?: boolean;
  /** For doors: badge alone is not enough; the MFA token must complete a
   *  second factor (ARSENAL, SY0-701 4.6). */
  mfa?: boolean;
  lockText?: string;
}

/** Grid map. `grid` rows must all have equal length; the border must be enclosed. */
export interface MapDef {
  grid: string[];
  legend: Record<string, CellDef>;
  /** Player spawn in tile coordinates (fractional ok) + facing angle in radians. */
  spawn: { x: number; y: number; angle: number };
  /** Per-tile light level override (0..1). Tiles not listed use `defaultLight`. */
  lights?: Record<string, number>;
  defaultLight?: number;
  /**
   * Optional look override. `theme` names a wall/texture identity
   * (see render/textures.ts THEMES); when absent the renderer picks one from
   * the mission id, so mission files need no edits.
   */
  look?: { theme?: string };
}

export type EntityKind =
  | 'enemy' // hostile malware process
  | 'npc' // employee / person
  | 'workstation' // patchable / infected host
  | 'console' // interactable terminal
  | 'item' // pickup (ammo, usb stick, keycard)
  | 'prop';

export type AiMode = 'chase' | 'wander' | 'stand' | 'patrol';

/** The in-world triage calls a case file can ask for. */
export type CallAction = 'quarantine' | 'release' | 'escalate' | 'patch';

export interface CallOption {
  action: CallAction;
  text: string;
}

/**
 * Live state of a case file's "WHAT DO YOU DO?" prompt. The required action
 * is NOT stored here: the runtime owns the answer so the file cannot leak it
 * before the player commits.
 */
export interface CallState {
  options: CallOption[];
  /** Index of the option last picked, or -1 while a call is still pending. */
  picked: number;
  /** True once the required call has been made; only then do actions count. */
  resolved: boolean;
  /** Explanation appended to the file after each pick. */
  feedback?: string;
}

/** What the Mouse "inspect" reveals about an entity. */
export interface InspectInfo {
  label: string;
  /** On-screen explanation text (teaches the indicator). */
  detail: string;
  category: 'malware' | 'phishing' | 'legit' | 'suspicious' | 'item' | 'person';
  /** Objective ids this inspection evidences. */
  objectives?: string[];
  /** For npc: behavioral flags observable by inspecting. */
  flags?: string[];
  /**
   * When set, inspecting opens a "WHAT DO YOU DO?" prompt on the case file
   * and a clean/release/patch only counts after the right call is made.
   * 'auto' derives the right call from category/tags (see content/calls.ts).
   */
  call?: CallAction | 'auto';
}

export interface EvidenceEntry {
  id: string;
  entityId: string;
  label: string;
  detail: string;
  source: 'inspect' | 'log';
  category?: InspectInfo['category'];
  /** Pending/answered triage call on this file (inspect entries only). */
  call?: CallState;
}

export interface EntityDef {
  id: string;
  kind: EntityKind;
  /** Tile coords. */
  x: number;
  y: number;
  sprite: string;
  /** AI profile id; defaults to the sprite id. */
  threat?: string;
  ai?: AiMode;
  hp?: number;
  /** For an `ordered` interact objective: lower numbers must be actioned first. */
  priority?: number;
  /** Whether the entity is infected / hostile for cleaning purposes. */
  infected?: boolean;
  /** Can be reported/accused as the insider. */
  reportable?: boolean;
  /** Is this entity actually the culprit in its mission (content decision). */
  culprit?: boolean;
  /** Reportable entity ids this entity's recorded evidence implicates
   *  (e.g. a badge log or DLP alert that names a suspect). Inspecting a
   *  reportable entity also records one evidence entry about that person. */
  implicates?: string[];
  /** Corroborating evidence entries required before this entity can be
   *  marked as a suspect (default 2). Its own inspection counts as one. */
  evidenceRequired?: number;
  inspect?: InspectInfo;
  /** Objective ids credited when this entity is cleaned; defaults to inspect.objectives. */
  cleanObjectives?: string[];
  /** Custom tags for objective matching (e.g. "found-usb"). */
  tags?: string[];
  /** Amount of a resource granted on pickup, e.g. {resource:'usb-charge',amount:4}.
   *  `role:<name>` grants a badge role (pickup or console interact);
   *  `integrity` heals the player. */
  grants?: { resource: string; amount: number };
  /** Starts inactive (not alive) until a MissionTrigger spawns it. */
  dormant?: boolean;
  /** Item is picked up into the player's inventory on touch (e.g. found USB). */
  carry?: boolean;
  /** Keyboard-interact consumes a carried item with this tag (turn-in desk,
   *  or a trap like an unlocked PC that "plugs in" the found USB). */
  accepts?: string;
  /** Raw evidence shown when the Keyboard reads this console (logs, alerts). */
  log?: string;
  /** Option-group id; successfully resolving one option deactivates its siblings. */
  group?: string;
}

/** A mission objective tracked by the runtime and shown in the HUD/debrief. */
export interface MissionObjective {
  id: string;
  text: string;
  kind:
    | 'clean' // clean N entities with tag
    | 'patch' // patch N entities with tag (tool-hit {toolId:'patch', good:true})
    | 'reach-exit'
    | 'avoid' // do NOT trigger tag (e.g. plug found usb)
    | 'inspect' // inspect entity/tag
    | 'report' // correctly report the culprit
    | 'doors' // only open authorized doors
    | 'interact'; // use console/tag
  tag?: string;
  count?: number;
  /** Objective ids that must be done before this one can progress
   *  (e.g. a report is refused until the evidence is collected). */
  requires?: string[];
  /** For 'clean': a matching entity counts only if it was inspected before it was cleaned. */
  requiresInspect?: boolean;
  /** Interact with tagged entities in ascending EntityDef.priority order. */
  ordered?: boolean;
  /** For 'avoid': violations allowed before the mission FAILS (default 1). */
  strikes?: number;
  /** Avoid objective to violate when an interaction is attempted before its requirements. */
  earlyViolates?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  correct: boolean;
  /** Why this option is right or wrong — required for every option. */
  explanation: string;
}

export interface Question {
  id: string;
  prompt: string;
  /** SY0-701 objective ids this question assesses. */
  objectives: string[];
  options: QuestionOption[];
}

export interface Mission {
  id: string;
  title: string;
  /** 1-10. */
  difficulty: number;
  /** SY0-701 objective refs (ids into the objective catalog). */
  objectives: string[];
  briefing: string;
  map: MapDef;
  entities: EntityDef[];
  missionObjectives: MissionObjective[];
  debriefQuestions: Question[];
  /** Roles the player badge is authorized for in this mission. */
  authorizedRoles: string[];
  /**
   * Optional starting tool ids. When omitted the arsenal starts with every
   * tool whose `unlock.difficulty` is <= this mission's difficulty.
   * Additional tools can be granted mid-mission by an item with
   * `grants: { resource: 'tool:<id>', amount: 1 }`.
   */
  loadout?: string[];
  /** Level scripting: triggers, secrets, par time (LEVELS-owned). */
  script?: MissionScript;
}

/** Inclusive tile rect [x0, y0, x1, y1]. */
export type TileRect = [number, number, number, number];

/** A scripted level event (Doom linedef-trigger analogue). Fires once. */
export interface MissionTrigger {
  id: string;
  /** Fires when the player stands inside this rect (and `after` is satisfied). */
  area?: TileRect;
  /** Fires once all these objective ids are done (and `area` entered, if set). */
  after?: string[];
  message?: string;
  kind?: 'info' | 'warn' | 'good' | 'bad';
  /** Dormant entity ids to activate. */
  spawn?: string[];
  /** Door ids to open. */
  openDoors?: string[];
  grantRoles?: string[];
  revokeRoles?: string[];
}

export interface MissionScript {
  /** Par time in seconds for the end-of-level tally. */
  par: number;
  triggers?: MissionTrigger[];
  /** Secret areas; entering one counts it once ("A secret is revealed!"). */
  secrets?: { id: string; area: TileRect; label: string }[];
  /** Reinfection: while objective `until` is not done, every `every`
   *  seconds one cleaned entity tagged `tag` is re-infected. */
  outbreak?: { tag: string; every: number; until: string; message: string };
}

/** Runtime state of a spawned entity (engine-owned). */
export interface Entity {
  def: EntityDef;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  infected: boolean;
  hurtT?: number;
  /** Door-esque interactables state etc. */
  state: Record<string, unknown>;
}

/** What a fired "projectile" (scanner charge) looks like to the runtime. */
export interface Projectile {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  range: number;
  traveled: number;
  source: string;
  alive: boolean;
  hostile?: boolean;
  damage?: number;
  cosmetic?: boolean;
}

/** Context handed to ToolDef.use. Implemented by the game shell. */
export interface ToolUseContext {
  playerX: number;
  playerY: number;
  playerAngle: number;
  entities: Entity[];
  projectiles: Projectile[];
  /** Distance to the wall along the facing ray. */
  wallDistance: number;
  isDoorAhead: () => { doorId: string; accessRole?: string; dist: number; mfa?: boolean } | null;
  openDoor: (doorId: string) => void;
  bus: import('./events').EventBus;
  fireProjectile: (p: Omit<Projectile, 'alive' | 'traveled'>) => void;
  /** Nearest entity within `maxDist` tiles and `maxAngle` rad of the aim. */
  aimEntity: (maxDist: number, maxAngle: number) => Entity | null;
  authorizedRoles: string[];
  /** Current player role. */
  role: string;
  /** Whether the entity was inspected (analysis-before-action guards). */
  isInspected?: (entityId: string) => boolean;
  /** Whether the entity still needs its "WHAT DO YOU DO?" call before actions count. */
  needsCall?: (entityId: string) => boolean;
  /** Unobstructed line of sight between two points (tile coords). Optional. */
  lineOfSight?: (x0: number, y0: number, x1: number, y1: number) => boolean;
}

/** Extra per-frame animation state passed to ToolDef.drawViewmodel. */
export interface ViewmodelAnim {
  /** Seconds since the tool was last used (large when idle). */
  sinceUse: number;
  /** Seconds since the last "hit confirm" for this tool (large when none). */
  sinceConfirm: number;
  /** Whether the last confirm was a success (green) or a failure (red). */
  confirmGood: boolean;
  /** Global animation clock in seconds. */
  time: number;
  /** Current ammo for this tool (null = infinite). */
  ammo: number | null;
  /** Skin tone fill colours for the analyst's hands: [base, shadow, highlight]. */
  skin: [string, string, string];
  /** Tool switch progress: 0 = fully raised, 1 = fully lowered off-screen. */
  lower?: number;
}

/** One-line "what LMB does right now" for the HUD prompt. */
export interface ToolHint {
  /** Uppercase, <= 34 chars; never leaks a verdict (see tools/hint.ts). */
  text: string;
  /** True when pressing LMB would do something useful in this situation. */
  ready: boolean;
}

/** One tool the player can wield. Implemented under src/tools/. */
export interface ToolDef {
  id: string;
  name: string;
  /** Slot key 1-9. */
  slot: number;
  /** Ammo resource id and starting amount; null = infinite. */
  ammo: { resource: string; start: number; max: number } | null;
  /** Seconds between uses. */
  cooldown: number;
  /**
   * Seconds between pulling the trigger and `use()` taking effect (the
   * windup phase of the use animation). Default 0.
   */
  windup?: number;
  /** Holding the use button repeats the tool (Doom-style auto fire). */
  auto?: boolean;
  /** Mission difficulty at which the tool is in the default loadout (default 1). */
  unlock?: { difficulty: number };
  /** Which SY0-701 security control the tool models (for the field manual). */
  control?: ToolControl;
  /** One-line role shown in the switch banner (uppercase). */
  blurb?: string;
  /**
   * What LMB does right now, computed with the same target rules and branch
   * order as use(). Must never leak a verdict — no inspect label/detail/
   * category, decoy/wrong/phish tags, isMalicious or other hidden state;
   * only kind, distance, door/reader state and player-visible state.
   */
  hint?: (ctx: ToolUseContext) => ToolHint | null;
  /** Draw the first-person viewmodel onto a 2D canvas (x = center px). */
  drawViewmodel: (
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    bob: number,
    gender: Gender,
    cooldownFrac: number,
    anim?: ViewmodelAnim,
  ) => void;
  /** Optional additive effects (flashes, bursts) drawn after the viewmodel outline pass. */
  drawFx?: (g: CanvasRenderingContext2D, w: number, h: number, anim: ViewmodelAnim) => void;
  /** Return `false` when nothing was affected so the arsenal refunds the ammo. */
  use: (ctx: ToolUseContext) => void | boolean;
}

/** Security-control metadata for a tool (SY0-701 1.1 categories/types). */
export interface ToolControl {
  /** Real-world control the tool stands for, e.g. "Antimalware / endpoint protection". */
  name: string;
  /** SY0-701 1.1 control category. */
  category: 'technical' | 'managerial' | 'operational' | 'physical';
  /** SY0-701 1.1 control types this tool exercises. */
  types: ('preventive' | 'deterrent' | 'detective' | 'corrective' | 'compensating' | 'directive')[];
  /** SY0-701 objective ids. */
  objectives: string[];
  /** How to use it in game. */
  use: string;
  /** The real-world lesson. */
  lesson: string;
}

/** One scored player action recorded for the debrief. */
export interface ScoreEvent {
  text: string;
  points: number;
  good: boolean;
  /** SY0-701 objective ids this action maps to. */
  objectives: string[];
  tag?: string;
}
