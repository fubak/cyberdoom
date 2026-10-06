import type { Entity, ToolDef, ToolUseContext } from '../core/types';
import type { EventBus } from '../core/events';
import { impactBurst, usePhase, tipY, vmLine } from './anim';
import { glow, pill, rect, shade } from './pixel';
import { drawText } from './pixelfont';
import { ANALYSTS } from './look';
import { fist, handLook, sleeve } from './shared';

const WINDUP = 0.08;

/** Doors this badge has already been refused at (per mission run). */
const refused = new WeakMap<object, Set<string>>();
/** MFA doors where the badge factor has been presented and the token is awaited. */
const badged = new WeakMap<object, Set<string>>();
export function mfaPending(key: object): Set<string> {
  let s = badged.get(key);
  if (!s) badged.set(key, (s = new Set()));
  return s;
}

export interface BadgeSwipeContext {
  bus: EventBus;
  /** The entity array is the WeakMap key — pass the runtime's own list. */
  entities: Entity[];
  authorizedRoles: string[];
}

/**
 * ONE swipe path, shared by the badge tool and the E-at-door press. Emits
 * 'badge-door' (opens + scores), 'badge-confirm' and messages on the bus; a
 * refused swipe logs a least-privilege violation downstream via 'badge-door'
 * with allowed:false — only callers that represent a deliberate badge swipe
 * (tool use, or an authorized E press) should call this.
 */
export function swipeBadge(
  ctx: BadgeSwipeContext,
  door: { doorId: string; accessRole?: string; mfa?: boolean },
): void {
  const allowed = door.accessRole === undefined || ctx.authorizedRoles.includes(door.accessRole);
  if (!allowed) {
    let set = refused.get(ctx.entities);
    if (!set) refused.set(ctx.entities, (set = new Set()));
    if (set.has(door.doorId)) {
      ctx.bus.emit('message', {
        text: `ACCESS DENIED: ${door.accessRole ?? 'restricted'} role required. Already logged; find another route.`,
        kind: 'warn',
      });
      ctx.bus.emit('badge-confirm', { allowed: false });
      return;
    }
    set.add(door.doorId);
  }
  if (allowed && door.mfa) {
    mfaPending(ctx.entities).add(door.doorId);
    ctx.bus.emit('badge-confirm', { allowed: true });
    ctx.bus.emit('message', {
      text: 'BADGE OK: one factor (something you have). This door enforces MFA: touch your TOKEN (7) to the reader.',
      kind: 'warn',
    });
    return;
  }
  ctx.bus.emit('badge-door', { doorId: door.doorId, accessRole: door.accessRole, allowed });
}

/**
 * Slot 4 — BADGE / CREDENTIAL (physical access control + least privilege).
 * Swiping a door asks the access-control system whether YOUR ROLE is
 * authorised. Swiping a door outside your role is logged as a
 * least-privilege violation (once — repeat swipes are just refused).
 */
export const badgeTool: ToolDef = {
  id: 'badge',
  name: 'BADGE',
  slot: 4,
  ammo: null,
  cooldown: 0.55,
  windup: WINDUP,
  blurb: 'BADGE READERS',
  control: {
    name: 'Access badge + role-based access control',
    category: 'physical',
    types: ['preventive'],
    objectives: ['1.2', '4.6'],
    use: 'Swipe at a door within arm\'s reach. Doors open only for roles you are authorised for in this mission; trying a door outside your role is logged as a violation.',
    lesson: 'Least privilege: hold only the access your job requires. Every badge swipe is logged, so attempts outside your role are visible to auditors.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    const thrust = Math.max(0, ph.k);
    const back = Math.max(0, -ph.k);
    const sc = 1 - thrust * 0.25;
    const cx = w / 2 - 34 + thrust * 18;
    const top = 112 - thrust * 26 + back * 8;
    const cw = Math.round(44 * sc);
    const ch = Math.round(60 * sc);
    const x0 = Math.round(cx - cw / 2);
    // lanyard reel cord
    for (let i = 0; i < 12; i++) rect(g, x0 + cw / 2 - 30 - i * 2, top + ch + 4 + i * 3, 2, 2, '#c33');
    // card
    pill(g, x0, top, cw, ch, '#eef2f8');
    rect(g, x0 + cw - 3, top + 2, 2, ch - 4, shade('#eef2f8', 0.75));
    rect(g, x0 + 1, top, cw - 2, Math.round(12 * sc), '#27407a');
    drawText(g, 'SOC', x0 + 4, top + 3, '#ffffff', 1);
    // photo
    const px = x0 + 4;
    const py = top + Math.round(16 * sc);
    const pw = Math.round(14 * sc);
    rect(g, px, py, pw, Math.round(17 * sc), '#9fb4d6');
    rect(g, px + 3, py + 3, pw - 6, Math.round(8 * sc), look.skin[0]);
    rect(g, px + 2, py + 1, pw - 4, 3, ANALYSTS[gender].hair);
    rect(g, px + 1, py + Math.round(12 * sc), pw - 2, Math.round(5 * sc), look.jacket);
    // name lines + chip
    rect(g, x0 + pw + 7, py + 1, cw - pw - 12, 2, '#333a48');
    rect(g, x0 + pw + 7, py + 5, cw - pw - 16, 2, '#7a8296');
    rect(g, x0 + pw + 7, py + 12, 8, 6, '#d9b24a');
    rect(g, x0 + pw + 8, py + 14, 6, 1, '#a07a20');
    // status stripe flips colour on the reader's verdict
    const conf = (anim?.sinceConfirm ?? 9) < 0.6;
    const stripe = conf ? (anim?.confirmGood ? '#39d353' : '#e0301e') : '#ffb000';
    rect(g, x0 + 1, top + ch - Math.round(8 * sc), cw - 2, Math.round(6 * sc), stripe);
    drawText(g, ANALYSTS[gender].callsign, x0 + 4, top + ch - Math.round(19 * sc), '#1c2030');
    // hand pinching the card's lower edge
    sleeve(g, x0 + cw / 2 - 4, top + ch + 14, 20, -1, look);
    fist(g, x0 + cw / 2 - 16, top + ch - 6, 22, look, -1);
  },
  drawFx(g, w, _h, anim) {
    const ph = usePhase(anim.sinceUse, WINDUP);
    if (ph.phase === 'impact' || (ph.phase === 'recover' && ph.u < 0.6)) {
      // RFID arcs radiating toward the reader
      const k = ph.phase === 'impact' ? ph.u : 1 + ph.u;
      g.fillStyle = '#9fe8ff';
      for (let a = 0; a < 3; a++) {
        const r = 6 + a * 7 + k * 6;
        for (let t = -0.7; t <= 0.7; t += 0.12) {
          g.fillRect(Math.round(w / 2 - 14 + Math.sin(t) * r), Math.round(vmLine(_h) + 26 - Math.cos(t) * r * 0.6), 1, 1);
        }
      }
      glow(g, w / 2 - 14, vmLine(_h) + 26, 14, '140,220,255', 0.3);
    }
    impactBurst(g, w / 2, tipY(_h), anim.sinceConfirm, anim.confirmGood, 0.7);
  },
  use(ctx: ToolUseContext) {
    ctx.bus.emit('tool-used', { toolId: 'badge' });
    const door = ctx.isDoorAhead();
    if (!door) {
      ctx.bus.emit('message', { text: 'No badge reader in reach.', kind: 'info' });
      return;
    }
    swipeBadge(ctx, door);
  },
  hint(ctx) {
    const door = ctx.isDoorAhead();
    if (!door) return { text: 'NO BADGE READER IN REACH', ready: false };
    // a readerless door opens with E; swiping the badge at it does nothing useful
    if (door.accessRole === undefined) return { text: 'NO READER: PRESS E TO OPEN', ready: false };
    return { text: 'SWIPE BADGE AT READER', ready: true };
  },
};
