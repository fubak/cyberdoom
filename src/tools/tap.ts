import type { ToolDef, ToolUseContext } from '../core/types';
import { hash, impactBurst, usePhase } from './anim';
import { bevel, glow, rect } from './pixel';
import { drawText } from './pixelfont';
import { fist, handLook, sleeve } from './shared';
import { isMalicious } from './mouse';

const WINDUP = 0.1;
const RANGE = 12;
const CONE = 0.55;

/**
 * Slot 5 — NETWORK TAP (passive monitoring, out-of-band).
 * Sweeps a wide cone and captures traffic from every host/process in view,
 * auto-flagging the ones beaconing malicious traffic. It is PASSIVE: a tap
 * copies traffic, it cannot block or clean anything (3.2 inline vs tap).
 * Finite capture buffer ("pcap" ammo).
 */
export const tapTool: ToolDef = {
  id: 'tap',
  name: 'NETWORK TAP',
  slot: 5,
  ammo: { resource: 'pcap', start: 6, max: 12 },
  cooldown: 0.7,
  windup: WINDUP,
  unlock: { difficulty: 3 },
  control: {
    name: 'Network tap / passive sensor (packet capture)',
    category: 'technical',
    types: ['detective'],
    objectives: ['3.2', '4.9'],
    use: 'Sweeps a wide cone and captures traffic from everything in view. Hosts sending malicious traffic are flagged automatically. A tap is passive: it cannot block or clean, so you still have to respond with the scanner or EDR.',
    lesson: 'Taps and monitor ports sit out of band and only see copies of traffic; inline devices such as an IPS can block. Packet captures are a key data source for an investigation.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    const t = anim?.time ?? 0;
    const sweep = ph.phase !== 'idle';
    const lift = ph.k > 0 ? ph.k * 10 : ph.k * 4;
    const x0 = w / 2 - 40;
    const y0 = _h - 80 - lift;
    // cables
    for (let i = 0; i < 16; i++) {
      rect(g, x0 + 12 - i * 0.6, y0 - i * 3, 3, 3, '#2a7bd8');
      rect(g, x0 + 66 + i * 0.8, y0 - i * 3, 3, 3, '#d8a02a');
    }
    // housing
    bevel(g, x0, y0, 80, 56, '#4a505e', 2);
    rect(g, x0 + 2, y0 + 2, 76, 4, '#5e6576');
    // RJ45 ports
    for (const px of [x0 + 8, x0 + 62]) {
      rect(g, px, y0 - 4, 10, 7, '#1a1c22');
      rect(g, px + 2, y0 - 2, 6, 3, '#c0c6d0');
    }
    drawText(g, 'TAP', x0 + 30, y0 + 7, '#c0c6d0');
    // screen with packet waveform
    const sx = x0 + 6;
    const sy = y0 + 17;
    rect(g, sx - 1, sy - 1, 70, 26, '#0b0d12');
    rect(g, sx, sy, 68, 24, '#04170d');
    for (let i = 0; i < 68; i += 1) {
      const speed = sweep ? 90 : 20;
      const v = hash(Math.floor(i / 2) + Math.floor(t * speed / 4));
      const amp = sweep ? 10 : 3;
      const hgt = Math.max(1, Math.round(v * amp));
      const mal = sweep && hash(i * 3 + Math.floor(t * 8)) > 0.92;
      rect(g, sx + i, sy + 12 - hgt / 2, 1, hgt, mal ? '#ff5040' : '#3dff8a');
    }
    if (sweep) {
      const scan = Math.floor(((t * 3) % 1) * 68);
      rect(g, sx + scan, sy, 1, 24, '#d0ffe0');
    }
    // capture buffer LEDs
    const ammo = anim?.ammo ?? 0;
    for (let i = 0; i < 6; i++) rect(g, x0 + 8 + i * 6, y0 + 46, 4, 3, i < Math.ceil(ammo / 2) ? '#ffb000' : '#3a2a10');
    // two hands holding the sides
    sleeve(g, x0 - 2, y0 + 70, 18, -1, look);
    sleeve(g, x0 + 82, y0 + 70, 18, 1, look);
    fist(g, x0 - 10, y0 + 26, 14, look, -1);
    fist(g, x0 + 76, y0 + 26, 14, look, 1);
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
    impactBurst(g, w / 2, 92, anim.sinceConfirm, anim.confirmGood, 1.3);
  },
  use(ctx: ToolUseContext) {
    ctx.bus.emit('tool-used', { toolId: 'tap' });
    let malicious = 0;
    let benign = 0;
    for (const e of ctx.entities) {
      if (!e.alive || e.def.kind === 'item' || e.def.kind === 'prop') continue;
      const dx = e.x - ctx.playerX;
      const dy = e.y - ctx.playerY;
      const d = Math.hypot(dx, dy);
      if (d > RANGE) continue;
      let da = Math.atan2(dy, dx) - ctx.playerAngle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > CONE) continue;
      if (ctx.lineOfSight && !ctx.lineOfSight(ctx.playerX, ctx.playerY, e.x, e.y)) continue;
      // Behavioural flags (people) are not visible in packet captures.
      const beaconing = e.infected || e.def.inspect?.category === 'malware';
      if (beaconing) {
        malicious++;
        if (!e.state.flagged) {
          e.state.flagged = true;
          e.state.flagCorrect = true;
          if (!e.state.inspected) {
            e.state.inspected = true;
            ctx.bus.emit('inspect', { entityId: e.def.id });
          }
        }
      } else if (!isMalicious(e) || e.def.kind === 'npc') {
        benign++;
      }
    }
    ctx.bus.emit('tool-hit', { toolId: 'tap', good: malicious > 0 });
    ctx.bus.emit('message', malicious > 0
      ? { text: `PCAP: ${malicious} host(s) beaconing to C2, flagged. ${benign} clean flow(s). A tap only observes, so respond with SCANNER or EDR.`, kind: 'good' }
      : { text: `PCAP: ${benign} flow(s), no malicious traffic in view. Insider behaviour will not show up in packets.`, kind: 'info' });
  },
};
