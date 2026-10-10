import { expect, test } from '@playwright/test';
import { settleMenus, waitScreen, watchProblems } from './helpers';

/**
 * Boot + menu back-stack. Title/character-select are canvases whose entries
 * are transparent <button data-menu-item> overlays; mission select rows are
 * real <button.mission-row>; briefing/pause are DOM screens.
 */

test('boot: title renders with no page, console or network errors', async ({ page }) => {
  const probs = watchProblems(page);
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('canvas.title-px')).toBeVisible();
  await expect(page.locator('[data-menu-item="new-game"]')).toBeAttached();
  await expect(page.locator('[data-menu-item="read-this"]')).toBeAttached();
  // give the title's rAF loop a few frames to surface any runtime error
  await page.waitForTimeout(1500);
  expect(probs.errors).toEqual([]);
});

test('menu back-stack: title → read-this → char select → mission select → briefing → details', async ({ page }) => {
  const probs = watchProblems(page);
  await page.goto('/?debug=1');
  await waitScreen(page, 'title');

  // Read This! opens the about panel; Escape backs out to the title menu.
  await page.locator('[data-menu-item="read-this"]').click();
  await page.keyboard.press('Escape');
  await waitScreen(page, 'title');

  // New Game → character select; pick the female analyst; Escape → title.
  await page.locator('[data-menu-item="new-game"]').click();
  await waitScreen(page, 'character-select');
  await page.locator('[data-menu-item="analyst-female"]').click();
  await settleMenus(page);
  await page.keyboard.press('Escape');
  await waitScreen(page, 'title');

  // Forward again → DEPLOY → mission select; Escape → character select.
  await page.locator('[data-menu-item="new-game"]').click();
  await waitScreen(page, 'character-select');
  await page.locator('[data-menu-item="deploy"]').click();
  await waitScreen(page, 'mission-select');
  await settleMenus(page);
  await page.keyboard.press('Escape');
  await waitScreen(page, 'character-select');

  // Forward again → first unlocked mission row → briefing.
  await page.locator('[data-menu-item="deploy"]').click();
  await waitScreen(page, 'mission-select');
  await page.locator('button.mission-row:not([disabled])').first().click();
  await waitScreen(page, 'briefing');

  // D opens the details page; Escape → briefing; Escape → mission select.
  await settleMenus(page);
  await page.keyboard.press('d');
  await expect(page.locator('.cd-briefing-details-page')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cd-briefing-details-page')).toHaveCount(0);
  await waitScreen(page, 'briefing');
  await page.keyboard.press('Escape');
  await waitScreen(page, 'mission-select');

  expect(probs.errors).toEqual([]);
});
