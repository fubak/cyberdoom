/**
 * Main-thread orchestration for off-thread pixel generation. A small pool of
 * module workers runs the registered gen jobs (see gen.ts / genworker.ts) and
 * posts the packed pixels back as transferable buffers; the main thread only
 * installs them (DataTexture wrap + GPU upload stays lazy). Every frame keeps
 * a synchronous demand path — installGenNow() runs the same job inline — so a
 * first read never deadlocks on a worker and a dead pool degrades to the old
 * behavior. Environments without Worker/OffscreenCanvas (and Vitest) report
 * genPoolActive() === false and callers keep the legacy eager/lazy paths.
 */
import { genJobMeta, hasGenJob, reorderLazyQueue, runGenJob, type GenResult } from './gen';

type Installer = (res: GenResult) => void;

interface PendingGen {
  key: string;
  setId: string;
  first: boolean;
}

interface PoolWorker {
  w: Worker;
  ready: boolean;
  inflight: string | null;
}

interface GenResultMsg {
  t: 'ready' | 'result' | 'fail';
  key?: string;
  res?: GenResult;
  message?: string;
}

const installers = new Map<string, Installer>();
const pending: PendingGen[] = [];
const done = new Set<string>();
const results = new Map<string, GenResult>();
const waiters: { keys: Set<string>; cb: () => void }[] = [];

let pool: PoolWorker[] | null = null;
let poolFailed = false;
const drainCbs: ((ms: number) => void)[] = [];
let drainStart = 0;
let draining = false;

/** True on the main thread in a browser that supports module workers + OffscreenCanvas. */
export function genPoolActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker === 'function' &&
    typeof OffscreenCanvas === 'function'
  );
}

/** Number of generation workers the pool started (0 = synchronous fallback). */
export function genWorkerCount(): number {
  return pool?.length ?? 0;
}

/**
 * Queue `key` for worker generation; `install` is called with the packed
 * pixels when they arrive. Returns false when no pool is available — callers
 * must then keep their own eager/lazy path.
 */
export function deferGenJob(key: string, install: Installer): boolean {
  if (!genPoolActive() || poolFailed) return false;
  installers.set(key, install);
  pending.push({ key, ...genJobMeta(key) });
  ensurePool();
  pump();
  return true;
}

export function genJobDone(key: string): boolean {
  return done.has(key);
}

/** Synchronously materialize a pending job on the calling thread (demand path). */
export function installGenNow(key: string): void {
  if (done.has(key)) return;
  deliver(key, runGenJob(key));
}

/** Pixels of an installed job (the same buffers the texture owns). */
export function genResultFor(key: string): GenResult | undefined {
  return results.get(key);
}

/** Run the job on this thread and byte-compare against the installed (worker-produced) pixels. */
export function genDebugCompare(key: string): { same: boolean; diffs: number } | null {
  const a = results.get(key);
  if (!a || !hasGenJob(key)) return null;
  const b = runGenJob(key);
  let diffs = 0;
  const scan = (x: Uint8Array, y: Uint8Array) => {
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) diffs++;
  };
  scan(a.data, b.data);
  a.mipmaps.forEach((m, i) => scan(m.data, b.mipmaps[i]?.data ?? new Uint8Array(0)));
  return { same: diffs === 0, diffs };
}

/** Call `cb` once every named job has installed (immediately if already done). */
export function whenGenJobs(keys: string[], cb: () => void): void {
  const rem = new Set(keys.filter((k) => !done.has(k)));
  if (!rem.size) {
    cb();
    return;
  }
  waiters.push({ keys: rem, cb });
}

/** Move the named sets' pending frames to the front of the worker queue. */
export function prioritizeGenJobs(setIds: string[]): void {
  pending.splice(0, pending.length, ...reorderLazyQueue(pending, setIds));
}

/** First-frames-first, then drain the queue across the worker pool; `onComplete(ms)` when empty. */
export function prewarmGenJobs(onComplete?: (ms: number) => void): void {
  pending.splice(0, pending.length, ...reorderLazyQueue(pending, []));
  drainStart = performance.now();
  draining = true;
  if (onComplete) drainCbs.push(onComplete);
  if (poolFailed) fallbackDrain();
  else {
    ensurePool();
    pump();
    checkDrained();
  }
}

function deliver(key: string, res: GenResult): void {
  if (done.has(key)) return;
  done.add(key);
  results.set(key, res);
  installers.get(key)?.(res);
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    w.keys.delete(key);
    if (!w.keys.size) {
      waiters.splice(i, 1);
      w.cb();
    }
  }
}

function checkDrained(): void {
  if (!draining || !drainCbs.length) return;
  if (pending.length || (pool && pool.some((pw) => pw.inflight))) return;
  const ms = performance.now() - drainStart;
  const cbs = drainCbs.splice(0);
  for (const cb of cbs) cb(ms);
}

function pump(): void {
  if (!pool) return;
  for (const pw of pool) {
    while (pw.ready && !pw.inflight) {
      while (pending.length && done.has(pending[0].key)) pending.shift();
      const p = pending[0];
      if (!p) break;
      pending.shift();
      pw.inflight = p.key;
      pw.w.postMessage({ t: 'gen', key: p.key });
    }
  }
  checkDrained();
}

function ensurePool(): void {
  if (pool || !genPoolActive() || poolFailed) return;
  const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
  pool = [];
  for (let i = 0; i < n; i++) {
    let w: Worker;
    try {
      w = new Worker(new URL('./genworker.ts', import.meta.url), { type: 'module' });
    } catch {
      poolFailed = true;
      pool = null;
      return;
    }
    const pw: PoolWorker = { w, ready: false, inflight: null };
    w.onmessage = (e: MessageEvent<GenResultMsg>) => onWorkerMessage(pw, e.data);
    w.onerror = () => workerDead(pw);
    w.onmessageerror = () => workerDead(pw);
    pool.push(pw);
  }
}

function onWorkerMessage(pw: PoolWorker, msg: GenResultMsg): void {
  if (msg.t === 'ready') {
    pw.ready = true;
    pump();
    return;
  }
  pw.inflight = null;
  if (msg.t === 'result' && msg.key && msg.res) {
    deliver(msg.key, msg.res);
  } else if (msg.t === 'fail') {
    console.warn(`[gen] worker job failed: ${msg.key ?? '?'}: ${msg.message ?? ''}`);
  }
  pump();
}

function workerDead(pw: PoolWorker): void {
  if (!pool) return;
  const idx = pool.indexOf(pw);
  if (idx >= 0) pool.splice(idx, 1);
  if (pw.inflight && !done.has(pw.inflight)) pending.unshift({ key: pw.inflight, ...genJobMeta(pw.inflight) });
  try {
    pw.w.terminate();
  } catch {
    /* ignore */
  }
  if (!pool.length) {
    poolFailed = true;
    console.warn('[gen] all workers failed; falling back to idle-slice generation');
    if (draining) fallbackDrain();
  }
}

/** Last-resort drain when workers are unusable mid-run: job-sized slices on the main thread. */
function fallbackDrain(): void {
  const slice = () => {
    const t0 = performance.now();
    while (pending.length && performance.now() - t0 < 3) {
      const p = pending.shift()!;
      if (!done.has(p.key)) installGenNow(p.key);
    }
    if (pending.length) window.setTimeout(slice, 0);
    else checkDrained();
  };
  window.setTimeout(slice, 0);
}
