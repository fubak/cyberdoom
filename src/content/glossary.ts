/**
 * CURRICULUM: glossary of terms surfaced in briefings, inspect text and
 * debriefs. Definitions use SY0-701 terminology; the objective id in brackets
 * is where the exam lists the term.
 */
export const GLOSSARY: Record<string, string> = {
  // --- malware & indicators (2.4) ---
  'malware':
    'Malicious software. SY0-701 lists ransomware, trojans, worms, spyware, bloatware, viruses, keyloggers, logic bombs and rootkits. [2.4]',
  'ransomware':
    'Malware that encrypts or locks a victim\u2019s data and demands payment for the key. Indicators: resource inaccessibility, renamed/unreadable files, a ransom note. [2.4]',
  'worm':
    'Malware that self-replicates across a network by exploiting vulnerabilities, without attaching to a file or needing a user to run it. [2.4]',
  'trojan':
    'Malware disguised as legitimate software. It does not self-replicate; a user is tricked into running it. [2.4]',
  'spyware':
    'Malware that covertly monitors the user and sends data (browsing, keystrokes, files) to the attacker. Designed to stay quiet. [2.4]',
  'indicators of malicious activity':
    'Observable signs an attack is under way, e.g. account lockout, concurrent session usage, blocked content, impossible travel, resource consumption, resource inaccessibility, out-of-cycle logging, missing logs. [2.4]',
  'false positive':
    'An alert or verdict that flags benign activity as malicious. Context and tuning reduce false positives; each one wastes response effort and erodes trust in alerts.',
  'resource consumption':
    'An indicator: CPU, memory, disk or bandwidth use far above the host\u2019s baseline, often from a worm, cryptominer or data staging. [2.4]',
  'resource inaccessibility':
    'An indicator: users suddenly can\u2019t open files or reach services they normally can, e.g. after ransomware encryption. [2.4]',

  // --- vectors & awareness (2.2, 5.6) ---
  'removable device':
    'A threat vector: USB drives and similar media can carry malware or act as keystroke injectors. Found media goes to security unopened. [2.2, 5.6]',
  'phishing':
    'Fraudulent messages that impersonate a trusted party to steal credentials or deliver malware. Variants: vishing (voice), smishing (SMS). [2.2, 5.6]',
  'social engineering':
    'Manipulating people, not systems, into breaking security procedure, e.g. pretexting, impersonation, phishing. [2.2, 5.6]',
  'security awareness reporting':
    'Users report suspicious messages, media and behavior through the official channel so security can act; an unreported risk is an unmanaged risk. [5.6]',

  // --- mitigations & hardening (2.5) ---
  'endpoint protection':
    'Host software (antimalware, EDR) that detects, blocks and removes malicious code. Installing it is an SY0-701 hardening technique. [2.5, 4.5]',
  'hardening':
    'Reducing a host\u2019s attack surface: patching, endpoint protection, host-based firewall, HIPS, disabling unused ports/protocols, changing default passwords, removing unnecessary software. [2.5]',
  'patching':
    'Applying vendor updates that fix known vulnerabilities. A core mitigation and vulnerability-management activity. [2.5, 4.3]',
  'vulnerability scan':
    'An automated examination of systems for known weaknesses, such as missing patches, unsafe configurations or vulnerable software versions. [4.3]',
  'cvss':
    'The Common Vulnerability Scoring System rates vulnerability severity with standardized metrics; its base score alone does not determine local risk. [4.3]',
  'sql injection':
    'An injection attack in which untrusted input is interpreted as part of a database query, potentially exposing or changing data. [2.3]',
  'buffer overflow':
    'A flaw where data exceeds a memory buffer and may overwrite adjacent memory, potentially changing program behavior. [2.3]',
  'cross-site scripting':
    'An injection flaw that causes a web application to deliver attacker-controlled script to users\u2019 browsers. [2.3]',
  'race condition':
    'A flaw where behavior depends on the timing or order of concurrent operations, potentially allowing an unsafe state or unauthorized action. [2.3]',
  'secure baseline':
    'A documented minimum configuration standard that reduces attack surface by disabling unnecessary services and setting approved security controls. [4.1]',
  'code signing':
    'A digital signature binds software to its publisher and lets recipients verify its integrity and source before installation or deployment. [4.1]',

  // --- resilience (3.4) ---
  'backups':
    'Point-in-time copies kept separately (ideally offline or offsite) so data can be restored after loss or ransomware. Unlike replication, they don\u2019t instantly copy the damage. [3.4]',
  'replication':
    'Continuously copying data to another system for availability. It also copies corruption or encryption, so it is not a substitute for backups. [3.4]',

  // --- identity & access (1.2, 4.6) ---
  'least privilege':
    'Users and processes get only the minimum access their job function requires, and only for as long as they need it. [2.5, 4.6]',
  'role-based access control':
    'RBAC: permissions are assigned to roles (e.g. ANALYST, ADMIN) and users get access by being assigned a role. [4.6]',
  'shared credentials':
    'One account/password used by several people. Actions can no longer be tied to an individual, which breaks accounting and non-repudiation. Never accept or use them. [1.2, 5.6]',
  'accounting':
    'The third A in AAA: recording who did what and when, so actions can be audited and attributed. [1.2]',
  'non-repudiation':
    'Assurance that someone cannot credibly deny an action they took, because it is provably tied to them. [1.2]',
  'access badge':
    'A physical security control that grants entry based on the badge holder\u2019s authorization and logs each use. [1.2]',
  'privileged access management':
    'PAM tools that control admin access: password vaulting, just-in-time permissions, ephemeral credentials. Replaces shared admin passwords. [4.6]',

  // --- insider threat & investigation (2.1, 3.3, 4.8, 4.9) ---
  'insider threat':
    'A threat actor with authorized access (employee, contractor) who misuses it, intentionally or not. [2.1, 5.6]',
  'data exfiltration':
    'Unauthorized transfer of data out of the organization. A top motivation for insiders, organized crime and nation-states. [2.1]',
  'data classification':
    'Labeling data by sensitivity (e.g. public, private, sensitive, confidential, restricted, critical) so controls match its value. [3.3]',
  'intellectual property':
    'Creations like designs, source code and trade secrets. High-value data that insiders commonly exfiltrate. [3.3]',
  'data loss prevention':
    'DLP: tools that detect and block sensitive data leaving via email, web, cloud or removable media. [4.4, 4.5]',
  'endpoint logs':
    'Host-level records (device connections, process launches, file writes) from the OS or EDR agent. The data source for USB activity. [4.9]',
  'correlation':
    'Linking events from several data sources (badge, endpoint, network, DLP) into one timeline, so a conclusion rests on more than one signal. [4.4, 4.9]',
  'chain of custody':
    'Documented record of who handled evidence, when, and how. It keeps evidence admissible. [4.8]',
};

/** Case-insensitive glossary lookup. */
export function define(term: string): string | undefined {
  return GLOSSARY[term] ?? GLOSSARY[term.toLowerCase()];
}
