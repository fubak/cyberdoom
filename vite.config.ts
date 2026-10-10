import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    // The game is one entry point whose code is all needed for the first
    // playable frame; splitting it would only add round-trips before deploy.
    // The sprite/texture generation workers split out separately and load
    // lazily, so warn only if the main chunk keeps growing past ~1.1 MB.
    chunkSizeWarningLimit: 1100,
  },
});
