import { afterEach, expect, it } from 'vitest'
import { Repository } from '../../src/data/repository'
import { syncOnce, type Transport } from '../../src/cloud/sync'
import type { Entity, SyncOperation } from '../../src/core/types'
import { localDate } from '../../src/core/dates'
const opened: Repository[] = []
async function device() {
  const r = new Repository(`sync-${crypto.randomUUID()}`)
  opened.push(r)
  await r.initialize({ records: [], settings: [], localStorage: null })
  return r
}
afterEach(async () => {
  for (const r of opened.splice(0)) await r.close()
})
class Server implements Transport {
  seq = 0
  data = new Map<string, { entity: Entity; seq: number }>()
  receipts = new Set<string>()
  writes = 0
  loseResponse = false
  async head() {
    return this.seq
  }
  async changes(after: number, through: number) {
    return {
      entities: [...this.data.values()].filter((v) => v.seq > after && v.seq <= through).map((v) => v.entity),
      cursor: through,
    }
  }
  async commit(op: SyncOperation) {
    const previous = this.data.get(op.entityId)?.entity
    if (this.receipts.has(op.id)) return { kind: 'applied' as const, entity: previous! }
    if (previous && (previous.deleted || (previous.version !== op.baseVersion && !op.entity.deleted)))
      return { kind: 'conflict' as const, entity: previous }
    const entity = { ...op.entity, version: (previous?.version ?? 0) + 1 }
    this.data.set(entity.id, { entity, seq: ++this.seq })
    this.receipts.add(op.id)
    this.writes += 3
    if (this.loseResponse) {
      this.loseResponse = false
      throw new Error('connection dropped after commit')
    }
    return { kind: 'applied' as const, entity }
  }
}
it('merges independent offline records; retries a lost response without duplication', async () => {
  const a = await device(),
    b = await device(),
    server = new Server()
  await a.add('user:A', 100)
  await b.add('user:A', 500)
  server.loseResponse = true
  await expect(syncOnce(a, 'user:A', server)).rejects.toThrow('dropped')
  await syncOnce(a, 'user:A', server)
  await syncOnce(b, 'user:A', server)
  await syncOnce(a, 'user:A', server)
  expect(server.writes).toBe(6)
  expect((await a.days('user:A', localDate(), localDate()))[0].totalMl).toBe(600)
  expect((await b.days('user:A', localDate(), localDate()))[0].totalMl).toBe(600)
})
it('keeps an edit made after the conflict appeared', async () => {
  const a = await device(),
    b = await device(),
    server = new Server()
  const id = await a.add('user:A', 100)
  await syncOnce(a, 'user:A', server)
  await syncOnce(b, 'user:A', server)
  await a.edit('user:A', id, 300)
  await b.edit('user:A', id, 200)
  await syncOnce(a, 'user:A', server)
  await syncOnce(b, 'user:A', server)
  const conflict = (await b.conflicts('user:A'))[0]
  expect(conflict.local.amountMl).toBe(200)
  await b.edit('user:A', id, 400)
  await b.resolveConflict(conflict, true)
  await syncOnce(b, 'user:A', server)
  await syncOnce(a, 'user:A', server)
  expect((await a.entries('user:A', localDate()))[0].amountMl).toBe(400)
})
it('does not resurrect a deleted record after a stale device edits it', async () => {
  const a = await device(),
    b = await device(),
    server = new Server()
  const id = await a.add('user:A', 100)
  await syncOnce(a, 'user:A', server)
  await syncOnce(b, 'user:A', server)
  await a.remove('user:A', id)
  await b.edit('user:A', id, 500)
  await syncOnce(a, 'user:A', server)
  await syncOnce(b, 'user:A', server)
  const c = (await b.conflicts('user:A'))[0]
  expect(c.remote.deleted).toBe(true)
  await b.resolveConflict(c, true)
  expect(await b.entries('user:A', localDate())).toEqual([])
})
it('does not apply a late response after the account session ends', async () => {
  const a = await device(),
    server = new Server()
  await a.add('user:A', 100)
  let active = true
  const wrapper: Transport = {
    head: () => server.head(),
    changes: (a, b) => server.changes(a, b),
    commit: async (op) => {
      const result = await server.commit(op)
      active = false
      return result
    },
  }
  await syncOnce(a, 'user:A', wrapper, () => active)
  expect(await a.pending('user:A')).toHaveLength(1)
  expect(await a.entries('user:B', localDate())).toEqual([])
  await syncOnce(a, 'user:A', server)
  expect(await a.pending('user:A')).toHaveLength(0)
})
