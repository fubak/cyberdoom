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
}

export type EntityKind =
  | 'enemy' // hostile malware process
  | 'npc' // employee / person
  | 'workstation' // patchable / infected host
  | 'console' // interactable terminal
  | 'item' // pickup (ammo, usb stick, keycard)
  | 'prop';

export type AiMode = 'chase' | 'wander' | 'stand' | 'patrol';

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
}

export interface EntityDef {
  id: string;
  kind: EntityKind;
  /** Tile coords. */
  x: number;
  y: number;
  sprite: string;
  ai?: AiMode;
  hp?: number;
  /** Whether the entity is infected / hostile for cleaning purposes. */
  infected?: boolean;
  /** Can be reported/accused as the insider. */
  reportable?: boolean;
  /** Is this entity actually the culprit in its mission (content decision). */
  culprit?: boolean;
  inspect?: InspectInfo;
  /** Custom tags for objective matching (e.g. "found-usb"). */
  tags?: string[];
  /** Amount of a resource granted on pickup, e.g. {resource:'usb-charge',amount:4}. */
  grants?: { resource: string; amount: number };
}

/** A mission objective tracked by the runtime and shown in the HUD/debrief. */
export interface MissionObjective {
  id: string;
  text: string;
  kind:
    | 'clean' // clean N entities with tag
    | 'reach-exit'
    | 'avoid' // do NOT trigger tag (e.g. plug found usb)
    | 'inspect' // inspect entity/tag
    | 'report' // correctly report the culprit
    | 'doors' // only open authorized doors
    | 'interact'; // use console/tag
  tag?: string;
  count?: number;
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
  isDoorAhead: () => { doorId: string; accessRole?: string; dist: number } | null;
  openDoor: (doorId: string) => void;
  bus: import('./events').EventBus;
  fireProjectile: (p: Omit<Projectile, 'alive' | 'traveled'>) => void;
  /** Nearest entity within `maxDist` tiles and `maxAngle` rad of the aim. */
  aimEntity: (maxDist: number, maxAngle: number) => Entity | null;
  authorizedRoles: string[];
  /** Current player role. */
  role: string;
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
  /** Draw the first-person viewmodel onto a 2D canvas (x = center px). */
  drawViewmodel: (
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    bob: number,
    gender: Gender,
    cooldownFrac: number,
  ) => void;
  use: (ctx: ToolUseContext) => void;
}

/** One scored player action recorded for the debrief. */
export interface ScoreEvent {
  text: string;
  points: number;
  good: boolean;
  /** SY0-701 objective ids this action maps to. */
  objectives: string[];
}
