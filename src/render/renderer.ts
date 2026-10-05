import * as THREE from 'three';
import type { Entity, MapDef, Projectile } from '../core/types';
import type { WorldMap } from '../engine/map';
import type { Player } from '../engine/player';
import { buildPaletteLut } from './palette';
import { buildSprites, spriteSets, type SpriteSet } from './sprites';
import { WALL_H, buildTextures, doorTextureFor, textureOr, textureRegistry } from './textures';

/**
 * LOOK: Three.js renderer, Doom-E1 style.
 * - 320x200 frame: 3D view is the top 320x168, the 32px status bar sits below
 *   (drawn by the HUD), exactly like Doom's layout.
 * - Level geometry: only exposed wall faces are emitted, world-aligned UVs,
 *   1 texel ≈ 1/64 tile, walls WALL_H tall. Doom "fake contrast" (E/W vs N/S
 *   faces) + per-vertex corner occlusion on flats.
 * - Custom shader: sector light × distance diminishing quantised into 24 light
 *   bands (Doom's COLORMAP feel); texels on the glow layer are FULLBRIGHT.
 * - Post pass snaps every pixel to the 256-colour CYBERDOOM palette and applies
 *   a palette-style red shift when the player takes damage.
 * - Sprites: screen-parallel billboards with walk/attack/rotation frames,
 *   pain flash and a dissolve death; scanner charges are fullbright sprites.
 */
export const VIEW_W = 320;
export const VIEW_H = 200;
export const STATUS_H = 32;
export const VIEW3D_H = VIEW_H - STATUS_H;
const EYE_H = 0.6;

const WORLD_VS = /* glsl */ `
attribute float shade;
varying vec2 vUv;
varying float vShade;
varying float vDist;
varying vec2 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xz;
  vShade = shade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const WORLD_FS = /* glsl */ `
uniform sampler2D map;
uniform float uLight;
uniform float uFlash;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;
uniform float uTime;
varying vec2 vWorld;
varying vec2 vUv;
varying float vShade;
varying float vDist;
void main() {
  vec4 t = texture2D(map, vUv * uUvScale + uUvOffset);
  if (t.a < 0.25) discard;
  float L = 1.0;
  if (t.a > 0.75) {
    // negative shade marks a flickering (faulty fluorescent) tile
    float fl = 1.0;
    if (vShade < 0.0) {
      vec2 cellId = floor(vWorld + 0.001);
      float r = fract(sin(floor(uTime * 9.0) * 12.9898 + dot(cellId, vec2(3.1, 7.7))) * 43758.5453);
      fl = r < 0.3 ? 0.4 : 1.0;
    }
    float s = abs(vShade) * uLight * fl;
    L = s * 1.38 - vDist * (0.17 - s * 0.095);
    L = clamp(L, 0.025, 1.0);
    L = floor(L * 24.0 + 0.5) / 24.0;
  }
  vec3 c = mix(t.rgb * L, vec3(1.0), uFlash);
  gl_FragColor = vec4(c, 1.0);
}`;

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const POST_FS = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tLut;
uniform vec4 uTint;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c = mix(c, uTint.rgb, uTint.a);
  vec3 q = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5);
  vec2 luv = vec2((q.r + q.b * 32.0 + 0.5) / 1024.0, (q.g + 0.5) / 32.0);
  gl_FragColor = vec4(texture2D(tLut, luv).rgb, 1.0);
}`;

const timeUniform = { value: 0 };

function worldMaterial(map: THREE.Texture, light = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WORLD_VS,
    fragmentShader: WORLD_FS,
    uniforms: {
      map: { value: map },
      uLight: { value: light },
      uFlash: { value: 0 },
      uUvScale: { value: new THREE.Vector2(1, 1) },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uTime: timeUniform,
    },
    side: THREE.DoubleSide,
  });
}

class GeoBuilder {
  pos: number[] = [];
  uv: number[] = [];
  shade: number[] = [];
  idx: number[] = [];

  /** Quad from 4 corners (CCW from front) with uvs + per-corner shade. */
  quad(p: number[][], uv: number[][], s: number[]): void {
    const b = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.shade.push(s[i]);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

interface SpriteState {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  set: SpriteSet;
  setId: string;
  lastX: number;
  lastY: number;
  facing: number | null;
  moveT: number;
  animT: number;
  lastHp: number;
  flash: number;
  kind: Entity['def']['kind'];
  entity: Entity | null;
}

interface Fx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  set: SpriteSet;
  frames: string[];
  t: number;
  dur: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private levelGroup = new THREE.Group();
  private spriteGroup = new THREE.Group();
  private sprites = new Map<string, SpriteState>();
  private ghosts: SpriteState[] = [];
  private projSprites = new Map<Projectile, SpriteState>();
  private fx: Fx[] = [];
  private doorMeshes = new Map<string, THREE.Mesh>();
  private openingDoors: { mesh: THREE.Mesh; t: number }[] = [];
  private map: WorldMap | null = null;
  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private planeGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  private lastTime = performance.now();
  private time = 0;
  private lastIntegrity = 100;
  private hurt = 0;

  constructor(container: HTMLElement) {
    buildTextures();
    buildSprites();
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.setClearColor(0x000000, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    container.appendChild(this.canvas);

    // Doom-like ~90° horizontal FOV on the 320x168 view.
    this.camera = new THREE.PerspectiveCamera(58, VIEW_W / VIEW3D_H, 0.04, 48);
    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.levelGroup);
    this.scene.add(this.spriteGroup);

    this.rt = new THREE.WebGLRenderTarget(VIEW_W, VIEW3D_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VS,
      fragmentShader: POST_FS,
      uniforms: {
        tScene: { value: this.rt.texture },
        tLut: { value: buildPaletteLut() },
        uTint: { value: new THREE.Vector4(1, 0, 0, 0) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  dispose(): void {
    this.canvas.remove();
    this.rt.dispose();
    this.renderer.dispose();
  }

  /** Rebuild level geometry for a new mission. */
  buildLevel(map: WorldMap, _def: MapDef): void {
    this.map = map;
    this.levelGroup.clear();
    this.spriteGroup.clear();
    this.sprites.clear();
    this.ghosts = [];
    this.projSprites.clear();
    this.fx = [];
    this.doorMeshes.clear();
    this.openingDoors = [];
    this.lastIntegrity = 100;
    this.hurt = 0;

    const isWall = (x: number, y: number) => map.cellAt(x, y)?.kind === 'wall' || !map.cellAt(x, y);
    const builders = new Map<string, { tex: THREE.Texture; b: GeoBuilder }>();
    const builder = (key: string, tex: THREE.Texture) => {
      let e = builders.get(key);
      if (!e) {
        e = { tex, b: new GeoBuilder() };
        builders.set(key, e);
      }
      return e.b;
    };

    const H = WALL_H;
    const wallFace = (b: GeoBuilder, tx: number, ty: number, nx: number, nz: number, shade: number) => {
      const cx = tx + 0.5 + nx * 0.5;
      const cz = ty + 0.5 + nz * 0.5;
      const rx = nz;
      const rz = -nx;
      const l = [cx - rx * 0.5, cz - rz * 0.5];
      const r = [cx + rx * 0.5, cz + rz * 0.5];
      // fake contrast: faces along x read brighter than faces along z
      const s = shade * (nz !== 0 ? 1.08 : 0.84);
      b.quad(
        [[l[0], 0, l[1]], [r[0], 0, r[1]], [r[0], H, r[1]], [l[0], H, l[1]]],
        [[0, 0], [1, 0], [1, 1], [0, 1]],
        [s * 0.8, s * 0.8, s, s],
      );
    };

    const flicker = (x: number, y: number) =>
      map.cellAt(x, y)?.kind === 'floor' && map.lightAt(x, y) < 0.7 && (x * 7 + y * 13) % 5 === 0 ? -1 : 1;
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const cell = map.cellAt(tx, ty);
        if (!cell) continue;
        if (cell.kind === 'wall') {
          for (const [dx, dz] of DIRS) {
            const n = map.cellAt(tx + dx, ty + dz);
            if (!n || n.kind === 'wall') continue;
            const isTrack = n.kind === 'door';
            const b = isTrack
              ? builder('doortrak', textureOr('doortrak'))
              : builder(`w:${cell.tex}`, textureOr(cell.tex));
            wallFace(b, tx, ty, dx, dz, map.lightAt(tx + dx, ty + dz) * flicker(tx + dx, ty + dz));
          }
          continue;
        }
        if (cell.kind === 'door' && !map.isDoorOpen(cell.doorId ?? '')) {
          const id = cell.doorId ?? `d${tx},${ty}`;
          const tex = doorTextureFor(cell.tex, cell.accessRole);
          const b = new GeoBuilder();
          for (const [dx, dz] of DIRS) {
            const n = map.cellAt(tx + dx, ty + dz);
            if (!n || n.kind === 'wall' || n.kind === 'door') continue;
            // door faces are inset slightly so the jamb tracks show
            wallFace(b, tx, ty, dx, dz, map.lightAt(tx + dx, ty + dz));
          }
          b.quad(
            [[tx, 0.002, ty], [tx + 1, 0.002, ty], [tx + 1, 0.002, ty + 1], [tx, 0.002, ty + 1]],
            [[0, 0], [1, 0], [1, 0.1], [0, 0.1]],
            [0.3, 0.3, 0.3, 0.3],
          );
          const mesh = new THREE.Mesh(b.build(), worldMaterial(tex));
          this.levelGroup.add(mesh);
          this.doorMeshes.set(id, mesh);
        }
        // floor + ceiling (also under doors)
        const L = map.lightAt(tx, ty);
        const ao = (cx: number, cy: number) => {
          // corner occlusion: count walls among the 4 cells touching this corner
          let n = 0;
          for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (isWall(cx + ox, cy + oy)) n++;
          return L * (1 - n * 0.14);
        };
        const fk = flicker(tx, ty);
        const s = [ao(tx, ty), ao(tx + 1, ty), ao(tx + 1, ty + 1), ao(tx, ty + 1)].map((v) => v * fk);
        const floorTex = cell.kind === 'exit' ? 'exit' : textureRegistry.get(cell.tex) && cell.kind === 'floor' ? cell.tex : 'floor';
        builder(`f:${floorTex}`, textureOr(floorTex, 'floor')).quad(
          [[tx, 0, ty], [tx + 1, 0, ty], [tx + 1, 0, ty + 1], [tx, 0, ty + 1]],
          [[0, 1], [1, 1], [1, 0], [0, 0]],
          s,
        );
        const lamp = cell.kind !== 'door' && ((tx % 3 === 1 && ty % 3 === 1) || L >= 0.98);
        const ceilTex = lamp ? 'ceil-light' : 'ceil';
        builder(`c:${ceilTex}`, textureOr(ceilTex, 'ceil')).quad(
          [[tx, H, ty], [tx + 1, H, ty], [tx + 1, H, ty + 1], [tx, H, ty + 1]],
          [[0, 1], [1, 1], [1, 0], [0, 0]],
          s.map((v) => v * 0.78),
        );
        if (cell.kind === 'exit') this.addStatic('fx-exit', tx + 0.5, ty + 0.5, H - 0.26, L);
      }
    }
    for (const { tex, b } of builders.values()) {
      this.levelGroup.add(new THREE.Mesh(b.build(), worldMaterial(tex)));
    }
  }

  private makeSpriteMesh(set: SpriteSet, light: number): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
    const first = Object.values(set.frames)[0];
    const mat = worldMaterial(first, light);
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.scale.set(set.w, set.h, 1);
    const shade = new THREE.Float32BufferAttribute(new Float32Array(this.planeGeo.attributes.position.count).fill(1), 1);
    if (!this.planeGeo.getAttribute('shade')) this.planeGeo.setAttribute('shade', shade);
    this.spriteGroup.add(mesh);
    return { mesh, mat };
  }

  private addStatic(setId: string, x: number, z: number, y: number, light: number): void {
    const set = spriteSets.get(setId);
    if (!set) return;
    const { mesh, mat } = this.makeSpriteMesh(set, light);
    mesh.position.set(x, y, z);
    this.ghosts.push({
      mesh, mat, set, setId, lastX: x, lastY: z, facing: null, moveT: 0, animT: 0, lastHp: 0, flash: 0,
      kind: 'prop', entity: null,
    });
  }

  private spawnFx(setId: string, frames: string[], x: number, z: number, y: number, dur: number, light = 1): void {
    const set = spriteSets.get(setId);
    if (!set) return;
    const { mesh, mat } = this.makeSpriteMesh(set, light);
    mesh.position.set(x, y, z);
    this.fx.push({ mesh, mat, set, frames, t: 0, dur });
  }

  /** Remove the mesh for an opened door (animated: the door slides up). */
  setDoorOpen(doorId: string): void {
    const mesh = this.doorMeshes.get(doorId);
    if (mesh) {
      this.openingDoors.push({ mesh, t: 0 });
      this.doorMeshes.delete(doorId);
    }
  }

  private lightAt(x: number, y: number): number {
    return this.map ? this.map.lightAt(Math.floor(x), Math.floor(y)) : 1;
  }

  syncEntities(entities: Entity[], projectiles: Projectile[]): void {
    const seen = new Set<string>();
    for (const e of entities) {
      const id = e.def.id;
      let st = this.sprites.get(id);
      if (!e.alive) {
        if (st) this.retire(st);
        continue;
      }
      seen.add(id);
      const setId = e.def.kind === 'workstation' ? (e.infected ? 'workstation-infected' : 'workstation') : e.def.sprite;
      const set = spriteSets.get(setId) ?? spriteSets.require('npc-m');
      if (!st) {
        const { mesh, mat } = this.makeSpriteMesh(set, this.lightAt(e.x, e.y));
        st = {
          mesh, mat, set, setId, lastX: e.x, lastY: e.y, facing: null, moveT: 0, animT: Math.random() * 3,
          lastHp: e.hp, flash: 0, kind: e.def.kind, entity: e,
        };
        this.sprites.set(id, st);
      }
      if (st.setId !== setId) {
        st.set = set;
        st.setId = setId;
        st.mesh.scale.set(set.w, set.h, 1);
      }
      if (e.hp < st.lastHp) st.flash = 1;
      st.lastHp = e.hp;
      const hurtT = (e as Entity & { hurtT?: number }).hurtT;
      if (typeof hurtT === 'number' && hurtT > 0) st.flash = Math.max(st.flash, 0.8);
      const dx = e.x - st.lastX;
      const dy = e.y - st.lastY;
      if (Math.hypot(dx, dy) > 0.002) {
        st.facing = Math.atan2(dy, dx);
        st.moveT = 0.2;
      }
      st.lastX = e.x;
      st.lastY = e.y;
      st.entity = e;
      st.mesh.position.set(e.x, 0, e.y);
      st.mat.uniforms.uLight.value = this.lightAt(e.x, e.y);
    }
    for (const [id, st] of [...this.sprites]) {
      if (!seen.has(id) && st.entity && st.entity.alive === false) continue;
      if (!seen.has(id)) {
        this.spriteGroup.remove(st.mesh);
        this.sprites.delete(id);
      }
    }

    // projectiles
    const live = new Set<Projectile>();
    for (const p of projectiles) {
      if (!p.alive) continue;
      live.add(p);
      let st = this.projSprites.get(p);
      if (!st) {
        const set = spriteSets.require('fx-scan');
        const { mesh, mat } = this.makeSpriteMesh(set, 1);
        st = {
          mesh, mat, set, setId: 'fx-scan', lastX: p.x, lastY: p.y, facing: null, moveT: 0, animT: 0, lastHp: 0,
          flash: 0, kind: 'prop', entity: null,
        };
        this.projSprites.set(p, st);
      }
      st.lastX = p.x;
      st.lastY = p.y;
      st.mesh.position.set(p.x, EYE_H - 0.2, p.y);
    }
    for (const [p, st] of [...this.projSprites]) {
      if (live.has(p)) continue;
      this.spriteGroup.remove(st.mesh);
      this.projSprites.delete(p);
      this.spawnFx('fx-puff', ['f0', 'f1', 'f2'], st.lastX, st.lastY, EYE_H - 0.32, 0.24);
    }
  }

  /** Entity went away: malware dissolves; cleaned workstations stay as clean props. */
  private retire(st: SpriteState): void {
    const e = st.entity;
    this.spriteGroup.remove(st.mesh);
    if (e) this.sprites.delete(e.def.id);
    if (!e) return;
    if (e.def.kind === 'enemy' && st.set.frames.die0) {
      this.spawnFx(st.setId, ['die0', 'die1', 'die2', 'die3'], e.x, e.y, 0, 0.5, this.lightAt(e.x, e.y));
    } else if (e.def.kind === 'workstation') {
      this.addStatic('workstation', e.x, e.y, 0, this.lightAt(e.x, e.y));
      this.spawnFx('fx-puff', ['f0', 'f1', 'f2', 'f2'], e.x, e.y, 0.4, 0.4);
    }
  }

  private pickFrame(st: SpriteState, camAngle: number, px: number, py: number): { tex: THREE.Texture } {
    const f = st.set.frames;
    const anim = st.set.anim;
    const t = st.animT;
    if (anim === 'monster') {
      if (st.flash > 0.25 && f.pain) return { tex: f.pain };
      const dist = Math.hypot(px - st.lastX, py - st.lastY);
      if (dist < 0.95 && f.attack) return { tex: Math.floor(t * 5) % 2 === 0 ? f.attack : f.walk0 };
      return { tex: Math.floor(t * 4) % 2 === 0 ? f.walk0 : f.walk1 };
    }
    if (anim === 'person') {
      const moving = st.moveT > 0;
      const step = moving ? [1, 0, 2, 0][Math.floor(t * 6) % 4] : 0;
      let view = 'front';
      if (st.facing !== null) {
        const rel = st.facing - camAngle;
        const c = Math.cos(rel);
        const s = Math.sin(rel);
        if (c < -0.5) view = 'front';
        else if (c > 0.5) view = 'back';
        else view = s > 0 ? 'side' : 'sideL';
      }
      return { tex: f[`${view}${step}`] ?? f.front0 };
    }
    if (anim === 'flicker') {
      const keys = Object.keys(f);
      return { tex: f[keys[Math.floor(t * 3) % keys.length]] };
    }
    return { tex: Object.values(f)[0] };
  }

  render(player: Player): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.time += dt;
    timeUniform.value = this.time;

    // damage → palette red shift
    if (player.integrity < this.lastIntegrity) this.hurt = Math.min(0.55, this.hurt + 0.28 + (this.lastIntegrity - player.integrity) * 0.01);
    this.lastIntegrity = player.integrity;
    this.hurt = Math.max(0, this.hurt - dt * 1.1);
    const lowHp = player.integrity > 0 && player.integrity < 25 ? 0.06 + Math.sin(this.time * 6) * 0.04 : 0;
    (this.postMat.uniforms.uTint.value as THREE.Vector4).set(1, 0.04, 0.02, Math.max(this.hurt, lowHp));

    const speed = Math.min(1, Math.hypot(player.vx, player.vy) / 4);
    const bobY = Math.abs(Math.sin(player.bob)) * 0.035 * speed;
    this.camera.position.set(player.x, EYE_H + bobY, player.y);
    this.camera.rotation.set(0, -player.angle - Math.PI / 2, 0, 'YXZ');
    const yaw = this.camera.rotation.y;

    for (const st of [...this.sprites.values(), ...this.ghosts, ...this.projSprites.values()]) {
      st.animT += dt;
      st.moveT -= dt;
      st.flash = Math.max(0, st.flash - dt * 3);
      st.mesh.rotation.set(0, yaw, 0);
      st.mat.uniforms.map.value = this.pickFrame(st, player.angle, player.x, player.y).tex;
      st.mat.uniforms.uFlash.value = st.flash > 0.75 ? 0.6 : 0;
    }
    for (const fx of [...this.fx]) {
      fx.t += dt;
      const i = Math.min(fx.frames.length - 1, Math.floor((fx.t / fx.dur) * fx.frames.length));
      fx.mesh.rotation.set(0, yaw, 0);
      fx.mat.uniforms.map.value = fx.set.frames[fx.frames[i]];
      if (fx.t >= fx.dur) {
        this.spriteGroup.remove(fx.mesh);
        fx.mat.dispose();
        this.fx.splice(this.fx.indexOf(fx), 1);
      }
    }
    for (const d of [...this.openingDoors]) {
      d.t += dt;
      d.mesh.position.y = Math.min(1, d.t / 0.55) * WALL_H * 0.97;
      if (d.t > 0.6) {
        this.levelGroup.remove(d.mesh);
        this.openingDoors.splice(this.openingDoors.indexOf(d), 1);
      }
    }

    this.renderer.setRenderTarget(this.rt);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW3D_H);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW_H);
    this.renderer.clear();
    this.renderer.setViewport(0, STATUS_H, VIEW_W, VIEW3D_H);
    this.renderer.autoClear = false;
    this.renderer.render(this.postScene, this.postCam);
    this.renderer.autoClear = true;
  }
}
