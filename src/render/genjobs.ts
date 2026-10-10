/**
 * One import site that registers every built-in generation job. Called in the
 * worker at startup (genworker.ts); on the main thread the same job
 * registration happens as a side effect of buildTextures()/buildSprites().
 * Sprite sets registered later at module-load time (threat recolors, content
 * missions) register their own jobs through the same path.
 */
import { buildSprites } from './sprites';
import { buildTextures } from './textures';

export function registerAllGenJobs(): void {
  buildTextures(true);
  buildSprites(true);
}
