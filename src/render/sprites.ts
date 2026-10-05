import * as THREE from 'three';
import { Registry } from '../core/registry';
import { drawText } from './font';
import { limb, rasterize, type Prim, type V3 } from './model';
import { packTexture, paintRaw, pxEllipse, type PaintCtx } from './pixel';
import { RES, TEX } from './res';

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
}

export const spriteRegistry = new Registry<THREE.Texture>();
export const spriteSets = new Registry<SpriteSet>();

type Draw = (p: PaintCtx) => void;

interface FrameSpec {
  key: string;
  draw: Draw;
  mirror?: boolean;
}

function makeSet(id: string, cw: number, ch: number, worldH: number, anim: SpriteSet['anim'], frames: FrameSpec[], dissolve = false): SpriteSet {
  const out: Record<string, THREE.Texture> = {};
  let firstRaw: ReturnType<typeof paintRaw> | null = null;
  for (const f of frames) {
    const raw = paintRaw(cw, ch, `${id}:${f.key}`, f.draw, RES, false, true);
    if (!firstRaw) firstRaw = raw;
    out[f.key] = packTexture(cw * RES, ch * RES, raw, { sprite: true, shade: true, mirror: f.mirror });
  }
  if (dissolve && firstRaw) {
    for (let k = 0; k < 4; k++) out[`die${k}`] = dissolveFrame(cw * RES, ch * RES, firstRaw, k, id);
  }
  const set: SpriteSet = { w: (worldH * cw) / ch, h: worldH, frames: out, anim };
  spriteSets.register(id, set);
  spriteRegistry.register(id, out[frames[0].key]);
  return set;
}

/** "Quarantine" death: the sprite breaks into green fullbright pixels and scatters. */
function dissolveFrame(w: number, h: number, raw: ReturnType<typeof paintRaw>, k: number, seed: string): THREE.Texture {
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
  return packTexture(w, h, { rgba, glow }, { sprite: true, outline: null });
}

function lit(p: PaintCtx, color: string, x: number, y: number, w: number, h: number): void {
  p.g.fillStyle = color;
  p.g.fillRect(x, y, w, h);
  p.glow.fillStyle = '#fff';
  p.glow.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- malware

// ---------------------------------------------------------------- malware (3D-modelled)

type Pose = { kind: 'walk'; k: number } | { kind: 'attack'; k: 0 | 1 } | { kind: 'pain' };
type Model = (pose: Pose) => Prim[];

const ell = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'ell', c, r, col, ...extra });
const box = (c: V3, r: V3, col: string, extra: Partial<Prim> = {}): Prim => ({ shape: 'box', c, r, col, ...extra });
const walkPhase = (p: Pose) => (p.kind === 'walk' ? (p.k * Math.PI) / 2 : 0);

/** Worm: a rearing, segmented red centipede; tail trails behind on the floor. */
const wormModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const lean = atk === 0 ? -7 : atk === 1 ? 8 : pose.kind === 'pain' ? -9 : 0;
  const lift = atk === 0 ? 3 : pose.kind === 'pain' ? -3 : Math.sin(ph * 2) * 1;
  const segs = 8;
  let last: V3 = [0, 0, 0];
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const x = Math.sin(i * 0.9 + ph) * 4.5 * (1 - t * 0.6);
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
  const hz = hz0 + 3;
  out.push(ell([hx, hy, hz], [10.5, 8.5, 10], '#e0381c'));
  out.push(ell([hx, hy - 5, hz + 2], [8, 3.6, 7.5], '#901a0a'));
  for (let tooth = -2; tooth <= 2; tooth++) {
    out.push(ell([hx + tooth * 2.2, hy - 8, hz + 8.2], [0.75, 1.35, 0.7], '#f3dcae'));
  }
  for (const sx of [-1, 1]) {
    out.push(ell([hx + sx * 4.6, hy + 1.6, hz + 8.4], [2.7, 2.3, 1.6], '#ffe040', { glow: true }));
    out.push(ell([hx + sx * 4.2, hy + 2.2, hz + 9.6], [0.9, 0.9, 0.6], '#ffffff', { glow: true }));
    out.push(ell([hx + sx * 4.6, hy + 4.4, hz + 7.4], [3.6, 1.3, 2], '#4a0806', { roll: sx * 0.35 }));
    const open = atk === 1 ? 10 : atk === 0 ? 7 : 5;
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
  const lid = atk === 0 ? 7 : atk === 1 ? 13 : pose.kind === 'pain' ? 9 : 2.5;
  const by = 36 + bob;
  const ribbon = (l: V3) => (Math.abs(l[0]) < 2.6 || Math.abs(l[2]) < 2.6 ? (Math.abs(l[0]) < 0.9 || Math.abs(l[2]) < 0.9 ? '#fff0a0' : '#e8c020') : null);
  for (let k = 0; k < 3; k++) {
    const z = (k - 1) * 7;
    for (const sx of [-1, 1]) {
      const swing = Math.sin(ph + k * 2.1 + (sx > 0 ? Math.PI : 0)) * 4;
      const up = Math.max(0, swing) * 0.8;
      const hip: V3 = [sx * 11, by - 4, z];
      const knee: V3 = [sx * 18, by + 7, z * 1.3 + swing * 0.5];
      const foot: V3 = [sx * 15, 1.5 + up, z * 1.7 + swing];
      limb(out, hip, knee, 1.9, '#6a508a');
      limb(out, knee, foot, 1.6, '#7a609a');
      out.push(ell(knee, [2.6, 2.6, 2.6], '#7a5aa0'));
      out.push(ell(foot, [2.2, 1.4, 2.4], '#2a2036'));
    }
  }
  out.push(box([0, by, 0], [12.5, 9.5, 10.5], '#c070ff', { decal: ribbon }));
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
  out.push(box([0, ly, 0], [14, 2.5, 12], '#d890ff', { decal: ribbon, pitch: atk === 1 ? -0.25 : 0 }));
  for (const sx of [-1, 1]) out.push(ell([sx * 4.8, ly + 5, 0], [5, 3.4, 2.4], '#f0d030', { roll: sx * 0.5 }));
  out.push(ell([0, ly + 3.6, 0], [2.4, 2.2, 2.4], '#c89a10'));
  out.push(box([9, by - 1, 11.2], [3.6, 2.6, 0.5], '#f4ecd8', { decal: (l) => (Math.abs(l[1]) < 0.8 && Math.abs(l[0]) < 2.6 ? '#c01818' : null), roll: 0.2 }));
  return out;
};

/** Ransomware: a hulking padlock brute with chained fists and a keyhole maw. */
const ransomModel: Model = (pose) => {
  const out: Prim[] = [];
  const ph = walkPhase(pose);
  const atk = pose.kind === 'attack' ? pose.k : -1;
  const pain = pose.kind === 'pain';
  const bob = pose.kind === 'walk' ? Math.abs(Math.sin(ph)) * 1.5 : 0;
  for (const sx of [-1, 1]) {
    const sw = pose.kind === 'walk' ? Math.sin(ph) * 5 * sx : 0;
    out.push(box([sx * 7, 10 + Math.max(0, -sw) * 0.4, sw], [4.5, 9.5, 5], '#5a3a1a'));
    out.push(box([sx * 7, 2, sw + 1.5], [5.5, 2, 6.5], '#2a1808'));
  }
  const body = 33 + bob;
  out.push(box([0, body, 0], [15, 13, 10], '#d8740c', {
    roll: pain ? 0.14 : 0,
    decal: (l) => (Math.abs(((l[1] + 13) % 6) - 0) < 0.8 ? '#a05408' : l[1] > 11.6 ? '#ffb040' : null),
  }));
  const mouth = atk >= 0 ? '#ff3010' : '#140600';
  out.push(ell([0, body + 1, 10.2], [3.2, 3.2, 1], mouth, { glow: atk >= 0 }));
  out.push(box([0, body - 4, 10.2], [1.7, 4.2, 1], mouth, { glow: atk >= 0 }));
  out.push(ell([0, body + 1, 11.2], [1.25, 1.25, 0.35], '#100804'));
  out.push(box([0, body - 2.5, 11.2], [0.8, 2.4, 0.35], '#100804'));
  for (const sx of [-1, 1]) {
    out.push(ell([sx * 7, body + 7, 10.3], [3, 2.3, 1], pain ? '#ffffff' : '#ff2010', { glow: true }));
    out.push(box([sx * 7, body + 10.2, 10.6], [4.2, 1, 1], '#3a1802', { roll: sx * (pain ? -0.3 : 0.35) }));
  }
  const open = atk === 1 ? 5 : 0;
  for (let a = 0; a <= 16; a++) {
    const t = (a / 16) * Math.PI;
    const x = Math.cos(t) * 10;
    const y = body + 13 + Math.sin(t) * 13 + (x < 0 ? open : 0);
    out.push(ell([x, y, 0], [3, 3, 3.6], a % 4 === 0 ? '#d8e0ec' : '#9aa2b0'));
  }
  for (const sx of [-1, 1]) {
    const hand: V3 = atk === 0 ? [sx * 14, body + 24, 4] : atk === 1 ? [sx * 12, body + 6, 11] : pain ? [sx * 21, body + 14, -2] : [sx * 18, body - 10 + Math.sin(ph + (sx > 0 ? Math.PI : 0)) * 2, 3];
    limb(out, [sx * 15, body + 8, 0], hand, 3.4, '#6a3a0a');
    out.push(ell(hand, [4.6, 4.6, 4.6], '#4a2808'));
    for (let k = 1; k <= 3; k++) out.push(ell([hand[0], hand[1] - 3 - k * 3.2, hand[2]], [1.4, 2, 1], '#b8c0cc', { roll: k % 2 ? 0 : 0.6 }));
  }
  return out;
};

const lazyFrames: (() => void)[] = [];

function scaleModel(prims: Prim[]): Prim[] {
  return prims.map((prim) => ({
    ...prim,
    c: [prim.c[0] * RES, prim.c[1] * RES, prim.c[2] * RES] as V3,
    r: [prim.r[0] * RES, prim.r[1] * RES, prim.r[2] * RES] as V3,
    ...(prim.decal ? { decal: (local: V3, normal: V3) => prim.decal!([local[0] / RES, local[1] / RES, local[2] / RES], normal) } : {}),
  }));
}

function makeMonster(id: string, worldH: number, model: Model): void {
  const W = TEX.monster;
  const H = TEX.monster;
  const frames: Record<string, THREE.Texture> = {};
  const poses: [string, Pose][] = [
    ['walk0', { kind: 'walk', k: 0 }],
    ['walk1', { kind: 'walk', k: 1 }],
    ['walk2', { kind: 'walk', k: 2 }],
    ['walk3', { kind: 'walk', k: 3 }],
    ['attack0', { kind: 'attack', k: 0 }],
    ['attack1', { kind: 'attack', k: 1 }],
    ['pain', { kind: 'pain' }],
  ];
  const renderPose = (pose: Pose, rotation: number, mirror = false): THREE.Texture => {
    const prims = scaleModel(model(pose));
    const raw = rasterize(W, H, prims, { view: (rotation * Math.PI) / 4, ...(pose.kind === 'pain' ? { tint: [255, 120, 80] as V3, tintT: 0.2 } : {}) });
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
    return packTexture(W, H, raw, { sprite: true, mirror });
  };
  const defineLazy = (key: string, build: () => THREE.Texture) => {
    const getter = () => {
      const tex = build();
      Object.defineProperty(frames, key, { configurable: true, enumerable: true, value: tex });
      return tex;
    };
    Object.defineProperty(frames, key, { configurable: true, enumerable: true, get: getter });
    lazyFrames.push(() => { void frames[key]; });
  };
  // Keep all eight walk0 views ready so newly encountered threats face correctly immediately.
  for (let r = 0; r <= 4; r++) {
    frames[`walk0_${r}`] = renderPose(poses[0][1], r);
    if (r >= 1 && r <= 3) frames[`walk0_${8 - r}`] = renderPose(poses[0][1], r, true);
  }
  frames.walk0 = frames.walk0_0;
  for (const [key, pose] of poses.slice(1)) {
    for (let r = 0; r <= 4; r++) {
      defineLazy(`${key}_${r}`, () => renderPose(pose, r));
      if (r >= 1 && r <= 3) defineLazy(`${key}_${8 - r}`, () => renderPose(pose, r, true));
    }
    defineLazy(key, () => frames[`${key}_0`]);
  }
  defineLazy('attack', () => frames.attack1);
  const base = model({ kind: 'pain' });
  for (let k = 0; k < 5; k++) {
    const sq = 1 - k * 0.19;
    const prims = scaleModel(base.map((p) => ({
      ...p,
      c: [p.c[0] * (1 + k * 0.14), p.c[1] * sq + k * 0.6, p.c[2] * (1 + k * 0.1)] as V3,
      r: [p.r[0], p.r[1] * (1 - k * 0.1), p.r[2]] as V3,
    })));
    defineLazy(`die${k}`, () => {
      const raw = rasterize(W, H, prims, { view: 0, tint: [44, 255, 90], tintT: 0.12 + k * 0.14 });
      return k === 0 ? packTexture(W, H, raw, { sprite: true }) : dissolveFrame(W, H, raw, k - 1, id);
    });
  }
  spriteSets.register(id, { w: worldH, h: worldH, frames, anim: 'monster' });
  spriteRegistry.register(id, frames.walk0);
}

export function prewarmLazySpriteFrames(onComplete?: (ms: number) => void): void {
  let index = 0;
  const start = performance.now();
  const runSlice = (deadline?: { didTimeout?: boolean; timeRemaining: () => number }) => {
    const sliceStart = performance.now();
    while (index < lazyFrames.length && performance.now() - sliceStart < 8 && (!deadline || deadline.didTimeout || deadline.timeRemaining() > 1)) {
      lazyFrames[index++]();
    }
    if (index < lazyFrames.length) {
      const idleWindow = window as Window & {
        requestIdleCallback?: (cb: (d: { didTimeout?: boolean; timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
      };
      if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(runSlice, { timeout: 50 });
      else window.setTimeout(() => runSlice(), 0);
    } else onComplete?.(performance.now() - start);
  };
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: (d: { didTimeout?: boolean; timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(runSlice, { timeout: 50 });
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

export function buildSprites(): void {
  if (spriteSets.ids().length > 0) return;

  makeMonster('worm', 0.95, wormModel);
  makeMonster('trojan', 1.05, trojanModel);
  makeMonster('ransomware', 1.15, ransomModel);

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

  makeSet('usb', 32, 32, 0.52, 'static', [{
    key: 'idle',
    draw: (p) => {
      const { g } = p;
      pxEllipse(g, 16, 28, 11, 2, 'rgba(0,0,0,0.0)');
      g.fillStyle = '#9aa2b0';
      g.fillRect(9, 17, 6, 6);
      g.fillStyle = '#2a2e38';
      g.fillRect(10, 19, 1, 1);
      g.fillRect(13, 19, 1, 1);
      g.fillStyle = '#c81e14';
      g.fillRect(15, 15, 14, 10);
      g.fillStyle = '#ff6a4a';
      g.fillRect(15, 15, 14, 2);
      lit(p, '#ffe040', 25, 19, 2, 2);
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
  makeSet('fx-payload', 20, 20, 0.32, 'flicker', [0, 1].map((f) => ({
    key: `f${f}`,
    draw: (p: PaintCtx) => {
      const { g } = p;
      g.fillStyle = '#241216';
      g.fillRect(6, 1, 8, 18);
      g.fillRect(3, 5, 14, 10);
      g.fillStyle = '#a82319';
      g.fillRect(7, 2, 6, 16);
      g.fillRect(4, 6, 12, 8);
      lit(p, f ? '#ff9a24' : '#ff5522', 7, 4, 6, 12);
      lit(p, f ? '#ffe06a' : '#ffb13b', 8, 7, 4, 6);
      lit(p, '#fff2c0', 9, 8 + f, 2, 3);
      p.glow.fillStyle = '#fff';
      p.glow.fillRect(8, 6, 4, 8);
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
}
