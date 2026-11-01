import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-support/setup.ts'],
    include: ['src/**/*.component.test.{ts,tsx}'],
    sequence: {
      concurrent: false,
    },
  },
})
