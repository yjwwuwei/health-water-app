import { defineConfig } from 'vitest/config'
export default defineConfig({
  define: { __CLOUD_ENABLED__: 'true' },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
  },
})
