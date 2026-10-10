import { describe, expect, it } from 'vitest';
import { canDraw, measureText } from '../src/render/font';
import { CHAR_HINT } from '../src/ui/characterSelect';
import { DOSSIER_HINT, DOSSIER_W } from '../src/ui/dossier';
import { LOOK_HINT, MAP_HINT, MENU_HINT, applyBack, type MenuOverlay, type MenuScreen } from '../src/ui/nav';

const SCREENS: MenuScreen[] = [
  'title',
  'character-select',
  'mission-select',
  'briefing',
  'loading',
  'play',
  'debrief',
];

const OVERLAYS: MenuOverlay[] = [
  'none',
  'read-this',
  'briefing-details',
  'automap',
  'dossier',
  'pause',
  'evidence',
  'evidence-detail',
];

describe('menu back stack', () => {
  it('steps back from every menu except the title root and the debrief grade', () => {
    for (const screen of SCREENS) {
      const next = applyBack({ screen, overlay: 'none' });
      if (screen === 'title' || screen === 'debrief') {
        expect(next).toEqual({ screen, overlay: 'none' });
      } else {
        expect(next).not.toEqual({ screen, overlay: 'none' });
      }
    }
  });

  it('clears every overlay instead of leaving it in place', () => {
    for (const screen of SCREENS) {
      for (const overlay of OVERLAYS) {
        if (overlay === 'none') continue;
        const next = applyBack({ screen, overlay });
        expect(next).not.toEqual({ screen, overlay });
        expect(next.overlay === overlay && next.screen === screen).toBe(false);
      }
    }
  });

  it('walks the campaign menus back to the title', () => {
    const steps = [
      applyBack({ screen: 'briefing', overlay: 'briefing-details' }),
      applyBack({ screen: 'briefing', overlay: 'none' }),
      applyBack({ screen: 'mission-select', overlay: 'none' }),
      applyBack({ screen: 'character-select', overlay: 'none' }),
    ];
    expect(steps.map((s) => s.screen)).toEqual(['briefing', 'mission-select', 'character-select', 'title']);
  });

  it('opens pause from play and resumes back to play', () => {
    expect(applyBack({ screen: 'play', overlay: 'none' })).toEqual({ screen: 'play', overlay: 'pause' });
    expect(applyBack({ screen: 'play', overlay: 'pause' })).toEqual({ screen: 'play', overlay: 'none' });
    expect(applyBack({ screen: 'play', overlay: 'automap' })).toEqual({ screen: 'play', overlay: 'none' });
    expect(applyBack({ screen: 'play', overlay: 'dossier' })).toEqual({ screen: 'play', overlay: 'none' });
  });

  it('returns loading and the read-this page to the previous menu', () => {
    expect(applyBack({ screen: 'loading', overlay: 'none' })).toEqual({ screen: 'briefing', overlay: 'none' });
    expect(applyBack({ screen: 'title', overlay: 'read-this' })).toEqual({ screen: 'title', overlay: 'none' });
    expect(applyBack({ screen: 'debrief', overlay: 'evidence-detail' })).toEqual({ screen: 'debrief', overlay: 'evidence' });
    expect(applyBack({ screen: 'debrief', overlay: 'evidence' })).toEqual({ screen: 'debrief', overlay: 'none' });
  });
});

describe('menu hint copy fits the pixel HUD', () => {
  const lines = [LOOK_HINT, MENU_HINT, MAP_HINT, DOSSIER_HINT.file, DOSSIER_HINT.log];

  it('uses only bitmap-font glyphs', () => {
    for (const line of lines) expect(canDraw(line), line).toBe(true);
  });

  it('keeps HUD hints inside the 320px view and dossier hints inside the panel', () => {
    for (const line of [LOOK_HINT, MENU_HINT, MAP_HINT]) {
      expect(measureText(line, 'small'), line).toBeLessThanOrEqual(310);
    }
    expect(measureText(CHAR_HINT, 'tiny')).toBeLessThanOrEqual(310);
    expect(canDraw(CHAR_HINT, 'tiny')).toBe(true);
    for (const line of [DOSSIER_HINT.file, DOSSIER_HINT.log]) {
      expect(measureText(line, 'small'), line).toBeLessThanOrEqual(DOSSIER_W - 18);
    }
  });
});
