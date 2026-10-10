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

  // --- cryptography & authentication (1.4, 3.3, 4.6) ---
  'certificate chain':
    'The ordered path from a leaf certificate through issuing certificates to a trusted root; clients validate signatures and the chain against their trust store. [1.4]',
  'certificate authority':
    'A trusted organization or service that validates certificate requests and digitally signs certificates binding identities to public keys. [1.4]',
  'self-signed certificate':
    'A certificate signed by its own subject rather than an independent certificate authority; clients do not trust it unless it is explicitly installed as a trust anchor. [1.4]',
  'certificate revocation':
    'Invalidating a certificate before its expiration, commonly published in a certificate revocation list (CRL) or checked online through OCSP. [1.4]',
  'key rotation':
    'Replacing a cryptographic key with a new independent key pair on a defined schedule or after compromise, then retiring the old key. [1.4]',
  'hashing':
    'A one-way transformation that produces a fixed-length digest; password storage should use a dedicated slow password-hashing function, not reversible encryption. [1.4]',
  'salting':
    'Adding a unique random value to each password before hashing so identical passwords have different hashes and precomputed tables are less useful. [1.4]',
  'key stretching':
    'Making password hashing deliberately costly through repeated or memory-hard computation so each offline guess takes more time and resources. [1.4]',
  'tokenization':
    'Replacing sensitive data with a non-sensitive token whose mapping is held in a separate protected token vault, keeping real values out of downstream systems. [3.3]',
  'encryption at rest':
    'Cryptographically protecting stored data on disks, backups or other media so it remains unreadable without the required key. [3.3]',
  'multifactor authentication':
    'Authentication using two or more different factor types: something you know, have or are; two passwords or questions are still one type. [4.6]',

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

  // --- asset management, compliance & privacy (4.2, 5.1, 5.4, 5.5) ---
  'asset inventory':
    'The authoritative register of hardware, software and data assets: what you own, where it is and who owns it. Auditing starts by proving the register matches the floor. [4.2]',
  'shadow IT':
    'Assets in use that nobody registered or approved, like a rogue access point or an unmanaged test box. Unmanaged assets cannot be secured or audited. [4.2]',
  'sanitization':
    'Rendering data unrecoverable before media is reused or leaves control: cryptographic or secure erase for flash/SSD, degaussing or destruction for magnetic media. Formatting or deleting files is NOT sanitization. [4.2]',
  'degaussing':
    'Erasing magnetic media (HDD, tape) with a strong magnetic field. It does nothing to flash media like SSDs and USB sticks — match the method to the media. [4.2]',
  'certificate of destruction':
    'Formal record that an asset was sanitized or destroyed: serial, method, date, witness. Auditors treat a missing certificate as a missing control. [4.2]',
  'data retention':
    'Keeping data for the period laws and policy require, then disposing of it. Retain too little and you break the law; too long and you grow the breach surface. [5.4]',
  'legal hold':
    'A preservation order that suspends normal retention and deletion once litigation is expected. Deleting held data is spoliation, even when a data subject requests erasure. [5.4]',
  'right to be forgotten':
    'A data subject\u2019s right to request erasure of their personal data, bounded by legal retention obligations and legal holds. [5.4]',
  'attestation':
    'A formal, signed statement that controls or obligations were met, backed by evidence — not a verbal assurance. [5.4, 5.5]',
  'internal audit':
    'Self-assessment by the organization\u2019s own audit function: checks control design, gathers evidence and prepares for external exams. [5.5]',
  'external audit':
    'Independent assessment by outside auditors who attest only to what they verify; their signature carries regulatory weight. [5.5]',
  'penetration test':
    'An authorized, scoped attempt to breach your environment like an attacker — a known, partially known, or unknown environment depending on how much inside information the testers receive. [5.5]',
  'data owner':
    'The senior business role accountable for a data set: its classification, access decisions and acceptable use. [5.1]',
  'data custodian':
    'The hands-on role that implements and operates the controls the owner sets: permissions, backups, media handling. [5.1]',
  'data controller':
    'The party that determines why and how personal data is processed — the role privacy law holds accountable. [5.4]',
  'data processor':
    'A party that processes personal data on behalf of, and under instruction from, a controller — such as a payroll provider or cloud host. [5.4]',

  // --- vendor & third-party risk (5.3, 5.2, 2.2, 3.1) ---
  'third-party risk':
    'The risk a vendor, supplier or partner brings through its access to your data and systems. Managed with assessments, contracts and monitoring. [5.3]',
  'right to audit':
    'A contract clause preserving the customer\u2019s right to assess a vendor\u2019s security controls after signing, directly or via an appointed auditor. [5.3]',
  'service-level agreement':
    'SLA: a contract that sets measurable service levels — uptime, response time — and the remedies (credits, escalation) when they are missed. [5.3]',
  'non-disclosure agreement':
    'NDA: a contract that legally protects confidential information shared with another party before access or work begins. [5.3]',
  'master service agreement':
    'MSA: the umbrella contract that fixes legal terms (liability, indemnification, IP, termination) once for all future work; SOWs and SLAs attach under it. [5.3]',
  'statement of work':
    'SOW: a contract under an MSA that defines one project\u2019s deliverables, milestones, timeline and acceptance criteria. [5.3]',
  'memorandum of understanding':
    'MOU/MOA: a document recording mutual intent between parties. Generally non-binding, so it cannot enforce controls or audits. [5.3]',
  'risk appetite':
    'The amount and type of risk an organization is willing to accept to meet its goals; risk tolerance is the acceptable variance around it. Responses must fit what is stated. [5.2]',
  'single loss expectancy':
    'SLE = asset value x exposure factor: the expected loss from one occurrence of a threat. [5.2]',
  'annualized loss expectancy':
    'ALE = SLE x ARO: the expected yearly loss from a threat. Compared against control cost and risk appetite to choose a response. [5.2]',
  'annualized rate of occurrence':
    'ARO: how many times a threat is expected to occur per year (once in 10 years = 0.1). [5.2]',
  'exposure factor':
    'EF: the percentage of an asset\u2019s value lost in one occurrence of a threat, used to compute SLE. [5.2]',
  'supply chain':
    'A threat vector: attackers reach you through a trusted vendor, supplier or managed service provider\u2019s access or updates. [2.2]',
  'managed service provider':
    'MSP: a third party that manages IT for many customers. Its trusted remote-management channel is a high-value supply-chain target. [2.2]',
  'shared responsibility model':
    'Cloud model dividing security duties between provider and customer. In SaaS the provider runs the app; the customer always owns its data, identities and access decisions. [3.1]',
};

/** Case-insensitive glossary lookup. */
export function define(term: string): string | undefined {
  return GLOSSARY[term] ?? GLOSSARY[term.toLowerCase()];
}
