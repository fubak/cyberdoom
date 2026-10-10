import type { LossCause } from '../missions/runtime';
import { teachingRegistry } from '../content/missions';

/**
 * CURRICULUM: plain-language post-mortem for a failed mission. Every death or
 * objective breach must tell the player what killed them, the Security+
 * concept behind it, and what to do differently on redeploy.
 */

const THREAT_LESSONS: Record<string, string> = {
  worm: 'A WORM self-replicates across the network with no user action, so every host it reaches becomes another attacker. Speed of containment matters most. [2.4]',
  trojan: 'A TROJAN is malware disguised as legitimate software that a user runs. It does not spread on its own, but it hits hard once inside. Flag it with the MOUSE first: flagged targets take more scanner damage. [2.4]',
  ransomware: 'RANSOMWARE encrypts data and demands payment. It is the costliest threat in the building: contain it from range with the USB SCANNER or EDR CONSOLE, and remember recovery comes from tested backups, never from paying. [2.4, 3.4]',
  logicbomb: 'A LOGIC BOMB is dormant code that runs when a trigger condition is met, such as a date or an account being removed. It stays quiet until it detonates, so neutralize it before its trigger fires. [2.4]',
  rootkit: 'A ROOTKIT hides at a privileged level of the operating system and conceals itself from normal tools. Expect it to outlast routine scans: use EDR containment and plan to reimage the host. [2.4]',
  rat: 'A RAT (remote access trojan) gives an attacker hands-on remote control of the host. It arrives like a trojan, then acts on live commands: isolate it fast to cut the remote session. [2.4]',
};

const THREAT_FALLBACK =
  'Malware wins when it is left running. Contain threats before they close the distance. [2.4]';

export interface FailureExplanation {
  headline: string;
  what: string;
  why: string;
  next: string[];
}

export function failureExplanation(loss: LossCause | null, missionId: string): FailureExplanation {
  if (loss?.kind === 'integrity') {
    return {
      headline: `INTEGRITY DEPLETED${loss.by ? ` BY ${loss.by.toUpperCase()}` : ''}`,
      what: 'Hostile code reached you and drained your integrity to zero before you contained it.',
      why: THREAT_LESSONS[loss.threat ?? ''] ?? THREAT_FALLBACK,
      next: [
        'Watch INTEGRITY on the status bar and back off around a corner when it drops.',
        'Contain from range: USB SCANNER shots or an EDR CONSOLE pulse before it reaches you.',
        'A spawn flash and sound means an ambush: make distance first, then fight.',
      ],
    };
  }
  if (loss?.kind === 'objective') {
    const lesson = teachingRegistry.get(missionId)?.lessons[loss.objectiveId];
    return {
      headline: `OBJECTIVE FAILED: ${loss.text.toUpperCase()}`,
      what: `This objective allows ${loss.strikes} mistake${loss.strikes === 1 ? '' : 's'}; you made ${loss.violations}. The mission ends when a rule like this is broken, as it would in a real incident.`,
      why: lesson
        ? `[${lesson.objective}] ${lesson.missed}`
        : 'Breaking this rule is the failure this mission is built to teach.',
      next: [
        'Open the evidence log (L) and re-read the case before you act.',
        'Redeploy and complete this objective without breaking its rule.',
      ],
    };
  }
  return {
    headline: 'MISSION FAILED',
    what: 'The mission ended before its objectives were complete.',
    why: '',
    next: ['Redeploy and review the objectives on the briefing screen.'],
  };
}
