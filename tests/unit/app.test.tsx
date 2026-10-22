import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { repository as repo } from '../../src/data/repository'
import { stores } from '../../src/data/database'
import { localDate } from '../../src/core/dates'
import type { Backup } from '../../src/core/types'
const cloud = vi.hoisted(() => ({
  auth: undefined as ((user: { uid: string } | null) => void) | undefined,
  read: vi.fn(),
  freeze: vi.fn(),
}))
vi.mock('../../src/cloud/firebase', () => ({
  configured: true,
  watchAuth: (callback: typeof cloud.auth) => {
    cloud.auth = callback
    return () => {
      cloud.auth = undefined
    }
  },
  readLegacyCloud: cloud.read,
  freezeLegacyWrites: cloud.freeze,
  readLegacyWithCredentials: vi.fn(),
  login: vi.fn(),
  resetPassword: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('../../src/ui/useSync', () => ({
  useSync: () => ({ status: { message: '本地测试', state: 'local', pending: 0 }, retry: vi.fn() }),
}))
beforeEach(async () => {
  cloud.read.mockReset()
  cloud.freeze.mockReset()
  await repo.initialize({ records: [], settings: [], localStorage: null })
  const tx = (await repo.db).transaction(stores, 'readwrite')
  for (const store of stores) await tx.objectStore(store).clear()
  await tx.done
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
afterEach(cleanup)
async function start() {
  render(<App />)
  await screen.findByRole('heading', { name: '给自己一点水分。' })
  await waitFor(() => expect(cloud.auth).toBeTypeOf('function'))
}
async function account(uid: string) {
  await act(async () => {
    cloud.auth!({ uid })
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
it('binds a pending file read to the account that opened the picker', async () => {
  await repo.add('user:A', 100)
  await repo.add('user:B', 500)
  await start()
  await account('A')
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  fireEvent.click(screen.getByRole('button', { name: '导入 JSON 备份' }))
  const read = deferred<string>()
  const file = new File([''], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => read.promise })
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
  await account('B')
  await act(async () => {
    read.resolve(JSON.stringify(await repo.export('user:A')))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect((await repo.entries('user:B', localDate())).map((e) => e.amountMl)).toEqual([500])
})
it('clears an open editor on account change and preserves seconds when only amount changes', async () => {
  const time = Date.now() - 12345
  const id = await repo.add('user:A', 100, time)
  await start()
  await account('A')
  fireEvent.click(screen.getByRole('button', { name: '历史' }))
  fireEvent.click(await screen.findByRole('button', { name: '编辑 100 毫升记录' }))
  fireEvent.change(screen.getByLabelText('饮水量（ml）'), { target: { value: '350' } })
  fireEvent.click(screen.getByRole('button', { name: '确认保存' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await repo.entries('user:A', localDate())).find((e) => e.id === id)).toMatchObject({
    amountMl: 350,
    occurredAt: time,
  })
  fireEvent.click(await screen.findByRole('button', { name: '编辑 350 毫升记录' }))
  await account('B')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('discards late old-cloud preview after account switch', async () => {
  const read = deferred<Backup>()
  cloud.read.mockReturnValue(read.promise)
  await start()
  await account('A')
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  fireEvent.click(screen.getByRole('button', { name: '迁移此账号旧云记录' }))
  await waitFor(() => expect(cloud.read).toHaveBeenCalledWith('A'))
  await account('B')
  await act(async () => {
    read.resolve({ format: 'health-water', version: 3, exportedAt: '', entities: [] })
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('does not freeze old clients on preview cancellation or failed local import', async () => {
  cloud.read.mockResolvedValue({ format: 'health-water', version: 3, entities: [] })
  await start()
  await account('A')
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  fireEvent.click(screen.getByRole('button', { name: '迁移此账号旧云记录' }))
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button', { name: '关闭对话框' }))
  expect(await repo.setting('legacyFreezePending:user:A', false)).toBe(false)
  expect(cloud.freeze).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '迁移此账号旧云记录' }))
  await screen.findByRole('dialog')
  vi.spyOn(repo, 'importBackup').mockRejectedValueOnce(new Error('disk full'))
  fireEvent.click(screen.getByRole('button', { name: '导入并保留当前冲突版本' }))
  await screen.findByText('disk full')
  expect(await repo.setting('legacyFreezePending:user:A', false)).toBe(false)
  expect(cloud.freeze).not.toHaveBeenCalled()
})
