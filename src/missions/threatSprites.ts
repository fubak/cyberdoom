import * as THREE from 'three';
import { spriteRegistry, spriteSets, type SpriteSet } from '../render/sprites';

const PALETTES: Record<string, { source: string; color: [number, number, number] }> = {
  logicbomb: { source: 'worm', color: [255, 176, 64] },
  rat: { source: 'trojan', color: [96, 255, 144] },
  rootkit: { source: 'ransomware', color: [144, 112, 255] },
};

function recolor(texture: THREE.Texture, color: [number, number, number]): THREE.DataTexture {
  if (!(texture instanceof THREE.DataTexture)) throw new Error('Threat sprite frames must use DataTexture');
  const image = texture.image as { data: Uint8Array; width: number; height: number };
  const data = new Uint8Array(image.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const brightness = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
    data[i] = color[0] * brightness;
    data[i + 1] = color[1] * brightness;
    data[i + 2] = color[2] * brightness;
  }
  const clone = new THREE.DataTexture(data, image.width, image.height, texture.format as THREE.PixelFormat, texture.type);
  clone.copy(texture);
  clone.image = { data, width: image.width, height: image.height };
  clone.needsUpdate = true;
  return clone;
}

function paletteSet(source: SpriteSet, color: [number, number, number]): SpriteSet {
  const frames = Object.fromEntries(
    Object.entries(source.frames).map(([key, texture]) => [key, recolor(texture, color)]),
  );
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
