/**
 * Generation worker entry point (spawned by genpool.ts via Vite's
 * `new Worker(new URL('./genworker.ts', import.meta.url), { type: 'module' })`).
 * Registers the same gen jobs the main thread would, then answers {t:'gen',key}
 * messages with the packed pixels as transferable buffers.
 *
 * paintRaw()/the font glyph caches call document.createElement('canvas'); in a
 * worker there is no DOM, so we shim it to OffscreenCanvas — the tiny 2D API
 * surface the painters use (fillRect/getImageData/drawImage/setTransform) is
 * identical.
 */
import { runGenJob } from './gen';
import { registerAllGenJobs } from './genjobs';

const g = globalThis as { document?: { createElement: (tag: string) => unknown } };
if (!g.document) {
  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`gen worker cannot create <${tag}>`);
      return new OffscreenCanvas(0, 0);
    },
  };
}

registerAllGenJobs();

const scope = self as unknown as {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<{ t: 'gen'; key: string }>) => void) | null;
};

scope.onmessage = (e) => {
  if (e.data.t !== 'gen') return;
  const key = e.data.key;
  try {
    const res = runGenJob(key);
    scope.postMessage({ t: 'result', key, res }, [res.data.buffer, ...res.mipmaps.map((m) => m.data.buffer)]);
  } catch (err) {
    scope.postMessage({ t: 'fail', key, message: String(err) });
  }
};
scope.postMessage({ t: 'ready' });
