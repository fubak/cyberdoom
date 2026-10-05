import type { ToolDef } from '../core/types';
import { hash, impactBurst, usePhase } from './anim';
import { bevel, glow, poly, rect, shade } from './pixel';
import { flatHand, handLook, sleeve } from './shared';

const WINDUP = 0.09;

/**
 * Slot 1 — KEYBOARD (admin console / CLI).
 * Melee range: the keyboard is slammed onto the host in front of you to run
 * a manual remediation (patch / isolate), file a report at a console, or
 * mark a suspect. Infinite use but short range and slow — Doom's fist.
 */
export const keyboardTool: ToolDef = {
  id: 'keyboard',
  name: 'KEYBOARD',
  slot: 1,
  ammo: null,
  cooldown: 0.42,
  windup: WINDUP,
  auto: true,
  control: {
    name: 'Admin console (manual remediation & reporting)',
    category: 'technical',
    types: ['corrective'],
    objectives: ['2.5', '4.8'],
    use: 'Point-blank only. Slam it on an infected host to patch it by hand, on a console to file an incident report, or on a person to mark them as a suspect.',
    lesson: 'Hands-on remediation works but does not scale; incident response also means documenting and reporting what you found through the proper channel.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    // windup: pull down/back; impact: thrust up & away (smaller = farther)
    const lift = ph.k > 0 ? ph.k * 34 : ph.k * 10;
    const sc = 1 - Math.max(0, ph.k) * 0.22;
    const cx = w / 2;
    const top = 136 - lift;
    const bot = 184 - lift * 0.6;
    const tw = 136 * sc;
    const bw = 216 * sc;
    const tilt = ph.k > 0 ? ph.k * 4 : 0;
    const P = (u: number, v: number): [number, number] => {
      const y = top + (bot - top) * v;
      const half = (tw + (bw - tw) * v) / 2;
      return [cx - half + 2 * half * u + tilt * (1 - v), y];
    };
    // case
    poly(g, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], '#2a2d36');
    poly(g, [P(0, 0.9), P(1, 0.9), P(1, 1), P(0, 1)], '#15171d');
    poly(g, [P(0, 0), P(1, 0), P(1, 0.06), P(0, 0.06)], '#4a4f5e');
    // keys (5 rows)
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const v0 = 0.1 + r * 0.155;
      const v1 = v0 + 0.12;
      const cols = r === 4 ? 0 : 13 - (r === 0 ? 0 : 0);
      if (r === 4) {
        // modifiers + space bar
        const segs: [number, number, string][] = [[0.04, 0.16, '#5a5f70'], [0.18, 0.3, '#5a5f70'], [0.32, 0.72, '#8a8fa0'], [0.74, 0.86, '#5a5f70'], [0.88, 0.96, '#5a5f70']];
        for (const [u0, u1, c] of segs) {
          poly(g, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], c);
          poly(g, [P(u0, v0), P(u1, v0), P(u1, v0 + 0.03), P(u0, v0 + 0.03)], shade(c, 1.35));
        }
        continue;
      }
      for (let k = 0; k < cols; k++) {
        const u0 = 0.04 + k * (0.92 / cols);
        const u1 = u0 + 0.92 / cols - 0.012;
        let c = '#6a7082';
        if (r === 0 && k === 0) c = '#c8322a'; // ESC
        if (r === 2 && k === cols - 1) c = '#e09a1a'; // ENTER
        if (r === 1 && (k === 2 || k === 3 || k === 4)) c = '#7a8296';
        // impact: keys light up in a ripple
        if (ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.5)) {
          if (hash(r * 31 + k + Math.floor((anim?.time ?? 0) * 30)) > 0.55) c = '#5dff9a';
        }
        poly(g, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], c);
        poly(g, [P(u0, v0), P(u1, v0), P(u1, v0 + 0.035), P(u0, v0 + 0.035)], shade(c, 1.4));
        poly(g, [P(u0, v1 - 0.03), P(u1, v1 - 0.03), P(u1, v1), P(u0, v1)], shade(c, 0.55));
      }
    }
    // status LEDs
    const [lx, ly] = P(0.86, 0.035);
    rect(g, lx, ly, 2, 1, '#39d353');
    rect(g, lx + 4, ly, 2, 1, (anim?.time ?? 0) % 1 < 0.5 ? '#39d353' : '#123');
    // hands gripping the top corners
    const [ltx, lty] = P(0.08, 0);
    const [rtx, rty] = P(0.92, 0);
    sleeve(g, ltx - 6, lty + 24, 16, -1, look);
    sleeve(g, rtx + 6, rty + 24, 16, 1, look);
    flatHand(g, ltx - 2, lty - 9, 12, look, -1);
    flatHand(g, rtx + 2, rty - 9, 12, look, 1);
    void bevel;
  },
  drawFx(g, w, _h, anim) {
    const ph = usePhase(anim.sinceUse, WINDUP);
    if (ph.phase === 'impact') glow(g, w / 2, 120, 50, '120,255,160', 0.35 * (1 - ph.u));
    impactBurst(g, w / 2, 92, anim.sinceConfirm, anim.confirmGood, 0.8);
  },
  use(ctx) {
    const e = ctx.aimEntity(1.5, 0.5);
    ctx.bus.emit('tool-used', { toolId: 'keyboard' });
    if (e) {
      ctx.bus.emit('tool-hit', { toolId: 'keyboard', entityId: e.def.id, good: true });
      ctx.bus.emit('interact', { entityId: e.def.id });
    }
  },
};
