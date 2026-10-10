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
import type { LossCause } from '../missions/runtime';
import { failureExplanation } from './failure';
import { objectiveById } from '../content/objectives';
import { drawBigText, drawChunky, drawText, measureBig, measureText } from '../render/font';
import { RES } from '../render/res';
import { h, onKeysWhileMounted } from './briefing';
import {
  DB_BODY_ROWS,
  DB_BODY_TOP,
  DB_H,
  DB_LINE,
  DB_W,
  DB_X,
  STATS_Y,
  avoidViolated,
  block,
  paginate,
  statsLine,
  statsSegments,
  type PLine,
  wrapPixel,
} from './debrief-layout';
import './curriculum.css';

export { letterGrade } from '../content/curriculum';

/**
 * CURRICULUM: after-action report -> knowledge check -> grade, drawn as a
 * Doom-style intermission on a fixed 400x250 pixel canvas with the bitmap
 * font. Every page is laid out by measured pixel width and paginated (no
 * scrolling). The knowledge check counts for half the mission grade, every
 * question must be answered before continuing, options are shuffled, missed
 * items can be retried and are queued for spaced review in later debriefs.
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

export const C = {
  text: '#f4e6c8',
  dim: '#a88c68',
  gold: '#f0c020',
  red: '#ff5a3c',
  green: '#5ce88a',
  cyan: '#7ad0ff',
  white: '#ffffff',
  orange: '#ff9a40',
};
export const RAMP = {
  red: ['#ffb08a', '#ff5a30', '#e02810', '#a01008', '#600800'],
  gold: ['#fff4b0', '#ffd84a', '#f0b020', '#b87010', '#704000'],
  green: ['#d0ffd0', '#7cf0a0', '#3cc068', '#1a8040', '#0a5020'],
};
export const DOMAIN_COLOR: Record<number, string> = { 1: '#4cc3ff', 2: '#ff5a3c', 3: '#b07cff', 4: '#4ce07a', 5: '#ffc83c' };
const DOMAIN_SHORT: Record<number, string> = {
  1: 'GENERAL CONCEPTS',
  2: 'THREATS & VULNS',
  3: 'ARCHITECTURE',
  4: 'OPERATIONS',
  5: 'PROGRAM MGMT',
};

/** Special scored outcomes that get their own row when the mission teaches them. */
const TAG_ROWS: [tag: string, clean: string, dirty: string][] = [
  ['false-positive', 'NO FALSE POSITIVES', 'FALSE POSITIVES'],
  ['priority-miss', 'CHANGES IN RISK ORDER', 'OUT-OF-ORDER CHANGES'],
  ['bad-choice', 'NO WRONG CALLS', 'WRONG CALLS'],
];

interface Page {
  lines?: PLine[];
  draw?: (g: CanvasRenderingContext2D, t: number) => void;
  /** Plain-text summary for the canvas aria-label. */
  label?: string;
}

interface View {
  kicker: string;
  title: string;
  ramp: string[];
  sub?: string;
  pages: Page[];
  nextLabel: string;
  canNext: () => boolean;
  next: () => void;
  onHit?: (i: number) => void;
  onKey?: (e: KeyboardEvent) => boolean;
  extraButton?: { label: string; go: () => void };
  animate?: number;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  go: () => void;
}

export function bevel(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, fill: string): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, hh);
  g.fillStyle = '#8a6a48';
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, hh);
  g.fillStyle = '#000';
  g.fillRect(x, y + hh - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, hh);
}

export function brickBackdrop(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = DB_W * RES;
  c.height = DB_H * RES;
  const g = c.getContext('2d')!;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.fillStyle = '#2c140e';
  g.fillRect(0, 0, DB_W, DB_H);
  let s = 1337;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < DB_H; y += 16) {
    const off = (y / 16) % 2 ? 16 : 0;
    for (let x = -off; x < DB_W; x += 32) {
      const v = 34 + Math.floor(rnd() * 12);
      g.fillStyle = `rgb(${v + 8},${Math.floor(v / 2)},${Math.floor(v / 3)})`;
      g.fillRect(x + 1, y + 1, 30, 14);
      g.fillStyle = '#4a2418';
      g.fillRect(x + 1, y + 1, 30, 1);
    }
    g.fillStyle = '#140604';
    g.fillRect(0, y + 15, DB_W, 1);
    for (let x = -off; x < DB_W; x += 32) g.fillRect(x + 31, y, 1, 16);
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = i % 2 ? '#3e1e14' : '#120604';
    g.fillRect(Math.floor(rnd() * DB_W), Math.floor(rnd() * DB_H), 1, 1);
  }
  return c;
}

export function bigScaled(g: CanvasRenderingContext2D, text: string, x: number, y: number, ramp: string[], k: number): void {
  const off = document.createElement('canvas');
  off.width = (measureBig(text) + 2) * RES;
  off.height = 16 * RES;
  const og = off.getContext('2d')!;
  og.setTransform(RES, 0, 0, RES, 0, 0);
  drawBigText(og, text, 0, 0, ramp);
  g.imageSmoothingEnabled = false;
  g.drawImage(off, x, y, (off.width / RES) * k, (off.height / RES) * k);
}

export function debrief(opts: {
  mission: Mission;
  won: boolean;
  score: number;
  scoreLog: ScoreEvent[];
  objectives: { text: string; done: boolean; failed: boolean; violations?: number; kind?: string }[];
  evidence?: EvidenceEntry[];
  /** Intermission tallies from rt.stats() (Doom intermission parity). */
  stats?: { kills: number; killsTotal: number; secrets: number; secretsTotal: number; time: number; par: number };
  /** Why the mission was lost (integrity vs objective breach). */
  loss?: LossCause | null;
  /** Restart the same mission; falls back to leaving the debrief. */
  onRedeploy?: () => void;
  onDone: (quizScore: number) => void;
}): HTMLElement {
  const { mission } = opts;
  const redeploy = opts.onRedeploy ?? (() => opts.onDone(0));
  const teach = teachingRegistry.get(mission.id);
  const s = h('div', 'screen cd-inter cd-pixel');
  const canvas = document.createElement('canvas');
  canvas.width = DB_W * RES;
  canvas.height = DB_H * RES;
  canvas.className = 'cd-pixel-canvas';
  canvas.setAttribute('role', 'img');
  s.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const backdrop = brickBackdrop();
  const entries = opts.evidence ?? [];

  let view: View;
  let page = 0;
  let viewStart = performance.now();
  let hits: Hit[] = [];
  const ev = { open: false, sel: 0, detail: false, page: 0 };

  // Avoid objectives are upheld whenever they were not actually violated —
  // on a lost mission an unviolated avoid shows done, never the missed text.
  const objRows = opts.objectives.map((o, i) => {
    const def = mission.missionObjectives.find((m) => m.text === o.text) ?? mission.missionObjectives[i];
    const avoided = def?.kind === 'avoid' && !avoidViolated(o);
    return { ...o, def, done: o.done || avoided };
  });
  const fieldPct = objRows.length ? (objRows.filter((o) => o.done && !o.failed).length / objRows.length) * 100 : 100;
  const falsePositives = opts.scoreLog.filter((event) => event.tag === 'false-positive').length;

  const firstTry = new Map<string, boolean>();
  let mastery = loadMastery();
  if (opts.won) {
    const demonstrated = opts.scoreLog
      .filter((event) => event.points > 0 && event.tag !== 'false-positive' && event.tag !== 'priority-miss')
      .flatMap((event) => event.objectives);
    for (const objective of objRows) {
      if (!objective.done || objective.failed || !objective.def) continue;
      const lesson = teach?.lessons[objective.def.id];
      if (lesson) demonstrated.push(lesson.objective);
    }
    mastery = recordField(mastery, demonstrated);
  }
  let review = loadReview();

  // ---------- rendering ----------
  const button = (label: string, x: number, y: number, enabled: boolean, go: () => void, align: 'l' | 'r' = 'l') => {
    const w = measureText(label) + 10;
    const bx = align === 'r' ? x - w : x;
    bevel(g, bx, y, w, 13, enabled ? '#5a1a0c' : '#241410');
    drawText(g, label, bx + 5, y + 3, enabled ? C.gold : '#6a5440');
    if (enabled) hits.push({ x: bx, y, w, h: 13, go });
    return w;
  };

  const drawLine = (g: CanvasRenderingContext2D, l: PLine, y: number) => {
    if (l.font === 'chunky') {
      if (l.prefix) drawChunky(g, l.prefix, DB_X, y, l.prefixColor ?? l.color);
      if (l.text) drawChunky(g, l.text, DB_X + (l.indent ?? 0), y, l.color);
    } else {
      if (l.prefix) drawText(g, l.prefix, DB_X, y, l.prefixColor ?? l.color);
      if (l.text) drawText(g, l.text, DB_X + (l.indent ?? 0), y, l.color);
    }
  };
  const drawLines = (lines: PLine[]) => {
    lines.forEach((l, i) => {
      const y = DB_BODY_TOP + i * DB_LINE;
      drawLine(g, l, y);
      if (l.hit !== undefined && view.onHit) {
        const idx = l.hit;
        hits.push({ x: 10, y: y - 1, w: DB_W - 20, h: DB_LINE, go: () => view.onHit?.(idx) });
      }
    });
  };

  const drawEvidence = () => {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, DB_W, DB_H);
    bevel(g, 14, 10, DB_W - 28, DB_H - 20, '#0c0806');
    g.fillStyle = '#b08a3c';
    g.fillRect(14, 24, DB_W - 28, 1);
    drawText(g, `EVIDENCE LOG (${entries.length})  -  ${mission.title}`, 22, 14, C.gold);
    const listRows = 21;
    if (!entries.length) {
      drawText(g, 'NO EVIDENCE WAS LOGGED DURING THIS MISSION.', 22, 32, C.text);
    } else if (!ev.detail) {
      const start = Math.max(0, Math.min(ev.sel - Math.floor(listRows / 2), entries.length - listRows));
      entries.slice(start, start + listRows).forEach((entry, k) => {
        const i = start + k;
        const y = 30 + k * DB_LINE;
        const on = i === ev.sel;
        if (on) {
          g.fillStyle = '#4a1a0c';
          g.fillRect(18, y - 1, DB_W - 36, DB_LINE);
        }
        const tag = entry.source.toUpperCase();
        const label = wrapPixel(`${i + 1}. ${entry.label}`, DB_W - 60 - measureText(tag))[0] ?? '';
        drawText(g, label, 22, y, on ? C.white : C.text);
        drawText(g, tag, DB_W - 22 - measureText(tag), y, C.dim);
        hits.push({ x: 18, y: y - 1, w: DB_W - 36, h: DB_LINE, go: () => { ev.sel = i; ev.detail = true; ev.page = 0; } });
      });
    } else {
      const entry = entries[ev.sel];
      const title = wrapPixel(entry.label, DB_W - 48);
      const detail = wrapPixel(entry.detail, DB_W - 48);
      const rows = listRows - title.length - 1;
      const pages = Math.max(1, Math.ceil(detail.length / rows));
      ev.page = Math.min(ev.page, pages - 1);
      title.forEach((t, i) => drawText(g, t, 22, 30 + i * DB_LINE, C.gold));
      detail.slice(ev.page * rows, (ev.page + 1) * rows).forEach((t, i) =>
        drawText(g, t, 22, 30 + (title.length + 1 + i) * DB_LINE, C.text));
      drawText(g, `${entry.source.toUpperCase()}  -  PAGE ${ev.page + 1}/${pages}`, 22, DB_H - 40, C.dim);
    }
    const hint = ev.detail ? '<- -> PAGE   ESC BACK   L CLOSE' : 'UP/DOWN SELECT   ENTER OPEN   ESC/L CLOSE';
    drawText(g, hint, 22, DB_H - 28, C.orange);
    button('CLOSE [L]', DB_W - 20, DB_H - 30, true, () => { ev.open = false; ev.detail = false; }, 'r');
  };

  const render = () => {
    hits = [];
    const t = Math.min(1, view.animate ? (performance.now() - viewStart) / view.animate : 1);
    g.drawImage(backdrop, 0, 0, DB_W, DB_H);
    drawText(g, view.kicker, (DB_W - measureText(view.kicker)) / 2, 4, C.dim);
    drawBigText(g, view.title, (DB_W - measureBig(view.title)) / 2, 14, view.ramp);
    if (view.sub) drawText(g, view.sub, (DB_W - measureText(view.sub)) / 2, 33, C.white);
    bevel(g, 10, 43, DB_W - 20, DB_BODY_ROWS * DB_LINE + 7, 'rgba(12,8,6,0.9)');
    const p = view.pages[Math.min(page, view.pages.length - 1)];
    if (p.draw) p.draw(g, t);
    if (p.lines) drawLines(p.lines);

    const fy = DB_H - 17;
    const n = view.pages.length;
    let x = 10;
    if (n > 1) x += button('< PREV', x, fy, page > 0, () => go(-1)) + 4;
    x += button(`EVIDENCE ${entries.length} [L]`, x, fy, true, () => { ev.open = true; }) + 4;
    if (view.extraButton) button(view.extraButton.label, x, fy, true, view.extraButton.go);
    const last = page >= n - 1;
    const nextLabel = !last ? 'NEXT PAGE [ENTER] >' : view.canNext() ? `${view.nextLabel} [ENTER] >` : view.nextLabel;
    const nw = button(nextLabel, DB_W - 10, fy, !last || view.canNext(), () => advance(), 'r');
    if (n > 1) {
      const label = `${page + 1}/${n}`;
      drawText(g, label, DB_W - 10 - nw - 6 - measureText(label), fy + 3, C.dim);
    }
    if (ev.open) drawEvidence();
    const text = ev.open ? 'Evidence log' : [view.title, view.sub ?? '', p.label ?? (p.lines ?? []).map((l) => `${l.prefix ?? ''} ${l.text}`).join(' ')].join(' | ');
    canvas.setAttribute('aria-label', text);
    canvas.dataset.page = `${page + 1}/${n}`;
    if (t < 1) setTimeout(() => { if (s.isConnected) render(); }, 33);
  };

  const show = (v: View) => {
    view = v;
    page = 0;
    viewStart = performance.now();
    render();
  };
  const go = (d: number) => {
    page = Math.max(0, Math.min(view.pages.length - 1, page + d));
    render();
  };
  const advance = () => {
    if (view.animate && performance.now() - viewStart < view.animate) {
      viewStart = -1e9;
      render();
      return;
    }
    if (page < view.pages.length - 1) go(1);
    else if (view.canNext()) view.next();
  };

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * DB_W;
    const y = ((e.clientY - r.top) / r.height) * DB_H;
    const hit = [...hits].reverse().find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    if (hit) {
      hit.go();
      if (s.isConnected) render();
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * DB_W;
    const y = ((e.clientY - r.top) / r.height) * DB_H;
    canvas.style.cursor = hits.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ? 'pointer' : 'default';
  });

  onKeysWhileMounted(s, (e) => {
    const k = e.key;
    if (ev.open) {
      e.preventDefault();
      if (k === 'Escape' || k === 'Backspace') {
        if (ev.detail) ev.detail = false;
        else ev.open = false;
      } else if (e.code === 'KeyL' || k === 'Tab') {
        ev.open = false;
        ev.detail = false;
      } else if (!ev.detail && (k === 'ArrowUp' || k === 'w' || k === 'W')) ev.sel = Math.max(0, ev.sel - 1);
      else if (!ev.detail && (k === 'ArrowDown' || k === 's' || k === 'S')) ev.sel = Math.min(entries.length - 1, ev.sel + 1);
      else if (!ev.detail && k === 'Enter' && entries.length) {
        ev.detail = true;
        ev.page = 0;
      } else if (ev.detail && (k === 'ArrowLeft' || k === 'PageUp')) ev.page = Math.max(0, ev.page - 1);
      else if (ev.detail && (k === 'ArrowRight' || k === 'PageDown' || k === 'Enter')) ev.page++;
      render();
      return;
    }
    if (e.code === 'KeyL' || k === 'Tab') {
      e.preventDefault();
      ev.open = true;
      ev.detail = false;
      render();
      return;
    }
    if (view.onKey?.(e)) return;
    if (k === 'ArrowLeft' || k === 'PageUp') {
      e.preventDefault();
      go(-1);
    } else if (k === 'ArrowRight' || k === 'PageDown') {
      e.preventDefault();
      go(1);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      advance();
    }
  });

  // ---------- 1. after-action report ----------
  const tagRows = TAG_ROWS.filter(([tag]) => teach?.lessons[tag]).map(([tag, clean, dirty]) => {
    const count = opts.scoreLog.filter((event) => event.tag === tag).length;
    return { tag, count, label: count ? `${dirty} X${count}` : clean };
  });

  const report = () => {
    const doneCount = objRows.filter((o) => o.done && !o.failed).length;
    const tallies: [string, number, string][] = [
      ['OBJECTIVES', doneCount, `/${objRows.length}`],
      ['FIELD SCORE', opts.score, ''],
      ...tagRows.filter((r) => r.tag !== 'priority-miss' || r.count).map((r): [string, number, string] => [
        r.tag === 'false-positive' ? 'FALSE POS.' : r.tag === 'priority-miss' ? 'OUT OF ORDER' : 'WRONG CALLS', r.count, '']),
      ['EVIDENCE', entries.length, ''],
    ];
    const stats = opts.stats;
    const tally: Page = {
      label: tallies.map(([l, v, suf]) => `${l} ${v}${suf}`).join(', ') +
        (stats ? ` | ${statsLine(stats)}` : ''),
      draw: (gg, t) => {
        if (stats) {
          // STATS_Y sits below the title (~30) and above the first tally row
          // (56), inside DB_W x DB_H even when all 6 tally rows are shown.
          let x = 34;
          for (const seg of statsSegments(stats)) {
            drawText(gg, seg.text, x, STATS_Y, seg.text.startsWith('TIME')
              ? (seg.overPar ? C.red : C.green)
              : C.text);
            x += measureText(seg.text) + 12;
          }
        }
        tallies.slice(0, 6).forEach(([label, value, suffix], i) => {
          const y = 56 + i * 27;
          drawBigText(gg, label, 34, y, RAMP.gold);
          const shown = `${Math.round(value * t)}${suffix}`;
          const bad = (label === 'FALSE POS.' || label === 'OUT OF ORDER' || label === 'WRONG CALLS') && value > 0;
          drawBigText(gg, shown, DB_W - 34 - measureBig(shown), y, bad ? RAMP.red : label === 'OBJECTIVES' && value < objRows.length ? RAMP.red : RAMP.green);
        });
      },
    };
    const blocks: PLine[][] = [block('OBJECTIVES', C.gold)];
    for (const o of objRows) {
      const ok = o.done && !o.failed;
      const lesson = o.def ? teach?.lessons[o.def.id] : undefined;
      const b = block(o.text, ok ? C.green : C.red, { prefix: ok ? '+' : 'X' });
      if (lesson) b.push(...block(`[${lesson.objective}] ${ok ? lesson.done : lesson.missed}`, C.text, { indent: 14 }));
      blocks.push(b);
    }
    for (const r of tagRows) {
      const lesson = teach!.lessons[r.tag];
      const ok = r.count === 0;
      blocks.push([
        ...block(r.label, ok ? C.green : C.red, { prefix: ok ? '+' : 'X' }),
        ...block(`[${lesson.objective}] ${ok ? lesson.done : lesson.missed}`, C.text, { indent: 14 }),
      ]);
    }
    const logBlocks: PLine[][] = [block('FIELD LOG', C.gold)];
    for (const e of opts.scoreLog) {
      logBlocks[logBlocks.length - 1].push(
        ...block(`${e.text}${e.objectives.length ? `  (${e.objectives.join(', ')})` : ''}`, e.good ? C.text : C.red, {
          prefix: `${e.points >= 0 ? '+' : ''}${e.points}`,
          prefixColor: e.good ? C.green : C.red,
          indent: 16,
        }),
      );
    }
    logBlocks[logBlocks.length - 1].push({ text: '', color: C.text }, ...block(`FIELD SCORE  ${opts.score}`, C.gold));
    const failPages: Page[] = [];
    if (!opts.won) {
      const fx = failureExplanation(opts.loss ?? null, mission.id);
      const failBlocks: PLine[][] = [
        block('CAUSE OF FAILURE', C.gold),
        block(fx.headline, C.red),
        block('WHAT HAPPENED', C.gold),
        block(fx.what, C.text),
      ];
      if (fx.why) failBlocks.push(block('WHY IT MATTERS', C.gold), block(fx.why, C.white));
      failBlocks.push(block('NEXT TIME', C.gold));
      for (const line of fx.next) failBlocks.push(block(line, C.text, { prefix: '>', prefixColor: C.gold }));
      failBlocks.push(block('ENTER REDEPLOY  -  K OPTIONAL KNOWLEDGE CHECK (QUIZ)  -  ESC MISSION SELECT', C.orange));
      failPages.push(...paginate(failBlocks).map((lines) => ({ lines })));
    }
    show({
      kicker: `AFTER-ACTION REPORT  -  ${mission.title}`,
      title: opts.won ? 'MISSION COMPLETE' : 'MISSION FAILED',
      ramp: opts.won ? RAMP.gold : RAMP.red,
      pages: [...failPages, tally, ...paginate(blocks).map((lines) => ({ lines })), ...paginate(logBlocks).map((lines) => ({ lines }))],
      nextLabel: opts.won ? 'KNOWLEDGE CHECK' : 'REDEPLOY',
      canNext: () => true,
      next: opts.won ? () => runCheck(buildFirstCheck(), 'first') : redeploy,
      extraButton: opts.won ? undefined : { label: 'QUIZ [K]', go: () => runCheck(buildFirstCheck(), 'first') },
      onKey: opts.won ? undefined : (e) => {
        if (e.key === 'k' || e.key === 'K') {
          runCheck(buildFirstCheck(), 'first');
          return true;
        }
        if (e.key === 'Escape') {
          opts.onDone(0);
          return true;
        }
        return false;
      },
      animate: 900,
    });
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
    const ask = () => {
      const item = items[i];
      const { q } = item;
      const order = shuffled(q.options);
      let picked = -1;
      const kicker = `${mode === 'retry' ? 'RETRY' : 'KNOWLEDGE CHECK'}  ${i + 1}/${items.length}` +
        (item.review ? `  -  SPACED REVIEW FROM ${item.missionId.toUpperCase()}` : '');
      const tags = block(q.objectives.map((id) => `${id} ${objectiveById(id)?.title ?? ''}`).join(' / '), C.cyan);
      const questionPages = () => paginate([
        tags,
        block(q.prompt, C.white, { font: 'chunky' }),
        ...order.map((o, j) => block(o.text, C.text, { prefix: String(j + 1), prefixColor: C.gold, hit: j, font: 'chunky' })),
        block(`PRESS 1-${order.length} OR CLICK AN ANSWER.`, C.orange),
      ]).map((lines) => ({ lines }));
      const feedbackPages = () => {
        const chosen = order[picked];
        return paginate([
          block(chosen.correct ? 'CORRECT.' : 'MISSED. QUEUED FOR SPACED REVIEW.', chosen.correct ? C.green : C.red),
          block(q.prompt, C.dim, { font: 'chunky' }),
          ...order.map((o, j) => [
            ...block(`${o.correct ? '[RIGHT] ' : j === picked ? '[YOUR PICK] ' : ''}${o.text}`,
              o.correct ? C.green : j === picked ? C.red : C.dim, { prefix: String(j + 1), prefixColor: C.gold, font: 'chunky' }),
            // one block: the explanation can never spill away from its option
            ...block(o.explanation, C.text, { indent: 14, font: 'chunky' }),
          ]),
        ]).map((lines) => ({ lines }));
      };
      const pick = (k: number) => {
        if (picked >= 0 || k < 0 || k >= order.length) return;
        picked = k;
        const chosen = order[k];
        const key = `${item.missionId}:${q.id}`;
        mastery = recordAnswer(mastery, q.objectives, chosen.correct);
        if (mode === 'first' && !item.review) firstTry.set(q.id, chosen.correct);
        if (chosen.correct) review = review.filter((r) => r !== key);
        else review = [...review, key];
        saveReview(review);
        view.pages = feedbackPages();
        view.title = chosen.correct ? 'CORRECT' : 'MISSED';
        view.ramp = chosen.correct ? RAMP.green : RAMP.red;
        page = 0;
        render();
      };
      show({
        kicker,
        title: mode === 'retry' ? 'RETRY' : 'KNOWLEDGE CHECK',
        ramp: RAMP.gold,
        pages: questionPages(),
        nextLabel: i + 1 < items.length ? 'NEXT QUESTION' : 'RESULTS',
        canNext: () => picked >= 0 || order.length === 0,
        next: () => {
          i++;
          if (i < items.length) ask();
          else summary(mode === 'retry' ? items : null);
        },
        onHit: (j) => pick(j),
        onKey: (e) => {
          if (!opts.won && e.key === 'Escape') {
            redeploy();
            return true;
          }
          const n = Number(e.key);
          if (picked < 0 && n >= 1 && n <= order.length) {
            pick(n - 1);
            return true;
          }
          return false;
        },
        extraButton: opts.won ? undefined : { label: 'REDEPLOY [ESC]', go: redeploy },
      });
    };
    if (!items.length) summary(null);
    else ask();
  };

  // ---------- 3. grade ----------
  const summary = (retried: CheckItem[] | null) => {
    const total = mission.debriefQuestions.length;
    const correct = [...firstTry.values()].filter(Boolean).length;
    const quizPct = total ? (correct / total) * 100 : 100;
    const result = gradeMission({ fieldPct, quizPct, won: opts.won, falsePositives });
    const r = readiness(mastery);
    const gradeRamp = result.grade === 'A' || result.grade === 'B' ? RAMP.gold : result.grade === 'F' ? RAMP.red : RAMP.gold;
    const missed: CheckItem[] = mission.debriefQuestions
      .filter((q) => review.includes(`${mission.id}:${q.id}`))
      .map((q) => ({ q, missionId: mission.id, review: false }));
    const note = result.capped === 'false-positive'
      ? 'FALSE POSITIVE: FIELD AND GRADE CAPPED AT B'
      : result.capped === 'fail' ? 'MISSION FAILED: GRADE CAPPED AT F. REDEPLOY TO PASS.' : '';
    const gradePage: Page = {
      label: `GRADE ${result.grade}, FIELD ${Math.round(result.field)}%, KNOWLEDGE ${correct}/${total}, TOTAL ${result.total}%. ${note} READINESS ${r.overall}%: ` +
        r.byDomain.map((d) => `D${d.domain} ${d.demonstrated}/${d.total}`).join(', '),
      draw: (gg) => {
        bevel(gg, 20, 50, 64, 72, '#1a0a06');
        bigScaled(gg, result.grade, 28, 54, gradeRamp, 4);
        drawBigText(gg, `FIELD ${Math.round(result.field)}%`, 100, 54, RAMP.gold);
        drawBigText(gg, `KNOWLEDGE ${correct}/${total}`, 100, 76, RAMP.gold);
        drawBigText(gg, `TOTAL ${result.total}%`, 100, 98, result.capped ? RAMP.red : RAMP.green);
        if (note) drawText(gg, note, 100, 116, C.red);
        drawText(gg, `SY0-701 READINESS (EXAM-WEIGHTED)  ${r.overall}%`, DB_X, 132, C.gold);
        r.byDomain.forEach((d, k) => {
          const y = 145 + k * 14;
          drawText(gg, `D${d.domain} ${DOMAIN_SHORT[d.domain] ?? d.title}`, DB_X, y, C.text);
          drawText(gg, `${d.weight}%`, 142, y, C.dim);
          gg.fillStyle = '#000';
          gg.fillRect(170, y - 1, 170, 9);
          gg.fillStyle = '#6a4a30';
          gg.fillRect(170, y - 1, 170, 1);
          gg.fillStyle = DOMAIN_COLOR[d.domain] ?? C.gold;
          gg.fillRect(171, y, Math.round((168 * d.demonstrated) / d.total), 7);
          drawText(gg, `${d.demonstrated}/${d.total}`, 348, y, C.white);
        });
      },
    };
    const notes: PLine[][] = [];
    if (teach) notes.push([...block('EXAM TIP', C.gold), ...block(teach.examTip, C.white)]);
    if (retried) {
      const fixed = retried.filter((it) => !review.includes(`${it.missionId}:${it.q.id}`)).length;
      notes.push(block(`RETRY: ${fixed}/${retried.length} NOW CORRECT. THE GRADE KEEPS FIRST-TRY ANSWERS.`, C.text));
    }
    if (missed.length) notes.push(block(`${missed.length} MISSED ITEM(S) QUEUED FOR SPACED REVIEW. PRESS R TO RETRY NOW.`, C.orange));
    notes.push([...block('PLAYABLE COVERAGE', C.gold), ...block(playableCoverageLine(), C.text)]);
    show({
      kicker: `${mission.title}  -  MISSION GRADE`,
      title: 'MISSION GRADE',
      ramp: RAMP.gold,
      pages: [gradePage, ...paginate(notes).map((lines) => ({ lines }))],
      nextLabel: opts.won ? 'CONTINUE' : 'REDEPLOY',
      canNext: () => true,
      next: opts.won ? () => opts.onDone(correct) : redeploy,
      extraButton: missed.length ? { label: `RETRY ${missed.length} [R]`, go: () => runCheck(missed, 'retry') } : undefined,
      onKey: (e) => {
        if ((e.key === 'r' || e.key === 'R') && missed.length) {
          runCheck(missed, 'retry');
          return true;
        }
        if (!opts.won && e.key === 'Escape') {
          opts.onDone(correct);
          return true;
        }
        return false;
      },
    });
  };

  report();
  return s;
}
