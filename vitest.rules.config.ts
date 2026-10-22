import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20000,
  },
})
