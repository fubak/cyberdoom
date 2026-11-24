import { roleLabel } from '../core/roleLabel';
import { measureText } from '../render/font';

/**
 * Status-bar badge cell (pure, unit-tested): "BADGE:" over the role, tinted
 * by privilege tier, plus the one-time explanation shown the first time a
 * badge reader refuses the player for role reasons.
 */

export type PrivilegeTier = 'basic' | 'standard' | 'elevated' | 'admin';

const TIER_OF: Readonly<Record<string, PrivilegeTier>> = {
  staff: 'basic',
  guest: 'basic',
  vendor: 'basic',
  analyst: 'standard',
  admin: 'admin',
  sysadmin: 'admin',
  root: 'admin',
  exec: 'admin',
};

/** Label colour per tier (lit on the dark bar; tier is also spelled by the role word). */
export const TIER_COLOR: Readonly<Record<PrivilegeTier, string>> = {
  basic: '#c8c0b0',
  standard: '#8ab4ff',
  elevated: '#ffc030',
  admin: '#ff7a5a',
};

/** Unknown non-empty roles are scoped job roles (IT OPS, SOC, AUDIT...): elevated. */
export function privilegeTier(role: string): PrivilegeTier {
  const id = role.trim().toLowerCase();
  if (!id) return 'basic';
  return TIER_OF[id] ?? 'elevated';
}

export function tierColor(role: string): string {
  return TIER_COLOR[privilegeTier(role)];
}

export const BADGE_CAPTION = 'BADGE:';

/** Abbreviations for role words wider than the badge cell. */
const SHORT: Readonly<Record<string, string>> = {
  investigator: 'INVESTG',
  sysadmin: 'SYSADM',
};

/** The role word for the badge cell, fitted to `maxW` tiny-font units without an ellipsis. */
export function badgeRoleText(role: string, maxW: number): string {
  const full = roleLabel(role || 'none');
  if (measureText(full, 'tiny') <= maxW) return full;
  const short = SHORT[role.toLowerCase()];
  if (short && measureText(short, 'tiny') <= maxW) return short;
  let s = full.replace(/\s+/g, '');
  while (s.length > 1 && measureText(s, 'tiny') > maxW) s = s.slice(0, -1);
  return s;
}

/** One-time ticker explanation for a role-based door denial (fits three ticker rows). */
export function roleDenialExplainer(required: string, held: readonly string[]): string {
  const have = held.length ? held.map(roleLabel).join(', ') : 'NO ROLE';
  return `BADGE ROLES: this door needs ${roleLabel(required)}. Your badge has ${have}. ` +
    'Higher roles open more doors. Earn the role in the mission or find another route.';
}

export const ROLE_HINT_KEY = 'cyberdoom.hint.badge-role.seen';

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KeyStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * True once per player: the first call returns true and marks the hint seen.
 * Blocked storage only means the hint may show again next session.
 */
export function claimRoleHint(store: KeyStore | null = defaultStore()): boolean {
  try {
    if (store?.getItem(ROLE_HINT_KEY) === '1') return false;
    store?.setItem(ROLE_HINT_KEY, '1');
  } catch {
    // storage blocked: fall through and show it this time
  }
  return true;
}
