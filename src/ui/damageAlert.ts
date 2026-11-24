/**
 * Damage feedback (pure, unit-tested): a timed alert that names the attacker
 * and where it is relative to the player, plus a directional screen-edge tint.
 * Replaces the old persistent "WORM IS DRAINING YOUR INTEGRITY!" ticker line.
 *
 * Photosafety: the edge tint is a narrow band (under 10% of the view), holds a
 * steady level while hits keep landing and only fades afterwards, so sustained
 * damage never strobes it; full-screen flashes stay with FlashRateLimiter.
 */

export type Bearing = 'AHEAD' | 'LEFT' | 'RIGHT' | 'BEHIND';

/** The alert stays fully visible this long after the last hit (seconds)... */
export const ALERT_HOLD = 1.5;
/** ...then fades out over this long, so it is gone ~2 s after damage stops. */
export const ALERT_FADE = 0.5;
export const EDGE_HOLD = 0.6;
export const EDGE_FADE = 0.6;
export const EDGE_MAX_ALPHA = 0.35;
/** Reduced-flash mode: a dimmer band, same steady shape. */
export const EDGE_REDUCED_ALPHA = 0.18;

export interface DamageHit {
  /** Attacker display name ('WORM'). */
  label: string;
  bearing: Bearing;
  /** Whole tiles to the attacker (>= 1). */
  tiles: number;
  /** Other attackers currently draining integrity. */
  others: number;
}

export interface DamageAlertState {
  readonly hit: DamageHit;
  readonly lastHitT: number;
}

/**
 * Attacker bearing relative to the player's facing. `dx, dy` point from the
 * player to the attacker in map units; positive relative angle is the
 * player's right (same convention as the face and the pain-wash side).
 */
export function relativeBearing(dx: number, dy: number, facing: number): Bearing {
  let da = Math.atan2(dy, dx) - facing;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const a = Math.abs(da);
  if (a <= Math.PI / 4) return 'AHEAD';
  if (a >= (3 * Math.PI) / 4) return 'BEHIND';
  return da > 0 ? 'RIGHT' : 'LEFT';
}

/** Whole-tile distance for the alert, never below 1 (a point-blank hit reads "1 TILE"). */
export function tileDistance(distance: number): number {
  return Math.max(1, Math.round(Number.isFinite(distance) ? distance : 1));
}

/** "WORM - 3 TILES BEHIND", "+1 MORE" when others are draining too. */
export function damageAlertText(hit: DamageHit): string {
  const label = (hit.label.trim() || 'MALWARE').toUpperCase();
  const tiles = `${hit.tiles} TILE${hit.tiles === 1 ? '' : 'S'}`;
  const more = hit.others > 0 ? ` +${hit.others} MORE` : '';
  return `${label} - ${tiles} ${hit.bearing}${more}`;
}

export function noteHit(_prev: DamageAlertState | null, hit: DamageHit, now: number): DamageAlertState {
  return { hit: { ...hit }, lastHitT: now };
}

function fade(age: number, hold: number, span: number): number {
  if (age < 0) return 1;
  if (age <= hold) return 1;
  return Math.max(0, 1 - (age - hold) / span);
}

/** The alert line and its opacity, or null once it has faded. */
export function alertView(s: DamageAlertState | null, now: number): { text: string; alpha: number; bearing: Bearing } | null {
  if (!s) return null;
  const alpha = fade(now - s.lastHitT, ALERT_HOLD, ALERT_FADE);
  if (alpha <= 0) return null;
  return { text: damageAlertText(s.hit), alpha, bearing: s.hit.bearing };
}

/** Directional edge tint toward the attacker, or null once faded. */
export function edgeIndicator(
  s: DamageAlertState | null,
  now: number,
  reducedFlash = false,
): { bearing: Bearing; alpha: number } | null {
  if (!s) return null;
  const k = fade(now - s.lastHitT, EDGE_HOLD, EDGE_FADE);
  if (k <= 0) return null;
  return { bearing: s.hit.bearing, alpha: k * (reducedFlash ? EDGE_REDUCED_ALPHA : EDGE_MAX_ALPHA) };
}

/** Edge band rect (base units) for a bearing inside a view of w x h. */
export function edgeBand(bearing: Bearing, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const side = Math.floor(w * 0.08);
  const cap = Math.floor(h * 0.1);
  switch (bearing) {
    case 'LEFT': return { x: 0, y: 0, w: side, h };
    case 'RIGHT': return { x: w - side, y: 0, w: side, h };
    case 'AHEAD': return { x: 0, y: 0, w, h: cap };
    default: return { x: 0, y: h - cap, w, h: cap };
  }
}
