import * as THREE from 'three';
import { fidgetAt } from '../vmotion';
import { VM_CLEAR } from '../../tools/anim';
import { TOOL_FLASH } from '../viewmodels';
import { CLIPS, KBD_ACTION_CLIP, type KbdAction, type VmClip } from './clips';
import { KeyboardRig } from './keyboard3d';
import { Vm3dRig, type Vm3dBoard } from './rig';
import { UsbScannerRig, type UsbGripDebugOptions } from './usb3d';
import { ensureHandAssets, HAND_FINGERS, LiveHand, type HandSpec } from './hand3d';
import type { Curl, FingerName } from '../handrig';
import { RES, VIEW3D_H, VIEW_W } from '../res';

/** base-px → viewmodel-space metres at the board's working distance (~0.45 m). */
const D2R = Math.PI / 180;
const PX2M = (2 * Math.tan((54 / 2) * Math.PI / 180) * 0.45) / 168 * 0.6;
export const VM3D_CAMERA_BACK = 0.02;
type UsbDebugView = 'game' | 'right' | 'top' | 'below';

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
  private rig: Vm3dRig<Vm3dBoard>;
  private spec: HandSpec;
  private clip: VmClip = CLIPS['kbd.idle'];
  private clipT = 0;
  private toolId: string | null = null;
  private activeRigTool: 'keyboard' | 'usb' | null = null;
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
  private usbDebugView: UsbDebugView | null = null;
  private usbGripDebugOverrides: UsbGripDebugOptions | null = null;
  private readonly usbDebugCamera = new THREE.OrthographicCamera(-0.4, 0.4, 0.2, -0.2, 0.01, 5);
  private readonly usbDebugMaterials = new Map<string, THREE.MeshBasicMaterial>(
    ['index', '#ff3030', 'middle', '#38e85a', 'ring', '#3284ff', 'pinky', '#ffd43b',
      'thumb', '#ff32d8', 'palm', '#ffffff', 'arm', '#32d6e5', 'scanner', '#858b94', 'trigger', '#ff881e']
      .reduce<Array<[string, THREE.MeshBasicMaterial]>>((materials, value, index, values) => {
        if (index % 2 === 0) {
          materials.push([value, new THREE.MeshBasicMaterial({
            color: values[index + 1],
            side: THREE.DoubleSide,
            toneMapped: false,
          })]);
        }
        return materials;
      }, []),
  );
  private readonly usbDebugOriginalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly usbDebugOriginalVisibility = new Map<THREE.Object3D, boolean>();
  private readonly vmWidth = VIEW_W / RES;
  private readonly vmHeight = VIEW3D_H / RES;
  private readonly vmTarget = new THREE.WebGLRenderTarget(this.vmWidth, this.vmHeight, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    generateMipmaps: false,
  });
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly compositeMat = new THREE.MeshBasicMaterial({
    map: this.vmTarget.texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  constructor(spec: HandSpec) {
    this.spec = spec;
    this.rig = new Vm3dRig<Vm3dBoard>(spec, new KeyboardRig());
    this.scene.add(this.rig.root, this.rig.stage);
    this.key = new THREE.PointLight('#fff1df', 1.8, 4, 1.8);
    this.key.position.set(-0.28, 0.40, 0.20);
    this.fill = new THREE.DirectionalLight('#b9c5dd', 0.14);
    this.fill.position.set(0.35, -0.2, -0.3);
    this.hemi = new THREE.HemisphereLight('#b8c4de', '#3a2a22', 0.12);
    this.flashLight = new THREE.PointLight('#ffc85a', 0, 3.5, 2);
    this.flashLight.position.set(0, 0.04, -0.75);
    this.scene.add(this.key, this.fill, this.hemi, this.flashLight);
    const compositePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat);
    compositePlane.frustumCulled = false;
    this.compositeScene.add(compositePlane);
    ensureHandAssets(); // kick the glb fetch at startup; hands join when ready
  }

  /** Tool id the vm3d layer draws this frame (null → sprite path). */
  handles(): string | null {
    return this.toolId && this.rig.ready ? this.toolId : null;
  }

  onToolUsed(toolId: string, action?: string): void {
    if (toolId === 'usb') {
      this.clip = CLIPS['usb.fire'];
      this.clipT = 0;
      if (this.freezeT !== null) this.freezeT = 0;
      return;
    }
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
    this.replaceRig(this.activeRigTool ?? 'keyboard');
  }

  private replaceRig(toolId: 'keyboard' | 'usb'): void {
    this.scene.remove(this.rig.root, this.rig.stage);
    const board = toolId === 'usb' ? new UsbScannerRig() : new KeyboardRig();
    this.rig = new Vm3dRig<Vm3dBoard>(this.spec, board);
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

  /** Debug-only surface diagnostics for the USB grip. */
  debugUsbView(view: UsbDebugView | null): void {
    this.restoreUsbDebugMaterials();
    if (!view || !(this.rig.board instanceof UsbScannerRig) || !this.rig.ready) {
      this.usbDebugView = null;
      return;
    }
    this.usbDebugView = view;
    const setMaterial = (mesh: THREE.Mesh, material: THREE.MeshBasicMaterial): void => {
      if (mesh.name.startsWith('outline-')) {
        this.usbDebugOriginalVisibility.set(mesh, mesh.visible);
        mesh.visible = false;
        return;
      }
      this.usbDebugOriginalMaterials.set(mesh, mesh.material);
      mesh.material = material;
    };
    this.rig.board.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      setMaterial(
        mesh,
        this.usbDebugMaterials.get(mesh.name === 'usb-red-trigger' ? 'trigger' : 'scanner')!,
      );
    });
    this.rig.stage.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name.startsWith('outline-')) {
        setMaterial(mesh, this.usbDebugMaterials.get('palm')!);
        return;
      }
      if (/^vm3d-(forearm|forecap|sleeve)/.test(mesh.name)) {
        setMaterial(mesh, this.usbDebugMaterials.get('arm')!);
        return;
      }
      const finger = (['index', 'middle', 'ring', 'pinky', 'thumb'] as const)
        .find((name) => mesh.name.includes(`-${name}-`) || mesh.name.endsWith(`-${name}`));
      setMaterial(mesh, this.usbDebugMaterials.get(finger ?? 'palm')!);
    });
  }

  /** Override the USB hand frame live for pose sweeps; null restores defaults. */
  debugUsbGrip(options: UsbGripDebugOptions | null): {
    thumbGapMm: number;
    thumbBody: [number, number, number];
    triggerBody: [number, number, number];
    fingertipsBody: Record<string, [number, number, number]>;
    fingertipSurfaceMm: Record<string, number>;
    deepestPenetration: { segment: string; endpoint: number; depthMm: number; point: [number, number, number] } | null;
    palmBody: [number, number, number];
    wristBody: [number, number, number];
    wristNdc: [number, number, number];
  } | null {
    if (options) {
      const previous = this.usbGripDebugOverrides ?? {};
      this.usbGripDebugOverrides = {
        ...previous,
        ...options,
        curls: options.curls ? { ...previous.curls, ...options.curls } : previous.curls,
      };
    } else {
      this.usbGripDebugOverrides = null;
    }
    this.applyUsbGripDebugFrame();
    if (this.rig.board instanceof UsbScannerRig && this.rig.ready) {
      const t = this.freezeT ?? this.clipT;
      this.rig.solve(this.clip, this.clip.loop ? t % this.clip.duration : Math.min(t, this.clip.duration));
      this.reapplyUsbGripDebugPose();
      this.rig.stage.updateMatrixWorld(true);
      const board = this.rig.board;
      const hand = this.rig.hands.R;
      const trigger = board.group.getObjectByName('usb-red-trigger');
      if (!trigger) return null;
      const triggerTop = new THREE.Vector3(0, 0.002, 0).applyMatrix4(trigger.matrixWorld);
      const thumb = hand.tipWorld('thumb');
      const thumbBody = board.group.worldToLocal(thumb.clone()).toArray() as [number, number, number];
      const triggerBody = board.group.worldToLocal(triggerTop.clone()).toArray() as [number, number, number];
      const palm = hand.group.getObjectByName('vm3d-chunky-palm');
      const palmBody = board.group.worldToLocal(
        (palm ?? hand.group).getWorldPosition(new THREE.Vector3()),
      ).toArray() as [number, number, number];
      const wrist = hand.group.getWorldPosition(new THREE.Vector3());
      const wristBody = board.group.worldToLocal(wrist.clone()).toArray() as [number, number, number];
      const wristNdc = wrist.project(this.cam).toArray() as [number, number, number];
      const body = board.bodyAABB();
      const surfaceDistance = (point: THREE.Vector3): number => {
        const left = new THREE.Vector3(
          body.min.x,
          THREE.MathUtils.clamp(point.y, body.min.y, body.max.y),
          THREE.MathUtils.clamp(point.z, body.min.z, body.max.z),
        );
        const bottom = new THREE.Vector3(
          THREE.MathUtils.clamp(point.x, body.min.x, body.max.x),
          body.min.y,
          THREE.MathUtils.clamp(point.z, body.min.z, body.max.z),
        );
        return Math.min(point.distanceTo(left), point.distanceTo(bottom)) * 1000;
      };
      const fingertipsBody = Object.fromEntries(
        (['index', 'middle', 'ring', 'pinky'] as const).map((finger) => {
          const local = board.group.worldToLocal(hand.tipWorld(finger));
          return [finger, local.toArray() as [number, number, number]];
        }),
      );
      const fingertipSurfaceMm = Object.fromEntries(
        (['index', 'middle', 'ring', 'pinky'] as const).map((finger) => [
          finger,
          surfaceDistance(board.group.worldToLocal(hand.tipWorld(finger))),
        ]),
      );
      let deepestPenetration: {
        segment: string;
        endpoint: number;
        depthMm: number;
        point: [number, number, number];
      } | null = null;
      hand.group.traverse((object) => {
        const segment = object as THREE.Mesh;
        if (!segment.isMesh || !segment.name.startsWith('vm3d-chunky-segment-')) return;
        const child = segment.userData.childBone as THREE.Bone | undefined;
        if (!child || !segment.parent) return;
        const endpoints = [
          segment.parent.getWorldPosition(new THREE.Vector3()),
          child.getWorldPosition(new THREE.Vector3()),
        ];
        endpoints.forEach((worldPoint, endpoint) => {
          const point = board.group.worldToLocal(worldPoint);
          if (!body.containsPoint(point)) return;
          const depthMm = Math.min(
            point.x - body.min.x, body.max.x - point.x,
            point.y - body.min.y, body.max.y - point.y,
            point.z - body.min.z, body.max.z - point.z,
          ) * 1000;
          if (!deepestPenetration || depthMm > deepestPenetration.depthMm) {
            deepestPenetration = {
              segment: segment.name,
              endpoint,
              depthMm,
              point: point.toArray() as [number, number, number],
            };
          }
        });
      });
      return {
        thumbGapMm: thumb.distanceTo(triggerTop) * 1000,
        thumbBody,
        triggerBody,
        fingertipsBody,
        fingertipSurfaceMm,
        deepestPenetration,
        palmBody,
        wristBody,
        wristNdc,
      };
    }
    return null;
  }

  private applyUsbGripDebugFrame(): void {
    if (this.rig.board instanceof UsbScannerRig) {
      this.rig.board.setGripFrame(this.usbGripDebugOverrides ?? {});
    }
  }

  private reapplyUsbGripDebugPose(): void {
    if (!(this.rig.board instanceof UsbScannerRig) || !this.rig.ready) return;
    const overrides = this.usbGripDebugOverrides;
    if (overrides) {
      const hand = this.rig.hands.R;
      if (overrides.thumbOut !== undefined) hand.thumbOut = overrides.thumbOut;
      if (overrides.curls) hand.setCurls(overrides.curls);
      else if (overrides.thumbOut !== undefined) hand.setCurl('thumb', hand.getCurl('thumb'));
      if (overrides.tail) hand.tailDir = new THREE.Vector3(...overrides.tail).normalize();
      this.rig.stage.updateMatrixWorld(true);
      hand.orientTail();
      hand.orientThumbnailToward(new THREE.Vector3(0, 0, 1));
    }
  }

  private restoreUsbDebugMaterials(): void {
    for (const [mesh, material] of this.usbDebugOriginalMaterials) mesh.material = material;
    for (const [object, visible] of this.usbDebugOriginalVisibility) object.visible = visible;
    this.usbDebugOriginalMaterials.clear();
    this.usbDebugOriginalVisibility.clear();
  }

  /** Debug: nudge a named board socket (board-local pos metres, euler deg). */
  setSocket(name: string, pos?: [number, number, number], rot?: [number, number, number]): void {
    const s = this.rig.board.socket(name);
    if (!s) return;
    if (pos) s.position.set(pos[0], pos[1], pos[2]);
    if (rot) s.quaternion.setFromEuler(new THREE.Euler(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'ZXY'));
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
    const active = f.toolId === 'keyboard' || f.toolId === 'usb' ? f.toolId : null;
    if (active !== this.activeRigTool) {
      this.activeRigTool = active;
      this.toolId = active;
      if (active) {
        this.replaceRig(active);
        this.clip = CLIPS[active === 'usb' ? 'usb.idle' : 'kbd.idle'];
        this.clipT = 0;
      }
    }
    this.rig.ensureHands(); // cheap once loaded; builds hands the frame they arrive
    if (!this.toolId || !this.rig.ready) return;
    if (this.freezeT === null) this.clipT += f.dt;
    const t = this.freezeT ?? this.clipT;
    if (this.clipT > this.clip.duration && !this.clip.loop) {
      this.clip = CLIPS[this.toolId === 'usb' ? 'usb.idle' : 'kbd.idle'];
      this.clipT = 0;
    }
    this.applyUsbGripDebugFrame();
    this.rig.solve(this.clip, this.clip.loop ? t % this.clip.duration : Math.min(t, this.clip.duration));
    this.reapplyUsbGripDebugPose();

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
    if (this.clip === CLIPS['kbd.idle'] || this.clip === CLIPS['usb.idle']) {
      const fig = fidgetAt(f.simT, f.seed);
      if (fig && this.toolId === 'usb') {
        g.rotation.z += Math.sin(Math.PI * fig.u) * 0.8 * Math.PI / 180;
      } else if (fig) {
        const u = Math.sin(Math.PI * fig.u);
        const r = this.rig.hands.R;
        if (fig.kind === 0) {
          const c = r.getCurl('thumb');
          r.setCurl('thumb', { ...c, mcp: c.mcp + u * (this.toolId === 'usb' ? 5 : 14) });
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
    this.key.intensity = 0.45 + lv * 1.5;
    this.hemi.intensity = 0.08 + lv * 0.16;
    this.fill.position.set(0.35, -0.2, -0.3);
    this.fill.intensity = 0.14;
    if (this.rig.board instanceof UsbScannerRig) {
      this.flashLight.position.copy(this.rig.board.socketWorld('usb.connector'));
    } else {
      this.flashLight.position.set(0, 0.04, -0.75);
    }
    this.flashLight.intensity = 0;
    if (f.flash && f.flash.sinceUse >= f.flash.windup && f.flash.sinceUse - f.flash.windup < 0.09) {
      const u = 1 - (f.flash.sinceUse - f.flash.windup) / 0.09;
      this.flashLight.color.setRGB(f.flash.rgb[0] / 255, f.flash.rgb[1] / 255, f.flash.rgb[2] / 255);
      this.flashLight.intensity = 1.0 * u;
      if (this.rig.board instanceof KeyboardRig) this.rig.board.flashKeys(u);
      else this.rig.board.flash(u);
    } else {
      this.rig.board.clearFlash();
    }
    this.flickT += f.dt;
    this.rig.board.blinkLed(f.simT + this.flickT);
  }

  /** Render at base resolution, then composite into the bound world RT. */
  renderInto(r: THREE.WebGLRenderer, _w: number, _h: number): void {
    if (!this.toolId && !this.studyHand) return;
    const outputTarget = r.getRenderTarget();
    const outputViewport = r.getViewport(new THREE.Vector4());
    const outputScissor = r.getScissor(new THREE.Vector4());
    const outputScissorTest = r.getScissorTest();
    const outputClearColor = r.getClearColor(new THREE.Color());
    const outputClearAlpha = r.getClearAlpha();
    const outputAutoClear = r.autoClear;
    const composite = () => {
      r.setRenderTarget(outputTarget);
      r.setViewport(outputViewport);
      r.setScissor(outputScissor);
      r.setScissorTest(outputScissorTest);
      r.autoClear = false;
      r.render(this.compositeScene, this.compositeCam);
      r.autoClear = outputAutoClear;
      r.setClearColor(outputClearColor, outputClearAlpha);
    };
    r.setRenderTarget(this.vmTarget);
    r.setViewport(0, 0, this.vmWidth, this.vmHeight);
    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    if (this.usbDebugView && this.rig.board instanceof UsbScannerRig) {
      const previousColor = r.getClearColor(new THREE.Color());
      const previousAlpha = r.getClearAlpha();
      r.setClearColor('#303640', 1);
      this.cam.aspect = this.vmWidth / this.vmHeight;
      this.cam.fov = 54;
      this.cam.updateProjectionMatrix();
      let camera: THREE.Camera = this.cam;
      if (this.usbDebugView === 'game') {
        this.cam.position.set(0, 0, VM3D_CAMERA_BACK);
        this.cam.lookAt(0, 0, -1);
      } else {
        const board = this.rig.board.group;
        const boardQ = board.getWorldQuaternion(new THREE.Quaternion());
        const center = board.localToWorld(new THREE.Vector3(0.02, -0.10, 0.035));
        const views: Record<Exclude<UsbDebugView, 'game'>, [THREE.Vector3, THREE.Vector3]> = {
          right: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
          top: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)],
          below: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
        };
        const [direction, up] = views[this.usbDebugView];
        direction.applyQuaternion(boardQ).normalize();
        up.applyQuaternion(boardQ).normalize();
        const viewHeight = 0.40;
        const viewWidth = viewHeight * this.vmWidth / this.vmHeight;
        this.usbDebugCamera.left = -viewWidth / 2;
        this.usbDebugCamera.right = viewWidth / 2;
        this.usbDebugCamera.top = viewHeight / 2;
        this.usbDebugCamera.bottom = -viewHeight / 2;
        this.usbDebugCamera.updateProjectionMatrix();
        this.usbDebugCamera.position.copy(center).addScaledVector(direction, 0.75);
        this.usbDebugCamera.up.copy(up);
        this.usbDebugCamera.lookAt(center);
        camera = this.usbDebugCamera;
      }
      camera.updateMatrixWorld(true);
      r.clear(true, true, true);
      r.render(this.scene, camera);
      r.setClearColor(previousColor, previousAlpha);
      composite();
      return;
    }
    if (this.studyHand) {
      const l = this.studyHand.palmL;
      this.cam.aspect = this.vmWidth / this.vmHeight;
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
      composite();
      return;
    }
    if (this.gripView) {
      // evidence shot: the board's left end centred on a neutral gray
      // background, narrow fov for an orthographic-style read — the world
      // pass is wiped so this is the vm3d scene alone
      this.cam.aspect = this.vmWidth / this.vmHeight;
      this.cam.fov = 30;
      this.cam.updateProjectionMatrix();
      const end = this.rig.board.group.localToWorld(new THREE.Vector3(-0.155, -0.01, 0));
      // camera offsets in BOARD space so the turntable stays framed on the
      // grip even while the board whips through the swing
      const bq = this.rig.board.group.getWorldQuaternion(new THREE.Quaternion());
      let off = new THREE.Vector3(-0.14, 0.30, 0.08);           // dorsal: above and outboard
      if (this.gripView === 'side') off = new THREE.Vector3(-0.38, 0.06, 0.0); // end-on
      else if (this.gripView === 'under') off = new THREE.Vector3(-0.12, -0.32, 0.10); // below
      this.cam.position.copy(end).add(off.applyQuaternion(bq));
      this.cam.lookAt(end);
      // product-turntable lighting: bright key riding the camera, a cool
      // fill from the opposite side, and ambient hemispheric lift — every
      // finger, thumb, board end and wrist direction must be readable
      this.key.position.copy(this.cam.position).multiplyScalar(1.2);
      this.key.intensity = 2.4;
      this.fill.position.copy(this.cam.position).multiplyScalar(-1).add(new THREE.Vector3(0, 0.2, 0));
      this.fill.intensity = 0.9;
      this.hemi.intensity = 1.6;
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
      composite();
      return;
    }
    // the swing's strike is the only time the board may reach above
    // VM_CLEAR: the taller band applies exactly while the board is in
    // flight — grab lift through strike and settle (0.014–0.34 s)
    const crossing = (this.clip === CLIPS['kbd.swing'] && this.clipT >= 0.10 && this.clipT <= 0.25)
      || (this.clip === CLIPS['usb.fire'] && this.clipT >= 0.05 && this.clipT <= 0.14);
    const bandH = crossing ? Math.floor(this.vmHeight * 0.58) : Math.floor(this.vmHeight * (1 - VM_CLEAR));
    this.cam.aspect = this.vmWidth / this.vmHeight;
    this.cam.position.set(0, 0, this.toolId === 'usb' ? VM3D_CAMERA_BACK : 0);
    this.cam.lookAt(0, 0, -1);
    this.cam.updateProjectionMatrix();
    r.setScissorTest(true);
    r.setScissor(0, 0, this.vmWidth, bandH);
    r.render(this.scene, this.cam);
    r.setScissorTest(false);
    composite();
  }
}

export function vm3dFlashRgb(toolId: string): [number, number, number] | null {
  const s = TOOL_FLASH[toolId];
  if (!s) return null;
  const p = s.split(',').map(Number);
  return [p[0], p[1], p[2]];
}
