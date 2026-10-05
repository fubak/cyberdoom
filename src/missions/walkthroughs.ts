import { m01Walkthrough } from '../content/missions/m01-patch-tuesday';
import { m02Walkthrough } from '../content/missions/m02-need-to-know';
import { m03Walkthrough } from '../content/missions/m03-quiet-one';
import { m06Walkthrough } from '../content/missions/m06-keymaster';
import { m08Walkthrough } from '../content/missions/m08-zero-day';
import { m09Walkthrough } from '../content/missions/m09-locked-out';

/** Scripted solution of a mission, replayed by tests/walkthrough.test.ts. */
export type WalkStep =
  | { goto: [number, number] }
  | { use: [number, number] }
  | { badge: [number, number] }
  | { interact: string }
  | { inspect: string }
  | { clean: string }
  | { wait: number };

export const walkthroughs: Record<string, WalkStep[]> = {
  m01: m01Walkthrough,
  m02: m02Walkthrough,
  m03: m03Walkthrough,
  m06: m06Walkthrough,
  m08: m08Walkthrough,
  m09: m09Walkthrough,
};
