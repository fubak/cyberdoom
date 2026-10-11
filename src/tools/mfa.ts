import type { ToolDef, ToolUseContext } from '../core/types';
import { impactBurst, usePhase, tipY } from './anim';
import { bevel, rect } from './pixel';
import { mfaPending } from './badge';
import { targetNoun } from './hint';

const WINDUP = 0.08;

/**
 * Slot 7 — MFA TOKEN (FIDO2 security key with a fingerprint sensor).
 * Badge = something you have; the fingerprint-unlocked key adds something
 * you are, so together they are two DIFFERENT factor types. FIDO2 signs
 * only for the origin it was enrolled to, so a phishing page gets nothing,
 * and it is bound to one named identity, so it cannot vouch for a shared
 * account.
 */
export const mfaTool: ToolDef = {
  id: 'mfa',
  name: 'MFA TOKEN',
  slot: 7,
  ammo: null,
  cooldown: 0.5,
  windup: WINDUP,
  blurb: 'SECOND FACTOR',
  unlock: { difficulty: 3 },
  control: {
    name: 'Multifactor authentication (FIDO2 security key + biometric)',
    category: 'technical',
    types: ['preventive'],
    objectives: ['4.6', '2.2'],
    use: 'MFA doors: swipe the BADGE (something you have), then touch the token (your fingerprint: something you are). It refuses phishing prompts and shared accounts, because the key is bound to your identity and to the real site.',
    lesson: 'MFA combines different factor types (know / have / are / somewhere you are). Two of the same type is not MFA. FIDO2 keys are phishing-resistant because they check the origin; a shared account defeats MFA because nobody is uniquely identified.',
  },
  drawViewmodel(g, w, h, _bob, _gender, _cd, anim) {
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    // insert + touch: the token seats UP into the reader and HELD through the
    // impact window while the fingerprint read lands (LED blinks white/amber)
    const push = ph.k > 0 ? ph.k * 8 : ph.k * 1;
    const lit = ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.5);
    const x0 = Math.round(w / 2 - 10);
    const y0 = Math.round(h - 55 - push);
    // USB-A connector: steel shell with the two contact windows
    rect(g, x0 + 3, y0, 14, 14, '#c8ccd8');
    rect(g, x0 + 3, y0, 14, 2, '#eef0f6');
    rect(g, x0 + 15, y0 + 2, 2, 12, '#7a8296');
    rect(g, x0 + 6, y0 + 4, 3, 4, '#2a2e38');
    rect(g, x0 + 11, y0 + 4, 3, 4, '#2a2e38');
    if (ph.phase === 'impact') {
      // contact flash where the key seats in the reader
      rect(g, x0 + 3, y0, 14, 2, '#ffffff');
    }
    // key body: long and slim, like a real FIDO2 security key
    bevel(g, x0, y0 + 14, 20, 40, '#23262e', 2);
    rect(g, x0 + 2, y0 + 16, 16, 2, '#3a3f4c');
    // gold touch contact (user presence) with a fingerprint-ring pattern
    const cx = x0 + 10;
    const cy = y0 + 30;
    const ring = lit ? (anim?.confirmGood === false && (anim?.sinceConfirm ?? 9) < 0.4 ? '#ff4a2a' : '#5aff6a') : '#e0b030';
    rect(g, cx - 6, cy - 6, 12, 12, '#7a5a10');
    for (const r of [5, 3]) {
      rect(g, cx - r, cy - r, r * 2, 1, ring);
      rect(g, cx - r, cy + r - 1, r * 2, 1, ring);
      rect(g, cx - r, cy - r, 1, r * 2, ring);
      rect(g, cx + r - 1, cy - r, 1, r * 2, ring);
    }
    rect(g, cx - 1, cy - 1, 2, 2, ring);
    // status LED: blinks white/amber while the fingerprint read is in flight
    const led = lit
      ? Math.floor((anim?.time ?? 0) * 16) % 2 === 0 ? '#ffffff' : '#ffb020'
      : '#2ad83a';
    rect(g, x0 + 8, y0 + 38, 4, 2, led);
    rect(g, x0 + 7, y0 + 46, 6, 5, '#0a0b0e');
    // steel key ring through the hole, swinging off to the side
    rect(g, x0 + 12, y0 + 47, 10, 2, '#aeb6c2');
    rect(g, x0 + 20, y0 + 47, 2, 8, '#aeb6c2');
    rect(g, x0 + 12, y0 + 53, 10, 2, '#7a8296');
  },
  drawFx(g, w, h, anim) {
    impactBurst(g, w / 2, tipY(h), anim.sinceConfirm, anim.confirmGood, 0.7);
  },
  use(ctx: ToolUseContext) {
    ctx.bus.emit('tool-used', { toolId: 'mfa' });
    const door = ctx.isDoorAhead();
    if (door) {
      const pending = mfaPending(ctx.entities);
      if (!door.mfa) {
        ctx.bus.emit('message', { text: 'This reader is badge-only: no MFA prompt here.', kind: 'info' });
        return;
      }
      if (!pending.has(door.doorId)) {
        ctx.bus.emit('tool-hit', { toolId: 'mfa', good: false });
        ctx.bus.emit('message', {
          text: 'MFA needs TWO factors: swipe the BADGE (4) first, then the token. One factor alone does not open it.',
          kind: 'warn',
        });
        return;
      }
      pending.delete(door.doorId);
      ctx.bus.emit('tool-hit', { toolId: 'mfa', good: true });
      ctx.bus.emit('message', { text: 'MFA PASSED: badge (have) + fingerprint (are). Door released.', kind: 'good' });
      ctx.bus.emit('badge-door', { doorId: door.doorId, accessRole: door.accessRole, allowed: true });
      return;
    }
    const e = ctx.aimEntity(2.5, 0.4);
    if (!e) {
      ctx.bus.emit('message', { text: 'Nothing is asking for MFA here.', kind: 'info' });
      return;
    }
    const tags = e.def.tags ?? [];
    if (e.def.inspect?.category === 'phishing' || tags.includes('phish-prompt')) {
      e.state.mfaRefused = true;
      ctx.bus.emit('tool-hit', { toolId: 'mfa', entityId: e.def.id, good: false });
      ctx.bus.emit('message', {
        text: `KEY REFUSED: ${e.def.inspect?.label ?? 'this prompt'} is not the origin the key was enrolled to. FIDO2 will not sign for a look-alike site, so the phish gets nothing. MOUSE (2) it and flag it.`,
        kind: 'warn',
      });
      return;
    }
    if (tags.includes('shared-account')) {
      ctx.bus.emit('tool-hit', { toolId: 'mfa', entityId: e.def.id, good: false });
      ctx.bus.emit('message', {
        text: 'TOKEN REJECTED: a shared login has no single owner, so MFA cannot prove WHO signs in. Refuse it and report it.',
        kind: 'bad',
      });
      return;
    }
    ctx.bus.emit('message', { text: `${e.def.inspect?.label ?? 'That'} does not take a security key.`, kind: 'info' });
  },
  hint(ctx) {
    const door = ctx.isDoorAhead();
    if (door) {
      if (!door.mfa) return { text: 'BADGE-ONLY READER', ready: false };
      if (!mfaPending(ctx.entities).has(door.doorId)) return { text: 'SWIPE BADGE FIRST', ready: false };
      return { text: 'CONFIRM MFA AT READER', ready: true };
    }
    const e = ctx.aimEntity(2.5, 0.4);
    if (!e) return null;
    return { text: `TOUCH TOKEN: ${targetNoun(e)}`, ready: true };
  },
};
