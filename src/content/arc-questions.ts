import type { Question } from '../core/types';

type Opt = [text: string, explanation: string];

/** Compact builder: `correct` is the 0-based index of the right option. */
export function q(id: string, objectives: string[], prompt: string, correct: number, opts: Opt[]): Question {
  return {
    id,
    prompt,
    objectives,
    options: opts.map(([text, explanation], i) => ({
      id: String.fromCharCode(97 + i),
      text,
      correct: i === correct,
      explanation,
    })),
  };
}

/**
 * CURRICULUM: knowledge-check questions for arc missions not yet built as
 * levels (m04-m12). When LEVELS builds a mission, move its set into the
 * mission file's `debriefQuestions`. Until then these also feed spaced review.
 */
export const ARC_QUESTIONS: Record<string, Question[]> = {
  m07: [
    q('q1', ['3.2'], 'Admins must manage servers in a high-security zone from the user network. Which design MOST reduces the attack surface?', 3, [
      ['Allow RDP into the zone from every workstation', 'Every workstation becomes a path into the zone, so one phished PC reaches the servers.'],
      ['Port-forward each server\u2019s management port through the firewall', 'This exposes many management interfaces instead of one controlled path.'],
      ['Put admin workstations on the same subnet as the servers', 'That removes the zone boundary entirely.'],
      ['Allow access only through a hardened jump server with MFA and session logging', 'A jump server is the single, monitored entry point into the zone, so there is only one door to harden and watch.'],
    ]),
    q('q2', ['3.2'], 'An IPS must block attacks in real time in front of the database. How must it be deployed?', 0, [
      ['Inline (active), choosing whether a failure should fail-open or fail-closed', 'Only an inline device sits in the traffic path and can drop packets. Its failure mode is a trade-off between availability and security.'],
      ['On a network tap', 'A tap gives the device a copy of the traffic. It can detect and alert, but it cannot block.'],
      ['On a SPAN/mirror port', 'Mirroring is also passive monitoring, so the original packets still reach the database.'],
      ['On the admin\u2019s workstation', 'A host there protects only that workstation, not the database\u2019s network path.'],
    ]),
    q('q3', ['3.1'], 'A plant\u2019s SCADA controller runs an OS the vendor no longer patches, and it cannot be replaced for three years. What is BEST?', 1, [
      ['Connect it to the internet so the vendor can support it remotely', 'This exposes an unpatchable system to the whole internet, the worst possible move.'],
      ['Isolate it (air gap or a strictly segmented zone), allow only required flows, and monitor it', 'When you cannot patch, you reduce reachability. Segmentation plus monitoring compensates for the inability to patch.'],
      ['Force-install the newest desktop OS updates on it', 'Updates for a different OS can break an industrial controller, and none exist for its own OS.'],
      ['Accept the risk with no additional controls', 'Acceptance should be a documented decision after reasonable controls, not a substitute for them.'],
    ]),
    q('q4', ['4.5'], 'Firewall rules are evaluated top-down, first match wins. Where does an explicit "deny any any" rule belong?', 2, [
      ['First, so nothing slips through', 'As the first rule it matches everything, and no traffic ever reaches the allow rules below.'],
      ['In the middle, between inbound and outbound rules', 'Every allow rule below it would become unreachable.'],
      ['Last, after the specific allow rules', 'Specific allows match first, and everything else falls through to the final deny (implicit deny made explicit and logged).'],
      ['Nowhere; firewalls allow by default', 'A secure firewall denies by default. Allow-by-default is the misconfiguration.'],
    ]),
    q('q5', ['2.3'], 'A core switch still uses its factory admin/admin login, and the vendor stopped releasing firmware for it last year. Which vulnerability types apply?', 1, [
      ['Zero-day and race condition', 'Both problems are well known, so neither is a zero-day, and nothing here involves timing.'],
      ['Misconfiguration and end-of-life hardware', 'Unchanged defaults are a misconfiguration. A device with no more firmware updates is end-of-life, so future flaws will never be fixed.'],
      ['VM escape and resource reuse', 'Those are virtualization vulnerabilities, and the switch is physical hardware.'],
      ['Cross-site scripting', 'XSS is a web-application flaw. This is a network device problem.'],
    ]),
  ],
};
