import { expect, test } from '@playwright/test';
import { waitScreen, watchProblems } from './helpers';

/** Debug hooks used here (see README "Debug hooks"). */
type CdReticle = {
  reticle(): string;
  stage(kind: string, dist: number): unknown;
  cheat(code: string): unknown;
  setTool(slot: number): void;
  fire(): void;
};

test('reticle: over-target, hit confirm, blocked out of range (P2 hit feedback)', async ({ page }) => {
  const probs = watchProblems(page);
  await page.goto('./?debug=1&mission=m01&gender=male');
  await waitScreen(page, 'play', 90_000);
  await page.evaluate(() => {
    const c = (window as unknown as { __cd: CdReticle }).__cd;
    c.cheat('god');
    c.setTool(1);
  });

  // first, before any strike wakes the floor: a threat well beyond keyboard
  // reach reads blocked (out of range)
  await expect
    .poll(async () => page.evaluate(() => {
      const c = (window as unknown as { __cd: CdReticle }).__cd;
      c.stage('worm', 3);
      return c.reticle();
    }), { timeout: 15_000 })
    .toContain('ret-blocked');

  // a worm staged point-blank in front of the keyboard: the tool is ready
  await expect
    .poll(async () => page.evaluate(() => {
      const c = (window as unknown as { __cd: CdReticle }).__cd;
      c.stage('worm', 1);
      return c.reticle();
    }), { timeout: 15_000 })
    .toContain('ret-target');

  // strike: the reticle swaps to the hit X for ~200 ms
  const seen = await page.evaluate(async () => {
    const c = (window as unknown as { __cd: CdReticle }).__cd;
    const classes = new Set<string>();
    c.stage('worm', 1);
    c.fire();
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      classes.add(c.reticle());
      await new Promise((r) => requestAnimationFrame(r));
    }
    return [...classes];
  });
  expect(seen.some((cls) => cls.includes('ret-hit'))).toBe(true);

  expect(probs.errors).toEqual([]);
});
