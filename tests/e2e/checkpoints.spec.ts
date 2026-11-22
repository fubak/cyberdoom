import { expect, test } from '@playwright/test';
import { cd, waitScreen, watchProblems } from './helpers';

test('F5 quicksave and F9 quickload report their messages and restore the saved state', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/?debug=1&mission=m01');
  await waitScreen(page, 'play', 90_000);

  await page.keyboard.press('F9');
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('NO QUICKSAVE');

  const saved = await cd(page);
  await page.keyboard.press('F5');
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('QUICKSAVED');

  await page.evaluate(() => window.__cd!.teleport(20.5, 20.5, 0));
  await page.keyboard.press('F9');
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('RESTORED: QUICKSAVE');
  await expect.poll(async () => cd(page)).toMatchObject({ x: saved.x, y: saved.y, screen: 'play' });

  await page.keyboard.press('Escape');
  await expect(page.getByText('F5 QUICKSAVE / F9 QUICKLOAD')).toBeVisible();
  await page.keyboard.press('F5');
  await expect.poll(async () => (await cd(page)).hudMessages).not.toContain('QUICKSAVED');
  expect(problems.errors).toEqual([]);
});

test('R restores the latest quicksave from the loss debrief', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/?debug=1&mission=m01');
  await waitScreen(page, 'play', 90_000);
  await page.waitForTimeout(1500);

  const saved = await cd(page);
  await page.keyboard.press('F5');
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('QUICKSAVED');

  await page.evaluate(() => {
    const state = window.__cd!.state();
    const enemy = state.entities.find((e) => e.kind === 'enemy' && e.alive);
    if (!enemy) throw new Error('no live enemy in M01');
    window.__cd!.setIntegrity(1);
    window.__cd!.teleport(enemy.x + 0.8, enemy.y, Math.PI);
  });
  await waitScreen(page, 'debrief');

  const canvas = page.locator('canvas.cd-pixel-canvas');
  await expect(canvas).toHaveAttribute('aria-label', /RETRY CHECKPOINT: QUICKSAVE/);
  await page.keyboard.press('r');
  await expect.poll(async () => cd(page)).toMatchObject({ x: saved.x, y: saved.y, screen: 'play' });
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('RESTORED: QUICKSAVE');
  expect(problems.errors).toEqual([]);
});
