import type { EvidenceEntry, Mission, Question, ScoreEvent } from '../core/types';
import {
  gradeMission,
  loadMastery,
  playableCoverageLine,
  readiness,
  recordAnswer,
  recordField,
} from '../content/curriculum';
import { missionRegistry, teachingRegistry } from '../content/missions';
import { objectiveById } from '../content/objectives';
import { bigButton, h, onKeysWhileMounted } from './briefing';
import './curriculum.css';

export { letterGrade } from '../content/curriculum';

/**
 * CURRICULUM: after-action report -> knowledge check -> grade.
 * The knowledge check counts for half the mission grade, every question must be
 * answered before continuing, options are shuffled each time, missed items can be
 * retried and are queued for spaced review in later debriefs.
 */

const REVIEW_KEY = 'cyberdoom.review.v1';
const REVIEW_PER_DEBRIEF = 2;

function loadReview(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(REVIEW_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveReview(q: string[]): void {
  try {
    globalThis.localStorage?.setItem(REVIEW_KEY, JSON.stringify([...new Set(q)]));
  } catch {
    /* session-only */
  }
}

function shuffled<T>(a: readonly T[]): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface CheckItem {
  q: Question;
  missionId: string;
  review: boolean;
}

export function debrief(opts: {
  mission: Mission;
  won: boolean;
  score: number;
  scoreLog: ScoreEvent[];
  objectives: { text: string; done: boolean; failed: boolean }[];
  evidence?: EvidenceEntry[];
  onDone: (quizScore: number) => void;
}): HTMLElement {
  const { mission } = opts;
  const teach = teachingRegistry.get(mission.id);
  const s = h('div', 'screen cd-inter');
  let keyFn: ((e: KeyboardEvent) => void) | null = null;
  let evidenceOpen = false;
  let evidenceButton: HTMLButtonElement | null = null;
  const drawer = h('aside', 'cd-evidence-drawer');
  drawer.setAttribute('aria-label', 'Evidence log');
  const entries = opts.evidence ?? [];
  if (entries.length) {
    for (const entry of entries) {
      const row = h('article', 'cd-evidence-entry');
      row.appendChild(h('strong', '', entry.label));
      row.appendChild(h('span', 'cd-evidence-source', entry.source.toUpperCase()));
      row.appendChild(h('pre', 'cd-evidence-detail', entry.detail));
      drawer.appendChild(row);
    }
  } else {
    drawer.appendChild(h('p', 'cd-body', 'No evidence was logged during this mission.'));
  }
  const updateEvidenceDrawer = () => {
    drawer.classList.toggle('open', evidenceOpen);
    drawer.setAttribute('aria-hidden', String(!evidenceOpen));
    evidenceButton?.setAttribute('aria-expanded', String(evidenceOpen));
  };
  const toggleEvidence = () => {
    evidenceOpen = !evidenceOpen;
    updateEvidenceDrawer();
  };
  const addEvidenceUi = () => {
    const button = bigButton(`EVIDENCE LOG (${entries.length}) [L]`, toggleEvidence, 'cd-btn cd-evidence-toggle');
    evidenceButton = button;
    s.appendChild(button);
    s.appendChild(drawer);
    updateEvidenceDrawer();
  };
  onKeysWhileMounted(s, (e) => {
    if (e.code === 'KeyL' || e.key === 'Tab') {
      e.preventDefault();
      toggleEvidence();
      return;
    }
    if (e.key === 'Escape' && evidenceOpen) {
      e.preventDefault();
      evidenceOpen = false;
      updateEvidenceDrawer();
      return;
    }
    keyFn?.(e);
  });

  // Avoid objectives have no "done" event: obeyed through a won mission = done.
  const objRows = opts.objectives.map((o, i) => {
    const def = mission.missionObjectives.find((m) => m.text === o.text) ?? mission.missionObjectives[i];
    const avoided = def?.kind === 'avoid' && !o.failed && opts.won;
    return { ...o, def, done: o.done || avoided };
  });
  const fieldPct = objRows.length ? (objRows.filter((o) => o.done && !o.failed).length / objRows.length) * 100 : 100;
  const falsePositives = opts.scoreLog.filter((event) => event.tag === 'false-positive').length;

  const firstTry = new Map<string, boolean>();
  let mastery = loadMastery();
  if (opts.won) {
    const demonstrated = opts.scoreLog
      .filter((event) =>
        event.points > 0 && event.tag !== 'false-positive' && event.tag !== 'priority-miss',
      )
      .flatMap((event) => event.objectives);
    for (const objective of objRows) {
      if (!objective.done || objective.failed || !objective.def) continue;
      const lesson = teach?.lessons[objective.def.id];
      if (lesson) demonstrated.push(lesson.objective);
    }
    mastery = recordField(mastery, demonstrated);
  }
  let review = loadReview();

  const clear = () => {
    s.replaceChildren();
    keyFn = null;
  };

  // ---------- 1. after-action report ----------
  const report = () => {
    clear();
    s.appendChild(h('div', 'cd-kicker', 'AFTER-ACTION REPORT'));
    s.appendChild(h('h1', `cd-title ${opts.won ? 'good' : 'bad'}`, opts.won ? 'MISSION COMPLETE' : 'MISSION FAILED'));
    s.appendChild(h('div', 'cd-sub', mission.title));
    const grid = h('div', 'cd-grid');
    const left = h('div', 'cd-panel');
    left.appendChild(h('h3', '', 'OBJECTIVES'));
    for (const o of objRows) {
      const ok = o.done && !o.failed;
      const row = h('div', `cd-result ${ok ? 'good' : 'bad'}`);
      row.appendChild(h('div', 'cd-result-head', `${ok ? '✓' : '✗'}  ${o.text}`));
      const lesson = o.def ? teach?.lessons[o.def.id] : undefined;
      if (lesson) {
        row.appendChild(h('div', 'cd-lesson', `[${lesson.objective}] ${ok ? lesson.done : lesson.missed}`));
      }
      left.appendChild(row);
    }
    const falsePositiveLesson = teach?.lessons['false-positive'];
    if (falsePositiveLesson) {
      const falsePositiveCount = opts.scoreLog.filter((event) => event.tag === 'false-positive').length;
      const clean = falsePositiveCount === 0;
      const row = h('div', `cd-result ${clean ? 'good' : 'bad'}`);
      row.appendChild(h('div', 'cd-result-head',
        clean ? '✓  NO FALSE POSITIVES' : `✗  FALSE POSITIVES ×${falsePositiveCount}`));
      row.appendChild(h('div', 'cd-lesson',
        `[${falsePositiveLesson.objective}] ${clean ? falsePositiveLesson.done : falsePositiveLesson.missed}`));
      left.appendChild(row);
    }
    grid.appendChild(left);
    const right = h('div', 'cd-panel');
    right.appendChild(h('h3', '', 'FIELD LOG'));
    const log = h('div', 'cd-log');
    for (const e of opts.scoreLog) {
      log.appendChild(
        h('div', e.good ? 'good' : 'bad',
          `${e.points >= 0 ? '+' : ''}${e.points}  ${e.text}${e.objectives.length ? `  (${e.objectives.join(', ')})` : ''}`),
      );
    }
    right.appendChild(log);
    right.appendChild(h('div', 'cd-tally', `FIELD SCORE  ${opts.score}`));
    grid.appendChild(right);
    s.appendChild(grid);
    const go = () => runCheck(buildFirstCheck(), 'first');
    s.appendChild(bigButton('KNOWLEDGE CHECK ▸  [ENTER]', go));
    addEvidenceUi();
    keyFn = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    };
  };

  const buildFirstCheck = (): CheckItem[] => {
    const items: CheckItem[] = mission.debriefQuestions.map((q) => ({ q, missionId: mission.id, review: false }));
    const due = review
      .map((key) => {
        const [mid, qid] = key.split(':');
        if (mid === mission.id) return null;
        const m = missionRegistry.get(mid);
        const q = m?.debriefQuestions.find((x) => x.id === qid);
        return q ? { q, missionId: mid, review: true } : null;
      })
      .filter((x): x is CheckItem => x !== null)
      .slice(0, REVIEW_PER_DEBRIEF);
    return [...items, ...due];
  };

  // ---------- 2. knowledge check, one question at a time ----------
  const runCheck = (items: CheckItem[], mode: 'first' | 'retry') => {
    let i = 0;
    const show = () => {
      clear();
      const item = items[i];
      const { q } = item;
      s.appendChild(h('div', 'cd-kicker',
        `${mode === 'retry' ? 'RETRY' : 'KNOWLEDGE CHECK'}  ·  ${i + 1} / ${items.length}` +
          (item.review ? `  ·  SPACED REVIEW FROM ${item.missionId.toUpperCase()}` : '')));
      const panel = h('div', 'cd-panel cd-quiz');
      panel.appendChild(h('div', 'cd-tags', q.objectives.map((id) => `${id} ${objectiveById(id)?.title ?? ''}`).join('  ·  ')));
      panel.appendChild(h('div', 'cd-prompt', q.prompt));
      const opts2 = shuffled(q.options);
      const btns: HTMLButtonElement[] = [];
      let picked = false;
      const next = bigButton(i + 1 < items.length ? 'NEXT ▸  [ENTER]' : 'RESULTS ▸  [ENTER]', () => advance());
      next.disabled = true;
      next.classList.add('locked');
      const pick = (k: number) => {
        if (picked) return;
        picked = true;
        const chosen = opts2[k];
        const key = `${item.missionId}:${q.id}`;
        mastery = recordAnswer(mastery, q.objectives, chosen.correct);
        if (mode === 'first' && !item.review) firstTry.set(q.id, chosen.correct);
        if (chosen.correct) review = review.filter((r) => r !== key);
        else review = [...review, key];
        saveReview(review);
        opts2.forEach((o, j) => {
          const b = btns[j];
          b.disabled = true;
          b.classList.add('revealed', o.correct ? 'right' : j === k ? 'wrong' : 'other');
          b.appendChild(h('div', 'cd-expl', `${o.correct ? 'CORRECT. ' : j === k ? 'NO. ' : ''}${o.explanation}`));
        });
        panel.appendChild(h('div', `cd-verdict ${chosen.correct ? 'good' : 'bad'}`, chosen.correct ? 'CORRECT' : 'MISSED. QUEUED FOR REVIEW'));
        next.disabled = false;
        next.classList.remove('locked');
        next.focus();
      };
      opts2.forEach((o, j) => {
        const b = h('button', 'cd-opt') as HTMLButtonElement;
        b.appendChild(h('span', 'cd-key', String(j + 1)));
        b.appendChild(h('span', 'cd-opt-text', o.text));
        b.addEventListener('click', () => pick(j));
        btns.push(b);
        panel.appendChild(b);
      });
      s.appendChild(panel);
      s.appendChild(next);
      addEvidenceUi();
      const advance = () => {
        if (!picked) return;
        i++;
        if (i < items.length) show();
        else summary(mode === 'retry' ? items : null);
      };
      keyFn = (e) => {
        const n = Number(e.key);
        const letter = 'abcd'.indexOf(e.key.toLowerCase());
        if (n >= 1 && n <= opts2.length) pick(n - 1);
        else if (letter >= 0 && letter < opts2.length) pick(letter);
        else if (e.key === 'Enter' && picked) {
          e.preventDefault();
          advance();
        }
      };
    };
    show();
  };

  // ---------- 3. grade ----------
  const summary = (retried: CheckItem[] | null) => {
    clear();
    const total = mission.debriefQuestions.length;
    const correct = [...firstTry.values()].filter(Boolean).length;
    const quizPct = total ? (correct / total) * 100 : 100;
    const result = gradeMission({ fieldPct, quizPct, won: opts.won, falsePositives });

    s.appendChild(h('div', 'cd-kicker', `${mission.title}  ·  MISSION GRADE`));
    const g = h('div', `cd-grade g${result.grade}`, result.grade);
    s.appendChild(g);
    const row = h('div', 'cd-stats');
    row.appendChild(h('div', '', `FIELD  ${Math.round(result.field)}%`));
    row.appendChild(h('div', '', `KNOWLEDGE  ${correct}/${total}`));
    row.appendChild(h('div', '', `TOTAL  ${result.total}%`));
    s.appendChild(row);
    if (result.capped === 'false-positive') {
      s.appendChild(h('div', 'cd-note bad', 'FALSE POSITIVE: FIELD AND GRADE CAPPED AT B'));
    }
    if (!opts.won) s.appendChild(h('div', 'cd-note bad', 'Mission failed: grade capped at F. Redeploy to pass.'));
    if (retried) {
      const fixed = retried.filter((it) => !review.includes(`${it.missionId}:${it.q.id}`)).length;
      s.appendChild(h('div', 'cd-note', `Retry: ${fixed}/${retried.length} now correct (grade keeps first-try answers).`));
    }

    const grid = h('div', 'cd-grid');
    const left = h('div', 'cd-panel');
    left.appendChild(h('h3', '', 'SY0-701 READINESS'));
    const r = readiness(mastery);
    for (const d of r.byDomain) {
      const bar = h('div', 'cd-bar');
      bar.appendChild(h('span', 'cd-bar-label', `D${d.domain} ${d.title.toUpperCase()} (${d.weight}%)`));
      const track = h('span', 'cd-bar-track');
      const fill = h('span', `cd-bar-fill d${d.domain}`);
      fill.style.width = `${(d.demonstrated / d.total) * 100}%`;
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(h('span', 'cd-bar-n', `${d.demonstrated}/${d.total}`));
      left.appendChild(bar);
    }
    left.appendChild(h('div', 'cd-tally', `EXAM-WEIGHTED READINESS  ${r.overall}%`));
    left.appendChild(h('div', 'cd-coverage-line', playableCoverageLine()));
    grid.appendChild(left);
    if (teach) {
      const right = h('div', 'cd-panel');
      right.appendChild(h('h3', '', 'EXAM TIP'));
      right.appendChild(h('p', 'cd-body', teach.examTip));
      grid.appendChild(right);
    }
    s.appendChild(grid);

    const missed: CheckItem[] = mission.debriefQuestions
      .filter((q) => review.includes(`${mission.id}:${q.id}`))
      .map((q) => ({ q, missionId: mission.id, review: false }));
    const btnRow = h('div', 'cd-btn-row');
    if (missed.length) btnRow.appendChild(bigButton(`RETRY MISSED (${missed.length})  [R]`, () => runCheck(missed, 'retry'), 'cd-btn alt'));
    btnRow.appendChild(bigButton('CONTINUE ▸  [ENTER]', () => opts.onDone(correct)));
    s.appendChild(btnRow);
    addEvidenceUi();
    keyFn = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        opts.onDone(correct);
      } else if ((e.key === 'r' || e.key === 'R') && missed.length) runCheck(missed, 'retry');
    };
  };

  report();
  return s;
}
