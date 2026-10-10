import { expect, test } from '@playwright/test';
import { aimAt, cd, closeDossier, fire, selectTool, teleport, waitScreen, watchProblems } from './helpers';

/**
 * The triage call gates the clean but must never trap the player: Escape/L
 * close the case file even while a "WHAT DO YOU DO?" call is pending (enemies
 * keep attacking, so a modal that cannot close is a death trap), and the call
 * can still be made from the log afterwards.
 */

const MOUSE = 2;
const USB = 3;

test('triage call: dossier closes with a call pending, clean stays gated until the call', async ({ page }) => {
  const probs = watchProblems(page);
  await page.goto('/?debug=1&mission=m01');
  await waitScreen(page, 'play', 90_000);

  // Inspect ws1 — the dossier opens on the case file with a pending call.
  await teleport(page, 13.5, 10.5);
  for (let attempt = 0; attempt < 4; attempt++) {
    await aimAt(page, 'ws1', 14, 10.5);
    await selectTool(page, MOUSE, 'mouse');
    await fire(page);
    if ((await cd(page)).dossier.entries > 0) break;
    if (attempt === 3) throw new Error('could not inspect ws1');
  }
  // First inspect auto-opens the dossier — unless a hostile is within 6
  // tiles, in which case it tickers instead; open ws1's file directly.
  await page.evaluate(() => window.__cd!.openCaseFile('ws1'));
  await expect.poll(async () => (await cd(page)).dossier).toMatchObject({ open: true, mode: 'file' });
  expect((await cd(page)).callsPending).toContain('ws1');

  // Call pending, but Escape still closes the file — the player is not trapped.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).dossier.open).toBe(false);

  // The clean is still rejected: only the correct call ungates it.
  await aimAt(page, 'ws1', 14, 10.5);
  await selectTool(page, USB, 'usb');
  await fire(page);
  await page.waitForTimeout(400);
  expect((await cd(page)).entities.find((e) => e.id === 'ws1')?.alive).toBe(true);
  await closeDossier(page);

  // Reopen from the log, make the call (quarantine + clean is option 1), close.
  await page.keyboard.press('l');
  await expect.poll(async () => (await cd(page)).dossier.mode).toBe('log');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await cd(page)).dossier).toMatchObject({ open: true, mode: 'file' });
  expect((await cd(page)).callsPending).toContain('ws1');
  await page.keyboard.press('1');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).dossier.open).toBe(false);

  // Now the clean counts.
  for (let attempt = 0; attempt < 4; attempt++) {
    await aimAt(page, 'ws1', 14, 10.5);
    await selectTool(page, USB, 'usb');
    await fire(page);
    const dead = await expect
      .poll(async () => (await cd(page)).entities.find((e) => e.id === 'ws1')?.alive, { timeout: 2500 })
      .toBe(false)
      .then(() => true)
      .catch(() => false);
    if (dead) break;
    if (attempt === 3) {
      const st = await cd(page);
      const ws1 = st.entities.find((e) => e.id === 'ws1');
      console.log('FAIL-STATE', JSON.stringify({ ws1, callsPending: st.callsPending, dossier: st.dossier, tool: st.tool }));
      throw new Error('clean still gated after the correct call');
    }
    await closeDossier(page);
  }
  expect(probs.errors).toEqual([]);
});
