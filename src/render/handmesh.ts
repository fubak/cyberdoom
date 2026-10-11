import * as THREE from 'three';
import type { Gender } from '../core/types';
import type { SkinTone } from '../tools/look';
import { ANALYSTS } from '../tools/look';
import { shade } from '../tools/pixel';
import {
  clampCurl, defaultCurl, MCP_X, PROP, sizeForGender, THUMB_BASE, THUMB_LEN,
  thumbChain, type FingerName, type Place,
} from './handrig';
import type { V3 } from './model';

/**
 * HAND MESH BAKER: each placed hand is a real Three.js bone hierarchy driven
 * by the rig's clamped joint angles, rendered once per pose with toon
 * shading, then post-processed to the spec's 4-step skin ramp plus the
 * Doom-sprite readability layer (1px outline, 2px finger seams, rim
 * highlight, web darkening, knuckle caps, nails).
 *
 * WebGL only runs in the browser — `meshAvailable()` is false under vitest,
 * where bakeRig() falls back to the prim raster.
 */

const D2R = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// —— materials ————————————————————————————————————————————————————————————

let gradient: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([150, 195, 255, 255]);
    gradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();
function toon(col: string): THREE.MeshToonMaterial {
  let m = matCache.get(col);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: new THREE.Color(col), gradientMap: gradientMap() });
    matCache.set(col, m);
  }
  return m;
}

// —— spec §4 skin steps ————————————————————————————————————————————————————

/** HSL helpers for the 4-step ramp. */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const p = (v: number) => Math.round(Math.max(0, Math.min(255, (v + m) * 255))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** The four exact skin steps (highlight/base/shade/core) per the spec. */
export function skinSteps(tone: SkinTone): { hi: string; base: string; sh: string; core: string } {
  const [h, s, l] = hexToHsl(tone.base);
  return {
    hi: hslToHex(h, Math.max(0, s - 0.06), Math.min(1, l + 0.18)),
    base: tone.base,
    sh: hslToHex(h, Math.min(1, s + 0.06), Math.max(0, l - 0.20)),
    core: hslToHex(h + 6, Math.min(1, s + 0.10), Math.max(0, l - 0.36)),
  };
}
/** Nail colour: highlight +8 % L, +4 % hue toward pink. */
export function nailColor(tone: SkinTone): string {
  const steps = skinSteps(tone);
  const [h, s, l] = hexToHsl(steps.hi);
  return hslToHex(h + 12, Math.min(1, s + 0.04), Math.min(1, l + 0.08));
}
const seamColor = (tone: SkinTone): string => shade(skinSteps(tone).core, 0.55);

// —— geometry helpers ——————————————————————————————————————————————————————

type Geo = THREE.BufferGeometry;
const geos: Geo[] = [];
function track<T extends Geo>(g: T): T { geos.push(g); return g; }

function phalanx(len: number, r0: number, r1: number, col: string, tipCap = 1): THREE.Group {
  const g = new THREE.Group();
  const over = r0 * 0.55;
  const cyl = track(new THREE.CapsuleGeometry(r0, len + over, 4, 10));
  const mesh = new THREE.Mesh(cyl, toon(col));
  mesh.position.y = len / 2;
  g.add(mesh);
  if (Math.abs(r1 - r0) > 0.05) {
    const cone = track(new THREE.CapsuleGeometry(Math.max(0.4, r1 * tipCap), len * 0.4, 3, 8));
    const cm = new THREE.Mesh(cone, toon(col));
    cm.position.y = len * 0.8;
    cm.scale.set(1, (len * 0.5) / (len * 0.4 + r1 * 2), 1);
    g.add(cm);
  }
  return g;
}

function ellipsoid(c: V3, r: V3, col: string): THREE.Mesh {
  const g = track(new THREE.SphereGeometry(1, 14, 10));
  const m = new THREE.Mesh(g, toon(col));
  m.position.set(c[0], c[1], c[2]);
  m.scale.set(r[0], r[1], r[2]);
  return m;
}

function tube(a: V3, b: V3, r0: number, r1: number, col: string): THREE.Mesh {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const len = av.distanceTo(bv);
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -r0 * 0.9),
    new THREE.Vector2(r0 * 0.6, -r0 * 0.75),
  ];
  const steps = 5;
  for (let i = 0; i <= steps; i++) pts.push(new THREE.Vector2(r0 + (r1 - r0) * (i / steps), (i / steps) * len));
  pts.push(new THREE.Vector2(r1 * 0.6, len + r1 * 0.75), new THREE.Vector2(0.001, len + r1 * 0.9));
  const g = track(new THREE.LatheGeometry(pts, 12));
  const m = new THREE.Mesh(g, toon(col));
  const dir = bv.clone().sub(av).normalize();
  m.quaternion.setFromUnitVectors(Y_AXIS, dir);
  m.position.copy(av);
  return m;
}

// —— hand construction ————————————————————————————————————————————————————

const HAND_ORDER: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];

export interface BuiltHand {
  group: THREE.Group;
  joints: Record<FingerName, THREE.Vector3[]>;
  /** per-finger radii at each joint for seam/knuckle post-passes. */
  radii: Record<FingerName, number[]>;
  palmW: number;
  wristTop: THREE.Vector3;
}

export function buildHand(p: Place, spec: { gender: Gender; skin: SkinTone }): BuiltHand {
  const fem = spec.gender === 'female';
  const prop = PROP[spec.gender];
  const size = sizeForGender(p.size, spec.gender);
  const palmW = size * prop.palmW;
  const palmL = size * prop.palmL;
  const palmT = size * prop.palmT;
  const mx = p.mirror ? -1 : 1;
  const skin = spec.skin.base;
  const jacket = ANALYSTS[spec.gender].jacket;
  const L1x = size * (1 + prop.palmL); // hand length in bake px
  const nailCol = nailColor(spec.skin);

  const wristG = new THREE.Group();
  wristG.position.set(p.wrist[0], p.wrist[1], p.wrist[2]);
  wristG.rotation.set((p.pitch ?? 0) * D2R, (p.yaw ?? 0) * D2R, (p.roll ?? 0) * D2R, 'ZXY');

  const palmG = new THREE.Group();
  wristG.add(palmG);
  palmG.add(ellipsoid([0, palmL * 0.44, 0], [palmW / 2, palmL * 0.46, palmT / 2], skin));
  palmG.add(ellipsoid([THUMB_BASE[0] * palmW * mx * 0.9, palmL * 0.22, palmT * 0.18], [palmW * 0.24, palmL * 0.3, palmT * 0.62], skin));
  palmG.add(ellipsoid([palmW * 0.36 * mx, palmL * 0.3, 0], [palmW * 0.2, palmL * 0.3, palmT * 0.52], skin));
  palmG.add(ellipsoid([0, palmL * 0.84, 0], [palmW * 0.44, palmL * 0.14, palmT * 0.52], skin));
  palmG.add(ellipsoid([0, -size * 0.04, 0], [prop.wristD * size * 0.5, size * 0.14, palmT * 0.55], skin));

  const joints = {} as Record<FingerName, THREE.Vector3[]>;
  const radii = {} as Record<FingerName, number[]>;

  for (const f of HAND_ORDER) {
    const cc = clampCurl(f, { ...defaultCurl(f), ...p.fingers?.[f] });
    const isThumb = f === 'thumb';
    const len = (isThumb ? THUMB_LEN : prop.fingerLen[f as keyof typeof prop.fingerLen]) * size;
    const ls = [len * prop.phalanx[0], len * prop.phalanx[1], len * prop.phalanx[2]];
    const tg = isThumb ? thumbChain(palmW, palmL, mx, cc) : null;
    const base: V3 = isThumb ? tg!.base : [MCP_X[f as keyof typeof MCP_X] * palmW * mx, palmL * 0.88, 0];
    const fd = isThumb ? prop.thumbD : prop.diam[f as keyof typeof prop.diam];
    const fr = Math.max(1.7, (size * fd) / 2);
    const t3 = Math.pow(prop.taper, 1 / 3);
    const rad = [fr, fr * t3, fr * t3 * t3, Math.max(0.5, fr * prop.taper * prop.tipCap)];
    radii[f] = rad;

    const chain = new THREE.Group();
    chain.position.set(base[0], base[1], base[2]);
    const segs: { g: THREE.Group; l: number }[] = [];
    if (isThumb) {
      const { d0, d1, d2 } = tg!;
      const dv = [d0, d1, d2].map((d) => new THREE.Vector3(d[0], d[1], d[2]));
      const q0 = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dv[0]);
      const q1 = new THREE.Quaternion().setFromUnitVectors(dv[0], dv[1]);
      const q2 = new THREE.Quaternion().setFromUnitVectors(dv[1], dv[2]);
      const qs = [q0, q1, q2];
      let parent = chain;
      for (let s = 0; s < 3; s++) {
        const jg = new THREE.Group();
        jg.quaternion.copy(qs[s]);
        jg.add(phalanx(ls[s], rad[s], rad[s + 1], skin));
        parent.add(jg);
        const next = new THREE.Group();
        next.position.set(0, ls[s], 0);
        jg.add(next);
        segs.push({ g: jg, l: ls[s] });
        parent = next;
      }
    } else {
      const abdQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), cc.abd * mx * D2R);
      let parent = chain;
      for (let s = 0; s < 3; s++) {
        const flex = s === 0 ? cc.mcp : s === 1 ? cc.pip : cc.dip;
        const jg = new THREE.Group();
        const fq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -flex * D2R);
        jg.quaternion.copy(s === 0 ? abdQ.clone().multiply(fq) : fq);
        jg.add(phalanx(ls[s], rad[s], rad[s + 1], skin, prop.tipCap));
        parent.add(jg);
        const next = new THREE.Group();
        next.position.set(0, ls[s], 0);
        jg.add(next);
        segs.push({ g: jg, l: ls[s] });
        parent = next;
      }
      // MCP knuckle bump: sphere raised above the dorsum (+z local)
      const kr = (fr * prop.knuckle.r) / 2;
      chain.add(ellipsoid([0, 0, rad[0] * 0.4 + kr * prop.knuckle.lift], [kr, kr, kr * 0.8], skin));
      // PIP bump when flexed ≥ 30
      if (cc.pip >= 30) {
        const pr = rad[1] * prop.pipBump;
        const pg = new THREE.Group();
        pg.position.set(0, ls[0], rad[1] * 0.4 + pr * 0.2);
        chain.children[0] && segs[0].g.add(pg);
        pg.add(ellipsoid([0, 0, 0], [pr, pr, pr * 0.8], skin));
      }
    }
    // nail on the distal segment — spec sizes at L=190 (scaled by L)
    const last = segs[2].g.children[segs[2].g.children.length - 1] as THREE.Group;
    const nw = (f === 'pinky' ? prop.nail.pw : prop.nail.w) * (L1x / 190);
    const nh = (f === 'pinky' ? prop.nail.ph : prop.nail.h) * (L1x / 190);
    const nail = ellipsoid([0, ls[2] * 0.62, rad[3] * 0.55], [Math.max(0.6, nw / 2), Math.max(0.6, nh / 2), Math.max(0.4, rad[3] * 0.25)], nailCol);
    last.add(nail);
    // Vega: thin ring band on the left ring finger
    if (fem && f === 'ring' && mx < 0) {
      const band = new THREE.Mesh(track(new THREE.TorusGeometry(rad[0] * 1.02, 0.6, 6, 14)), toon(shade(skin, 0.6)));
      band.rotation.x = Math.PI / 2;
      band.position.y = ls[0] * 0.4;
      segs[0].g.add(band);
    }

    palmG.add(chain);
    chain.updateWorldMatrix(true, true);
    const ws: THREE.Vector3[] = [chain.getWorldPosition(new THREE.Vector3())];
    for (const s of segs) {
      ws.push(s.g.children[s.g.children.length - 1].getWorldPosition(new THREE.Vector3()));
    }
    joints[f] = ws;
  }

  const wristTop = wristG.localToWorld(new THREE.Vector3(0, palmL * 0.55, palmT * 0.5));

  if (p.arm) {
    const wristW = wristG.localToWorld(new THREE.Vector3(0, -size * 0.04, 0));
    const to = new THREE.Vector3(p.arm[0], p.arm[1], p.arm[2]);
    const dir = to.clone().sub(wristW);
    const len = dir.length();
    dir.normalize();
    const skinEnd = wristW.clone().addScaledVector(dir, len * 0.26);
    const armG = new THREE.Group();
    const wr = prop.wristD * size * 0.5;
    armG.add(tube(wristW.toArray() as V3, skinEnd.toArray() as V3, wr, wr * 0.92, skin));
    armG.add(tube(skinEnd.toArray() as V3, to.toArray() as V3, palmW * 0.5, palmW * 0.74, jacket));
    armG.add(ellipsoid(to.toArray() as V3, [palmW * 0.8, palmW * 0.8, palmW * 0.8], jacket));
    const cuffC = wristW.clone().addScaledVector(dir, len * 0.33);
    armG.add(ellipsoid(cuffC.toArray() as V3, [palmW * 0.52, palmW * 0.47, palmW * 0.4], shade(jacket, 0.7)));
    if (spec.gender === 'male') {
      armG.add(ellipsoid(wristW.clone().addScaledVector(dir, len * 0.34).toArray() as V3, [palmW * 0.53, palmW * 0.48, palmW * 0.41], ANALYSTS.male.accent));
      armG.add(ellipsoid(wristW.clone().addScaledVector(dir, len * 0.37).toArray() as V3, [palmW * 0.54, palmW * 0.49, palmW * 0.42], jacket));
    } else {
      const wc = wristW.clone().addScaledVector(dir, len * 0.2);
      armG.add(ellipsoid(wc.toArray() as V3, [palmW * 0.46, palmW * 0.41, palmW * 0.32], '#14161c'));
      const wf = wristW.clone().addScaledVector(dir, len * 0.055 + len * 0.2);
      const face = new THREE.Mesh(track(new THREE.BoxGeometry(size * 0.18, size * 0.22, size * 0.06)), toon('#0b2a2a'));
      face.position.copy(wf).add(new THREE.Vector3(0, 0, palmW * 0.25));
      armG.add(face);
    }
    const root = new THREE.Group();
    root.add(armG);
    root.add(wristG);
    root.updateWorldMatrix(true, true);
    return { group: root, joints, radii, palmW, wristTop };
  }

  wristG.updateWorldMatrix(true, true);
  return { group: wristG, joints, radii, palmW, wristTop };
}

// —— bake to pixels ———————————————————————————————————————————————————————

let renderer: THREE.WebGLRenderer | null = null;
let glFailed = false;

export function meshAvailable(): boolean {
  if (!renderer && !glFailed) {
    try {
      const c = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({ canvas: c, antialias: false, alpha: true });
      renderer.setClearColor(0x000000, 0);
    } catch {
      renderer = null;
      glFailed = true;
    }
  }
  return !!renderer;
}

export interface MeshBakeResult {
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
  tips: { x: number; y: number }[];
}

export function bakeHands(W: number, H: number, places: Place[], spec: { gender: Gender; skin: SkinTone }, persp = 0): MeshBakeResult | null {
  if (!meshAvailable()) return null;
  const r = renderer!;
  r.setSize(W, H, false);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.7);
  key.position.set(-0.8, 2.1, 1.1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.4);
  fill.position.set(1.4, -0.5, 0.9);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc9a3, 0.3);
  rim.position.set(0.4, 0.7, -1.2);
  scene.add(rim);

  const cam = persp > 0
    ? new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / persp)), W / H, 1, 2000)
    : new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 2000);
  cam.position.set(0, 0, 500);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();

  const built: BuiltHand[] = [];
  for (const p of places) {
    const b = buildHand({ ...p, wrist: [p.wrist[0] - W / 2, p.wrist[1] - H / 2, p.wrist[2]], arm: p.arm ? [p.arm[0] - W / 2, p.arm[1] - H / 2, p.arm[2]] : undefined }, spec);
    built.push(b);
    scene.add(b.group);
  }
  scene.updateMatrixWorld(true);

  const rt = new THREE.WebGLRenderTarget(W, H, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  r.setRenderTarget(rt);
  r.render(scene, cam);
  const buf = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  r.setRenderTarget(null);
  rt.dispose();

  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) rgba.set(buf.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  postPass(rgba, W, H, built, cam, spec);

  const tips: { x: number; y: number }[] = [];
  for (const b of built) {
    for (const f of HAND_ORDER) {
      const ndc = b.joints[f][3].clone().project(cam);
      tips.push({ x: ((ndc.x + 1) / 2) * W, y: ((1 - ndc.y) / 2) * H });
    }
  }

  for (const g of geos) g.dispose();
  geos.length = 0;
  if (disposeTimer !== null) clearTimeout(disposeTimer);
  disposeTimer = setTimeout(() => {
    disposeTimer = null;
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
    }
  }, 4000);

  return { rgba, w: W, h: H, tips };
}

let disposeTimer: ReturnType<typeof setTimeout> | null = null;

const OUTLINE = [0x1c, 0x12, 0x0c];
const hexRgb = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const lum = (rgb: number[]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** Post-pass: 4-step skin remap + seams/rim/webs/knuckles/nails/outline. */
function postPass(
  rgba: Uint8ClampedArray, W: number, H: number,
  built: BuiltHand[], cam: THREE.Camera,
  spec: { gender: Gender; skin: SkinTone },
): void {
  const steps = skinSteps(spec.skin);
  const stepCols = [hexRgb(steps.core), hexRgb(steps.sh), hexRgb(steps.base), hexRgb(steps.hi)];
  const stepLums = stepCols.map(lum);
  const SEAM = hexRgb(seamColor(spec.skin));
  const CORE = stepCols[0];
  const HI = stepCols[3];
  const NAIL = hexRgb(nailColor(spec.skin));
  const skinHue = hexToHsl(spec.skin.base)[0];

  const px = (x: number, y: number, c: number[]) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  const opaque = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && rgba[(y * W + x) * 4 + 3] > 16;
  const proj = (v: THREE.Vector3) => {
    const n = v.clone().project(cam);
    return { x: ((n.x + 1) / 2) * W, y: ((1 - n.y) / 2) * H, z: n.z };
  };

  // — 4-step skin remap: quantise skin-hued pixels to the exact ramp bins.
  // Skin = warm hue near the base tone; nails/outlines excluded by colour.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (rgba[i + 3] <= 16) continue;
      const c = [rgba[i], rgba[i + 1], rgba[i + 2]];
      // skip near-nail pixels (keep the authored nail colour)
      const dn = Math.abs(c[0] - NAIL[0]) + Math.abs(c[1] - NAIL[1]) + Math.abs(c[2] - NAIL[2]);
      if (dn < 90) continue;
      const h0 = hexToHsl(`#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`)[0];
      let dh = Math.abs(h0 - skinHue) % 360;
      if (dh > 180) dh = 360 - dh;
      if (dh > 30) continue;
      const l = lum(c);
      // nearest bin by luminance
      let bi = 0, bd = 1e9;
      for (let k = 0; k < 4; k++) {
        const d = Math.abs(l - stepLums[k]);
        if (d < bd) { bd = d; bi = k; }
      }
      px(x, y, stepCols[bi]);
    }
  }

  const ADJ: [FingerName, FingerName][] = [['index', 'middle'], ['middle', 'ring'], ['ring', 'pinky']];
  const dot = (x: number, y: number, c: number[], r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (opaque(Math.round(x + dx), Math.round(y + dy))) px(Math.round(x + dx), Math.round(y + dy), c);
  };

  for (const b of built) {
    // — 2px seams along adjacent-finger boundaries + 1px rim on the nearer finger
    for (const [fa, fb] of ADJ) {
      const ja = b.joints[fa], jb = b.joints[fb];
      for (let s = 0; s < 2; s++) {
        const a0 = ja[s].clone().add(jb[s]).multiplyScalar(0.5);
        const a1 = ja[s + 1].clone().add(jb[s + 1]).multiplyScalar(0.5);
        const p0 = proj(a0), p1 = proj(a1);
        // nearer finger = higher projected z at the mid-line
        const near = ja[s].clone().project(cam).z > jb[s].clone().project(cam).z ? ja : jb;
        const ndir = proj(near[s].clone().add(near[s + 1]).multiplyScalar(0.5));
        const dxr = Math.sign(ndir.x - p0.x) || 1;
        const n = Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) * 2);
        for (let i = 0; i <= n; i++) {
          const t = 0.3 + (i / Math.max(1, n)) * 0.7;
          const xi = p0.x + (p1.x - p0.x) * t, yi = p0.y + (p1.y - p0.y) * t;
          const wid = t > 0.67 ? 0 : 1; // taper to 1px over the distal third
          dot(xi, yi, SEAM, wid);
          // 1px rim highlight on the nearer finger's side of the seam
          if (opaque(Math.round(xi + dxr * (wid + 1)), Math.round(yi))) px(Math.round(xi + dxr * (wid + 1)), Math.round(yi), HI);
        }
      }
      // web darkening: 3x3 core triangle at the MCP web
      const w0 = ja[0].clone().add(jb[0]).multiplyScalar(0.5);
      const wp = proj(w0);
      for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (opaque(Math.round(wp.x + dx), Math.round(wp.y + dy))) px(Math.round(wp.x + dx), Math.round(wp.y + dy), CORE);
      }
    }

    // — thumb/palm boundary seam (pinch-window side)
    const th = b.joints.thumb;
    const tb = proj(th[0].clone().add(th[1]).multiplyScalar(0.5));
    dot(tb.x, tb.y, SEAM, 1);

    // — knuckle caps: 1px highlight over each MCP bump + shade row below
    for (const f of ['index', 'middle', 'ring', 'pinky'] as FingerName[]) {
      const kp = proj(b.joints[f][0]);
      const kr = Math.max(1, b.radii[f][0] * 0.5);
      for (let dx = -kr; dx <= kr; dx++) {
        if (opaque(Math.round(kp.x + dx), Math.round(kp.y - 1))) px(Math.round(kp.x + dx), Math.round(kp.y - 1), HI);
        if (opaque(Math.round(kp.x + dx), Math.round(kp.y + 1))) px(Math.round(kp.x + dx), Math.round(kp.y + 1), CORE);
      }
    }

    // — contact shadow: 1px core row under each fingertip's silhouette
    for (const f of HAND_ORDER) {
      const tp = proj(b.joints[f][3]);
      for (let dy = 1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.round(tp.x + dx), y = Math.round(tp.y + dy);
          if (!opaque(x, y)) px(x, y, CORE);
        }
      }
    }

    // — male dorsal tendons: 1px lighter lines MCP→wrist when mcp ≤ 30
    if (spec.gender === 'male') {
      for (const f of ['index', 'middle'] as FingerName[]) {
        const c = b.joints[f][0];
        const wv = b.wristTop;
        const p0 = proj(c), p1 = proj(wv);
        const n = Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y));
        for (let i = 0; i <= n; i++) {
          const x = Math.round(p0.x + (p1.x - p0.x) * (i / n));
          const y = Math.round(p0.y + (p1.y - p0.y) * (i / n));
          if (opaque(x, y)) px(x, y, HI);
        }
      }
    }
  }

  // — 1px dark outline: transparent texels with an opaque neighbour
  const marks: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (rgba[i + 3] > 16) continue;
      if (opaque(x + 1, y) || opaque(x - 1, y) || opaque(x, y + 1) || opaque(x, y - 1)) marks.push(i);
    }
  }
  for (const i of marks) {
    rgba[i] = OUTLINE[0]; rgba[i + 1] = OUTLINE[1]; rgba[i + 2] = OUTLINE[2]; rgba[i + 3] = 255;
  }
}

// —— test helpers (pure math, no GL) ———————————————————————————————————————

export function jointLayout(p: Place, spec: { gender: Gender; skin: SkinTone }): Record<FingerName, { x: number; y: number }[]> {
  const prop = PROP[spec.gender];
  const size = sizeForGender(p.size, spec.gender);
  const palmW = size * prop.palmW;
  const palmL = size * prop.palmL;
  const mx = p.mirror ? -1 : 1;
  const orient = new THREE.Euler((p.pitch ?? 0) * D2R, (p.yaw ?? 0) * D2R, (p.roll ?? 0) * D2R, 'ZXY');
  const wrist = new THREE.Vector3(p.wrist[0], p.wrist[1], p.wrist[2]);
  const out = {} as Record<FingerName, { x: number; y: number }[]>;
  for (const f of HAND_ORDER) {
    const cc = clampCurl(f, { ...defaultCurl(f), ...p.fingers?.[f] });
    const isThumb = f === 'thumb';
    const len = (isThumb ? THUMB_LEN : prop.fingerLen[f as keyof typeof prop.fingerLen]) * size;
    const ls = [len * prop.phalanx[0], len * prop.phalanx[1], len * prop.phalanx[2]];
    const tg = isThumb ? thumbChain(palmW, palmL, mx, cc) : null;
    const base: V3 = isThumb ? tg!.base : [MCP_X[f as keyof typeof MCP_X] * palmW * mx, palmL * 0.88, 0];
    const chain: THREE.Vector3[] = [new THREE.Vector3(...base)];
    if (isThumb) {
      const { d0, d1, d2 } = tg!;
      const dd = [d0, d1, d2].map((d) => new THREE.Vector3(d[0], d[1], d[2]));
      chain.push(
        chain[0].clone().addScaledVector(dd[0], ls[0]),
        chain[0].clone().addScaledVector(dd[0], ls[0]).addScaledVector(dd[1], ls[1]),
        chain[0].clone().addScaledVector(dd[0], ls[0]).addScaledVector(dd[1], ls[1]).addScaledVector(dd[2], ls[2]),
      );
    } else {
      const dir = (th: number) => {
        const d = new THREE.Vector3(0, Math.cos(-th * D2R), Math.sin(-th * D2R));
        const a = cc.abd * mx * D2R;
        return new THREE.Vector3(d.x * Math.cos(a) - d.y * Math.sin(a), d.x * Math.sin(a) + d.y * Math.cos(a), d.z);
      };
      const j1 = chain[0].clone().addScaledVector(dir(cc.mcp), ls[0]);
      const j2 = j1.clone().addScaledVector(dir(cc.mcp + cc.pip), ls[1]);
      const tip = j2.clone().addScaledVector(dir(cc.mcp + cc.pip + cc.dip), ls[2]);
      chain.push(j1, j2, tip);
    }
    out[f] = chain.map((pt) => {
      const q = pt.clone().applyEuler(orient).add(wrist);
      return { x: q.x, y: q.y };
    });
  }
  return out;
}

export function fingertipLayout(p: Place, spec: { gender: Gender; skin: SkinTone }): { x: number; y: number }[] {
  const j = jointLayout(p, spec);
  return HAND_ORDER.map((f) => j[f][3]);
}
