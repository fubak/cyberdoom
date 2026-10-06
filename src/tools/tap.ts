import type { Entity, ToolDef, ToolUseContext } from '../core/types';
import { hash, impactBurst, usePhase, tipY } from './anim';
import { bevel, glow, rect } from './pixel';
import { drawText } from './pixelfont';
import { fist, handLook, sleeve } from './shared';

const WINDUP = 0.1;
const RANGE = 12;
const CONE = 0.55;

/**
 * Slot 5 — NETWORK TAP (passive monitoring, out-of-band).
 * Sweeps a cone and captures a COPY of the traffic of every host/process in
 * view, then shows the raw flows. It makes no verdict: detection is the
 * analyst's call (or an IDS's). It cannot block or clean anything (3.2
 * inline vs tap, IDS vs IPS).
 * Finite capture buffer ("pcap" ammo).
 */
export const tapTool: ToolDef = {
  id: 'tap',
  name: 'NETWORK TAP',
  slot: 5,
  ammo: { resource: 'pcap', start: 6, max: 12 },
  cooldown: 0.7,
  windup: WINDUP,
  blurb: 'CAPTURE TRAFFIC',
  unlock: { difficulty: 6 },
  control: {
    name: 'Network tap / passive sensor (packet capture)',
    category: 'technical',
    types: ['detective'],
    objectives: ['3.2', '4.9'],
    use: 'Sweeps a cone and copies the traffic of every host in view, then shows you the raw flows. It decides nothing: read the flows and make the call yourself (MOUSE flags a captured host in one click). It cannot block or clean.',
    lesson: 'A tap or SPAN port only delivers a copy of traffic. Detection is a separate job (an IDS or an analyst reading the capture), and only inline devices such as an IPS can block. Packet captures are a key data source for an investigation.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    const t = anim?.time ?? 0;
    const sweep = ph.phase !== 'idle';
    const lift = ph.k > 0 ? ph.k * 8 : ph.k * 3;
    const x0 = Math.round(w / 2 - 24);
    const y0 = Math.round(_h - 40 - lift);
    // cables
    for (let i = 0; i < 6; i++) {
      rect(g, x0 + 7 - i * 0.6, y0 - i * 3, 3, 3, '#2a7bd8');
      rect(g, x0 + 38 + i * 0.6, y0 - i * 3, 3, 3, '#d8a02a');
    }
    // housing
    bevel(g, x0, y0, 48, 36, '#4a505e', 2);
    rect(g, x0 + 2, y0 + 2, 44, 3, '#5e6576');
    for (const px of [x0 + 4, x0 + 36]) {
      rect(g, px, y0 - 3, 8, 5, '#1a1c22');
      rect(g, px + 2, y0 - 2, 4, 2, '#c0c6d0');
    }
    drawText(g, 'TAP', x0 + 15, y0 + 5, '#c0c6d0');
    // screen with packet waveform (copied traffic: one colour, no verdict)
    const sx = x0 + 4;
    const sy = y0 + 13;
    rect(g, sx - 1, sy - 1, 42, 15, '#0b0d12');
    rect(g, sx, sy, 40, 13, '#04170d');
    for (let i = 0; i < 40; i += 1) {
      const v = hash(Math.floor(i / 2) + Math.floor(t * (sweep ? 90 : 20) / 4));
      const hgt = Math.max(1, Math.round(v * (sweep ? 11 : 3)));
      rect(g, sx + i, sy + 6 - hgt / 2, 1, hgt, '#3dff8a');
    }
    if (sweep) rect(g, sx + Math.floor(((t * 3) % 1) * 40), sy, 1, 13, '#d0ffe0');
    // capture buffer LEDs
    const ammo = anim?.ammo ?? 0;
    for (let i = 0; i < 6; i++) rect(g, x0 + 5 + i * 6, y0 + 30, 4, 2, i < Math.ceil(ammo / 2) ? '#ffb000' : '#3a2a10');
    sleeve(g, x0 - 2, y0 + 50, 12, -1, look);
    sleeve(g, x0 + 50, y0 + 50, 12, 1, look);
    fist(g, x0 - 7, y0 + 16, 10, look, -1);
    fist(g, x0 + 45, y0 + 16, 10, look, 1);
  },
  drawFx(g, w, _h, anim) {
    const ph = usePhase(anim.sinceUse, WINDUP);
    if (ph.phase === 'impact' || ph.phase === 'recover') {
      // expanding capture cone wavefront
      const k = ph.phase === 'impact' ? ph.u * 0.4 : 0.4 + ph.u * 0.6;
      g.fillStyle = `rgba(90,255,150,${0.8 * (1 - k)})`;
      const r = 20 + k * 150;
      for (let a = -CONE; a <= CONE; a += 0.03) {
        g.fillRect(Math.round(w / 2 + Math.sin(a) * r), Math.round(150 - Math.cos(a) * r * 0.55), 2, 1);
      }
      glow(g, w / 2, 110, 40, '90,255,150', 0.3 * (1 - k));
    }
    impactBurst(g, w / 2, tipY(_h), anim.sinceConfirm, anim.confirmGood, 1.3, 'packets');
  },
  use(ctx: ToolUseContext) {
    ctx.bus.emit('tool-used', { toolId: 'tap' });
    const seen: Entity[] = [];
    for (const e of ctx.entities) {
      if (!e.alive || e.def.kind === 'item' || e.def.kind === 'npc' || e.def.kind === 'prop') continue;
      const dx = e.x - ctx.playerX;
      const dy = e.y - ctx.playerY;
      if (Math.hypot(dx, dy) > RANGE) continue;
      let da = Math.atan2(dy, dx) - ctx.playerAngle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > CONE) continue;
      if (ctx.lineOfSight && !ctx.lineOfSight(ctx.playerX, ctx.playerY, e.x, e.y)) continue;
      e.state.captured = true;
      seen.push(e);
    }
    ctx.bus.emit('tool-hit', { toolId: 'tap', good: seen.length > 0 });
    if (!seen.length) {
      ctx.bus.emit('message', { text: 'PCAP: nothing captured. Point the tap at hosts in view.', kind: 'warn' });
      return;
    }
    seen.sort((a, b) => Math.hypot(a.x - ctx.playerX, a.y - ctx.playerY) - Math.hypot(b.x - ctx.playerX, b.y - ctx.playerY));
    for (const e of seen.slice(0, 2)) ctx.bus.emit('message', { text: flowLine(e), kind: 'info' });
    ctx.bus.emit('message', {
      text: `${seen.length} host(s) copied. No verdict: MOUSE (2) decides.`,
      kind: 'info',
    });
  },
  hint(ctx) {
    let n = 0;
    for (const e of ctx.entities) {
      if (!e.alive || e.def.kind === 'item' || e.def.kind === 'npc' || e.def.kind === 'prop') continue;
      const dx = e.x - ctx.playerX;
      const dy = e.y - ctx.playerY;
      if (Math.hypot(dx, dy) > RANGE) continue;
      let da = Math.atan2(dy, dx) - ctx.playerAngle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > CONE) continue;
      if (ctx.lineOfSight && !ctx.lineOfSight(ctx.playerX, ctx.playerY, e.x, e.y)) continue;
      n++;
    }
    if (n > 0) return { text: `CAPTURE TRAFFIC (${n} IN VIEW)`, ready: true };
    return { text: 'CAPTURE TRAFFIC: NO HOSTS IN VIEW', ready: false };
  },
};

function idHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** One raw flow summary. Indicators are visible; interpreting them is the player's job. */
export function flowLine(e: Entity): string {
  const name = (e.def.inspect?.label ?? e.def.id).split(' (')[0];
  const h = idHash(e.def.id);
  const src = `10.0.${h % 40}.${10 + (h >> 8) % 200}`;
  const cat = e.def.inspect?.category;
  if (e.infected || cat === 'malware') {
    return `PCAP ${name}: ${src} > 185.${(h >> 4) % 250}.${(h >> 12) % 250}.7:443, ${180 + (h % 60)} B every 60 s, also while idle`;
  }
  if (cat === 'suspicious' || cat === 'phishing') {
    return `PCAP ${name}: ${src} > newly registered domain, TLS, irregular bursts`;
  }
  return `PCAP ${name}: ${src} > intranet:443 and the update server, bursty, follows user activity`;
}
