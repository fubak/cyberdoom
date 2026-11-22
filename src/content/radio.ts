import { STORY_BIBLE } from './story';

export interface MissionRadioLines {
  /** Spoken shortly after mission start (at elapsed >= 4s). */
  start: string;
  /** Spoken when the player finishes the first substantive objective. */
  midpoint: string;
  /** Spoken when all required objectives are done and the exit is open. */
  ready: string;
}

const CALLSIGN = STORY_BIBLE.radioLead.callsign;

export function formatRadioLine(line: string): string {
  return `[${CALLSIGN}] ${line}`;
}

/**
 * Campaign radio chatter from Elena Cho (SOC-LEAD) across M01-M12.
 * Each line stays short enough to fit cleanly in the 3-line HUD ticker.
 */
export const RADIO_LINES: Record<string, MissionRadioLines> = {
  m01: {
    start: 'Elena here. Lobby drop tripped EDR — inspect before you wipe, and keep your distance.',
    midpoint: 'Good catch. That stick carries gl-sync-daemon — clear the rest of the floor.',
    ready: 'Floor is clean and logged. Head for the stairwell exit.',
  },
  m02: {
    start: 'Access audit is live. Only swipe doors matching your role — watch for MFA fatigue prompts.',
    midpoint: 'Role boundaries are holding. Finish the server checks without over-privileging.',
    ready: 'Audit complete. Exfil lane is clear — move to the exit.',
  },
  m03: {
    start: 'Legal cleared this quietly. Corroborate three sources before you name anyone at the case console.',
    midpoint: 'Evidence is lining up against the insider. Stay sharp — they may have left a logic bomb.',
    ready: 'Case filed with Legal and HR. Lockdown lifted — get to the exit.',
  },
  m04: {
    start: 'Vishing calls are flooding the help desk. Verify identity out of band and kill the lure.',
    midpoint: 'Caller confirmed fake. Cut the credential drain before more accounts get hijacked.',
    ready: 'Help desk is locked down. Head out — Episode 1 wraps here.',
  },
  m05: {
    start: 'Change freeze is active across payroll. Check tickets before touching any server.',
    midpoint: 'Unauthorized build isolated. Keep the approved patch clean and close the ticket.',
    ready: 'Change board signed off. Payroll is stable — move to the exit.',
  },
  m06: {
    start: 'TLS inspection cert expired and a vault key leaked. Rotate keys fast to starve the probes.',
    midpoint: 'Key rotation is cutting off their foothold. Seal the vault and fix password storage.',
    ready: 'Vault audit passed. Exit is unlocked — see you in the next sector.',
  },
  m07: {
    start: 'Flat network worm is hopping East-West. Segment the VLANs or cleaned hosts will reinfect.',
    midpoint: 'Bulkhead is holding — keep isolating the lateral path until the worm stops spreading.',
    ready: 'Network segmented and clean. Exit is open.',
  },
  m08: {
    start: 'Zero-day exploit traffic is hitting the DMZ. Triage by real risk, not scanner noise.',
    midpoint: 'Critical CVE patched. Harden the baseline so dormant worms cannot wake.',
    ready: 'Validation rescan is green. Move to the exit — cold-chain pager is lighting up.',
  },
  m09: {
    start: 'GHOSTLEDGER hit cold-chain with ransomware. Contain first — do not pay, restore from offline backup.',
    midpoint: 'Containment is holding. Verify clean backups and bring production back online.',
    ready: 'Cluster recovered without paying a cent. Exit is clear.',
  },
  m10: {
    start: 'Compromised vendor update carries 198.51.100.77. Audit the pipeline and revoke the bad signing key.',
    midpoint: 'Supply-chain trail confirmed. Sever the poisoned vendor channel and lock the build.',
    ready: 'Vendor pipeline scrubbed. Exit is open — audit team is waiting next.',
  },
  m11: {
    start: 'Decommissioned drives and a live DSAR hit tonight. Protect PII and verify chain of custody.',
    midpoint: 'Custody log is clean. Finish the wipe verification and privacy sign-off.',
    ready: 'Audit record is intact. One last floor — the autonomous SOC is next.',
  },
  m12: {
    start: 'GHOSTLEDGER poisoned the autonomous SOC. Keep human judgment in the loop and shut Prime down.',
    midpoint: 'Poisoned playbooks are coming offline. Push into the core and finish this.',
    ready: 'Meridian stands. GHOSTLEDGER is out — step through the exit, analyst.',
  },
};
