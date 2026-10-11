/**
 * Dev preview: bake rig hand poses to PNGs in /tmp/hands/.
 * Run: npx vite-node tools/hand-preview.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { rasterize, type Prim } from '../src/render/model';
import { handPrims, type Place } from '../src/render/handrig';
import { SKIN_TONES } from '../src/tools/look';
import { RES } from '../src/render/res';
import { posePrims, POSES } from '../src/render/handposes';

export function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.slice(y * w * 4, (y + 1) * w * 4).forEach((v, i) => (raw[y * (w * 4 + 1) + 1 + i] = v));
  }
  const idat = deflateSync(raw);
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let x = n;
      for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
      t[n] = x >>> 0;
    }
    for (const byte of b) c = t[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const cs = Buffer.alloc(4);
    cs.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cs]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('/tmp/hands', { recursive: true });
const skin = SKIN_TONES[1];
const spec = { gender: 'male' as const, skin };

// one PNG per named pose: prims from handposes.ts
for (const name of Object.keys(POSES)) {
  const fr = POSES[name];
  const prims: Prim[] = [];
  const cx = (fr.w / 2) * RES;
  for (const p of fr.hands) {
    const q: Place = {
      ...p,
      wrist: [p.wrist[0] * RES - cx, p.wrist[1] * RES, p.wrist[2] * RES],
      size: p.size * RES,
      arm: p.arm ? [p.arm[0] * RES - cx, p.arm[1] * RES, p.arm[2] * RES] : undefined,
    };
    prims.push(...handPrims(q, spec));
  }
  prims.push(...(fr.extra ?? []));
  const W = Math.round(fr.w * RES);
  const H = Math.round(fr.h * RES);
  const { rgba } = rasterize(W, H, prims, { view: 0, persp: fr.persp ?? 0 });
  writeFileSync(`/tmp/hands/${name}.png`, png(W, H, rgba));
  console.log(name, `${W}x${H}`);
}
console.log('done');
