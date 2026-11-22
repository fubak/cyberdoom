/**
 * Campaign Story Bible & Real-World Incident Basis (C1 + C2).
 *
 * Ties all 12 missions into one coherent intrusion arc at Meridian Freight &
 * Logistics against the adversary group GHOSTLEDGER, led on radio by SOC
 * Incident Commander Elena Cho, while grounding every mission in a documented
 * real-world security incident.
 */

export interface RealCase {
  /** Real-world incident name. */
  name: string;
  /** Year the incident occurred or was publicly disclosed. */
  year: number;
  /** Concise factual summary of what actually happened and why it maps to this mission. */
  summary: string;
  /** Public reference (advisory, post-mortem, enforcement action, or report). */
  source: string;
}

export interface CampaignEpisode {
  id: 'ep1' | 'ep2' | 'ep3';
  number: 1 | 2 | 3;
  title: string;
  missions: string[];
  /** Intermission text shown after clearing the episode's final mission. */
  intermission: string;
}

export const STORY_BIBLE = {
  company: 'Meridian Freight & Logistics',
  adversary: 'GHOSTLEDGER',
  adversaryIoc: 'gl-sync-daemon / 198.51.100.77',
  radioLead: {
    name: 'Elena Cho',
    callsign: 'SOC-LEAD',
    role: 'SOC Incident Commander',
  },
  premise:
    'Over one long week at Meridian Freight & Logistics, an intrusion group codenamed GHOSTLEDGER escalates from a dropped USB stick in the lobby to a full ransomware and autonomous-SOC takeover. Every mission is one stage of the kill chain.',
} as const;

export const CAMPAIGN_EPISODES: readonly CampaignEpisode[] = [
  {
    id: 'ep1',
    number: 1,
    title: 'EPISODE 1: INITIAL ACCESS',
    missions: ['m01', 'm02', 'm03', 'm04'],
    intermission:
      'GHOSTLEDGER has a foothold inside Meridian. A lobby USB drop, an over-permissioned badge, an insider exfil and a help-desk vishing call were not four separate bad days — they share the same gl-sync-daemon staging beacon. Next: hold the line as they push into production.',
  },
  {
    id: 'ep2',
    number: 2,
    title: 'EPISODE 2: ESCALATION',
    missions: ['m05', 'm06', 'm07', 'm08'],
    intermission:
      'You survived the broken rollout, the expired inspection cert, the flat-network worm and the zero-day sprint. Every trace points back to 198.51.100.77 — and now the pager is lighting up across the cold-chain cluster. Episode 3: Impact and Aftermath.',
  },
  {
    id: 'ep3',
    number: 3,
    title: 'EPISODE 3: IMPACT & AFTERMATH',
    missions: ['m09', 'm10', 'm11', 'm12'],
    intermission:
      'MERIDIAN STANDS. GHOSTLEDGER is evicted from the SOC, the compromised vendor pipeline is severed, and the audit record is intact. From lobby USB to autonomous SOC, you kept human judgment in the loop.',
  },
] as const;

export const REAL_CASES: Readonly<Record<string, RealCase>> = {
  m01: {
    name: 'Operation Buckshot Yankee (agent.btz) & Stuxnet USB Delivery',
    year: 2008,
    summary:
      'A single infected thumb drive left in a parking lot compromised classified US military networks in 2008, and Stuxnet crossed air-gapped industrial facilities via removable media in 2010 — proving why unknown USBs must never be plugged into live hosts.',
    source: 'US DoD / Deputy Secretary William Lynn (Foreign Affairs, 2010); CISA ICS-CERT',
  },
  m02: {
    name: 'Capital One Cloud Role Over-Permissioning',
    year: 2019,
    summary:
      'An SSRF bug only turned into a 100-million-customer breach because the web application IAM role held far broader S3 read permissions than its job required — a textbook least-privilege failure.',
    source: 'US DOJ Press Release (2019); OCC Consent Order 2020-044',
  },
  m03: {
    name: 'Waymo / Levandowski Insider IP Theft',
    year: 2016,
    summary:
      'Before resigning, an engineer downloaded over 14,000 proprietary files onto a personal device using valid credentials. Detecting insiders requires corroborating access logs, preserving chain of custody, and avoiding premature accusations.',
    source: 'US DOJ Northern District of California (2020)',
  },
  m04: {
    name: 'MGM Resorts Help-Desk Vishing & Ubiquiti BEC Wire Fraud',
    year: 2023,
    summary:
      'Attackers socially engineered an IT help desk with a 10-minute phone call to reset MFA at MGM (2023), and impersonated executives to wire $46.7M out of Ubiquiti (2015). Out-of-band callback verification stops both.',
    source: 'MGM Resorts SEC Form 8-K (Sept 2023); Ubiquiti Networks SEC Form 10-K (2015)',
  },
  m05: {
    name: 'CrowdStrike Falcon Sensor Update Outage & Knight Capital',
    year: 2024,
    summary:
      'A defective content configuration pushed globally without staged ring deployment crashed 8.5 million Windows hosts in July 2024; in 2012 a botched deploy cost Knight Capital $440M in 45 minutes. Change freeze, canary rings, and tested rollback plans exist for this reason.',
    source: 'CrowdStrike External Root Cause Analysis (Aug 2024); SEC Release 34-70694',
  },
  m06: {
    name: 'Equifax Expired TLS Inspection Certificate',
    year: 2017,
    summary:
      'Attackers exfiltrated data for 76 days undetected in part because an expired TLS certificate had left Equifax network inspection appliances blind to encrypted outbound traffic for 19 months.',
    source: 'US GAO Report GAO-18-559 (2018); US House Oversight Committee Report',
  },
  m07: {
    name: 'NotPetya at Maersk & Colonial Pipeline IT/OT Segmentation',
    year: 2017,
    summary:
      'NotPetya wiped 49,000 Maersk endpoints in minutes over a flat corporate network; in 2021 Colonial Pipeline halted OT fuel delivery as a precaution after an IT ransomware breach. Network segmentation limits blast radius.',
    source: 'Wired / Maersk Post-Mortem (2018); CISA AA21-131A',
  },
  m08: {
    name: 'Log4Shell (CVE-2021-44228) & MOVEit Transfer',
    year: 2021,
    summary:
      'When critical internet-facing vulnerabilities are actively exploited in the wild, defenders cannot patch every server at once — they triage by exposure and CISA KEV status, applying virtual patches or isolation to exposed assets first.',
    source: 'CISA Known Exploited Vulnerabilities Catalog; CISA Advisory AA21-356A',
  },
  m09: {
    name: 'WannaCry at NHS & Colonial Pipeline Ransomware',
    year: 2017,
    summary:
      'WannaCry crippled NHS hospitals through unpatched SMB; Colonial Pipeline paid $4.4M yet still relied on backups to restore. Containment before eradication, immutable backups, and legal/OFAC sanctions review govern real ransomware response.',
    source: 'UK National Audit Office (2017); US Treasury OFAC Ransomware Advisory (2021)',
  },
  m10: {
    name: 'SolarWinds Orion, Kaseya VSA & Target HVAC Vendor',
    year: 2020,
    summary:
      'Target was breached via a third-party HVAC contractor (2013), SolarWinds via a poisoned build pipeline (2020), and Kaseya via a managed service platform (2021). Vendor access must be scoped, monitored, and contractually bounded.',
    source: 'CISA Emergency Directive 21-01; US Senate Commerce Committee Report (2014)',
  },
  m11: {
    name: 'Morgan Stanley Decommissioned Hardware Fine',
    year: 2020,
    summary:
      'Morgan Stanley paid $95M+ in regulatory fines after unencrypted customer data remained on decommissioned data-center drives sold through an unvetted vendor. Proper media sanitization, asset inventory, and GDPR/DSAR retention rules are mandatory.',
    source: 'OCC Consent Order 2020-059; SEC Administrative Proceeding 3-21112 (2022)',
  },
  m12: {
    name: 'Target 2013 SOC Alert Fatigue',
    year: 2013,
    summary:
      'FireEye sensors flagged the Target intrusion in real time, but overwhelmed analysts dismissed the alerts amid chronic false positives. Effective SOAR automation cuts noise while keeping human verification on high-impact containment actions.',
    source: 'US Senate Commerce Committee Staff Report (March 2014)',
  },
};

export function realCaseForMission(missionId: string): RealCase | undefined {
  return REAL_CASES[missionId];
}

export function episodeForMission(missionId: string): CampaignEpisode | undefined {
  return CAMPAIGN_EPISODES.find((ep) => ep.missions.includes(missionId));
}

export function episodeIntermissionAfter(missionId: string): CampaignEpisode | undefined {
  return CAMPAIGN_EPISODES.find((ep) => ep.missions[ep.missions.length - 1] === missionId);
}
