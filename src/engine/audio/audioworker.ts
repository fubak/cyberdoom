/**
 * Audio render worker (spawned by audiopool.ts via Vite's
 * `new Worker(new URL('./audioworker.ts', import.meta.url), { type: 'module' })`).
 * Runs the deterministic render graph — songs, stings, and SFX recipe
 * buffers — off the main thread and posts the Float32Arrays back as
 * transferable buffers, so title/briefing/Deploy/death never stall on a
 * synchronous render.
 */
import { renderSong, renderSting } from './render';
import { renderSfx, type SfxVariant } from './sfxdef';
import { SONGS } from './songs';
import type { MusicLayer } from './sequencer';

export type AudioRenderJob =
  | { t: 'song'; id: number; tier: string; sr: number; seed: number }
  | { t: 'sting'; id: number; name: string; sr: number; seed: number }
  | { t: 'sfx'; id: number; name: string; sr: number; gender: SfxVariant; variant: number };

const scope = self as unknown as {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<AudioRenderJob>) => void) | null;
};

scope.onmessage = (e) => {
  const job = e.data;
  try {
    if (job.t === 'song') {
      const song = SONGS[job.tier as keyof typeof SONGS];
      if (!song) throw new Error(`unknown tier ${job.tier}`);
      const layers = renderSong(song, job.sr, job.seed) as Record<MusicLayer, Float32Array>;
      scope.postMessage(
        { t: 'result', id: job.id, song: layers },
        [layers.bed.buffer, layers.threat.buffer, layers.combat.buffer],
      );
    } else {
      const data =
        job.t === 'sting'
          ? renderSting(job.name, job.sr, job.seed)
          : renderSfx(job.name, job.sr, job.gender, job.variant);
      if (!data) throw new Error(`unknown ${job.t} ${job.name}`);
      scope.postMessage({ t: 'result', id: job.id, data }, [data.buffer]);
    }
  } catch (err) {
    scope.postMessage({ t: 'fail', id: job.id, message: String(err) });
  }
};
scope.postMessage({ t: 'ready' });
