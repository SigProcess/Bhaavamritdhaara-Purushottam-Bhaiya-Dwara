import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.property.test.{ts,tsx}'],
    sequence: {
      concurrent: false,
    },
  },
})
