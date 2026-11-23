import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    // Everything is needed for the first playable frame, so chunks are split
    // for caching, not lazy loading: three.js and the mission/curriculum
    // content change on different cadences from the engine, and the browser
    // fetches the parallel chunks over one connection.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-three', test: /node_modules[\\/]three[\\/]/, priority: 20 },
            { name: 'content', test: /[\\/]src[\\/](content|curriculum)[\\/]/, priority: 10 },
            { name: 'render', test: /[\\/]src[\\/]render[\\/]/, priority: 5 },
          ],
        },
      },
    },
  },
});
