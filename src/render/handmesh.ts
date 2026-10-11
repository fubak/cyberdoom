import * as THREE from 'three';
import type { Gender } from '../core/types';
import type { SkinTone } from '../tools/look';
import { ANALYSTS } from '../tools/look';
import { shade } from '../tools/pixel';
import {
  clampCurl, defaultCurl, FINGER_LEN, MCP_X, PALM_LEN,
  PHALANX, THUMB_BASE, THUMB_LEN,
  type FingerName, type Place,
} from './handrig';
import type { V3 } from './model';

/**
 * HAND MESH BAKER: builds each placed hand as a real Three.js bone hierarchy
 * (wrist → palm → MCP/PIP/DIP per finger, CMC/MCP/IP for the thumb) driven by
 * the same joint angles, limits and coupling as the rig math in handrig.ts,
 * then renders it once per pose with toon shading (key + fill + rim lights)
 * to a sprite canvas. Sphere-primitive rasterizing is gone: smooth vertex
 * normals across overlapped capsules are what kill the "beads" look.
 *
 * Post-pass on the baked pixels adds the Doom-sprite readability layer:
 * a 1px dark outline (alpha-dilated) plus dark seams down the gaps between
 * adjacent fingers so every digit reads at 1x.
 *
 * WebGL only runs in the browser — `meshAvailable()` is false under vitest /
 * vite-node, where bakeRig() falls back to the prim raster (tests keep
 * exercising the pure rig math, which is identical either way).
 */

const D2R = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// —— materials ————————————————————————————————————————————————————————————

let gradient: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    // 5 toon steps; NearestFilter gives the banded retro ramp
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

// —— geometry helpers (created per bake, disposed after readback) ——————————

type Geo = THREE.BufferGeometry;
const geos: Geo[] = [];
function track<T extends Geo>(g: T): T { geos.push(g); return g; }

/** Phalanx: capsule along +y starting at y=0 (joint) extending `len`. */
function phalanx(len: number, r0: number, r1: number, col: string): THREE.Group {
  const g = new THREE.Group();
  const over = r0 * 0.55;
  const cyl = track(new THREE.CapsuleGeometry(r0, len + over, 4, 10));
  const mesh = new THREE.Mesh(cyl, toon(col));
  mesh.position.y = len / 2;
  g.add(mesh);
  if (Math.abs(r1 - r0) > 0.05) {
    // taper overlay: slight cone over the far half
    const cone = track(new THREE.CapsuleGeometry(r1, len * 0.4, 3, 8));
    const cm = new THREE.Mesh(cone, toon(col));
    cm.position.y = len * 0.8;
    cm.scale.set(1, len * 0.5 / (len * 0.4 + r1 * 2), 1);
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

/** Tapered cylinder chain between two world points (forearm / sleeve). */
function tube(a: V3, b: V3, r0: number, r1: number, col: string): THREE.Mesh {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const len = av.distanceTo(bv);
  // lerp radii across segments via LatheGeometry profile for a smooth taper
  const pts: THREE.Vector2[] = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) pts.push(new THREE.Vector2(r0 + (r1 - r0) * (i / steps), i / steps * len));
  const g = track(new THREE.LatheGeometry(pts, 12));
  const m = new THREE.Mesh(g, toon(col));
  const dir = bv.clone().sub(av).normalize();
  m.quaternion.setFromUnitVectors(Y_AXIS, dir);
  m.position.copy(av);
  // rounded caps at both ends so no open seam shows
  return m;
}

// —— hand construction ————————————————————————————————————————————————————

const HAND_ORDER: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];

export interface BuiltHand {
  group: THREE.Group;
  /** world-space finger joint chains [mcp,pip,dip,tip] for gap/tip passes. */
  joints: Record<FingerName, THREE.Vector3[]>;
}

/**
 * One placed hand as a THREE hierarchy. Bake-space coords (y up, z toward
 * viewer, 1 unit = 1 native px).
 */
export function buildHand(p: Place, spec: { gender: Gender; skin: SkinTone }): BuiltHand {
  const fem = spec.gender === 'female';
  const size = p.size;
  const palmW = size * (fem ? 0.84 : 0.95);
  const palmL = size * PALM_LEN;
  const palmT = size * (fem ? 0.24 : 0.3);
  const mx = p.mirror ? -1 : 1;
  const skin = spec.skin.base;
  const jacket = ANALYSTS[spec.gender].jacket;
  const r0 = Math.max(1.7, size * (fem ? 0.06 : 0.072));

  const wristG = new THREE.Group();
  wristG.position.set(p.wrist[0], p.wrist[1], p.wrist[2]);
  // orient(v) = Rz·Rx·Ry → euler order 'ZXY' matches rig math exactly
  wristG.rotation.set((p.pitch ?? 0) * D2R, (p.yaw ?? 0) * D2R, (p.roll ?? 0) * D2R, 'ZXY');

  // palm mass: ellipsoid core + thenar/hypothenar + knuckle ridge
  const palmG = new THREE.Group();
  wristG.add(palmG);
  palmG.add(ellipsoid([0, palmL * 0.44, 0], [palmW / 2, palmL * 0.46, palmT / 2], skin));
  palmG.add(ellipsoid(
    [THUMB_BASE[0] * palmW * mx * 0.9, palmL * 0.22, palmT * 0.18],
    [palmW * 0.24, palmL * 0.3, palmT * 0.62], skin));
  palmG.add(ellipsoid([palmW * 0.36 * mx, palmL * 0.3, 0], [palmW * 0.2, palmL * 0.3, palmT * 0.52], skin));
  palmG.add(ellipsoid([0, palmL * 0.84, 0], [palmW * 0.44, palmL * 0.14, palmT * 0.52], skin));
  // wrist ball joins palm to forearm
  palmG.add(ellipsoid([0, -size * 0.04, 0], [palmW * 0.42, size * 0.14, palmT * 0.55], skin));

  const joints = {} as Record<FingerName, THREE.Vector3[]>;

  for (const f of HAND_ORDER) {
    const cc = clampCurl(f, { ...defaultCurl(f), ...p.fingers?.[f] });
    const isThumb = f === 'thumb';
    const len = (isThumb ? THUMB_LEN : FINGER_LEN[f as keyof typeof FINGER_LEN]) * size;
    const ls = [len * PHALANX[0], len * PHALANX[1], len * PHALANX[2]];
    const tout0 = p.thumbOut ?? 1;
    const base: V3 = isThumb
      ? [
          THUMB_BASE[0] * palmW * mx * (1 + 0.25 * (1 - tout0)),
          palmL * (THUMB_BASE[1] - 0.3 * (1 - tout0)),
          THUMB_BASE[2] * palmW,
        ]
      : [MCP_X[f as keyof typeof MCP_X] * palmW * mx, palmL * 0.88, 0];
    const fr = isThumb ? r0 * 1.22 : r0;
    const radii = [fr, fr * 0.93, fr * 0.85, fr * 0.62];

    // nested joint groups; rotations come straight from the clamped angles
    const chain = new THREE.Group();
    chain.position.set(base[0], base[1], base[2]);
    const segs: { g: THREE.Group; l: number }[] = [];
    if (isThumb) {
      // thumb directions: metacarpal out/forward, then flex draws across palm.
      // thumbOut scales the viewer-facing (+z) component: at steep palms-down
      // pitches +z maps straight up on screen, so grips that must keep the
      // thumb low pass a fraction here.
      const tout = p.thumbOut ?? 1;
      const d0 = new THREE.Vector3(-0.72 * mx, 0.18 * tout - 0.12 * (1 - tout), 0.66 * tout).normalize();
      const d1 = new THREE.Vector3(
        d0.x + (cc.mcp / 60) * 0.85 * mx, d0.y - cc.mcp / 110, d0.z - (cc.mcp / 60) * 0.3 * tout).normalize();
      const d2 = new THREE.Vector3(
        d1.x + (cc.pip / 80) * 0.65 * mx, d1.y - cc.pip / 120, d1.z - (cc.pip / 80) * 0.35 * tout).normalize();
      const q0 = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d0);
      const q1 = new THREE.Quaternion().setFromUnitVectors(d0, d1);
      const q2 = new THREE.Quaternion().setFromUnitVectors(d1, d2);
      const qs = [q0, q1, q2];
      let parent = chain;
      for (let s = 0; s < 3; s++) {
        const jg = new THREE.Group();
        jg.quaternion.copy(qs[s]);
        jg.add(phalanx(ls[s], radii[s], radii[s + 1], skin));
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
      let acc = 0;
      for (let s = 0; s < 3; s++) {
        const flex = s === 0 ? cc.mcp : s === 1 ? cc.pip : cc.dip;
        const jg = new THREE.Group();
        // mcp also carries the abduction spread
        const fq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -flex * D2R);
        jg.quaternion.copy(s === 0 ? abdQ.clone().multiply(fq) : fq);
        jg.add(phalanx(ls[s], radii[s], radii[s + 1], skin));
        parent.add(jg);
        const next = new THREE.Group();
        next.position.set(0, ls[s], 0);
        jg.add(next);
        segs.push({ g: jg, l: ls[s] });
        parent = next;
        acc += flex;
      }
      void acc;
    }
    // nail on the distal segment
    const last = segs[2].g.children[segs[2].g.children.length - 1] as THREE.Group;
    const nailCol = fem ? '#c83a6a' : spec.skin.highlight;
    const nail = ellipsoid([0, ls[2] * 0.6, radii[3] * 0.5], [radii[3] * 0.55, radii[3] * 0.4, radii[3] * 0.22], nailCol);
    last.add(nail);

    palmG.add(chain);
    chain.updateWorldMatrix(true, true);
    // world joints: base + each phalanx end
    const ws: THREE.Vector3[] = [chain.getWorldPosition(new THREE.Vector3())];
    for (const s of segs) {
      const end = s.g.children[s.g.children.length - 1].getWorldPosition(new THREE.Vector3());
      ws.push(end);
    }
    joints[f] = ws;
  }

  // forearm: smooth tapered skin wrist → jacket sleeve → cuff
  if (p.arm) {
    const wristW = wristG.localToWorld(new THREE.Vector3(0, -size * 0.04, 0));
    const to = new THREE.Vector3(p.arm[0], p.arm[1], p.arm[2]);
    const dir = to.clone().sub(wristW);
    const len = dir.length();
    dir.normalize();
    const skinEnd = wristW.clone().addScaledVector(dir, len * 0.3);
    const armG = new THREE.Group();
    armG.add(tube(wristW.toArray() as V3, skinEnd.toArray() as V3, palmW * 0.42, palmW * 0.38, skin));
    armG.add(tube(skinEnd.toArray() as V3, to.toArray() as V3, palmW * 0.5, palmW * 0.74, jacket));
    const cuffC = wristW.clone().addScaledVector(dir, len * 0.3);
    armG.add(ellipsoid(cuffC.toArray() as V3,
      [palmW * 0.52, palmW * 0.47, palmW * 0.4], shade(jacket, 0.7)));
    if (spec.gender === 'male') {
      armG.add(ellipsoid(wristW.clone().addScaledVector(dir, len * 0.34).toArray() as V3,
        [palmW * 0.53, palmW * 0.48, palmW * 0.41], ANALYSTS.male.accent));
      armG.add(ellipsoid(wristW.clone().addScaledVector(dir, len * 0.37).toArray() as V3,
        [palmW * 0.54, palmW * 0.49, palmW * 0.42], jacket));
    } else {
      const wc = wristW.clone().addScaledVector(dir, len * 0.2);
      armG.add(ellipsoid(wc.toArray() as V3, [palmW * 0.46, palmW * 0.41, palmW * 0.32], '#14161c'));
      const wf = wristW.clone().addScaledVector(dir, len * 0.055 + len * 0.2);
      const face = new THREE.Mesh(track(new THREE.BoxGeometry(size * 0.18, size * 0.22, size * 0.06)), toon('#0b2a2a'));
      face.position.copy(wf).add(new THREE.Vector3(0, 0, palmW * 0.25));
      armG.add(face);
    }
    // arm group children are already in world coords
    wristG.parent = null;
    const root = new THREE.Group();
    root.add(armG);
    root.add(wristG);
    root.updateWorldMatrix(true, true);
    return { group: root, joints };
  }

  wristG.updateWorldMatrix(true, true);
  return { group: wristG, joints };
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
  /** projected fingertip positions (px, y down from top) for tests/debug. */
  tips: { x: number; y: number }[];
}

/**
 * Render one rig frame (all hands) to pixels. Coordinates are bake px
 * centered on the frame (x: -W/2..W/2, y: -H/2..H/2, z toward viewer).
 */
export function bakeHands(
  W: number,
  H: number,
  places: Place[],
  spec: { gender: Gender; skin: SkinTone },
  persp = 0,
): MeshBakeResult | null {
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
  // weak warm rim: silhouette lift only, never a white crescent
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
    const b = buildHand({ ...p, wrist: [p.wrist[0], p.wrist[1] - H / 2, p.wrist[2]], arm: p.arm ? [p.arm[0], p.arm[1] - H / 2, p.arm[2]] : undefined }, spec);
    built.push(b);
    scene.add(b.group);
  }
  scene.updateMatrixWorld(true);

  const rt = new THREE.WebGLRenderTarget(W, H, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  // read back sRGB-encoded bytes: ColorManagement puts material colors in
  // linear space, and without this the readback returns linear values
  // (darker/more saturated than the authored skin ramp).
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  r.setRenderTarget(rt);
  r.render(scene, cam);
  const buf = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  r.setRenderTarget(null);
  rt.dispose();

  // flip rows (GL reads bottom-up), then post-pass outline + finger seams
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    rgba.set(buf.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  }
  postPass(rgba, W, H, built, cam, spec);

  const tips: { x: number; y: number }[] = [];
  for (const b of built) {
    for (const f of HAND_ORDER) {
      const ndc = b.joints[f][3].clone().project(cam);
      tips.push({ x: ((ndc.x + 1) / 2) * W, y: ((1 - ndc.y) / 2) * H });
    }
  }

  // dispose geometries created this bake (materials/gradient persist)
  for (const g of geos) g.dispose();
  geos.length = 0;

  // release the GL context once the bake queue has been quiet for a bit —
  // we don't hold a second WebGL context during play; a later bake lazily
  // recreates the renderer.
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

/** Outline + inter-finger seams on baked pixels. */
function postPass(
  rgba: Uint8ClampedArray, W: number, H: number,
  built: BuiltHand[], cam: THREE.Camera,
  spec: { gender: Gender; skin: SkinTone },
): void {
  // finger seams ride just under the skin shadow tone so they read as
  // separations between digits, not cuts
  const SEAM = hexRgb(shade(spec.skin.shadow, 0.82));
  const px = (x: number, y: number, c: number[]) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  const opaque = (x: number, y: number) =>
    x >= 0 && x < W && y >= 0 && y < H && rgba[(y * W + x) * 4 + 3] > 16;

  // dark seams between adjacent fingers: mid-line between proximal phalanges
  const ADJ: [FingerName, FingerName][] = [['index', 'middle'], ['middle', 'ring'], ['ring', 'pinky']];
  for (const b of built) {
    for (const [fa, fb] of ADJ) {
      const ja = b.joints[fa], jb = b.joints[fb];
      // seam runs along the mid-line of the first two phalanges
      for (let s = 0; s < 2; s++) {
        const a0 = ja[s].clone().add(jb[s]).multiplyScalar(0.5).project(cam);
        const a1 = ja[s + 1].clone().add(jb[s + 1]).multiplyScalar(0.5).project(cam);
        const x0 = ((a0.x + 1) / 2) * W, y0 = ((1 - a0.y) / 2) * H;
        const x1 = ((a1.x + 1) / 2) * W, y1 = ((1 - a1.y) / 2) * H;
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
        for (let i = 0; i <= n; i++) {
          const t = 0.35 + (i / n) * 0.65; // keep the web near the knuckles
          const xi = Math.round(x0 + (x1 - x0) * t), yi = Math.round(y0 + (y1 - y0) * t);
          if (opaque(xi, yi)) px(xi, yi, SEAM);
        }
      }
    }
  }

  // 1px dark outline: transparent texels with an opaque neighbour
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

/**
 * Orthographic-projected fingertip positions of a placed hand (bake px).
 * Used by tests to prove ≥4 digits read with gaps.
 */
export function fingertipLayout(p: Place, spec: { gender: Gender; skin: SkinTone }): { x: number; y: number }[] {
  const fem = spec.gender === 'female';
  const palmW = p.size * (fem ? 0.84 : 0.95);
  const palmL = p.size * PALM_LEN;
  const mx = p.mirror ? -1 : 1;
  const size = p.size;
  const tips: { x: number; y: number }[] = [];
  for (const f of HAND_ORDER) {
    const cc = clampCurl(f, { ...defaultCurl(f), ...p.fingers?.[f] });
    // same chain math as buildHand, evaluated cheaply in 2.5D
    const isThumb = f === 'thumb';
    const len = (isThumb ? THUMB_LEN : FINGER_LEN[f as keyof typeof FINGER_LEN]) * size;
    const ls = [len * PHALANX[0], len * PHALANX[1], len * PHALANX[2]];
    const tbo = p.thumbOut ?? 1;
    const base: V3 = isThumb
      ? [
          THUMB_BASE[0] * palmW * mx * (1 + 0.25 * (1 - tbo)),
          palmL * (THUMB_BASE[1] - 0.3 * (1 - tbo)),
          THUMB_BASE[2] * palmW,
        ]
      : [MCP_X[f as keyof typeof MCP_X] * palmW * mx, palmL * 0.88, 0];
    let pt = new THREE.Vector3(...base);
    if (isThumb) {
      const tout = p.thumbOut ?? 1;
      const d0 = new THREE.Vector3(-0.72 * mx, 0.18 * tout - 0.12 * (1 - tout), 0.66 * tout).normalize();
      const d1 = new THREE.Vector3(d0.x + (cc.mcp / 60) * 0.85 * mx, d0.y - cc.mcp / 110, d0.z - (cc.mcp / 60) * 0.3 * tout).normalize();
      const d2 = new THREE.Vector3(d1.x + (cc.pip / 80) * 0.65 * mx, d1.y - cc.pip / 120, d1.z - (cc.pip / 80) * 0.35 * tout).normalize();
      pt = pt.addScaledVector(d0, ls[0]).addScaledVector(d1, ls[1]).addScaledVector(d2, ls[2]);
    } else {
      const dir = (th: number) => {
        const d = new THREE.Vector3(0, Math.cos(-th * D2R), Math.sin(-th * D2R));
        const a = cc.abd * mx * D2R;
        return new THREE.Vector3(d.x * Math.cos(a) - d.y * Math.sin(a), d.x * Math.sin(a) + d.y * Math.cos(a), d.z);
      };
      pt = pt.addScaledVector(dir(cc.mcp), ls[0])
        .addScaledVector(dir(cc.mcp + cc.pip), ls[1])
        .addScaledVector(dir(cc.mcp + cc.pip + cc.dip), ls[2]);
    }
    // apply the palm orient (match orient() Ry→Rx→Rz via euler ZXY)
    pt.applyEuler(new THREE.Euler((p.pitch ?? 0) * D2R, (p.yaw ?? 0) * D2R, (p.roll ?? 0) * D2R, 'ZXY'));
    pt.add(new THREE.Vector3(p.wrist[0], p.wrist[1], p.wrist[2]));
    tips.push({ x: pt.x, y: pt.y });
  }
  return tips;
}


