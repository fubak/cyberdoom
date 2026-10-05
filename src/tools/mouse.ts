import type { Entity, ToolDef, ToolUseContext } from '../core/types';
import { impactBurst, usePhase, tipY } from './anim';
import { ellipse, pill, rect, shade } from './pixel';
import { flatHand, handLook, sleeve } from './shared';

const WINDUP = 0.03;

/** Was this entity actually malicious? (ground truth from content.) */
export function isMalicious(e: Entity): boolean {
  const cat = e.def.inspect?.category;
  return e.infected || cat === 'malware' || cat === 'phishing' || cat === 'suspicious' || e.def.culprit === true;
}

/**
 * Slot 2 — MOUSE (triage / analysis).
 * Click 1 on a target: INSPECT — shows the indicators (2.4) without a verdict
 * pre-chewed for you. Click 2 on the same target: commit a TRIAGE verdict and
 * flag it as malicious. Correct flags make your response tools hit harder
 * (scanner damage doubles); flagging something benign is a false positive.
 */
export const mouseTool: ToolDef = {
  id: 'mouse',
  name: 'MOUSE',
  slot: 2,
  ammo: null,
  cooldown: 0.3,
  windup: WINDUP,
  control: {
    name: 'Analysis & triage (indicator review)',
    category: 'operational',
    types: ['detective'],
    objectives: ['2.4', '4.9'],
    use: 'Click a target to inspect its indicators. Click the same target again to flag it as malicious. Flagged threats take double damage from the scanner; flagging a benign target is a false positive.',
    lesson: 'Detection is a decision: weigh the indicators, then commit. False positives waste response effort and erode trust.',
  },
  drawViewmodel(g, w, _h, _bob, gender, _cd, anim) {
    const look = handLook(gender, anim);
    const ph = usePhase(anim?.sinceUse ?? 9, WINDUP);
    const press = ph.phase === 'impact' ? 1 : ph.phase === 'recover' ? 1 - ph.u : 0;
    const cx = w / 2 + 52;
    const cy = 156 + press * 2;
    // mouse pad edge
    rect(g, cx - 46, 176, 92, 8, '#1a1e2a');
    rect(g, cx - 46, 176, 92, 1, '#2e3448');
    // cable
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      rect(g, cx + Math.sin(t * 5) * 4 - 1, cy - 30 - t * 34, 2, 2, '#30343e');
    }
    // body
    ellipse(g, cx, cy, 22, 28, '#3a3f4c');
    ellipse(g, cx - 2, cy - 3, 19, 24, '#c9ced8');
    ellipse(g, cx - 5, cy - 7, 10, 13, shade('#c9ced8', 1.2));
    rect(g, cx + 12, cy - 6, 4, 22, shade('#c9ced8', 0.7));
    // buttons
    const lb = press > 0.3 ? '#9aa0ac' : '#d8dce4';
    rect(g, cx - 18, cy - 28, 17, 18, lb);
    rect(g, cx + 1, cy - 28, 15, 18, '#d0d4dc');
    rect(g, cx - 1, cy - 28, 2, 20, '#3a3f4c');
    // scroll wheel + DPI led
    pill(g, cx - 2, cy - 24, 4, 9, '#2a2e36');
    rect(g, cx - 1, cy - 22, 2, 2, '#55e0ff');
    rect(g, cx - 1, cy - 8, 2, 2, press > 0 ? '#ff5050' : '#3c4048');
    // hand resting on top, index finger on the left button
    sleeve(g, cx + 4, cy + 22, 22, 1, look);
    flatHand(g, cx - 2, cy - 30 + press * 2, 16, look, 1, Math.round(press * 3));
  },
  drawFx(g, w, _h, anim) {
    impactBurst(g, w / 2, tipY(_h), anim.sinceConfirm, anim.confirmGood, 0.6);
  },
  use(ctx: ToolUseContext) {
    const e = ctx.aimEntity(8, 0.26);
    ctx.bus.emit('tool-used', { toolId: 'mouse' });
    if (!e) return;
    if (!e.state.inspected && e.state.captured && e.def.inspect?.category !== 'person' && !e.def.tags?.includes('triage')) {
      // the tap already captured this host's traffic: the evidence is in hand, so go straight to the call
      e.state.inspected = true;
      ctx.bus.emit('inspect', { entityId: e.def.id });
    }
    if (!e.state.inspected) {
      e.state.inspected = true;
      ctx.bus.emit('tool-hit', { toolId: 'mouse', entityId: e.def.id, good: true });
      ctx.bus.emit('inspect', { entityId: e.def.id });
      if (!e.def.tags?.includes('triage') && (e.def.kind !== 'item' || isMalicious(e))) {
        ctx.bus.emit('message', { text: 'Click again on the same target to flag it as MALICIOUS.', kind: 'info' });
      }
      return;
    }
    if (e.state.flagged) {
      ctx.bus.emit('message', { text: `${e.def.inspect?.label ?? 'Target'} is already flagged.`, kind: 'info' });
      return;
    }
    if (e.def.tags?.includes('triage')) {
      ctx.bus.emit('message', { text: 'Decide from the raw evidence: SCANNER quarantines/patches, KEYBOARD releases.', kind: 'info' });
      return;
    }
    if (e.def.inspect?.category === 'person') {
      ctx.bus.emit('message', { text: 'People are not triaged. Correlate the logs, then report through the security console.', kind: 'info' });
      return;
    }
    const verdictCorrect = isMalicious(e);
    e.state.flagged = true;
    e.state.flagCorrect = verdictCorrect;
    ctx.bus.emit('triage', { entityId: e.def.id, verdict: 'malicious', correct: verdictCorrect });
    ctx.bus.emit('message', verdictCorrect
      ? { text: `TRUE POSITIVE: ${e.def.inspect?.label ?? 'target'} flagged. Response tools hit it twice as hard.`, kind: 'good' }
      : { text: `FALSE POSITIVE: ${e.def.inspect?.label ?? 'target'} shows no malicious indicators. Re-read the evidence.`, kind: 'bad' });
  },
};
