import { expect, test, type Page } from '@playwright/test';
import { cd, waitScreen, watchProblems } from './helpers';

async function bootAndDie(page: Page) {
  const { errors } = watchProblems(page);
  await page.goto('/?mission=m01&gender=female&debug=1');
  await waitScreen(page, 'play');
  await page.evaluate(() => {
    const st = window.__cd!.state();
    const enemy = st.entities.find((e) => e.kind === 'enemy' && e.alive);
    if (!enemy) throw new Error('no live enemy in M01');
    window.__cd!.setIntegrity(1);
    window.__cd!.teleport(enemy.x + 0.8, enemy.y, Math.PI);
  });
  await waitScreen(page, 'debrief');
  return errors;
}

test.describe('death debrief', () => {
  test('shows cause of failure, knowledge check is optional, Escape redeploys', async ({ page }) => {
    const errors = await bootAndDie(page);
    const canvas = page.locator('canvas.cd-pixel-canvas');
    await expect(canvas).toHaveAttribute('aria-label', /CAUSE OF FAILURE/);
    await expect(canvas).toHaveAttribute('aria-label', /INTEGRITY DEPLETED/);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.keyboard.press('k');
      const opened = await expect(canvas)
        .toHaveAttribute('aria-label', /KNOWLEDGE CHECK/, { timeout: 800 })
        .then(() => true)
        .catch(() => false);
      if (opened) break;
      if (attempt === 4) throw new Error('knowledge check did not open after retries');
    }
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await cd(page)).screen).toBe('play');
    expect((await cd(page)).integrity).toBe(100);
    expect(errors).toEqual([]);
  });

  test('Enter on the cause-of-failure report redeploys', async ({ page }) => {
    const errors = await bootAndDie(page);
    const canvas = page.locator('canvas.cd-pixel-canvas');
    await expect(canvas).toHaveAttribute('aria-label', /CAUSE OF FAILURE/);
    // Enter on the last cause-of-failure page redeploys; allow an extra press
    // for the intro-animation skip, then stop as soon as play starts.
    let screen = 'debrief';
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Enter');
      screen = await expect
        .poll(async () => (await cd(page)).screen, { timeout: 1500 })
        .toBe('play')
        .then(() => 'play' as const)
        .catch(async () => (await cd(page)).screen);
      if (screen === 'play') break;
    }
    expect(screen).toBe('play');
    expect(errors).toEqual([]);
  });
});
