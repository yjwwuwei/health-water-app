import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  drained: false,
  reload: vi.fn(),
  removed: vi.fn(),
  unregister: vi.fn(async () => true),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('../../src/data/repository', () => ({
  repository: {
    db: Promise.resolve({
      transaction: () => ({
        done: Promise.resolve().then(() => {
          mocks.drained = true
        }),
      }),
    }),
  },
}))
import { registerOffline } from '../../src/platform/offline'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})
it('retires the old native worker without deleting other caches and reloads after database writes drain', async () => {
  vi.stubEnv('PROD', true)
  vi.stubEnv('BASE_URL', '/')
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      getRegistrations: async () => [{ scope: 'https://localhost/', unregister: mocks.unregister }],
    },
  })
  vi.stubGlobal('location', {
    href: 'https://localhost/',
    reload: () => {
      expect(mocks.drained).toBe(true)
      mocks.reload()
    },
  })
  vi.stubGlobal('caches', {
    keys: async () => ['water-app-v1', 'health-water-v3-test', 'unrelated-cache'],
    delete: mocks.removed,
  })
  await registerOffline()
  expect(mocks.unregister).toHaveBeenCalledOnce()
  expect(mocks.reload).toHaveBeenCalledOnce()
  expect(mocks.removed.mock.calls.map(([key]) => key)).toEqual(['water-app-v1', 'health-water-v3-test'])
})
