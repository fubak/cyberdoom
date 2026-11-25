import { describe, expect, it } from 'vitest';
import { grainNoise, SCREW_ROWS, SCREW_SIZE, STEEL_TILE, steelGrain } from '../src/ui/menuArt';
import { optionItems, stepMeter, VOLUME_STEPS } from '../src/ui/options';
import { DEFAULT_SETTINGS, FOV_STEPS, SENS_STEPS } from '../src/ui/settings';

/**
 * LOOK: the console frame behind pause / options / controls, and the pip
 * meters on the options rows.
 */
describe('steel grain', () => {
  it('is deterministic and stays in range', () => {
    for (const [x, y] of [[0, 0], [63, 63], [977, 12], [5, 400]]) {
      const v = grainNoise(x, y);
      expect(v).toBe(grainNoise(x, y));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is a faint black or white tint: texture over the plate, never a repaint', () => {
    const data = steelGrain();
    expect(data).toHaveLength(STEEL_TILE * STEEL_TILE * 4);
    let maxAlpha = 0;
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i] === 0 || data[i] === 255).toBe(true);
      expect(data[i + 1]).toBe(data[i]);
      expect(data[i + 2]).toBe(data[i]);
      maxAlpha = Math.max(maxAlpha, data[i + 3]);
    }
    expect(maxAlpha).toBeGreaterThan(8);
    expect(maxAlpha).toBeLessThanOrEqual(46);
  });

  it('streaks run along rows: a row varies less than the tile does', () => {
    const data = steelGrain();
    const signed = (x: number, y: number) => {
      const i = (y * STEEL_TILE + x) * 4;
      return (data[i] === 255 ? 1 : -1) * data[i + 3];
    };
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    const cols = Array.from({ length: STEEL_TILE }, (_, i) => i);
    const rowSpread = cols.map((y) => spread(cols.map((x) => signed(x, y))));
    const meanRow = rowSpread.reduce((a, b) => a + b, 0) / STEEL_TILE;
    const column = spread(cols.map((y) => signed(7, y)));
    expect(meanRow).toBeLessThan(column);
  });
});

describe('screw sprite', () => {
  it('is square with a keyline ring and a slot', () => {
    expect(SCREW_ROWS).toHaveLength(SCREW_SIZE);
    for (const row of SCREW_ROWS) expect(row).toHaveLength(SCREW_SIZE);
    expect(SCREW_ROWS[0]).toBe(SCREW_ROWS[SCREW_SIZE - 1]);
    expect(SCREW_ROWS.join('')).toContain('ddd');
    expect(SCREW_ROWS[0][0]).toBe('.');
  });
});

describe('option meters', () => {
  it('a stepped meter has one pip per non-zero step', () => {
    expect(stepMeter(VOLUME_STEPS, 1)).toEqual({ lit: 4, of: 4, kind: 'steps' });
    expect(stepMeter(VOLUME_STEPS, 0.4)).toEqual({ lit: 2, of: 4, kind: 'steps' });
    expect(stepMeter(VOLUME_STEPS, 0)).toEqual({ lit: 0, of: 4, kind: 'steps' });
    expect(stepMeter(SENS_STEPS, SENS_STEPS[0]).lit).toBe(1);
    expect(stepMeter(FOV_STEPS, FOV_STEPS[FOV_STEPS.length - 1])).toEqual({ lit: FOV_STEPS.length, of: FOV_STEPS.length, kind: 'steps' });
  });

  it('a value between steps lights the steps at or below it', () => {
    expect(stepMeter(VOLUME_STEPS, 0.5).lit).toBe(2);
  });

  it('every row reads "NAME VALUE" and its meter never overfills', () => {
    for (const item of optionItems()) {
      let s = DEFAULT_SETTINGS;
      for (let i = 0; i < 9; i++) {
        expect(item.label(s)).toBe(`${item.name} ${item.value(s)}`);
        const meter = item.meter(s);
        expect(meter.of).toBeGreaterThan(0);
        expect(meter.lit).toBeGreaterThanOrEqual(0);
        expect(meter.lit).toBeLessThanOrEqual(meter.of);
        s = item.next(s);
      }
    }
  });

  it('toggles are a one-pip meter that follows the setting', () => {
    const bob = optionItems().find((item) => item.id === 'view-bob')!;
    const on = { ...DEFAULT_SETTINGS, viewBob: true };
    expect(bob.meter(on)).toEqual({ lit: 1, of: 1, kind: 'toggle' });
    expect(bob.meter(bob.next(on))).toEqual({ lit: 0, of: 1, kind: 'toggle' });
    expect(bob.value(on)).toBe('ON');
  });

  it('a muted volume says MUTED with an empty meter', () => {
    const music = optionItems().find((item) => item.id === 'music')!;
    const muted = { ...DEFAULT_SETTINGS, musicVol: 0 };
    expect(music.label(muted)).toBe('MUSIC MUTED');
    expect(music.meter(muted).lit).toBe(0);
  });
});
