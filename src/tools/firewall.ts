import type { ToolDef } from '../core/types';
import { vmLine } from './anim';
import { handLook } from './shared';
import { rect } from './pixel';

export const FIREWALL_PELLETS = [-0.14, -0.07, 0, 0.07, 0.14] as const;
export const FIREWALL_RANGE = 9;

/**
 * Slot 9 — FIREWALL BLASTER (packet-filter / ingress filtering).
 * Doom shotgun counterpart: fires a 5-rule horizontal fan that shreds
 * close-range malware, botnet swarms, and heavy threats using shared
 * SCAN SESSIONS (`usb-charge`).
 * Teaches: perimeter packet filtering stops network floods, but already-
 * infected endpoints still require endpoint cleanup with the USB Scanner.
 */
export const firewallTool: ToolDef = {
  id: 'firewall',
  name: 'FIREWALL BLASTER',
  slot: 9,
  unlock: { difficulty: 7 },
  ammo: { resource: 'usb-charge', start: 8, max: 30 },
  cooldown: 0.85,
  windup: 0.08,
  blurb: 'PACKET-FILTER SPREAD',
  control: {
    name: 'Network firewall / ingress packet filtering',
    category: 'technical',
    types: ['preventive', 'corrective'],
    objectives: ['3.2', '4.5'],
    use: 'Packet-filter spread that shreds close-range malware. Uses SCAN sessions.',
    lesson: 'Ingress filtering stops network floods at the perimeter, but already-infected hosts still need endpoint cleanup.',
  },
  hint(ctx) {
    const e = ctx.aimEntity(FIREWALL_RANGE, 0.3);
    if (e?.def.kind === 'enemy') return { text: 'BLAST — 5-rule filter spread', ready: true };
    if (e?.def.kind === 'workstation') return { text: 'ENDPOINT — use USB Scanner (3)', ready: false };
    return { text: 'FIRE — close-range filter spread', ready: true };
  },
  drawViewmodel(g, w, h, bob, gender, cooldownFrac, anim) {
    const look = handLook(gender, anim);
    const kick = cooldownFrac > 0 ? Math.sin(cooldownFrac * Math.PI) * 14 : 0;
    const cx = w / 2 + Math.sin(bob) * 5;
    const by = Math.max(vmLine(h) + 46, h - 18 + Math.abs(Math.cos(bob)) * 3 + kick);
    rect(g, cx - 22, by - 40, 44, 24, '#2a2e38');
    rect(g, cx - 18, by - 36, 36, 6, '#ff9030');
    rect(g, cx - 12, by - 16, 24, 18, look.skin[1]);
    rect(g, cx - 12, by - 4, 24, 6, look.skin[2]);
    rect(g, cx - 16, by + 2, 32, 24, look.jacket);
  },
  drawFx(g, w, h, anim) {
    const t = anim.sinceUse - 0.08;
    if (t < 0 || t > 0.14) return;
    const u = 1 - t / 0.14;
    const cx = w / 2;
    const cy = Math.max(vmLine(h) + 18, h - 86);
    g.save();
    g.globalAlpha = u * 0.85;
    g.fillStyle = '#ffd060';
    for (const off of [-24, -12, 0, 12, 24]) {
      g.fillRect(cx + off - 2, cy - 6, 4, 12);
    }
    g.restore();
  },
  use(ctx) {
    ctx.bus.emit('tool-used', { toolId: 'firewall' });
    for (const offset of FIREWALL_PELLETS) {
      const a = ctx.playerAngle + offset;
      ctx.fireProjectile({
        x: ctx.playerX,
        y: ctx.playerY,
        dx: Math.cos(a),
        dy: Math.sin(a),
        speed: 36,
        range: FIREWALL_RANGE,
        source: 'firewall-pellet',
        damage: 1,
      });
    }
    return true;
  },
};
