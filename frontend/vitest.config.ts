import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/__tests__/**/*.test.{ts,tsx}', 'src/shared/__tests__/**/*.test.ts'],
    environmentMatchGlobs: [
      // .tsx component tests need a DOM environment
      ['src/__tests__/**/*.test.tsx', 'happy-dom'],
    ],
    setupFiles: ['src/__tests__/setup.ts'],
  },
})
