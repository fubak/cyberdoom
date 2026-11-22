import type { EntityDef, EvidenceEntry } from '../core/types';

/**
 * NIST SP 800-61 Rev. 2 Incident Response lifecycle phases.
 */
export const NIST_IR_PHASES = [
  'Preparation',
  'Detection & Analysis',
  'Containment',
  'Eradication',
  'Recovery',
  'Post-Incident',
] as const;

export type NistIrPhase = (typeof NIST_IR_PHASES)[number];

/**
 * MITRE ATT&CK Enterprise technique labels referenced by Cyberdoom cases.
 */
export const ATTACK_LABELS: Record<string, string> = {
  T1091: 'Replication Through Removable Media',
  T1078: 'Valid Accounts',
  T1566: 'Phishing',
  'T1566.001': 'Spearphishing Attachment',
  'T1566.002': 'Spearphishing Link',
  'T1566.004': 'Spearphishing Voice (Vishing)',
  T1059: 'Command and Scripting Interpreter',
  T1486: 'Data Encrypted for Impact',
  T1195: 'Supply Chain Compromise',
  T1021: 'Remote Services',
  T1190: 'Exploit Public-Facing Application',
  T1557: 'Adversary-in-the-Middle',
  T1041: 'Exfiltration Over C2 Channel',
  T1048: 'Exfiltration Over Alternative Protocol',
  T1562: 'Impair Defenses',
  T1210: 'Exploitation of Remote Services',
  T1133: 'External Remote Services',
  T1071: 'Application Layer Protocol',
  T1053: 'Scheduled Task/Job',
  T1528: 'Steal Application Access Token',
  T1204: 'User Execution',
  T1556: 'Modify Authentication Process',
  T1490: 'Inhibit System Recovery',
};

const MALICIOUS_CATEGORIES = new Set(['malware', 'phishing', 'suspicious']);

/**
 * Derive MITRE ATT&CK technique IDs and NIST SP 800-61 IR phase for an entity.
 * Explicit `inspect.attack` / `inspect.irPhase` take precedence; otherwise
 * derived from category, tags, label, and detail so every malicious case in
 * M01-M12 carries real-world framework attribution.
 */
export function deriveFrameworkTags(def: EntityDef): { attack: string[]; irPhase?: NistIrPhase } {
  const inspect = def.inspect;
  if (!inspect) return { attack: [] };

  const explicitAttack = inspect.attack?.filter(Boolean) ?? [];
  const explicitPhase = inspect.irPhase as NistIrPhase | undefined;
  const tags = def.tags ?? [];
  const text = `${inspect.label} ${inspect.detail} ${tags.join(' ')}`.toLowerCase();

  const isThreat =
    MALICIOUS_CATEGORIES.has(inspect.category) ||
    tags.some((t) =>
      ['infected', 'malicious', 'phish', 'insider', 'rogue', 'ransom', 'compromised', 'unpatched', 'vuln', 'exfil', 'backdoor', 'poisoned'].includes(
        t.toLowerCase(),
      ),
    );

  if (!isThreat && explicitAttack.length === 0) {
    return { attack: [], irPhase: explicitPhase };
  }

  const attack = new Set<string>(explicitAttack);

  if (/usb|thumb|removable|autorun|flash drive/.test(text)) attack.add('T1091');
  if (/vishing|caller|help.?desk|voice|phone/.test(text)) attack.add('T1566.004');
  else if (/phish|spoof|invoice|macro|attachment|lure|email|mail/.test(text)) attack.add('T1566');
  if (/ransom|encrypt|\.locked|decrypt|bitcoin|btc|shadow cop/.test(text)) {
    attack.add('T1486');
    if (/shadow|backup|vss/.test(text)) attack.add('T1490');
  }
  if (/vendor|supply|signed|update|pipeline|third.?party|dependency|sbom/.test(text)) attack.add('T1195');
  if (/cert|tls|ssl|mitm|rogue ap|arp|intercept|downgrade/.test(text)) attack.add('T1557');
  if (/lateral|worm|smb|psexec|rdp|pivot|segment|vlan|east.?west/.test(text)) attack.add('T1021');
  if (/zero.?day|cve|rce|exploit|log4|unpatched|overflow|jndi/.test(text)) attack.add('T1190');
  if (/exfil|upload|staging|beacon|c2|198\.51\.100|outbound|dns tunnel/.test(text)) attack.add('T1041');
  if (/insider|badge|tailgat|privilege|admin|root|mfa|fatigue|credential|account/.test(text)) attack.add('T1078');
  if (/disable|tamper|edr|siem|alert|playbook|poison|auto.?close|blind/.test(text)) attack.add('T1562');
  if (/script|powershell|bash|shell|cron|daemon/.test(text)) attack.add('T1059');

  // Fallback by category so no malicious entity is ever untagged
  if (attack.size === 0 && isThreat) {
    if (inspect.category === 'phishing') attack.add('T1566');
    else if (inspect.category === 'malware') attack.add('T1204');
    else attack.add('T1078');
  }

  let irPhase: NistIrPhase | undefined = explicitPhase;
  if (!irPhase && isThreat) {
    if (/backup|restore|recover|rebuild/.test(text)) irPhase = 'Recovery';
    else if (/patch|wipe|reimage|revoke|eradicate|clean/.test(text)) irPhase = 'Eradication';
    else if (/isolate|quarantine|segment|block|contain|ransom|worm|exfil|c2/.test(text)) irPhase = 'Containment';
    else irPhase = 'Detection & Analysis';
  }

  return { attack: [...attack].slice(0, 3), irPhase };
}

/**
 * Format ATT&CK & NIST IR attribution for an evidence entry.
 * Returns empty string if a triage call is still unresolved so tags never leak
 * the verdict before the player makes their call.
 */
export function visibleFrameworkLine(entry: Pick<EvidenceEntry, 'call' | 'attack' | 'irPhase'>): string {
  if (entry.call && !entry.call.resolved) return '';
  const parts: string[] = [];
  if (entry.attack && entry.attack.length > 0) {
    parts.push(`ATT&CK ${entry.attack.join(',')}`);
  }
  if (entry.irPhase) {
    parts.push(`NIST: ${entry.irPhase.toUpperCase()}`);
  }
  return parts.join(' | ');
}
