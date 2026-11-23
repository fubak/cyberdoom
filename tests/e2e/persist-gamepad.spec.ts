import { expect, test } from '@playwright/test';
import { cd, waitScreen, watchProblems } from './helpers';

test('a quicksave survives a page reload and CONTINUE on the title resumes it', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/?debug=1&mission=m01');
  await waitScreen(page, 'play', 90_000);
  await page.evaluate(() => window.__cd!.teleport(3.5, 3.5, 0));
  await page.keyboard.press('F5');
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('QUICKSAVED');
  const saved = await cd(page);

  await page.goto('/?debug=1');
  await waitScreen(page, 'title');
  await page.locator('[data-menu-item="continue"]').click();
  await waitScreen(page, 'play', 90_000);
  await expect.poll(async () => (await cd(page)).hudMessages).toContain('RESTORED: QUICKSAVE');
  await expect.poll(async () => cd(page)).toMatchObject({ mission: 'm01', x: saved.x, y: saved.y });
  expect(problems.errors).toEqual([]);
});

test('gamepad A/B/D-pad navigate the title and character select menus', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { buttons: Array.from({ length: 17 }, () => false) };
    (window as unknown as { __pad: typeof state }).__pad = state;
    const pad = () => ({
      index: 0,
      id: 'test-pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: state.buttons.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
      timestamp: performance.now(),
    });
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad()], configurable: true });
  });
  const problems = watchProblems(page);
  const tap = async (index: number) => {
    await page.evaluate((i) => { (window as unknown as { __pad: { buttons: boolean[] } }).__pad.buttons[i] = true; }, index);
    await page.waitForTimeout(120);
    await page.evaluate((i) => { (window as unknown as { __pad: { buttons: boolean[] } }).__pad.buttons[i] = false; }, index);
    await page.waitForTimeout(120);
  };
  await page.goto('/?debug=1');
  await waitScreen(page, 'title');
  await page.waitForTimeout(400);
  await tap(0);
  await waitScreen(page, 'character-select');
  await page.waitForTimeout(400);
  await tap(1);
  await waitScreen(page, 'title');
  expect(problems.errors).toEqual([]);
});
