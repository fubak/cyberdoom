import * as THREE from 'three';
import { shade } from '../../tools/pixel';

const ramps = new Map<string, THREE.DataTexture>();
const outlineMaterial = new THREE.MeshBasicMaterial({
  color: '#1a1210',
  side: THREE.BackSide,
  depthTest: true,
  depthWrite: true,
  toneMapped: false,
});

export function toonRamp(base: string): [string, string, string, string] {
  return [shade(base, 0.32), shade(base, 0.58), base, shade(base, 1.35)];
}

export function toonMaterial(
  colors: readonly string[],
  params: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  const key = colors.join(',');
  let gradientMap = ramps.get(key);
  if (!gradientMap) {
    const data = new Uint8Array(colors.length * 4);
    for (let i = 0; i < colors.length; i++) {
      const value = Number.parseInt(colors[i].slice(1), 16);
      data[i * 4] = (value >> 16) & 255;
      data[i * 4 + 1] = (value >> 8) & 255;
      data[i * 4 + 2] = value & 255;
      data[i * 4 + 3] = 255;
    }
    gradientMap = new THREE.DataTexture(data, colors.length, 1, THREE.RGBAFormat);
    gradientMap.colorSpace = THREE.SRGBColorSpace;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.wrapS = THREE.ClampToEdgeWrapping;
    gradientMap.wrapT = THREE.ClampToEdgeWrapping;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
    ramps.set(key, gradientMap);
  }

  const material = new THREE.MeshToonMaterial({
    ...params,
    color: params.color ?? '#ffffff',
    gradientMap,
  });
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    const gradientChunk = '#include <gradientmap_pars_fragment>';
    if (!shader.fragmentShader.includes(gradientChunk)) {
      throw new Error('vm3d toon gradient shader chunk changed');
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      gradientChunk,
      `#ifdef USE_GRADIENTMAP
uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
  #ifdef USE_GRADIENTMAP
    return texture2D( gradientMap, coord ).rgb;
  #else
    vec2 fw = fwidth( coord ) * 0.5;
    return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
  #endif
}`,
    );
  };
  material.customProgramCacheKey = () => 'vm3d-toon-rgb-gradient-v1';
  return material;
}

export function addOutlineHull(mesh: THREE.Mesh, scale = 1.045): THREE.Mesh {
  const hull = new THREE.Mesh(mesh.geometry, outlineMaterial);
  hull.name = `outline-${mesh.name || 'mesh'}`;
  hull.scale.setScalar(scale);
  hull.renderOrder = -1;
  hull.frustumCulled = false;
  mesh.add(hull);
  return hull;
}

export function addSkinnedOutlineHull(mesh: THREE.SkinnedMesh, scale = 1.045): THREE.SkinnedMesh {
  const hull = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial);
  hull.name = `outline-${mesh.name || 'hand'}`;
  hull.position.copy(mesh.position);
  hull.quaternion.copy(mesh.quaternion);
  hull.scale.copy(mesh.scale).multiplyScalar(scale);
  hull.bind(mesh.skeleton, mesh.bindMatrix);
  hull.bindMode = mesh.bindMode;
  hull.renderOrder = -1;
  hull.frustumCulled = false;
  mesh.parent?.add(hull);
  return hull;
}
