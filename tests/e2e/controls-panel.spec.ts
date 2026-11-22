import { expect, test } from '@playwright/test';
import { cd, waitScreen, watchProblems } from './helpers';

test('controls panel captures a new key and Escape cancels capture', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/?debug=1');
  await expect.poll(async () => (await cd(page)).screen).toBe('title');
  await page.evaluate(() => window.__cd!.startMission('m01'));
  await waitScreen(page, 'play');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).paused).toBe(true);
  await page.locator('[data-menu-item="controls"]').click();

  const forward = page.locator('[data-action="forward"]');
  await expect(forward).toBeVisible();
  await forward.click();
  await expect(forward).toContainText('PRESS A KEY  (ESC CANCELS)');
  await page.keyboard.press('Escape');
  await expect(forward).toContainText('MOVE FORWARD');

  await forward.click();
  await page.keyboard.press('1');
  await expect(page.locator('.cd-controls-note')).toHaveText('SLOT NUMBER KEYS STAY FIXED.');
  await expect(forward).toContainText('PRESS A KEY  (ESC CANCELS)');
  await page.keyboard.press('Escape');

  await forward.focus();
  await page.keyboard.press('Enter');
  await expect(forward).toContainText('PRESS A KEY  (ESC CANCELS)');
  await page.keyboard.press('i');
  await expect(forward).toContainText('MOVE FORWARD');
  await expect(forward).toContainText('I');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('cyberdoom-settings') ?? '{}');
    return saved.bindings?.forward;
  })).toEqual(['KeyI']);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-menu-item="resume"]')).toBeVisible();
  await expect(page.locator('.cd-pause-help')).toContainText('I/S MOVE');
  expect(problems.errors).toEqual([]);
});
