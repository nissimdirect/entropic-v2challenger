import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'src/shared/__tests__/**/*.test.ts',
    ],
    environment: 'happy-dom',
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
})
