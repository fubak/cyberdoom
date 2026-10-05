import { describe, expect, it } from 'vitest';
import { WALL_TEX_H, WALL_TEX_W } from '../src/render/textures';
import { RES, STATUS_H, TEX, VIEW3D_H, VIEW_H, VIEW_W } from '../src/render/res';

describe('4× native render dimensions', () => {
  it('keeps the viewport and status bar at the expected scale', () => {
    expect(VIEW_W).toBe(320 * RES);
    expect(VIEW_H).toBe(200 * RES);
    expect(STATUS_H).toBe(32 * RES);
    expect(VIEW3D_H).toBe(168 * RES);
  });

  it('keeps packed wall, flat, and monster textures at native scale', () => {
    expect(TEX.wallW).toBe(64 * RES);
    expect(TEX.wallH).toBe(80 * RES);
    expect(TEX.flat).toBe(64 * RES);
    expect(TEX.monster).toBe(64 * RES);
    expect(WALL_TEX_W).toBe(TEX.wallW);
    expect(WALL_TEX_H).toBe(TEX.wallH);
  });
});
