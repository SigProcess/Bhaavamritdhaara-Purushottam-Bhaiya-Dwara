import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'src/**/*.property.test.{ts,tsx}',
      'src/**/*.component.test.{ts,tsx}',
    ],
    sequence: {
      concurrent: false,
    },
  },
})
