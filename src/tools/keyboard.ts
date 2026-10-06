import type { ToolDef } from '../core/types';
import { damageEntity } from '../engine/ai';
import { hash, impactBurst, usePhase, tipY } from './anim';
import { targetNoun } from './hint';
import { bevel, glow, poly, rect, shade } from './pixel';
import { flatHand, handLook, sleeve } from './shared';

const WINDUP = 0.06;

/** Damage of one keyboard strike: worms take two, trojans three, ransomware four (ranged is faster). */
export const KEYBOARD_DAMAGE = 1;
export const KEYBOARD_RANGE = 1.5;

/**
 * Slot 1 — KEYBOARD (admin console / CLI), the arsenal's Doom fist.
 * Point-blank incident-response containment (SY0-701 4.8): kill the malicious
 * process / isolate it. Never runs out, but you have to get close. Hosts are
 * not cleaned with it (that is the scanner stick) and people are not accused
 * with it (that is the mouse + report-console flow).
 */
export const keyboardTool: ToolDef = {
  id: 'keyboard',
  name: 'KEYBOARD',
  slot: 1,
  ammo: null,
  cooldown: 0.6,
  windup: WINDUP,
  auto: true,
  blurb: 'POINT-BLANK CONTAINMENT',
  control: {
    name: 'Incident response containment (kill process / isolate)',
    category: 'technical',
    types: ['corrective'],
    objectives: ['4.8'],
    use: 'Point-blank only (1.5 tiles), slow but infinite. Each strike runs a kill-process / isolate command on the malware in front of you (containment): two stop a worm, three a trojan, four ransomware. At range, the SCANNER (3) is the right tool. Also runs commands on a console.',
    lesson: 'Containment comes before eradication and recovery in the incident response process: stop the malicious process spreading first, then clean and restore the host.',
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
    if (ph.phase === 'impact') glow(g, w / 2, tipY(_h), 20, '120,255,160', 0.35 * (1 - ph.u));
    impactBurst(g, w / 2, tipY(_h), anim.sinceConfirm, anim.confirmGood, 0.8, 'keys');
  },
  use(ctx) {
    // point-blank targets fill more of the view, so the strike cone widens up close
    const e = ctx.aimEntity(KEYBOARD_RANGE, 0.5) ?? ctx.aimEntity(0.9, 1.0);
    ctx.bus.emit('tool-used', { toolId: 'keyboard' });
    if (!e) return;
    const name = e.def.inspect?.label ?? e.def.id;
    if (e.def.kind === 'enemy') {
      if (!e.infected) return;
      const result = damageEntity(e, KEYBOARD_DAMAGE, e.x - ctx.playerX, e.y - ctx.playerY);
      ctx.bus.emit('tool-hit', { toolId: 'keyboard', entityId: e.def.id, good: true });
      if (result === 'killed') {
        ctx.bus.emit('message', { text: `CONTAINED: ${name} process killed and isolated. Eradication (clean / reimage) is the scanner's job.`, kind: 'good' });
        ctx.bus.emit('cleaned', { entityId: e.def.id });
      } else {
        ctx.bus.emit('entity-hurt', { entityId: e.def.id, fromX: ctx.playerX, fromY: ctx.playerY, applied: true });
      }
      return;
    }
    if (e.def.kind === 'npc') {
      ctx.bus.emit('message', {
        text: 'You do not accuse people with a keyboard. Gather evidence with the MOUSE (2), then file the report at the security console.',
        kind: 'info',
      });
      return;
    }
    if (e.def.kind === 'workstation' && e.infected) {
      ctx.bus.emit('tool-hit', { toolId: 'keyboard', entityId: e.def.id, good: false });
      ctx.bus.emit('message', {
        text: `${name}: killing the process will not remove a persistent infection. Plug in the SCANNER stick (3).`,
        kind: 'warn',
      });
      return;
    }
    ctx.bus.emit('tool-hit', { toolId: 'keyboard', entityId: e.def.id, good: true });
    ctx.bus.emit('interact', { entityId: e.def.id });
  },
  hint(ctx) {
    const e = ctx.aimEntity(KEYBOARD_RANGE, 0.5) ?? ctx.aimEntity(0.9, 1.0);
    if (!e) {
      const far = ctx.aimEntity(8, 0.26);
      if (far?.def.kind === 'enemy') return { text: 'TOO FAR: KEYBOARD IS POINT-BLANK', ready: false };
      return { text: 'STRIKE (POINT-BLANK)', ready: false };
    }
    if (e.def.kind === 'enemy') {
      if (!e.infected) return { text: 'NO PROCESS TO KILL', ready: false };
      return { text: 'KILL PROCESS: MALWARE', ready: true };
    }
    if (e.def.kind === 'npc') return { text: 'NOT USED ON PEOPLE', ready: false };
    if (e.def.kind === 'workstation' && e.infected && e.state.revealed) {
      return { text: "KILL PROCESS (WON'T CLEAN HOST)", ready: false };
    }
    return { text: `RUN COMMAND: ${targetNoun(e)}`, ready: true };
  },
};
