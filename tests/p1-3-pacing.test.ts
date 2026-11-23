import { describe, expect, it } from 'vitest';
import { m10 as m10ThirdParty } from '../src/content/missions/m10-third-party';
import { m11 as m11AuditNight } from '../src/content/missions/m11-audit-night';
import type { EntityDef } from '../src/core/types';

function interactiveEntities(entities: EntityDef[]): EntityDef[] {
  return entities.filter(
    (e) => e.kind === 'console' || e.kind === 'workstation' || e.kind === 'npc',
  );
}

describe('P1.3 M10 & M11 pacing & interactive consolidation', () => {
  it('trims M10 interactive artifacts well below the 56-console baseline while preserving all teaching beats', () => {
    const interactive = interactiveEntities(m10ThirdParty.entities);
    expect(interactive.length).toBeLessThanOrEqual(28);
    expect(interactive.length).toBeGreaterThanOrEqual(18);

    const ids = new Set(m10ThirdParty.entities.map((e) => e.id));
    for (const requiredId of [
      'demand-assessment',
      'vendor-dossier',
      'agreements-board',
      'opt-uptime-sla',
      'opt-conf-nda',
      'risk-intake',
      'risk-register',
      'opt-flood-accept',
      'opt-saas-transfer',
      'opt-eol-avoid',
      'opt-seg-mitigate',
      'msp-feed',
      'vendor-digest',
      'block-rmm',
      'apply-update',
      'rep',
      'procurement',
      'expedite-console',
    ]) {
      expect(ids.has(requiredId), `M10 missing required entity ${requiredId}`).toBe(true);
    }

    // All four risk strategies remain selectable choices with paired wrong options
    const strategyGroups = new Set(
      m10ThirdParty.entities.filter((e) => e.tags?.includes('strategy')).map((e) => e.group),
    );
    expect(strategyGroups.size).toBe(4);
  });

  it('trims M11 interactive artifacts well below the 61-console baseline while preserving all teaching beats', () => {
    const interactive = interactiveEntities(m11AuditNight.entities);
    expect(interactive.length).toBeLessThanOrEqual(42);
    expect(interactive.length).toBeGreaterThanOrEqual(30);

    const ids = new Set(m11AuditNight.entities.map((e) => e.id));
    for (const requiredId of [
      'inv-console',
      'audit-signin',
      'dsr-queue',
      'dsr1-right',
      'dsr2-hold',
      'dsr3-attest',
      'scope-brief',
      'scope-unknown',
      'rosa',
      'cole',
      'iris',
      'gov-binder',
      'gov-pick-aup-policy',
      'gov-pick-pw-standard',
      'gov-pick-offb-procedure',
      'gov-pick-desk-guideline',
      'vault-manifest',
      'ssd-erase',
      'hdd-retain',
      'tape-degauss',
      'shadow-destroy',
      'reconcile',
      'attest-console',
    ]) {
      expect(ids.has(requiredId), `M11 missing required entity ${requiredId}`).toBe(true);
    }

    // Physical sweep still covers 6 assets (normal, stale-owner, shadow, zombie, unlabeled)
    const assets = m11AuditNight.entities.filter((e) => e.tags?.includes('asset'));
    expect(assets.length).toBe(6);

    // Every disposal group has a correct action
    const disposeGroups = new Set(
      m11AuditNight.entities.filter((e) => e.tags?.includes('dispose')).map((e) => e.group),
    );
    expect(disposeGroups.size).toBe(4);
  });
});
