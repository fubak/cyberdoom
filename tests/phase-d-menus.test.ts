import { describe, expect, it } from 'vitest';
import { Feel, FlashRateLimiter } from '../src/engine/feel';
import { flashBudget, flashStrength } from '../src/engine/flashPolicy';
import { missionRegistry } from '../src/content/missions';
import { contrastRatio } from '../src/ui/contrast';
import { LOCKED_ROW, LOCKED_TITLE_RAMP } from '../src/ui/menuTheme';
import { applyBack } from '../src/ui/nav';
import { horizontalFovDeg, optionItems } from '../src/ui/options';
import { DEFAULT_SETTINGS, FOV_STEPS, type Settings } from '../src/ui/settings';
import { THREAT_LEVELS, threatLegend, threatLevelFor } from '../src/ui/threatLegend';
import { missionSelectCard } from '../src/ui/screens';
import { titleMenuLayout } from '../src/render/titleMenu';

describe('reduced flashing policy', () => {
  it('cuts the full-screen flash budget and strength when enabled', () => {
    expect(flashBudget(false)).toBe(3);
    expect(flashBudget(true)).toBeLessThan(flashBudget(false));
    expect(flashStrength(false)).toBe(1);
    expect(flashStrength(true)).toBeGreaterThan(0);
    expect(flashStrength(true)).toBeLessThan(0.5);
  });

  it('a reduced budget limiter admits one flash per second', () => {
    const limiter = new FlashRateLimiter(flashBudget(true));
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(0.3)).toBe(false);
    expect(limiter.allow(1.01)).toBe(true);
  });

  it('dims the pain wash and pickup glow without removing the view kick', () => {
    const full = new Feel();
    const reduced = new Feel();
    reduced.setWashScale(flashStrength(true));
    full.hurt(20, 1);
    reduced.hurt(20, 1);
    expect(reduced.red).toBeGreaterThan(0);
    expect(reduced.red).toBeLessThan(full.red * 0.5);
    expect(reduced.hurtPitch).toBeCloseTo(full.hurtPitch);
    full.bonus();
    reduced.bonus();
    expect(reduced.bonusAmt).toBeLessThan(full.bonusAmt);
  });
});

describe('options menu items', () => {
  const ids = optionItems().map((item) => item.id);

  it('lists every option including fov and reduced flashing', () => {
    expect(ids).toEqual(['music', 'sfx', 'sensitivity', 'fov', 'view-bob', 'color-blind', 'reduced-flash']);
  });

  it('steps settings without mutating the input', () => {
    const before: Settings = { ...DEFAULT_SETTINGS, bindings: {} };
    const frozen = Object.freeze({ ...before });
    for (const item of optionItems()) {
      const next = item.next(frozen);
      expect(next).not.toBe(frozen);
      expect(frozen).toEqual(before);
    }
  });

  it('cycles fov through the ladder and labels it in horizontal degrees', () => {
    const fov = optionItems().find((item) => item.id === 'fov')!;
    let s: Settings = { ...DEFAULT_SETTINGS };
    const seen: number[] = [];
    for (let i = 0; i < FOV_STEPS.length; i++) {
      seen.push(s.fov);
      s = fov.next(s);
    }
    expect(seen.sort((a, b) => a - b)).toEqual([...FOV_STEPS]);
    expect(fov.label(DEFAULT_SETTINGS)).toBe('FIELD OF VIEW 93');
  });

  it('toggles reduced flashing with an ON/OFF label', () => {
    const item = optionItems().find((entry) => entry.id === 'reduced-flash')!;
    expect(item.label(DEFAULT_SETTINGS)).toBe('REDUCED FLASHING OFF');
    const on = item.next(DEFAULT_SETTINGS);
    expect(on.reducedFlash).toBe(true);
    expect(item.label(on)).toBe('REDUCED FLASHING ON');
  });

  it('converts vertical fov to horizontal for the 1280x672 view', () => {
    expect(horizontalFovDeg(58, 1280 / 672)).toBe(93);
    expect(horizontalFovDeg(70, 1280 / 672)).toBeGreaterThan(100);
  });
});

describe('options and controls back stack', () => {
  it('returns to the title from the title menu panels', () => {
    expect(applyBack({ screen: 'title', overlay: 'options' })).toEqual({ screen: 'title', overlay: 'none' });
    expect(applyBack({ screen: 'title', overlay: 'controls' })).toEqual({ screen: 'title', overlay: 'none' });
  });

  it('returns to the pause menu from the in-mission panels', () => {
    expect(applyBack({ screen: 'play', overlay: 'options' })).toEqual({ screen: 'play', overlay: 'pause' });
    expect(applyBack({ screen: 'play', overlay: 'controls' })).toEqual({ screen: 'play', overlay: 'pause' });
  });
});

describe('title menu layout', () => {
  it('keeps the plate bottom fixed and every row inside the frame', () => {
    for (const count of [4, 5, 6]) {
      const layout = titleMenuLayout(count);
      const plateBottom = layout.menuY - 8 + count * layout.rowH + 10;
      expect(plateBottom).toBeLessThanOrEqual(186);
      expect(layout.menuY - 8).toBeGreaterThan(72); // below the logo band
      expect(layout.rowH).toBeGreaterThanOrEqual(12); // skull cursor is 10px tall
    }
    expect(titleMenuLayout(4)).toEqual({ menuY: 128, rowH: 14 });
  });
});

describe('mission select threat legend', () => {
  it('derives every marker from the threat level table', () => {
    const levels = new Set(missionRegistry.all().map((m) => missionSelectCard(m).threatLevel));
    for (const level of levels) expect(THREAT_LEVELS.some((entry) => entry.level === level)).toBe(true);
    expect(threatLegend()).toBe('THREAT  ! = LOW  ·  !! = MED  ·  !!! = HIGH');
  });

  it('maps difficulty to a clamped level', () => {
    expect(threatLevelFor(1).label).toBe('LOW');
    expect(threatLevelFor(5).label).toBe('MED');
    expect(threatLevelFor(9).label).toBe('HIGH');
    expect(threatLevelFor(40).label).toBe('HIGH');
    expect(threatLevelFor(0).label).toBe('LOW');
  });
});

describe('locked mission row contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('meets 4.5:1 for locked titles and taglines (every title ramp step too)', () => {
    expect(contrastRatio(LOCKED_ROW.title, LOCKED_ROW.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LOCKED_ROW.text, LOCKED_ROW.bg)).toBeGreaterThanOrEqual(4.5);
    for (const step of LOCKED_TITLE_RAMP) expect(contrastRatio(step, LOCKED_ROW.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the old 45% opacity fade failed the same check', () => {
    // tagline #b8c2c8 at 45% over the #1e1818 row on the #0a0a10 page ~ #565858 on #120f12
    expect(contrastRatio('#565858', '#120f12')).toBeLessThan(4.5);
  });
});
