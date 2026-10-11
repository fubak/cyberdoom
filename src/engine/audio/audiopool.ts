/**
 * Main-thread side of the audio render worker. One module worker drains a
 * FIFO queue of render jobs (songs, stings, sfx); music jobs jump ahead of
 * queued sfx jobs so a tier request never waits behind the sfx prewarm.
 * Environments without Worker (Vitest) report audioPoolActive() === false
 * and callers keep the synchronous render path. A dead worker marks the
 * pool failed permanently for the session — every call then falls back
 * to the synchronous path too.
 */
import type { MusicLayer } from './sequencer';
import type { SfxVariant } from './sfxdef';
import type { AudioRenderJob } from './audioworker';

interface ResultMsg {
  t: 'ready' | 'result' | 'fail';
  id?: number;
  song?: Record<MusicLayer, Float32Array>;
  data?: Float32Array;
  message?: string;
}

interface PendingJob {
  msg: AudioRenderJob;
  sfx: boolean;
  resolve: (msg: ResultMsg) => void;
  reject: (err: unknown) => void;
}

let worker: Worker | null = null;
let poolFailed = false;
let nextId = 1;
const queue: PendingJob[] = [];
let inflight: PendingJob | null = null;

/** True in a browser with module workers; false under Vitest. */
export function audioPoolActive(): boolean {
  return typeof Worker === 'function' && !poolFailed;
}

export function requestSong(tier: string, sr: number, seed: number): Promise<Record<MusicLayer, Float32Array>> {
  return enqueue({ t: 'song', id: nextId++, tier, sr, seed }, false).then((r) => {
    if (!r.song) throw new Error('song result missing layers');
    return r.song;
  });
}

export function requestSting(name: string, sr: number, seed: number): Promise<Float32Array> {
  return enqueue({ t: 'sting', id: nextId++, name, sr, seed }, false).then((r) => {
    if (!r.data) throw new Error('sting result missing data');
    return r.data;
  });
}

export function requestSfx(name: string, sr: number, gender: SfxVariant, variant: number): Promise<Float32Array> {
  return enqueue({ t: 'sfx', id: nextId++, name, sr, gender, variant }, true).then((r) => {
    if (!r.data) throw new Error('sfx result missing data');
    return r.data;
  });
}

function enqueue(msg: AudioRenderJob, sfx: boolean): Promise<ResultMsg> {
  if (!audioPoolActive()) return Promise.reject(new Error('audio worker unavailable'));
  return new Promise((resolve, reject) => {
    const job: PendingJob = { msg, sfx, resolve, reject };
    if (sfx) queue.push(job);
    else {
      const i = queue.findIndex((q) => q.sfx);
      if (i < 0) queue.push(job);
      else queue.splice(i, 0, job);
    }
    ensureWorker();
    pump();
  });
}

function ensureWorker(): void {
  if (worker || poolFailed || !audioPoolActive()) return;
  try {
    worker = new Worker(new URL('./audioworker.ts', import.meta.url), { type: 'module' });
  } catch {
    poolFailed = true;
    worker = null;
    failAll(new Error('audio worker spawn failed'));
    return;
  }
  worker.onmessage = (e: MessageEvent<ResultMsg>) => onResult(e.data);
  worker.onerror = () => workerDead(new Error('audio worker error'));
  worker.onmessageerror = () => workerDead(new Error('audio worker message error'));
}

function onResult(msg: ResultMsg): void {
  if (msg.t === 'ready') {
    pump();
    return;
  }
  const job = inflight;
  inflight = null;
  if (msg.t === 'result' && job && msg.id === job.msg.id) job.resolve(msg);
  else job?.reject(new Error(msg.message ?? 'audio render failed'));
  pump();
}

function pump(): void {
  if (!worker || inflight || !queue.length) return;
  inflight = queue.shift()!;
  worker.postMessage(inflight.msg);
}

function workerDead(err: unknown): void {
  poolFailed = true;
  try {
    worker?.terminate();
  } catch {
    /* ignore */
  }
  worker = null;
  failAll(err);
}

/** Reject every pending job; callers' catch paths re-render synchronously. */
function failAll(err: unknown): void {
  inflight?.reject(err);
  inflight = null;
  for (const job of queue.splice(0)) job.reject(err);
}
