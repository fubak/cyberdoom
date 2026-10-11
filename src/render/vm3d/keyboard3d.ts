import * as THREE from 'three';
import { drawTextCentered, textWidth } from '../../tools/pixelfont';
import { shade } from '../../tools/pixel';

/**
 * 3D KEYBOARD (vm3d): low-poly board with InstancedMesh keycaps that depress
 * per-key, a legend atlas built by the shared pixelfont, status LEDs, and
 * named socket markers that the clip solver drives hands/fingers to.
 *
 * Board-local frame: +x right, +y deck normal, +z toward the player (front
 * edge). Deck top is y=0, keycap tops ≈ 0.009. All dimensions in metres.
 */

export const KBD_W = 0.28;
export const KBD_D = 0.112;
export const KBD_CASE_H = 0.017;
const KEY_PITCH = 0.024;
const KEY_CAP = 0.020;
const KEY_H = 0.008;
const PRESS_DEPTH = 0.0015; // plan: keycaps depress 1.5 mm

export interface KeyDef {
  name: string;
  x: number;
  z: number;
  w: number; // key width in metres (pitch fraction * KEY_PITCH)
  legend: string;
  down: number; // 0..1 pressed
}

interface Row { z: number; keys: [string, number][] } // [legend, widthInPitches]

const ROWS: Row[] = [
  {
    z: -0.036,
    keys: [['~', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['<-', 1]],
  },
  {
    z: -0.016,
    keys: [['TAB', 1.4], ['q', 1], ['w', 1], ['e', 1], ['r', 1], ['t', 1], ['y', 1], ['u', 1], ['i', 1], ['o', 1], ['p', 1], ['\\', 0.6]],
  },
  {
    z: 0.004,
    keys: [['CAP', 1.6], ['a', 1], ['s', 1], ['d', 1], ['f', 1], ['g', 1], ['h', 1], ['j', 1], ['k', 1], ['l', 1], ['ENT', 1.4]],
  },
  {
    z: 0.024,
    keys: [['SFT', 2.0], ['z', 1], ['x', 1], ['c', 1], ['v', 1], ['b', 1], ['n', 1], ['m', 1], ['.', 1], ['SFT', 1.0]],
  },
  {
    z: 0.044,
    keys: [['ctl', 1.4], ['alt', 1.2], ['', 5.2], ['alt', 1.2], ['fn', 1.0]],
  },
];

function keyName(row: number, col: number, legend: string): string {
  if (legend === '') return 'space';
  return `${legend.toLowerCase()}.${row}.${col}`;
}

export class KeyboardRig {
  readonly group = new THREE.Group();
  readonly keys: KeyDef[] = [];
  private readonly keyMesh: THREE.InstancedMesh;
  private readonly legendMesh: THREE.Mesh;
  private readonly legendGeo: THREE.BufferGeometry;
  private readonly legendPos: Float32Array;
  private readonly leds: THREE.Mesh[] = [];
  private readonly sockets = new Map<string, THREE.Object3D>();
  private readonly flashTint = new THREE.Color('#5dff9a');
  private readonly keyCols: THREE.Color[] = [];

  constructor() {
    const dark = '#22252e';
    const edge = '#16181f';
    // case
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(KBD_W, KBD_CASE_H, KBD_D), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 }));
    caseMesh.position.y = -KBD_CASE_H / 2;
    this.group.add(caseMesh);
    // slanted top bezel (thin chamfer ring read at the front edge)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(KBD_W, 0.004, KBD_D), new THREE.MeshStandardMaterial({ color: edge, roughness: 0.85 }));
    lip.position.y = -0.002;
    this.group.add(lip);
    // key deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(KBD_W - 0.008, 0.002, KBD_D - 0.014), new THREE.MeshStandardMaterial({ color: '#1b1e26', roughness: 0.9 }));
    deck.position.y = -0.0015;
    this.group.add(deck);

    // ---- keys ----
    let total = 0;
    for (let r = 0; r < ROWS.length; r++) {
      const row = ROWS[r];
      const wsum = row.keys.reduce((s, k) => s + k[1], 0);
      let x = -wsum * KEY_PITCH / 2;
      row.keys.forEach(([legend, wp], c) => {
        const w = wp * KEY_PITCH;
        const cx = x + w / 2;
        const cap = Math.min(KEY_CAP, w - 0.003);
        this.keys.push({
          name: legend === '' ? 'space' : (r === 2 && c === row.keys.length - 1 ? 'enter' : keyName(r, c, legend)),
          x: cx, z: row.z, w: cap, legend, down: 0,
        });
        x += w;
      });
      total += row.keys.length;
    }
    const capGeo = new THREE.BoxGeometry(1, 1, 1);
    capGeo.translate(0, 0.5, 0); // origin at cap bottom
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    this.keyMesh = new THREE.InstancedMesh(capGeo, capMat, total);
    this.keys.forEach((k, i) => {
      const isAccent = k.name === 'enter' || k.name.startsWith('~');
      const isSpace = k.name === 'space';
      const col = new THREE.Color(isAccent ? '#e09a1a' : isSpace ? '#7a8092' : '#5a5f70');
      this.keyCols.push(col);
      this.keyMesh.setColorAt(i, col);
    });
    this.group.add(this.keyMesh);

    // ---- legend atlas + quads ----
    const cells = 16;
    const cellPx = 16;
    let tex: THREE.Texture | null = null;
    if (typeof document !== 'undefined') {
      const atlas = document.createElement('canvas');
      atlas.width = cells * cellPx;
      atlas.height = cells * cellPx;
      const g2 = atlas.getContext('2d');
      if (g2) {
        g2.imageSmoothingEnabled = false;
        this.keys.forEach((k, i) => {
          const cx = (i % cells) * cellPx;
          const cy = Math.floor(i / cells) * cellPx;
          const label = k.legend;
          const scale = label.length > 2 ? 1 : 2;
          const tw = textWidth(label, scale);
          drawTextCentered(g2, label, cx + cellPx / 2 - (tw > cellPx ? tw - cellPx : 0), cy + (cellPx - 7 * scale) / 2, '#e8ecf4', scale);
        });
      }
      tex = new THREE.CanvasTexture(atlas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    this.keys.forEach((k, i) => {
      const hw = Math.min(k.w, 0.016) / 2;
      const hd = 0.008;
      const y0 = 0;
      pos.push(
        k.x - hw, y0, k.z - hd,
        k.x + hw, y0, k.z - hd,
        k.x + hw, y0, k.z + hd,
        k.x - hw, y0, k.z + hd,
      );
      const u0 = (i % cells) / cells, v0 = 1 - (Math.floor(i / cells) + 1) / cells;
      const u1 = u0 + 1 / cells, v1 = v0 + 1 / cells;
      uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    this.legendGeo = new THREE.BufferGeometry();
    this.legendPos = new Float32Array(pos);
    this.legendGeo.setAttribute('position', new THREE.BufferAttribute(this.legendPos, 3));
    this.legendGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.legendGeo.setIndex(idx);
    this.legendMesh = new THREE.Mesh(this.legendGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.2 }));
    this.legendMesh.frustumCulled = false;
    this.group.add(this.legendMesh);

    // ---- LEDs ----
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.002), new THREE.MeshBasicMaterial({ color: i === 1 ? '#39d353' : '#1a3d26' }));
      led.rotation.x = -Math.PI / 2 + 0.35;
      led.position.set(KBD_W / 2 - 0.02 - i * 0.007, 0.0012, -KBD_D / 2 + 0.006);
      this.leds.push(led);
      this.group.add(led);
    }

    this.buildSockets();
    this.layout();
  }

  /** Key index by name (j/k/l/f/enter/space or legend.row.col). */
  keyIndex(name: string): number {
    const i = this.keys.findIndex((k) => k.name === name || k.name.startsWith(`${name}.`));
    if (i < 0) throw new Error(`vm3d: no key named ${name}`);
    return i;
  }

  /** Target press amount for a key (0..1); update() eases toward it. */
  press(name: string, amount: number): void {
    this.keys[this.keyIndex(name)].down = Math.max(0, Math.min(1, amount));
  }

  /** Ease key travel and rewrite instance matrices + legend quads. */
  update(dt: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let dirty = false;
    this.keys.forEach((k, i) => {
      const y = KEY_H - k.down * PRESS_DEPTH;
      m.compose(p.set(k.x, 0, k.z), q, s.set(k.w, y, 0.016));
      this.keyMesh.setMatrixAt(i, m);
      // legend quad rides the cap top
      const b = i * 12;
      this.legendPos[b + 1] = this.legendPos[b + 4] = this.legendPos[b + 7] = this.legendPos[b + 10] = y + 0.0008;
      dirty = true;
    });
    if (dirty) {
      this.keyMesh.instanceMatrix.needsUpdate = true;
      this.legendGeo.attributes.position.needsUpdate = true;
    }
    void dt;
  }

  /** Flash a subset of keycaps for one frame (impact ripple). */
  flashKeys(intensity: number): void {
    if (intensity <= 0) return;
    this.keys.forEach((_k, i) => {
      const seed = (i * 37) % 7;
      if (seed < 3) this.keyMesh.setColorAt(i, this.keyCols[i].clone().lerp(this.flashTint, intensity * 0.8));
    });
    if (this.keyMesh.instanceColor) this.keyMesh.instanceColor.needsUpdate = true;
  }

  /** Restore keycap colors after a flash. */
  clearFlash(): void {
    this.keys.forEach((_k, i) => this.keyMesh.setColorAt(i, this.keyCols[i]));
    if (this.keyMesh.instanceColor) this.keyMesh.instanceColor.needsUpdate = true;
  }

  blinkLed(t: number): void {
    this.leds.forEach((led, i) => {
      const m = led.material as THREE.MeshBasicMaterial;
      const on = i === 0 || Math.sin(t * 9 + i * 2.1) > 0;
      m.color.set(on ? '#39d353' : '#1a3d26');
    });
  }

  socket(name: string): THREE.Object3D | undefined {
    return this.sockets.get(name);
  }

  socketWorld(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.sockets.get(name);
    if (!s) throw new Error(`vm3d: no socket ${name}`);
    this.group.updateWorldMatrix(true, true);
    return s.getWorldPosition(out);
  }

  /** Solid board AABB in board-local space (for the no-intersection test). */
  solidAABB(out: THREE.Box3): THREE.Box3 {
    out.min.set(-KBD_W / 2, -KBD_CASE_H, -KBD_D / 2);
    out.max.set(KBD_W / 2, -0.0005, KBD_D / 2);
    return out;
  }

  private addSocket(name: string, pos: [number, number, number], euler?: [number, number, number]): void {
    const o = new THREE.Object3D();
    o.position.set(pos[0], pos[1], pos[2]);
    if (euler) o.rotation.set(euler[0] * Math.PI / 180, euler[1] * Math.PI / 180, euler[2] * Math.PI / 180, 'ZXY');
    this.group.add(o);
    this.sockets.set(name, o);
  }

  private buildSockets(): void {
    const d = Math.PI / 180;
    // left grip: wrist just left of the board's left end, palm wrapping the end
    // fingers point forward under the lip, thumb over the top edge
    this.addSocket('gripL.wrist', [-0.155, 0.045, 0.000], [0, 90, -180]);
    this.addSocket('gripL.tip.thumb', [-0.135, -0.002, 0.050]);
    this.addSocket('gripL.tip.index', [-0.106, -0.029, 0.028]);
    this.addSocket('gripL.tip.middle', [-0.097, -0.025, 0.011]);
    this.addSocket('gripL.tip.ring', [-0.107, -0.022, -0.002]);
    this.addSocket('gripL.tip.pinky', [-0.117, -0.019, -0.032]);
    // swing grip (right hand stacks on top of the left at the same end)
    this.addSocket('gripR.wrist', [-0.170, 0.062, 0.008], [0, 90, -180]);
    this.addSocket('gripR.tip.thumb', [-0.150, -0.002, 0.050]);
    this.addSocket('gripR.tip.index', [-0.112, -0.030, 0.044]);
    this.addSocket('gripR.tip.middle', [-0.102, -0.026, 0.020]);
    this.addSocket('gripR.tip.ring', [-0.113, -0.023, 0.006]);
    this.addSocket('gripR.tip.pinky', [-0.123, -0.020, -0.016]);
    // mid-air waypoint above the grip end: swing grab/release routes the
    // hand over the board so finger joints never cross the case
    this.addSocket('wayR.wrist', [-0.175, 0.130, 0.020], [0, 90, -180]);
    // low pull-back point: fingertips slide off the board to the left of
    // the end face before the hand rises, so they never cross the case
    this.addSocket('wayR2.wrist', [-0.205, 0.012, 0.012], [0, 90, -180]);
    // high point above the right-hand side of the deck: regrip finishes by
    // dropping straight down onto the home row, not swooping under the lip
    this.addSocket('wayR3.wrist', [0.060, 0.150, 0.050], [0, 90, -180]);
    // raised tuck in the typing orientation: first leg of the grab and last
    // leg of the regrip, so the hand lifts/turns before sweeping sideways
    this.addSocket('liftR3.wrist', [0.110, 0.115, 0.090], [-80, 15, 0]);
    // right-hand hover over the home row (rides the board)
    this.addSocket('hoverR.wrist', [0.110, 0.045, 0.095], [-80, 15, 0]);
    // wrist dips when a finger actually strikes a key
    this.addSocket('pressR.wrist', [0.098, 0.040, 0.090], [-80, 15, 0]);
    this.addSocket('pressR.wristM', [0.105, 0.040, 0.090], [-80, 15, 0]);
    this.addSocket('pressR.wristR', [0.112, 0.040, 0.092], [-80, 15, 0]);
    this.addSocket('pressR.wristP', [0.125, 0.045, 0.095], [-80, 15, 0]);
    // press targets on keycaps (world y tracks the depression)
    for (const name of ['j', 'k', 'l', 'f', 'enter', 'space']) {
      const i = this.keyIndex(name);
      const k = this.keys[i];
      this.addSocket(`key.${name}`, [k.x, KEY_H, k.z]);
    }
    void d;
  }

  private layout(): void {
    this.update(0);
  }
}

/** Key-top world position honoring the current depression. */
export function keyTopWorld(rig: KeyboardRig, name: string, out = new THREE.Vector3()): THREE.Vector3 {
  const i = rig.keyIndex(name);
  const k = rig.keys[i];
  rig.group.updateWorldMatrix(true, true);
  return out.set(k.x, KEY_H - k.down * PRESS_DEPTH, k.z).applyMatrix4(rig.group.matrixWorld);
}

export { PRESS_DEPTH, KEY_H, shade };
