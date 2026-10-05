import type { ToolDef, ToolUseContext } from '../core/types';
import { impactBurst, usePhase, tipY } from './anim';
import { bevel, rect } from './pixel';
import { drawText } from './pixelfont';
import { fist, handLook, sleeve } from './shared';

const WINDUP = 0.12;

/**
 * Slot 8 — PATCH DISK (patch management / hardening).
 * Installs the vendor security update on a CLEAN host, closing the
 * vulnerability before it is exploited. It cannot evict malware that is
 * already running, so the host has to be cleaned first. "patch-disk" ammo;
 * a disk is refunded when nothing was patched.
 */
export const patchTool: ToolDef = {
  id: 'patch',
  name: 'PATCH DISK',
  slot: 8,
  ammo: { resource: 'patch-disk', start: 3, max: 6 },
  cooldown: 0.55,
  windup: WINDUP,
  unlock: { difficulty: 9 },
  control: {
    name: 'Patch management (vendor security update)',
    category: 'technical',
    types: ['preventive', 'corrective'],
    objectives: ['2.5', '4.3'],
    use: 'At arm\'s length, install the security update on a clean workstation to close its known vulnerability. It cannot remove malware that is already running: clean the host first, then patch it.',
    lesson: 'Patching removes the vulnerability; it does not evict an attacker already inside. Clean, then patch, then verify: that is remediation followed by hardening.',
  },
  drawViewmodel(g, w, h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    const push = ph.k > 0 ? ph.k * 16 : ph.k * 6;
    const x0 = Math.round(w / 2 - 22);
    const y0 = Math.round(h - 47 - push);
    // 3.5" disk: body, metal shutter, label
    bevel(g, x0, y0, 44, 44, '#1e3a8a', 2);
    rect(g, x0 + 12, y0, 22, 14, '#b8bcc8');
    rect(g, x0 + 14, y0 + 2, 18, 1, '#e8ecf4');
    rect(g, x0 + 26, y0 + 3, 5, 9, '#3a404c');
    rect(g, x0 + 5, y0 + 20, 34, 20, '#f0ede4');
    rect(g, x0 + 5, y0 + 20, 34, 4, '#ff8a1a');
    drawText(g, 'KB', x0 + 15, y0 + 27, '#1e3a8a');
    rect(g, x0 + 2, y0 + 38, 3, 3, '#0a0c12');
    // hand pinching the bottom edge
    sleeve(g, x0 + 18, y0 + 66, 22, 1, look);
    fist(g, x0 + 14, y0 + 34, 26, look, 1);
  },
  drawFx(g, w, h, anim) {
    impactBurst(g, w / 2, tipY(h), anim.sinceConfirm, anim.confirmGood);
  },
  use(ctx: ToolUseContext) {
    ctx.bus.emit('tool-used', { toolId: 'patch' });
    const e = ctx.aimEntity(1.8, 0.45);
    if (!e || e.def.kind !== 'workstation') {
      ctx.bus.emit('message', { text: 'No workstation within reach. The disk stays in your pocket.', kind: 'info' });
      return false;
    }
    const name = e.def.inspect?.label ?? 'this host';
    if (e.infected) {
      ctx.bus.emit('tool-hit', { toolId: 'patch', entityId: e.def.id, good: false });
      ctx.bus.emit('message', {
        text: `${name} is still infected. A patch closes the hole but will not evict running malware: clean it with the SCANNER (3) first.`,
        kind: 'warn',
      });
      return false;
    }
    if (e.state.patched) {
      ctx.bus.emit('message', { text: `${name} is already patched.`, kind: 'info' });
      return false;
    }
    e.state.patched = true;
    ctx.bus.emit('tool-hit', { toolId: 'patch', entityId: e.def.id, good: true });
    ctx.bus.emit('message', { text: `PATCHED ${name}: known vulnerability closed before anyone can exploit it.`, kind: 'good' });
    return true;
  },
};
