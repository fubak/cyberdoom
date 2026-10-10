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

    // threat-tinted data-blood: non-hot shards stay inside the tint's hue
    const blood = new ParticleSystem(() => 0.5);
    blood.burst(0, 0, 0.4, 'kill', [0.2, 0.9, 0.3]);
    let tinted = 0;
    for (let i = 0; i < 48; i++) {
      if (blood.color[i * 3 + 1] > blood.color[i * 3] && blood.color[i * 3 + 1] > blood.color[i * 3 + 2]) tinted++;
    }
    expect(tinted).toBeGreaterThan(30);

    const charge = new ParticleSystem();
    charge.charge(3, 4, 0.7, 0.5);
    expect(charge.view().count).toBe(1);
    expect(charge.size[0]).toBeCloseTo(0.2);
    expect(charge.minPx[0]).toBeCloseTo(5.5);
    expect(charge.color[0]).toBe(1);
    expect(charge.color[1]).toBeCloseTo(0.925);
    expect(charge.color[2]).toBeCloseTo(0.45);
    charge.update(1 / 60);
    expect(charge.view().count).toBe(0);
  });

  it('toolImpact stays under 32 particles per call and gives tools distinct colours', () => {
    const signature = (tool: string) => {
      const p = new ParticleSystem(() => 0.5);
      p.toolImpact(tool, 5, 5, 0.4, 0, 0);
      expect(p.view().count).toBeLessThanOrEqual(32);
      expect(p.view().count).toBeGreaterThan(0);
      // mean colour signature over all spawned particles
      const c = p.color;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < p.view().count; i++) { r += c[i * 3]; g += c[i * 3 + 1]; b += c[i * 3 + 2]; }
      return `${Math.round(r * 2)}.${Math.round(g * 2)}.${Math.round(b * 2)}`;
    };
    const sigs = ['keyboard', 'usb', 'edr', 'tap', 'mouse', 'patch'].map(signature);
    expect(new Set(sigs).size).toBe(sigs.length);
    // keyboard = amber (warm), usb = cyan (cool), patch = green
    const kb = new ParticleSystem(() => 0.5);
    kb.toolImpact('keyboard', 5, 5, 0.4);
    expect(kb.color[3]).toBeGreaterThan(kb.color[5]); // 2nd shard: amber, not white
    const usb = new ParticleSystem(() => 0.5);
    usb.toolImpact('usb', 5, 5, 0.4);
    expect(usb.color[2]).toBeGreaterThan(usb.color[0]);
    const badgeBad = new ParticleSystem(() => 0.5);
    badgeBad.toolImpact('badge', 5, 5, 0.4, undefined, undefined, false);
    expect(badgeBad.color[0]).toBe(1); // red reader sparkle
    const badgeOk = new ParticleSystem(() => 0.5);
    badgeOk.toolImpact('badge', 5, 5, 0.4, undefined, undefined, true);
    expect(badgeOk.color[1]).toBe(1); // green reader sparkle
  });

  it('keyboard shards never fly toward the camera (spawned 1 tile ahead)', () => {
    const p = new ParticleSystem(); // full rng spread: worst-case tangential angles
    const px = 0, py = 0;
    p.toolImpact('keyboard', 0, 1, 0.4, px, py); // target 1 tile in front
    for (let step = 0; step < 12; step++) {
      p.update(1 / 60);
      const v = p.view();
      for (let i = 0; i < v.count; i++) {
        expect(Math.hypot(v.x[i] - px, v.y[i] - py)).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
  });
});
