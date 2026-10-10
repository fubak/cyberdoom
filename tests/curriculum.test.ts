import { describe, expect, it, vi } from 'vitest';
import {
  ARC,
  arcObjectiveIds,
  coverageShare,
  gradeMission,
  isDemonstrated,
  playableCoverage,
  playableCoverageLine,
  readiness,
  recordAnswer,
  recordField,
  type Mastery,
} from '../src/content/curriculum';
import { ARC_QUESTIONS } from '../src/content/arc-questions';
import { define, GLOSSARY } from '../src/content/glossary';
import { missionRegistry, teachingRegistry } from '../src/content/missions';
import { DOMAINS, OBJECTIVES, objectiveById } from '../src/content/objectives';
import type { Question } from '../src/core/types';

function expectValidQuestions(questions: Question[], missionId: string): void {
  const questionIds = questions.map((question) => question.id);
  expect(new Set(questionIds).size, `${missionId} question ids`).toBe(questionIds.length);

  for (const question of questions) {
    expect(question.options, `${missionId}/${question.id}`).toHaveLength(4);
    expect(
      question.options.filter((option) => option.correct),
      `${missionId}/${question.id} correct option count`,
    ).toHaveLength(1);
    const optionIds = question.options.map((option) => option.id);
    expect(new Set(optionIds).size, `${missionId}/${question.id} option ids`).toBe(optionIds.length);

    for (const option of question.options) {
      expect(
        option.explanation.length,
        `${missionId}/${question.id}/${option.id} explanation`,
      ).toBeGreaterThan(20);
    }
  }
}

function expectAnswerPositionsVary(questions: Question[], missionId: string): void {
  if (questions.length >= 3) {
    const correctIndexes = new Set(
      questions.map((question) => question.options.findIndex((option) => option.correct)),
    );
    expect(correctIndexes.size, `${missionId} correct-answer indexes`).toBeGreaterThanOrEqual(2);
  }
}

describe('objective catalog', () => {
  it('has the expected objective counts and topics per domain', () => {
    const expectedCounts: Record<number, number> = { 1: 4, 2: 5, 3: 4, 4: 9, 5: 6 };
    expect(OBJECTIVES).toHaveLength(28);

    for (const [domain, count] of Object.entries(expectedCounts)) {
      expect(OBJECTIVES.filter((objective) => objective.domain === Number(domain))).toHaveLength(count);
    }

    for (const objective of OBJECTIVES) {
      expect(objective.id.startsWith(`${objective.domain}.`)).toBe(true);
      expect(objective.topics.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses the expected exam domain weights totaling 100%', () => {
    const expectedWeights: Record<number, number> = { 1: 12, 2: 22, 3: 18, 4: 28, 5: 20 };
    expect(Object.fromEntries(DOMAINS.map((domain) => [domain.domain, domain.weight]))).toEqual(expectedWeights);
    expect(DOMAINS.reduce((total, domain) => total + domain.weight, 0)).toBe(100);
  });
});

describe('mission arc', () => {
  it('has at least 10 missions with unique ids and non-decreasing difficulty from 1 to 10', () => {
    expect(ARC.length).toBeGreaterThanOrEqual(10);
    const arcIds = ARC.map((mission) => mission.id);
    expect(new Set(arcIds).size).toBe(arcIds.length);

    for (let index = 0; index < ARC.length; index++) {
      const mission = ARC[index];
      expect(mission.difficulty, `${mission.id} difficulty`).toBeGreaterThanOrEqual(1);
      expect(mission.difficulty, `${mission.id} difficulty`).toBeLessThanOrEqual(10);
      if (index > 0) {
        expect(mission.difficulty, `${mission.id} difficulty order`).toBeGreaterThanOrEqual(
          ARC[index - 1].difficulty,
        );
      }
    }
  });

  it('covers all catalog objectives with valid ids and concrete mechanics', () => {
    const ids = new Set<string>();
    for (const mission of ARC) {
      for (const objective of mission.objectives) {
        ids.add(objective.id);
        expect(objectiveById(objective.id), `unknown arc objective ${objective.id}`).toBeDefined();
        expect(objective.mechanic.length, `${mission.id}/${objective.id} mechanic`).toBeGreaterThan(20);
      }
    }
    expect(ids).toEqual(new Set(OBJECTIVES.map((objective) => objective.id)));
  });

  it('teaches every scenario objective through at least one win mechanic', () => {
    const scenarioObjectives = ['2.4', '3.2', '4.1', '4.5', '4.6', '4.9', '5.6'];
    for (const id of scenarioObjectives) {
      expect(
        ARC.some((mission) =>
          mission.objectives.some((objective) => objective.id === id && objective.kind === 'win'),
        ),
        `${id} has a win mechanic`,
      ).toBe(true);
    }
  });

  it('keeps mechanic and question coverage near exam domain weights', () => {
    const allQuestions = [
      ...missionRegistry.all().flatMap((mission) => mission.debriefQuestions),
      ...Object.values(ARC_QUESTIONS).flat(),
    ];
    const shares = coverageShare(allQuestions);
    for (const domain of DOMAINS) {
      expect(
        Math.abs(shares[domain.domain] - domain.weight),
        `coverage shares: ${JSON.stringify(shares)}`,
      ).toBeLessThanOrEqual(3);
    }
  });

  it('uses the updated threat-actor objective title', () => {
    expect(objectiveById('2.1')?.title).toBe(
      'Compare and contrast common threat actors and motivations',
    );
  });

  it('registers built missions in arc order with matching objective sets', () => {
    const builtMissions = ARC.filter((mission) => mission.built);
    expect(builtMissions.map((mission) => mission.id)).toEqual(
      missionRegistry.all().map((mission) => mission.id),
    );

    for (const arcMission of builtMissions) {
      const mission = missionRegistry.get(arcMission.id);
      expect(mission, `missing registered mission ${arcMission.id}`).toBeDefined();
      if (mission) {
        expect(new Set(mission.objectives)).toEqual(new Set(arcObjectiveIds(arcMission)));
      }
    }
  });

  it('reports playable objective and win-mechanic coverage', () => {
    const coverage = playableCoverage();
    const registeredObjectives = [...new Set(missionRegistry.all().flatMap((mission) => mission.objectives))].sort();
    expect(coverage.objectives).toEqual(registeredObjectives);
    expect(coverage.objectives.every((id) => OBJECTIVES.some((objective) => objective.id === id))).toBe(true);
    expect(coverage.total).toBe(28);
    expect(playableCoverageLine()).toContain(`${coverage.objectives.length}/28`);
  });

  it('every SY0-701 objective is backed by a win mechanic somewhere in the arc', () => {
    const winBacked = new Set(playableCoverage().objectives);
    expect(OBJECTIVES.map((objective) => objective.id).every((id) => winBacked.has(id))).toBe(true);
  });

  it('backs m01 removable-media reporting with a win mechanic and false-positive lesson', () => {
    const m01 = missionRegistry.require('m01');
    const fiveSix = ARC.find((mission) => mission.id === 'm01')
      ?.objectives.find((objective) => objective.id === '5.6');
    const decoy = m01.entities.find((entity) => entity.tags?.includes('decoy'));
    expect(fiveSix?.kind).toBe('win');
    expect(decoy).toBeDefined();
    expect(decoy?.infected ?? false).toBe(false);
    expect(decoy?.inspect?.category).toBe('legit');
    expect(teachingRegistry.require('m01').lessons['false-positive']).toBeDefined();
  });
});

describe('unbuilt arc questions', () => {
  it('contains questions only for unbuilt arc missions and covers each unbuilt mission', () => {
    for (const id of Object.keys(ARC_QUESTIONS)) {
      const arcMission = ARC.find((mission) => mission.id === id);
      expect(arcMission, `${id} is an ARC mission`).toBeDefined();
      if (arcMission) expect(arcMission.built, `${id} is unbuilt`).toBe(false);
    }

    for (const arcMission of ARC.filter((mission) => !mission.built)) {
      const questions = ARC_QUESTIONS[arcMission.id] ?? [];
      expect(questions.length, `${arcMission.id} question count`).toBeGreaterThanOrEqual(4);
      expectValidQuestions(questions, arcMission.id);

      const objectiveIds = new Set(arcObjectiveIds(arcMission));
      for (const question of questions) {
        expect(question.objectives.length, `${arcMission.id}/${question.id} objectives`).toBeGreaterThan(0);
        for (const id of question.objectives) {
          expect(
            objectiveIds,
            `${arcMission.id}/${question.id} objective ${id} belongs to the arc mission`,
          ).toContain(id);
        }
      }
    }
  });
});

describe('mission questions and inspection objectives', () => {
  for (const mission of missionRegistry.all()) {
    describe(mission.id, () => {
      it('has valid questions with unique question ids', () => {
        expectValidQuestions(mission.debriefQuestions, mission.id);
      });

      it('assesses mission objectives in questions and uses valid question and inspect objective ids', () => {
        const inspectedObjectiveIds = mission.entities.flatMap(
          (entity) => entity.inspect?.objectives ?? [],
        );

        for (const question of mission.debriefQuestions) {
          expect(question.objectives.length, question.id).toBeGreaterThan(0);
          for (const id of question.objectives) {
            expect(mission.objectives, `${question.id} assesses ${id} outside ${mission.id}`).toContain(id);
          }
        }

        for (const id of inspectedObjectiveIds) {
          expect(objectiveById(id), `unknown inspected objective ${id} in ${mission.id}`).toBeDefined();
        }

        const assessedObjectiveIds = new Set([
          ...mission.debriefQuestions.flatMap((question) => question.objectives),
          ...inspectedObjectiveIds,
        ]);
        for (const id of mission.objectives) {
          expect(assessedObjectiveIds, `${mission.id} does not assess ${id}`).toContain(id);
        }
      });

      it('varies the correct-answer index across three or more questions', () => {
        expectAnswerPositionsVary(mission.debriefQuestions, mission.id);
      });
    });
  }
});

describe('answer-position distribution', () => {
  it('uses each answer index and keeps no single index above 40% across all questions', () => {
    const allQuestions = [
      ...missionRegistry.all().flatMap((mission) => mission.debriefQuestions),
      ...Object.values(ARC_QUESTIONS).flat(),
    ];
    const counts = [0, 1, 2, 3].map(
      (index) =>
        allQuestions.filter(
          (question) => question.options.findIndex((option) => option.correct) === index,
        ).length,
    );
    const distribution = counts.map((count, index) => ({ index, count, total: allQuestions.length }));

    for (const { index, count, total } of distribution) {
      expect(count, `correct-answer index ${index} usage: ${JSON.stringify(distribution)}`).toBeGreaterThan(0);
      expect(count, `correct-answer index ${index} share: ${JSON.stringify(distribution)}`).toBeLessThanOrEqual(
        total * 0.4,
      );
    }
  });

  it('varies the correct-answer index within every mission with three or more questions', () => {
    for (const mission of missionRegistry.all()) {
      expectAnswerPositionsVary(mission.debriefQuestions, mission.id);
    }
    for (const [missionId, questions] of Object.entries(ARC_QUESTIONS)) {
      expectAnswerPositionsVary(questions, missionId);
    }
  });
});

describe('inspection and content language', () => {
  it('keeps person inspect labels free of verdicts', () => {
    const verdict = /suspicious|clean|normal|innocent|guilty|indicator|corroborat/i;
    for (const mission of missionRegistry.all()) {
      for (const entity of mission.entities) {
        if (entity.inspect?.category === 'person') {
          expect(entity.inspect.label, `${mission.id}/${entity.id}`).not.toMatch(verdict);
        }
      }
    }
  });

  it('avoids deprecated phrases in glossary and mission text', () => {
    const deprecated = /baiting|Contention without corroboration/i;
    for (const text of Object.values(GLOSSARY)) {
      expect(text).not.toMatch(deprecated);
    }
    for (const mission of missionRegistry.all()) {
      expect(mission.briefing, `${mission.id} briefing`).not.toMatch(deprecated);
      expect(JSON.stringify(mission), `${mission.id} inspect and question text`).not.toMatch(deprecated);
    }
  });
});

describe('mission teaching', () => {
  for (const mission of missionRegistry.all()) {
    it(`${mission.id} covers objectives, lessons, glossary terms, and orders`, () => {
      const teaching = teachingRegistry.require(mission.id);
      const lessonKeys = Object.keys(teaching.lessons);
      expect(teaching.tagline.length, `${mission.id} tagline length`).toBeGreaterThanOrEqual(1);
      expect(teaching.tagline.length, `${mission.id} tagline length`).toBeLessThanOrEqual(90);

      for (const objective of mission.missionObjectives) {
        expect(lessonKeys, `${mission.id} is missing lesson ${objective.id}`).toContain(objective.id);
      }

      for (const [key, lesson] of Object.entries(teaching.lessons)) {
        expect(objectiveById(lesson.objective), `${mission.id}/${key} has unknown objective`).toBeDefined();
        expect(lesson.done.length, `${mission.id}/${key} has empty done lesson`).toBeGreaterThan(0);
        expect(lesson.missed.length, `${mission.id}/${key} has empty missed lesson`).toBeGreaterThan(0);
      }

      for (const term of teaching.keyTerms) {
        expect(define(term), `${mission.id} has undefined key term "${term}"`).toBeDefined();
      }

      expect(teaching.orders.length, mission.id).toBeGreaterThanOrEqual(1);
      expect(teaching.orders.length, mission.id).toBeLessThanOrEqual(3);
      for (const order of teaching.orders) {
        expect(objectiveById(order.objective), `${mission.id} has unknown order objective`).toBeDefined();
        expect(order.text.length, `${mission.id} order length`).toBeLessThanOrEqual(64);
      }
    });
  }
});

describe('mastery', () => {
  it('calculates empty and complete exam readiness', () => {
    expect(readiness({}).overall).toBe(0);

    const mastered: Mastery = Object.fromEntries(
      OBJECTIVES.map((objective) => [objective.id, { right: 1, wrong: 0 }]),
    );
    expect(readiness(mastered).overall).toBe(100);
  });

  it('does not demonstrate an objective when wrong answers exceed right answers', () => {
    expect(isDemonstrated({ '1.1': { right: 1, wrong: 2 } }, '1.1')).toBe(false);
  });

  it('records field demonstrations, ignores unknown ids, and counts field-only readiness', () => {
    const mastery: Mastery = {};
    recordField(mastery, ['4.6', 'not-an-objective']);

    expect(mastery['4.6']).toEqual({ right: 0, wrong: 0, field: 1 });
    expect(mastery['not-an-objective']).toBeUndefined();
    expect(isDemonstrated(mastery, '4.6')).toBe(true);
    expect(readiness(mastery).byDomain.find((domain) => domain.domain === 4))
      .toMatchObject({ demonstrated: 1, total: 9 });
    expect(isDemonstrated({ '4.6': { right: 0, wrong: 2, field: 1 } }, '4.6')).toBe(true);
  });

  it('persists field demonstrations when storage is available', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    try {
      const mastery: Mastery = {};
      recordField(mastery, ['4.6']);
      expect(setItem).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('records answers and increments counts when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(globalThis.localStorage).toBeUndefined();
      const mastery: Mastery = {};

      recordAnswer(mastery, ['1.1'], true);
      expect(mastery['1.1']).toEqual({ right: 1, wrong: 0 });

      recordAnswer(mastery, ['1.1'], false);
      expect(mastery['1.1']).toEqual({ right: 1, wrong: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('mission grading', () => {
  it('caps field and total at B after any false positive', () => {
    expect(gradeMission({ fieldPct: 100, quizPct: 100, won: true, falsePositives: 1 }))
      .toEqual({ field: 89, total: 89, grade: 'B', capped: 'false-positive' });
  });

  it('caps a lost mission at F', () => {
    expect(gradeMission({ fieldPct: 100, quizPct: 100, won: false, falsePositives: 0 }))
      .toEqual({ field: 100, total: 59, grade: 'F', capped: 'fail' });
  });
});
