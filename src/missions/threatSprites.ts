import * as THREE from 'three';
import { spriteRegistry, spriteSets, type SpriteSet } from '../render/sprites';

const PALETTES: Record<string, { source: string; color: [number, number, number] }> = {
  logicbomb: { source: 'worm', color: [255, 176, 64] },
  rat: { source: 'trojan', color: [96, 255, 144] },
  rootkit: { source: 'ransomware', color: [144, 112, 255] },
};

function recolorPixels(source: Uint8Array, color: [number, number, number]): Uint8Array {
  const data = new Uint8Array(source);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const brightness = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
    data[i] = color[0] * brightness;
    data[i + 1] = color[1] * brightness;
    data[i + 2] = color[2] * brightness;
  }
  return data;
}

function recolor(texture: THREE.Texture, color: [number, number, number]): THREE.DataTexture {
  if (!(texture instanceof THREE.DataTexture)) throw new Error('Threat sprite frames must use DataTexture');
  const image = texture.image as { data: Uint8Array; width: number; height: number };
  const data = recolorPixels(image.data, color);
  const clone = new THREE.DataTexture(data, image.width, image.height, texture.format as THREE.PixelFormat, texture.type);
  clone.copy(texture);
  clone.image = { data, width: image.width, height: image.height };
  clone.mipmaps = texture.mipmaps.map((mip) => ({
    data: recolorPixels((mip as { data: Uint8Array }).data, color),
    width: (mip as { width: number }).width,
    height: (mip as { height: number }).height,
  }));
  clone.needsUpdate = true;
  return clone;
}

function paletteSet(source: SpriteSet, color: [number, number, number]): SpriteSet {
  const frames: Record<string, THREE.Texture> = {};
  for (const key of Object.keys(source.frames)) {
    let tint: THREE.Texture | undefined;
    Object.defineProperty(frames, key, {
      enumerable: true,
      get: () => {
        tint ??= recolor(source.frames[key], color);
        return tint;
      },
    });
  }
  return { ...source, frames };
}

export function registerThreatSprites(): void {
  for (const [id, palette] of Object.entries(PALETTES)) {
    if (spriteSets.get(id)) continue;
    const source = spriteSets.require(palette.source);
    const set = paletteSet(source, palette.color);
    spriteSets.register(id, set);
    spriteRegistry.register(id, set.frames[Object.keys(set.frames)[0]]);
  }
}
