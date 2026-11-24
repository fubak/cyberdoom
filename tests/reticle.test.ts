import { describe, expect, it } from 'vitest';
import { HIT_FLASH_S, HIT_MARK_S, HitConfirm, RETICLE_STATES, reticleClass, reticleState } from '../src/ui/reticle';

describe('reticle states (P2 hit feedback)', () => {
  it('idle with no tool hint', () => {
    expect(reticleState(null, false)).toBe('idle');
  });

  it('over-target when the current tool is ready on the aimed target', () => {
    expect(reticleState({ ready: true }, false)).toBe('target');
  });

  it('blocked when the tool cannot act: out of range, wrong target, out of ammo', () => {
    expect(reticleState({ ready: false, fleeting: true }, false)).toBe('blocked');
    expect(reticleState({ ready: false }, false)).toBe('blocked');
  });

  it('a landed hit wins over every other state', () => {
    expect(reticleState({ ready: true }, true)).toBe('hit');
    expect(reticleState(null, true)).toBe('hit');
  });

  it('every state maps to a distinct class', () => {
    const classes = RETICLE_STATES.map((s) => reticleClass(s, false));
    expect(new Set(classes).size).toBe(RETICLE_STATES.length);
    expect(reticleClass('hit', true)).toContain('ret-flash');
    expect(reticleClass('hit', false)).not.toContain('ret-flash');
  });
});

describe('HitConfirm', () => {
  it('marks a hit for HIT_MARK_S and flashes for HIT_FLASH_S', () => {
    const h = new HitConfirm();
    expect(h.marked(0)).toBe(false);
    expect(h.hit(10)).toBe(true);
    expect(h.marked(10 + HIT_MARK_S * 0.5)).toBe(true);
    expect(h.flashing(10 + HIT_FLASH_S * 0.5)).toBe(true);
    expect(h.flashing(10 + HIT_FLASH_S + 0.01)).toBe(false);
    expect(h.marked(10 + HIT_MARK_S + 0.01)).toBe(false);
  });

  it('honours the 3-per-second flash budget: rapid hits still mark, but stop flashing', () => {
    const h = new HitConfirm();
    const flashed = [0, 0.1, 0.2, 0.3, 0.4].map((t) => h.hit(t));
    expect(flashed).toEqual([true, true, true, false, false]);
    expect(h.marked(0.41)).toBe(true);
    expect(h.flashing(0.41)).toBe(false);
    // a second later the budget refills
    expect(h.hit(1.5)).toBe(true);
  });

  it('one strike reported by two events in the same instant spends one flash', () => {
    const h = new HitConfirm();
    expect(h.hit(5)).toBe(true);
    expect(h.hit(5)).toBe(true);
    expect(h.hit(5.2)).toBe(true);
    expect(h.hit(5.4)).toBe(true);
    // budget is 3/s: the 4th distinct strike inside the second is refused
    expect(h.hit(5.6)).toBe(false);
  });

  it('can be told not to flash at all (reduced flashing)', () => {
    const h = new HitConfirm();
    expect(h.hit(1, false)).toBe(false);
    expect(h.marked(1.05)).toBe(true);
    expect(h.flashing(1.05)).toBe(false);
  });

  it('reset clears marks and the budget', () => {
    const h = new HitConfirm();
    h.hit(0);
    h.reset();
    expect(h.marked(0.01)).toBe(false);
  });
});

describe('reticle stylesheet', () => {
  // vitest stubs CSS imports, so read the file through node's fs (no @types/node here)
  const nodeFs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(p: URL, enc: string): string } } })
    .process.getBuiltinModule('node:fs');
  const css = nodeFs.readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
  it('styles every state, and the ring keeps a dark outline so it reads over a point-blank sprite', () => {
    for (const s of RETICLE_STATES) expect(css).toContain(`#crosshair.${reticleClass(s, false)}`);
    expect(css).toContain('#crosshair.ret-flash');
    expect(/#crosshair\s*\{[^}]*box-shadow/.test(css)).toBe(true);
  });
});
