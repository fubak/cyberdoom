import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { DEFAULT_BINDINGS, rebind, resolveBindings } from '../src/engine/bindings';
import { canDraw, measureText, wrapText } from '../src/render/font';
import { sortedTools, toolRegistry } from '../src/tools';
import { Arsenal, PAGE_GAP, PAGE_LINES, explanationPages, toolIntroduction } from '../src/tools/arsenal';
import { tickerPrefix, tickerRows } from '../src/ui/hud';
import { LOOK_HINT, MENU_HINT } from '../src/ui/nav';
import { NAV_HINT_SECONDS, promptGate, type PromptGateInput } from '../src/ui/promptGate';
import { bindingLabel, controlLines, onboardingTips } from '../src/ui/controlsHelp';
import { ONBOARDING_KEY, markOnboardingSeen, onboardingSeen, shouldOnboard } from '../src/ui/onboarding';

const TICKER_COLS = 52;
const tickerLines = (text: string) => wrapText(text.toUpperCase(), TICKER_COLS, Infinity);

function gate(over: Partial<PromptGateInput> = {}) {
  return promptGate({
    pointerLocked: true,
    debug: false,
    ending: false,
    switching: false,
    overlayOpen: false,
    switchedTool: false,
    simT: 20,
    fireKey: 'F',
    ...over,
  });
}

describe('action prompts while the mouse is not captured', () => {
  it('keeps the [LMB]/[E] prompts visible when the pointer is free', () => {
    const free = gate({ pointerLocked: false });
    expect(free.showActions).toBe(true);
    // a click only captures the mouse, so the tool line names the fire key
    expect(free.toolKey).toBe('F');
    expect(free.footer).toBe(LOOK_HINT);
  });

  it('shows LMB and the early nav strip once the mouse is captured', () => {
    expect(gate({ simT: 1 })).toEqual({ showActions: true, toolKey: 'LMB', footer: MENU_HINT });
    expect(gate({ simT: NAV_HINT_SECONDS + 1 }).footer).toBeNull();
    expect(gate({ simT: 1, switchedTool: true }).footer).toBeNull();
  });

  it('hides the prompts at mission end, while switching, and under the map/dossier', () => {
    expect(gate({ ending: true, pointerLocked: false })).toMatchObject({ showActions: false, footer: null });
    expect(gate({ overlayOpen: true, pointerLocked: false })).toMatchObject({ showActions: false, footer: null });
    const switching = gate({ switching: true, pointerLocked: false });
    expect(switching.showActions).toBe(false);
    expect(switching.footer).toBe(LOOK_HINT);
  });

  it('debug runs never ask for a capture', () => {
    expect(gate({ pointerLocked: false, debug: true })).toMatchObject({ toolKey: 'LMB', showActions: true });
    expect(gate({ pointerLocked: false, debug: true, simT: 20 }).footer).toBeNull();
  });

  it('the capture hint says the click captures and the keyboard works', () => {
    expect(LOOK_HINT).toMatch(/CAPTURE/);
    expect(LOOK_HINT).toMatch(/WASD WORKS/);
    expect(measureText(LOOK_HINT, 'small')).toBeLessThanOrEqual(310);
    expect(canDraw(LOOK_HINT)).toBe(true);
  });
});

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('first-run onboarding gate', () => {
  it('shows once, in the opening mission, for players with no progress', () => {
    const store = memoryStore();
    expect(shouldOnboard('m01', [], store)).toBe(true);
    expect(shouldOnboard('m02', [], store)).toBe(false);
    expect(shouldOnboard('m01', ['m01'], store)).toBe(false);
    markOnboardingSeen(store);
    expect(store.data.get(ONBOARDING_KEY)).toBe('1');
    expect(onboardingSeen(store)).toBe(true);
    expect(shouldOnboard('m01', [], store)).toBe(false);
  });

  it('survives blocked storage', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(() => markOnboardingSeen(broken)).not.toThrow();
    expect(onboardingSeen(broken)).toBe(false);
    expect(shouldOnboard('m01', [], null)).toBe(true);
  });
});

describe('onboarding tips', () => {
  const tips = onboardingTips(resolveBindings({}));

  it('teach move/look, E at a workstation, number keys, and M/L', () => {
    const all = tips.join(' ').toUpperCase();
    expect(all).toMatch(/MOVE W\/S/);
    expect(all).toMatch(/MOUSE/);
    expect(all).toMatch(/PRESS E\/SPACE AT A WORKSTATION/);
    expect(all).toMatch(/1-9/);
    expect(all).toMatch(/\bM OPENS THE MAP\b/);
    expect(all).toMatch(/\bL THE EVIDENCE LOG\b/);
  });

  it('follow rebinds', () => {
    const keys = rebind(resolveBindings({}), 'map', 'KeyN');
    expect(onboardingTips(keys).join(' ')).toMatch(/N opens the map/);
  });

  it('each fit one two-line ticker page in the tiny font', () => {
    for (const tip of tips) {
      expect(explanationPages(tip), tip).toHaveLength(1);
      expect(tickerLines(tip).length, tip).toBeLessThanOrEqual(PAGE_LINES);
      expect(canDraw(tip.toUpperCase(), 'tiny'), tip).toBe(true);
    }
  });

  it('play before the tool introductions, one page at a time', () => {
    const bus = new EventBus();
    const messages: string[] = [];
    bus.on('message', ({ text }) => messages.push(text));
    const a = new Arsenal(bus);
    a.reset({ difficulty: 1, loadout: ['keyboard'] }, 'male');
    a.introduce([toolRegistry.require('keyboard')], tips);
    const ctx = () => { throw new Error('no tool use'); };
    for (let i = 0; i < 60 * 30; i++) a.update(1 / 60, false, false, ctx);
    expect(messages.slice(0, tips.length)).toEqual(tips.map((t) => t.toUpperCase()));
    expect(messages[tips.length]).toMatch(/^\[1\] KEYBOARD:/);
    // a page outlives the ticker's 5 s message life, so pages never share the ticker
    expect(PAGE_GAP).toBeGreaterThanOrEqual(5);
  });
});

describe('tool copy fits the ticker without truncation', () => {
  it('every tool introduction is one page of at most two tiny lines', () => {
    for (const tool of sortedTools()) {
      const intro = toolIntroduction(tool);
      expect(explanationPages(intro), tool.id).toHaveLength(1);
      expect(tickerLines(intro).length, `${tool.id}: ${intro}`).toBeLessThanOrEqual(PAGE_LINES);
      expect(canDraw(intro.toUpperCase(), 'tiny'), intro).toBe(true);
      for (const line of tickerLines(intro)) expect(measureText(line, 'tiny')).toBeLessThanOrEqual(TICKER_COLS * 4);
    }
  });

  it('a new page plus the previous one fit the ticker with nothing cut', () => {
    const intros = sortedTools().map(toolIntroduction);
    for (let i = 1; i < intros.length; i++) {
      const rows = tickerRows([
        { text: intros[i - 1], kind: 'info', t: 1, n: 1 },
        { text: intros[i], kind: 'info', t: 4, n: 1 },
      ], 4);
      expect(rows.some((r) => r.line.endsWith('…')), intros[i]).toBe(false);
    }
  });

  it('no tool still points at the scanner from the keyboard tip', () => {
    expect(toolRegistry.require('keyboard').control?.use).not.toMatch(/SCANNER/i);
  });

  it('ticker prefixes draw in the tiny font (no empty "( )" box)', () => {
    for (const kind of ['good', 'warn', 'bad', 'info']) {
      expect(canDraw(tickerPrefix(kind), 'tiny'), kind).toBe(true);
    }
  });
});

describe('control copy', () => {
  it('reflects rebinds', () => {
    const keys = rebind(resolveBindings({}), 'fire', 'KeyG');
    expect(bindingLabel(keys, 'fire')).toBe('G');
    expect(controlLines(keys).join(' ')).toMatch(/LMB\/G USE TOOL/);
    expect(bindingLabel(DEFAULT_BINDINGS, 'use')).toBe('E/SPACE');
  });
});
