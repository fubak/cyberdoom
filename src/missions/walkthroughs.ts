import { m01Walkthrough } from '../content/missions/m01-patch-tuesday';
import { m02Walkthrough } from '../content/missions/m02-need-to-know';
import { m03Walkthrough } from '../content/missions/m03-quiet-one';
import { m04Walkthrough } from '../content/missions/m04-hook-line-sinker';
import { m05Walkthrough } from '../content/missions/m05-change-freeze';
import { m06Walkthrough } from '../content/missions/m06-keymaster';
import { m07Walkthrough } from '../content/missions/m07-segment-fault';
import { m08Walkthrough } from '../content/missions/m08-zero-day';
import { m09Walkthrough } from '../content/missions/m09-locked-out';
import { m10Walkthrough } from '../content/missions/m10-third-party';
import { m11Walkthrough } from '../content/missions/m11-audit-night';
import { m12Walkthrough } from '../content/missions/m12-robo-soc';

/** Scripted solution of a mission, replayed by tests/walkthrough.test.ts.
 * `call` commits the entity's required case-file triage call. */
export type WalkStep =
  | { goto: [number, number] }
  | { use: [number, number] }
  | { badge: [number, number] }
  | { interact: string }
  | { inspect: string }
  | { call: string }
  | { clean: string }
  | { patch: string }
  | { wait: number };

export const walkthroughs: Record<string, WalkStep[]> = {
  m01: m01Walkthrough,
  m02: m02Walkthrough,
  m03: m03Walkthrough,
  m04: m04Walkthrough,
  m05: m05Walkthrough,
  m06: m06Walkthrough,
  m07: m07Walkthrough,
  m08: m08Walkthrough,
  m09: m09Walkthrough,
  m10: m10Walkthrough,
  m11: m11Walkthrough,
  m12: m12Walkthrough,
};
