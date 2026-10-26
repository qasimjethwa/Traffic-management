import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Base path
 * ---------
 * GitHub Pages serves a project site from https://USER.github.io/REPO/.
 * The deploy workflow sets VITE_BASE_PATH=/REPO/ automatically.
 * Locally (and for user/org sites served from the domain root) it falls back to "./",
 * a relative base that also works from any sub-directory because the app uses hash routing.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || './';
  return {
    base,
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            map: ['leaflet', 'react-leaflet'],
            charts: ['recharts'],
            motion: ['framer-motion'],
          },
        },
      },
    },
  };
});
