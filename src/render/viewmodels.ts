import type { Gender, ToolDef, ViewmodelAnim } from '../core/types';
import { fireFlash, fireLamp, hash, usePhase, vmLine } from '../tools/anim';
import { currentSkin, type SkinTone } from '../tools/look';
import { handLook } from '../tools/shared';
import { shade } from '../tools/pixel';
import { outlineNative, painter, type Painter } from './hires';
import { RES } from './res';
import { bakeRig } from './handrig';
import { handCycleFrame, idleFrame, cycleVariants } from './handcycles';
import { breath } from './vmotion';
import { TOOL_HANDS } from './handposes';

/**
 * LOOK: Doom-style first-person tool viewmodels. Each tool is pixel-painted
 * once per (tool, gender, pose) into an offscreen canvas at native (RES x)
 * resolution with a dark outline, then blitted every frame with walk bob and use-recoil.
 * The USB scanner gets a fullbright muzzle flash when it fires.
 */
type Px = (c: string, x: number, y: number, w?: number, h?: number) => void;
interface Art {
  c: HTMLCanvasElement;
  /** anchor: x is centre, y is the canvas bottom */
  ox: number;
  /** first opaque row (after the outline pass), base units */
  top: number;
  /** last opaque row + 1 (after the outline pass), base units */
  bot: number;
}

const cache = new Map<string, Art>();
const dimmedCache = new WeakMap<Art, Map<number, Art>>();

/** Overall on-screen size of the bespoke viewmodels (1 = native 1:1 pixels). */
export const VIEWMODEL_SCALE = 1;

/** External hand-motion inputs written by main.ts each frame (§5.5/§5.6). */
export const handMods = { roll: 0, bobPitch: 0, seed: 1, still: false };

function paint(w: number, h: number, ox: number, fn: (px: Px, P: Painter) => void): Art {
  const P = painter(w, h);
  const px: Px = (col, x, y, ww = 1, hh = 1) => P.rect(x, y, ww, hh, col);
  fn(px, P);
  const top = outlineNative(P.g, P.c.width, P.c.height, 2);
  return { c: P.c, ox, top: top / RES, bot: opaqueBottom(P.g, P.c.width, P.c.height) / RES };
}

type VmHandArt = {
  gender: Gender;
  jacket: string;
  accent: string;
  ramp: [string, string, string, string];
  seam: string;
};

type VmSleeveDraw = {
  shape: (color: string, points: [number, number][]) => void;
  seamLine: (points: [number, number][]) => void;
  ell: (color: string, x: number, y: number, rx: number, ry: number) => void;
};

function vmHandArt(gender: Gender, skin: SkinTone): VmHandArt {
  const look = handLook(gender);
  return {
    gender,
    jacket: look.jacket,
    accent: look.accent,
    ramp: [shade(skin.shadow, 0.65), skin.shadow, skin.base, skin.highlight],
    seam: '#30201b',
  };
}

function paintVmJacketSleeve(look: VmHandArt, draw: VmSleeveDraw): void {
  const { shape, seamLine, ell } = draw;
  const jacketShade = shade(look.jacket, 0.64);
  const jacketLight = shade(look.jacket, 1.22);
  shape(jacketShade, [[67, 67], [84, 65], [84, 88], [67, 88], [63, 82], [63, 75]]);
  shape(look.jacket, [[70, 69], [84, 68], [84, 88], [71, 88], [67, 82], [66, 76]]);
  shape(jacketLight, [[70, 70], [73, 70], [75, 84], [72, 84]]);
  seamLine([[69, 72], [75, 79], [80, 88]]);
  shape(jacketShade, [[67, 71], [84, 70], [84, 76], [68, 77], [65, 74]]);
  shape(look.accent, [[67, 73], [84, 72], [84, 74], [68, 75], [66, 74]]);
  if (look.gender === 'female') {
    shape('#20242c', [[66, 69], [72, 69], [73, 73], [67, 74]]);
    shape('#0b2a2a', [[67, 70], [71, 70], [72, 72], [68, 73]]);
    ell(look.accent, 69, 71, 1.2, 0.8);
  }
}

/** One past the lowest opaque row (native px). */
function opaqueBottom(g: CanvasRenderingContext2D, w: number, h: number): number {
  const d = g.getImageData(0, 0, w, h).data;
  for (let y = h - 1; y >= 0; y--)
    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 0) return y + 1;
  return h;
}

/**
 * Fire-frame lighting on the ART: clone the painted canvas and push every
 * opaque pixel toward the tool's TOOL_FLASH colour, the way Doom's weapon
 * sprite catches its own muzzle flash. Outline pixels light up too.
 */
function tintFlash(a: Art, rgb: string): Art {
  const c = document.createElement('canvas');
  c.width = a.c.width;
  c.height = a.c.height;
  const g = c.getContext('2d')!;
  g.drawImage(a.c, 0, 0);
  const [r, gg, b] = rgb.split(',').map(Number);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = Math.min(255, d[i] * 0.45 + r * 0.55 + 24);
    d[i + 1] = Math.min(255, d[i + 1] * 0.45 + gg * 0.55 + 24);
    d[i + 2] = Math.min(255, d[i + 2] * 0.45 + b * 0.55 + 24);
  }
  g.putImageData(img, 0, 0);
  return { c, ox: a.ox, top: a.top, bot: a.bot };
}

function dimArt(a: Art, light: number): Art {
  let variants = dimmedCache.get(a);
  if (!variants) {
    variants = new Map();
    dimmedCache.set(a, variants);
  }
  const cached = variants.get(light);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = a.c.width;
  c.height = a.c.height;
  const g = c.getContext('2d')!;
  g.drawImage(a.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(0,0,0,${1 - light})`;
  g.fillRect(0, 0, c.width, c.height);
  variants.set(light, { ...a, c });
  return variants.get(light)!;
}

export type KeyboardFrame = 'rest' | 'raise' | 'swing' | 'contact' | 'recover';

export function keyboardFrameForUse(sinceUse: number, windup: number): KeyboardFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return 'raise';
  if (phase.phase === 'impact') return phase.u < 0.4 ? 'swing' : 'contact';
  if (phase.phase === 'recover') return 'recover';
  return 'rest';
}

export type MouseFrame = 'rest' | 'press' | 'click' | 'release';

export function mouseFrameForUse(sinceUse: number, windup: number): MouseFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return 'press';
  if (phase.phase === 'impact') return 'click';
  if (phase.phase === 'recover') return phase.u < 0.5 ? 'release' : 'rest';
  return 'rest';
}

function keyboardArt(frame: KeyboardFrame, gender: Gender, skin: SkinTone): Art {
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const poses: Record<KeyboardFrame, [number, number, number, number]> = {
    rest: [1, 1, 0, 0],
    raise: [1.05, 1.06, 0.025, 1.2],
    swing: [0.88, 0.9, -0.012, -1.3],
    contact: [0.88, 0.9, -0.012, -1.3],
    recover: [0.95, 0.96, -0.005, -0.3],
  };
  const [sx, sy, shear, offsetY] = poses[frame];
  const point = (x: number, y: number): [number, number] => [
    80 + (x - 80) * sx + (y - 38) * shear,
    38 + (y - 38) * sy + offsetY,
  ];

  return paint(160, 80, 80, (_px, P) => {
    const shape = (color: string, points: [number, number][]) => P.poly(points.map(([x, y]) => point(x, y)), color);
    const line = (points: [number, number][], color: string, width = 1) =>
      P.line(points.map(([x, y]) => point(x, y)), color, width);
    const ellipse = (color: string, x: number, y: number, rx: number, ry: number) => {
      const [cx, cy] = point(x, y);
      P.ell(cx, cy, rx * sx, ry * sy, color);
    };

    const sleeveDraw = (centerX: number, direction: -1 | 1): VmSleeveDraw => {
      const sleevePoint = (x: number, y: number): [number, number] =>
        point(centerX + (x - 73.5) * 0.95 * direction, 56 + (y - 65) * 0.9);
      return {
        shape: (color, points) => P.poly(points.map(([x, y]) => sleevePoint(x, y)), color),
        seamLine: (points) => P.line(points.map(([x, y]) => sleevePoint(x, y)), look.seam),
        ell: (color, x, y, rx, ry) => {
          const [cx, cy] = sleevePoint(x, y);
          P.ell(cx, cy, rx * 0.95 * sx, ry * 0.9 * sy, color);
        },
      };
    };
    paintVmJacketSleeve(look, sleeveDraw(28, -1));
    paintVmJacketSleeve(look, sleeveDraw(132, 1));
    if (gender === 'male') {
      const sleeveEdge = (mirror: boolean, points: [number, number][]) =>
        P.line(points.map(([x, y]) => point(mirror ? 160 - x : x, y)), shade(look.jacket, 1.55), 1.2);
      const sleeveBandEdge = (mirror: boolean, points: [number, number][]) =>
        P.line(points.map(([x, y]) => point(mirror ? 160 - x : x, y)), shade(look.accent, 0.55), 1);
      const bandEdge: [number, number][] = [[126, 65], [142, 64]];
      const edge: [number, number][] = [[141, 58], [141, 78]];
      sleeveBandEdge(false, bandEdge);
      sleeveBandEdge(true, bandEdge);
      sleeveEdge(false, edge);
      sleeveEdge(true, edge);
    }

    const boardPoint = (u: number, v: number): [number, number] => {
      const y = 19 + v * 34;
      const halfWidth = 32 + v * 15;
      return point(80 + (u * 2 - 1) * halfWidth, y);
    };
    const boardShape = (color: string, points: [number, number][]) =>
      P.poly(points.map(([u, v]) => boardPoint(u, v)), color);

    // The case tapers toward the far edge and deepens toward the hands.
    shape('#111722', [[47, 18], [113, 18], [129, 59], [31, 59]]);
    shape('#303846', [[50, 19], [110, 19], [125, 55], [35, 55]]);
    shape('#1a202b', [[35, 54], [125, 54], [129, 59], [31, 59]]);
    shape('#485466', [[50, 20], [109, 20], [120, 52], [40, 52]]);
    shape('#566274', [[50, 20], [109, 20], [112, 23], [48, 23]]);
    shape('#252d3a', [[47, 23], [50, 20], [40, 52], [35, 55]]);
    shape('#343e4d', [[109, 20], [113, 18], [129, 59], [120, 52]]);
    shape('#697587', [[47, 23], [113, 21], [116, 24], [44, 26]]);
    line([[38, 55], [122, 55]], '#111722', 1.4);

    for (let row = 0; row < 4; row++) {
      const v0 = 0.1 + row * 0.16;
      const v1 = v0 + 0.105;
      const cols = row === 0 ? 11 : 12;
      const left = 0.055 + (row === 0 ? 0.012 : 0);
      const cell = (0.89 - (row === 0 ? 0.024 : 0)) / cols;
      for (let col = 0; col < cols; col++) {
        const u0 = left + col * cell + 0.006;
        const u1 = left + (col + 1) * cell - 0.006;
        let cap = (row + col) % 3 === 0 ? '#c4cbd6' : '#aab3c2';
        let top = (row + col) % 3 === 0 ? '#eef1f5' : '#d7dce5';
        if (row === 0 && col === 0) { cap = '#b6372c'; top = '#ff8060'; }
        if (row === 2 && col === cols - 1) { cap = '#b77a18'; top = '#ffd36a'; }
        if (row === 1 && (col === 4 || col === 5)) { cap = '#7d8798'; top = '#bbc4d2'; }
        boardShape('#242a35', [[u0, v0 + 0.015], [u1, v0 + 0.015], [u1, v1], [u0, v1]]);
        boardShape(cap, [[u0, v0], [u1, v0], [u1, v1 - 0.012], [u0, v1 - 0.012]]);
        boardShape(top, [[u0, v0], [u1, v0], [u1, v0 + 0.025], [u0, v0 + 0.025]]);
        boardShape('#515b6b', [[u0, v1 - 0.018], [u1, v1 - 0.018], [u1, v1 - 0.008], [u0, v1 - 0.008]]);
      }
    }
    for (const [u0, u1] of [[0.08, 0.19], [0.21, 0.32], [0.34, 0.67], [0.69, 0.8], [0.82, 0.93]]) {
      boardShape('#28303d', [[u0, 0.77], [u1, 0.77], [u1, 0.88], [u0, 0.88]]);
      boardShape(u1 - u0 > 0.25 ? '#9aa4b3' : '#697587', [[u0, 0.77], [u1, 0.77], [u1, 0.86], [u0, 0.86]]);
      boardShape('#d4dbe5', [[u0, 0.77], [u1, 0.77], [u1, 0.795], [u0, 0.795]]);
    }
    ellipse('#2ad083', 103, 23, 1.4, 0.8);
    ellipse('#ffca55', 98, 23, 1.2, 0.8);

    if (frame === 'contact') {
      const flash = `rgb(${TOOL_FLASH.keyboard})`;
      line([[68, 19], [66, 14]], '#fff0c0', 0.8);
      line([[91, 20], [94, 15]], '#fff0c0', 0.8);
      shape('#242a35', [[62, 15], [68, 14], [70, 17], [64, 18]]);
      shape(flash, [[62.5, 13], [68, 12], [69.5, 14], [63.5, 15]]);
      shape('#fff0c0', [[63, 13.3], [67.6, 12.4], [68.2, 13], [63.2, 14]]);
      shape('#242a35', [[91, 17], [97, 16], [99, 19], [93, 20]]);
      shape(flash, [[91.5, 15], [97.3, 14], [98.8, 16], [92.5, 17]]);
      shape('#fff0c0', [[92, 15.2], [96.8, 14.3], [97.4, 15], [92.2, 16]]);
    }

    const handPoint = (x: number, y: number, mirror: boolean): [number, number] =>
      point(mirror ? 160 - x : x, y);
    const handShape = (color: string, points: [number, number][], mirror: boolean) =>
      P.poly(points.map(([x, y]) => handPoint(x, y, mirror)), color);
    const handLine = (points: [number, number][], color: string, mirror: boolean, width = 1) =>
      P.line(points.map(([x, y]) => handPoint(x, y, mirror)), color, width);
    const handEllipse = (color: string, x: number, y: number, rx: number, ry: number, mirror: boolean) => {
      const [cx, cy] = handPoint(x, y, mirror);
      P.ell(cx, cy, rx * sx, ry * sy, color);
    };
    const hand = (mirror: boolean) => {
      handShape(deep, [[124, 55], [129, 55], [132, 58], [131, 61], [127, 60]], mirror);
      handEllipse(base, 127, 57.5, 1.8, 1.1, mirror);

      handShape(deep, [[131, 39], [134, 35], [141, 34], [146, 37], [149, 42], [148, 50], [145, 56], [140, 59], [134, 57], [131, 53], [129, 47]], mirror);
      handShape(shadow, [[132, 40], [135, 37], [141, 36], [145, 39], [147, 43], [146, 50], [143, 54], [139, 57], [135, 55], [132, 51], [131, 47]], mirror);
      handShape(base, [[133, 41], [136, 38], [141, 38], [144, 40], [146, 44], [145, 49], [142, 53], [139, 55], [136, 53], [133, 50], [132, 46]], mirror);
      handShape(highlight, [[134, 40], [137, 38], [141, 38], [143, 40], [140, 41], [136, 42]], mirror);
      handLine([[142, 42], [143, 46], [141, 50]], deep, mirror, 0.8);

      for (let i = 0; i < 4; i++) {
        const y = 40 + i * 4.1;
        const boardEdge = 80 + 32 + ((y - 19) / 34) * 15;
        const tipX = boardEdge - 2.2;
        handShape(deep, [
          [tipX + 1, y - 1.4], [tipX + 5, y - 1.7], [134, y - 1.8],
          [138, y - 1.1], [139, y], [137, y + 1.2], [134, y + 1.6], [tipX + 1, y + 1.2],
        ], mirror);
        handShape(base, [
          [tipX + 1, y - 0.9], [tipX + 5, y - 1.1], [134, y - 1.2],
          [137, y - 0.6], [137, y + 0.5], [134, y + 1], [tipX + 1, y + 0.8],
        ], mirror);
        handEllipse(shadow, tipX, y, 2.5, 1.7, mirror);
        handEllipse(base, tipX - 0.4, y - 0.25, 1.9, 1.2, mirror);
        handLine([[tipX - 1.1, y - 0.8], [tipX, y - 1]], highlight, mirror, 0.7);
      }
      handLine([[132, 52], [135, 54], [138, 55]], shadow, mirror, 0.9);
    };
    hand(true);
    hand(false);
  });
}

function mouseArt(frame: MouseFrame, gender: Gender, skin: SkinTone): Art {
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const buttonDown = frame === 'press' ? 1 : frame === 'click' ? 2 : 0;
  const indexTravel = frame === 'press' ? 1 : frame === 'click' ? 2 : frame === 'release' ? -2 : 0;
  return paint(120, 96, 52, (_px, P) => {
    type Pt = [number, number];
    const shape = (color: string, points: Pt[]) => P.poly(points, color);
    const line = (points: Pt[], color: string, width = 1) => P.line(points, color, width);
    const ellipse = (color: string, x: number, y: number, rx: number, ry: number) => P.ell(x, y, rx, ry, color);
    // mouse seen from behind and above: rounded front (top), wide palm hump (bottom)
    const egg = (cx: number, cy: number, rx: number, ry: number, taper = 0.22): Pt[] => {
      const pts: Pt[] = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const c = Math.cos(a);
        pts.push([cx + rx * Math.sin(a) * (1 - taper * (1 + c) * 0.5), cy - ry * c]);
      }
      return pts;
    };
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    // skin part: deep rim, shadow body, base face, inset highlight edge
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) line(lightEdge, highlight, 1.2);
    };
    const idx = (pts: Pt[]): Pt[] => pts.map(([x, y]): Pt => [x, y + (y < 38 ? indexTravel : 0)]);

    // pad shadow + cable
    line([[52, 16], [52, 13], [54, 11]], '#262b35', 2.4);
    line([[52, 16], [52, 13]], '#6d7684', 0.8);

    // shell
    shape('#3c4554', egg(52, 40, 21, 24));
    shape('#7d8899', egg(51, 39, 19, 22.5));
    shape('#2c3340', [[66, 30], [70, 40], [71, 50], [68, 58], [62, 62], [66, 52], [67, 42]]);
    shape('#b4bdc9', egg(49, 37, 14, 19));
    line([[35, 30], [34, 40], [36, 50]], '#dfe4ea', 1.2);

    // buttons (front half), split, wheel, LED
    const lb: Pt[] = [[51, 18], [51, 37], [36, 38], [36, 30], [40, 22], [45, 18]];
    shape(frame === 'click' ? '#8e99a8' : '#c6ced8', lb.map(([x, y]): Pt => [x, y + buttonDown]));
    shape('#d8dee6', [[46, 19 + buttonDown], [51, 18 + buttonDown], [51, 20 + buttonDown], [45, 21 + buttonDown]]);
    shape('#bcc5d0', [[53, 18], [58, 18], [63, 22], [66, 30], [66, 37], [53, 37]]);
    line([[52, 17], [52, 38]], '#2a303b', 1.2);
    line([[36, 38.5], [66, 38.5]], '#59626f', 0.8);
    ellipse('#1c2129', 52, 25, 2.2, 3.6);
    ellipse('#6e7989', 52, 24.5, 1, 2.4);
    ellipse('#0f4a5c', 60, 21, 1.4, 1.1);
    ellipse('#5beaff', 60, 21, 0.8, 0.6);
    if (frame === 'click') {
      ellipse('#1c7a3c', 41, 24 + buttonDown, 2.6, 1.8);
      ellipse('#9affaa', 41, 24 + buttonDown, 1.3, 0.9);
    }

    // thumb along the left wall, pointing forward
    flesh([[37, 58], [32, 54], [30, 47], [31, 41], [34, 39], [37, 43], [39, 51]], [[31, 46], [32, 41], [34, 40]]);
    // ring + pinky curled down the right wall
    flesh([[63, 44], [68, 41], [72, 44], [73, 50], [70, 53], [65, 51]], [[68, 42], [71, 44]]);
    flesh([[66, 52], [71, 50], [75, 53], [75, 59], [71, 61], [67, 58]], [[71, 51], [74, 53]]);
    // back of the hand over the palm hump; wrist runs off toward the bottom-right
    flesh(
      [[37, 45], [41, 40], [48, 38], [57, 38], [64, 40], [69, 45], [74, 54], [82, 64], [92, 76], [96, 96], [66, 96], [58, 80], [48, 70], [40, 60], [36, 52]],
      [[39, 44], [44, 40], [52, 39], [60, 39], [66, 42]],
    );
    // tendons + knuckle ridge
    line([[45, 44], [50, 56], [58, 70]], shadow, 1);
    line([[53, 43], [58, 55], [66, 70]], shadow, 1);
    line([[61, 44], [66, 55], [73, 68]], shadow, 1);
    for (const [kx, ky] of [[44, 41], [51, 40], [58, 40], [65, 43]] as Pt[]) {
      ellipse(shadow, kx, ky + 1, 2.4, 1.6);
      ellipse(highlight, kx, ky, 1.4, 0.8);
    }
    // index on the left button, middle on the right: two foreshortened segments + nail
    flesh(idx([[39, 41], [39, 33], [40, 27], [42, 23], [46, 22], [48, 25], [48, 32], [48, 41]]), idx([[40, 33], [41, 27], [43, 24]]));
    line(idx([[40, 32], [47, 32]]), shadow, 1);
    shape('#f2dccb', idx([[42, 24.5], [45, 23.5], [46.5, 26], [43, 27]]));
    flesh([[54, 41], [54, 32], [55, 26], [57, 22], [61, 21], [63, 24], [63, 31], [63, 41]], [[55, 32], [56, 26], [58, 23]]);
    line([[55, 31], [62, 31]], shadow, 1);
    shape('#f2dccb', [[57, 23.5], [60, 22.5], [61.5, 25], [58, 26]]);

    // forearm sleeve over the wrist, out of the bottom-right corner
    const sleevePoint = (x: number, y: number): Pt => [80 + (x - 73.5) * 2.1 + (y - 65) * 1.1, 70 + (y - 65) * 1.4];
    paintVmJacketSleeve(look, {
      shape: (color, points) => P.poly(points.map(([x, y]) => sleevePoint(x, y)), color),
      seamLine: (points) => P.line(points.map(([x, y]) => sleevePoint(x, y)), look.seam),
      ell: (color, x, y, rx, ry) => {
        const [cx, cy] = sleevePoint(x, y);
        P.ell(cx, cy, rx * 2.1, ry * 1.4, color);
      },
    });
  });
}

type UsbFrame = 'rest' | 'press' | 'flash' | 'recoil' | 'settle';

function usbArt(frame: UsbFrame, gender: Gender, skin: SkinTone): Art {
  const look = vmHandArt(gender, skin);
  const { ramp, seam } = look;
  const recoil = frame === 'recoil';
  return paint(84, 56, 42, (_px, P) => {
    const yScale = 48 / 88;
    const point = (x: number, y: number): [number, number] => {
      const py = 8 + y * yScale;
      if (!recoil) return [x, py];
      const angle = (4 * Math.PI) / 180;
      const dx = x - 42;
      const dy = py - 32;
      return [
        42 + Math.cos(angle) * dx - Math.sin(angle) * dy,
        32 + Math.sin(angle) * dx + Math.cos(angle) * dy - 3,
      ];
    };
    const box = (color: string, x: number, y: number, w: number, h: number) =>
      P.poly([point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)], color);
    const shape = (color: string, pts: [number, number][]) => P.poly(pts.map(([x, y]) => point(x, y)), color);
    const seamLine = (pts: [number, number][]) => P.line(pts.map(([x, y]) => point(x, y)), seam);
    const ell = (color: string, x: number, y: number, rx: number, ry: number) => {
      const [cx, cy] = point(x, y);
      P.ell(cx, cy, rx, ry * yScale, color);
    };
    const handPoint = (x: number, y: number): [number, number] => {
      const press = frame === 'press' && x < 61 && y < 54 ? 1 : 0;
      return point(x + press, y + press);
    };
    const handShape = (color: string, pts: [number, number][]) =>
      P.poly(pts.map(([x, y]) => handPoint(x, y)), color);
    const handLine = (pts: [number, number][], color: string, width = 4) =>
      P.line(pts.map(([x, y]) => handPoint(x, y)), color, width);
    const handEll = (color: string, x: number, y: number, rx: number, ry: number) => {
      const [cx, cy] = handPoint(x, y);
      P.ell(cx, cy, rx, ry * yScale, color);
    };

    paintVmJacketSleeve(look, { shape, seamLine, ell });

    for (const [x, y] of [[21, 57], [20, 61], [20, 65]] as [number, number][]) {
      ell(ramp[1], x + 0.5, y + 0.5, 3.8, 2.7);
      ell(ramp[2], x, y, 3.4, 2.3);
      ell(ramp[3], x - 0.8, y - 0.8, 1.6, 0.8);
      P.line([point(x + 0.5, y + 0.5), point(x + 2.2, y + 0.9)], seam, 3);
    }
    shape('#11151d', [[31, 4], [51, 4], [61, 49], [65, 68], [19, 68], [23, 49]]);
    shape('#657084', [[33, 5], [49, 5], [58, 47], [61, 66], [22, 66], [26, 47]]);
    if (frame === 'flash') {
      shape('#157f92', [[34, -2], [39, -2], [39, 0], [44, 0], [44, 2], [50, 2], [50, 4], [44, 4], [44, 2], [39, 2], [39, 1], [34, 1]]);
      shape('#5affff', [[31, 0], [34, 0], [34, 3], [38, 3], [38, 1], [42, 1], [42, 4], [39, 4], [39, 6], [35, 6], [35, 4], [31, 4]]);
      shape('#bff8ff', [[46, 0], [49, 0], [49, 3], [54, 3], [54, 6], [50, 6], [50, 4], [46, 4]]);
    }
    shape('#aab4c5', [[34, 6], [48, 6], [54, 34], [29, 34]]);
    shape('#454f61', [[29, 34], [54, 34], [60, 66], [24, 66]]);
    shape('#778396', [[30, 35], [53, 35], [56, 40], [28, 40]]);
    shape('#242b38', [[24, 41], [59, 41], [62, 66], [22, 66]]);
    shape('#384353', [[25, 42], [57, 42], [58, 62], [24, 62]]);
    shape('#171d27', [[22, 63], [62, 63], [65, 68], [19, 68]]);
    shape('#4a5667', [[22, 63], [62, 63], [62, 65], [22, 65]]);

    // Connector, screen, LED, and the thumb-side red trigger on the top face.
    box('#b6c1d0', 36, 1, 11, 6);
    box('#edf2f5', 36, 1, 11, 1.5);
    box('#7b8798', 44, 2, 3, 5);
    box('#141922', 38, 3, 2, 2);
    box('#141922', 42, 3, 2, 2);
    shape('#0a171b', [[32, 14], [51, 14], [54, 29], [29, 29]]);
    box(frame === 'flash' ? '#8affff' : '#2ad83a', 32, 17, 17, 1.5);
    box(frame === 'flash' ? '#5affff' : '#149d34', 32, 20, 11, 1);
    box(frame === 'flash' ? '#5affff' : '#149d34', 32, 22, 14, 1);
    box(frame === 'press' ? '#a52f22' : '#ff4a2a', 47, 41, 8, 2.5);
    box(frame === 'press' ? '#d25338' : '#ff9873', 47, 41, 8, 0.75);
    box('#285fe0', 24, 47, 37, 2.5);
    box('#8ab4ff', 24, 47, 37, 0.75);
    box(frame === 'settle' ? '#53ff72' : '#22bb48', 52, 35, 4, 1.5);

    handShape(ramp[1], [
      [48.5, 40.5], [50.2, 39.3], [52.5, 40.3], [54.4, 42.5], [55.7, 45.2],
      [57.7, 48.2], [60.1, 51.1], [63.5, 52.2], [67.2, 53.8], [69.4, 56.3],
      [71.4, 60.1], [72.4, 64.4], [75.2, 68.1], [78.6, 69], [80.3, 71],
      [80.8, 73.4], [80.2, 76.4], [78.8, 79.5], [77.5, 82.4], [74.5, 84],
      [70.5, 82.8], [68.1, 79], [64.9, 76.1], [61.8, 77.2], [57.8, 74.8],
      [54.8, 72], [52.2, 68.8], [50.8, 65.2], [49.8, 61.3], [50.3, 58],
      [52.1, 55.2], [54.8, 53.4], [57.8, 53.8], [60.2, 55.5], [62.1, 57.5],
      [61.7, 54.8], [59.4, 52.4], [57, 49.8], [54.7, 47], [52.4, 44.6],
    ]);
    handShape(ramp[2], [
      [50, 41], [51.8, 40.3], [53.4, 42.2], [54.8, 45.1], [56.5, 48],
      [59.2, 51.2], [62.8, 53], [66.5, 54.4], [68.3, 56.7], [70.2, 60.1],
      [71.3, 64], [74.4, 67.7], [78.4, 69.8], [79.2, 71.6], [79.4, 74.5],
      [78.4, 77.5], [76.9, 80.5], [74.3, 82.5], [71.2, 81.4], [68.5, 78.2],
      [65.5, 75.5], [61.5, 75.5], [57.7, 73.4],
      [54.6, 70.6], [52.6, 67.5], [51.8, 64], [51, 60.7], [51.7, 57.8],
      [54.2, 55.3], [57.1, 55.4], [59.6, 57.1], [61.2, 58.6], [60.4, 55.2],
      [58.1, 52.8], [55.7, 50], [53.7, 47], [51.8, 44.5],
    ]);

    // Thumb pad, nail, joint crease, and the knuckle ridge catch upper-left light.
    handShape(ramp[2], [[50, 41], [52, 40.3], [54, 42.7], [55, 45.3], [57, 48], [59.4, 50.6], [57.5, 51.2], [55.1, 48.7], [53, 45.6]]);
    handLine([[50, 41.3], [52, 43], [54, 46], [56, 48.1]], ramp[3], 5);
    handLine([[55.1, 47], [56.7, 49], [59.2, 51.2]], ramp[0], 4);
    handLine([[55.5, 46.6], [57.2, 48.7], [59.5, 50.8]], ramp[3], 2);
    handEll(ramp[1], 50.8, 40.5, 2.5, 1.7);
    handEll(ramp[3], 50.6, 40.2, 1.8, 1.1);

    // The back of the hand stays broad, with rounded knuckles and a tucked shadow.
    handShape(ramp[2], [[57, 54], [61, 53], [66, 54], [69, 57], [71, 61], [72, 66], [75, 69], [72, 72], [67, 71], [63, 69], [59, 68], [55, 65], [53, 61], [54, 57]]);
    handEll(ramp[2], 65, 56, 4, 3.4);
    handEll(ramp[2], 68.5, 59, 3.7, 3.2);
    handEll(ramp[2], 70.5, 63, 3.2, 3.5);
    handLine([[63, 54], [66, 55], [68.7, 57.2], [70.2, 59.5]], ramp[3], 5);
    handLine([[66.2, 56], [68.2, 57.4]], ramp[1], 3);
    handLine([[69, 58.7], [70.6, 60.2]], ramp[1], 3);
    handShape(ramp[0], [[52, 65], [57, 68], [62, 69.5], [67, 72], [66, 75], [61, 73], [57, 71], [54, 69]]);
    handShape(ramp[0], [[66, 74], [70, 76], [73, 79], [75, 82], [73, 83], [70, 81], [68, 78], [65, 78]]);
    handLine([[62, 73], [65, 75], [67, 78]], ramp[1], 4);
  });
}

export type BadgeFrame = 'rest' | 'pull' | 'swipe' | 'hold';

export function badgeFrameForUse(sinceUse: number, windup: number): BadgeFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return 'pull';
  if (phase.phase === 'impact') return 'swipe';
  if (phase.phase === 'recover') return phase.u < 0.5 ? 'hold' : 'rest';
  return 'rest';
}

function badgeArt(frame: BadgeFrame, gender: Gender, skin: SkinTone): Art {
  type Pt = [number, number];
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const pose: Record<BadgeFrame, [number, number, number]> = {
    rest: [0, 1, 0],
    pull: [5, 1.04, 2],
    swipe: [-9, 0.9, -1],
    hold: [-3, 0.97, 0],
  };
  const [deg, scale, dy] = pose[frame];
  const rot = (deg * Math.PI) / 180;
  const T = (x: number, y: number): Pt => {
    const dx = (x - 56) * scale;
    const ddy = (y - 70) * scale;
    return [56 + dx * Math.cos(rot) - ddy * Math.sin(rot), 70 + dy + dx * Math.sin(rot) + ddy * Math.cos(rot)];
  };
  return paint(112, 92, 46, (_px, P) => {
    const shape = (color: string, pts: Pt[]) => P.poly(pts.map(([x, y]) => T(x, y)), color);
    const line = (pts: Pt[], color: string, width = 1) => P.line(pts.map(([x, y]) => T(x, y)), color, width);
    const ellipse = (color: string, x: number, y: number, rx: number, ry: number) => {
      const [cx, cy] = T(x, y);
      P.ell(cx, cy, rx * scale, ry * scale, color);
    };
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) line(lightEdge, highlight, 1.2);
    };
    // card corners in perspective (near/bottom edge slightly wider)
    const C: [Pt, Pt, Pt, Pt] = [[22, 12], [66, 10], [71, 56], [19, 58]];
    const cp = (u: number, v: number): Pt => {
      const top: Pt = [C[0][0] + (C[1][0] - C[0][0]) * u, C[0][1] + (C[1][1] - C[0][1]) * u];
      const bot: Pt = [C[3][0] + (C[2][0] - C[3][0]) * u, C[3][1] + (C[2][1] - C[3][1]) * u];
      return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
    };
    const quad = (color: string, u0: number, v0: number, u1: number, v1: number) =>
      shape(color, [cp(u0, v0), cp(u1, v0), cp(u1, v1), cp(u0, v1)]);

    // lanyard strap loops from the clip back down to the wrist
    line([[44, 9], [54, 2], [74, 4], [86, 16], [92, 40], [94, 66]], '#7a120c', 3.2);
    line([[44, 9], [54, 3], [73, 5], [85, 17]], '#e0402c', 1.2);

    // back of the hand + fingers wrapping behind the card's right edge
    flesh([[66, 26], [74, 24], [80, 30], [84, 44], [90, 60], [98, 76], [102, 92], [74, 92], [70, 74], [64, 62], [62, 46]]);
    for (const [fx, fy] of [[71, 28], [73, 37], [74, 46]] as Pt[]) {
      flesh([[fx - 3, fy - 3], [fx + 3, fy - 4], [fx + 6, fy], [fx + 4, fy + 4], [fx - 2, fy + 4]], [[fx - 2, fy - 3], [fx + 3, fy - 3]]);
    }

    // card: thickness, face, header, photo, chip, text, status stripe
    shape('#5a6272', [C[0], C[1], [C[2][0] + 2, C[2][1] + 1], [C[3][0] + 1, C[3][1] + 2]]);
    shape('#eef1f6', C);
    quad('#c9cfdb', 0.9, 0, 1, 1);
    quad('#2458d8', 0, 0.06, 1, 0.22);
    quad('#8ab4ff', 0, 0.06, 1, 0.09);
    quad('#9fb4d6', 0.1, 0.3, 0.42, 0.7);
    quad(skin.base, 0.17, 0.36, 0.35, 0.56);
    quad(look.ramp[1], 0.17, 0.5, 0.35, 0.56);
    quad(gender === 'female' ? '#4a2a1c' : '#2c2018', 0.15, 0.31, 0.37, 0.39);
    if (gender === 'female') quad('#4a2a1c', 0.15, 0.36, 0.2, 0.62);
    quad(look.jacket, 0.12, 0.6, 0.4, 0.7);
    quad('#e2b84c', 0.52, 0.32, 0.74, 0.5);
    quad('#a07a20', 0.52, 0.4, 0.74, 0.42);
    quad('#a07a20', 0.62, 0.32, 0.635, 0.5);
    quad('#333a48', 0.52, 0.56, 0.86, 0.6);
    quad('#7a8296', 0.52, 0.64, 0.78, 0.68);
    quad('#ffb000', 0.04, 0.8, 0.96, 0.9);
    quad('#ffe08a', 0.04, 0.8, 0.96, 0.82);
    line([cp(0.02, 0.02), cp(0.98, 0.01)], '#ffffff', 1);
    // clip
    shape('#8a909c', [[40, 6], [48, 5], [49, 13], [41, 14]]);
    shape('#c3c8d2', [[41, 7], [47, 6], [47, 8], [41, 9]]);

    // thumb pinching the front lower-right corner
    flesh([[80, 66], [72, 60], [64, 54], [59, 50], [59, 46], [63, 45], [69, 48], [76, 53], [84, 58]], [[60, 46], [64, 45], [70, 48]]);
    shape('#f2dccb', [[60, 46.5], [63, 45.8], [64.5, 48.5], [61, 49.5]]);
    ellipse(shadow, 69, 54, 2, 1.2);

    // jacket sleeve over the wrist, out of the bottom-right corner
    const sp = (x: number, y: number): Pt => T(84 + (x - 73.5) * 2.1 + (y - 65) * 0.9, 74 + (y - 65) * 1.4);
    paintVmJacketSleeve(look, {
      shape: (color, pts) => P.poly(pts.map(([x, y]) => sp(x, y)), color),
      seamLine: (pts) => P.line(pts.map(([x, y]) => sp(x, y)), look.seam),
      ell: (color, x, y, rx, ry) => {
        const [cx, cy] = sp(x, y);
        P.ell(cx, cy, rx * 2.1 * scale, ry * 1.4 * scale, color);
      },
    });
  });
}

/** Art variant: 0 rest, 1 fire pose, 2 fire pose lit in the tool's flash colour. */
export type MfaFrame = 'rest' | 'touch' | 'glow' | 'release';

export function mfaFrameForUse(sinceUse: number, windup: number): MfaFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return 'touch';
  if (phase.phase === 'impact') return 'glow';
  if (phase.phase === 'recover') return phase.u < 0.5 ? 'release' : 'rest';
  return 'rest';
}

function mfaArt(frame: MfaFrame, gender: Gender, skin: SkinTone): Art {
  type Pt = [number, number];
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  return paint(96, 92, 44, (_px, P) => {
    const shape = (color: string, pts: Pt[]) => P.poly(pts, color);
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) P.line(lightEdge, highlight, 1.2);
    };
    // rounded finger/thumb capsule from (x0,y0) to a rounded tip at (x1,y1)
    const capsule = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): Pt[] => {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const pts: Pt[] = [[x0 + nx * r0, y0 + ny * r0]];
      for (let i = 0; i <= 6; i++) {
        const t = a + Math.PI / 2 - (Math.PI * i) / 6;
        pts.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]);
      }
      pts.push([x0 - nx * r0, y0 - ny * r0]);
      return pts;
    };

    const rrect = (x: number, y: number, w: number, h: number, r: number, color: string) =>
      shape(color, [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]]);
    // palm behind the key, wrist running out to the bottom-right
    flesh([[50, 46], [60, 44], [70, 50], [76, 62], [84, 76], [90, 92], [64, 92], [56, 78], [48, 64]]);

    // FIDO2 key, upright, connector away from the camera
    shape('#8a909c', [[37, 6], [51, 6], [52, 22], [36, 22]]);
    shape('#d6dae4', [[38, 7], [50, 7], [50, 9], [38, 9]]);
    shape('#5e6470', [[49, 9], [51, 9], [52, 22], [50, 22]]);
    shape('#22262e', [[40, 12], [43, 12], [43, 17], [40, 17]]);
    shape('#22262e', [[45, 12], [48, 12], [48, 17], [45, 17]]);
    rrect(32, 20, 25, 58, 6, '#121419');
    rrect(33, 21, 23, 56, 5, '#262a33');
    shape('#3c4250', [[35, 23], [54, 23], [54, 26], [35, 26]]);
    shape('#1a1d24', [[53, 26], [55, 26], [55, 74], [53, 74]]);
    // gold touch pad with fingerprint rings
    const lit = frame === 'glow';
    const ring = lit ? '#b8fff0' : '#f0c040';
    P.ell(44.5, 43, 7.5, 7.5, '#5a4008');
    P.ell(44.5, 43, 6.5, 6.5, lit ? '#3ac8a8' : '#b88a18');
    for (const r of [5.2, 3.4, 1.6]) {
      P.ell(44.5, 43, r, r, ring);
      P.ell(44.5, 43, r - 0.8, r - 0.8, lit ? '#3ac8a8' : '#b88a18');
    }
    // status LED + key-ring hole and ring swinging left
    P.ell(44.5, 57, 2, 1.3, lit ? '#ffffff' : '#2ad83a');
    P.ell(44.5, 70, 3, 3, '#06070a');
    P.line([[44, 70], [38, 70], [30, 73], [29, 79], [35, 82], [42, 80], [44, 72]], '#7a8296', 1.6);
    P.line([[38, 70], [31, 73]], '#e6ecf4', 1);

    // fingers wrap from behind and curl round the key's left edge
    for (const [fy, len] of [[50, 6], [57, 7], [64, 6]] as Pt[]) {
      flesh(capsule(40, fy + 1, 40 - len, fy, 3.4, 3.1), [[39, fy - 2], [34, fy - 2.5]]);
      P.ell(41 - len, fy - 1, 1.2, 0.9, highlight);
    }

    // thumb: beside the pad at rest, flat on it to touch, lifting on release
    const tip: Record<MfaFrame, Pt> = { rest: [54, 47], touch: [46.5, 44], glow: [46, 44.5], release: [53, 41] };
    const [tx, ty] = tip[frame];
    flesh(capsule(68, 64, tx, ty, 6, 4.2), [[64, 55], [tx + 2, ty - 3]]);
    P.ell(tx - 0.5, ty - 0.8, 2.2, 1.7, '#f2dccb');
    if (lit) P.line([[tx - 4, ty + 3], [tx + 3, ty + 4.5]], '#b8fff0', 1);

    // jacket sleeve over the wrist, out of the bottom-right corner
    const sp = (x: number, y: number): Pt => [78 + (x - 73.5) * 2.1 + (y - 65) * 0.9, 76 + (y - 65) * 1.4];
    paintVmJacketSleeve(look, {
      shape: (color, pts) => P.poly(pts.map(([x, y]) => sp(x, y)), color),
      seamLine: (pts) => P.line(pts.map(([x, y]) => sp(x, y)), look.seam),
      ell: (color, x, y, rx, ry) => {
        const [cx, cy] = sp(x, y);
        P.ell(cx, cy, rx * 2.1, ry * 1.4, color);
      },
    });
  });
}

export type PatchFrame = 'rest' | 'pull' | 'push' | 'redraw';

export function patchFrameForUse(sinceUse: number, windup: number): PatchFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return 'pull';
  if (phase.phase === 'impact') return 'push';
  if (phase.phase === 'recover') return phase.u < 0.5 ? 'redraw' : 'rest';
  return 'rest';
}

function patchArt(frame: PatchFrame, gender: Gender, skin: SkinTone): Art {
  type Pt = [number, number];
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const pose: Record<PatchFrame, [number, number]> = { rest: [1, 0], pull: [1.04, 2], push: [0.86, -2], redraw: [0.94, 0] };
  const [scale, dy] = pose[frame];
  const T = (x: number, y: number): Pt => [44 + (x - 44) * scale, 76 + dy + (y - 76) * scale];
  return paint(104, 92, 44, (_px, P) => {
    const shape = (color: string, pts: Pt[]) => P.poly(pts.map(([x, y]) => T(x, y)), color);
    const line = (pts: Pt[], color: string, width = 1) => P.line(pts.map(([x, y]) => T(x, y)), color, width);
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) line(lightEdge, highlight, 1.2);
    };
    const capsule = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): Pt[] => {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const pts: Pt[] = [[x0 + nx * r0, y0 + ny * r0]];
      for (let i = 0; i <= 6; i++) {
        const t = a + Math.PI / 2 - (Math.PI * i) / 6;
        pts.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]);
      }
      pts.push([x0 - nx * r0, y0 - ny * r0]);
      return pts;
    };
    // disk top face in perspective: shutter edge away from the camera
    const C: [Pt, Pt, Pt, Pt] = [[24, 12], [64, 12], [72, 60], [16, 60]];
    const cp = (u: number, v: number): Pt => {
      const top: Pt = [C[0][0] + (C[1][0] - C[0][0]) * u, C[0][1] + (C[1][1] - C[0][1]) * u];
      const bot: Pt = [C[3][0] + (C[2][0] - C[3][0]) * u, C[3][1] + (C[2][1] - C[3][1]) * u];
      return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
    };
    const quad = (color: string, u0: number, v0: number, u1: number, v1: number) =>
      shape(color, [cp(u0, v0), cp(u1, v0), cp(u1, v1), cp(u0, v1)]);

    // palm under the near edge, index finger curled beneath the disk
    flesh([[52, 54], [66, 52], [78, 60], [86, 74], [92, 92], [66, 92], [58, 78], [50, 66]]);
    flesh(capsule(64, 70, 48, 62, 4, 3.4), [[60, 64], [50, 60]]);

    // disk: thickness, body, shutter, label, write-protect tab
    shape('#0c1838', [C[0], C[1], [C[2][0], C[2][1] + 3], [C[3][0], C[3][1] + 3]]);
    shape('#1e3a8a', C);
    quad('#2c52b4', 0, 0, 0.06, 1);
    quad('#3c64cc', 0.02, 0.0, 0.98, 0.03);
    quad('#9aa0ae', 0.3, 0, 0.76, 0.36);
    quad('#d8dce6', 0.3, 0, 0.76, 0.05);
    quad('#6e7482', 0.72, 0.05, 0.76, 0.36);
    quad('#22262e', 0.58, 0.07, 0.68, 0.3);
    quad('#f0ede4', 0.12, 0.48, 0.88, 0.96);
    quad('#ff8a1a', 0.12, 0.48, 0.88, 0.58);
    quad('#ffc070', 0.12, 0.48, 0.88, 0.5);
    quad('#1e3a8a', 0.2, 0.66, 0.6, 0.71);
    quad('#7a8296', 0.2, 0.78, 0.72, 0.82);
    quad('#7a8296', 0.2, 0.87, 0.5, 0.91);
    quad('#06080e', 0.03, 0.86, 0.09, 0.95);
    if (frame === 'push') {
      quad('#ffe8b0', 0.3, 0, 0.76, 0.04);
      quad('#fff4d8', 0.12, 0.48, 0.88, 0.52);
    }

    // thumb pinching the near-right corner on top of the disk
    flesh(capsule(80, 72, 63, 52, 6, 4.2), [[74, 62], [64, 50]]);
    const [tx, ty] = T(62.5, 51.2);
    P.ell(tx, ty, 2.2 * scale, 1.7 * scale, '#f2dccb');

    // jacket sleeve over the wrist, out of the bottom-right corner
    const sp = (x: number, y: number): Pt => T(80 + (x - 73.5) * 2.1 + (y - 65) * 0.9, 77 + (y - 65) * 1.4);
    paintVmJacketSleeve(look, {
      shape: (color, pts) => P.poly(pts.map(([x, y]) => sp(x, y)), color),
      seamLine: (pts) => P.line(pts.map(([x, y]) => sp(x, y)), look.seam),
      ell: (color, x, y, rx, ry) => {
        const [cx, cy] = sp(x, y);
        P.ell(cx, cy, rx * 2.1 * scale, ry * 1.4 * scale, color);
      },
    });
  });
}

export type TapFrame = 'rest' | 'squeeze' | 'burst' | 'release';

export function tapFrameForUse(sinceUse: number, windup: number): TapFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return 'squeeze';
  if (phase.phase === 'impact') return 'burst';
  if (phase.phase === 'recover') return phase.u < 0.5 ? 'release' : 'rest';
  return 'rest';
}

/** Baked tap detail: waveform scroll step (0-2) and lit capture-buffer LEDs (0-6). */
export function tapDetail(time: number, ammo: number | null, active: boolean): string {
  const step = Math.floor(time * (active ? 12 : 4)) % 3;
  const leds = Math.max(0, Math.min(6, Math.ceil((ammo ?? 0) / 2)));
  return `${step}:${leds}`;
}

function tapArt(frame: TapFrame, gender: Gender, skin: SkinTone, detail: string): Art {
  type Pt = [number, number];
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const [step, leds] = detail.split(':').map(Number);
  return paint(124, 92, 56, (_px, P) => {
    const shape = (color: string, pts: Pt[]) => P.poly(pts, color);
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) P.line(lightEdge, highlight, 1.2);
    };
    const capsule = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): Pt[] => {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const pts: Pt[] = [[x0 + nx * r0, y0 + ny * r0]];
      for (let i = 0; i <= 6; i++) {
        const t = a + Math.PI / 2 - (Math.PI * i) / 6;
        pts.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]);
      }
      pts.push([x0 - nx * r0, y0 - ny * r0]);
      return pts;
    };
    const sleeve = (mirror: boolean, ax: number, ay: number) => {
      const sp = (x: number, y: number): Pt => {
        const sx = (x - 73.5) * 2.1 + (y - 65) * 0.9;
        return [ax + (mirror ? -sx : sx), ay + (y - 65) * 1.4];
      };
      paintVmJacketSleeve(look, {
        shape: (color, pts) => P.poly(pts.map(([x, y]) => sp(x, y)), color),
        seamLine: (pts) => P.line(pts.map(([x, y]) => sp(x, y)), look.seam),
        ell: (color, x, y, rx, ry) => {
          const [cx, cy] = sp(x, y);
          P.ell(cx, cy, rx * 2.1, ry * 1.4, color);
        },
      });
    };
    // housing front face in slight perspective
    const C: [Pt, Pt, Pt, Pt] = [[32, 24], [82, 24], [88, 58], [26, 58]];
    const cp = (u: number, v: number): Pt => {
      const top: Pt = [C[0][0] + (C[1][0] - C[0][0]) * u, C[0][1] + (C[1][1] - C[0][1]) * u];
      const bot: Pt = [C[3][0] + (C[2][0] - C[3][0]) * u, C[3][1] + (C[2][1] - C[3][1]) * u];
      return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
    };
    const quad = (color: string, u0: number, v0: number, u1: number, v1: number) =>
      shape(color, [cp(u0, v0), cp(u1, v0), cp(u1, v1), cp(u0, v1)]);

    // copper and fibre leads leaving the top ports, away from the camera
    P.line([[40, 22], [38, 17], [35, 13]], '#163f78', 3);
    P.line([[40, 22], [38, 17], [35.6, 13.6]], '#2a7bd8', 1.2);
    P.line([[74, 22], [76, 17], [79, 13]], '#7a5410', 3);
    P.line([[74, 22], [76, 17], [78.4, 13.6]], '#d8a02a', 1.2);

    // left palm under the housing, sleeve to the bottom-left
    flesh([[22, 50], [40, 52], [46, 64], [40, 78], [30, 92], [6, 92], [12, 72], [16, 58]]);
    // right palm behind the clamp, sleeve to the bottom-right
    flesh([[86, 44], [98, 40], [108, 48], [112, 64], [116, 92], [92, 92], [88, 74], [84, 58]]);

    // housing: depth, body, top bevel, ports
    shape('#1e2128', [[34, 20], [80, 20], [82, 24], [32, 24]]);
    shape('#22252c', [C[0], C[1], [C[2][0] + 1, C[2][1] + 3], [C[3][0] - 1, C[3][1] + 3]]);
    shape('#4a505e', C);
    quad('#5e6576', 0, 0, 1, 0.08);
    quad('#363b46', 0.96, 0.08, 1, 1);
    for (const u of [0.1, 0.78]) {
      quad('#14161b', u, 0, u + 0.12, 0.1);
      quad('#c0c6d0', u + 0.03, 0.02, u + 0.09, 0.06);
    }
    // capture screen: one-colour copied traffic, no verdict
    const active = frame !== 'rest';
    const bright = frame === 'burst';
    quad('#0b0d12', 0.07, 0.2, 0.93, 0.7);
    quad(bright ? '#1c5a38' : '#04170d', 0.09, 0.23, 0.91, 0.67);
    const bars = 26;
    for (let i = 0; i < bars; i++) {
      const v = hash(i + step * 7 + (active ? 31 : 0));
      const hgt = Math.max(0.03, v * (bright ? 0.4 : active ? 0.32 : 0.1));
      const u0 = 0.11 + (i / bars) * 0.78;
      quad(bright ? '#d8ffe4' : '#3dff8a', u0, 0.45 - hgt / 2, u0 + 0.78 / bars - 0.008, 0.45 + hgt / 2);
    }
    if (active) quad('#d0ffe0', 0.11 + ((step + 1) / 4) * 0.78, 0.23, 0.12 + ((step + 1) / 4) * 0.78, 0.67);
    // capture buffer LEDs
    for (let i = 0; i < 6; i++) quad(i < leds ? '#ffb000' : '#3a2a10', 0.12 + i * 0.1, 0.8, 0.19 + i * 0.1, 0.87);
    quad('#9aa2b0', 0.76, 0.79, 0.9, 0.88);

    // spring clamp on the right flank: lever drops when squeezed
    const drop = frame === 'squeeze' || frame === 'burst' ? 4 : frame === 'release' ? 1.5 : 0;
    shape('#2a2e36', [[86, 34], [96, 32], [97, 40], [87, 42]]);
    shape('#9aa2b0', [[88, 28 + drop * 0.4], [104, 24 + drop], [106, 28 + drop], [90, 33 + drop * 0.4]]);
    shape('#d6dce6', [[89, 28.5 + drop * 0.4], [104, 24.5 + drop], [104.5, 25.6 + drop], [89.5, 29.8 + drop * 0.4]]);
    shape('#6e7482', [[88, 40], [102, 42], [102, 45], [88, 44]]);

    // left fingers curl up the housing's left flank
    for (const [fy, len] of [[38, 6], [44, 7], [50, 6]] as Pt[]) {
      flesh(capsule(22, fy + 2, 22 + len, fy, 2.7, 2.4), [[21, fy], [19 + len, fy - 2]]);
      P.ell(22.5 + len, fy - 0.6, 1, 0.8, highlight);
    }
    // left thumb along the bottom-left corner
    flesh(capsule(28, 64, 36, 58, 3.6, 2.9), [[29, 61], [35, 57]]);

    // right thumb pressing the clamp lever, fingers wrapped under the jaw
    flesh(capsule(106, 44 + drop * 0.5, 97, 28 + drop * 0.8, 4, 3.1), [[103, 38], [97, 26.5 + drop * 0.8]]);
    P.ell(97, 27.6 + drop * 0.8, 1.6, 1.2, '#f2dccb');
    for (const [fy, len] of [[47, 8], [52, 8]] as Pt[]) {
      flesh(capsule(104, fy + 2, 104 - len, fy, 2.7, 2.4), [[104, fy - 1], [98, fy - 2]]);
    }

    sleeve(true, 22, 78);
    sleeve(false, 104, 78);
  });
}

export type EdrFrame = 'rest' | 'charge1' | 'charge2' | 'charge3' | 'fire' | 'lift';

export function edrFrameForUse(sinceUse: number, windup: number): EdrFrame {
  const phase = usePhase(sinceUse, windup);
  if (phase.phase === 'wind') return phase.u < 1 / 3 ? 'charge1' : phase.u < 2 / 3 ? 'charge2' : 'charge3';
  if (phase.phase === 'impact') return 'fire';
  if (phase.phase === 'recover') return phase.u < 0.5 ? 'lift' : 'rest';
  return 'rest';
}

function edrArt(frame: EdrFrame, gender: Gender, skin: SkinTone, detail: string): Art {
  type Pt = [number, number];
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const cells = Math.max(0, Math.min(4, Number(detail) || 0));
  const charge = frame === 'charge1' ? 1 : frame === 'charge2' ? 2 : frame === 'charge3' || frame === 'fire' ? 3 : 0;
  return paint(124, 92, 58, (_px, P) => {
    const shape = (color: string, pts: Pt[]) => P.poly(pts, color);
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) P.line(lightEdge, highlight, 1.2);
    };
    const capsule = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): Pt[] => {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const pts: Pt[] = [[x0 + nx * r0, y0 + ny * r0]];
      for (let i = 0; i <= 6; i++) {
        const t = a + Math.PI / 2 - (Math.PI * i) / 6;
        pts.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]);
      }
      pts.push([x0 - nx * r0, y0 - ny * r0]);
      return pts;
    };
    const sleeve = (mirror: boolean, ax: number, ay: number) => {
      const sp = (x: number, y: number): Pt => {
        const sx = (x - 73.5) * 2.1 + (y - 65) * 0.9;
        return [ax + (mirror ? -sx : sx), ay + (y - 65) * 1.4];
      };
      paintVmJacketSleeve(look, {
        shape: (color, pts) => P.poly(pts.map(([x, y]) => sp(x, y)), color),
        seamLine: (pts) => P.line(pts.map(([x, y]) => sp(x, y)), look.seam),
        ell: (color, x, y, rx, ry) => {
          const [cx, cy] = sp(x, y);
          P.ell(cx, cy, rx * 2.1, ry * 1.4, color);
        },
      });
    };
    // tablet face in perspective, landscape
    const C: [Pt, Pt, Pt, Pt] = [[30, 18], [88, 18], [94, 60], [24, 60]];
    const cp = (u: number, v: number): Pt => {
      const top: Pt = [C[0][0] + (C[1][0] - C[0][0]) * u, C[0][1] + (C[1][1] - C[0][1]) * u];
      const bot: Pt = [C[3][0] + (C[2][0] - C[3][0]) * u, C[3][1] + (C[2][1] - C[3][1]) * u];
      return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
    };
    const quad = (color: string, u0: number, v0: number, u1: number, v1: number) =>
      shape(color, [cp(u0, v0), cp(u1, v0), cp(u1, v1), cp(u0, v1)]);

    // left palm behind the bezel, right palm below the tablet
    flesh([[14, 34], [28, 30], [32, 48], [34, 66], [30, 92], [4, 92], [8, 64], [10, 46]]);
    flesh([[80, 58], [94, 56], [104, 64], [110, 78], [114, 92], [88, 92], [82, 78], [78, 68]]);

    // tablet: depth, bezel, screen
    shape('#14161c', [C[0], C[1], [C[2][0] + 1, C[2][1] + 3], [C[3][0] - 1, C[3][1] + 3]]);
    shape('#2a2e3a', C);
    quad('#3a4050', 0, 0, 1, 0.05);
    const fire = frame === 'fire';
    quad('#04080c', 0.07, 0.1, 0.93, 0.8);
    quad(fire ? '#bff8ff' : charge > 0 ? '#0a2230' : '#071018', 0.08, 0.12, 0.92, 0.78);
    // containment rings: one lights per charge step
    const [sx, sy] = cp(0.5, 0.42);
    const ringOn = fire ? '#ffffff' : '#5df2ff';
    for (let k = 3; k >= 1; k--) {
      const lit = charge >= k;
      P.ell(sx, sy, 6 + k * 4, 3.6 + k * 2.6, lit ? ringOn : '#123040');
      P.ell(sx, sy, 5 + k * 4, 2.8 + k * 2.6, fire ? '#bff8ff' : charge > 0 ? '#0a2230' : '#071018');
    }
    // shield glyph
    const sc = fire ? '#ffffff' : charge > 0 || frame === 'lift' ? '#5df2ff' : '#2f8fbf';
    shape(sc, [[sx - 6, sy - 6], [sx + 6, sy - 6], [sx + 6, sy + 1], [sx, sy + 6], [sx - 6, sy + 1]]);
    shape(fire ? '#bff8ff' : '#071018', [[sx - 4, sy - 4.5], [sx + 4, sy - 4.5], [sx + 4, sy + 0.5], [sx, sy + 4], [sx - 4, sy + 0.5]]);
    shape(sc, [[sx - 0.8, sy - 3], [sx + 0.8, sy - 3], [sx + 0.8, sy + 2], [sx - 0.8, sy + 2]]);
    // charge bar
    quad('#0f2230', 0.12, 0.7, 0.88, 0.75);
    if (charge > 0) quad(charge >= 3 ? '#ffffff' : '#5df2ff', 0.12, 0.7, 0.12 + 0.76 * (charge / 3), 0.75);
    // response cells on the bezel
    for (let i = 0; i < 4; i++) quad(i < cells ? '#5df2ff' : '#203040', 0.1 + i * 0.09, 0.85, 0.17 + i * 0.09, 0.93);
    quad('#7a8aa0', 0.72, 0.86, 0.9, 0.92);

    // left thumb on the front bezel, fingers wrapped round the left edge
    flesh(capsule(18, 58, 30, 40, 4.4, 3.4), [[20, 52], [29, 39]]);
    P.ell(30, 40, 1.6, 1.2, '#f2dccb');
    for (const [fy, len] of [[26, 5], [32, 6]] as Pt[]) {
      flesh(capsule(22, fy + 2, 22 + len, fy, 2.7, 2.4), [[23, fy], [21 + len, fy - 2]]);
    }

    // right hand: curled fingers, index reaching to the screen
    const tip: Record<EdrFrame, Pt> = {
      rest: [66, 42], charge1: [62, 38.5], charge2: [62, 38.5], charge3: [62, 38.5], fire: [62, 38.5], lift: [70, 36],
    };
    const [tx, ty] = tip[frame];
    const touching = charge > 0 || fire;
    if (!touching) P.ell(tx - 1.5, ty + 5, 2.6, 1.3, '#020406');
    else P.ell(tx, ty + 1.5, 4.2, 2.2, fire ? '#ffffff' : '#5df2ff');
    for (const [fx, fy] of [[86, 66], [90, 70], [94, 73]] as Pt[]) {
      flesh(capsule(fx + 6, fy + 4, fx - 1, fy, 3, 2.7), [[fx + 4, fy - 1], [fx - 1, fy - 2]]);
    }
    flesh(capsule(88, 62, tx, ty, 3.8, 2.8), [[85, 57], [tx + 1, ty - 2.4]]);
    P.ell(tx + 0.2, ty - 0.6, 1.5, 1.1, '#f2dccb');
    flesh(capsule(100, 74, 92, 68, 3.6, 3), [[99, 71], [92, 66]]);

    sleeve(true, 20, 80);
    sleeve(false, 100, 80);
  });
}

function firewallArt(mode: 0 | 1 | 2, gender: Gender, skin: SkinTone): Art {
  const look = vmHandArt(gender, skin);
  const [deep, shadow, base, highlight] = look.ramp;
  const flash = mode === 2;
  const kick = mode === 1 ? 5 : mode === 2 ? 2 : 0;
  return paint(124, 96, 62, (_px, P) => {
    type Pt = [number, number];
    const shape = (color: string, pts: Pt[]) => P.poly(pts, color);
    const shrink = (pts: Pt[], d: number): Pt[] => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return pts.map(([x, y]): Pt => {
        const l = Math.hypot(x - cx, y - cy) || 1;
        return [x - ((x - cx) / l) * d, y - ((y - cy) / l) * d];
      });
    };
    const flesh = (pts: Pt[], lightEdge?: Pt[]) => {
      shape(deep, pts);
      shape(shadow, shrink(pts, 1));
      shape(base, shrink(pts, 2.2));
      if (lightEdge) P.line(lightEdge, highlight, 1.2);
    };
    const capsule = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): Pt[] => {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const pts: Pt[] = [[x0 + nx * r0, y0 + ny * r0]];
      for (let i = 0; i <= 6; i++) {
        const t = a + Math.PI / 2 - (Math.PI * i) / 6;
        pts.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]);
      }
      pts.push([x0 - nx * r0, y0 - ny * r0]);
      return pts;
    };
    const sleeve = (mirror: boolean, ax: number, ay: number) => {
      const sp = (x: number, y: number): Pt => {
        const sx = (x - 73.5) * 2.1 + (y - 65) * 0.9;
        return [ax + (mirror ? -sx : sx), ay + (y - 65) * 1.4];
      };
      paintVmJacketSleeve(look, {
        shape: (color, pts) => P.poly(pts.map(([x, y]) => sp(x, y)), color),
        seamLine: (pts) => P.line(pts.map(([x, y]) => sp(x, y)), look.seam),
        ell: (color, x, y, rx, ry) => {
          const [cx, cy] = sp(x, y);
          P.ell(cx, cy, rx * 2.1, ry * 1.4, color);
        },
      });
    };

    // muzzle blast behind chassis on fire frame
    if (flash) {
      shape('#ff7018', [[28, 12], [44, 4], [62, 0], [80, 4], [96, 12], [86, 26], [38, 26]]);
      shape('#ffc848', [[38, 13], [52, 6], [62, 2], [72, 6], [86, 13], [78, 24], [46, 24]]);
      shape('#fff8d8', [[48, 15], [62, 6], [76, 15], [70, 23], [54, 23]]);
    }

    // palms behind grip rails
    flesh([[18, 48 + kick], [34, 44 + kick], [36, 68 + kick], [32, 92], [6, 92], [10, 68 + kick]]);
    flesh([[90, 44 + kick], [106, 48 + kick], [114, 68 + kick], [118, 92], [92, 92], [88, 68 + kick]]);

    // dual-rail packet-filter blaster chassis in perspective
    const k = kick;
    shape('#0e1118', [[40, 16 + k], [84, 16 + k], [96, 68 + k], [28, 68 + k]]);
    shape('#232936', [[42, 18 + k], [82, 18 + k], [92, 64 + k], [32, 64 + k]]);
    // beveled top edge highlight
    shape('#4a5468', [[42, 18 + k], [82, 18 + k], [83, 21 + k], [41, 21 + k]]);
    // left & right armored emitter rails
    shape('#343c4c', [[42, 21 + k], [56, 21 + k], [54, 54 + k], [35, 54 + k]]);
    shape('#343c4c', [[68, 21 + k], [82, 21 + k], [89, 54 + k], [70, 54 + k]]);
    shape('#525d72', [[43, 21 + k], [55, 21 + k], [55, 23 + k], [42, 23 + k]]);
    shape('#525d72', [[69, 21 + k], [81, 21 + k], [82, 23 + k], [69, 23 + k]]);
    // recessed central packet-filter channel & glowing amber core
    shape('#0a0d12', [[56, 20 + k], [68, 20 + k], [70, 58 + k], [54, 58 + k]]);
    const coreOuter = flash ? '#ffe080' : mode === 1 ? '#ff9828' : '#d86214';
    const coreInner = flash ? '#ffffff' : mode === 1 ? '#ffd870' : '#ff9c34';
    shape(coreOuter, [[58, 22 + k], [66, 22 + k], [68, 54 + k], [56, 54 + k]]);
    shape(coreInner, [[60, 23 + k], [64, 23 + k], [65, 52 + k], [59, 52 + k]]);
    // twin cooling vents along each rail
    for (let i = 0; i < 4; i++) {
      const y = 26 + i * 6 + k;
      const dx = i * 1.4;
      P.rect(42 - dx, y, 11, 2.5, '#12161f');
      P.rect(43 - dx, y + 0.5, 9, 1.4, flash ? '#fff0a0' : '#ff7820');
      P.rect(71 + dx, y, 11, 2.5, '#12161f');
      P.rect(72 + dx, y + 0.5, 9, 1.4, flash ? '#fff0a0' : '#ff7820');
    }
    // rear sight bridge & rule-engine LEDs
    shape('#191e28', [[34, 54 + k], [90, 54 + k], [92, 63 + k], [32, 63 + k]]);
    shape('#444e62', [[35, 54 + k], [89, 54 + k], [89, 56 + k], [35, 56 + k]]);
    for (let i = 0; i < 5; i++) {
      P.rect(46 + i * 7, 57 + k, 4, 3, flash ? '#ffffff' : i === 2 ? '#5df2ff' : '#ff9828');
    }

    // left hand gripping left rail: curled fingers + thumb over bevel
    for (const [fy, len] of [[42, 6], [48, 7], [54, 6]] as Pt[]) {
      flesh(capsule(24, fy + 2 + k, 28 + len, fy + k, 3.0, 2.5), [[25, fy + k], [27 + len, fy - 1.5 + k]]);
    }
    flesh(capsule(24, 64 + k, 38, 47 + k, 4.4, 3.2), [[26, 58 + k], [37, 46 + k]]);
    P.ell(38, 47 + k, 1.6, 1.2, '#f2dccb');

    // right hand gripping right rail: curled fingers + thumb over trigger switch
    for (const [fy, len] of [[42, 6], [48, 7], [54, 6]] as Pt[]) {
      flesh(capsule(100, fy + 2 + k, 96 - len, fy + k, 3.0, 2.5), [[99, fy + k], [97 - len, fy - 1.5 + k]]);
    }
    const thumbY = mode === 1 ? 49 : 47;
    flesh(capsule(100, 64 + k, 86, thumbY + k, 4.4, 3.2), [[98, 58 + k], [87, thumbY - 1 + k]]);
    P.ell(86, thumbY + k, 1.6, 1.2, '#f2dccb');

    // analyst sleeves matching chosen character
    sleeve(true, 22, 82);
    sleeve(false, 102, 82);
  });
}

function art(
  tool: ToolDef,
  gender: Gender,
  mode: 0 | 1 | 2,
  usbFrame?: UsbFrame,
  keyboardFrame?: KeyboardFrame,
  mouseFrame?: MouseFrame,
  badgeFrame?: BadgeFrame,
  mfaFrame?: MfaFrame,
  patchFrame?: PatchFrame,
  tapFrame?: TapFrame,
  detail = '',
  edrFrame?: EdrFrame,
): Art | null {
  const skin = currentSkin();
  const key = `${tool.id}:${gender}:${mode}:${usbFrame ?? ''}:${keyboardFrame ?? ''}:${mouseFrame ?? ''}:${badgeFrame ?? ''}:${mfaFrame ?? ''}:${patchFrame ?? ''}:${tapFrame ?? ''}:${detail}:${edrFrame ?? ''}:${skin.id}`;
  let a = cache.get(key);
  if (!a) {
    if (tool.id === 'usb') a = usbArt(usbFrame ?? (mode === 2 ? 'flash' : mode === 1 ? 'recoil' : 'rest'), gender, skin);
    else if (tool.id === 'keyboard') a = keyboardArt(keyboardFrame ?? (mode > 0 ? 'swing' : 'rest'), gender, skin);
    else if (tool.id === 'mouse') a = mouseArt(mouseFrame ?? 'rest', gender, skin);
    else if (tool.id === 'badge') a = badgeArt(badgeFrame ?? 'rest', gender, skin);
    else if (tool.id === 'mfa') a = mfaArt(mfaFrame ?? 'rest', gender, skin);
    else if (tool.id === 'patch') a = patchArt(patchFrame ?? 'rest', gender, skin);
    else if (tool.id === 'tap') a = tapArt(tapFrame ?? 'rest', gender, skin, detail || '0:0');
    else if (tool.id === 'edr') a = edrArt(edrFrame ?? 'rest', gender, skin, detail || '0');
    else if (tool.id === 'firewall') a = firewallArt(mode, gender, skin);
    else return null;
    if (mode === 2 && tool.id !== 'keyboard') a = tintFlash(a, TOOL_FLASH[tool.id] ?? '255,255,255');
    cache.set(key, a);
  }
  return a;
}

/**
 * Draw the current tool's viewmodel (bespoke art, or the tool's own
 * drawViewmodel) plus its fx, all under the clearance line. Always true.
 */
export function drawToolViewmodel(
  g: CanvasRenderingContext2D,
  tool: ToolDef,
  w: number,
  h: number,
  bob: number,
  gender: Gender,
  cooldownFrac: number,
  _time: number,
  anim?: ViewmodelAnim,
): boolean {
  const line = vmLine(h);
  const ph = anim ? usePhase(anim.sinceUse, tool.windup ?? 0) : null;
  // fire cycle: rest art in windup, lit art at the impact flash, fire art
  // through the rest of the strike and early recover — the lit pose holds for
  // ~77 ms of the 90 ms impact window, so >=4 rendered frames at 60 Hz
  const lit = !!ph && ph.phase === 'impact' && ph.u < 0.85;
  const fire = lit || (!!ph && (ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.25))) || (!ph && cooldownFrac > 0.55);
  const light = Math.round((anim?.light === undefined ? 1 : Math.min(1, Math.max(0.35, anim.light))) * 10) / 10;
  const usbFrame: UsbFrame | undefined = tool.id !== 'usb' || !ph ? undefined
    : ph.phase === 'wind' ? 'press'
      : ph.phase === 'impact' ? 'flash'
        : ph.phase === 'recover' ? (ph.u < 0.5 ? 'recoil' : 'settle')
          : 'rest';
  const keyboardFrame: KeyboardFrame | undefined = tool.id !== 'keyboard' ? undefined
    : ph ? keyboardFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const mouseFrame: MouseFrame | undefined = tool.id !== 'mouse' ? undefined
    : ph ? mouseFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const badgeFrame: BadgeFrame | undefined = tool.id !== 'badge' ? undefined
    : ph ? badgeFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const mfaFrame: MfaFrame | undefined = tool.id !== 'mfa' ? undefined
    : ph ? mfaFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const patchFrame: PatchFrame | undefined = tool.id !== 'patch' ? undefined
    : ph ? patchFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const tapFrame: TapFrame | undefined = tool.id !== 'tap' ? undefined
    : ph ? tapFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const edrFrame: EdrFrame | undefined = tool.id !== 'edr' ? undefined
    : ph ? edrFrameForUse(anim!.sinceUse, tool.windup ?? 0)
      : 'rest';
  const detail = tool.id === 'tap' ? tapDetail(anim?.time ?? 0, anim?.ammo ?? null, !!ph && ph.phase !== 'idle')
    : tool.id === 'edr' ? String(Math.max(0, Math.min(4, anim?.ammo ?? 0)))
      : '';
  let a = art(tool, gender, lit ? 2 : fire ? 1 : 0, usbFrame, keyboardFrame, mouseFrame, badgeFrame, mfaFrame, patchFrame, tapFrame, detail, edrFrame);
  if (a && !lit && light < 1) a = dimArt(a, light);
  // shared bob/strike/switch offsets for the art AND the rig-hand overlay
  const bx = Math.round(Math.sin(bob) * 6);
  const byy = Math.round(Math.abs(Math.cos(bob)) * 3);
  const pose = POSE[tool.id] ?? POSE.usb;
  let dx = 0;
  let dy: number;
  // the held object trails the hand: cycle move sampled 20 ms late (looser ζ)
  const _anchor0 = TOOL_HANDS[tool.id];
  const _lag = _anchor0 && anim ? handCycleFrame(tool.id, anim.sinceUse * 1000, Math.floor(_time * 0.6) % cycleVariants(tool.id))?.objMove : null;
  if (_lag && ph) {
    dx = Math.round(_lag[0]);
    dy = Math.round(_lag[1]);
  } else if (ph) {
    const k = ph.k;
    const s = k >= 0 ? pose.strike : pose.wind;
    dx = Math.round(s[0] * Math.abs(k));
    dy = Math.round(s[1] * Math.abs(k));
  } else dy = -Math.round(cooldownFrac * 5); // recoil settle rides up, not down
  const drop = Math.round((anim?.lower ?? 0) * ((a?.c.height ?? 60) + 10));
  // actual downward travel the art got after the sink cap (hands track it)
  let dyDown = byy + dy;
  if (a) {
    const side = SIDE[tool.id] ?? 0;
    const S = VIEWMODEL_SCALE * (SIZE[tool.id] ?? 1);
    // the lit frame swells ~5% toward the camera for one frame of punch
    const swell = lit ? 1.05 : 1;
    const cw = (a.c.width / RES) * S * swell;
    const ch = (a.c.height / RES) * S * swell;
    const top = a.top * S;
    const bot = a.bot * S;
    // up travel the anchor has to absorb (strike lift + lit swell growth)
    const lift = Math.max(0, -Math.min(pose.wind[1], pose.strike[1])) + (LIT_SWELL - 1) * (bot - top);
    // rest: the art's lowest painted row sits BLEED px under the bar line;
    // never raise so far that the peak clears the viewmodel line
    let y0 = h + BLEED - bot;
    y0 = Math.max(y0, line - top + Math.ceil(lift));
    // downward motion (bob + pose dips) is capped so the art's opaque bottom
    // can never dip under the bar — the tool rests on the bar, not in it
    const roomDown = h + BLEED - (y0 + bot);
    dyDown = Math.min(byy + dy, roomDown);
    g.imageSmoothingEnabled = false;
    const y = y0 + dyDown + drop - (ch - (a.c.height / RES) * S);
    g.drawImage(a.c, Math.round(w / 2 - (a.ox - side) * S + bx + dx), y, cw, ch);
    if (lit) {
      const rgb = TOOL_FLASH[tool.id];
      if (rgb) {
        // bloom is additive haze, not art: clip it below the clearance line so
        // it can never wash into the aim area
        g.save();
        g.beginPath();
        g.rect(0, line, w, h - line);
        g.clip();
        fireLamp(g, w / 2 + bx + dx, y + top + (bot - top) * 0.25, (bot - top) * 0.9, anim!.sinceUse - (tool.windup ?? 0), rgb, 0.4);
        g.restore();
      }
    }
  } else {
    tool.drawViewmodel(g, w, h, Math.sin(bob) * 2, gender, cooldownFrac, anim);
    // tools that paint their own viewmodel still get the lit fire frame: an
    // additive lamp over the tool's business end in its flash colour
    if (ph && ph.phase === 'impact') {
      const rgb = TOOL_FLASH[tool.id];
      if (rgb) {
        g.save();
        g.beginPath();
        g.rect(0, line, w, h - line);
        g.clip();
        fireLamp(g, w / 2, line + (h - line) * 0.35, (h - line) * 0.55, anim!.sinceUse - (tool.windup ?? 0), rgb, 0.45);
        g.restore();
      }
    }
  }
  // articulated rig hands over the tool: use-cycle pose + idle micro-motion,
  // tracking the lagged object offsets so the grip follows the tool
  {
    const anchor = SHOW_HANDS ? TOOL_HANDS[tool.id] : undefined;
    if (anchor) {
      const variant = Math.floor(_time * 0.6) % cycleVariants(tool.id);
      const hf = handCycleFrame(tool.id, ph ? anim!.sinceUse * 1000 : null, variant);
      if (hf) {
        const frame = hf.frame;
        const key = hf.key;
        const idleM = !handMods.still && (hf.stage === 'idle' || hf.stage === 'done') ? idleFrame(_time, handMods.seed).move : [0, 0, 0];
        const sp = bakeRig(key, frame, { gender, skin: currentSkin() });
        const sw = sp.c.width / RES;
        const sh = sp.c.height / RES;
        const [brx, bry] = breath(_time);
        // hands are an accent, not the hero: draw them smaller and sunk lower
        // toward the bar so the tool silhouette owns the centre of the view
        const hs = hf.move[2] * HAND_SCALE;
        const hx = Math.round(w / 2 + anchor.at[0] - (sw * hs) / 2 + bx + dx + hf.move[0] + brx * 0.5 + 1 + idleM[0]);
        let hy = Math.round(h - anchor.at[1] - sh * hs + dyDown + drop + hf.move[1] + bry + idleM[1] + HAND_SINK);
        // never let the hand's first opaque row cross the clearance line
        hy = Math.max(hy, Math.ceil(line - (sp.top / RES) * hs));
        // sway roll + bob pitch + idle roll applied continuously at draw:
        // rotating the canvas is free; baking per-degree variants is not
        const rot = handMods.still ? 0 : (handMods.roll + handMods.bobPitch + idleM[2]) * (Math.PI / 180);
        if (Math.abs(rot) > 1e-4 && 'rotate' in g) {
          const gg = g as CanvasRenderingContext2D;
          gg.save();
          gg.translate(hx + (sw * hs) / 2, hy + (sh * hs) / 2);
          gg.rotate(rot);
          gg.drawImage(sp.c as CanvasImageSource, (-sw * hs) / 2, (-sh * hs) / 2, sw * hs, sh * hs);
          gg.restore();
        } else {
          g.drawImage(sp.c as CanvasImageSource, hx, hy, sw * hs, sh * hs);
        }
      }
    }
  }
  if (anim && !anim.lower && tool.drawFx) {
    // tool fx live in the band under the line, so flashes and pulses never cover the aim area
    g.save();
    g.beginPath();
    g.rect(0, line, w, h - line);
    g.clip();
    tool.drawFx(g, w, h, anim);
    g.restore();
  }
  if (anim && !anim.lower) {
    // muzzle-flash equivalent: a 2-3 frame light burst bleeding in from the screen
    // edges, tinted per tool, timed to the impact window
    const rgb = TOOL_FLASH[tool.id];
    if (rgb) fireFlash(g, w, h, anim.sinceUse - (tool.windup ?? 0), rgb);
  }
  return true;
}

/** Opaque art may rest this far under the bar line (the Doom bottom-crop look). */
const BLEED = 1;
/** Rig hands off: all tools ship with painted 2D hands; 3D rig is kept as reference. */
export const SHOW_HANDS = false;
/** Rig hands render ~22% smaller than authored — grips stay readable without the hand owning the frame. */
const HAND_SCALE = 0.78;
/** Extra pixels the hand sprite sinks toward the bar line (Doom keeps hands low). */
const HAND_SINK = 4;
/** Lit-frame scale punch (art swells toward the camera at the impact flash). */
const LIT_SWELL = 1.05;

/** Per-tool viewmodel size multiplier (keyboard art runs ~25% of view width at 1). */
const SIZE: Record<string, number> = { keyboard: 1.0, mouse: 0.7, badge: 0.66, mfa: 0.62, patch: 0.64, tap: 0.6, edr: 0.6, usb: 1.0, firewall: 0.62 };

/** Muzzle-flash tint per tool (rgb for edgeFlash); also feeds the world light flood. */
export const TOOL_FLASH: Record<string, string> = {
  keyboard: '255,200,90',
  mouse: '255,230,120',
  usb: '120,240,255',
  badge: '140,255,160',
  tap: '180,110,255',
  edr: '120,220,255',
  mfa: '255,220,140',
  patch: '120,255,140',
  firewall: '255,160,60',
};

/** Per-tool [dx, dy] at full windup and at the impact frame. */
/** Horizontal nudge so each tool's visible mass sits bottom-centre. */
const SIDE: Record<string, number> = { mouse: 24, badge: 0, usb: 0 };

const POSE: Record<string, { wind: [number, number]; strike: [number, number] }> = {
  keyboard: { wind: [-3, 3], strike: [0, -14] }, // pull back a touch, slam up-forward
  mouse: { wind: [0, 2], strike: [0, -5] }, // press, then pop up
  usb: { wind: [-2, -2], strike: [4, -12] }, // anticipation lift, recoil kick up-back
  badge: { wind: [7, 3], strike: [-24, -11] }, // pull back, swipe across the reader left
  mfa: { wind: [0, 1], strike: [0, -8] }, // settle, then seat up into the reader
  patch: { wind: [0, 1], strike: [0, -12] }, // dip, then thrust the disk up into the bay
  tap: { wind: [0, 1], strike: [0, -7] }, // squeeze, then the capture kick lifts it
  edr: { wind: [0, 0], strike: [0, -9] }, // hold the charge, then the containment recoil rides up
  firewall: { wind: [0, 2], strike: [0, -6] }, // brace, then heavy shotgun kick
};
