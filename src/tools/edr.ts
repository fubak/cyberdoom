import type { ToolDef, ToolUseContext } from '../core/types';
import { hash, impactBurst, screenFlash, usePhase, tipY } from './anim';
import { bevel, glow, poly, rect } from './pixel';
import { drawText } from './pixelfont';
import { fist, handLook, sleeve } from './shared';

const WINDUP = 0.45;
const RADIUS = 6.5;

/**
 * Slot 6 — EDR CONSOLE (endpoint detection & response).
 * Doom's BFG: a long windup, then an automated containment pulse across
 * every endpoint/process within RADIUS. Each infected target takes 3
 * remediation hits, which isolates most threats outright. Very scarce
 * "edr-cell" ammo.
 */
export const edrTool: ToolDef = {
  id: 'edr',
  name: 'EDR CONSOLE',
  slot: 6,
  ammo: { resource: 'edr-cell', start: 1, max: 3 },
  cooldown: 1.2,
  windup: WINDUP,
  blurb: 'CONTAINMENT PULSE',
  unlock: { difficulty: 9 },
  control: {
    name: 'EDR/XDR (automated detection and containment)',
    category: 'technical',
    types: ['detective', 'corrective'],
    objectives: ['4.5', '4.8'],
    use: 'Charge, then release a containment pulse that isolates every infected endpoint and malware process near you. It needs no line of sight, because the agent already runs on each endpoint. Charges are very scarce.',
    lesson: 'EDR agents watch endpoint behaviour continuously and can respond automatically by killing processes or isolating hosts. That containment step is part of incident response.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    const t = anim?.time ?? 0;
    const shake = ph.phase === 'wind' ? Math.round((hash(Math.floor(t * 60)) - 0.5) * 3 * ph.u) : 0;
    const kick = ph.phase === 'impact' ? 1 : ph.phase === 'recover' ? 1 - ph.u : 0;
    const x0 = Math.round(w / 2 - 28 + shake);
    const y0 = Math.round(_h - 48 + kick * 10);
    // tablet
    bevel(g, x0, y0, 56, 40, '#2a2e3a', 2);
    rect(g, x0 + 3, y0 + 3, 50, 28, '#071018');
    const charge = ph.phase === 'wind' ? ph.u : ph.phase === 'impact' ? 1 : 0;
    const cx = x0 + 28;
    const cy = y0 + 5;
    const sc = charge > 0 ? '#5df2ff' : '#2f8fbf';
    poly(g, [[cx - 9, cy], [cx + 9, cy], [cx + 9, cy + 9], [cx, cy + 17], [cx - 9, cy + 9]], sc);
    poly(g, [[cx - 6, cy + 2], [cx + 6, cy + 2], [cx + 6, cy + 8], [cx, cy + 13], [cx - 6, cy + 8]], '#071018');
    rect(g, cx - 1, cy + 4, 2, 6, sc);
    // charge bar
    rect(g, x0 + 5, y0 + 25, 46, 4, '#0f2230');
    rect(g, x0 + 5, y0 + 25, Math.round(46 * charge), 4, charge >= 1 ? '#ffffff' : '#5df2ff');
    // cells
    for (let i = 0; i < 3; i++) rect(g, x0 + 6 + i * 8, y0 + 34, 6, 3, (anim?.ammo ?? 0) > i ? '#5df2ff' : '#203040');
    drawText(g, 'EDR', x0 + 34, y0 + 33, '#7a8aa0');
    sleeve(g, x0 - 3, y0 + 54, 12, -1, look);
    sleeve(g, x0 + 59, y0 + 54, 12, 1, look);
    fist(g, x0 - 8, y0 + 14, 11, look, -1);
    fist(g, x0 + 53, y0 + 14, 11, look, 1);
  },
  drawFx(g, w, h, anim) {
    const ph = usePhase(anim.sinceUse, WINDUP);
    if (ph.phase === 'wind') {
      glow(g, w / 2, 130, 30 + ph.u * 60, '90,230,255', 0.5 * ph.u);
      for (let i = 0; i < 12; i++) {
        const a = hash(i) * Math.PI * 2;
        const r = 90 * (1 - ((ph.u + hash(i + 3)) % 1));
        rect(g, w / 2 + Math.cos(a) * r, 120 + Math.sin(a) * r * 0.6, 2, 2, '#9ff4ff');
      }
    } else if (ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.7)) {
      const k = ph.phase === 'impact' ? ph.u * 0.3 : 0.3 + ph.u;
      screenFlash(g, w, h, '160,240,255', 0.3 * (1 - k));
      const r = 10 + k * 220;
      g.strokeStyle = `rgba(200,255,255,${1 - k})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(w / 2, 100, r, r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
    }
    impactBurst(g, w / 2, tipY(h), anim.sinceConfirm, anim.confirmGood, 1.6);
  },
  use(ctx: ToolUseContext) {
    ctx.bus.emit('tool-used', { toolId: 'edr' });
    let contained = 0;
    let weakened = 0;
    for (const e of ctx.entities) {
      if (!e.alive || !e.infected) continue;
      if (Math.hypot(e.x - ctx.playerX, e.y - ctx.playerY) > RADIUS) continue;
      e.hp -= 3;
      if (e.hp <= 0) {
        contained++;
        ctx.bus.emit('cleaned', { entityId: e.def.id });
      } else {
        weakened++;
        ctx.bus.emit('entity-hurt', { entityId: e.def.id, fromX: ctx.playerX, fromY: ctx.playerY });
      }
    }
    ctx.bus.emit('tool-hit', { toolId: 'edr', good: contained + weakened > 0 });
    ctx.bus.emit('message', contained + weakened > 0
      ? { text: `EDR: ${contained} endpoint(s) isolated${weakened ? `, ${weakened} still resisting` : ''}. Containment logged.`, kind: 'good' }
      : { text: 'EDR: no infected endpoints within range. Cell wasted; triage before you respond.', kind: 'warn' });
  },
  hint() {
    return { text: 'HOLD: CHARGE CONTAINMENT PULSE', ready: true };
  },
};
