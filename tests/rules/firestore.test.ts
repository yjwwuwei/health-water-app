import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  limit,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { transportFor, publishSummary } from '../../src/cloud/firebase'
import { Repository } from '../../src/data/repository'
import 'fake-indexeddb/auto'
import type { SyncOperation } from '../../src/core/types'
import { syncOnce } from '../../src/cloud/sync'
import { localDate } from '../../src/core/dates'
let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-health-water',
    firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync('firestore.rules', 'utf8') },
  })
})
beforeEach(() => env.clearFirestore())
afterAll(() => env.cleanup())
const db = (uid?: string) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore
function operation(): SyncOperation {
  return {
    id: 'op-1',
    order: 1,
    profile: 'user:A',
    entityId: 'entry-1',
    baseVersion: 0,
    status: 'pending',
    entity: {
      id: 'entry-1',
      profile: 'user:A',
      kind: 'entry',
      version: 1,
      updatedAt: Date.now(),
      deleted: false,
      date: '2026-10-22',
      occurredAt: Date.parse('2026-10-22T01:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      source: 'manual',
      amountMl: 250,
    },
  }
}
describe('private records and idempotent writes', () => {
  it('allows own transaction and denies anonymous/cross-account access', async () => {
    const transport = transportFor('A', db('A'))
    const op = operation()
    expect((await transport.commit(op)).kind).toBe('applied')
    await transport.commit(op)
    expect(await transport.head()).toBe(1)
    await assertSucceeds(getDoc(doc(db('A'), 'accounts/A/entities/entry-1')))
    await assertFails(getDoc(doc(db('B'), 'accounts/A/entities/entry-1')))
    await assertFails(getDoc(doc(db(), 'accounts/A/entities/entry-1')))
    await assertFails(deleteDoc(doc(db('A'), 'accounts/A/entities/entry-1')))
  })
  it('rejects unknown private fields and direct writes without sequence transaction', async () => {
    await assertFails(
      setDoc(doc(db('A'), 'accounts/A/entities/entry-1'), {
        ...operation().entity,
        changeSeq: 1,
        email: 'private@example.com',
      }),
    )
    const client = db('A')
    const batch = writeBatch(client)
    batch.set(doc(client, 'accounts/A'), { seq: 1 })
    batch.set(doc(client, 'accounts/A/entities/entry-1'), {
      ...operation().entity,
      amountMl: -1,
      changeSeq: 1,
    })
    await assertFails(batch.commit())
  })
  it('freezes old writes after migration while keeping owner reads', async () => {
    const legacy = doc(db('A'), 'users/A/records/2026-10-22')
    await assertSucceeds(setDoc(legacy, { date: '2026-10-22', amount: 100, updatedAt: serverTimestamp() }))
    await assertSucceeds(setDoc(doc(db('A'), 'accounts/A'), { migrated: true }, { merge: true }))
    await assertFails(setDoc(legacy, { date: '2026-10-22', amount: 500, updatedAt: serverTimestamp() }))
    await assertSucceeds(getDoc(legacy))
    await assertFails(getDoc(doc(db('B'), 'users/A/records/2026-10-22')))
  })
  it('synchronizes two independent databases with conflicts, deletion and idempotent retries', async () => {
    const a = new Repository(`emulator-A-${crypto.randomUUID()}`),
      b = new Repository(`emulator-B-${crypto.randomUUID()}`)
    const transport = transportFor('A', db('A'))
    try {
      const id = await a.add('user:A', 100)
      await b.add('user:A', 500)
      await syncOnce(a, 'user:A', transport)
      await syncOnce(b, 'user:A', transport)
      await syncOnce(a, 'user:A', transport)
      expect((await a.days('user:A', localDate(), localDate()))[0].totalMl).toBe(600)
      await a.edit('user:A', id, 200)
      await b.edit('user:A', id, 300)
      await syncOnce(a, 'user:A', transport)
      await syncOnce(b, 'user:A', transport)
      expect(await b.conflicts('user:A')).toHaveLength(1)
      await b.resolveConflict((await b.conflicts('user:A'))[0], true)
      await syncOnce(b, 'user:A', transport)
      await syncOnce(a, 'user:A', transport)
      expect((await a.entries('user:A', localDate())).find((e) => e.id === id)?.amountMl).toBe(300)
      await a.remove('user:A', id)
      await b.edit('user:A', id, 400)
      await syncOnce(a, 'user:A', transport)
      await syncOnce(b, 'user:A', transport)
      await b.resolveConflict((await b.conflicts('user:A'))[0], false)
      expect((await b.days('user:A', localDate(), localDate()))[0].totalMl).toBe(500)
    } finally {
      await a.close()
      await b.close()
    }
  })
})
describe('public summaries', () => {
  const summary = () => ({
    nickname: '小水滴',
    weekStart: '2026-10-19',
    monthStart: '2026-10-01',
    weekDays: 3,
    monthDays: 10,
    updatedAt: serverTimestamp(),
  })
  it('allows bounded self-reported summaries, denies private fields and forged ownership', async () => {
    await setDoc(doc(db('A'), 'accounts/A/preferences/leaderboard'), { enabled: true, nickname: '小水滴' })
    await assertSucceeds(setDoc(doc(db('A'), 'leaderboard/A'), summary()))
    await assertFails(setDoc(doc(db('B'), 'leaderboard/A'), summary()))
    await assertFails(setDoc(doc(db('A'), 'leaderboard/A'), { ...summary(), weekDays: 8 }))
    await assertFails(setDoc(doc(db('A'), 'leaderboard/A'), { ...summary(), email: 'secret@example.com' }))
    await assertFails(getDocs(collection(db('A'), 'leaderboard')))
    await assertSucceeds(getDocs(query(collection(db('B'), 'leaderboard'), limit(20))))
    await assertFails(getDocs(query(collection(db(), 'leaderboard'), limit(20))))
    await assertSucceeds(deleteDoc(doc(db('A'), 'leaderboard/A')))
  })
  it('honors opt-out across devices and permits explicit rejoin with unchanged totals', async () => {
    const first = new Repository(`board-first-${crypto.randomUUID()}`),
      second = new Repository(`board-second-${crypto.randomUUID()}`)
    try {
      await publishSummary(first, 'A', '小水滴', true, true, db('A'))
      await publishSummary(second, 'A', '小水滴', true, false, db('A'))
      await publishSummary(first, 'A', '小水滴', false, true, db('A'))
      await publishSummary(second, 'A', '小水滴', true, false, db('A'))
      expect((await getDoc(doc(db('A'), 'leaderboard/A'))).exists()).toBe(false)
      expect(await second.setting('board:user:A', { enabled: true })).toMatchObject({ enabled: false })
      await publishSummary(first, 'A', '小水滴', true, true, db('A'))
      expect((await getDoc(doc(db('A'), 'leaderboard/A'))).exists()).toBe(true)
    } finally {
      await first.close()
      await second.close()
    }
  })
})
