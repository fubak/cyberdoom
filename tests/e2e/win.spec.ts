import { expect, test, type Page } from '@playwright/test';
import { aimAt, cd, closeDossier, fire, selectTool, teleport, waitScreen, watchProblems } from './helpers';

/**
 * Win path: drive M01 "Patch Tuesday" to the debrief screen in a real browser.
 * Mirrors m01Walkthrough (src/missions/walkthroughs.ts) using the ?debug=1
 * hooks: __cd.teleport for `goto`, E for `use`/`badge`/`interact`, and the
 * MOUSE (slot 2) + USB SCANNER (slot 3) for `inspect`/`clean`.
 */

const MOUSE = 2;
const USB = 3;

async function inspectAndClean(page: Page, id: string, x: number, y: number): Promise<void> {
  // MOUSE inspect first — cleaning an unconfirmed host is rejected, and the
  // inspect evidence opens the dossier, which then swallows all input.
  const before = (await cd(page)).dossier.entries;
  for (let attempt = 0; attempt < 4; attempt++) {
    await aimAt(page, id, x, y);
    await selectTool(page, MOUSE, 'mouse');
    await fire(page);
    const inspected = await expect
      .poll(async () => (await cd(page)).dossier.entries > before, { timeout: 2500 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (inspected) break;
    if (attempt === 3) throw new Error(`could not inspect ${id}`);
  }
  // The dossier is open on the case file — the "WHAT DO YOU DO?" call gates the
  // clean. These hosts are all malicious: option 1 (quarantine + clean).
  await page.keyboard.press('1');
  await closeDossier(page);
  // USB scan at arm's length; retry in case a roaming worm eats a shot.
  for (let attempt = 0; attempt < 6; attempt++) {
    await aimAt(page, id, x, y);
    await selectTool(page, USB, 'usb');
    await fire(page);
    const dead = await expect
      .poll(async () => (await cd(page)).entities.find((e) => e.id === id)?.alive, { timeout: 2500 })
      .toBe(false)
      .then(() => true)
      .catch(() => false);
    if (dead) return;
    await closeDossier(page);
  }
  throw new Error(`could not clean ${id}`);
}

test('win: M01 driven to the debrief screen via debug hooks', async ({ page }) => {
  const probs = watchProblems(page);
  await page.goto('/?debug=1&mission=m01');
  await waitScreen(page, 'play', 90_000);
  expect((await cd(page)).mission).toBe('m01');

  // Pick up the found USB (carry pickup radius is 0.6 tiles).
  await teleport(page, 6.5, 17.5);
  await expect.poll(async () => (await cd(page)).inventory).toContain('found-usb');

  // Open the security-desk door 'd' at (9,9) — E on a plain door.
  await teleport(page, 10.5, 9.5, Math.PI);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);

  // Hand the USB in at the security desk console → grants the itops role.
  // E is a single-tick edge eaten by the 0.3 s use cooldown from the door E
  // just above: press again until the grant lands (same retry pattern as
  // inspectAndClean — the interact itself is deterministic once E registers).
  await teleport(page, 4.5, 9.5, Math.PI);
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.keyboard.press('e');
    const granted = await expect
      .poll(async () => (await cd(page)).roles, { timeout: 2500 })
      .toContain('itops')
      .then(() => true)
      .catch(() => false);
    if (granted) break;
    if (attempt === 5) throw new Error('could not hand over the USB at the security desk');
    await teleport(page, 4.5, 9.5, Math.PI);
  }

  // Clean WS-07 (infected workstation at 12.5,10.5).
  await inspectAndClean(page, 'ws1', 13.5, 10.5);

  // Badge the IT OPS door 'I' at (30,10) — E swipes when the role is held.
  await teleport(page, 29.5, 10.5, 0);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);

  // Clean WS-12 (37.5,13.5) and WS-04 (27.5,14.5).
  await inspectAndClean(page, 'ws3', 36.5, 13.5);
  await inspectAndClean(page, 'ws2', 27.5, 15.5);

  // clean-all done → containment unseals the exit; step onto it.
  await expect
    .poll(async () => (await cd(page)).objectives.find((o) => o.id === 'clean-all')?.done)
    .toBe(true);
  await teleport(page, 19.5, 1.5);

  await waitScreen(page, 'debrief', 30_000);
  await expect(page.locator('.cd-pixel-canvas')).toBeVisible();
  expect(probs.errors).toEqual([]);
});
