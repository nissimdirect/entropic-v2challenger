/**
 * Standalone Vite config for the P4.0 xyflow-gate spike.
 *
 * This file is NOT wired into the app's electron.vite.config.ts.
 * Run from frontend/spike/xyflow-gate with:
 *
 *   cd frontend && npx vite spike/xyflow-gate --config spike/xyflow-gate/vite.config.ts
 *
 * Or from repo root:
 *   cd frontend && npx vite spike/xyflow-gate --config spike/xyflow-gate/vite.config.ts --port 5199
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5199,
    open: true,
  },
});
