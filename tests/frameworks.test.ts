import { describe, expect, it } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import {
  ATTACK_LABELS,
  NIST_IR_PHASES,
  deriveFrameworkTags,
  visibleFrameworkLine,
} from '../src/content/frameworks';

describe('MITRE ATT&CK & NIST SP 800-61 framework tags (C3)', () => {
  it('assigns at least one valid ATT&CK technique ID and NIST IR phase to every malicious case across M01-M12', () => {
    let maliciousCount = 0;
    for (const m of missionRegistry.all()) {
      for (const e of m.entities) {
        if (!e.inspect) continue;
        if (e.inspect.category === 'malware' || e.inspect.category === 'phishing') {
          maliciousCount++;
          const fw = deriveFrameworkTags(e);
          expect(fw.attack.length, `${m.id}:${e.id}`).toBeGreaterThanOrEqual(1);
          for (const id of fw.attack) {
            expect(id, `${m.id}:${e.id}`).toMatch(/^T\d{4}(\.\d{3})?$/);
            expect(ATTACK_LABELS[id], `${id} in ATTACK_LABELS`).toBeTruthy();
          }
          expect(fw.irPhase, `${m.id}:${e.id} irPhase`).toBeDefined();
          expect(NIST_IR_PHASES).toContain(fw.irPhase);
        }
      }
    }
    expect(maliciousCount).toBeGreaterThan(20);
  });

  it('hides ATT&CK and NIST tags while a triage call is unresolved so the verdict never leaks', () => {
    const pending = {
      attack: ['T1091'],
      irPhase: 'Containment',
      call: { options: [], picked: -1, resolved: false },
    };
    expect(visibleFrameworkLine(pending)).toBe('');

    const resolved = {
      ...pending,
      call: { options: [], picked: 0, resolved: true },
    };
    const line = visibleFrameworkLine(resolved);
    expect(line).toContain('T1091');
    expect(line).toContain('CONTAINMENT');
  });
});
