import { expect, type Page } from '@playwright/test';

export interface CdEntity {
  id: string;
  kind: string;
  sprite: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  mode: string;
}

export interface CdState {
  screen: 'title' | 'character-select' | 'mission-select' | 'briefing' | 'loading' | 'play' | 'debrief';
  paused: boolean;
  mission: string | null;
  x: number | null;
  y: number | null;
  angle: number | null;
  integrity: number | null;
  tool: string;
  owned: string[];
  ammo: Record<string, number>;
  roles: string[];
  inventory: string[];
  dossier: { open: boolean; mode: string; page: number; entries: number };
  lossReason: string | null;
  objectives: { id: string; done: boolean; failed: boolean; progress: number }[];
  entities: CdEntity[];
}

declare global {
  interface Window {
    __cd?: {
      state(): CdState;
      startMission(id: string, gender?: string): void;
      teleport(x: number, y: number, angle?: number): void;
      setTool(slot: number): void;
      setIntegrity(v: number): void;
      fire(): void;
    };
  }
}

/** Snapshot of window.__cd.state() (requires ?debug=1). */
export function cd(page: Page): Promise<CdState> {
  return page.evaluate(() => {
    if (!window.__cd) throw new Error('window.__cd missing — load the game with ?debug=1');
    return window.__cd.state();
  });
}

export async function waitScreen(page: Page, screen: CdState['screen'], timeout = 60_000): Promise<void> {
  await expect.poll(async () => (await cd(page)).screen, { timeout }).toBe(screen);
}

/** Collect runtime/network problems to assert on at the end of a test. */
export function watchProblems(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return { errors };
}

export async function teleport(page: Page, x: number, y: number, angle?: number): Promise<void> {
  await page.evaluate(([tx, ty, a]) => window.__cd!.teleport(tx, ty, a), [x, y, angle] as const);
}

/** Stand at (x, y) facing the entity. */
export async function aimAt(page: Page, entityId: string, x: number, y: number): Promise<void> {
  const e = (await cd(page)).entities.find((entity) => entity.id === entityId);
  if (!e) throw new Error(`entity ${entityId} not in state()`);
  await teleport(page, x, y, Math.atan2(e.y - y, e.x - x));
}

export async function setTool(page: Page, slot: number): Promise<void> {
  await page.evaluate((s) => window.__cd!.setTool(s), slot);
}

export async function fire(page: Page): Promise<void> {
  await page.evaluate(() => window.__cd!.fire());
}

/**
 * Select a tool slot and wait out the lower/raise switch animation: the
 * arsenal drops presses while a swap is in progress, and __cd.fire() is
 * edge-triggered (a single tick), so a fire inside the ~0.3 s swap is lost.
 */
export async function selectTool(page: Page, slot: number, toolId: string): Promise<void> {
  await setTool(page, slot);
  await expect.poll(async () => (await cd(page)).tool, { timeout: 15_000 }).toBe(toolId);
  await page.waitForTimeout(500);
}

/**
 * A successful inspect (and some other evidence events) opens the dossier,
 * and an open dossier consumes all game input — including __cd.fire().
 * Escape closes it; the dossier's capture-phase listener stops propagation,
 * so it can never pause the game.
 */
export async function closeDossier(page: Page): Promise<void> {
  for (let i = 0; i < 10 && (await cd(page)).dossier.open; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  if ((await cd(page)).dossier.open) throw new Error('dossier would not close');
}

/** The menu screens mount key handlers ~250 ms late (onKeysWhileMounted). */
export async function settleMenus(page: Page): Promise<void> {
  await page.waitForTimeout(350);
}
