import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'src/shared/__tests__/**/*.test.ts',
    ],
    environment: 'happy-dom',
    setupFiles: ['src/__tests__/setup.ts'],
    alias: {
      // was src/renderer/src — a directory that has never existed (F0 housekeeping)
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
})
