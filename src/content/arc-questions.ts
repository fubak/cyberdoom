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
};
