import * as THREE from 'three';
import { fidgetAt } from '../vmotion';
import { VM_CLEAR } from '../../tools/anim';
import { TOOL_FLASH } from '../viewmodels';
import { CLIPS, KBD_ACTION_CLIP, type KbdAction, type VmClip } from './clips';
import { Vm3dRig } from './rig';
import { ensureHandAssets, HAND_FINGERS, LiveHand, type HandSpec } from './hand3d';
import type { Curl, FingerName } from '../handrig';

/** base-px → viewmodel-space metres at the board's working distance (~0.45 m). */
const PX2M = (2 * Math.tan((54 / 2) * Math.PI / 180) * 0.45) / 168 * 0.6;

export interface Vm3dFrame {
  dt: number;
  simT: number;
  toolId: string;
  /** switching/lower 0..1 and death-drop in base px. */
  lower: number;
  dropPx: number;
  /** sway/bob offsets in base px (matches the sprite path's inputs). */
  swayX: number;
  swayY: number;
  bob: number;
  breath: number;
  rollDeg: number;
  bobPitchDeg: number;
  /** sector light at the player tile (0..~1.4). */
  light: number;
  /** tool-flash rgb + seconds since use, or null. */
  flash: { rgb: [number, number, number]; sinceUse: number; windup: number } | null;
  seed: number;
}

/**
 * Live 3D viewmodel layer: its own Scene + PerspectiveCamera rendered after
 * the world into the same render target (depth cleared), so the world post
 * pass (palette LUT) gives it the same pixel grain. A GL scissor keeps it
 * under VM_CLEAR except during the swing's 150 ms centre-crossing window.
 */
/** Hand-study poses for the debug anatomy sheet. */
const STUDY_POSES: Record<string, { curls: Partial<Record<FingerName, Curl>>; thumbOut?: number }> = {
  open: { curls: {
    index: { mcp: 4, pip: 6, abd: -9 }, middle: { mcp: 4, pip: 6, abd: 0 },
    ring: { mcp: 4, pip: 6, abd: 8 }, pinky: { mcp: 6, pip: 8, abd: 14 },
    thumb: { mcp: 6, pip: 8 },
  }, thumbOut: 1 },
  relaxed: { curls: {
    index: { mcp: 24, pip: 28, abd: -5 }, middle: { mcp: 26, pip: 30, abd: 0 },
    ring: { mcp: 28, pip: 32, abd: 5 }, pinky: { mcp: 34, pip: 38, abd: 10 },
    thumb: { mcp: 12, pip: 18 },
  }, thumbOut: 0.85 },
  typing: { curls: {
    index: { mcp: 48, pip: 54, abd: -4 }, middle: { mcp: 50, pip: 56, abd: 0 },
    ring: { mcp: 52, pip: 58, abd: 5 }, pinky: { mcp: 56, pip: 62, abd: 10 },
    thumb: { mcp: 14, pip: 20 },
  }, thumbOut: 0.7 },
  fist: { curls: {
    index: { mcp: 88, pip: 104, abd: -4 }, middle: { mcp: 90, pip: 106, abd: 0 },
    ring: { mcp: 90, pip: 104, abd: 5 }, pinky: { mcp: 88, pip: 100, abd: 9 },
    thumb: { mcp: 38, pip: 45 },
  }, thumbOut: 0.3 },
  bat: { curls: {
    index: { mcp: 62, pip: 70, abd: -5 }, middle: { mcp: 66, pip: 74, abd: 0 },
    ring: { mcp: 70, pip: 78, abd: 5 }, pinky: { mcp: 60, pip: 66, abd: 9 },
    thumb: { mcp: 22, pip: 30 },
  }, thumbOut: 0.4 },
};

export class Vm3d {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(54, 1, 0.01, 5);
  readonly pass = { renderInto: (r: THREE.WebGLRenderer, w: number, h: number) => this.renderInto(r, w, h) };
  private rig: Vm3dRig;
  private spec: HandSpec;
  private clip: VmClip = CLIPS['kbd.idle'];
  private clipT = 0;
  private toolId: string | null = null;
  private forced: KbdAction | null = null;
  private freezeT: number | null = null;
  private key: THREE.PointLight;
  private fill: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private flashLight: THREE.PointLight;
  private flickT = 0;
  private studyHand: LiveHand | null = null;
  private studySide: 'L' | 'R' = 'R';
  private studyView: 'palm' | 'back' | 'side' = 'back';
  private gripView: 'dorsal' | 'side' | 'under' | null = null;

  constructor(spec: HandSpec) {
    this.spec = spec;
    this.rig = new Vm3dRig(spec);
    this.scene.add(this.rig.root, this.rig.stage);
    this.key = new THREE.PointLight('#fdf6ec', 2.2, 4, 1.8);
    this.key.position.set(0.25, 0.35, 0.15);
    this.fill = new THREE.DirectionalLight('#e8c8a8', 0.45);
    this.fill.position.set(-0.4, -0.2, 0.3);
    this.hemi = new THREE.HemisphereLight('#b8c4de', '#3a2a22', 0.5);
    this.flashLight = new THREE.PointLight('#ffc85a', 0, 3.5, 2);
    this.flashLight.position.set(0, 0.02, -0.6);
    this.scene.add(this.key, this.fill, this.hemi, this.flashLight);
    ensureHandAssets(); // kick the glb fetch at startup; hands join when ready
  }

  /** Tool id the vm3d layer draws this frame ('keyboard' or null → sprite path). */
  handles(): string | null {
    return this.toolId && this.rig.ready ? this.toolId : null;
  }

  onToolUsed(toolId: string, action?: string): void {
    if (toolId !== 'keyboard') return;
    const a = (this.forced ?? action ?? 'type') as KbdAction;
    this.clip = CLIPS[KBD_ACTION_CLIP[a] ?? KBD_ACTION_CLIP.type];
    this.clipT = 0;
    if (this.freezeT !== null) this.freezeT = 0;
  }

  /** Rebuild the rig when the analyst changes. */
  setSpec(spec: HandSpec): void {
    if (spec.gender === this.spec.gender && spec.skin.id === this.spec.skin.id) return;
    this.spec = spec;
    this.scene.remove(this.rig.root, this.rig.stage);
    this.rig = new Vm3dRig(spec);
    this.scene.add(this.rig.root, this.rig.stage);
  }

  /** Capture/debug: force the next keyboard action. */
  forceAction(action: KbdAction | null): void {
    this.forced = action;
  }

  /** Capture/debug: start a clip immediately, bypassing the arsenal's
   *  cooldown so capture frames are deterministic. */
  play(action: KbdAction): void {
    this.clip = CLIPS[KBD_ACTION_CLIP[action] ?? KBD_ACTION_CLIP.type];
    this.clipT = 0;
  }

  /** Capture/debug: pin the clip at time t (null → live). */
  freeze(t: number | null): void {
    this.freezeT = t;
  }

  /** Current clip time (debug state). */
  clipTime(): number {
    return this.clipT;
  }

  /**
   * Grip close-up (debug): camera tight on the board's left end showing
   * both hands at the swing grip, from 'dorsal' | 'side' | 'under'.
   * null returns to the viewmodel. Pair with play('swing') + freeze(t).
   */
  gripCloseup(view: 'dorsal' | 'side' | 'under' | null): void {
    this.gripView = view;
  }

  /**
   * Anatomy study (debug): pose a lone hand on a neutral background,
   * `view` in 'palm' | 'back' | 'side', `side` 'L' | 'R' (default R).
   * null pose returns to the viewmodel.
   */
  study(pose: string | null, view = 'back', side: 'L' | 'R' = 'R'): void {
    if (this.studyHand) { this.scene.remove(this.studyHand.group); this.studyHand = null; }
    if (!pose || !STUDY_POSES[pose] || !this.rig.ready) return;
    this.studyView = view === 'palm' || view === 'side' ? view : 'back';
    this.studySide = side === 'L' ? 'L' : 'R';
    const h = new LiveHand(this.studySide, this.spec);
    const p = STUDY_POSES[pose];
    h.thumbOut = p.thumbOut ?? 1;
    h.setCurls(p.curls);
    h.group.updateMatrixWorld(true);
    this.studyHand = h;
    this.scene.add(h.group);
  }

  frame(f: Vm3dFrame): void {
    this.toolId = f.toolId === 'keyboard' ? 'keyboard' : null;
    this.rig.ensureHands(); // cheap once loaded; builds hands the frame they arrive
    if (!this.toolId || !this.rig.ready) return;
    if (this.freezeT === null) this.clipT += f.dt;
    const t = this.freezeT ?? this.clipT;
    if (this.clipT > this.clip.duration && !this.clip.loop) {
      this.clip = CLIPS['kbd.idle'];
      this.clipT = 0;
    }
    this.rig.solve(this.clip, this.clip.loop ? t % this.clip.duration : Math.min(t, this.clip.duration));

    // --- motion layer (vmotion inputs retargeted to the vm-space root) ---
    const g = this.rig.root;
    const px = PX2M;
    const bobY = Math.abs(Math.cos(f.bob)) * 3 * px;
    const bobX = Math.sin(f.bob) * 6 * px;
    g.position.set(
      f.swayX * px * 0.7 + bobX,
      f.swayY * px * 0.7 + bobY + f.breath * px - f.lower * 0.30 - f.dropPx * px * 1.2,
      0,
    );
    g.rotation.set(
      f.bobPitchDeg * Math.PI / 180 * 0.5,
      0,
      f.rollDeg * Math.PI / 180 * 0.55,
    );

    // idle finger fidgets: thumb tap + index lift + regrip on the free hand
    if (this.clip === CLIPS['kbd.idle']) {
      const fig = fidgetAt(f.simT, f.seed);
      if (fig) {
        const u = Math.sin(Math.PI * fig.u);
        const r = this.rig.hands.R;
        if (fig.kind === 0) {
          const c = r.getCurl('thumb');
          r.setCurl('thumb', { ...c, mcp: c.mcp + u * 14 });
        } else if (fig.kind === 1) {
          const c = r.getCurl('index');
          r.setCurl('index', { ...c, mcp: c.mcp - u * 12 });
        } else if (fig.kind === 3) {
          for (const fn of HAND_FINGERS) {
            if (fn === 'thumb') continue;
            const c = r.getCurl(fn);
            r.setCurl(fn, { ...c, mcp: c.mcp + u * 7, pip: c.pip + u * 7 });
          }
        } else {
          g.rotation.z += u * 2.2 * Math.PI / 180;
        }
      }
    }

    // --- lights follow the sector light at the player tile ---
    const lv = Math.min(1.3, f.light);
    this.key.intensity = 0.6 + lv * 1.9;
    this.hemi.intensity = 0.25 + lv * 0.4;
    this.flashLight.intensity = 0;
    if (f.flash && f.flash.sinceUse >= f.flash.windup && f.flash.sinceUse - f.flash.windup < 0.09) {
      const u = 1 - (f.flash.sinceUse - f.flash.windup) / 0.09;
      this.flashLight.color.setRGB(f.flash.rgb[0] / 255, f.flash.rgb[1] / 255, f.flash.rgb[2] / 255);
      this.flashLight.intensity = 1.6 * u;
      if (f.toolId === 'keyboard') this.rig.board.flashKeys(u);
      else this.rig.board.clearFlash();
    } else {
      this.rig.board.clearFlash();
    }
    this.flickT += f.dt;
    this.rig.board.blinkLed(f.simT + this.flickT);
  }

  /** Render into the bound world RT; caller keeps the viewport/scissor state. */
  renderInto(r: THREE.WebGLRenderer, w: number, h: number): void {
    if (this.studyHand) {
      const l = this.studyHand.palmL;
      this.cam.aspect = w / h;
      this.cam.updateProjectionMatrix();
      const d = 0.30;
      const cy = l * 0.55;
      const sideSign = this.studySide === 'L' ? 1 : -1;
      if (this.studyView === 'palm') this.cam.position.set(0, cy, -d);
      else if (this.studyView === 'side') this.cam.position.set(sideSign * d, cy, 0);
      else this.cam.position.set(0, cy, d);
      this.cam.lookAt(0, cy, 0);
      this.key.intensity = 0.45;
      this.hemi.intensity = 0.9;
      const keyPos = this.key.position.clone();
      this.key.position.copy(this.cam.position).multiplyScalar(1.3);
      const prev = new THREE.Color();
      r.getClearColor(prev);
      const prevA = r.getClearAlpha();
      r.setClearColor('#3a4150', 1);
      this.rig.root.visible = this.rig.stage.visible = false;
      r.render(this.scene, this.cam);
      this.rig.root.visible = this.rig.stage.visible = true;
      this.key.position.copy(keyPos);
      r.setClearColor(prev, prevA);
      this.cam.position.set(0, 0, 0);
      this.cam.lookAt(0, 0, -1);
      return;
    }
    if (!this.toolId) return;
    if (this.gripView) {
      // evidence shot: the board's left end centred on a neutral gray
      // background, narrow fov for an orthographic-style read — the world
      // pass is wiped so this is the vm3d scene alone
      this.cam.aspect = w / h;
      this.cam.fov = 30;
      this.cam.updateProjectionMatrix();
      const end = this.rig.board.group.localToWorld(new THREE.Vector3(-0.155, -0.01, 0));
      if (this.gripView === 'dorsal') this.cam.position.copy(end).add(new THREE.Vector3(-0.20, 0.30, 0.10));
      else if (this.gripView === 'side') this.cam.position.copy(end).add(new THREE.Vector3(-0.12, 0.05, 0.42));
      else this.cam.position.copy(end).add(new THREE.Vector3(-0.10, -0.32, 0.20));
      this.cam.lookAt(end);
      this.key.intensity = 1.6;
      this.hemi.intensity = 1.4;
      const prev = new THREE.Color();
      r.getClearColor(prev);
      const prevA = r.getClearAlpha();
      r.setClearColor('#3a4150', 1);
      r.clear(true, true, false);
      r.render(this.scene, this.cam);
      r.setClearColor(prev, prevA);
      this.cam.fov = 54;
      this.cam.updateProjectionMatrix();
      this.cam.position.set(0, 0, 0);
      this.cam.lookAt(0, 0, -1);
      return;
    }
    const crossing = this.clip === CLIPS['kbd.swing'] && this.clipT < 0.16;
    const bandH = crossing ? Math.floor(h * 0.58) : Math.floor(h * (1 - VM_CLEAR));
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    r.setScissorTest(true);
    r.setScissor(0, 0, w, bandH);
    r.render(this.scene, this.cam);
    r.setScissorTest(false);
  }
}

export function vm3dFlashRgb(toolId: string): [number, number, number] | null {
  const s = TOOL_FLASH[toolId];
  if (!s) return null;
  const p = s.split(',').map(Number);
  return [p[0], p[1], p[2]];
}
