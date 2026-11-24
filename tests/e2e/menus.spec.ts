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
  const details = page.locator('.cd-briefing-details-page');
  await expect(details).toBeVisible();
  await expect(details).toHaveAttribute('data-page', '1');
  // Paging: D / Right = next, A / Left = previous, plus on-screen buttons.
  if (Number(await details.getAttribute('data-pages')) > 1) {
    await expect(page.locator('button[data-page="prev"]')).toBeDisabled();
    await page.keyboard.press('d');
    await expect(details).toHaveAttribute('data-page', '2');
    await page.keyboard.press('a');
    await expect(details).toHaveAttribute('data-page', '1');
    await page.keyboard.press('ArrowRight');
    await expect(details).toHaveAttribute('data-page', '2');
    await page.keyboard.press('ArrowLeft');
    await expect(details).toHaveAttribute('data-page', '1');
    await page.locator('button[data-page="next"]').click();
    await expect(details).toHaveAttribute('data-page', '2');
    await page.locator('button[data-page="prev"]').click();
    await expect(details).toHaveAttribute('data-page', '1');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.cd-briefing-details-page')).toHaveCount(0);
  await waitScreen(page, 'briefing');
  await page.keyboard.press('Escape');
  await waitScreen(page, 'mission-select');

  expect(probs.errors).toEqual([]);
});

test('title → Options → back: settings persist and Escape returns to the title', async ({ page }) => {
  const probs = watchProblems(page);
  await page.goto('/?debug=1');
  await waitScreen(page, 'title');
  await expect(page.locator('[data-menu-item="options"]')).toBeAttached();
  await expect(page.locator('[data-menu-item="controls"]')).toBeAttached();

  await page.locator('[data-menu-item="options"]').click();
  const panel = page.locator('[data-options-panel]');
  await expect(panel).toBeVisible();
  const fov = panel.locator('[data-menu-item="fov"]');
  const flash = panel.locator('[data-menu-item="reduced-flash"]');
  await expect(fov).toHaveText('FIELD OF VIEW 93');
  await expect(flash).toHaveText('REDUCED FLASHING OFF');
  await settleMenus(page);
  await fov.click();
  await flash.click();
  await expect(flash).toHaveText('REDUCED FLASHING ON');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('cyberdoom-settings') ?? '{}');
    return [saved.fov, saved.reducedFlash];
  })).toEqual([62, true]);

  // keyboard navigation moves focus between entries
  await flash.focus();
  await page.keyboard.press('ArrowDown');
  await expect(panel.locator('[data-menu-item="options-back"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('canvas.title-px')).toBeVisible();
  await waitScreen(page, 'title');

  // mouse BACK also returns; the saved values come back on reopen
  await page.locator('[data-menu-item="options"]').click();
  await expect(page.locator('[data-menu-item="reduced-flash"]')).toHaveText('REDUCED FLASHING ON');
  await settleMenus(page);
  await page.locator('[data-menu-item="options-back"]').click();
  await expect(page.locator('canvas.title-px')).toBeVisible();
  expect(probs.errors).toEqual([]);
});

test('title → Controls → back via Escape and via keyboard menu selection', async ({ page }) => {
  const probs = watchProblems(page);
  await page.goto('/?debug=1');
  await waitScreen(page, 'title');

  await page.locator('[data-menu-item="controls"]').click();
  const panel = page.locator('[data-controls-panel]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-action="forward"]')).toContainText('MOVE FORWARD');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('canvas.title-px')).toBeVisible();

  // returning keeps the cursor on CONTROLS, so Enter reopens it
  await settleMenus(page);
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await settleMenus(page);
  await panel.locator('.cd-controls-actions [data-menu-item="back"]').click();
  await expect(page.locator('canvas.title-px')).toBeVisible();
  await waitScreen(page, 'title');

  // fresh title: walk the menu by keyboard (new-game, missions, options, controls) and Enter
  await page.mouse.move(2, 2);
  await page.goto('/?debug=1');
  await waitScreen(page, 'title');
  await settleMenus(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  expect(probs.errors).toEqual([]);
});

test('letterbox: the page behind the 4:3 frame is the themed backdrop and locked rows are not faded', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('canvas.title-px')).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  expect(bg).toContain('gradient');
  const frame = await page.locator('#viewport').boundingBox();
  expect(frame).not.toBeNull();
  expect(frame!.width).toBeLessThanOrEqual(1920);
  expect(frame!.height).toBeLessThanOrEqual(1080);

  await page.locator('[data-menu-item="new-game"]').click();
  await page.locator('[data-menu-item="deploy"]').click();
  await expect(page.locator('[data-threat-legend]')).toContainText('! = LOW');
  const locked = page.locator('button.mission-row.locked').first();
  if (await locked.count()) {
    expect(await locked.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  }
});
