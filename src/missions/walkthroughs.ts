import { m01Walkthrough } from '../content/missions/m01-patch-tuesday';
import { m02Walkthrough } from '../content/missions/m02-need-to-know';
import { m03Walkthrough } from '../content/missions/m03-quiet-one';
import { m04Walkthrough } from '../content/missions/m04-hook-line-sinker';
import { m05Walkthrough } from '../content/missions/m05-change-freeze';
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
  m04: m04Walkthrough,
  m05: m05Walkthrough,
  m09: m09Walkthrough,
};
