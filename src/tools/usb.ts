import type { ToolDef } from '../core/types';
import { hash, impactBurst, screenFlash, usePhase } from './anim';
import { bevel, glow, poly, rect, shade } from './pixel';
import { drawText, textWidth } from './pixelfont';
import { fist, handLook, sleeve } from './shared';

const WINDUP = 0.05;

/**
 * Slot 3 — USB SCANNER (antimalware / endpoint protection).
 * Your own org-issued, write-protected scanner stick: fires an antimalware
 * charge that cleans infected hosts and malware processes. Uses
 * "usb-charge" ammo (definition updates). Contrast: UNKNOWN found media is
 * a baiting vector and must never be plugged in (2.2).
 */
export const usbTool: ToolDef = {
  id: 'usb',
  name: 'USB SCANNER',
  slot: 3,
  ammo: { resource: 'usb-charge', start: 8, max: 30 },
  cooldown: 0.42,
  windup: WINDUP,
  auto: true,
  control: {
    name: 'Antimalware / endpoint protection (trusted scanner media)',
    category: 'technical',
    types: ['detective', 'corrective'],
    objectives: ['2.5', '2.4'],
    use: 'Fires an antimalware charge. Each hit removes one infection; flagged threats take two. Charges (signature updates) are limited, so do not waste them on clean hosts.',
    lesson: 'Endpoint protection is a core hardening technique. Only use known-good, organisation-issued media; a stick you find lying around is a baiting attack.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    // recoil: pushes down + tilts on impact
    const kick = ph.phase === 'impact' ? 1 : ph.phase === 'recover' ? 1 - ph.u : ph.phase === 'wind' ? -0.3 * ph.u : 0;
    const cx = w / 2 + 28 + kick * 3;
    const top = 104 + kick * 16;
    const lean = kick * 4;
    // connector (metal)
    const conTop = top;
    poly(g, [[cx - 9 + lean, conTop], [cx + 9 + lean, conTop], [cx + 10, conTop + 16], [cx - 10, conTop + 16]], '#aeb6c2');
    rect(g, cx - 6 + lean, conTop + 3, 4, 3, '#30343c');
    rect(g, cx + 2 + lean, conTop + 3, 4, 3, '#30343c');
    rect(g, cx - 9 + lean, conTop, 18, 1, '#e8eef6');
    // body (rubberised)
    const bTop = conTop + 16;
    poly(g, [[cx - 14, bTop], [cx + 14, bTop], [cx + 20, 190], [cx - 20, 190]], '#1f5fd8');
    poly(g, [[cx + 8, bTop], [cx + 14, bTop], [cx + 20, 190], [cx + 12, 190]], shade('#1f5fd8', 0.62));
    poly(g, [[cx - 14, bTop], [cx - 10, bTop], [cx - 14, 190], [cx - 20, 190]], shade('#1f5fd8', 1.3));
    rect(g, cx - 14, bTop, 28, 3, '#163f94');
    // bumpers
    rect(g, cx - 16, bTop + 3, 3, 10, '#ffb000');
    rect(g, cx + 13, bTop + 3, 3, 10, '#c88600');
    // LCD with ammo count / state
    const lx = cx - 11;
    const ly = bTop + 8;
    bevel(g, lx - 1, ly - 1, 24, 13, '#0d1a14');
    const confirm = (anim?.sinceConfirm ?? 9) < 0.5;
    const lcdBg = confirm ? (anim?.confirmGood ? '#103d1e' : '#3d1010') : '#0c2a1c';
    rect(g, lx, ly, 22, 11, lcdBg);
    const ammo = anim?.ammo ?? 0;
    const txt = confirm ? (anim?.confirmGood ? 'OK' : 'NO') : ammo <= 0 ? '--' : String(ammo).padStart(2, '0');
    const tc = confirm ? (anim?.confirmGood ? '#7dff9a' : '#ff6a5a') : ammo <= 2 ? '#ffb000' : '#5dff9a';
    drawText(g, txt, lx + 11 - textWidth(txt) / 2, ly + 2, tc);
    // shield logo + scan stripe
    const sy = bTop + 26;
    poly(g, [[cx - 6, sy], [cx + 6, sy], [cx + 6, sy + 6], [cx, sy + 11], [cx - 6, sy + 6]], '#e8eef6');
    poly(g, [[cx - 4, sy + 2], [cx + 4, sy + 2], [cx + 4, sy + 6], [cx, sy + 9], [cx - 4, sy + 6]], '#1f5fd8');
    rect(g, cx - 1, sy + 3, 2, 5, '#e8eef6');
    rect(g, cx - 3, sy + 5, 6, 1, '#e8eef6');
    // activity LED strip pulses while recovering
    for (let i = 0; i < 5; i++) {
      const on = ph.phase !== 'idle' ? hash(i + Math.floor((anim?.time ?? 0) * 24)) > 0.4 : i === Math.floor((anim?.time ?? 0) * 3) % 5;
      rect(g, cx - 9 + i * 4, bTop + 42, 2, 2, on ? '#55e0ff' : '#123a6a');
    }
    // grip hand
    sleeve(g, cx - 2, bTop + 70, 22, 1, look);
    fist(g, cx - 18, bTop + 48, 30, look, 1);
  },
  drawFx(g, w, h, anim) {
    const ph = usePhase(anim.sinceUse, WINDUP);
    // connector tip of the held scanner art (src/render/viewmodels.ts usbArt)
    const tipX = w / 2 + 20;
    const tipY = h - 92;
    if (ph.phase === 'wind') glow(g, tipX, tipY + 6, 10 * ph.u, '80,220,255', 0.6 * ph.u);
    if (ph.phase === 'impact') {
      // 4-frame "muzzle flash": bright core + ring of sparks
      glow(g, tipX, tipY, 46, '90,230,255', 0.95);
      glow(g, w / 2, 92, 90, '60,200,255', 0.25);
      screenFlash(g, w, h, '120,220,255', 0.12);
      const f = Math.floor(ph.u * 4);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + f;
        const r = 8 + f * 5 + hash(i + f * 13) * 6;
        rect(g, tipX + Math.cos(a) * r, tipY + Math.sin(a) * r * 0.7, 2, 2, i % 2 ? '#ffffff' : '#7ae8ff');
      }
      rect(g, tipX - 3, tipY - 3, 6, 6, '#ffffff');
    } else if (ph.phase === 'recover' && ph.u < 0.4) {
      glow(g, tipX, tipY, 20, '90,230,255', 0.5 * (1 - ph.u / 0.4));
    }
    impactBurst(g, w / 2, 92, anim.sinceConfirm, anim.confirmGood);
  },
  use(ctx) {
    ctx.fireProjectile({
      x: ctx.playerX,
      y: ctx.playerY,
      dx: Math.cos(ctx.playerAngle),
      dy: Math.sin(ctx.playerAngle),
      speed: 11,
      range: 12,
      source: 'usb-scanner',
    });
    ctx.bus.emit('tool-used', { toolId: 'usb' });
  },
};
