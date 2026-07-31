import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
// QF5 (W1.5a owner walk): the welcome screen's version label was hardcoded
// to a stale "v3.0.0" (package.json is already at 4.0.0-alpha.1). Reading
// the version here and injecting it as a build-time constant means the
// renderer never hardcodes it again — it tracks future package.json bumps
// automatically. See src/renderer/env.d.ts for the __APP_VERSION__ ambient
// declaration and vitest.config.ts for the matching test-time define.
import pkg from './package.json'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'pop-out': resolve(__dirname, 'src/preload/pop-out.ts'),
        },
      },
    },
  },
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          'pop-out': resolve(__dirname, 'src/renderer/pop-out.html'),
        },
      },
    },
  },
})
