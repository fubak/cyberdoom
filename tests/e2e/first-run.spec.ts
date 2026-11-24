import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { aimAt, cd, settleMenus, teleport, waitScreen, watchProblems } from './helpers';

/**
 * First-time player journey (UX plan Phase G #29): fresh storage, title menu,
 * READ THIS!, New Game, M01 briefing paging, deploy, and the first seconds of
 * play as a new player sees them with the mouse NOT captured.
 *
 * `freemouse=1` keeps the ?debug=1 hooks but lets the prompt band behave as
 * for a player whose mouse is free (capture hint footer, fire-key plate).
 * HUD text is canvas-drawn, so the checks read `__cd.hud()` (what the last
 * frame drew, with key plate geometry) and a few HUD canvas pixels.
 */

const TOOLS = [
  '1 KEYBOARD', '2 MOUSE', '3 USB SCANNER', '4 BADGE', '5 NETWORK TAP',
  '6 EDR CONSOLE', '7 MFA TOKEN', '8 PATCH DISK', '9 FIREWALL BLASTER',
];
const LOOK_HINT = 'CLICK TO CAPTURE MOUSE - WASD WORKS - ESC MENU';

interface PlateRow {
  key: string;
  text: string;
  plate: { x: number; y: number; w: number; h: number; glyphX: number; glyphY: number } | null;
}
interface HudFrame {
  objective: { mode: 'none' | 'strip' | 'pinned' | 'overlay'; lines: string[] };
  prompt: { rows: PlateRow[]; footer: string | null };
  ticker: string[];
}

async function hudFrame(page: Page): Promise<HudFrame> {
  const frame = await page.evaluate(
    () => (window as unknown as { __cd: { hud(): { frame: HudFrame | null } } }).__cd.hud().frame,
  );
  if (!frame) throw new Error('HUD debug capture is off');
  return frame;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

/**
 * Pixels on the bottom glyph row of a key plate, right of the stem: E's
 * bottom bar is dark there, F has nothing there. Also reports whether the
 * amber plate itself covers that row (the old 7px plate left E's bottom bar
 * on the dark background, so it read as F).
 */
async function plateBottomRow(page: Page, key: string): Promise<{ key: string; dark: number; plateLit: boolean } | null> {
  return page.evaluate((wanted) => {
    const api = (window as unknown as { __cd: { hud(): { res: number; frame: HudFrame | null } } }).__cd;
    const { res, frame } = api.hud();
    const row = frame?.prompt.rows.find((r) => r.key === wanted && r.plate);
    if (!row?.plate) return null;
    const canvas = document.getElementById('hud') as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    const p = row.plate;
    const y0 = Math.round((p.glyphY + 6.25) * res);
    const y1 = Math.round((p.glyphY + 6.75) * res);
    const x0 = Math.round((p.glyphX + 1.5) * res);
    const x1 = Math.round((p.glyphX + 4.5) * res);
    const band = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let dark = 0;
    for (let i = 0; i < band.length; i += 4) if (band[i] + band[i + 1] + band[i + 2] < 330) dark++;
    // the plate's left padding column on the same row should be the amber plate
    const pad = g.getImageData(Math.round((p.x + 0.5) * res), Math.round((p.glyphY + 6.5) * res), 1, 1).data;
    return { key: row.key, dark, plateLit: pad[0] > 180 && pad[1] > 120 && pad[2] < 120 };
  }, key);
}

test('first-run journey: title → READ THIS → briefing paging → deploy M01 → onboarding, prompts, map and log', async ({ page }, info) => {
  test.setTimeout(180_000);
  const probs = watchProblems(page);

  // ---- fresh storage -> title ----
  await page.goto('/?debug=1&freemouse=1');
  await waitScreen(page, 'title');
  const stored = await page.evaluate(() => ({
    onboarding: localStorage.getItem('cyberdoom.onboarding.seen'),
    keys: Object.keys(localStorage),
  }));
  expect(stored.onboarding).toBeNull();
  for (const id of ['new-game', 'options', 'controls', 'read-this']) {
    await expect(page.locator(`[data-menu-item="${id}"]`)).toBeAttached();
  }
  await expect(page.locator('[data-menu-item="continue"]')).toHaveCount(0);
  await shot(page, info, '01-title');

  // ---- READ THIS! lists every tool and the controls ----
  const about = page.locator('[data-read-this]');
  await expect(about).toBeHidden();
  await page.locator('[data-menu-item="read-this"]').click();
  await expect(about).not.toHaveAttribute('hidden');
  const help = (await about.textContent()) ?? '';
  for (const tool of TOOLS) expect(help, tool).toContain(tool);
  for (const control of ['E/SPACE INTERACT', 'M MAP', 'L LOG', 'ESC PAUSE']) expect(help, control).toContain(control);
  await shot(page, info, '02-read-this');
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();

  // ---- New Game -> character select -> mission select -> M01 briefing ----
  await page.locator('[data-menu-item="new-game"]').click();
  await waitScreen(page, 'character-select');
  await page.locator('[data-menu-item="deploy"]').click();
  await waitScreen(page, 'mission-select');
  await page.locator('button.mission-row:not([disabled])').first().click();
  await waitScreen(page, 'briefing');
  await settleMenus(page);

  // ---- briefing details: paging by keys and by buttons, no orphan heading on any page ----
  await page.keyboard.press('d');
  const details = page.locator('.cd-briefing-details-page');
  await expect(details).toHaveAttribute('data-page', '1');
  const pages = Number(await details.getAttribute('data-pages'));
  expect(pages).toBeGreaterThan(1);
  const prev = page.locator('button[data-page="prev"]');
  const next = page.locator('button[data-page="next"]');
  await expect(prev).toBeDisabled();
  await shot(page, info, '03-briefing-details-p1');
  const nextKeys = ['ArrowRight', 'd'];
  for (let p = 1; p <= pages; p++) {
    await expect(details).toHaveAttribute('data-page', String(p));
    await expect(details, `page ${p} ends on a heading`).toHaveAttribute('data-last-row', 'text');
    if (p === pages) break;
    // alternate the three ways forward: Right arrow, D, the NEXT button
    if (p % 3 === 0) await next.click();
    else await page.keyboard.press(nextKeys[(p - 1) % 3]);
  }
  await expect(next).toBeDisabled();
  // and back: Left arrow, then the PREV button, then A
  await page.keyboard.press('ArrowLeft');
  await expect(details).toHaveAttribute('data-page', String(pages - 1));
  if (pages > 2) {
    await prev.click();
    await expect(details).toHaveAttribute('data-page', String(pages - 2));
  }
  await page.keyboard.press('a');
  await expect(details).toHaveAttribute('data-page', String(Math.max(1, pages - 3)));
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await waitScreen(page, 'briefing');

  // ---- deploy M01 ----
  await page.keyboard.press('Enter');
  await waitScreen(page, 'play', 90_000);
  expect((await cd(page)).mission).toBe('m01');

  // ---- first seconds: onboarding tips, capture hint, single-line objective ----
  const seen = new Set<string>();
  const footers = new Set<string>();
  const objectiveModes = new Set<string>();
  // the four first-run tips (ui/controlsHelp onboardingTips), paged ~5 s apart from 1.2 s in
  const wantTips = [
    /MOVE W\/S, STRAFE A\/D/,
    /PRESS E\/SPACE AT A WORKSTATION TO READ IT/,
    /NUMBER KEYS 1-9 SELECT A TOOL\. LMB OR F USES IT/,
    /M OPENS THE MAP, L THE EVIDENCE LOG/,
  ];
  await expect
    .poll(
      async () => {
        const [state, frame] = await Promise.all([cd(page), hudFrame(page)]);
        for (const message of [...state.hudMessages, ...frame.ticker]) seen.add(message.toUpperCase());
        if (frame.prompt.footer) footers.add(frame.prompt.footer);
        objectiveModes.add(frame.objective.mode);
        expect(frame.objective.lines.length, 'objective line wraps').toBeLessThanOrEqual(1);
        const all = [...seen].join(' | ');
        return wantTips.every((tip) => tip.test(all));
      },
      { timeout: 75_000, intervals: [250] },
    )
    .toBe(true);
  // deploying M01 for the first time marks the tips as seen (a returning player skips them)
  expect(await page.evaluate(() => localStorage.getItem('cyberdoom.onboarding.seen'))).toBe('1');
  expect([...footers]).toContain(LOOK_HINT);
  expect([...objectiveModes].some((m) => m === 'pinned' || m === 'strip')).toBe(true);
  const pinned = await expect
    .poll(async () => (await hudFrame(page)).objective, { timeout: 15_000 })
    .toMatchObject({ mode: 'pinned' })
    .then(() => hudFrame(page));
  expect(pinned.objective.lines).toHaveLength(1);
  expect(pinned.objective.lines[0]).toMatch(/^OBJ \d+\/\d+ \S/);
  await shot(page, info, '04-m01-first-seconds');

  // ---- at a workstation with the mouse free: [E] prompt shows, and its plate draws E (not F) ----
  await teleport(page, 13.5, 10.5);
  await aimAt(page, 'ws1', 14, 10.5);
  await expect
    .poll(async () => (await hudFrame(page)).prompt.rows.some((r) => r.key === 'E'), { timeout: 15_000 })
    .toBe(true);
  const frame = await hudFrame(page);
  expect(frame.prompt.footer).toBe(LOOK_HINT);
  const eRow = frame.prompt.rows.find((r) => r.key === 'E')!;
  expect(eRow.text.length).toBeGreaterThan(0);
  // the plate holds the whole 7-row glyph, including E's bottom bar
  expect(eRow.plate!.glyphY + 7).toBeLessThanOrEqual(eRow.plate!.y + eRow.plate!.h);
  const ePixels = await plateBottomRow(page, 'E');
  expect(ePixels, 'E plate row').not.toBeNull();
  expect(ePixels!.plateLit).toBe(true);
  expect(ePixels!.dark).toBeGreaterThan(8);
  // with the mouse free the tool line names the fire key (a click only captures), and the
  // F plate drawn just above has no bottom bar: the two keys render differently
  const fireRow = frame.prompt.rows.find((r) => r.key !== 'E' && r.plate);
  expect(fireRow?.key).toBe('F');
  const fPixels = await plateBottomRow(page, 'F');
  expect(fPixels, 'F plate row').not.toBeNull();
  expect(fPixels!.dark).toBeLessThan(ePixels!.dark / 4);
  await shot(page, info, '05-m01-workstation-prompt');

  // ---- automap (M) ----
  await page.keyboard.press('m');
  await expect.poll(async () => (await cd(page)).automap).toBe(true);
  await shot(page, info, '06-automap');
  await page.keyboard.press('m');
  await expect.poll(async () => (await cd(page)).automap).toBe(false);

  // ---- evidence log (L): nothing logged yet, so the empty state says how to fill it ----
  expect((await cd(page)).dossier.entries).toBe(0);
  await page.keyboard.press('l');
  await expect.poll(async () => (await cd(page)).dossier).toMatchObject({ open: true, mode: 'log' });
  await expect.poll(async () => (await cd(page)).dossier.emptyLines[0]).toBe('NO EVIDENCE LOGGED');
  const empty = (await cd(page)).dossier.emptyLines.join(' ');
  expect(empty).toContain('READ A WORKSTATION (E)');
  expect(empty).toContain('MOUSE (2)');
  await shot(page, info, '07-log-empty');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await cd(page)).dossier.open).toBe(false);
  expect((await cd(page)).paused).toBe(false);

  expect(probs.errors).toEqual([]);
});
