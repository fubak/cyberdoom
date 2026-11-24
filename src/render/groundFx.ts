import * as THREE from 'three';

/**
 * LOOK: what a threat does to the floor under it — a soft contact shadow and
 * a pool of its own colour. One flat quad per live enemy, drawn after the
 * opaque world: premultiplied blend, so alpha darkens the floor (shadow) and
 * rgb adds to it (light) in a single pass.
 */

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FS = /* glsl */ `
uniform vec3 uCol;
uniform float uPool;
uniform float uShadow;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d >= 1.0) discard;
  float shadow = (1.0 - smoothstep(0.12, 0.5, d)) * uShadow;
  float pool = (1.0 - d) * (1.0 - d) * uPool;
  gl_FragColor = vec4(uCol * pool, shadow);
}`;

/** Quad footprint relative to the sprite's world width. */
export const GROUND_SPREAD = 1.5;
/** Lift over the floor plane (z-fight guard). */
export const GROUND_LIFT = 0.012;

/** Unit quad lying in the XZ plane, centred on its origin. Shared by every ground mesh. */
export function groundGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

export function groundMaterial(col: readonly [number, number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      uCol: { value: new THREE.Vector3(col[0], col[1], col[2]) },
      uPool: { value: 0.4 },
      uShadow: { value: 0.55 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

/** Light-pool strength for the room light at the enemy's tile: strongest in the dark. */
export function poolStrength(room: number): number {
  return 0.45 * (1 - 0.65 * Math.min(1, Math.max(0, room)));
}
