import * as THREE from 'three';

const USB_LENGTH = 0.12;

export class UsbScannerRig {
  readonly group = new THREE.Group();
  private readonly sockets = new Map<string, THREE.Object3D>();
  private readonly connectorMat = new THREE.MeshStandardMaterial({
    color: '#b9c3d1', metalness: 0.72, roughness: 0.3,
  });
  private readonly buttonMat = new THREE.MeshStandardMaterial({
    color: '#c82d35', roughness: 0.42, metalness: 0.05,
  });
  private readonly ledMat = new THREE.MeshStandardMaterial({
    color: '#38d9f5', emissive: '#147b9b', emissiveIntensity: 0.7,
    roughness: 0.35,
  });
  private button!: THREE.Mesh;

  constructor() {
    this.group.name = 'usb-scanner';
    const body = new THREE.BufferGeometry();
    const farZ = -USB_LENGTH / 2;
    const nearZ = USB_LENGTH / 2;
    const farW = 0.015;
    const nearW = 0.026;
    const farBottom = -0.009;
    const nearBottom = -0.012;
    const farTop = 0.008;
    const nearTop = 0.009;
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
    this.group.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({
      color: '#222733', roughness: 0.76, metalness: 0.18, flatShading: true,
    })));

    const deck = this.box(0.046, 0.0014, 0.088, 0, 0.0091, 0.004, '#303847');
    deck.name = 'usb-top-deck';
    this.box(0.030, 0.0012, 0.037, 0, 0.0104, -0.025, '#071b1c');
    for (let i = 0; i < 3; i++) {
      this.box(0.022 - i * 0.003, 0.0008, 0.0014, -0.002, 0.0112, -0.038 + i * 0.006, '#38e985');
    }

    this.box(0.046, 0.0014, 0.006, 0, 0.0104, 0.019, '#1659cc');
    this.box(0.032, 0.0013, 0.003, 0, 0.0115, -0.005, undefined, this.ledMat);

    const connector = this.box(0.025, 0.008, 0.014, 0, 0.010, farZ - 0.004, undefined, this.connectorMat);
    connector.name = 'usb-metal-connector';
    for (const x of [-0.006, 0.006]) {
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, 0.0008, 8),
        new THREE.MeshStandardMaterial({ color: '#252a33', roughness: 0.7 }),
      );
      hole.position.set(x, 0.0142, farZ - 0.004);
      this.group.add(hole);
    }

    this.button = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.003, 8), this.buttonMat);
    this.button.name = 'usb-red-trigger';
    this.button.position.set(-0.004, 0.012, 0.043);
    this.group.add(this.button);
    for (const side of [-1, 1]) {
      this.box(0.003, 0.008, 0.022, side * 0.024, -0.001, 0.032, '#d38b13');
      this.box(0.003, 0.008, 0.020, side * 0.020, -0.001, -0.032, '#d38b13');
    }

    this.addSocket('usb.grip.wrist', [0.041, -0.015, 0.066], [
      [0.5, -0.8660254, 0], [0, 0, -1], [0.8660254, 0.5, 0],
    ]);
    this.addSocket('usb.grip.palm', [0.025, -0.008, 0.034]);
    this.addSocket('usb.grip.index', [-0.029, -0.012, -0.020]);
    this.addSocket('usb.grip.middle', [-0.010, -0.032, -0.016]);
    this.addSocket('usb.grip.ring', [0.006, -0.048, -0.006]);
    this.addSocket('usb.grip.pinky', [0.016, -0.052, 0.003]);
    this.addSocket('usb.trigger', [-0.004, 0.012, 0.043]);
    this.addSocket('usb.connector', [0, 0.014, farZ - 0.004]);
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
    this.button.position.y = 0.012 - amount * 0.0012;
    this.buttonMat.color.set(amount > 0.5 ? '#8d222c' : '#c82d35');
  }

  socket(name: string): THREE.Object3D | undefined {
    return this.sockets.get(name);
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material ?? new THREE.MeshStandardMaterial({ color: color ?? '#ffffff', roughness: 0.6 }),
    );
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  private addSocket(
    name: string,
    pos: [number, number, number],
    basis?: [[number, number, number], [number, number, number], [number, number, number]],
  ): void {
    const socket = new THREE.Object3D();
    socket.position.set(...pos);
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
