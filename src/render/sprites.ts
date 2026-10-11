import * as THREE from 'three';
import { Registry } from '../core/registry';
import { drawText } from './font';
import { registerGenJob, reorderLazyQueue, type GenResult } from './gen';
import { deferGenJob, genPoolActive, installGenNow, prewarmGenJobs, prioritizeGenJobs, whenGenJobs } from './genpool';
import { createRasterJob, limb, rasterizeRows, type Prim, type RasterJob, type V3 } from './model';
import { packPixels, packTexture, paintRaw, pxEllipse, textureFromPixels, type PaintCtx } from './pixel';
import { RES, TEX } from './res';

export { reorderLazyQueue } from './gen';

/**
 * Procedural billboard sprite sets. Every entity sprite id maps to a SpriteSet
 * with named frames (walk/attack/rotations) and a world-space size. Frames are
 * outlined + auto-shaded pixel art; glow layers render fullbright.
 */

export interface SpriteSet {
  /** World size in tiles (height; width follows the canvas aspect). */
  w: number;
  h: number;
  frames: Record<string, THREE.Texture>;
  /** How the renderer animates it. */
  anim: 'monster' | 'person' | 'flicker' | 'static';
  /** Enemy lighting overrides: brightness floor and gain (contrast tuning). */
  floor?: number;
  gain?: number;
  /** Walk frames per rotation for monsters (default 4; 8 for the stiffest types). */
  walkN?: number;
  /** Data-gib debris tint thrown on death (threat colour). */
  gib?: [number, number, number];
}

export const spriteRegistry = new Registry<THREE.Texture>();
export const spriteSets = new Registry<SpriteSet>();

type Draw = (p: PaintCtx) => void;

interface FrameSpec {
  key: string;
  draw: Draw;
  mirror?: boolean;
}

/** When true, builders register gen jobs only (worker startup path). */
let jobsOnly = false;
let spriteJobsDone = false;

/**
 * Frame backed by a queued worker job: the getter materializes synchronously
 * on demand; the pool installs the texture when the worker result arrives.
 */
function defineDeferred(frames: Record<string, THREE.Texture>, key: string, jobKey: string): void {
  deferGenJob(jobKey, (res) => {
    Object.defineProperty(frames, key, { configurable: true, enumerable: true, value: textureFromPixels(res) });
  });
  Object.defineProperty(frames, key, {
    configurable: true,
    enumerable: true,
    get: () => {
      installGenNow(jobKey);
      return frames[key];
    },
  });
}

function makeSet(id: string, cw: number, ch: number, worldH: number, anim: SpriteSet['anim'], frames: FrameSpec[], dissolve = false): void {
  for (const f of frames) {
    registerGenJob(`sprite:${id}:${f.key}`, { setId: id, first: f === frames[0] }, () =>
      packPixels(cw * RES, ch * RES, paintRaw(cw, ch, `${id}:${f.key}`, f.draw, RES, false, true), { sprite: true, shade: true, mirror: f.mirror }));
  }
  if (dissolve) {
    const f0 = frames[0];
    for (let k = 0; k < 4; k++) {
      registerGenJob(`sprite:${id}:die${k}`, { setId: id, first: false }, () => {
        const raw = paintRaw(cw, ch, `${id}:${f0.key}`, f0.draw, RES, false, true);
        return dissolvePixels(cw * RES, ch * RES, raw, k, id);
      });
    }
  }
  if (jobsOnly) return;
  const out: Record<string, THREE.Texture> = {};
  if (genPoolActive()) {
    for (const f of frames) defineDeferred(out, f.key, `sprite:${id}:${f.key}`);
    if (dissolve) for (let k = 0; k < 4; k++) defineDeferred(out, `die${k}`, `sprite:${id}:die${k}`);
  } else {
    let firstRaw: ReturnType<typeof paintRaw> | null = null;
    for (const f of frames) {
      const raw = paintRaw(cw, ch, `${id}:${f.key}`, f.draw, RES, false, true);
      if (!firstRaw) firstRaw = raw;
      out[f.key] = packTexture(cw * RES, ch * RES, raw, { sprite: true, shade: true, mirror: f.mirror });
    }
    if (dissolve && firstRaw) {
      for (let k = 0; k < 4; k++) out[`die${k}`] = dissolveFrame(cw * RES, ch * RES, firstRaw, k, id);
    }
  }
  const set: SpriteSet = { w: (worldH * cw) / ch, h: worldH, frames: out, anim };
  spriteSets.register(id, set);
  if (genPoolActive()) {
    whenGenJobs([`sprite:${id}:${frames[0].key}`], () => spriteRegistry.register(id, out[frames[0].key]));
  } else {
    spriteRegistry.register(id, out[frames[0].key]);
  }
}

/** "Quarantine" death: the sprite breaks into green fullbright pixels and scatters. */
function dissolveFrame(w: number, h: number, raw: ReturnType<typeof paintRaw>, k: number, seed: string): THREE.Texture {
  return textureFromPixels(dissolvePixels(w, h, raw, k, seed));
}

function dissolvePixels(w: number, h: number, raw: ReturnType<typeof paintRaw>, k: number, seed: string): GenResult {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8ClampedArray(w * h * 4);
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
  const rnd = () => ((s = (s * 1103515245 + 12345) | 0) >>> 8) / 16777216;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (raw.rgba[i + 3] < 128) continue;
      if (rnd() < 0.18 + k * 0.24) continue;
      // fall/scatter downward
      const ny = Math.min(h - 1, y + Math.floor(k * k * 2 * RES * rnd()));
      const nx = Math.max(0, Math.min(w - 1, x + Math.round((rnd() - 0.5) * k * 4 * RES)));
      const o = (ny * w + nx) * 4;
      const t = Math.min(1, 0.35 + k * 0.25);
      rgba[o] = raw.rgba[i] * (1 - t) + 44 * t;
      rgba[o + 1] = raw.rgba[i + 1] * (1 - t) + 255 * t;
      rgba[o + 2] = raw.rgba[i + 2] * (1 - t) + 90 * t;
      rgba[o + 3] = 255;
      if (k >= 1) glow[o + 3] = 255;
    }
  }
  return packPixels(w, h, { rgba, glow }, { sprite: true, outline: null });
}

function lit(p: PaintCtx, color: string, x: number, y: number, w: number, h: number): void {
  p.g.fillStyle = color;
  p.g.fillRect(x, y, w, h);
  p.glow.fillStyle = '#fff';
  p.glow.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- malware

// ---------------------------------------------------------------- malware (3D-modelled)

type Pose =
  | { kind: 'walk'; k: number; n?: number }
  | { kind: 'attack'; k: 0 | 1 }
  | { kind: 'pain'; k?: 0 | 1 }
  | { kind: 'dead' };
type Model = (pose: Pose) => Prim[];

const ell = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'ell', c, r, col, ...extra });
const box = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'box', c, r, col, ...extra });
const walkPhase = (p: Pose) => (p.kind === 'walk' ? (p.k * Math.PI * 2) / (p.n ?? 4) : 0);

const pk = (p: Pose) => (p.kind === 'pain' ? (p.k ?? 0) : 0);

/** Deterministic 0..1 hash for pose variation and death scatter. */
const hash01 = (s: string): number => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

/** Worm: a rearing, segmented red centipede; tail trails behind on the floor. */
const wormModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const atk = pose.kind === 'attack' ? pose.k : -1;
  // dead: the coil collapsed flat — segments strewn low in a row, head on
  // its side with the jaw flopped open. Keeps a worm silhouette on the floor.
  if (pose.kind === 'dead') {
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const x = (t - 0.5) * 30 + Math.sin(i * 1.9) * 3.5;
      const r = 8.5 - t * 3;
      out.push(ell([x, r * 0.72, (i % 2) * 3 - 1.5], [r, r * 0.62, r], i % 2 ? '#e24a30' : '#c03420', { roll: 0.55 }));
    }
    out.push(ell([19.5, 5.5, 0], [10.5, 5.5, 10.5], '#d83818', { roll: 0.55 }));
    out.push(ell([22, 3.4, 5.5], [5.5, 2.8, 5.5], '#320606', { roll: 0.5 }));
    for (const sx of [-1, 1]) {
      out.push(ell([21 + sx * 3.2, 8.5, 1], [1.8, 1.2, 1.8], '#401408'));
      out.push(ell([24.5, 3.8, sx * 4.5], [1.4, 2.8, 1.4], '#d8cfc0', { roll: 0.7 }));
    }
    return out;
  }
  const pain = pose.kind === 'pain';
  const pk01 = pk(pose);
  // authored recoil: the whole coil buckles sideways and the head whips
  // back/down — a distinct silhouette change at 10+ tiles, not a squash
  const lean = atk === 0 ? -7 : atk === 1 ? 8 : pain ? (pk01 === 1 ? 16 : -20) : 0;
  const lift = atk === 0 ? 3 : pain ? (pk01 === 1 ? -8 : -13) : Math.sin(ph * 2) * 1;
  const bow = pain ? (pk01 === 1 ? -10 : 12) : 0;
  const segs = 8;
  let last: V3 = [0, 0, 0];
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const x = Math.sin(i * 0.9 + ph) * 4.5 * (1 - t * 0.6) + bow * t * t;
    const y = 5 + Math.pow(t, 1.25) * (39 + lift);
    const z = -20 * Math.pow(1 - t, 1.6) + lean * t * t;
    const r = 8.5 - t * 3;
    out.push(ell([x, y, z], [r, r * 0.8, r], i % 2 ? '#eb482d' : '#cc331d', {
      decal: (l) => (l[2] > r * 0.4 && Math.abs(l[0]) < r * 0.55 ? (Math.abs(l[1]) < r * 0.22 ? '#ffb080' : '#ff8a50') : null),
    }));
    out.push(ell([x, y + r * 0.72, z - r * 0.3], [1.3, 2.8, 1.3], '#2a0604', { pitch: -0.4 }));
    out.push(ell([x, y + r * 0.16, z + r * 0.62], [r * 0.68, 0.55, 0.42], '#ff7950'));
    const sw = Math.sin(ph + i * 1.3) * 2.5;
    for (const sx of [-1, 1]) limb(out, [x + sx * r * 0.8, y - r * 0.3, z], [x + sx * (r + 4), y - r * 0.9 - 2, z + sx * sw], 1.3, '#3a0604');
    last = [x, y, z];
  }
  const [hx, hy0, hz0] = last;
  const hy = hy0 + 9;
  const hz = hz0 + 3 - (pose.kind === 'pain' ? 5 : 0);
  out.push(ell([hx, hy, hz], [10.5, 8.5, 10], '#e0381c'));
  out.push(ell([hx, hy - 5, hz + 2], [8, 3.6, 7.5], '#901a0a'));
  for (let tooth = -2; tooth <= 2; tooth++) {
    out.push(ell([hx + tooth * 2.2, hy - 8, hz + 8.2], [0.75, 1.35, 0.7], '#f3dcae'));
  }
  for (const sx of [-1, 1]) {
    out.push(ell([hx + sx * 4.6, hy + 1.6, hz + 8.4], [2.7, 2.3, 1.6], '#ffe040', { glow: true }));
    out.push(ell([hx + sx * 4.2, hy + 2.2, hz + 9.6], [0.9, 0.9, 0.6], '#ffffff', { glow: true }));
    out.push(ell([hx + sx * 4.6, hy + 4.4, hz + 7.4], [3.6, 1.3, 2], '#4a0806', { roll: sx * 0.35 }));
    const open = atk === 1 ? 10 : atk === 0 ? 7 : pose.kind === 'pain' ? 9 : 5;
    limb(out, [hx + sx * 6, hy - 4, hz + 6], [hx + sx * open, hy - 11, hz + 10], 1.7, '#ecd8a8');
    limb(out, [hx + sx * 3, hy + 7, hz - 1], [hx + sx * 7, hy + 15, hz - 5], 0.9, '#2a0604');
    out.push(ell([hx + sx * 7, hy + 15.5, hz - 5], [1.6, 1.6, 1.6], '#ff6030', { glow: true }));
  }
  if (atk >= 0 || pose.kind === 'pain') out.push(ell([hx, hy - 4, hz + 8.6], [4.2, 3, 1.4], atk === 1 ? '#ffd040' : '#ff4020', { glow: true }));
  return out;
};

/** Trojan: a "free gift" box stalking on six spider legs; the lid hides fangs. */
const trojanModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const bob = pose.kind === 'walk' ? Math.abs(Math.sin(ph)) * 2 : 0;
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const ribbon = (l: V3) => (Math.abs(l[0]) < 2.6 || Math.abs(l[2]) < 2.6 ? (Math.abs(l[0]) < 0.9 || Math.abs(l[2]) < 0.9 ? '#fff0a0' : '#e8c020') : null);
  // dead: the gift box toppled onto its side, lid sprung clear beside it,
  // spider legs curled stiff in the air — a fallen box, not a blob
  if (pose.kind === 'dead') {
    out.push(box([0, 9, 0], [12.5, 9.5, 10.5], '#c070ff', { roll: 1.5, decal: ribbon }));
    out.push(box([2, 13.5, 4], [9, 3.5, 7], '#100418', { roll: 1.5 }));
    out.push(box([18, 3, 6], [13.5, 2.5, 11.5], '#d890ff', { roll: 0.3, yaw: 0.5, decal: ribbon }));
    for (const sx of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const z = -5 + k * 5 + sx * 0.4;
        limb(out, [sx * 10, 13, z], [sx * 17, 17 + k * 2, z + sx * 2], 1.9, '#5a2a80');
        limb(out, [sx * 17, 17 + k * 2, z + sx * 2], [sx * 20, 13, z + sx * 4], 1.55, '#4a2070');
        out.push(ell([sx * 20, 13, z + sx * 4], [2, 1.6, 2], '#c884ff'));
      }
    }
    return out;
  }
  // authored recoil: the lid flips WIDE open and the box rocks back on its
  // legs — reads as a yelp even at 10 tiles
  const lid = atk === 0 ? 7 : atk === 1 ? 13 : pose.kind === 'pain' ? (pk(pose) === 1 ? 16 : 12) : 2.5;
  const by = 36 + bob;
  for (let k = 0; k < 3; k++) {
    const z = (k - 1) * 7;
    for (const sx of [-1, 1]) {
      const swing = Math.sin(ph + k * 2.1 + (sx > 0 ? Math.PI : 0)) * 4;
      const up = Math.max(0, swing) * 0.8 + (pose.kind === 'pain' ? 8 - k * 2 : 0);
      const hip: V3 = [sx * 11, by - 4, z];
      const knee: V3 = [sx * 18, by + 7, z * 1.3 + swing * 0.5];
      const foot: V3 = [sx * 15, 1.5 + up, z * 1.7 + swing];
      limb(out, hip, knee, 1.9, '#6a508a');
      limb(out, knee, foot, 1.6, '#7a609a');
      out.push(ell(knee, [2.6, 2.6, 2.6], '#7a5aa0'));
      out.push(ell(foot, [2.2, 1.4, 2.4], '#2a2036'));
    }
  }
  out.push(box([0, by, 0], [12.5, 9.5, 10.5], '#c070ff', {
    decal: ribbon,
    roll: pose.kind === 'pain' ? (pk(pose) === 1 ? -0.32 : 0.24) : 0,
    pitch: pose.kind === 'pain' && pk(pose) === 1 ? -0.18 : 0,
  }));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(ell([sx * 9.2, by + sy * 6.5, 9.55], [0.75, 0.75, 0.35], '#ffe9a0'));
  }
  out.push(box([0, by - 9.5, 0], [12.6, 0.8, 10.6], '#8a40b8'));
  const gapY = by + 9.5 + lid / 2;
  if (lid > 3) {
    out.push(box([0, gapY, 0], [11.5, lid / 2, 9.5], '#12041a'));
    for (const sx of [-1, 1]) out.push(ell([sx * 5, gapY + 0.5, 9.6], [2.6, Math.min(2.2, lid / 2 - 0.5), 1], '#ff60ff', { glow: true }));
    if (atk >= 0) {
      for (let x = -10; x <= 10; x += 4) {
        out.push(box([x, by + 10.5, 9.9], [1.2, 1.4, 0.5], '#f4f0e0'));
        out.push(box([x + 2, by + 9.5 + lid - 1, 10.6], [1.2, 1.4, 0.5], '#f4f0e0'));
      }
      out.push(box([0, gapY - 1, 8], [8, 1, 1], '#ff40c0', { glow: true }));
    }
  }
  const ly = by + 9.5 + lid + 2.5;
  out.push(box([0, ly, 0], [14, 2.5, 12], '#d890ff', { decal: ribbon, pitch: atk === 1 ? -0.25 : pose.kind === 'pain' ? (pk(pose) === 1 ? -0.55 : -0.35) : 0 }));
  for (const sx of [-1, 1]) out.push(ell([sx * 4.8, ly + 5, 0], [5, 3.4, 2.4], '#f0d030', { roll: sx * 0.5 }));
  out.push(ell([0, ly + 3.6, 0], [2.4, 2.2, 2.4], '#c89a10'));
  out.push(box([9, by - 1, 11.2], [3.6, 2.6, 0.5], '#f4ecd8', { decal: (l) => (Math.abs(l[1]) < 0.8 && Math.abs(l[0]) < 2.6 ? '#c01818' : null), roll: 0.2 }));
  return out;
};

/** Ransomware: a padlock-GOLEM — a riveted, steel-banded lock body for a
 *  torso carried on pillar legs, a thick shackle arching over its shoulders
 *  like horns, a glowing keyhole maw in its chest, and chained manacle
 *  fists. It raises both fists to slam out its encryption volley; in pain
 *  the shackle springs open off the body. Never a sign on a pole. */
const ransomModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const pain = pose.kind === 'pain';
  const pk01 = pk(pose);
  const bob = pose.kind === 'walk' ? Math.abs(Math.sin(ph)) * 1.5 : 0;
  const bands = (l: V3) => (Math.abs((l[0] + 17) % 8.5) < 1.4 ? '#8a4a08' : null);

  // dead: broken padlock — body tipped back onto its shoulders, shackle
  // sprung open and thrown wide, manacle fists sprawled. Still reads lock.
  if (pose.kind === 'dead') {
    out.push(box([0, 8.5, -1], [17, 8.5, 11], '#c86410', { pitch: -0.9, decal: bands }));
    out.push(ell([0, 14, 3], [4.4, 2.2, 3.8], '#140802'));
    out.push(box([0, 10.5, 3.5], [2.4, 4.5, 1.6], '#140802'));
    limb(out, [11, 14, -6], [11, 20, -6], 3.6, '#9aa2b0');
    limb(out, [-11, 14, -6], [-16, 22, -4], 3.6, '#b8c0cc');
    limb(out, [-16, 22, -4], [-23, 21, 0], 3.2, '#9aa2b0');
    for (const sx of [-1, 1]) {
      limb(out, [sx * 12, 9, 0], [sx * 21, 5, 2], 3.4, '#8a5218');
      out.push(ell([sx * 23.5, 4.5, 2.5], [5, 5, 5], '#4a3010'));
      for (let k = 0; k < 3; k++) out.push(ell([sx * (23 + k), 2.4, 2.5], [1.5, 1.9, 1.1], '#b8c0cc'));
    }
    return out;
  }

  // stocky pillar legs + slab feet — the golem carries its mass low
  for (const sx of [-1, 1]) {
    const sw = pose.kind === 'walk' ? Math.sin(ph) * 4 * sx : 0;
    out.push(box([sx * 6.5, 8 + Math.max(0, -sw) * 0.4, sw], [5.5, 8, 6], '#5a3410'));
    out.push(box([sx * 6.5, 1.8, sw + 2], [7, 1.8, 8], '#3a2008'));
  }
  const body = 34 + bob;
  // THE LOCK BODY: a riveted steel-banded slab of a torso
  out.push(box([0, body, 0], [17, 15, 11], '#c86410', {
    roll: pain ? (pk01 === 1 ? -0.15 : 0.15) : 0,
    pitch: pain ? (pk01 === 1 ? -0.14 : 0.1) : 0,
    decal: bands,
  }));
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++)
    out.push(ell([sx * 16.2, body + 6 - k * 6, 10.4], [1.3, 1.3, 0.9], '#ffd070', { glow: true }));
  // keyhole maw: a glowing keyhole cut into the chest — flares on the slam
  const mouth = atk >= 0 ? '#ff3010' : pain ? '#ffb030' : '#ff7030';
  out.push(ell([0, body + 1.5, 10.4], [4.8, 4.8, 1.4], '#140802'));
  out.push(box([0, body - 4, 10.4], [2.8, 6, 1.4], '#140802'));
  out.push(ell([0, body + 1.5, 11.2], [2.7, 2.7, 0.9], mouth, { glow: true }));
  out.push(box([0, body - 3.4, 11.2], [1.5, 4, 0.9], mouth, { glow: true }));
  // brow plate + hot eye slits — a face, not a sign
  for (const sx of [-1, 1]) {
    out.push(ell([sx * 7, body + 8.5, 10.2], [3.4, 2.4, 1.2], pain ? '#ffffff' : '#ff2010', { glow: true }));
    out.push(box([sx * 7, body + 11.5, 10.8], [5.5, 1.5, 1.4], '#2a1002', { roll: sx * (pain ? -0.45 : 0.35) }));
  }
  // SHACKLE: a thick steel U arching over the shoulders — the padlock's
  // horns. In pain it SPRINGS OPEN (the left jaw pops free of the body).
  const pop = pain && pk01 === 1 ? 9 : atk === 1 ? 5 : 0;
  for (const sx of [-1, 1]) {
    const lift = sx < 0 ? pop : 0;
    limb(out, [sx * 11, body + 13, -1], [sx * 11, body + 20 + lift, -1], 4, sx < 0 && pop ? '#d8e0ec' : '#9aa2b0');
  }
  const arc = 10;
  for (let a = 0; a <= arc; a++) {
    const t = a / arc;
    const x = Math.cos(t * Math.PI) * 11;
    const liftY = x < -2 ? pop : x < 2 ? pop * 0.5 : 0;
    out.push(ell([x, body + 20 + Math.sin(t * Math.PI) * 8 + liftY, -1], [3.9, 3.9, 3.9], liftY > 0 ? '#cfd8e6' : '#9aa2b0'));
  }
  // chained manacle fists: thick arms ending in iron cuffs + links
  for (const sx of [-1, 1]) {
    const hand: V3 = atk === 0
      ? [sx * 13, body + 25, 7]
      : atk === 1
        ? [sx * 12, body + 9, 13]
        : pain
          ? pk01 === 1 ? [sx * 25, body + 26, -4] : [sx * 24, body + 20, 6]
          : [sx * 19.5, body - 6 + Math.sin(ph + (sx > 0 ? Math.PI : 0)) * 2.5, 3];
    limb(out, [sx * 17, body + 9, 0], hand, 4.4, '#8a5218');
    out.push(ell([hand[0], hand[1] + 1.5, hand[2]], [5.8, 3.4, 5.6], '#3a3a44'));
    out.push(ell(hand, [5, 5, 5], '#4a3010'));
    for (let k = 1; k <= 3; k++)
      out.push(ell([hand[0] + sx * 0.8, hand[1] - 3.2 - k * 3, hand[2]], [1.7, 2.1, 1.2], k % 2 ? '#b8c0cc' : '#8a929e', { roll: k % 2 ? 0.6 : 0 }));
  }
  return out;
};

/** Rootkit: a low, wide burrowing crawler that hugs the floor — sprawled
 *  hooked legs, a flat armored shell, and root tendrils trailing behind.
 *  Flat-and-sprawled against ransomware's upright padlock bulk. */
const rootkitModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const pain = pose.kind === 'pain';
  const bob = pose.kind === 'walk' ? Math.sin(ph * 2) * 0.8 : 0;
  const body = 13 + bob; // hugs the ground
  // dead: flipped turtle — shell belly-up, legs curled stiff over it,
  // sensor mast flopped dead on the floor
  if (pose.kind === 'dead') {
    out.push(ell([0, 6.5, 0], [14.5, 5.5, 11], '#4d3790', { pitch: 2.8 }));
    out.push(ell([0, 8, -1], [11.5, 4.5, 8.5], '#241a4a', { pitch: 2.8 }));
    for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
      const z = -6 + k * 5;
      limb(out, [sx * 8, 9, z], [sx * 15, 13 + (k % 2) * 2, z + sx], 1.3, '#5a4898');
      limb(out, [sx * 15, 13 + (k % 2) * 2, z + sx], [sx * 17, 9, z + sx * 2], 1.05, '#4a3a80');
      out.push(ell([sx * 17, 9, z + sx * 2], [1.8, 1.4, 1.8], '#2a1d55'));
    }
    limb(out, [0, 7, -3], [4, 2, -14], 1.1, '#3a3f48');
    limb(out, [4, 2, -14], [6, 1.5, -20], 0.9, '#30343c');
    out.push(ell([6.5, 2.2, -21], [2.4, 2.4, 2.4], '#14161c'));
    return out;
  }
  // authored recoil: the whole shell pitches sideways and the hooked legs
  // kick up off the floor — a flinch that reads at range
  const painRoll = pain ? (pk(pose) === 1 ? -0.36 : 0.4) : 0;
  for (let k = 0; k < 3; k++) {
    const z = (k - 1) * 8;
    for (const sx of [-1, 1]) {
      const swing = Math.sin(ph + k * 2.1 + (sx > 0 ? Math.PI : 0)) * 3;
      const hip: V3 = [sx * 8, body + 3, z];
      const knee: V3 = [sx * 19, body + 8, z * 1.15 + swing * 0.6];
      const foot: V3 = [sx * 24, 1 + (pain ? 9 - k * 2 : 0), z * 1.5 + swing];
      limb(out, hip, knee, 1.3, '#3d2a78');
      limb(out, knee, foot, 1.1, '#4d3790');
      out.push(ell(knee, [1.8, 1.8, 1.8], '#5a45a8'));
      out.push(ell(foot, [2.4, 1, 2.2], '#2a1d55'));
    }
  }
  // flat armored shell with dorsal plates
  out.push(ell([0, body + 4, 0], [14, 6.5, 11], '#6a54b8', {
    roll: painRoll,
    decal: (l) => (Math.abs(((l[0] + 14) % 6)) < 0.9 ? '#4d3790' : null),
  }));
  out.push(ell([0, body + 7.5, -2], [9, 3.4, 7], '#453383'));
  // head low at the front: beady eye cluster + hooked mandibles
  const hy = body + 1;
  const open = atk === 1 ? 7 : atk === 0 ? 4 : pain ? (pk(pose) === 1 ? 6 : 2) : 2;
  out.push(ell([0, hy, 11], [7.5, 4.5, 4.5], '#5a45a8'));
  for (const sx of [-1, 1]) {
    out.push(ell([sx * 3.4, hy + 1.4, 14.6], [1.7, 1.5, 1], pain ? '#ffffff' : '#8a5cff', { glow: true }));
    out.push(ell([sx * 1.1, hy + 2.6, 14.8], [1.1, 1, 0.8], '#54e8ff', { glow: true }));
    limb(out, [sx * 4, hy - 2, 12.5], [sx * (4 + open), hy - 5, 16.5], 1.1, '#2a1d55');
  }
  // root tendrils trailing behind: thin hooked tails that burrow
  for (const sx of [-1, 0, 1]) {
    const wag = Math.sin(ph + sx * 2) * 2;
    limb(out, [sx * 5, body + 2, -9], [sx * 7 + wag, 2, -16 - Math.abs(sx) * 2], 1.4, '#33245f');
    out.push(ell([sx * 7 + wag, 1.4, -16.5 - Math.abs(sx) * 2], [1.6, 1.6, 2.4], '#6a55c8'));
  }
  // sensor mast: a thin periscope rising off the shell with a blinking
  // violet tip — lifts the crawler's silhouette out of the floor line so it
  // still reads as a creature at 10+ tiles
  const sway = Math.sin(ph * 1.7) * 3 + (pain ? (pk(pose) === 1 ? -9 : 9) : 0);
  limb(out, [0, body + 9, -3], [sway * 0.5, body + 26, -7], 1.2, '#3d2a78');
  limb(out, [sway * 0.5, body + 26, -7], [sway, body + 40, -9], 0.9, '#4d3790');
  const mastLed = pose.kind !== 'walk' || pose.k % 2 === 0;
  if (mastLed || atk >= 0) out.push(ell([sway, body + 41, -9], [1.8, 1.8, 1.8], atk === 1 ? '#b060ff' : '#8a5cff', { glow: true }));
  if (atk >= 0) out.push(ell([0, hy + 1, 15.5], [3.4, 2, 1.2], atk === 1 ? '#b060ff' : '#54e8ff', { glow: true }));
  return out;
};

/** Logicbomb: a squat armed charge hugging the floor. The dark casing is
 *  ringed with hazard tape and a whip antenna carries a blinking timer LED —
 *  high contrast + a moving light so it reads at 4+ tiles instead of
 *  dissolving into the floor. Counting down (attack pose) it glows hot. */
const logicbombModel: Model = (pose) => {
  const out: Prim[] = [];
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const pain = pose.kind === 'pain';
  // dead: the charge split open — casing halves parted round a charred
  // core, antenna snapped flat on the floor, LED dead
  if (pose.kind === 'dead') {
    out.push(ell([-5, 6, 0], [9, 6.5, 8], '#8a2414', { roll: 0.6 }));
    out.push(ell([7, 5, 2], [7.5, 5.5, 7], '#66180c', { roll: -0.5 }));
    out.push(ell([1, 5.5, 1], [4, 4, 4], '#140402'));
    out.push(box([-4, 11.5, 1], [4.5, 2.2, 2.4], '#18140e', { roll: 0.5 }));
    limb(out, [7, 8, 0], [14, 2, 2], 0.75, '#3a3a44');
    limb(out, [14, 2, 2], [18, 1.4, 3], 0.75, '#3a3a44');
    out.push(ell([18.5, 1.6, 3.2], [1.5, 1.5, 1.5], '#241f1a'));
    return out;
  }
  const led = pose.kind !== 'walk' || pose.k % 2 === 0; // status LED blinks on walk phases
  const painRoll = pain ? (pk(pose) === 1 ? -0.42 : 0.38) : 0;
  // hazard-tape ring around the base
  out.push(box([0, 3.2, 0], [15.5, 3.2, 13.5], '#14161c', {
    decal: (l) => (Math.abs(((l[0] + l[2] + 16) % 8)) < 2.2 ? '#e8c020' : null),
  }));
  // main charge casing
  out.push(ell([0, 10.5, 0], [12, 8, 10.5], '#8a2414', {
    roll: painRoll,
    decal: (l) => (Math.abs(((l[0] + 12) % 6)) < 0.9 ? '#5a1408' : null),
  }));
  out.push(ell([0, 14, 0], [8.5, 4.5, 7], '#66180c', { roll: painRoll }));
  // timer readout on the front face: two blinking digits
  out.push(box([0, 10, 10.6], [5, 3.2, 0.8], '#160804'));
  if (led) {
    out.push(box([-1.5, 10, 11.2], [1.7, 1.7, 0.4], '#ff3020', { glow: true }));
    out.push(box([1.5, 10, 11.2], [1.7, 1.7, 0.4], atk >= 0 ? '#ffb040' : '#ff6040', { glow: true }));
  }
  // whip antenna with blinking tip
  const mastH = atk >= 0 ? 17 : 13;
  limb(out, [6, 15, -4], [8, 15 + mastH, -6], 0.8, '#2a2e38');
  if (led || atk >= 0) out.push(ell([8, 15.5 + mastH, -6], [1.7, 1.7, 1.7], atk === 1 ? '#ffe040' : '#ff3020', { glow: true }));
  // arming glow while it counts down
  if (atk >= 0) out.push(ell([0, 12, 0], [13.5, 2.2, 11.5], atk === 1 ? '#ff8030' : '#ff4020', { glow: true }));
  if (pain) out.push(ell([0, pk(pose) === 1 ? 8 : 10.5, 10], [pk(pose) === 1 ? 7 : 5, 4.5, 1.4], '#ff6020', { glow: true }));
  return out;
};

/** RAT (remote access trojan): a hunched, wiry quadruped — arched back over
 *  low hindquarters, four splayed jointed legs mid-scuttle, a whip
 *  antenna-tail curling high with a blinking beacon tip, and glowing
 *  cursor-slit eyes in a pointed snout. Pure creature silhouette — nothing
 *  like the office consoles it used to blend in with. */
const ratModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const pain = pose.kind === 'pain';
  // dead: upturned rat — flopped on its back, legs curled stiff in the
  // air, antenna-tail slack on the floor
  if (pose.kind === 'dead') {
    out.push(ell([0, 7, 0], [9.5, 6, 8.5], '#426a4d', { pitch: 2.4 }));
    out.push(ell([0, 8.5, -2], [8.5, 6.5, 8], '#3a5c46', { pitch: 2.4 }));
    out.push(ell([0, 11, 0], [6.5, 4, 6], '#5a7a5c', { pitch: 2.4 }));
    out.push(ell([0, 4.5, 9], [5.5, 4, 5], '#3a5c44', { pitch: 2.2 }));
    out.push(ell([0, 3, 13], [3, 2.2, 3.5], '#33553d', { pitch: 2.2 }));
    out.push(ell([0, 2.2, 15.5], [1.4, 1.4, 1.6], '#2a0e0e'));
    for (const sx of [-1, 1]) out.push(ell([sx * 3.8, 6.8, 9.5], [2.2, 1.2, 2.4], '#8a2f2f', { pitch: 2.2 }));
    for (const sx of [1, -1]) {
      limb(out, [sx * 6, 9, -4], [sx * 11, 14, -6], 1.15, '#33553d');
      limb(out, [sx * 6, 9, 4], [sx * 11, 15, 6], 1.15, '#33553d');
      out.push(ell([sx * 11, 15, 6], [2.2, 1.6, 2.2], '#16281c'));
      out.push(ell([sx * 11, 14, -6], [2.2, 1.6, 2.2], '#16281c'));
    }
    limb(out, [0, 2.5, -8], [3, 1.6, -18], 1.15, '#4a5e4a');
    limb(out, [3, 1.6, -18], [6, 1.2, -25], 0.85, '#8a5a50');
    return out;
  }
  // authored recoil: the RAT rears up hard, front paws thrown off the
  // floor — a distinct shape change at range
  const rear = atk === 0 ? 6 : atk === 1 ? 11 : pain ? (pk(pose) === 1 ? 9 : 14) : 0; // rears up to strike / flinch
  const bob = pose.kind === 'walk' ? Math.abs(Math.sin(ph * 2)) * 1.8 : 0;
  // hindquarters low, shoulders hunched high — the classic rodent arch
  const hq: V3 = [0, 15 + bob * 0.4 + rear * 0.3, -8];
  const sh: V3 = [0, 27 + bob + rear, 3];
  out.push(ell(hq, [9.5, 7.5, 8.5], '#426a4d'));
  out.push(ell([0, 20 + bob * 0.6 + rear * 0.6, -1.5], [8.5, 8, 8], '#3a5c46'));
  out.push(ell(sh, [7.5, 7, 7], '#3a5c44', { roll: pain ? (pk(pose) === 1 ? -0.18 : 0.18) : 0 }));
  // dorsal ridge: hackle spikes along the arch
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    out.push(ell([0, 21 + t * 9 + bob * 0.7 + rear * (0.4 + t * 0.6), -9 + t * 11], [1.1, 3.6 - t, 1.4], '#1e3828', { pitch: -0.5 }));
  }
  // head slung low and forward: pointed snout, glowing cursor-slit eyes
  const hy = 18 + bob + rear;
  const hz = 12;
  out.push(ell([0, hy, hz], [5.5, 4.5, 5], '#3a5c44', { pitch: pain ? -0.5 : 0 }));
  out.push(ell([0, hy - 1.6, hz + 5.5], [3.6, 2.8, 3.4], '#33553d'));
  // tall thin ears with lit tips — the remote-receiver tell
  for (const sx of [-1, 1]) {
    out.push(ell([sx * 3.2, hy + 5.5, hz - 1.5], [1.1, 2.8, 0.8], '#1e3828', { roll: sx * 0.4 }));
    out.push(ell([sx * 3.7, hy + 7.8, hz - 1.7], [0.7, 0.9, 0.5], '#40e8ff', { glow: true }));
  }
  for (const sx of [-1, 1]) {
    out.push(ell([sx * 2.4, hy + 1.2, hz + 3.9], [1.7, 1.5, 1], pain ? '#ffffff' : '#50f0ff', { glow: true }));
    out.push(ell([sx * 2.7, hy + 1.7, hz + 4.4], [0.6, 0.7, 0.5], '#eaffff', { glow: true }));
  }
  // mouth opens with a glowing maw on the strike
  if (atk >= 0) out.push(ell([0, hy - 2.6, hz + 7], [2.9, atk === 1 ? 1.9 : 1, 1.2], '#a8ffcc', { glow: true }));
  // four jointed legs mid-scuttle: long thin limbs, unmistakably legs
  for (const [hipZ, phase, front] of [[5, 0, true], [-5, Math.PI, false]] as const) {
    for (const sx of [-1, 1]) {
      const swing = Math.sin(ph * 2 + phase + (sx > 0 ? Math.PI : 0)) * 4.5;
      const hip: V3 = [sx * (front ? 5.5 : 7.5), (front ? sh[1] : hq[1]) - 1.5, hipZ];
      const knee: V3 = [sx * (front ? 11 : 13), hip[1] - 5.5, hipZ + (front ? 2.5 : -2) + swing * 0.6];
      const foot: V3 = [sx * (front ? 9.5 : 12), 1.2 + Math.max(0, swing) * 0.7 + (pain && front ? 8 : 0), hipZ + (front ? 6 : -6) + swing];
      limb(out, hip, knee, 1.15, '#33553d');
      limb(out, knee, foot, 0.95, '#3d6147');
      out.push(ell(foot, [1.7, 1, 2.1], '#16281c'));
    }
  }
  // whip antenna-tail: curls high above the rump, blinking beacon tip —
  // its height is what keeps the RAT's profile readable at 10+ tiles
  const wag = Math.sin(ph * 1.5) * 3;
  const tailA: V3 = [0, hq[1] + 3, -14];
  const tailB: V3 = [wag * 0.6, 36 + bob * 0.5, -20];
  const tailC: V3 = [wag, 50 + bob * 0.5 + rear * 0.3, -21];
  limb(out, tailA, tailB, 1.15, '#1e3828');
  limb(out, tailB, tailC, 0.85, '#33553d');
  const led = pose.kind !== 'walk' || pose.k % 2 === 0;
  if (led || atk >= 0) out.push(ell(tailC, [1.7, 1.7, 1.7], atk === 1 ? '#ffe040' : '#40e8ff', { glow: true }));
  return out;
};

interface LazyFrame {
  /** Sprite set this frame belongs to (for prewarm prioritization). */
  setId: string;
  /** First lazy frame pushed for the set — prewarmed before all others. */
  first: boolean;
  /** Advance by at most `ms` milliseconds of raster work; true when installed. */
  step: (deadline: number) => boolean;
}
const lazyFrames: LazyFrame[] = [];
let lazyOwner = '';
const lazyFirstDone = new Set<string>();

/** TESTING: exported so tests/model-raster.test.ts can pin rasterizer output on real models. */
export const spriteModels = { worm: wormModel, trojan: trojanModel, ransom: ransomModel, rootkit: rootkitModel, logicbomb: logicbombModel, rat: ratModel };

export function scaleModel(prims: Prim[]): Prim[] {
  return prims.map((prim) => ({
    ...prim,
    c: [prim.c[0] * RES, prim.c[1] * RES, prim.c[2] * RES] as V3,
    r: [prim.r[0] * RES, prim.r[1] * RES, prim.r[2] * RES] as V3,
    ...(prim.decal ? { decal: (local: V3, normal: V3) => prim.decal!([local[0] / RES, local[1] / RES, local[2] / RES], normal) } : {}),
  }));
}

/** Pre-raster growth: scales prim centres and radii out of the feet (y=0
 *  stays planted) so a squat model fills more of the 64px monster canvas. */
function growModel(prims: Prim[], grow: number): Prim[] {
  if (grow === 1) return prims;
  return prims.map((p) => ({
    ...p,
    c: [p.c[0] * grow, p.c[1] * grow, p.c[2] * grow] as V3,
    r: [p.r[0] * grow, p.r[1] * grow, p.r[2] * grow] as V3,
    ...(p.decal ? { decal: (l: V3, n: V3) => p.decal!([l[0] / grow, l[1] / grow, l[2] / grow], n) } : {}),
  }));
}

/**
 * Death transform: tip the whole creature backward about its feet (Doom's
 * backward fall). `a` is the rotation in radians (negative = away from the
 * viewer); nothing dips below the floor line.
 */
function tipOver(p: Prim, a: number, lift = 0): Prim {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const [x, y, z] = p.c;
  const cy = Math.max(1.4, y * cos - z * sin + lift);
  const cz = y * sin + z * cos;
  return { ...p, c: [x, cy, cz] as V3, pitch: (p.pitch ?? 0) + a };
}

function makeMonster(id: string, worldH: number, model: Model, opts: { floor?: number; gain?: number; grow?: number; walkN?: number; gib?: [number, number, number] } = {}): void {
  const grow = opts.grow ?? 1;
  const walkN = opts.walkN ?? 4;
  lazyOwner = id;
  const W = TEX.monster;
  const H = TEX.monster;
  const frames: Record<string, THREE.Texture> = {};
  // ENEMIES: two authored flinch poses (pain/pain2) flicker while the hit
  // flash is up; stiffest types register 8 walk frames instead of 4.
  const poses: [string, Pose][] = [
    ...Array.from({ length: walkN }, (_, k): [string, Pose] => [`walk${k}`, { kind: 'walk', k, n: walkN }]),
    ['attack0', { kind: 'attack', k: 0 }],
    ['attack1', { kind: 'attack', k: 1 }],
    ['pain', { kind: 'pain', k: 0 }],
    ['pain2', { kind: 'pain', k: 1 }],
  ];
  // grain + pack, shared by every thread: seeded -> byte-identical output
  const finishPixels = (raw: { rgba: Uint8ClampedArray; glow: Uint8ClampedArray }, pose: Pose, rotation: number, mirror: boolean): GenResult => {
    const grain = raw.rgba;
    let seed = 2166136261;
    for (const ch of `${id}:${pose.kind}:${'k' in pose ? pose.k : 0}:${rotation}:${mirror ? 1 : 0}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    for (let i = 0; i < grain.length; i += 4) {
      if (grain[i + 3] < 128 || raw.glow[i + 3] > 0) continue;
      const m = 0.97 + random() * 0.06;
      grain[i] = Math.min(255, grain[i] * m);
      grain[i + 1] = Math.min(255, grain[i + 1] * m);
      grain[i + 2] = Math.min(255, grain[i + 2] * m);
    }
    return packPixels(W, H, raw, { sprite: true, mirror });
  };
  const startPose = (pose: Pose, rotation: number, mirror: boolean) => {
    const prims = scaleModel(growModel(model(pose), grow));
    const job = createRasterJob(W, H, prims, { view: (rotation * Math.PI) / 4, ...(pose.kind === 'pain' ? { tint: [255, 120, 80] as V3, tintT: 0.2 } : {}) });
    return { job, finish: () => finishPixels(job, pose, rotation, mirror) };
  };
  const poseJob = (pose: Pose, rotation: number, mirror: boolean) => () => {
    const { job, finish } = startPose(pose, rotation, mirror);
    rasterizeRows(job, 0, H);
    return finish();
  };
  // Register every frame's job first so workers can run them regardless of wiring mode.
  const poseFrames: { key: string; pose: Pose; r: number; mirror: boolean }[] = [];
  for (const [key, pose] of poses) {
    for (let r = 0; r <= 4; r++) {
      poseFrames.push({ key: `${key}_${r}`, pose, r, mirror: false });
      if (r >= 1 && r <= 3) poseFrames.push({ key: `${key}_${8 - r}`, pose, r, mirror: true });
    }
  }
  for (const f of poseFrames) {
    registerGenJob(`sprite:${id}:${f.key}`, { setId: id, first: f.key.startsWith('walk0_') }, poseJob(f.pose, f.r, f.mirror));
  }
  const diePrims: Prim[][] = [];
  const dieBase = growModel(model({ kind: 'pain' }), grow);
  // Death sequence (~0.5 s): the creature staggers upright, tips over
  // backward (Doom's fall), then quarantine-scatters — always ending on a
  // recognisable heap, never a flat smear.
  for (let k = 0; k < 5; k++) {
    const tip = k <= 2 ? -0.15 - k * 0.5 : -1.15 - (k - 2) * 0.12;
    diePrims.push(scaleModel(dieBase.map((p, pi) => {
      const q = tipOver(p, tip, k * 0.4);
      if (k < 3) return q;
      // data-gib burst: the last frames tear the body into chunks that scatter
      // outward — the dissolve reads as thrown debris, not just fading pixels
      const s = hash01(`${id}:die:${pi}`);
      const burst = (k - 2) * 13;
      return {
        ...q,
        c: [q.c[0] + (s - 0.5) * burst * 2, Math.max(2, q.c[1] + (0.6 - s) * burst), q.c[2] + ((s * 7) % 1 - 0.5) * burst * 2] as V3,
        pitch: (q.pitch ?? 0) + (s - 0.5) * 1.6,
      };
    })));
    const prims = diePrims[k];
    registerGenJob(`sprite:${id}:die${k}`, { setId: id, first: false }, () => {
      const job = createRasterJob(W, H, prims, { view: 0, tint: [44, 255, 90], tintT: k < 3 ? 0.04 + k * 0.05 : 0.2 + k * 0.1 });
      rasterizeRows(job, 0, H);
      const raw = { rgba: job.rgba, glow: job.glow };
      return k < 3 ? packPixels(W, H, raw, { sprite: true }) : dissolvePixels(W, H, raw, k - 3, id);
    });
  }
  // persistent corpse (ENEMIES F5): an authored dead pose per type —
  // collapsed worm coil, toppled gift box, broken padlock, upturned rat —
  // over a dark remains pool, so the kill site keeps a readable dead-enemy
  // silhouette at 5+ tiles instead of an amorphous red blob
  const deadPrims = scaleModel([
    ell([0, 1.3, 1.5] as V3, [24, 1.2, 18], '#140a12'),
    ...growModel(model({ kind: 'dead' }), grow),
  ]);
  const deadRaster = (job: RasterJob) => {
    rasterizeRows(job, 0, job.h);
    return packPixels(W, H, { rgba: job.rgba, glow: job.glow }, { sprite: true });
  };
  registerGenJob(`sprite:${id}:dead`, { setId: id, first: false }, () =>
    deadRaster(createRasterJob(W, H, deadPrims, { view: 0, tint: [120, 130, 120], tintT: 0.22 })));
  if (jobsOnly) return;

  if (genPoolActive()) {
    // worker pool: every raster frame defers; aliases and the display frame chain through
    for (const f of poseFrames) defineDeferred(frames, f.key, `sprite:${id}:${f.key}`);
    for (let k = 0; k < 5; k++) defineDeferred(frames, `die${k}`, `sprite:${id}:die${k}`);
    defineDeferred(frames, 'dead', `sprite:${id}:dead`);
    const alias = (key: string, target: string) => {
      Object.defineProperty(frames, key, { configurable: true, enumerable: true, get: () => frames[target] });
    };
    alias('walk0', 'walk0_0');
    for (const [key] of poses.slice(1)) alias(key, `${key}_0`);
    alias('attack', 'attack1');
    spriteSets.register(id, { w: worldH, h: worldH, frames, anim: 'monster', ...opts });
    whenGenJobs([`sprite:${id}:walk0_0`], () => spriteRegistry.register(id, frames.walk0));
    return;
  }

  const renderPose = (pose: Pose, rotation: number, mirror = false): THREE.Texture => {
    const { job, finish } = startPose(pose, rotation, mirror);
    rasterizeRows(job, 0, H);
    return textureFromPixels(finish());
  };
  const poseBegin = (pose: Pose, rotation: number, mirror: boolean) => () => {
    const p = startPose(pose, rotation, mirror);
    return { job: p.job, finish: () => textureFromPixels(p.finish()) };
  };
  /**
   * Lazy frame backed by a resumable raster job: the getter finishes
   * synchronously on demand; the prewarm steps it a row band at a time.
   */
  const defineLazy = (key: string, begin: () => { job: RasterJob | null; finish: () => THREE.Texture }) => {
    let pending: { job: RasterJob | null; finish: () => THREE.Texture } | null = null;
    const start = () => (pending ??= begin());
    const install = (tex: THREE.Texture) => {
      pending = null;
      Object.defineProperty(frames, key, { configurable: true, enumerable: true, value: tex });
      return tex;
    };
    const getter = () => {
      const p = start();
      if (p.job) rasterizeRows(p.job, p.job.next, p.job.h);
      return install(p.finish());
    };
    Object.defineProperty(frames, key, { configurable: true, enumerable: true, get: getter });
    const first = !lazyFirstDone.has(lazyOwner);
    lazyFirstDone.add(lazyOwner);
    lazyFrames.push({
      setId: lazyOwner,
      first,
      step: (deadline) => {
        const p = start();
        if (p.job && p.job.next < p.job.h) {
          // advance a band, then re-check the clock each few rows
          while (p.job.next < p.job.h && performance.now() < deadline) {
            rasterizeRows(p.job, p.job.next, Math.min(p.job.h, p.job.next + 2));
          }
          if (p.job.next < p.job.h) return false;
        }
        install(p.finish());
        return true;
      },
    });
  };
  /** Lazy alias for another (already-rasterized) frame. */
  const defineAlias = (key: string, build: () => THREE.Texture) => {
    defineLazy(key, () => ({ job: null, finish: build }));
  };
  // Keep all eight walk0 views ready so newly encountered threats face correctly immediately.
  for (let r = 0; r <= 4; r++) {
    frames[`walk0_${r}`] = renderPose(poses[0][1], r);
    if (r >= 1 && r <= 3) frames[`walk0_${8 - r}`] = renderPose(poses[0][1], r, true);
  }
  frames.walk0 = frames.walk0_0;
  for (const [key, pose] of poses.slice(1)) {
    for (let r = 0; r <= 4; r++) {
      defineLazy(`${key}_${r}`, poseBegin(pose, r, false));
      if (r >= 1 && r <= 3) defineLazy(`${key}_${8 - r}`, poseBegin(pose, r, true));
    }
    defineAlias(key, () => frames[`${key}_0`]);
  }
  defineAlias('attack', () => frames.attack1);
  for (let k = 0; k < 5; k++) {
    const prims = diePrims[k];
    defineLazy(`die${k}`, () => {
      const job = createRasterJob(W, H, prims, { view: 0, tint: [44, 255, 90], tintT: k < 3 ? 0.04 + k * 0.05 : 0.2 + k * 0.1 });
      return {
        job,
        finish: () => {
          const raw = { rgba: job.rgba, glow: job.glow };
          return k < 3 ? packTexture(W, H, raw, { sprite: true }) : dissolveFrame(W, H, raw, k - 3, id);
        },
      };
    });
  }
  defineLazy('dead', () => {
    const job = createRasterJob(W, H, deadPrims, { view: 0, tint: [120, 130, 120], tintT: 0.22 });
    return {
      job,
      finish: () => {
        const raw = { rgba: job.rgba, glow: job.glow };
        return packTexture(W, H, raw, { sprite: true });
      },
    };
  });
  spriteSets.register(id, { w: worldH, h: worldH, frames, anim: 'monster', ...opts });
  spriteRegistry.register(id, frames.walk0);
}

let prewarmIndex = 0;
let prewarmRunning = false;

/** Move the named sets' pending frames to the front of the generation queue. */
export function prioritizeLazySprites(setIds: string[]): void {
  if (genPoolActive()) {
    prioritizeGenJobs(setIds);
    return;
  }
  const tail = reorderLazyQueue(lazyFrames.slice(prewarmIndex), setIds);
  lazyFrames.splice(prewarmIndex, lazyFrames.length - prewarmIndex, ...tail);
}

export function prewarmLazySpriteFrames(onComplete?: (ms: number) => void): void {
  if (genPoolActive()) {
    prewarmGenJobs(onComplete);
    return;
  }
  if (prewarmRunning) return;
  prewarmRunning = true;
  // first frames before everything else, so a demanded getter never hits a cold set
  lazyFrames.splice(0, lazyFrames.length, ...reorderLazyQueue(lazyFrames, []));
  const start = performance.now();
  const runSlice = (deadline?: { didTimeout?: boolean; timeRemaining: () => number }) => {
    const sliceStart = performance.now();
    // ~3 ms slices: each step() advances a frame by a small row band
    while (prewarmIndex < lazyFrames.length && performance.now() - sliceStart < 3 && (!deadline || deadline.didTimeout || deadline.timeRemaining() > 1)) {
      if (lazyFrames[prewarmIndex].step(sliceStart + 2.5)) prewarmIndex++;
      else break;
    }
    if (prewarmIndex < lazyFrames.length) {
      const idleWindow = window as Window & {
        requestIdleCallback?: (cb: (d: { didTimeout?: boolean; timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
      };
      if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(runSlice, { timeout: 250 });
      else window.setTimeout(() => runSlice(), 0);
    } else onComplete?.(performance.now() - start);
  };
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: (d: { didTimeout?: boolean; timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(runSlice, { timeout: 250 });
  else window.setTimeout(() => runSlice(), 0);
}
// ---------------------------------------------------------------- devices

function workstation(state: 'clean' | 'infected', frame: number): Draw {
  return (p) => {
    const { g } = p;
    // desk
    g.fillStyle = '#5a4030';
    g.fillRect(2, 40, 60, 5);
    g.fillStyle = '#8a6448';
    g.fillRect(2, 40, 60, 1);
    g.fillStyle = '#3a281c';
    g.fillRect(4, 45, 4, 19);
    g.fillRect(56, 45, 4, 19);
    // tower
    g.fillStyle = '#2a2e38';
    g.fillRect(44, 46, 10, 18);
    g.fillStyle = '#4a5060';
    g.fillRect(44, 46, 10, 1);
    lit(p, state === 'clean' ? '#2cff5a' : '#ff3020', 46, 49, 2, 1);
    // monitor
    g.fillStyle = '#1c1f26';
    g.fillRect(8, 6, 44, 30);
    g.fillStyle = '#3a404c';
    g.fillRect(8, 6, 44, 1);
    g.fillRect(28, 36, 6, 4);
    g.fillRect(22, 38, 18, 2);
    // keyboard
    g.fillStyle = '#c8ccd4';
    g.fillRect(14, 37, 20, 3);
    if (state === 'clean') {
      lit(p, '#1858c8', 11, 9, 38, 24);
      lit(p, '#3a84f0', 11, 9, 38, 3);
      lit(p, '#d8e4f4', 14, 14, 18, 12);
      lit(p, '#2a64d8', 14, 14, 18, 2);
      lit(p, '#a0b8d8', 16, 18, 12, 1);
      lit(p, '#a0b8d8', 16, 21, 9, 1);
      lit(p, '#2cff5a', 36, 15, 10, 10);
      lit(p, '#ffffff', 38, 19, 2, 2);
      lit(p, '#ffffff', 40, 21, 4, 2);
    } else {
      const flash = frame === 1;
      lit(p, flash ? '#ff3020' : '#b81810', 11, 9, 38, 24);
      // skull
      lit(p, '#f4f0e0', 22, 12, 14, 11);
      lit(p, '#f4f0e0', 25, 23, 8, 4);
      lit(p, '#200000', 24, 15, 4, 4);
      lit(p, '#200000', 30, 15, 4, 4);
      lit(p, '#200000', 28, 20, 2, 2);
      // popups
      lit(p, '#ffe040', flash ? 12 : 37, flash ? 24 : 10, 11, 7);
      lit(p, '#200000', flash ? 13 : 38, flash ? 26 : 12, 9, 1);
      lit(p, '#200000', flash ? 13 : 38, flash ? 28 : 14, 6, 1);
    }
  };
}

function consoleKiosk(frame: number): Draw {
  return (p) => {
    const { g } = p;
    g.fillStyle = '#2a3038';
    g.fillRect(8, 6, 32, 58);
    g.fillStyle = '#4a5464';
    g.fillRect(8, 6, 32, 2);
    g.fillStyle = '#1a1e24';
    g.fillRect(8, 60, 32, 4);
    // screen
    g.fillStyle = '#0a1a0c';
    g.fillRect(11, 10, 26, 22);
    for (let y = 12; y < 30; y += 3) {
      const w = 6 + ((y * 7 + frame * 5) % 16);
      lit(p, '#2cff5a', 13, y, w, 1);
    }
    lit(p, '#b8ffc8', 13 + ((frame * 9) % 18), 28, 3, 2);
    // label
    g.fillStyle = '#c81e14';
    g.fillRect(11, 35, 26, 7);
    drawText(g, 'SOC', 18, 36, '#ffffff', 'tiny', null);
    // keyboard tray
    g.fillStyle = '#3a4250';
    g.fillRect(4, 45, 40, 6);
    g.fillStyle = '#7a8496';
    for (let x = 6; x < 42; x += 3) g.fillRect(x, 46, 2, 2);
    lit(p, '#ffb010', 34, 54, 3, 2);
  };
}

// ---------------------------------------------------------------- people

interface Look {
  shirt: string;
  shirtDark: string;
  pants: string;
  skin: string;
  hair: string;
  longHair: boolean;
  tie?: string;
  lanyard: string;
}

function person(look: Look, view: 'front' | 'side' | 'back', step: number): Draw {
  return (p) => {
    const { g } = p;
    const cx = 16;
    const legSwing = step === 0 ? 0 : step === 1 ? 2 : -2;
    // legs
    g.fillStyle = look.pants;
    if (view === 'side') {
      g.fillRect(cx - 3 + legSwing, 44, 5, 16);
      g.fillRect(cx - 2 - legSwing, 44, 5, 16);
      g.fillStyle = '#121214';
      g.fillRect(cx - 3 + legSwing, 60, 7, 3);
      g.fillRect(cx - 2 - legSwing, 60, 7, 3);
    } else {
      g.fillRect(cx - 6, 44, 5, 16 + (step === 1 ? -1 : 0));
      g.fillRect(cx + 1, 44, 5, 16 + (step === 2 ? -1 : 0));
      g.fillStyle = '#121214';
      g.fillRect(cx - 7, 60 + (step === 1 ? -1 : 0), 6, 3);
      g.fillRect(cx + 1, 60 + (step === 2 ? -1 : 0), 6, 3);
    }
    // torso
    const tw = view === 'side' ? 10 : 16;
    g.fillStyle = look.shirt;
    g.fillRect(cx - tw / 2, 22, tw, 23);
    g.fillStyle = look.shirtDark;
    g.fillRect(cx - tw / 2, 42, tw, 3);
    // arms
    if (view === 'side') {
      g.fillStyle = look.shirtDark;
      g.fillRect(cx - 2 - legSwing, 23, 5, 15);
      g.fillStyle = look.skin;
      g.fillRect(cx - 2 - legSwing, 38, 4, 4);
    } else {
      g.fillStyle = look.shirtDark;
      g.fillRect(cx - tw / 2 - 4, 23, 4, 16);
      g.fillRect(cx + tw / 2, 23, 4, 16);
      g.fillStyle = look.skin;
      g.fillRect(cx - tw / 2 - 4, 39 + (step === 1 ? 1 : 0), 4, 4);
      g.fillRect(cx + tw / 2, 39 + (step === 2 ? 1 : 0), 4, 4);
    }
    if (view === 'front') {
      // collar, tie, lanyard + badge
      g.fillStyle = look.skin;
      g.fillRect(cx - 2, 22, 4, 3);
      if (look.tie) {
        g.fillStyle = look.tie;
        g.fillRect(cx - 1, 24, 2, 12);
      }
      g.fillStyle = look.lanyard;
      g.fillRect(cx - 4, 22, 1, 9);
      g.fillRect(cx + 3, 22, 1, 9);
      g.fillStyle = '#e8ecf4';
      g.fillRect(cx - 3, 31, 6, 7);
      g.fillStyle = look.lanyard;
      g.fillRect(cx - 3, 31, 6, 2);
    }
    // head
    const hw = view === 'side' ? 9 : 10;
    const hx = cx - hw / 2 + (view === 'side' ? 1 : 0);
    g.fillStyle = look.skin;
    g.fillRect(hx, 8, hw, 13);
    g.fillRect(cx - 2, 20, 4, 2);
    // hair
    g.fillStyle = look.hair;
    g.fillRect(hx - 1, 6, hw + 2, 4);
    if (view === 'back') {
      g.fillRect(hx - 1, 6, hw + 2, look.longHair ? 22 : 14);
    } else if (view === 'side') {
      g.fillRect(hx - 1, 6, 5, look.longHair ? 22 : 9);
      g.fillStyle = look.skin;
      g.fillRect(hx + hw, 13, 2, 3); // nose
      g.fillStyle = '#16120e';
      g.fillRect(hx + hw - 3, 12, 2, 2);
      g.fillStyle = '#7a3a2a';
      g.fillRect(hx + hw - 3, 17, 3, 1);
    } else {
      if (look.longHair) {
        g.fillRect(hx - 2, 8, 3, 18);
        g.fillRect(hx + hw - 1, 8, 3, 18);
      }
      g.fillStyle = '#16120e';
      g.fillRect(hx + 2, 13, 2, 2);
      g.fillRect(hx + hw - 4, 13, 2, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(hx + 4, 15, 2, 2);
      g.fillStyle = '#7a3a2a';
      g.fillRect(hx + 3, 18, 4, 1);
    }
  };
}

function personSet(id: string, look: Look): void {
  const frames: FrameSpec[] = [];
  for (let s = 0; s < 3; s++) {
    frames.push({ key: `front${s}`, draw: person(look, 'front', s) });
    frames.push({ key: `side${s}`, draw: person(look, 'side', s) });
    frames.push({ key: `sideL${s}`, draw: person(look, 'side', s), mirror: true });
    frames.push({ key: `back${s}`, draw: person(look, 'back', s) });
  }
  makeSet(id, 32, 64, 0.98, 'person', frames);
}

// ---------------------------------------------------------------- items / fx

/** Pass jobs=true to register gen jobs only (generation-worker startup). */
export function buildSprites(jobs = false): void {
  if (jobs ? spriteJobsDone : spriteSets.ids().length > 0) return;
  jobsOnly = jobs;
  spriteJobsDone ||= jobs;

  // ENEMIES F3 range targets: every type projects >=10% of view height at
  // 10 tiles (world h ~1.25-1.35 with a model that fills the canvas) and
  // keeps Doom-monster contrast in dead-black sectors (uFloor ~1.3 = lit).
  // ENEMIES F5: base heights raised — far-scale (renderer) does the rest
  makeMonster('worm', 1.45, wormModel, { floor: 1.45, gain: 2.7, gib: [0.95, 0.25, 0.15] });
  makeMonster('trojan', 1.45, trojanModel, { floor: 1.3, gain: 2.6, gib: [0.75, 0.35, 1.0] });
  makeMonster('ransomware', 1.55, ransomModel, { floor: 1.35, gain: 2.6, walkN: 8, gib: [1.0, 0.55, 0.1] });
  makeMonster('rootkit', 1.45, rootkitModel, { floor: 1.5, gain: 2.7, walkN: 8, gib: [0.5, 0.35, 0.95] });
  makeMonster('logicbomb', 1.35, logicbombModel, { floor: 1.3, gain: 2.6, grow: 1.8, gib: [1.0, 0.85, 0.2] });
  makeMonster('rat', 1.45, ratModel, { floor: 1.55, gain: 2.7, gib: [0.7, 0.9, 0.3] });

  makeSet('workstation', 64, 64, 0.82, 'static', [{ key: 'idle', draw: workstation('clean', 0) }]);
  makeSet('workstation-infected', 64, 64, 0.82, 'flicker', [
    { key: 'f0', draw: workstation('infected', 0) },
    { key: 'f1', draw: workstation('infected', 1) },
  ]);
  makeSet('console', 48, 64, 0.95, 'flicker', [
    { key: 'f0', draw: consoleKiosk(0) },
    { key: 'f1', draw: consoleKiosk(1) },
  ]);

  personSet('npc-m', {
    shirt: '#3a6ad0', shirtDark: '#24448a', pants: '#2a2c34', skin: '#e0a878', hair: '#4a3020',
    longHair: false, lanyard: '#2458d8',
  });
  personSet('npc-f', {
    shirt: '#1f8f7e', shirtDark: '#0f5a4e', pants: '#34303a', skin: '#f0c098', hair: '#6a2a10',
    longHair: true, lanyard: '#2458d8',
  });
  personSet('npc-suit', {
    shirt: '#2e3038', shirtDark: '#1a1b20', pants: '#1e1f24', skin: '#c88a5a', hair: '#141210',
    longHair: false, tie: '#a01818', lanyard: '#c81e14',
  });

  // ENEMIES F5: raised to real-pickup size (0.72 like the tool pickups) —
  // the disguised trojan reuses this set, so the disguise is now a fair
  // one: same footprint and readability as every other floor pickup
  makeSet('usb', 32, 32, 0.72, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      pxEllipse(g, 17, 29, 12, 2, 'rgba(0,0,0,0.0)');
      g.fillStyle = '#9aa2b0';
      g.fillRect(4, 14, 10, 11);
      g.fillStyle = '#2a2e38';
      g.fillRect(6, 17, 2, 2);
      g.fillRect(10, 17, 2, 2);
      g.fillStyle = '#c81e14';
      g.fillRect(14, 11, 16, 16);
      g.fillStyle = '#ff6a4a';
      g.fillRect(14, 11, 16, 3);
      g.fillStyle = '#70100a';
      g.fillRect(27, 11, 3, 16);
      lit(p, '#ffe040', 26, 18, 2, 2);
      // "?" glint
      lit(p, '#ffe040', 5, 4, 1, 1);
      drawText(g, '?', 18, 3, '#ffe040', 'small', '#000');
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(0, 0, 32, 32);
    },
  }]);
  makeSet('charge', 32, 32, 0.56, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      g.fillStyle = '#3a404c';
      g.fillRect(9, 6, 14, 4);
      g.fillRect(9, 26, 14, 4);
      g.fillStyle = '#5a6272';
      g.fillRect(9, 6, 14, 1);
      g.fillStyle = '#20242c';
      g.fillRect(10, 10, 12, 16);
      lit(p, f ? '#7af8ff' : '#18d8f0', 12, 11, 8, 14);
      lit(p, '#ffffff', 14, 13 + f * 4, 2, 6);
      drawText(g, '+', 13, 15, '#0a3040', 'small', null);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(0, 0, 32, 32);
    },
  })));
  // EGGS: the rubber duck — debugging mascot AND the removable media you
  // plug in last. Pixel-blocky bath duck with a bob animation.
  makeSet('duck', 32, 32, 0.55, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      const dy = f ? 1 : 0;
      // body
      lit(p, '#f8c820', 8, 16 + dy, 16, 8);
      lit(p, '#e0a810', 8, 22 + dy, 16, 3);
      // head + neck
      lit(p, '#f8c820', 10, 8 + dy, 8, 8);
      lit(p, '#ffd840', 11, 9 + dy, 5, 4);
      // beak
      lit(p, '#ff8020', 7, 11 + dy, 4, 3);
      // eye
      g.fillStyle = '#101014';
      g.fillRect(14, 10 + dy, 2, 2);
      // wing
      lit(p, '#d8a018', 14, 18 + dy, 7, 4);
      // waterline sparkle
      lit(p, '#7af8ff', 4, 26, 24, 1);
      lit(p, '#38c8e0', 8, 27, 16, 1);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(6, 8, 20, 20);
    },
  })));
  // ARSENAL pickups: resources (small, flicker) and found tools (gold-ringed, bigger)
  makeSet('pcap', 32, 32, 0.5, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      g.fillStyle = '#2a2e38';
      g.fillRect(5, 11, 22, 15);
      g.fillStyle = '#4a5060';
      g.fillRect(5, 11, 22, 2);
      g.fillStyle = '#e8e4d8';
      g.fillRect(8, 15, 16, 6);
      g.fillStyle = '#14161c';
      g.fillRect(10, 17, 3, 3);
      g.fillRect(19, 17, 3, 3);
      lit(p, f ? '#8aff9a' : '#2ad83a', 8, 23, 4, 2);
      lit(p, '#3dff8a', 14, 23, 10, 1);
      drawText(g, 'PCAP', 8, 4, '#ffd040', 'tiny', '#000');
    },
  })));
  makeSet('edr-cell', 32, 32, 0.52, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      g.fillStyle = '#9aa2b0';
      g.fillRect(13, 4, 6, 3);
      g.fillStyle = '#20242c';
      g.fillRect(10, 7, 12, 22);
      lit(p, f ? '#a8fcff' : '#5df2ff', 12, 9 + f * 2, 8, 18 - f * 2);
      g.fillStyle = '#0a3040';
      g.fillRect(15, 12, 2, 8);
      g.fillRect(12, 15, 8, 2);
    },
  })));
  makeSet('patch-disk', 32, 32, 0.46, 'static', [{
    key: 'idle',
    draw: (p: PaintCtx) => {
      const { g } = p;
      g.fillStyle = '#1e3a8a';
      g.fillRect(6, 7, 20, 20);
      g.fillStyle = '#b8bcc8';
      g.fillRect(11, 7, 10, 7);
      g.fillStyle = '#3a404c';
      g.fillRect(17, 8, 3, 5);
      g.fillStyle = '#f0ede4';
      g.fillRect(8, 17, 16, 9);
      lit(p, '#ff8a1a', 8, 17, 16, 2);
    },
  }]);
  const toolPickup = (id: string, device: (p: PaintCtx) => void) =>
    makeSet(id, 32, 32, 0.7, 'flicker', [0, 1].map((f) => ({
      key: `f${f}`,
      draw: (p: PaintCtx) => {
        // gold pedestal ring that blinks, so a found tool reads as special
        lit(p, f ? '#fff0a0' : '#ffb000', 2, 27, 28, 2);
        lit(p, f ? '#ffb000' : '#fff0a0', 4, 29, 24, 2);
        device(p);
      },
    })));
  toolPickup('tool-tap', (p) => {
    const { g } = p;
    g.fillStyle = '#2a7bd8';
    g.fillRect(6, 4, 3, 8);
    g.fillStyle = '#d8a02a';
    g.fillRect(23, 4, 3, 8);
    g.fillStyle = '#4a505e';
    g.fillRect(4, 10, 24, 15);
    g.fillStyle = '#04170d';
    g.fillRect(7, 15, 18, 6);
    lit(p, '#3dff8a', 8, 17, 16, 2);
  });
  toolPickup('tool-edr', (p) => {
    const { g } = p;
    g.fillStyle = '#2a2e3a';
    g.fillRect(3, 7, 26, 19);
    g.fillStyle = '#071018';
    g.fillRect(5, 9, 22, 15);
    lit(p, '#5df2ff', 12, 11, 8, 5);
    lit(p, '#5df2ff', 14, 16, 4, 4);
  });
  toolPickup('tool-patch', (p) => {
    const { g } = p;
    g.fillStyle = '#1e3a8a';
    g.fillRect(7, 6, 18, 18);
    g.fillStyle = '#b8bcc8';
    g.fillRect(11, 6, 10, 6);
    lit(p, '#ff8a1a', 9, 15, 14, 3);
  });
  toolPickup('tool-mfa', (p) => {
    const { g } = p;
    g.fillStyle = '#23262e';
    g.fillRect(11, 6, 10, 20);
    lit(p, '#ffd040', 13, 10, 6, 6);
  });
  makeSet('medkit', 32, 32, 0.5, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      g.fillStyle = '#e8ecf0';
      g.fillRect(5, 12, 22, 16);
      g.fillStyle = '#aab0b8';
      g.fillRect(5, 25, 22, 3);
      g.fillStyle = '#5a5e66';
      g.fillRect(12, 9, 8, 3);
      g.fillStyle = '#d81e1e';
      g.fillRect(14, 14, 4, 11);
      g.fillRect(10, 18, 12, 4);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(0, 0, 32, 32);
    },
  }]);

  // Projectile (scanner charge) + impact puff
  makeSet('fx-scan-trail', 8, 8, 0.12, 'static', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      p.g.fillStyle = f ? '#18a8d8' : '#7af8ff';
      p.g.fillRect(2 + f, 2 + f, 4 - 2 * f, 4 - 2 * f);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(0, 0, 8, 8);
    },
  })));
  makeSet('fx-scan', 16, 16, 0.34, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      pxEllipse(p.g, 8, 8, 7 - f, 7 - f, '#18a8d8');
      pxEllipse(p.g, 8, 8, 5 - f, 5 - f, '#7af8ff');
      pxEllipse(p.g, 8, 8, 2, 2, '#ffffff');
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(0, 0, 16, 16);
    },
  })));
  // Hostile payloads: Doom-imp-fireball scale — a big roaring orb, every
  // lit texel on the glow layer (fullbright) so it reads and can be dodged
  // in dead-dark corridors.
  makeSet('fx-payload', 20, 20, 0.62, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      pxEllipse(g, 10, 10, 9 - f, 9 - f, '#7a1c0e');
      pxEllipse(g, 10, 10, 8 - f, 8 - f, '#c83414');
      pxEllipse(g, 10, 10, 6 - f, 6 - f, f ? '#ff9a24' : '#ff5522');
      pxEllipse(g, 10, 10, 4 - f, 4 - f, f ? '#ffe06a' : '#ffb13b');
      pxEllipse(g, 10, 10, 2, 2, '#fff2c0');
      // licking flame flecks that swap frames
      lit(p, '#ff5522', 10 - 8 + f * 2, 3 + f * 2, 3, 3);
      lit(p, '#ffb13b', 10 + 5 - f * 3, 13 - f * 2, 2, 2);
      // the whole orb is fullbright
      pxEllipse(p.glow, 10, 10, 9 - f, 9 - f, '#fff');
    },
  })));
  makeSet('fx-puff', 24, 24, 0.34, 'static', [0, 1, 2].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const r = 4 + f * 3;
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        const x = Math.round(12 + Math.cos(t) * r);
        const y = Math.round(12 + Math.sin(t) * r);
        lit(p, f === 2 ? '#2cff5a' : '#b8ffff', x, y, 2, 2);
      }
      if (f === 0) lit(p, '#ffffff', 10, 10, 4, 4);
    },
  })));

  // Doom teleport-fog flash where a threat materialises (ambushes, worm
  // copies): a tall searing column that collapses inward, a ground-flash
  // ring, and thrown sparks — big and fullbright enough to read at range.
  // The column is authored, not a white pole: a domed top, ragged dithered
  // edges, horizontal scanline bands and interior flecks, so it still reads
  // as an energy effect when the frame edge clips it.
  makeSet('fx-spawn', 24, 84, 2.1, 'static', [0, 1, 2, 3].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      const top = 3 + f * 8;
      const bot = 82 - f * 3;
      const half = 11 - f * 2;
      const x0 = 12 - half;
      const x1 = 12 + half;
      // outer fog column: mid cyan with darker edge columns — brightness steps
      // stand in for alpha falloff, so clipped silhouettes read soft, not cut
      g.fillStyle = f < 2 ? '#3fc4f0' : '#2a88c0';
      g.fillRect(x0 + 1, top + 4, half * 2 - 2, bot - top - 4);
      g.fillStyle = f < 2 ? '#2a88c0' : '#1c5e88';
      g.fillRect(x0, top + 4, 1, bot - top - 4);
      g.fillRect(x1 - 1, top + 4, 1, bot - top - 4);
      // ragged edge dither: sparse stray texels past the core edges so the
      // column boundary is fuzzy, never a straight guillotine line
      for (let y = top + 5; y < bot - 2; y += 2) {
        if ((y * 7 + f * 5) % 3 !== 0) {
          g.fillStyle = '#5ac8f0';
          g.fillRect(x0 - 1, y, 1, 1);
          g.fillRect(x1, y + 1, 1, 1);
        }
      }
      // scanline bands across the column (CRT teleport shimmer)
      for (let y = top + 7 + (f % 2); y < bot - 3; y += 5) {
        g.fillStyle = 'rgba(8,24,36,0.55)';
        g.fillRect(x0, y, half * 2, 1);
      }
      // domed cap: bright rounded top instead of a flat cut
      pxEllipse(g, 12, top + 4, Math.max(2, half - 3), 3, f === 0 ? '#e8fcff' : '#7fe8ff');
      // searing core — bright middle column, fullbright
      lit(p, f === 0 ? '#ffffff' : '#d8f8ff', 12 - half * 0.45, top + 2, half * 0.9, bot - top - 2);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(12 - half * 0.6, top + 2, half * 1.2, (bot - top) * (0.72 - f * 0.12));
      // interior flecks: data shards swirling inside the beam
      for (let i = 0; i < 18; i++) {
        const fx = x0 + 2 + ((i * 7 + f * 11) % Math.max(4, half * 2 - 4));
        const fy = top + 5 + ((i * 13 + f * 9) % Math.max(6, bot - top - 10));
        g.fillStyle = i % 3 === 0 ? '#ffffff' : '#a8ecff';
        g.fillRect(fx, fy, 1, i % 2 ? 2 : 1);
      }
      // ground-flash ring
      lit(p, f < 2 ? '#b8f4ff' : '#5ac8f0', 12 - 11 + f * 3, 80 + f, 22 - f * 6, 2);
      // thrown sparks
      for (let i = 0; i < 14; i++) {
        const sx = ((i * 7 + f * 11) % 22) + 1;
        const sy = 4 + ((i * 13 + f * 9) % 76);
        const s = i % 3 === 0 ? 2 : 1;
        lit(p, i % 2 ? '#ffffff' : '#7fe8ff', sx, sy, s, s);
      }
    },
  })));

  // Data-gib debris: chunky shards thrown by kills and tinted per threat
  // (set.gib) — three chunk shapes, readable pixels even at close range.
  makeSet('fx-gib', 16, 16, 0.26, 'static', [0, 1, 2].map((f) => ({
    key: `g${f}`,
    draw: (p: PaintCtx) => {
      const shapes = [
        [[2, 2, 8, 6], [6, 8, 5, 4], [4, 4, 3, 3]],
        [[4, 1, 6, 9], [1, 5, 5, 4], [9, 6, 3, 3]],
        [[3, 3, 9, 4], [5, 7, 4, 6], [2, 10, 5, 3]],
      ][f];
      for (const [x, y, w, h] of shapes) lit(p, '#f0fff4', x, y, w, h);
      p.glow.fillStyle = '#888';
      p.glow.fillRect(shapes[0][0], shapes[0][1], shapes[0][2], shapes[0][3]);
    },
  })));
  // Red padlock overlay: marks a door/console a ransomware has encrypted
  makeSet('fx-seal', 32, 48, 0.5, 'static', [{
    key: 'idle',
    draw: (p: PaintCtx) => {
      const { g } = p;
      // shackle
      lit(p, '#ff5040', 11, 4, 3, 11);
      lit(p, '#ff5040', 18, 4, 3, 11);
      lit(p, '#ff5040', 11, 4, 10, 3);
      // body
      g.fillStyle = '#c01810';
      g.fillRect(7, 14, 18, 21);
      lit(p, '#ff4030', 7, 14, 18, 3);
      lit(p, '#ff6a50', 7, 14, 2, 21);
      g.fillStyle = '#7a0c08';
      g.fillRect(7, 32, 18, 3);
      // keyhole
      g.fillStyle = '#180402';
      g.fillRect(14, 19, 4, 6);
      g.fillRect(15, 25, 2, 4);
    },
  }]);

  // Ceiling-hung EXIT sign above exit tiles
  makeSet('fx-exit', 48, 16, 0.2, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      g.fillStyle = '#1a1c22';
      g.fillRect(0, 2, 48, 14);
      lit(p, '#0a3a12', 2, 4, 44, 10);
      drawText(g, 'EXIT', 6, 6, '#2cff5a', 'small', null);
      lit(p, '#2cff5a', 32, 8, 10, 2);
      lit(p, '#2cff5a', 38, 6, 2, 6);
      lit(p, '#2cff5a', 40, 7, 1, 4);
      p.glow.fillRect(6, 6, 24, 7);
      g.fillStyle = '#5a6070';
      g.fillRect(10, 0, 1, 2);
      g.fillRect(37, 0, 1, 2);
    },
  }]);
  jobsOnly = false;
}
