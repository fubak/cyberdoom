import * as THREE from 'three';
import type { Curl, FingerName } from '../handrig';
import { addOutlineHull, toonMaterial, toonRamp } from './materials';

const USB_BODY_LENGTH = 0.14;
const USB_TRIGGER_Y = 0.026;
const USB_TRIGGER_CONTACT_NUDGE = 0.00152;
const USB_TRIGGER_Z = 0.00775;
const USB_MODEL_DROP = 0.017;

export const USB_GRIP_WRIST: [number, number, number] = [0.085, -0.037, 0.05];
export const USB_GRIP_FINGER_DIR: [number, number, number] = [-0.556022, -0.556022, -0.617802];
export const USB_GRIP_PALM_FACES: [number, number, number] = [-0.707107, 0.707107, 0];

export interface UsbGripDebugOptions {
  wrist?: [number, number, number];
  fingers?: [number, number, number];
  palm?: [number, number, number];
  curls?: Partial<Record<FingerName, Curl>>;
  thumbOut?: number;
  tail?: [number, number, number];
}

export class UsbScannerRig {
  readonly group = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly sockets = new Map<string, THREE.Object3D>();
  private readonly connectorMat = toonMaterial(toonRamp('#b9c3d1'));
  private readonly buttonMat = toonMaterial(toonRamp('#c82d35'));
  private readonly ledMat = toonMaterial(toonRamp('#38d9f5'), {
    emissive: '#147b9b',
    emissiveIntensity: 0.7,
  });
  private button!: THREE.Mesh;

  constructor() {
    this.group.name = 'usb-scanner';
    this.model.name = 'usb-model';
    this.model.position.y = -USB_MODEL_DROP;
    this.group.add(this.model);
    const body = new THREE.BufferGeometry();
    const farZ = -USB_BODY_LENGTH / 2;
    const nearZ = USB_BODY_LENGTH / 2;
    const farW = 0.020;
    const nearW = 0.030;
    const farBottom = -0.013;
    const nearBottom = -0.015;
    const farTop = 0.013;
    const nearTop = 0.015;
    const vertices = [
      -farW, farBottom, farZ, farW, farBottom, farZ,
      farW, farTop, farZ, -farW, farTop, farZ,
      -nearW, nearBottom, nearZ, nearW, nearBottom, nearZ,
      nearW, nearTop, nearZ, -nearW, nearTop, nearZ,
    ];
    body.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    body.setIndex([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]);
    body.computeVertexNormals();
    const bodyMaterial = toonMaterial(toonRamp('#353d49'));
    Object.assign(bodyMaterial, { flatShading: true });
    bodyMaterial.needsUpdate = true;
    const bodyMesh = new THREE.Mesh(body, bodyMaterial);
    bodyMesh.name = 'usb-body';
    this.model.add(bodyMesh);
    addOutlineHull(bodyMesh);

    const deck = this.box(0.054, 0.0015, 0.108, 0, 0.0152, 0.002, '#414b59');
    deck.name = 'usb-top-deck';
    addOutlineHull(deck);
    this.box(0.038, 0.0013, 0.040, 0, 0.0167, -0.042, '#071b1c');
    for (let i = 0; i < 3; i++) {
      this.box(0.028 - i * 0.004, 0.0008, 0.0016, -0.002, 0.0177, -0.058 + i * 0.008, '#38e985');
    }

    this.box(0.054, 0.0015, 0.008, 0, 0.0165, 0.027, '#1659cc');
    this.box(0.040, 0.0014, 0.004, 0, 0.0178, 0.032, undefined, this.ledMat);

    const connector = this.box(0.032, 0.012, 0.020, 0, 0.014, farZ - 0.010, undefined, this.connectorMat);
    connector.name = 'usb-metal-connector';
    addOutlineHull(connector);
    for (const x of [-0.007, 0.007]) {
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0027, 0.0027, 0.001, 8),
        toonMaterial(toonRamp('#252a33')),
      );
      hole.position.set(x, 0.020, farZ - 0.010);
      this.model.add(hole);
    }

    this.button = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.004, 8), this.buttonMat);
    this.button.name = 'usb-red-trigger';
    this.button.position.set(0.0036, 0.022, USB_TRIGGER_Z);
    this.model.add(this.button);
    addOutlineHull(this.button);
    for (const side of [-1, 1]) {
      this.box(0.004, 0.012, 0.026, side * 0.028, 0, 0.041, '#d38b13');
      this.box(0.004, 0.012, 0.024, side * 0.021, 0, -0.042, '#d38b13');
    }

    this.addSocket('usb.grip.wrist', USB_GRIP_WRIST);
    this.addSocket('usb.grip.palm', [0.031, -0.02, 0.061]);
    this.addSocket('usb.grip.index', [-0.027, -0.017, 0.058]);
    this.addSocket('usb.grip.middle', [-0.027, -0.017, 0.045]);
    this.addSocket('usb.grip.ring', [-0.027, -0.017, 0.032]);
    this.addSocket('usb.grip.pinky', [-0.027, -0.017, 0.021]);
    this.addSocket('usb.trigger', [0.00013, USB_TRIGGER_Y + USB_TRIGGER_CONTACT_NUDGE, USB_TRIGGER_Z]);
    this.addSocket('usb.connector', [0, 0.020, farZ - 0.010]);
    this.setGripFrame();
  }

  update(_dt: number): void {}

  blinkLed(t: number): void {
    this.ledMat.emissiveIntensity = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5));
  }

  flash(intensity: number): void {
    this.connectorMat.emissive.set('#26d9f5');
    this.connectorMat.emissiveIntensity = intensity * 1.2;
  }

  clearFlash(): void {
    this.connectorMat.emissiveIntensity = 0;
  }

  pressButton(amount: number): void {
    this.button.position.y = 0.022 - amount * 0.002;
    this.buttonMat.color.set(amount > 0.5 ? '#b8232d' : '#ffffff');
    const trigger = this.sockets.get('usb.trigger');
    if (trigger) trigger.position.y = USB_TRIGGER_Y + USB_TRIGGER_CONTACT_NUDGE - USB_MODEL_DROP - amount * 0.002;
  }

  bodyAABB(out = new THREE.Box3()): THREE.Box3 {
    out.min.set(-0.03, -0.015, -USB_BODY_LENGTH / 2);
    out.max.set(0.03, 0.015, USB_BODY_LENGTH / 2);
    out.translate(this.model.position);
    return out;
  }

  socket(name: string): THREE.Object3D | undefined {
    return this.sockets.get(name);
  }

  setGripFrame(options: Pick<UsbGripDebugOptions, 'wrist' | 'fingers' | 'palm'> = {}): void {
    const wrist = this.sockets.get('usb.grip.wrist');
    if (!wrist) return;
    const fingers = new THREE.Vector3(...(options.fingers ?? USB_GRIP_FINGER_DIR));
    if (fingers.lengthSq() < 1e-8) throw new Error('vm3d: USB grip finger direction cannot be zero');
    fingers.normalize();
    const palmFaces = new THREE.Vector3(...(options.palm ?? USB_GRIP_PALM_FACES));
    palmFaces.addScaledVector(fingers, -palmFaces.dot(fingers));
    if (palmFaces.lengthSq() < 1e-8) throw new Error('vm3d: USB grip palm direction must be perpendicular to fingers');
    palmFaces.normalize();
    const dorsal = palmFaces.clone().negate();
    const thumbAway = new THREE.Vector3().crossVectors(fingers, dorsal).normalize();
    const basis = new THREE.Matrix4().makeBasis(thumbAway, fingers, dorsal);
    const position = options.wrist ?? USB_GRIP_WRIST;
    wrist.position.set(position[0], position[1], position[2]);
    wrist.quaternion.setFromRotationMatrix(basis);
  }

  socketWorld(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    const socket = this.sockets.get(name);
    if (!socket) throw new Error(`vm3d: no usb socket ${name}`);
    this.group.updateWorldMatrix(true, true);
    return socket.getWorldPosition(out);
  }

  private box(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    color?: string,
    material?: THREE.Material,
  ): THREE.Mesh {
    const base = color ?? '#ffffff';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material ?? toonMaterial(toonRamp(base)),
    );
    mesh.position.set(x, y, z);
    this.model.add(mesh);
    return mesh;
  }

  private addSocket(
    name: string,
    pos: [number, number, number],
    basis?: [[number, number, number], [number, number, number], [number, number, number]],
  ): void {
    const socket = new THREE.Object3D();
    socket.position.set(
      pos[0],
      pos[1] - (name === 'usb.grip.wrist' || name === 'usb.grip.palm' ? 0 : USB_MODEL_DROP),
      pos[2],
    );
    if (basis) {
      const matrix = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...basis[0]),
        new THREE.Vector3(...basis[1]),
        new THREE.Vector3(...basis[2]),
      );
      socket.quaternion.setFromRotationMatrix(matrix);
    }
    this.group.add(socket);
    this.sockets.set(name, socket);
  }
}
