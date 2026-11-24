import * as THREE from 'three';
import type { Entity, MapDef, Projectile } from '../core/types';
import { MAX_PARTICLES, type ParticleView } from '../engine/fx';
import type { WorldMap } from '../engine/map';
import type { Player } from '../engine/player';
import type { ViewPose } from '../engine/feel';
import { buildPaletteLut } from './palette';
import { MAX_POINT_LIGHTS, PAYLOAD_LIGHT, SCAN_LIGHT, SPAWN_LIGHT, fadingLight, pickPointLights, type PointLight } from './pointLights';
import { GROUND_LIFT, GROUND_SPREAD, groundGeometry, groundMaterial, poolStrength } from './groundFx';
import { LIT_ROOM_GAIN, darkGain, midPeak } from './threatLight';
import { genWorkerCount } from './genpool';
import { buildSprites, prewarmLazySpriteFrames, spriteSets, type SpriteSet } from './sprites';
import {
  CEIL_MIN_SCALE_FRAC,
  LOOM_CAP_FRAC,
  LOOM_MAX_SCALE,
  ceilingRiseCap,
  ceilingScaleCap,
  farScale, loomK, loomTargetH, loomT, riseBase,
} from './melee';
import { ENEMY_PROFILES } from '../engine/ai';
import { WALL_H, buildTextures, decalTexture, doorTextureFor, hashStr, lookTheme, textureOr, textureRegistry, variantCount } from './textures';
import { buildSkyTexture, skyEpisodeForMission } from './sky';
import { computeSectorLight } from './sectorLight';
import { cornerJitter, wallCorners, wallFaceLight, type WallLightCtx } from './wallLight';
import { pickWallFace } from './wallPick';
import { RES, STATUS_H, VIEW3D_H, VIEW_H, VIEW_W } from './res';

export { VIEW_W, VIEW_H, STATUS_H, VIEW3D_H } from './res';

/**
 * LOOK: Three.js renderer, Doom-E1 style.
 * - 4× 1280x800 frame (base layout 320x200): the 3D view is 1280x672 and the
 *   128px status bar sits below (drawn by the HUD), exactly like Doom's layout.
 * - Level geometry: only exposed wall faces are emitted, world-aligned UVs,
 *   walls use 256x320 native textures and are WALL_H tall. Doom "fake contrast" (E/W vs N/S
 *   faces) + per-vertex corner occlusion on flats.
 * - Custom shader: sector light × distance diminishing quantised into 24 light
 *   bands (Doom's COLORMAP feel); texels on the glow layer are FULLBRIGHT.
 * - Post pass snaps every pixel to the 256-colour CYBERDOOM palette and applies
 *   a palette-style red shift when the player takes damage.
 * - Sprites: screen-parallel billboards with walk/attack/rotation frames,
 *   pain flash and a dissolve death; scanner charges are fullbright sprites.
 */
/** Distance (tiles) a player shot travels before its sprite is drawn. */
const SHOT_NEAR = 1.4;
const EYE_H = 0.6;

const WORLD_VS = /* glsl */ `
attribute float shade;
attribute float strobe;
attribute vec3 tintv;
varying vec2 vUv;
varying float vShade;
varying float vDist;
varying vec2 vWorld;
varying float vStrobe;
varying vec3 vTint;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xz;
  vShade = shade;
  vStrobe = strobe;
  vTint = tintv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const WORLD_FS = /* glsl */ `
uniform sampler2D map;
uniform float uLight;
uniform float uFloor;
uniform float uGain;
const float LIT_ROOM_GAIN = ${LIT_ROOM_GAIN.toFixed(2)};
// threats: sector light at the sprite's own tile (uLight is pinned to 1 for them)
uniform float uRoom;
uniform float uRim;
uniform vec3 uRimCol;
uniform float uFlash;
uniform vec4 uFire;
uniform vec4 uImpact;
uniform vec3 uImpactCol;
// moving lights (projectiles, spawn columns): xy = map position, z = reach, w = strength
uniform vec4 uPts[${MAX_POINT_LIGHTS}];
uniform vec3 uPtCol[${MAX_POINT_LIGHTS}];
uniform vec3 uTint;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;
uniform float uTime;
uniform float uProbeStrobe;
uniform float uGhost;
uniform float uWound;
uniform vec3 uWoundCol;
varying vec2 vWorld;
varying vec2 vUv;
varying float vShade;
varying float vDist;
varying float vStrobe;
varying vec3 vTint;
uniform float uWallLift;
// 4x4 ordered dither without bitwise ops: recursive 2x2 Bayer threshold
float bayer2(vec2 p) {
  vec2 q = floor(mod(p, 2.0));
  return (q.y > 0.5) ? (3.0 - 2.0 * q.x) : 2.0 * q.x;
}
float bayer4(vec2 p) {
  return (bayer2(floor(p / 2.0)) * 4.0 + bayer2(p)) / 16.0;
}
void main() {
  vec4 t = texture2D(map, vUv * uUvScale + uUvOffset);
  if (t.a < 0.25) discard;
  float L = 1.0;
  // uGhost (ENEMIES rootkit shimmer): a stealth attacker in motion keeps only
  // a fast-dissolving shimmer of itself — mostly its silhouette's edge — so it
  // reads as a Spectre-style refraction trace, not a body.
  float ghostEdge = 0.0;
  if (uGhost > 0.0) {
    vec2 gpx = vUv * uUvScale + uUvOffset;
    vec2 gfc = floor(gl_FragCoord.xy);
    float gh = fract(sin(dot(gfc + floor(uTime * 14.0) * vec2(7.0, 13.0), vec2(12.9898, 78.233))) * 43758.5453);
    float na = max(texture2D(map, gpx + vec2(0.02, 0.0)).a, texture2D(map, gpx + vec2(0.0, 0.02)).a);
    ghostEdge = step(na, 0.25);
    if (gh > uGhost * (1.0 + ghostEdge * 1.6)) discard;
  }
  // sector strobe: every texel of a strobing sector shares one clock (the
  // vertex 'strobe' attribute is its phase id) — Doom's blinking sector. It
  // also pulls fullbright texels (lamp diffusers, glow strips) down with the
  // room, so the fixture itself reads as switching off. ~1 Hz: lit ~78% of
  // the cycle with a short dim dip to 45% — Doom's slow sector blink, and
  // well under the ~3 flashes/s photosensitivity limit.
  float sfl = 1.0;
  if (vStrobe > 0.5) {
    if (uProbeStrobe >= 0.0) {
      // look probes pin the blink phase — deterministic captures.
      sfl = uProbeStrobe;
    } else {
      float cyc = fract(uTime * 1.0 + vStrobe * 0.37);
      sfl = cyc < 0.78 ? 1.0 : 0.45;
    }
  }
  if (t.a > 0.75) {
    // negative shade marks a flickering (faulty fluorescent) tile
    float fl = 1.0;
    if (vShade < 0.0) {
      vec2 cellId = floor(vWorld + 0.001);
      float r = fract(sin(floor(uTime * 9.0) * 12.9898 + dot(cellId, vec2(3.1, 7.7))) * 43758.5453);
      fl = r < 0.3 ? 0.4 : 1.0;
    }
    float s = abs(vShade) * uLight * fl * sfl;
    // Doom-style distance diminishing. In lit rooms the falloff starts right
    // at the camera so corridors gradient into depth (Doom's stepped colormap):
    // a lit face is near-full at ~2 tiles, ~60% by ~6 and ~30% at ~10, then a
    // steeper far crush beyond ~11 tiles ends long runs in gloom instead of
    // grey haze. Dark sectors' falloff rate rises as s drops (their colormap
    // runs out of bands sooner), so they still crush to the floor — but the
    // floor itself keeps floor and wall geometry legible instead of voiding
    // to black. Gameplay-critical sprites keep their own uFloor minimums.
    float fade = 0.1 + max(0.0, 0.62 - s) * 2.3 + max(0.0, vDist - 11.0) * 0.05;
    float dim = s * (1.3 - vDist * fade);
    L = max(dim, uFloor);
    L = clamp(L, 0.0, 1.0);
    // in the dark range walls keep a whisper more light than floors, so
    // gloom geometry reads with depth instead of merging into one plane
    L += uWallLift * clamp((0.45 - L) / 0.45, 0.0, 1.0);
    // banded like a 24-step colormap — dithered in the dark range: the 4x4
    // ordered threshold splits flat gloom into 2-3 speckled bands, Doom's
    // colormap-breakup texture, while mid/lit bands stay clean
    float darkW = clamp((0.5 - L) / 0.5, 0.0, 1.0);
    L = floor(L * 24.0 + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5) * 2.8 * darkW) / 24.0;
  }
  L = min(L, 1.5);
  // Doom fire-frame light flood: a brief tool-coloured boost that fades with
  // distance (overrides banding like Doom's fullbright muzzle-flash frame)
  float reach = (1.0 - clamp(vDist / 14.0, 0.0, 0.92)) * uFire.a;
  L = min(L + reach, 1.5);
  // landed-hit bloom: world light wells up >=1.5x inside ~3 tiles of the hit
  // point for ~100 ms (a muzzle-bloom at the impact, not at the camera)
  float iboost = uImpact.z * smoothstep(3.0, 0.6, distance(vWorld, uImpact.xy));
  L = min(L * (1.0 + iboost), 1.5);
  // LOOK: the threat gain is a dark-sector readability lift. In a lit room it
  // only flattened the sprite's own shading to one saturated tone, so it eases
  // off as the sprite's own sector brightens; dark sectors keep it all.
  float lightRoom = smoothstep(0.55, 0.9, uRoom);
  float gain = uGain > 1.01 ? mix(uGain, min(uGain, LIT_ROOM_GAIN), lightRoom) : uGain;
  vec3 lit = t.rgb * uTint * vTint * L * gain;
  if (uGain > 1.01) {
    // gained sprites (threats): clamp by the brightest channel, not per channel. A per-channel clamp
    // drives every over-range colour to white, so a purple trojan, an orange worm and a green rat all
    // washed out to the same pale body up close; this keeps each threat's hue at full brightness and
    // only eases the overflow toward white, so they still read as lit against a dark sector.
    float peak = max(lit.r, max(lit.g, lit.b));
    if (peak > 1.0) lit = mix(lit / peak, vec3(1.0), clamp((peak - 1.0) * 0.16, 0.0, 0.4));
  }
  vec3 c = mix(min(lit, vec3(1.0)), vec3(1.0), uFlash);
  c = min(c + uFire.rgb * reach * 0.4 + uImpactCol * iboost * 0.45, vec3(1.0));
  if (t.a > 0.75) {
    // lit surfaces pick up the colour of glowing things passing by
    vec3 pt = vec3(0.0);
    for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
      pt += uPtCol[i] * (uPts[i].w * smoothstep(uPts[i].z, 0.0, distance(vWorld, uPts[i].xy)));
    }
    c = min(c + t.rgb * pt, vec3(1.0));
  }
  c *= sfl;
  if (uRim > 0.0 && t.a > 0.75) {
    // dark-sector contour: texels on the silhouette edge (the baked outline
    // and one body texel in) take the threat's colour, so the shape reads
    // without flattening the body. Fades out as the sector brightens.
    vec2 rp = vUv * uUvScale + uUvOffset;
    float ra = min(min(texture2D(map, rp + vec2(0.016, 0.0)).a, texture2D(map, rp - vec2(0.016, 0.0)).a),
                   min(texture2D(map, rp + vec2(0.0, 0.016)).a, texture2D(map, rp - vec2(0.0, 0.016)).a));
    if (ra < 0.25) c = mix(c, uRimCol, uRim * (1.0 - lightRoom));
  }
  if (uWound > 0.0) {
    // wound char (ENEMIES): burnt-out blotches rimmed with corruption embers
    // grow as the threat's hp drops — visible damage state under 50% hp
    vec2 wc = floor((vUv * uUvScale + uUvOffset) * vec2(40.0));
    float wh = fract(sin(dot(wc, vec2(12.9898, 78.233))) * 43758.5453);
    if (wh < uWound) c = mix(c, c * 0.12 + uWoundCol * 0.08, 0.85);
    else if (wh < uWound + 0.06) c = mix(c, uWoundCol * 1.25 + vec3(0.2), 0.7);
  }
  c = mix(c, vec3(0.36, 0.24, 0.95) * (0.3 + 0.5 * L + 0.3 * ghostEdge), step(0.01, uGhost));
  gl_FragColor = vec4(c, 1.0);
}`;

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const POST_FS = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tLut;
uniform float uHurt;
uniform float uHurtSide;
uniform float uBonus;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  // Doom-style palette remap, not a flat wash: the hue swings toward red
  // while every texel keeps its luminance ordering and most of its local
  // contrast, so wall/sprite detail stays readable through the pain frames
  // (Doom's red palettes preserve texels the same way).
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 red = vec3(c.r * 0.5 + l * 1.3 + 0.07, c.g * 0.45 + l * 0.16, c.b * 0.4 + l * 0.1);
  c = mix(c, red, uHurt);
  float edge = uHurtSide > 0.0 ? smoothstep(0.62, 1.0, vUv.x) : smoothstep(0.38, 0.0, vUv.x);
  c = mix(c, vec3(c.r * 0.5 + l * 0.85 + 0.18, c.g * 0.4 + l * 0.12, c.b * 0.35 + l * 0.08), edge * abs(uHurtSide) * uHurt);
  c = mix(c, c * vec3(1.15, 1.05, 0.7) + vec3(0.22, 0.17, 0.0), uBonus);
  // black level: like Doom's COLORMAP, the darkest light never maps to pure black
  c = 0.045 + c * 0.955;
  // 2x2 ordered dither before palette snap: more tones, less banding
  vec2 fp = mod(floor(gl_FragCoord.xy), 2.0);
  float bayer = (fp.x * 2.0 + fp.y * 3.0 - fp.x * fp.y * 4.0) / 4.0 - 0.375;
  vec3 q = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5 + bayer * 0.9);
  vec2 luv = vec2((q.r + q.b * 32.0 + 0.5) / 1024.0, (q.g + 0.5) / 32.0);
  gl_FragColor = vec4(texture2D(tLut, luv).rgb, 1.0);
}`;

const PARTICLE_VS = /* glsl */ `
attribute float size;
attribute float minPx;
attribute vec3 color;
uniform float uScale;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vColor = color;
  gl_PointSize = min(max(minPx * ${RES.toFixed(1)}, size * uScale / -mv.z), ${(6 * RES).toFixed(1)});
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FS = /* glsl */ `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

const timeUniform = { value: 0 };
// <0 = live strobes; >=0 = probes pin all strobing sectors to that brightness.
const probeStrobeUniform = { value: -1 };
/** Shared muzzle-flash light: rgb = tool colour, w = intensity (decays ~110 ms). */
const fireUniform = { value: new THREE.Vector4(0, 0, 0, 0) };
/** Shared landed-hit bloom: x,y = hit point (world), z = intensity (decays ~100 ms). */
const impactUniform = { value: new THREE.Vector4(0, 0, 0, 0) };
const impactColUniform = { value: new THREE.Vector3(1, 1, 1) };
/** Shared moving point lights, refreshed each frame (see pointLights.ts). */
const pointUniform = { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector4(0, 0, 1, 0)) };
const pointColUniform = { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3(0, 0, 0)) };
/** Glow effects that add their light to the scene instead of covering it. */
const ADDITIVE_FX = new Set(['fx-scan', 'fx-scan-trail', 'fx-payload', 'fx-puff', 'fx-spawn']);
const PUFF_FRAMES = ['f0', 'f1', 'f2', 'f3', 'f4'];
/** How much of the spawn column's own colour is added to the scene. */
const SPAWN_COLUMN_STRENGTH = 0.55;
const SPAWN_FRAMES = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];

function worldMaterial(map: THREE.Texture, light = 1, floor = 0.16, tint?: THREE.Vector3, wallLift = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WORLD_VS,
    fragmentShader: WORLD_FS,
    uniforms: {
      map: { value: map },
      uLight: { value: light },
      uFloor: { value: floor },
      uGain: { value: 1 },
      uRoom: { value: 1 },
      uRim: { value: 0 },
      uRimCol: { value: new THREE.Vector3(1, 1, 1) },
      uFlash: { value: 0 },
      uFire: fireUniform,
      uImpact: impactUniform,
      uImpactCol: impactColUniform,
      uPts: pointUniform,
      uPtCol: pointColUniform,
      uTint: { value: tint ?? new THREE.Vector3(1, 1, 1) },
      uUvScale: { value: new THREE.Vector2(1, 1) },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uTime: timeUniform,
      uProbeStrobe: probeStrobeUniform,
      uGhost: { value: 0 },
      uWound: { value: 0 },
      uWoundCol: { value: new THREE.Vector3(0.2, 0.9, 0.35) },
      uWallLift: { value: wallLift },
    },
    side: THREE.DoubleSide,
  });
}

type RGB3 = [number, number, number];
/** Hue jitter: one triple for the whole quad, or one per corner (seamless walls). */
type Tint = RGB3 | [RGB3, RGB3, RGB3, RGB3];

class GeoBuilder {
  pos: number[] = [];
  uv: number[] = [];
  shade: number[] = [];
  strobe: number[] = [];
  tint: number[] = [];
  idx: number[] = [];

  /** Quad from 4 corners (CCW from front) with uvs + per-corner shade. `st` = strobe phase id, `tv` = hue jitter (per face, or per corner). */
  quad(p: number[][], uv: number[][], s: number[], st = 0, tv: Tint = [1, 1, 1]): void {
    const b = this.pos.length / 3;
    const perCorner = Array.isArray(tv[0]);
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.shade.push(s[i]);
      this.strobe.push(st);
      const t = (perCorner ? (tv as RGB3[])[i] : tv) as RGB3;
      this.tint.push(t[0], t[1], t[2]);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.setAttribute('strobe', new THREE.Float32BufferAttribute(this.strobe, 1));
    g.setAttribute('tintv', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Deterministic per-cell hash shared by every per-tile pick. */
const cellHash = (tx: number, ty: number, salt: number, seed: number) =>
  (Math.imul(tx * 2 + 1, 73856093) ^ Math.imul(ty * 2 + 1, 19349663) ^ Math.imul(salt, 83492791) ^ seed) >>> 0;

/**
 * Small deterministic per-face hue/brightness jitter (±5%) so two adjacent
 * tiles that drew the same texture variant still aren't pixel-identical.
 */
const faceTint = (h: number): [number, number, number] => [
  0.96 + ((h >>> 5) % 9) / 100,
  0.96 + ((h >>> 11) % 9) / 100,
  0.96 + ((h >>> 17) % 9) / 100,
];

/** Per-face brightness jitter (±7%), applied through the shade attribute. */
const faceShade = (h: number) => 0.93 + ((h >>> 23) % 15) / 100;

/** Flats have no lettering, so the 8 dihedral transforms are all safe —
 *  each tile can draw the same texture rotated/mirrored for free variety. */
function flatUv(rot: number, mirror: boolean): number[][] {
  let uvs = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  if (mirror) uvs = uvs.map(([u, v]) => [1 - u, v]);
  for (let k = 0; k < rot; k++) uvs = uvs.map(([u, v]) => [1 - v, u]);
  return uvs;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Sprite set an entity should draw right now, driven by live state.
 *  Workstation defs authored 'workstation-infected' for the pre-inspection
 *  look; once patched or flagged clean it must swap back to the clean set or
 *  the sprite lies about state. */
export function spriteSetIdFor(e: Entity): string {
  const threatKind = e.def.threat ?? e.def.sprite;
  if (e.def.kind === 'enemy' && threatKind === 'trojan' && !e.state.revealedTrojan) {
    return 'usb'; // disguised: reads as a harmless found-USB pickup
  }
  if (e.def.kind === 'workstation') {
    if (!e.state.revealed) return 'workstation';
    return e.infected ? 'workstation-infected' : 'workstation';
  }
  return e.def.sprite;
}

/**
 * Minimum light on world geometry (walls, flats, doors). Band-quantised to
 * ~2-3/24 in the shader and dithered: dark sectors read as speckled gloom —
 * Doom's darkest gameplay frames keep ~1/4 of pixels under 16/255, not the
 * void the old 0.02 floor produced nor the flat grey of a too-high floor.
 */
const WORLD_FLOOR = 0.038;

/** How fully the dark-sector contour takes the threat's colour. */
const RIM_STRENGTH = 0.85;

/** Walk cycles per second of animation time (the stride rate). */
const WALK_CYCLES_PER_S = 1.5;
/** Share of the wind-up spent in the anticipation frame. */
const ANTICIPATION_SHARE = 0.35;
/** Seconds at the end of the recover spent in the settle frame. */
const SETTLE_TAIL_S = 0.12;

interface SpriteState {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  set: SpriteSet;
  setId: string;
  lastX: number;
  lastY: number;
  facing: number | null;
  moveT: number;
  animT: number;
  lastHp: number;
  flash: number;
  scale: number;
  kind: Entity['def']['kind'];
  entity: Entity | null;
  /** Forced frame key (persistent corpses, seal marks). */
  frame?: string;
  /** Smoothed melee-lunge lift applied to the sprite's base (world units). */
  rise?: number;
  /** Floor quad under a live threat: contact shadow + pool of its own light. */
  ground?: THREE.Mesh;
}

interface Fx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  set: SpriteSet;
  frames: string[];
  t: number;
  dur: number;
  /** Gib debris motion: velocity (vx/vz on the map plane, vy = height) + gravity. */
  vx?: number;
  vy?: number;
  vz?: number;
  /** Stops flying and holds the last frame once the chunk lands. */
  landed?: boolean;
  /** Light this effect casts while it lives; fades out over its duration. */
  light?: { radius: number; intensity: number; col: [number, number, number] };
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private levelGroup = new THREE.Group();
  private spriteGroup = new THREE.Group();
  private sprites = new Map<string, SpriteState>();
  private ghosts: SpriteState[] = [];
  private projSprites = new Map<Projectile, SpriteState>();
  private fx: Fx[] = [];
  private sealMarks = new Map<string, SpriteState>();
  /** Last rendered player position — used to gate rootkit visibility. */
  private lastPX = 0;
  private lastPY = 0;
  private doorMeshes = new Map<string, THREE.Mesh>();
  private liftMeshes: { mesh: THREE.Mesh; tx: number; ty: number }[] = [];
  private openingDoors: { mesh: THREE.Mesh; t: number }[] = [];
  private skyMesh: THREE.Mesh | null = null;
  private smoothFloorY = 0;
  private map: WorldMap | null = null;
  private light = new Float32Array(0);
  /** Per-tile strobe phase id (0 = steady). Set by computeLight. */
  private strobe = new Float32Array(0);
  private strobeW = 0;
  private strobeCount = 0;
  private lamps = new Set<string>();
  private deadLamps = new Set<string>();
  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private particleGeometry = new THREE.BufferGeometry();
  private particlePositions = new Float32Array(MAX_PARTICLES * 3);
  private particleColors = new Float32Array(MAX_PARTICLES * 3);
  private particleSizes = new Float32Array(MAX_PARTICLES);
  private particleMinPx = new Float32Array(MAX_PARTICLES);
  private particleMat: THREE.ShaderMaterial;
  private particlePoints: THREE.Points;
  private planeGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  private groundGeo = groundGeometry();
  /** Debug (look probe): this entity's ground quad stays up while its sprite is hidden,
   *  so the with/without captures differ by the sprite alone. */
  debugKeepGround: string | null = null;
  private lastTime = performance.now();
  private time = 0;
  private lastIntegrity = 100;
  private captureCb: ((v: { w: number; h: number; data: Uint8Array }) => void) | null = null;
  /** DEBUG (look probe): sprite ids hidden from the view, sprite-set overrides, no flashes. */
  readonly debugHidden = new Set<string>();
  readonly debugSprite = new Map<string, string>();
  debugSpriteInfo(id: string): { x: number; y: number; z: number; visible: boolean; set: string } | null {
    const st = this.sprites.get(id);
    return st ? { x: st.mesh.position.x, y: st.mesh.position.y, z: st.mesh.position.z, visible: st.mesh.visible, set: st.setId } : null;
  }
  debugNoFlash = false;

  /** LOOK probes: block NEW fx (spawn columns, gib debris, tool trails) and
   *  hide projectile sprites while a probe is mid-capture — a hostile bolt or
   *  a trigger-spawned column can pop between the with/without-sprite frames
   *  and poison the contrast diff. */
  debugSuppressFx = false;

  /** LOOK probes: drop in-flight fx (spawn columns, gib debris) so the
   *  with/without-sprite captures diff only the staged sprite. */
  debugClearFx(): void {
    for (const fx of this.fx) {
      this.spriteGroup.remove(fx.mesh);
      fx.mat.dispose();
    }
    this.fx = [];
  }
  private hurt = 0;
  private prewarmStarted = false;
  private gen: { texturesMs: number; spritesMs: number; lazyPrewarmMs?: number; workers?: number } = { texturesMs: 0, spritesMs: 0 };

  constructor(container: HTMLElement) {
    const texturesStart = performance.now();
    buildTextures();
    const texturesMs = performance.now() - texturesStart;
    const spritesStart = performance.now();
    buildSprites();
    const spritesMs = performance.now() - spritesStart;
    this.gen = { texturesMs, spritesMs, workers: genWorkerCount() };
    (window as Window & { __cdGen?: { texturesMs: number; spritesMs: number; lazyPrewarmMs?: number; workers?: number } }).__cdGen = this.gen;
    console.info(`[render] generated textures ${texturesMs.toFixed(1)} ms, sprites ${spritesMs.toFixed(1)} ms`);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.setClearColor(0x000000, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    container.appendChild(this.canvas);

    // Doom-like ~90° horizontal FOV on the 1280x672 view.
    this.camera = new THREE.PerspectiveCamera(58, VIEW_W / VIEW3D_H, 0.04, 48);
    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.levelGroup);
    this.scene.add(this.spriteGroup);

    this.rt = new THREE.WebGLRenderTarget(VIEW_W, VIEW3D_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VS,
      fragmentShader: POST_FS,
      uniforms: {
        tScene: { value: this.rt.texture },
        tLut: { value: buildPaletteLut() },
        uHurt: { value: 0 },
        uHurtSide: { value: 0 },
        uBonus: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));
    this.particleGeometry.setAttribute('minPx', new THREE.BufferAttribute(this.particleMinPx, 1));
    this.particleGeometry.setDrawRange(0, 0);
    this.camera.updateProjectionMatrix();
    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: {
        uScale: { value: this.camera.projectionMatrix.elements[5] * VIEW3D_H / 2 },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particlePoints = new THREE.Points(this.particleGeometry, this.particleMat);
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
  }

  /** GPU-warm a texture ahead of first use (called in idle slices during briefing). */
  initTexture(tex: THREE.Texture): void {
    this.renderer.initTexture(tex);
  }

  /** Compile scene + post shaders ahead of the first real frame. */
  compileScene(): void {
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.postScene, this.postCam);
  }

  /** Options FIELD OF VIEW: vertical degrees (58 = the original camera). */
  setFov(verticalDeg: number): void {
    if (!Number.isFinite(verticalDeg) || Math.abs(this.camera.fov - verticalDeg) < 1e-6) return;
    this.camera.fov = verticalDeg;
    this.camera.updateProjectionMatrix();
  }

  /**
   * One throwaway frame at a pose: uploads level VBOs and lazily-bound
   * textures and links programs so the first real frame doesn't pay for it.
   */
  warmRender(px: number, py: number, angle: number): void {
    this.camera.position.set(px, EYE_H, py);
    this.camera.rotation.set(0, -angle - Math.PI / 2, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW3D_H);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW_H);
    this.renderer.render(this.postScene, this.postCam);
  }

  dispose(): void {
    this.canvas.remove();
    this.rt.dispose();
    this.particleGeometry.dispose();
    this.particleMat.dispose();
    this.renderer.dispose();
  }

  /** Rebuild level geometry for a new mission. */
  buildLevel(map: WorldMap, _def: MapDef, missionId?: string, entityDefs?: { x: number; y: number; kind: string }[]): void {
    this.map = map;
    this.levelGroup.clear();
    this.spriteGroup.clear();
    this.sprites.clear();
    this.ghosts = [];
    this.sealMarks.clear();
    this.projSprites.clear();
    this.fx = [];
    this.doorMeshes.clear();
    this.liftMeshes = [];
    this.openingDoors = [];
    this.smoothFloorY = map.floorHeightAtF(map.def.spawn.x, map.def.spawn.y);
    this.lastIntegrity = 100;
    this.hurt = 0;

    // Episode procedural skybox dome (visible through `sky: true` skylights/atriums)
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
      this.skyMesh = null;
    }
    const skyTex = buildSkyTexture(skyEpisodeForMission(missionId ?? 'm01'));
    const skyGeo = new THREE.CylinderGeometry(38, 38, 30, 24, 1, true);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.position.set(map.def.spawn.x, EYE_H + this.smoothFloorY, map.def.spawn.y);
    this.scene.add(this.skyMesh);

    const isWall = (x: number, y: number) => map.cellAt(x, y)?.kind === 'wall' || !map.cellAt(x, y);
    // per-mission look identity: wall-variant mix, decal pool, hue tint, floor
    const theme = lookTheme(missionId, _def.look?.theme);
    const tintV = new THREE.Vector3(...theme.tint);
    // per-tier accent on lit fixtures: lamp cells multiply by the theme accent
    // so early tiers glow green, mid reads steel-blue and late alarms red.
    const accentV = new THREE.Vector3(...theme.accent);
    const seed = hashStr(missionId ?? 'cyberdoom');
    // per-map ambient floor (look.ambient): dark-textured maps keep ceilings/floors legible
    const worldFloor = Math.max(WORLD_FLOOR, _def.look?.ambient ?? 0);
    this.computeLight(map, _def, entityDefs, missionId);
    const lightAt = (x: number, y: number) => this.tileLight(x, y);
    const builders = new Map<string, { tex: THREE.Texture; b: GeoBuilder }>();
    const builder = (key: string, tex: THREE.Texture) => {
      let e = builders.get(key);
      if (!e) {
        e = { tex, b: new GeoBuilder() };
        builders.set(key, e);
      }
      return e.b;
    };

    const H = WALL_H;
    const glassBuilder = new GeoBuilder();
    const wallFace = (
      b: GeoBuilder,
      tx: number,
      ty: number,
      nx: number,
      nz: number,
      shade: number | readonly [number, number],
      st = 0,
      tv?: Tint,
      y0 = 0,
      y1 = H,
    ) => {
      const cx = tx + 0.5 + nx * 0.5;
      const cz = ty + 0.5 + nz * 0.5;
      const rx = nz;
      const rz = -nx;
      const l = [cx - rx * 0.5, cz - rz * 0.5];
      const r = [cx + rx * 0.5, cz + rz * 0.5];
      // fake contrast: faces along x read brighter than faces along z.
      // A [left, right] shade pair is the per-edge corner light (wallLight.ts)
      const o = nz !== 0 ? 1.08 : 0.84;
      const sl = (typeof shade === 'number' ? shade : shade[0]) * o;
      const sr = (typeof shade === 'number' ? shade : shade[1]) * o;
      const v0 = y0 / H;
      const v1 = y1 / H;
      b.quad(
        [[l[0], y0, l[1]], [r[0], y0, r[1]], [r[0], y1, r[1]], [l[0], y1, l[1]]],
        [[0, v0], [1, v0], [1, v1], [0, v1]],
        [sl * 0.8, sr * 0.8, sr, sl],
        st,
        tv,
      );
    };
    // decal overlays sit a hair off the wall face so they never z-fight
    const decalFace = (b: GeoBuilder, tx: number, ty: number, nx: number, nz: number, shade: number | readonly [number, number], st = 0, tv?: Tint) => {
      const cx = tx + 0.5 + nx * (0.5 + 0.014);
      const cz = ty + 0.5 + nz * (0.5 + 0.014);
      const rx = nz;
      const rz = -nx;
      const l = [cx - rx * 0.5, cz - rz * 0.5];
      const r = [cx + rx * 0.5, cz + rz * 0.5];
      const o = nz !== 0 ? 1.08 : 0.84;
      const sl = (typeof shade === 'number' ? shade : shade[0]) * o;
      const sr = (typeof shade === 'number' ? shade : shade[1]) * o;
      b.quad(
        [[l[0], 0, l[1]], [r[0], 0, r[1]], [r[0], H, r[1]], [l[0], H, l[1]]],
        [[0, 0], [1, 0], [1, 1], [0, 1]],
        [sl * 0.8, sr * 0.8, sr, sl],
        st,
        tv,
      );
    };
    // wall faces take light per edge from the shared grid corner, averaged
    // within the sector, so collinear neighbours never meet in a hard seam
    const wallCtx: WallLightCtx = {
      light: lightAt,
      solid: (x, y) => {
        const k = map.cellAt(x, y)?.kind;
        return k === undefined || k === 'wall' || k === 'door';
      },
      sector: (x, y) => map.lightAt(x, y),
    };
    const edgeTint = (tx: number, ty: number, dx: number, dz: number): Tint => {
      const [l, r] = wallCorners(tx, ty, dx, dz);
      const tl = faceTint(cellHash(l[0], l[1], 29, seed));
      const tr = faceTint(cellHash(r[0], r[1], 29, seed));
      return [tl, tr, tr, tl];
    };

    const flicker = (x: number, y: number) =>
      map.cellAt(x, y)?.kind === 'floor' && lightAt(x, y) > 0.28 && lightAt(x, y) < 0.6 && (x * 7 + y * 13) % 4 === 0 ? -1 : 1;
    const strobeAt = (x: number, y: number) => this.strobeAt(Math.floor(x), Math.floor(y));
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const cell = map.cellAt(tx, ty);
        if (!cell) continue;
        if (cell.kind === 'wall') {
          for (const [dx, dz] of DIRS) {
            const n = map.cellAt(tx + dx, ty + dz);
            if (!n || n.kind === 'wall') continue;
            const isTrack = n.kind === 'door' && !n.secret;
            const shade = lightAt(tx + dx, ty + dz) * flicker(tx + dx, ty + dz);
            const st = strobeAt(tx + dx, ty + dz);
            if (isTrack) {
              const trackH = map.ceilHeightAt(tx + dx, ty + dz);
              wallFace(builder('doortrak', textureOr('doortrak')), tx, ty, dx, dz, shade, st, undefined, 0, trackH);
              // door number plate on one jamb of each doorway (authored
              // signage, keyed to the door so both its tracks agree)
              if (dx + dz > 0 && n.doorId) {
                const dp = decalTexture(`decal-door:${n.doorId}`);
                if (dp) decalFace(builder(`d:door:${n.doorId}`, dp), tx, ty, dx, dz, shade, st);
              }
              continue;
            }
            // deterministic per-face variant: mix in the theme's alt wall
            // family, then pick one of the baked per-tile variants and a
            // small hue/brightness jitter so no two adjacent tiles match
            const h = (Math.imul(tx * 2 + dx + 1, 73856093) ^ Math.imul(ty * 2 + dz + 1, 19349663) ^ seed) >>> 0;
            const pick = pickWallFace(cell.tex, h, theme, variantCount);
            const texId = pick.tex;
            // wall-secret keeps the sector shade but no variant/jitter/tint:
            // the misaligned panel IS the secret-door tell and must stay legible
            const secret = texId === 'wall-secret';
            const fk = flicker(tx + dx, ty + dz);
            const [el, er] = wallFaceLight(tx, ty, dx, dz, wallCtx);
            const [cl, cr] = wallCorners(tx, ty, dx, dz);
            const jit: [number, number] = secret
              ? [el * fk, er * fk]
              : [el * fk * cornerJitter(cl[0], cl[1], seed), er * fk * cornerJitter(cr[0], cr[1], seed)];
            const topH = map.ceilHeightAt(tx + dx, ty + dz);
            const wallTint: Tint = secret ? [1, 1, 1] : edgeTint(tx, ty, dx, dz);
            if (cell.window) {
              // Reinforced glass observation wall: bottom sill + upper lintel + translucent pane
              wallFace(builder(`w:${texId}`, textureOr(texId)), tx, ty, dx, dz, jit, st, wallTint, 0, 0.42);
              if (topH > 0.96) {
                wallFace(builder(`w:${texId}`, textureOr(texId)), tx, ty, dx, dz, jit, st, wallTint, 0.96, topH);
              }
              wallFace(glassBuilder, tx, ty, dx, dz, Math.max(0.75, shade), 0, [0.55, 0.88, 1.0], 0.42, 0.96);
            } else {
              wallFace(builder(`w:${texId}`, textureOr(texId)), tx, ty, dx, dz, jit, st, wallTint, 0, topH);
              if (pick.decal) {
                const did = pick.decal;
                const dt = decalTexture(did);
                if (dt) decalFace(builder(`d:${did}`, dt), tx, ty, dx, dz, jit, st, wallTint);
              }
            }
          }
          continue;
        }
        if (cell.kind === 'door' && !map.isDoorOpen(cell.doorId ?? '')) {
          const id = cell.doorId ?? `d${tx},${ty}`;
          const tex = doorTextureFor(cell.tex, cell.accessRole);
          const doorH = map.ceilHeightAt(tx, ty);
          const b = new GeoBuilder();
          for (const [dx, dz] of DIRS) {
            const n = map.cellAt(tx + dx, ty + dz);
            if (!n || n.kind === 'wall' || n.kind === 'door') continue;
            // door faces are inset slightly so the jamb tracks show; secret
            // doors skip jitter/tint so the misaligned tell stays legible
            const dh = cellHash(tx, ty, dx * 3 + dz * 5 + 7, seed);
            const dl = lightAt(tx + dx, ty + dz);
            wallFace(b, tx, ty, dx, dz, cell.secret ? dl : dl * faceShade(dh), strobeAt(tx + dx, ty + dz), cell.secret ? [1, 1, 1] : faceTint(dh), 0, doorH);
          }
          b.quad(
            [[tx, 0.002, ty], [tx + 1, 0.002, ty], [tx + 1, 0.002, ty + 1], [tx, 0.002, ty + 1]],
            [[0, 0], [1, 0], [1, 0.1], [0, 0.1]],
            [0.3, 0.3, 0.3, 0.3],
          );
          const mesh = new THREE.Mesh(b.build(), worldMaterial(tex, 1, worldFloor, tintV, 0.055));
          this.levelGroup.add(mesh);
          this.doorMeshes.set(id, mesh);
        }
        // floor + ceiling (also under doors)
        const L = lightAt(tx, ty);
        const ao = (cx: number, cy: number) => {
          // corner occlusion: count walls among the 4 cells touching this corner
          let n = 0;
          for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (isWall(cx + ox, cy + oy)) n++;
          return L * (1 - n * 0.14);
        };
        const fk = flicker(tx, ty);
        const s = [ao(tx, ty), ao(tx + 1, ty), ao(tx + 1, ty + 1), ao(tx, ty + 1)].map((v) => v * fk);
        const cellFloor = cell.kind === 'exit' ? 'exit' : textureRegistry.get(cell.tex) && cell.kind === 'floor' ? cell.tex : 'floor';
        const floorTex = cellFloor === 'floor' ? theme.floor : cellFloor;
        const st = strobeAt(tx, ty);
        const fh = cellHash(tx, ty, 11, seed);
        let fTex = floorTex;
        const nfv = variantCount(fTex);
        if (nfv > 1 && fh % nfv > 0) fTex = `${fTex}:v${fh % nfv}`;
        const fshade = s.map((v) => v * faceShade(fh));
        const floorH = map.floorHeightAt(tx, ty);
        const ceilH = map.ceilHeightAt(tx, ty);
        if (cell.lift) {
          // Recessed pit floor at lift.low plus a dynamic moving platform mesh
          const pitY = cell.lift.low;
          builder(`f:${fTex}`, textureOr(fTex, 'floor')).quad(
            [[tx, pitY, ty], [tx + 1, pitY, ty], [tx + 1, pitY, ty + 1], [tx, pitY, ty + 1]],
            flatUv((fh >>> 3) % 4, ((fh >>> 5) & 1) === 1),
            fshade.map((v) => v * 0.7),
            st,
            faceTint(fh),
          );
          const lb = new GeoBuilder();
          const liftTopTex = textureOr('exit', 'floor');
          const skirtDepth = Math.max(0.6, cell.lift.high - cell.lift.low + 0.12);
          lb.quad(
            [[tx, 0, ty], [tx + 1, 0, ty], [tx + 1, 0, ty + 1], [tx, 0, ty + 1]],
            [[0, 0], [1, 0], [1, 1], [0, 1]],
            [L * 1.05, L * 1.05, L * 1.05, L * 1.05],
            0,
          );
          for (const [dx, dz] of DIRS) {
            wallFace(lb, tx, ty, dx, dz, L * 0.85, 0, undefined, -skirtDepth, 0);
          }
          const liftMesh = new THREE.Mesh(lb.build(), worldMaterial(liftTopTex, 1, worldFloor, tintV, 0.055));
          liftMesh.position.y = floorH;
          this.levelGroup.add(liftMesh);
          this.liftMeshes.push({ mesh: liftMesh, tx, ty });
        } else {
          builder(`f:${fTex}`, textureOr(fTex, 'floor')).quad(
            [[tx, floorH, ty], [tx + 1, floorH, ty], [tx + 1, floorH, ty + 1], [tx, floorH, ty + 1]],
            flatUv((fh >>> 3) % 4, ((fh >>> 5) & 1) === 1),
            fshade,
            st,
            faceTint(fh),
          );
        }
        // Step risers (lower-sidedef) and ceiling beams (upper-sidedef) between different heights
        for (const [dx, dz] of DIRS) {
          const n = map.cellAt(tx + dx, ty + dz);
          if (!n || n.kind === 'wall') continue;
          const nFloorH = n.lift ? n.lift.low : map.floorHeightAt(tx + dx, ty + dz);
          const myStaticFloorH = cell.lift ? cell.lift.low : floorH;
          if (nFloorH < myStaticFloorH - 0.001) {
            wallFace(builder(`w:${fTex}`, textureOr(fTex, 'floor')), tx, ty, dx, dz, L * 0.9, st, faceTint(fh), nFloorH, myStaticFloorH);
          }
          const nCeilH = map.ceilHeightAt(tx + dx, ty + dz);
          if (nCeilH > ceilH + 0.001) {
            const soffitTex = theme.alts[0] ?? 'wall-panel';
            wallFace(builder(`w:${soffitTex}`, textureOr(soffitTex)), tx, ty, dx, dz, lightAt(tx + dx, ty + dz) * 0.88, st, undefined, ceilH, nCeilH);
          }
        }
        const key = `${tx},${ty}`;
        const ch = cellHash(tx, ty, 23, seed);
        // occasional cable-tray cell keeps big ceilings authored, not tiled
        let ceilTex = this.lamps.has(key)
          ? 'ceil-light'
          : this.deadLamps.has(key)
            ? 'ceil-light-off'
            : ch % 9 === 0
              ? 'ceil-duct'
              : ch % 9 === 3
                ? 'ceil-vent'
                : 'ceil';
        const ncv = variantCount(ceilTex);
        if (ncv > 1 && (ch >>> 6) % ncv > 0) ceilTex = `${ceilTex}:v${(ch >>> 6) % ncv}`;
        const isLamp = this.lamps.has(key);
        const ceilFactor = (v: number) => (v < 0.55 ? 0.74 : 0.74 + (v - 0.55) * 0.5);
        if (!cell.sky) {
          builder(`${isLamp ? 'l' : 'c'}:${ceilTex}`, textureOr(ceilTex, 'ceil')).quad(
            [[tx, ceilH, ty], [tx + 1, ceilH, ty], [tx + 1, ceilH, ty + 1], [tx, ceilH, ty + 1]],
            flatUv((ch >>> 3) % 4, ((ch >>> 5) & 1) === 1),
            s.map((v) => v * ceilFactor(v) * faceShade(ch)),
            st,
            faceTint(ch),
          );
        }
        if (cell.kind === 'exit') this.addStatic('fx-exit', tx + 0.5, ty + 0.5, ceilH - 0.26, L);
      }
    }
    for (const [key, { tex, b }] of builders) {
      const wallish = key.startsWith('w:') || key.startsWith('d:') || key === 'doortrak';
      this.levelGroup.add(new THREE.Mesh(
        b.build(),
        worldMaterial(tex, 1, worldFloor, key.startsWith('l:') ? accentV : tintV, wallish ? 0.055 : 0),
      ));
    }
    if (glassBuilder.pos.length > 0) {
      const glassMat = new THREE.MeshBasicMaterial({
        color: 0x70c8e8,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.levelGroup.add(new THREE.Mesh(glassBuilder.build(), glassMat));
    }
  }

  private makeSpriteMesh(set: SpriteSet, light: number, additive = false): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
    // frames[0] by key order — Object.values() would force every lazy getter
    const first = set.frames[Object.keys(set.frames)[0]];
    const mat = worldMaterial(first, light);
    if (additive) {
      // glow adds to what is behind it: no dark outline box, and overlapping effects build up
      mat.blending = THREE.AdditiveBlending;
      mat.transparent = true;
      mat.depthWrite = false;
    }
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.scale.set(set.w, set.h, 1);
    const shade = new THREE.Float32BufferAttribute(new Float32Array(this.planeGeo.attributes.position.count).fill(1), 1);
    if (!this.planeGeo.getAttribute('shade')) this.planeGeo.setAttribute('shade', shade);
    if (!this.planeGeo.getAttribute('strobe'))
      this.planeGeo.setAttribute('strobe', new THREE.Float32BufferAttribute(new Float32Array(this.planeGeo.attributes.position.count), 1));
    if (!this.planeGeo.getAttribute('tintv'))
      this.planeGeo.setAttribute('tintv', new THREE.Float32BufferAttribute(new Float32Array(this.planeGeo.attributes.position.count * 3).fill(1), 3));
    this.spriteGroup.add(mesh);
    return { mesh, mat };
  }

  private addStatic(setId: string, x: number, z: number, y: number, light: number, frame?: string, tune?: { floor?: number; gain?: number }): void {
    const set = spriteSets.get(setId);
    if (!set) return;
    const { mesh, mat } = this.makeSpriteMesh(set, light);
    if (tune?.floor !== undefined) mat.uniforms.uFloor.value = tune.floor;
    if (tune?.gain !== undefined) mat.uniforms.uGain.value = tune.gain;
    mesh.position.set(x, y, z);
    this.ghosts.push({
      mesh, mat, set, setId, lastX: x, lastY: z, facing: null, moveT: 0, animT: 0, lastHp: 0, flash: 0, scale: 1,
      kind: 'prop', entity: null, frame,
    });
  }

  private spawnFx(setId: string, frames: string[], x: number, z: number, y: number, dur: number, light = 1, vel?: { vx: number; vy: number; vz: number }): Fx | null {
    if (this.debugSuppressFx) return null;
    const set = spriteSets.get(setId);
    if (!set) return null;
    const { mesh, mat } = this.makeSpriteMesh(set, light, ADDITIVE_FX.has(setId));
    mesh.position.set(x, y, z);
    const fx: Fx = { mesh, mat, set, frames, t: 0, dur, ...vel };
    this.fx.push(fx);
    return fx;
  }

  /** Bright Doom teleport-fog column where a threat materialises. The column is
   *  taller than any threat (fx-spawn draws 2.1 world units, >=1.5x the biggest
   *  monster) and burns ~1 s so an ambush can't be missed (ENEMIES). */
  spawnTeleport(x: number, y: number): void {
    const fx = this.spawnFx('fx-spawn', SPAWN_FRAMES, x, y, 0, 1.05);
    if (fx) {
      fx.light = SPAWN_LIGHT;
      // additive at full strength burns to solid white over a bright sprite
      (fx.mat.uniforms.uTint.value as THREE.Vector3).setScalar(SPAWN_COLUMN_STRENGTH);
    }
  }

  /** Red padlock overlay on a door or console a ransomware has sealed. */
  sealMark(id: string, x: number, y: number, kind: 'door' | 'entity'): void {
    this.unsealMark(id);
    const set = spriteSets.get('fx-seal');
    if (!set) return;
    const place = (px: number, py: number, h: number) => {
      const { mesh, mat } = this.makeSpriteMesh(set, 1);
      mesh.position.set(px, h, py);
      const st: SpriteState = {
        mesh, mat, set, setId: 'fx-seal', lastX: px, lastY: py, facing: null, moveT: 0, animT: 0,
        lastHp: 0, flash: 0, scale: 1, kind: 'prop', entity: null, frame: 'idle',
      };
      this.ghosts.push(st);
      this.sealMarks.set(id, st);
    };
    if (kind === 'entity') {
      place(x, y, 0.5);
      return;
    }
    // door: the slab fills the cell, so float a padlock on each open side
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    let placed = false;
    if (this.map) {
      for (const [dx, dz] of DIRS) {
        const n = this.map.cellAt(tx + dx, ty + dz);
        if (!n || n.kind === 'wall' || n.kind === 'door') continue;
        place(tx + 0.5 + dx * 0.42, ty + 0.5 + dz * 0.42, 0.28);
        placed = true;
      }
    }
    if (!placed) place(x, y, 0.28);
  }

  unsealMark(id: string): void {
    const st = this.sealMarks.get(id);
    if (!st) return;
    this.sealMarks.delete(id);
    this.spriteGroup.remove(st.mesh);
    const i = this.ghosts.indexOf(st);
    if (i >= 0) this.ghosts.splice(i, 1);
  }

  /** Remove the mesh for an opened door (animated: the door slides up). */
  setDoorOpen(doorId: string): void {
    const mesh = this.doorMeshes.get(doorId);
    if (mesh) {
      this.openingDoors.push({ mesh, t: 0 });
      this.doorMeshes.delete(doorId);
    }
  }

  /** Remove a door slab instantly — checkpoint restore where the door is already open. */
  clearDoor(doorId: string): void {
    const mesh = this.doorMeshes.get(doorId);
    if (mesh) {
      this.levelGroup.remove(mesh);
      this.doorMeshes.delete(doorId);
    }
  }

  viewLight(x: number, y: number): number {
    return this.lightAt(x, y);
  }

  private lightAt(x: number, y: number): number {
    return this.tileLight(Math.floor(x), Math.floor(y));
  }

  private tileLight(tx: number, ty: number): number {
    const m = this.map;
    if (!m || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0.5;
    return this.light[ty * m.w + tx];
  }

  private strobeAt(tx: number, ty: number): number {
    const m = this.map;
    if (!m || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0;
    return this.strobe[ty * m.w + tx];
  }

  /** Debug (look gate): how many tiles sit in strobing sectors, and how many phases. */
  strobeStats(): { tiles: number; phases: number; sample?: { x: number; y: number } } {
    const j = this.strobe.findIndex((v) => v > 0);
    return {
      tiles: [...this.strobe].filter((v) => v > 0).length,
      phases: this.strobeCount,
      sample: j >= 0 ? { x: (j % this.strobeW) + 0.5, y: ((j / this.strobeW) | 0) + 0.5 } : undefined,
    };
  }

  /** Sector lighting (see computeSectorLight): per-tile light, strobes and lamp cells. */
  private computeLight(map: WorldMap, def: MapDef, entityDefs?: { x: number; y: number; kind: string }[], missionId?: string): void {
    const r = computeSectorLight(map, def, entityDefs, missionId);
    this.light = r.light;
    this.strobe = r.strobe;
    this.strobeW = map.w;
    this.strobeCount = r.strobeCount;
    this.lamps = r.lamps;
    this.deadLamps = r.deadLamps;
  }


  syncEntities(entities: Entity[], projectiles: Projectile[]): void {
    const seen = new Set<string>();
    for (const e of entities) {
      const id = e.def.id;
      let st = this.sprites.get(id);
      if (!e.alive) {
        if (st) this.retire(st);
        continue;
      }
      seen.add(id);
      const threatKind = e.def.threat ?? e.def.sprite;
      const setId = this.debugSprite.get(id) ?? spriteSetIdFor(e);
      const set = spriteSets.get(setId) ?? spriteSets.require('npc-m');
      if (!st) {
        const { mesh, mat } = this.makeSpriteMesh(set, this.lightAt(e.x, e.y));
        st = {
          mesh, mat, set, setId, lastX: e.x, lastY: e.y, facing: null, moveT: 0, animT: Math.random() * 3,
          lastHp: e.hp, flash: 0, scale: 1, kind: e.def.kind, entity: e,
        };
        this.sprites.set(id, st);
      }
      if (st.setId !== setId) {
        st.set = set;
        st.setId = setId;
        st.mesh.scale.set(set.w, set.h, 1);
      }
      if (e.hp < st.lastHp) st.flash = 1;
      st.lastHp = e.hp;
      const hurtT = (e as Entity & { hurtT?: number }).hurtT;
      // every landed hit pins the sprite flash to full for the ~100 ms hurt
      // window, so >=0.9 brightness holds for the ~90 ms the eye needs
      if (typeof hurtT === 'number' && hurtT > 0) st.flash = Math.max(st.flash, 1);
      const dx = e.x - st.lastX;
      const dy = e.y - st.lastY;
      if (Math.hypot(dx, dy) > 0.002) {
        st.facing = Math.atan2(dy, dx);
        st.moveT = 0.2;
      }
      st.lastX = e.x;
      st.lastY = e.y;
      st.entity = e;
      const scale = typeof e.state.scale === 'number' && Number.isFinite(e.state.scale) ? e.state.scale : 1;
      // guard NaN (ai.ts hop uses state.phase, unset on some spawns): NaN y = invisible monster
      const hop = typeof e.state.hop === 'number' && Number.isFinite(e.state.hop) ? e.state.hop : 0;
      const floorH = this.map?.floorHeightAtF(e.x, e.y) ?? 0;
      st.scale = scale;
      st.mesh.scale.set(set.w * scale, set.h * scale, 1);
      st.mesh.position.set(e.x, floorH + hop, e.y);
      const lit = this.lightAt(e.x, e.y);
      // threats stay readable even in black sectors (Doom's monsters are rarely pure silhouette)
      const enemy = e.def.kind === 'enemy';
      // a still-disguised trojan lit exactly like the real pickup it imitates
      const disguised = enemy && threatKind === 'trojan' && !e.state.revealedTrojan;
      st.mat.uniforms.uLight.value = disguised ? Math.max(0.7, lit) : enemy ? 1 : e.def.kind === 'item' ? Math.max(0.7, lit) : lit;
      // monsters keep a much higher floor than walls (and a slight gain) so
      // they read against dark sectors at any range, like Doom's
      st.mat.uniforms.uFloor.value = disguised ? 0.45 : enemy ? (set.floor ?? 0.85) : e.def.kind === 'item' ? 0.45 : 0.2;
      const threat = enemy && !disguised;
      st.mat.uniforms.uGain.value = threat ? this.threatGain(set) : 1;
      st.mat.uniforms.uRoom.value = lit;
      st.mat.uniforms.uRim.value = threat ? RIM_STRENGTH : 0;
      if (threat && set.gib) (st.mat.uniforms.uRimCol.value as THREE.Vector3).set(set.gib[0], set.gib[1], set.gib[2]);
      // engine emits state.tint (red during pain/flash) — apply it to the sprite
      const tint = (e.state.tint as number | undefined) ?? 0xffffff;
      (st.mat.uniforms.uTint.value as THREE.Vector3).set(
        ((tint >> 16) & 255) / 255,
        ((tint >> 8) & 255) / 255,
        (tint & 255) / 255,
      );
      // rootkit: invisible beyond ~2 tiles until tap/EDR/damage/close reveals
      // it — but a MOVING rootkit within ~6 tiles leaves a faint Spectre-style
      // shimmer (uGhost stipple), so attentive players can spot the trace
      const stealthy = enemy && threatKind === 'rootkit' && !e.state.revealedRootkit;
      const pd = Math.hypot(e.x - this.lastPX, e.y - this.lastPY);
      const shimmer = stealthy && pd <= 6 && pd > 2 && st.moveT > 0;
      st.mat.uniforms.uGhost.value = shimmer ? 0.2 : 0;
      const shown = !(stealthy && pd > 2 && !shimmer);
      st.mesh.visible = !this.debugHidden.has(id) && shown;
      if (threat) {
        const ground = (st.ground ??= this.makeGround(set));
        const spread = set.w * scale * GROUND_SPREAD;
        ground.scale.set(spread, 1, spread);
        ground.position.set(e.x, floorH + GROUND_LIFT, e.y);
        (ground.material as THREE.ShaderMaterial).uniforms.uPool.value = poolStrength(lit);
        // a hidden rootkit must not be given away by its own shadow
        ground.visible = shown && !shimmer && (!this.debugHidden.has(id) || this.debugKeepGround === id);
      } else if (st.ground) {
        this.dropGround(st);
      }
      // wound char: corruption blotches ramp in once a threat drops under 50% hp
      const maxHp = typeof e.state.maxHp === 'number' && e.state.maxHp > 0 ? e.state.maxHp : (e.def.hp ?? 1);
      st.mat.uniforms.uWound.value =
        enemy && e.hp < maxHp * 0.5 ? Math.min(0.55, (0.5 - e.hp / maxHp) * 1.4) : 0;
    }
    // Direct Map iteration — deleting mid-iteration is safe and avoids
    // materialising a copy of every sprite entry each frame.
    for (const [id, st] of this.sprites) {
      if (!seen.has(id) && st.entity && st.entity.alive === false) continue;
      if (!seen.has(id)) {
        this.spriteGroup.remove(st.mesh);
        this.dropGround(st);
        this.sprites.delete(id);
      }
    }

    // projectiles
    const live = new Set<Projectile>();
    for (const p of projectiles) {
      if (!p.alive) continue;
      live.add(p);
      let st = this.projSprites.get(p);
      if (!st) {
        const setId = p.hostile ? 'fx-payload' : 'fx-scan';
        const set = spriteSets.require(setId);
        const { mesh, mat } = this.makeSpriteMesh(set, 1, true);
        st = {
          mesh, mat, set, setId, lastX: p.x, lastY: p.y, facing: null, moveT: 0, animT: 0, lastHp: 0,
          flash: 0, scale: 1, kind: 'prop', entity: null,
        };
        this.projSprites.set(p, st);
      }
      if (!p.hostile) {
        // scanner charge leaves a short trail so its whole flight reads
        st.moveT += Math.hypot(p.x - st.lastX, p.y - st.lastY);
        if (st.moveT > 0.3 && p.traveled > SHOT_NEAR) {
          st.moveT = 0;
          this.spawnFx('fx-scan-trail', ['f0', 'f1'], st.lastX, st.lastY, EYE_H - 0.2, 0.2);
        }
      }
      st.lastX = p.x;
      st.lastY = p.y;
      const pFloor = this.map?.floorHeightAtF(p.x, p.y) ?? 0;
      st.mesh.position.set(p.x, pFloor + EYE_H - 0.2, p.y);
      // the player's own shot only appears once clear of the camera, so it never fills the aim area
      st.mesh.visible = !this.debugSuppressFx && (p.hostile || p.traveled > SHOT_NEAR);
    }
    for (const [p, st] of [...this.projSprites]) {
      if (live.has(p)) continue;
      this.spriteGroup.remove(st.mesh);
      this.projSprites.delete(p);
      this.spawnFx('fx-puff', PUFF_FRAMES, st.lastX, st.lastY, EYE_H - 0.32, 0.24);
    }
  }

  syncParticles(view: ParticleView): void {
    const count = Math.min(view.count, MAX_PARTICLES);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.particlePositions[i3] = view.x[i];
      this.particlePositions[i3 + 1] = view.z[i];
      this.particlePositions[i3 + 2] = view.y[i];
      this.particleColors[i3] = view.color[i3];
      this.particleColors[i3 + 1] = view.color[i3 + 1];
      this.particleColors[i3 + 2] = view.color[i3 + 2];
      this.particleSizes[i] = view.size[i];
      this.particleMinPx[i] = view.minPx[i];
    }
    (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('minPx') as THREE.BufferAttribute).needsUpdate = true;
    this.particleGeometry.setDrawRange(0, count);
    // LOOK probes: a kill or pickup burst still in the air behind the staged
    // sprite would be measured as its backdrop
    this.particlePoints.visible = !this.debugSuppressFx;
  }

  /** Ceiling world-Y over an enemy's tile, or null when no clamp applies (no map, sky). */
  private enemyCeilY(st: SpriteState): number | null {
    const m = this.map;
    if (!m) return null;
    // the entity's own tile, not the mesh's: at point-blank the mesh is pulled toward the camera
    const tx = Math.floor(st.entity?.x ?? st.mesh.position.x);
    const ty = Math.floor(st.entity?.y ?? st.mesh.position.z);
    if (m.isSky(tx, ty)) return null;
    const c = m.ceilHeightAt(tx, ty);
    return Number.isFinite(c) ? c : null;
  }

  /**
   * Share of the canvas height (from the base) up to the highest opaque row of
   * the set's first walk frame. Textures store rows bottom-up (row 0 = base).
   * Only a real measurement is cached; frames still pending return 1.
   */
  private spriteTopFrac(set: SpriteSet): number {
    if (set.topFrac !== undefined) return set.topFrac;
    const tex = set.frames['walk0_0'] ?? set.frames['walk0'] ?? set.frames['walk0_1'];
    const im = tex?.image as { data?: ArrayLike<number>; width: number; height: number } | undefined;
    if (!im?.data || !(im.width > 0) || !(im.height > 0) || im.data.length < im.width * im.height * 4) return 1;
    for (let row = im.height - 1; row >= 0; row--) {
      const o = row * im.width * 4;
      for (let x = 0; x < im.width; x++) {
        if (im.data[o + x * 4 + 3] > 0) {
          set.topFrac = (row + 1) / im.height;
          return set.topFrac;
        }
      }
    }
    return 1;
  }

  /**
   * Dark-sector gain for a threat set: sized to its own median body tone
   * (threatLight.ts) once the display frame exists; the authored gain until then.
   */
  private threatGain(set: SpriteSet): number {
    const authored = set.gain ?? 1.9;
    if (set.midPeak === undefined) {
      const tex = set.frames['walk0_0'] ?? set.frames['walk0'];
      const im = tex?.image as { data?: ArrayLike<number>; width: number; height: number } | undefined;
      if (!im?.data || !(im.width > 1) || im.data.length < im.width * im.height * 4) return authored;
      set.midPeak = midPeak(im.data, im.width, im.height);
    }
    return darkGain(authored, set.midPeak);
  }

  private makeGround(set: SpriteSet): THREE.Mesh {
    const mesh = new THREE.Mesh(this.groundGeo, groundMaterial(set.gib ?? [0.6, 0.8, 1]));
    this.spriteGroup.add(mesh);
    return mesh;
  }

  private dropGround(st: SpriteState): void {
    if (!st.ground) return;
    this.spriteGroup.remove(st.ground);
    (st.ground.material as THREE.Material).dispose();
    st.ground = undefined;
  }

  /** Copy this frame's strongest moving lights (projectiles, spawn columns) into the shared uniforms. */
  private updatePointLights(): void {
    const sources: PointLight[] = [];
    // probes measure the world and one sprite: no stray lights between captures
    if (!this.debugSuppressFx && !this.debugNoFlash) {
      for (const [p, st] of this.projSprites) {
        if (!st.mesh.visible) continue;
        sources.push({ x: p.x, y: p.y, ...(p.hostile ? PAYLOAD_LIGHT : SCAN_LIGHT) });
      }
      for (const fx of this.fx) {
        if (fx.light) sources.push(fadingLight(fx.light, fx.mesh.position.x, fx.mesh.position.z, fx.t, fx.dur));
      }
    }
    const picked = pickPointLights(sources, this.camera.position.x, this.camera.position.z);
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const l = picked[i];
      pointUniform.value[i].set(l?.x ?? 0, l?.y ?? 0, l?.radius ?? 1, l?.intensity ?? 0);
      pointColUniform.value[i].set(l?.col[0] ?? 0, l?.col[1] ?? 0, l?.col[2] ?? 0);
    }
  }

  /** Debug: world-Y of each live enemy's opaque top vs the ceiling over its tile. */
  debugSpriteTops(): { id: string; kind: string; top: number; ceil: number; sky: boolean; scale: number }[] {
    const out: { id: string; kind: string; top: number; ceil: number; sky: boolean; scale: number }[] = [];
    const m = this.map;
    for (const [id, st] of this.sprites) {
      if (st.entity?.def.kind !== 'enemy' || !m) continue;
      const tx = Math.floor(st.entity.x);
      const ty = Math.floor(st.entity.y);
      const scale = st.mesh.scale.y / st.set.h;
      out.push({
        id: String(id),
        kind: st.entity.def.threat ?? st.entity.def.sprite ?? 'enemy',
        top: st.mesh.position.y + st.mesh.scale.y * this.spriteTopFrac(st.set),
        ceil: m.ceilHeightAt(tx, ty),
        sky: m.isSky(tx, ty),
        scale,
      });
    }
    return out;
  }

  debugHurtUniform(): number {
    return this.postMat.uniforms.uHurt.value as number;
  }

  /** Entity went away: malware dissolves; cleaned workstations stay as clean props. */
  private retire(st: SpriteState): void {
    const e = st.entity;
    this.spriteGroup.remove(st.mesh);
    this.dropGround(st);
    if (e) this.sprites.delete(e.def.id);
    if (!e) return;
    if (e.def.kind === 'enemy') {
      if (st.set.frames.die0) {
        this.spawnFx(st.setId, ['die0', 'die1', 'die2', 'die3', 'die4'], e.x, e.y, 0, 0.55, this.lightAt(e.x, e.y));
        // ENEMIES data-gib: threat-coloured debris chunks arc out and hold as
        // floor litter over the tip-over — the kill reads messy like Doom's.
        const gb = st.set.gib ?? [0.2, 0.9, 0.4];
        const seed = hashStr(st.setId) / 4294967296;
        for (let i = 0; i < 6; i++) {
          const a = seed * 6.283 + i * 2.4;
          const sp = 0.7 + ((seed * 7 + i * 0.37) % 1) * 1.5;
          const g = this.spawnFx('fx-gib', [`g${i % 3}`], e.x, e.y, 0.42, 1.7, this.lightAt(e.x, e.y), {
            vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.7 + ((seed * 11 + i * 0.53) % 1) * 1.8,
          });
          if (g) (g.mat.uniforms.uTint.value as THREE.Vector3).set(gb[0], gb[1], gb[2]);
        }
        // persistent, non-blocking corpse: the slumped 'dead' heap stays on the floor
        if (st.set.frames.dead) {
          this.addStatic(st.setId, e.x, e.y, 0, this.lightAt(e.x, e.y), 'dead', { floor: 0.9, gain: 1.3 });
        }
      } else {
        this.spawnFx('fx-puff', PUFF_FRAMES, e.x, e.y, 0.4, 0.4);
      }
    } else if (e.def.kind === 'workstation') {
      this.addStatic('workstation', e.x, e.y, 0, this.lightAt(e.x, e.y));
      this.spawnFx('fx-puff', PUFF_FRAMES, e.x, e.y, 0.4, 0.4);
    }
  }

  private pickFrame(st: SpriteState, camAngle: number, px: number, py: number): { tex: THREE.Texture; flip?: boolean } {
    const f = st.set.frames;
    const anim = st.set.anim;
    const t = st.animT;
    if (st.frame) {
      const forced = f[st.frame];
      if (forced) return { tex: forced };
    }
    if (anim === 'monster') {
      // Doom-style rotations: which of 8 views faces the camera
      const toCam = Math.atan2(py - st.lastY, px - st.lastX);
      const facing = st.facing ?? toCam;
      const rel = (toCam - facing) / (Math.PI / 4);
      const rot = ((Math.round(rel) % 8) + 8) % 8;
      // Views 5-7 are views 3-1 mirrored. They used to be separate textures;
      // now the same texture is drawn with its UVs flipped.
      const flip = rot > 4;
      const view = flip ? 8 - rot : rot;
      const pick = (k: string) => ({ tex: f[`${k}_${view}`] ?? f[k], flip });
      // two authored flinch poses flicker while the hit flash is up (ENEMIES)
      if (st.flash > 0.45 && f.pain) return pick(f.pain2 && Math.floor(t * 12) % 2 === 1 ? 'pain2' : 'pain');
      // the cycle keeps its length whatever the frame count: more frames, same stride
      const walkN = st.set.walkN ?? 4;
      const walk = `walk${Math.floor(t * walkN * WALK_CYCLES_PER_S) % walkN}`;
      const state = st.entity?.state;
      const stateMode = state?.mode;
      if (typeof stateMode === 'string') {
        if (stateMode === 'windup') {
          // anticipation first: a crouch-and-pull-back before the raised pose
          const wu = ((state?.windupT as number | undefined) ?? 0) / Math.max(0.01, (state?.windupDur as number | undefined) ?? 0.4);
          return pick(wu < ANTICIPATION_SHARE && 'windup' in f ? 'windup' : 'attack0');
        }
        if (stateMode === 'recover') {
          // the strike pose, then an overshoot as it settles
          const left = (state?.recoverT as number | undefined) ?? 0;
          return pick(left <= SETTLE_TAIL_S && 'settle' in f ? 'settle' : 'attack1');
        }
        // standing still: breathe instead of walking on the spot
        if (st.moveT <= 0 && 'idle1' in f) return pick(['walk0', 'idle1', 'walk0', 'idle2'][Math.floor(t * 3) % 4]);
        return pick(walk);
      }
      const dist = Math.hypot(px - st.lastX, py - st.lastY);
      if (dist < 0.95 && f.attack0) return pick(Math.floor(t * 5) % 2 === 0 ? 'attack1' : 'attack0');
      return pick(walk);
    }
    if (anim === 'person') {
      const moving = st.moveT > 0;
      const step = moving ? [1, 0, 2, 0][Math.floor(t * 6) % 4] : 0;
      let view = 'front';
      if (st.facing !== null) {
        const rel = st.facing - camAngle;
        const c = Math.cos(rel);
        const s = Math.sin(rel);
        if (c < -0.5) view = 'front';
        else if (c > 0.5) view = 'back';
        else view = s > 0 ? 'side' : 'sideL';
      }
      return { tex: f[`${view}${step}`] ?? f.front0 };
    }
    if (anim === 'flicker') {
      const keys = Object.keys(f);
      return { tex: f[keys[Math.floor(t * (st.set.fps ?? 3)) % keys.length]] };
    }
    return { tex: Object.values(f)[0] };
  }

  /** FEEL hook: Doom muzzle-flash — flood walls/floor near the camera with
   *  tool-coloured light for ~110 ms on each damaging tool use. */
  fireLight(r: number, g: number, b: number, strength = 0.85): void {
    if (this.debugNoFlash) return; // probes hold fire flood constant between captures
    fireUniform.value.set(r, g, b, strength);
  }

  /** Current muzzle-flash intensity (debug/tests). */
  fireLevel(): number {
    return fireUniform.value.w;
  }

  /** FEEL hook: landed-hit light bloom — the world light wells up around the
   *  hit point (~3 tile radius, ~100 ms) in threat-tinted colour. */
  impactLight(x: number, y: number, r: number, g: number, b: number, strength = 0.9): void {
    if (this.debugNoFlash) return;
    impactUniform.value.set(x, y, strength, 0);
    impactColUniform.value.set(r, g, b);
  }

  /** Current landed-hit bloom intensity (debug/tests). */
  impactLevel(): number {
    return impactUniform.value.z;
  }

  render(player: Player, pose?: ViewPose): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    // debugNoFlash is set by the look probes: freeze all time-driven state
    // (fire flicker, sprite bob, shader uTime) so before/after captures only
    // differ by what the probe toggled.
    if (!this.debugNoFlash) {
      this.time += dt;
      timeUniform.value = this.time;
    }
    probeStrobeUniform.value = this.debugNoFlash ? 0.1 : -1;
    if (!this.debugNoFlash) {
      fireUniform.value.w = Math.max(0, fireUniform.value.w - dt / 0.11);
      impactUniform.value.z = Math.max(0, impactUniform.value.z - dt / 0.1);
    }

    // damage → palette red shift
    if (player.integrity < this.lastIntegrity) this.hurt = Math.min(0.85, this.hurt + 0.3 + (this.lastIntegrity - player.integrity) * 0.012);
    this.lastIntegrity = player.integrity;
    this.hurt = Math.max(0, this.hurt - dt * 0.6);
    const lowHp = player.integrity > 0 && player.integrity < 25 ? 0.12 + Math.sin(this.time * 5) * 0.06 : 0;
    // debugNoFlash (look probes): flatten every time-varying post/light
    // uniform so with/without-sprite captures differ only at the sprite
    this.postMat.uniforms.uHurt.value = this.debugNoFlash ? 0 : Math.min(0.85, Math.max(pose?.hurt ?? this.hurt, lowHp));
    this.postMat.uniforms.uHurtSide.value = this.debugNoFlash ? 0 : pose?.hurtSide ?? 0;
    this.postMat.uniforms.uBonus.value = this.debugNoFlash ? 0 : pose?.bonus ?? 0;
    if (this.debugNoFlash) {
      fireUniform.value.w = 0;
      impactUniform.value.z = 0;
    }

    const speed = Math.min(1, Math.hypot(player.vx, player.vy) / 4);
    const bobY = Math.abs(Math.sin(player.bob)) * 0.035 * speed * player.bobScale;
    const cameraX = pose?.x ?? player.x;
    const cameraY = pose?.y ?? player.y;
    const cameraAngle = pose?.angle ?? player.angle;
    this.lastPX = player.x;
    this.lastPY = player.y;
    if (this.map && this.liftMeshes.length > 0) {
      for (const lm of this.liftMeshes) {
        lm.mesh.position.y = this.map.floorHeightAt(lm.tx, lm.ty);
      }
    }
    const targetFloorY = this.map?.floorHeightAtF(cameraX, cameraY) ?? 0;
    this.smoothFloorY += (targetFloorY - this.smoothFloorY) * Math.min(1, dt * 12);
    const camY = this.smoothFloorY + (pose ? EYE_H + pose.dz : EYE_H + bobY);
    this.camera.position.set(cameraX, camY, cameraY);
    if (this.skyMesh) this.skyMesh.position.set(cameraX, camY, cameraY);
    this.camera.rotation.set(pose?.pitch ?? 0, -cameraAngle - Math.PI / 2, pose?.roll ?? 0, 'YXZ');
    const yaw = this.camera.rotation.y;

    for (const st of [...this.sprites.values(), ...this.ghosts, ...this.projSprites.values()]) {
      if (!this.debugNoFlash) {
        st.animT += dt;
        st.moveT -= dt;
        st.flash = Math.max(0, st.flash - dt * 3);
      } else {
        // probes measure the sprite's resting look: a pain flash stuck on by
        // a stray hit between probes would otherwise pin it to the white-out
        // pain frame for the whole suite
        st.flash = 0;
      }
      st.mesh.rotation.set(0, yaw, 0);
      const frame = this.pickFrame(st, cameraAngle, cameraX, cameraY);
      st.mat.uniforms.map.value = frame.tex;
      // mirrored facing: u -> 1 - u
      (st.mat.uniforms.uUvScale.value as THREE.Vector2).set(frame.flip ? -1 : 1, 1);
      (st.mat.uniforms.uUvOffset.value as THREE.Vector2).set(frame.flip ? 1 : 0, 0);
      if (st.entity) {
        // point-blank: keep the sprite just in front of the near plane, and
        // never taller than ~65% of the view so it still reads as a creature
        let dx = st.mesh.position.x - cameraX;
        let dz = st.mesh.position.z - cameraY;
        let d = Math.hypot(dx, dz);
        const MIN_D = 0.42;
        if (d < MIN_D) {
          if (d < 1e-3) {
            dx = Math.cos(cameraAngle);
            dz = Math.sin(cameraAngle);
            d = 1;
          }
          st.mesh.position.x = cameraX + (dx / d) * MIN_D;
          st.mesh.position.z = cameraY + (dz / d) * MIN_D;
          d = MIN_D;
        }
        // point-blank: keep the sprite just in front of the near plane.
        // During windup/recover inside melee range the attacker LOOMS
        // (Doom pinky): it may fill up to LOOM_CAP_FRAC of the view — past
        // the usual 65% cap — so ~47% of view height reads over the tool.
        const mode = st.entity.state.mode;
        const enemy = st.entity.def.kind === 'enemy';
        const threatKind = st.entity.def.threat ?? st.entity.def.sprite;
        const attacking = mode === 'windup' || mode === 'recover';
        const melee = !!enemy && !!threatKind && !ENEMY_PROFILES[threatKind]?.ranged;
        // ENEMIES graded loom: melee threats swell and lift as they close — a
        // chase gets CHASE_BOOST of the full loom so the windup strike ramps
        // in over ~1.5-2.4 tiles instead of popping at the old 1.35 boundary.
        const loom = enemy ? loomK(d, attacking, melee) : 0;
        // Cap floor: once the sprite is pinned at MIN_D the real span shrinks
        // to nothing, which used to squash the sprite exactly when the player
        // collided with it. Measure the height cap at CAP_FLOOR so contact
        // range keeps a Doom-scale silhouette instead of shrinking.
        const CAP_FLOOR = 0.75;
        const capSpan = 2 * Math.max(d, CAP_FLOOR) * Math.tan((this.camera.fov * Math.PI) / 360);
        const maxH = (0.65 + (LOOM_CAP_FRAC - 0.65) * loom) * capSpan;
        const swell = melee && !attacking ? 0.5 * loomT(d) : 0;
        // ENEMIES F5: distance-compensating scale — past ~6 tiles a threat's
        // sprite grows so it never collapses into a speck (visual only).
        // A still-disguised trojan is exempt: it must stay the size of the
        // real USB pickups it imitates or the disguise gives itself away.
        const disguisedFar = threatKind === 'trojan' && !st.entity.state.revealedTrojan;
        const far = enemy && !disguisedFar && !attacking ? farScale(d) : 1;
        const want = Math.max(
          st.scale * far * (1 + swell),
          attacking ? Math.min(loomTargetH(d, this.camera.fov) / st.set.h, LOOM_MAX_SCALE) : 0,
        );
        let sc = Math.min(want, Math.max(st.scale, maxH / st.set.h));
        // ceiling clamp: an enemy's opaque art never pokes through the ceiling
        // of its tile (sky tiles exempt); floor at CEIL_MIN_SCALE_FRAC of its own scale
        const ceilY = enemy ? this.enemyCeilY(st) : null;
        // topFrac is measured on the walk pose; attack/recover poses can stand taller, so they use the full canvas
        const topFrac = ceilY !== null && !attacking ? this.spriteTopFrac(st.set) : 1;
        if (ceilY !== null) {
          const cap = ceilingScaleCap(st.mesh.position.y, ceilY, st.set.h, topFrac);
          sc = Math.min(sc, Math.max(cap, st.scale * CEIL_MIN_SCALE_FRAC));
        }
        st.mesh.scale.set(st.set.w * sc, st.set.h * sc, 1);
        // a floor-height attacker at contact range projects entirely behind
        // the tool viewmodel; lift its anchor so ~60% of the silhouette clears
        // the viewmodel top line, faded in with the same loom ramp
        const baseY = st.mesh.position.y;
        const lunge = loom > 0
          ? Math.max(0, riseBase(st.set.h * sc, d, EYE_H, this.camera.fov) - baseY) * Math.min(1, loom * 4)
          : 0;
        st.rise = (st.rise ?? 0) + (lunge - (st.rise ?? 0)) * Math.min(1, dt * 14);
        if (ceilY !== null) {
          st.rise = Math.min(st.rise, ceilingRiseCap(baseY, ceilY, st.set.h * sc * topFrac));
        }
        st.mesh.position.y = baseY + st.rise;
      }
      // monsters get an unmistakable ~150 ms white-hot full-sprite flash
      // (flash decays 3/s from 1.0): ~80 ms near-white then a fast fade,
      // before the pain-frame swap / dissolve, like Doom's bright hit
      // frames; other sprites keep the shorter flicker
      const painFlash = st.set.anim === 'monster'
        ? st.flash > 0.62
          ? 1
          : Math.max(0, st.flash * 1.9 - 0.5)
        : st.flash > 0.75
          ? 0.6
          : 0;
      st.mat.uniforms.uFlash.value = this.debugNoFlash ? 0 : painFlash;
    }
    for (const fx of [...this.fx]) {
      fx.t += dt;
      const i = Math.min(fx.frames.length - 1, Math.floor((fx.t / fx.dur) * fx.frames.length));
      fx.mesh.rotation.set(0, yaw, 0);
      fx.mat.uniforms.map.value = fx.set.frames[fx.frames[i]];
      // gib debris arcs out under gravity and holds as floor litter (ENEMIES)
      if (!fx.landed && (fx.vx || fx.vy || fx.vz)) {
        const nx = fx.mesh.position.x + (fx.vx ?? 0) * dt;
        const nz = fx.mesh.position.z + (fx.vz ?? 0) * dt;
        if (this.map?.blocked(Math.floor(nx), Math.floor(nz))) {
          fx.vx = 0;
          fx.vz = 0;
        } else {
          fx.mesh.position.x = nx;
          fx.mesh.position.z = nz;
        }
        fx.vy = (fx.vy ?? 0) - 6.5 * dt;
        fx.mesh.position.y = Math.max(0.03, fx.mesh.position.y + (fx.vy ?? 0) * dt);
        if (fx.mesh.position.y <= 0.031 && (fx.vy ?? 0) < 0) fx.landed = true;
      }
      if (fx.t >= fx.dur) {
        this.spriteGroup.remove(fx.mesh);
        fx.mat.dispose();
        this.fx.splice(this.fx.indexOf(fx), 1);
      }
    }
    this.updatePointLights();
    for (const d of [...this.openingDoors]) {
      d.t += dt;
      d.mesh.position.y = Math.min(1, d.t / 0.55) * WALL_H * 0.97;
      if (d.t > 0.6) {
        this.levelGroup.remove(d.mesh);
        this.openingDoors.splice(this.openingDoors.indexOf(d), 1);
      }
    }

    this.renderer.setRenderTarget(this.rt);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW3D_H);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW_H);
    this.renderer.clear();
    this.renderer.setViewport(0, STATUS_H, VIEW_W, VIEW3D_H);
    this.renderer.autoClear = false;
    this.renderer.render(this.postScene, this.postCam);
    this.renderer.autoClear = true;
    if (this.captureCb) {
      const gl = this.renderer.getContext();
      const raw = new Uint8Array(VIEW_W * VIEW3D_H * 4);
      gl.readPixels(0, STATUS_H, VIEW_W, VIEW3D_H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const out = new Uint8Array(raw.length);
      const row = VIEW_W * 4;
      for (let y = 0; y < VIEW3D_H; y++) out.set(raw.subarray((VIEW3D_H - 1 - y) * row, (VIEW3D_H - y) * row), y * row);
      const cb = this.captureCb;
      this.captureCb = null;
      cb({ w: VIEW_W, h: VIEW3D_H, data: out });
    }
    if (!this.prewarmStarted) {
      this.prewarmStarted = true;
      // usually already kicked at boot; this stays as a fallback for renderers
      // constructed late (tests, probes)
      prewarmLazySpriteFrames((ms) => {
        this.gen.lazyPrewarmMs = ms;
        console.info(`[render] lazy sprite prewarm ${ms.toFixed(1)} ms`);
      });
    }
  }

  /** DEBUG (look probe): resolve with the next rendered 3D view, post-palette. */
  captureView(): Promise<{ w: number; h: number; data: Uint8Array }> {
    return new Promise((res) => (this.captureCb = res));
  }
}
