import { describe, expect, it } from 'vitest';
import { MAX_POINT_LIGHTS, PAYLOAD_LIGHT, SPAWN_LIGHT, fadingLight, pickPointLights, type PointLight } from '../src/render/pointLights';
import { hasGenJob } from '../src/render/gen';
import { buildSprites, spriteSets } from '../src/render/sprites';
import { installFakeCanvas } from './fakecanvas';

/** LOOK: moving lights from projectiles and spawn columns, and the longer effect sequences. */
installFakeCanvas();
buildSprites();

const light = (x: number, y: number, intensity = 1): PointLight => ({ x, y, radius: 3, intensity, col: [1, 1, 1] });

describe('pickPointLights', () => {
  it('never returns more than the shader evaluates', () => {
    const many = Array.from({ length: 12 }, (_, i) => light(i, 0));
    expect(pickPointLights(many, 0, 0)).toHaveLength(MAX_POINT_LIGHTS);
  });

  it('prefers near lights over far ones of the same strength', () => {
    const picked = pickPointLights([light(40, 0), light(2, 0), light(30, 0), light(1, 0), light(3, 0), light(20, 0)], 0, 0);
    expect(picked.map((l) => l.x).sort((a, b) => a - b)).toEqual([1, 2, 3, 20]);
  });

  it('lets a strong light beat a slightly nearer weak one', () => {
    const picked = pickPointLights([light(2, 0, 0.1), light(3, 0, 1.2)], 0, 0, 1);
    expect(picked[0].x).toBe(3);
  });

  it('drops lights that have burnt out', () => {
    expect(pickPointLights([light(1, 0, 0), { ...light(1, 0), radius: 0 }], 0, 0)).toEqual([]);
  });

  it('does not reorder its input', () => {
    const src = [light(9, 0), light(1, 0)];
    pickPointLights(src, 0, 0);
    expect(src.map((l) => l.x)).toEqual([9, 1]);
  });
});

describe('fadingLight', () => {
  it('is full at birth, half way at half life, and out at the end', () => {
    expect(fadingLight(SPAWN_LIGHT, 4, 5, 0, 1).intensity).toBeCloseTo(SPAWN_LIGHT.intensity, 5);
    expect(fadingLight(SPAWN_LIGHT, 4, 5, 0.5, 1).intensity).toBeCloseTo(SPAWN_LIGHT.intensity / 2, 5);
    expect(fadingLight(SPAWN_LIGHT, 4, 5, 2, 1).intensity).toBe(0);
    expect(fadingLight(PAYLOAD_LIGHT, 4, 5, 0, 0).intensity).toBe(0);
  });

  it('keeps its position, reach and colour', () => {
    const l = fadingLight(SPAWN_LIGHT, 4, 5, 0.25, 1);
    expect([l.x, l.y, l.radius, l.col]).toEqual([4, 5, SPAWN_LIGHT.radius, SPAWN_LIGHT.col]);
  });
});

describe('effect sequences', () => {
  const frames = (id: string) => Object.keys(spriteSets.require(id).frames);
  it('are longer than the two-or-three frame originals', () => {
    expect(frames('fx-scan')).toHaveLength(4);
    expect(frames('fx-payload')).toHaveLength(6);
    expect(frames('fx-puff')).toHaveLength(5);
    expect(frames('fx-spawn')).toHaveLength(8);
  });

  it('every frame has a generation job', () => {
    for (const id of ['fx-scan', 'fx-payload', 'fx-puff', 'fx-spawn']) for (const key of frames(id)) expect(hasGenJob(`sprite:${id}:${key}`), `${id} ${key}`).toBe(true);
  });

  it('projectiles animate fast enough to show the longer cycle', () => {
    expect(spriteSets.require('fx-scan').fps).toBe(12);
    expect(spriteSets.require('fx-payload').fps).toBe(12);
  });
});
