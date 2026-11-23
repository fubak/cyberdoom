import type { Entity } from '../core/types';

/**
 * The single source of truth for what E/Space does: both the actual E action
 * in main.ts and the HUD "what does E do" hint resolve through this so they
 * cannot drift. Mirrors the tick() E block branch order exactly.
 */
export interface UseTargetContext {
  /** Door cell on the aim ray within interact range (excludes locked doors). */
  isDoorAhead: () => { doorId: string; accessRole?: string; dist: number; mfa?: boolean } | null;
  isDoorOpen: (doorId: string) => boolean;
  /** Nearest entity within `maxDist` tiles and `maxAngle` rad of the aim. */
  aimEntity: (maxDist: number, maxAngle: number) => Entity | null;
  /** Distance to the wall along the facing ray. */
  wallDistance: number;
  /** Player's authorized roles and whether they own the badge tool. */
  roles: string[];
  hasBadge: boolean;
  hasToken: boolean;
  /** Door ids where the badge factor was already presented (MFA in progress). */
  mfaPending: Set<string>;
  /** Names the entity that can grant a badge role ("SECURITY DESK"), if any. */
  roleSource?: (role: string) => string | null;
}

export type UseTarget =
  | { kind: 'door'; door: { doorId: string; accessRole?: string; mfa?: boolean } }
  | { kind: 'bump' }
  | { kind: 'entity'; entity: Entity }
  | { kind: 'none' };

export function resolveUse(ctx: UseTargetContext): UseTarget {
  const door = ctx.isDoorAhead();
  if (door && !ctx.isDoorOpen(door.doorId)) {
    return { kind: 'door', door };
  }
  if (!ctx.aimEntity(1.4, 0.5) && ctx.wallDistance < 1.2) {
    return { kind: 'bump' };
  }
  const target = ctx.aimEntity(1.5, 0.5);
  if (target) return { kind: 'entity', entity: target };
  return { kind: 'none' };
}

/**
 * E-line text for a door, mirroring the passive badge/MFA reader flow.
 */
export function doorUseHint(ctx: UseTargetContext, door: { doorId: string; accessRole?: string; mfa?: boolean }): string {
  if (door.accessRole === undefined) return 'OPEN DOOR';
  if (!ctx.roles.includes(door.accessRole)) {
    const source = ctx.roleSource?.(door.accessRole);
    return `READER: ${door.accessRole.toUpperCase()} ONLY${source ? ` — ${source.toUpperCase()} CAN BADGE YOU IN` : ''}`;
  }
  if (!ctx.hasBadge) return 'READER: NO BADGE';
  if (door.mfa) return ctx.hasToken ? 'BADGE + TOKEN AT READER' : 'MFA READER: NO TOKEN';
  return 'SWIPE BADGE AT READER';
}
