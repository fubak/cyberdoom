/**
 * Registry of deterministic pixel-generation jobs. Every sprite frame and
 * wall/flat texture registers a closure keyed by a serializable id; the same
 * closure runs on the main thread, in a generation worker, or in tests. The
 * whole pipeline (paint → grain → pack) is seeded, so a key always produces
 * identical bytes. Workers return PackedPixels as transferable buffers; the
 * main thread only wraps them in DataTextures and uploads.
 */
import type { PackedPixels } from './pixel';

export type GenResult = PackedPixels;

export interface GenMeta {
  /** Set/namespace the frame belongs to — used for mission-priority reorder. */
  setId: string;
  /** Frames needed soonest (display frames, textures gating level build). */
  first: boolean;
}

export type GenJob = () => GenResult;

const jobs = new Map<string, GenJob>();
const metas = new Map<string, GenMeta>();

/** Register the generator for `key`. Idempotent; last registration wins. */
export function registerGenJob(key: string, meta: GenMeta, job: GenJob): void {
  jobs.set(key, job);
  metas.set(key, meta);
}

export function genJobMeta(key: string): GenMeta {
  return metas.get(key) ?? { setId: '', first: false };
}

export function hasGenJob(key: string): boolean {
  return jobs.has(key);
}

/** Run the job for `key` synchronously on the calling thread. */
export function runGenJob(key: string): GenResult {
  const job = jobs.get(key);
  if (!job) throw new Error(`no gen job: ${key}`);
  return job();
}

/** Pure queue reorder: priority sets' frames first, then remaining first-frames, then the rest. */
export function reorderLazyQueue<T extends { setId: string; first: boolean }>(queue: readonly T[], priority: readonly string[]): T[] {
  const pri = new Set(priority);
  return [
    ...queue.filter((f) => pri.has(f.setId)),
    ...queue.filter((f) => !pri.has(f.setId) && f.first),
    ...queue.filter((f) => !pri.has(f.setId) && !f.first),
  ];
}
