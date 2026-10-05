import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, ParticleSystem } from '../src/engine/fx';

describe('particle system', () => {
  it('keeps a fixed pool, caps at MAX, and overwrites without reallocating its arrays', () => {
    const particles = new ParticleSystem(() => 0.5);
    const view = particles.view();
    const positions = view.x;
    const colors = view.color;
    for (let i = 0; i < 8; i++) particles.burst(i, 0, 0.4, 'kill');
    expect(particles.view().count).toBe(MAX_PARTICLES);
    expect(view.x).toBe(positions);
    expect(view.color).toBe(colors);
    expect(positions).toHaveLength(MAX_PARTICLES);
    expect(colors).toHaveLength(MAX_PARTICLES * 3);
    particles.update(0.01);
    expect(particles.view().x).toBe(positions);
    expect(particles.view().color).toBe(colors);
  });

  it('creates the kill flash, hit sparks, and a one-tick charge glow', () => {
    const kill = new ParticleSystem(() => 0.5);
    kill.burst(1, 2, 0.4, 'kill');
    expect(kill.view().count).toBe(49);
    expect(kill.size[48]).toBeCloseTo(0.6);
    expect(kill.life[48]).toBeCloseTo(0.12);
    expect(kill.minPx[48]).toBe(6);

    const hit = new ParticleSystem(() => 0.5);
    hit.burst(1, 2, 0.4, 'hit');
    expect(hit.view().count).toBe(10);

    const charge = new ParticleSystem();
    charge.charge(3, 4, 0.7, 0.5);
    expect(charge.view().count).toBe(1);
    expect(charge.size[0]).toBeCloseTo(0.14);
    expect(charge.minPx[0]).toBeCloseTo(4);
    expect(charge.color[0]).toBe(1);
    expect(charge.color[1]).toBeCloseTo(0.925);
    expect(charge.color[2]).toBeCloseTo(0.45);
    charge.update(1 / 60);
    expect(charge.view().count).toBe(0);
  });
});
