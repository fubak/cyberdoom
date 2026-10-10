import { describe, expect, it } from 'vitest';
import { hasGenJob, runGenJob, type GenResult } from '../src/render/gen';
import { buildSprites, spriteSets } from '../src/render/sprites';
import { buildTextures, textureRegistry } from '../src/render/textures';
import { installFakeCanvas } from './fakecanvas';

/**
 * Worker-generation determinism: a registered gen job must produce bytes
 * identical to the texture the classic main-thread path installs for the same
 * frame. Both directions are exercised:
 *  - `runGenJob(key)` is exactly what a generation worker runs (its result is
 *    structured-cloned over postMessage — simulated here — and wrapped by
 *    textureFromPixels on the main thread);
 *  - the frame getter / texture registry holds the legacy synchronous output
 *    (Vitest has no Worker/OffscreenCanvas, so build*() take the fallback path).
 * The pipeline is seeded end-to-end, so any drift between the registered job's
 * parameters (seed, canvas size, mirror, pack opts) and the frame's real
 * parameters shows up as differing bytes.
 */
installFakeCanvas();
buildTextures();
buildSprites();

function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function expectSamePixels(key: string, tex: unknown): void {
  const t = tex as { image: { data: Uint8Array }; mipmaps: { data: Uint8Array }[] };
  // simulate the worker round-trip: job result structured-cloned to main thread
  const res: GenResult = structuredClone(runGenJob(key));
  expect(bytesEqual(res.data, t.image.data), `${key}: base pixels differ`).toBe(true);
  expect(res.mipmaps.length, `${key}: mipmap count differs`).toBe(t.mipmaps.length);
  t.mipmaps.forEach((m, i) => {
    expect(bytesEqual(res.mipmaps[i].data, m.data), `${key}: mip ${i} differs`).toBe(true);
  });
}

describe('gen jobs are byte-identical to the main-thread pipeline', () => {
  it('painted sprite frames (workstation, console, exit sign)', () => {
    for (const [set, frame] of [
      ['workstation', 'idle'],
      ['console', 'f0'],
      ['fx-exit', 'idle'],
    ] as const) {
      const key = `sprite:${set}:${frame}`;
      expect(hasGenJob(key)).toBe(true);
      expectSamePixels(key, spriteSets.require(set).frames[frame]);
    }
  });

  it('monster frames: eager walk0 + lazy attack/die, including mirrored rotations', () => {
    for (const [set, frame] of [
      ['worm', 'walk0_0'],
      ['worm', 'attack1_2'],
      ['trojan', 'walk1_1'],
      ['trojan', 'die3'],
      ['ransomware', 'pain_5'],
    ] as const) {
      const key = `sprite:${set}:${frame}`;
      expect(hasGenJob(key)).toBe(true);
      expectSamePixels(key, spriteSets.require(set).frames[frame]);
    }
  });

  it('wall and flat textures', () => {
    for (const id of ['wall-panel', 'wall-server', 'floor', 'ceil-light', 'exit', 'door']) {
      expect(hasGenJob(`tex:${id}`)).toBe(true);
      expectSamePixels(`tex:${id}`, textureRegistry.require(id));
    }
  });

  it('a job run twice on the calling thread is deterministic', () => {
    const a = runGenJob('sprite:worm:walk0_0');
    const b = runGenJob('sprite:worm:walk0_0');
    expect(bytesEqual(a.data, b.data)).toBe(true);
    const c = runGenJob('tex:floor');
    const d = runGenJob('tex:floor');
    expect(bytesEqual(c.data, d.data)).toBe(true);
  });
});
