import { expect, test } from '@playwright/test';
import { cd, settleMenus, waitScreen, watchProblems } from './helpers';

async function reachBriefing(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?debug=1');
  await waitScreen(page, 'title');
  await page.locator('[data-menu-item="new-game"]').click();
  await waitScreen(page, 'character-select');
  await page.locator('[data-menu-item="deploy"]').click();
  await waitScreen(page, 'mission-select');
  await page.locator('button.mission-row:not([disabled])').first().click();
  await waitScreen(page, 'briefing');
}

test('play: deploy M01 → play, Escape pauses/resumes, restart and mission select work', async ({ page }) => {
  const probs = watchProblems(page);
  await reachBriefing(page);
  await page.getByRole('button', { name: /deploy/i }).click();
  await waitScreen(page, 'play', 90_000);
  expect((await cd(page)).mission).toBe('m01');

  // Escape → pause menu
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).paused).toBe(true);
  await expect(page.locator('[data-menu-item="resume"]')).toBeVisible();

  // Escape again → resume
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).paused).toBe(false);

  // Pause → RESTART MISSION puts a fresh runtime back into play at spawn
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).paused).toBe(true);
  await page.locator('[data-menu-item="restart"]').click();
  await waitScreen(page, 'play');
  expect((await cd(page)).mission).toBe('m01');
  expect((await cd(page)).paused).toBe(false);

  // Pause → MISSION SELECT leaves play
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).paused).toBe(true);
  await page.locator('[data-menu-item="quit"]').click();
  await waitScreen(page, 'mission-select');
  await expect(page.locator('button.mission-row').first()).toBeVisible();

  expect(probs.errors).toEqual([]);
});

test('perf: deploy→play has no gross frame stall (SwiftShader numbers logged)', async ({ page }) => {
  const probs = watchProblems(page);
  await reachBriefing(page);
  // Let the background mission prep (buildLevel/shader compile/HUD warm) finish
  // in its idle slices so DEPLOY takes the ready path.
  await page.waitForTimeout(6000);
  await settleMenus(page);
  await page.evaluate(() => {
    (window as unknown as { __frameTimes: number[] }).__frameTimes = [];
    const loop = (t: number) => {
      (window as unknown as { __frameTimes: number[] }).__frameTimes.push(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByRole('button', { name: /deploy/i }).click();
  await waitScreen(page, 'play', 90_000);
  await page.waitForTimeout(3000);

  const times = await page.evaluate(() => (window as unknown as { __frameTimes: number[] }).__frameTimes);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  console.log(
    `[frame-gaps] n=${gaps.length} median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`,
  );
  // Gross-regression tripwire only: SwiftShader pacing on CI is slow and noisy.
  expect(max).toBeLessThan(1000);
  expect(probs.errors).toEqual([]);
});
