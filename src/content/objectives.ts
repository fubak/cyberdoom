import type { ObjectiveRef } from '../core/types';

/**
 * CURRICULUM: SY0-701 objective catalog.
 * Domain numbers, weights, objective ids/titles and key topics follow the
 * published CompTIA Security+ (SY0-701) exam objectives (v5.0). Topics are a
 * condensed selection of the exam's own sub-bullet terms, not paraphrases.
 */

export interface DomainRef {
  domain: number;
  title: string;
  /** Percentage of the exam this domain represents. */
  weight: number;
}

export const DOMAINS: DomainRef[] = [
  { domain: 1, title: 'General Security Concepts', weight: 12 },
  { domain: 2, title: 'Threats, Vulnerabilities, and Mitigations', weight: 22 },
  { domain: 3, title: 'Security Architecture', weight: 18 },
  { domain: 4, title: 'Security Operations', weight: 28 },
  { domain: 5, title: 'Security Program Management and Oversight', weight: 20 },
];

export interface CatalogObjective extends ObjectiveRef {
  /** Key exam terms listed under this objective. */
  topics: string[];
}

export const OBJECTIVES: CatalogObjective[] = [
  // Domain 1 — General Security Concepts (12%)
  {
    domain: 1, id: '1.1', title: 'Compare and contrast various types of security controls',
    topics: ['Technical / managerial / operational / physical categories', 'Preventive', 'Deterrent', 'Detective', 'Corrective', 'Compensating', 'Directive'],
  },
  {
    domain: 1, id: '1.2', title: 'Summarize fundamental security concepts',
    topics: ['Confidentiality, integrity, availability (CIA)', 'Non-repudiation', 'Authentication, authorization, accounting (AAA)', 'Gap analysis', 'Zero Trust (policy engine, policy enforcement point)', 'Physical security (access badge, access control vestibule, bollards)', 'Deception (honeypot, honeyfile, honeytoken)'],
  },
  {
    domain: 1, id: '1.3', title: 'Explain the importance of change management processes and the impact to security',
    topics: ['Approval process', 'Ownership and stakeholders', 'Impact analysis', 'Backout plan', 'Maintenance window', 'Standard operating procedure', 'Allow/deny lists, dependencies, legacy applications', 'Documentation and version control'],
  },
  {
    domain: 1, id: '1.4', title: 'Explain the importance of using appropriate cryptographic solutions',
    topics: ['PKI (public/private key, key escrow)', 'Symmetric vs asymmetric encryption', 'TPM, HSM, KMS, secure enclave', 'Obfuscation (steganography, tokenization, data masking)', 'Hashing and salting', 'Digital signatures', 'Key stretching', 'Certificates (CA, CRL, OCSP, CSR, wildcard)'],
  },

  // Domain 2 — Threats, Vulnerabilities, and Mitigations (22%)
  {
    domain: 2, id: '2.1', title: 'Compare and contrast common threat actors and motivations',
    topics: ['Nation-state', 'Unskilled attacker', 'Hacktivist', 'Insider threat', 'Organized crime', 'Shadow IT', 'Internal/external, resources/funding, sophistication', 'Motivations: data exfiltration, espionage, financial gain, revenge, blackmail'],
  },
  {
    domain: 2, id: '2.2', title: 'Explain common threat vectors and attack surfaces',
    topics: ['Message-based (email, SMS, IM)', 'Removable device', 'Vulnerable / unsupported software', 'Unsecure networks', 'Open service ports', 'Default credentials', 'Supply chain (MSPs, vendors, suppliers)', 'Human vectors: phishing, vishing, smishing, pretexting, impersonation, BEC, watering hole, typosquatting'],
  },
  {
    domain: 2, id: '2.3', title: 'Explain various types of vulnerabilities',
    topics: ['Memory injection, buffer overflow, race conditions (TOC/TOU)', 'Malicious update', 'Web-based: SQLi, XSS', 'Hardware: firmware, end-of-life, legacy', 'Virtualization: VM escape, resource reuse', 'Cloud-specific', 'Misconfiguration', 'Mobile: side loading, jailbreaking', 'Zero-day'],
  },
  {
    domain: 2, id: '2.4', title: 'Given a scenario, analyze indicators of malicious activity',
    topics: ['Malware: ransomware, trojan, worm, spyware, bloatware, virus, keylogger, logic bomb, rootkit', 'Physical: brute force, RFID cloning', 'Network: DDoS, DNS, on-path, credential replay', 'Application: injection, privilege escalation, directory traversal', 'Password: spraying, brute force', 'Indicators: account lockout, concurrent session usage, blocked content, impossible travel, resource consumption, resource inaccessibility, out-of-cycle logging, missing logs'],
  },
  {
    domain: 2, id: '2.5', title: 'Explain the purpose of mitigation techniques used to secure the enterprise',
    topics: ['Segmentation and isolation', 'Access control (ACLs, permissions)', 'Application allow list', 'Patching', 'Encryption', 'Monitoring', 'Least privilege', 'Configuration enforcement', 'Decommissioning', 'Hardening: endpoint protection, host-based firewall, HIPS, disabling ports/protocols, changing default passwords, removing unnecessary software'],
  },

  // Domain 3 — Security Architecture (18%)
  {
    domain: 3, id: '3.1', title: 'Compare and contrast security implications of different architecture models',
    topics: ['Cloud: responsibility matrix, hybrid, third-party vendors', 'Infrastructure as code', 'Serverless and microservices', 'Air-gapped, logical segmentation, SDN', 'Containerization and virtualization', 'IoT, ICS/SCADA, RTOS, embedded systems', 'Availability, resilience, patch availability, inability to patch'],
  },
  {
    domain: 3, id: '3.2', title: 'Given a scenario, apply security principles to secure enterprise infrastructure',
    topics: ['Device placement and security zones', 'Attack surface', 'Failure modes: fail-open, fail-closed', 'Active vs passive, inline vs tap/monitor', 'Jump server, proxy, IDS/IPS, load balancer, sensors', 'Port security: 802.1X, EAP', 'Firewalls: WAF, UTM, NGFW, layer 4/7', 'VPN, tunneling (TLS, IPSec), SD-WAN, SASE'],
  },
  {
    domain: 3, id: '3.3', title: 'Compare and contrast concepts and strategies to protect data',
    topics: ['Data types: regulated, trade secret, intellectual property, legal, financial', 'Classifications: sensitive, confidential, public, restricted, private, critical', 'Data states: at rest, in transit, in use', 'Data sovereignty and geolocation', 'Methods: encryption, hashing, masking, tokenization, obfuscation, segmentation, permission restrictions'],
  },
  {
    domain: 3, id: '3.4', title: 'Explain the importance of resilience and recovery in security architecture',
    topics: ['High availability: load balancing vs clustering', 'Hot, warm, cold sites; geographic dispersion', 'Platform diversity, multi-cloud', 'Continuity of operations, capacity planning', 'Testing: tabletop, fail over, simulation, parallel processing', 'Backups: onsite/offsite, frequency, encryption, snapshots, replication, journaling', 'Power: generators, UPS'],
  },

  // Domain 4 — Security Operations (28%)
  {
    domain: 4, id: '4.1', title: 'Given a scenario, apply common security techniques to computing resources',
    topics: ['Secure baselines: establish, deploy, maintain', 'Hardening targets: workstations, servers, mobile, network devices, cloud, ICS/SCADA, IoT', 'Wireless: site surveys, heat maps, WPA3, RADIUS', 'Mobile: MDM, BYOD / COPE / CYOD', 'Application security: input validation, secure cookies, static code analysis, code signing', 'Sandboxing', 'Monitoring'],
  },
  {
    domain: 4, id: '4.2', title: 'Explain the security implications of proper hardware, software, and data asset management',
    topics: ['Acquisition/procurement', 'Assignment/accounting: ownership, classification', 'Monitoring/asset tracking: inventory, enumeration', 'Disposal/decommissioning: sanitization, destruction, certification, data retention'],
  },
  {
    domain: 4, id: '4.3', title: 'Explain various activities associated with vulnerability management',
    topics: ['Vulnerability scan, static/dynamic analysis, package monitoring', 'Threat feeds: OSINT, third-party, information-sharing organizations, dark web', 'Penetration testing, bug bounty, responsible disclosure', 'False positive vs false negative', 'CVSS, CVE, exposure factor, risk tolerance', 'Remediation: patching, insurance, segmentation, compensating controls, exceptions', 'Validation: rescanning, audit, verification', 'Reporting'],
  },
  {
    domain: 4, id: '4.4', title: 'Explain security alerting and monitoring concepts and tools',
    topics: ['Monitoring systems, applications, infrastructure', 'Log aggregation, alerting, scanning, reporting, archiving', 'Alert response: quarantine, alert tuning', 'SCAP, benchmarks, agent vs agentless', 'SIEM', 'Antivirus', 'DLP', 'SNMP traps, NetFlow', 'Vulnerability scanners'],
  },
  {
    domain: 4, id: '4.5', title: 'Given a scenario, modify enterprise capabilities to enhance security',
    topics: ['Firewall rules, access lists, ports/protocols, screened subnets', 'IDS/IPS trends and signatures', 'Web filter: URL scanning, content categorization, reputation', 'OS security: Group Policy, SELinux', 'DNS filtering', 'Email security: DMARC, DKIM, SPF, gateway', 'File integrity monitoring', 'DLP', 'NAC', 'EDR/XDR', 'User behavior analytics'],
  },
  {
    domain: 4, id: '4.6', title: 'Given a scenario, implement and maintain identity and access management',
    topics: ['Provisioning / de-provisioning user accounts', 'Permission assignments and implications', 'Identity proofing, federation, SSO (LDAP, OAuth, SAML)', 'Access controls: mandatory, discretionary, role-based, rule-based, attribute-based, time-of-day restrictions, least privilege', 'MFA: biometrics, tokens, security keys; something you know/have/are', 'Password best practices, password managers, passwordless', 'PAM: just-in-time permissions, password vaulting, ephemeral credentials'],
  },
  {
    domain: 4, id: '4.7', title: 'Explain the importance of automation and orchestration related to secure operations',
    topics: ['User and resource provisioning', 'Guard rails and security groups', 'Ticket creation and escalation', 'Enabling/disabling services and access', 'CI and testing, APIs', 'Benefits: enforcing baselines, scaling securely, reaction time, workforce multiplier', 'Risks: complexity, cost, single point of failure, technical debt'],
  },
  {
    domain: 4, id: '4.8', title: 'Explain appropriate incident response activities',
    topics: ['Process: preparation, detection, analysis, containment, eradication, recovery, lessons learned', 'Training', 'Testing: tabletop exercise, simulation', 'Root cause analysis', 'Threat hunting', 'Digital forensics: legal hold, chain of custody, acquisition, preservation, e-discovery'],
  },
  {
    domain: 4, id: '4.9', title: 'Given a scenario, use data sources to support an investigation',
    topics: ['Log data: firewall, application, endpoint, OS-specific security, IPS/IDS, network logs', 'Metadata', 'Vulnerability scans', 'Automated reports', 'Dashboards', 'Packet captures'],
  },

  // Domain 5 — Security Program Management and Oversight (20%)
  {
    domain: 5, id: '5.1', title: 'Summarize elements of effective security governance',
    topics: ['Guidelines', 'Policies: AUP, information security, BC/DR, incident response, SDLC, change management', 'Standards: password, access control, physical security, encryption', 'Procedures: change management, onboarding/offboarding, playbooks', 'External considerations: regulatory, legal, industry', 'Roles: owners, controllers, processors, custodians/stewards'],
  },
  {
    domain: 5, id: '5.2', title: 'Explain elements of the risk management process',
    topics: ['Risk identification and assessment (ad hoc, recurring, one-time, continuous)', 'Qualitative vs quantitative analysis', 'SLE, ARO, ALE, exposure factor', 'Risk register, KRIs, risk owners, risk threshold', 'Risk tolerance and appetite', 'Strategies: transfer, accept (exemption/exception), avoid, mitigate', 'Business impact analysis: RTO, RPO, MTTR, MTBF'],
  },
  {
    domain: 5, id: '5.3', title: 'Explain the processes associated with third-party risk assessment and management',
    topics: ['Vendor assessment: penetration testing, right-to-audit clause, independent assessments, supply chain analysis', 'Vendor selection: due diligence, conflict of interest', 'Agreements: SLA, MOA, MOU, MSA, SOW/WO, NDA, BPA', 'Vendor monitoring', 'Questionnaires', 'Rules of engagement'],
  },
  {
    domain: 5, id: '5.4', title: 'Summarize elements of effective security compliance',
    topics: ['Compliance reporting: internal, external', 'Consequences of non-compliance: fines, sanctions, reputational damage, loss of license, contractual impacts', 'Compliance monitoring: due diligence/care, attestation and acknowledgement, automation', 'Privacy: data subject, controller vs processor, data inventory and retention, right to be forgotten'],
  },
  {
    domain: 5, id: '5.5', title: 'Explain types and purposes of audits and assessments',
    topics: ['Attestation', 'Internal: compliance, audit committee, self-assessments', 'External: regulatory, examinations, independent third-party audit', 'Penetration testing: physical, offensive, defensive, integrated', 'Known, partially known, unknown environment', 'Reconnaissance: passive, active'],
  },
  {
    domain: 5, id: '5.6', title: 'Given a scenario, implement security awareness practices',
    topics: ['Phishing campaigns: recognizing and responding to reported suspicious messages', 'Anomalous behavior recognition: risky, unexpected, unintentional', 'User guidance and training: policy/handbooks, situational awareness, insider threat, password management, removable media and cables, social engineering, operational security, hybrid/remote work', 'Reporting and monitoring: initial, recurring', 'Development and execution'],
  },
];

const byId = new Map(OBJECTIVES.map((o) => [o.id, o]));

export function objectiveById(id: string): CatalogObjective | undefined {
  return byId.get(id);
}

export function domainById(domain: number): DomainRef | undefined {
  return DOMAINS.find((d) => d.domain === domain);
}
