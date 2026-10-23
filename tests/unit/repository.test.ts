import { afterEach, describe, expect, it } from 'vitest'
import { Repository } from '../../src/data/repository'
import { localDate, shiftDate } from '../../src/core/dates'
import { convertLegacy } from '../../src/data/migration'
const opened: Repository[] = []
async function repo() {
  const r = new Repository(`test-${crypto.randomUUID()}`)
  opened.push(r)
  await r.initialize({ records: [], settings: [], localStorage: null })
  return r
}
afterEach(async () => {
  for (const r of opened.splice(0)) await r.close()
})
describe('local data invariants', () => {
  it('undo removes the actual record; rapid writes survive reopening', async () => {
    const r = await repo()
    await r.add('guest', 100)
    const id = await r.add('guest', 500)
    await r.remove('guest', id)
    await Promise.all(Array.from({ length: 20 }, () => r.add('guest', 10)))
    expect((await r.days('guest', localDate(), localDate()))[0].totalMl).toBe(300)
    const name = (await r.db).name
    const reopened = new Repository(name)
    opened.push(reopened)
    await reopened.initialize()
    expect((await reopened.days('guest', localDate(), localDate()))[0].totalMl).toBe(300)
  })
  it('retries an add idempotently and updates both days when editing', async () => {
    const r = await repo()
    const now = Date.now()
    const yesterday = now - 86400000
    const id = await r.add('guest', 250, now)
    await r.add('guest', 250, now, 'manual', id)
    await r.edit('guest', id, 500, yesterday)
    expect((await r.days('guest', localDate(now), localDate(now)))[0].totalMl).toBe(0)
    expect((await r.days('guest', localDate(yesterday), localDate(yesterday)))[0].totalMl).toBe(500)
  })
  it('keeps old summaries without inventing timestamps or old goals', async () => {
    const r = new Repository(`test-${crypto.randomUUID()}`)
    opened.push(r)
    const snapshot = {
      records: [{ date: '2020-01-02', amount: 1500 }],
      settings: [{ key: 'goal', value: 2300 }],
      localStorage: JSON.stringify({ records: { '2020-01-02': 1000 } }),
    }
    await r.initialize(snapshot)
    await r.initialize(snapshot)
    const day = (await r.days('guest', '2020-01-02', '2020-01-02'))[0]
    expect(day).toMatchObject({ totalMl: 1500, goalMl: null, entryCount: 0 })
    expect((await r.entries('guest', '2020-01-02'))[0]).not.toHaveProperty('occurredAt')
    expect(await r.originalBackup()).toEqual(snapshot)
    await r.resolveLegacy('2020-01-02', true)
    expect((await r.days('guest', '2020-01-02', '2020-01-02'))[0].totalMl).toBe(1000)
  })
  it('leaves a failed migration retryable', async () => {
    const r = new Repository(`test-${crypto.randomUUID()}`)
    opened.push(r)
    await expect(r.initialize({ records: [], settings: [], localStorage: '{bad' })).rejects.toThrow()
    expect(await r.setting('migration-v3', null)).toBeNull()
    await r.initialize({ records: [], settings: [], localStorage: null })
    expect(await r.setting('migration-v3', null)).not.toBeNull()
  })
  it('changes the next day goal without rewriting previous targets', async () => {
    const r = await repo()
    await r.add('guest', 100)
    await r.setGoal('guest', 1800)
    expect(await r.goal('guest')).toBe(2000)
    expect(await r.goal('guest', shiftDate(localDate(), 1))).toBe(1800)
  })
  it('isolates accounts and requires explicit import; repeat import adds nothing', async () => {
    const r = await repo()
    await r.add('guest', 250)
    await r.claimGuest('user:A')
    await r.claimGuest('user:A')
    expect((await r.days('user:A', localDate(), localDate()))[0].totalMl).toBe(250)
    expect(await r.entries('user:B', localDate())).toEqual([])
    expect((await r.pending('user:A')).length).toBe(2)
    expect(await r.pending('guest')).toEqual([])
  })
  it('reimporting the same data with replace does not create new sync operations', async () => {
    const r = await repo()
    await r.add('guest', 250)
    const raw = JSON.stringify(await r.export('guest'))
    await r.importBackup('user:A', raw, 'replace')
    const before = await r.pending('user:A')
    await r.importBackup('user:A', raw, 'replace')
    expect(await r.pending('user:A')).toEqual(before)
  })
  it('resolves multiple legacy discrepancies atomically under concurrent clicks', async () => {
    const r = new Repository(`test-${crypto.randomUUID()}`)
    opened.push(r)
    await r.initialize({
      records: [
        { date: '2020-01-01', amount: 100 },
        { date: '2020-01-02', amount: 200 },
      ],
      settings: [],
      localStorage: JSON.stringify({ records: { '2020-01-01': 300, '2020-01-02': 400 } }),
    })
    await Promise.all([r.resolveLegacy('2020-01-01', true), r.resolveLegacy('2020-01-02', true)])
    expect(await r.legacyDifferences()).toEqual([])
    expect((await r.days('guest', '2020-01-01', '2020-01-02')).map((day) => day.totalMl)).toEqual([300, 400])
  })
  it('rejects unknown backups without changing existing data', async () => {
    const r = await repo()
    await r.add('guest', 250)
    await expect(
      r.importBackup('guest', '{"format":"health-water","version":4,"entities":[]}', 'replace'),
    ).rejects.toThrow()
    expect((await r.days('guest', localDate(), localDate()))[0].totalMl).toBe(250)
  })
  it('does not resurrect tombstones even when importing an older backup with replace', async () => {
    const r = await repo()
    const id = await r.add('user:A', 250)
    const raw = JSON.stringify(await r.export('user:A'))
    await r.remove('user:A', id)
    await r.importBackup('user:A', raw, 'replace')
    expect(await r.entries('user:A', localDate())).toHaveLength(0)
    expect((await r.all('user:A')).find((e) => e.id === id)?.deleted).toBe(true)
  })
  it('does not let a legacy aggregate contribute to ranking achievement', async () => {
    const r = await repo()
    const entities = convertLegacy({
      records: [{ date: localDate(), amount: 2500 }],
      settings: [],
      localStorage: null,
    }).entities
    await r.importBackup('guest', JSON.stringify({ format: 'health-water', version: 3, entities }), 'keep')
    await r.add('guest', 100)
    expect((await r.days('guest', localDate(), localDate()))[0]).toMatchObject({
      totalMl: 2600,
      entryTotalMl: 100,
      entryCount: 1,
      goalMl: 2000,
    })
  })
  it('does not re-add legacy totals from another source for the same date', async () => {
    const r = await repo()
    const entities = convertLegacy({
      records: [{ date: '2020-01-02', amount: 1000 }],
      settings: [],
      localStorage: null,
    }).entities
    const raw = JSON.stringify({ format: 'health-water', version: 3, entities })
    await r.importBackup('guest', raw, 'keep')
    const second = JSON.stringify({
      format: 'health-water',
      version: 3,
      entities: entities
        .filter((e) => e.kind === 'legacy')
        .map((e) => ({ ...e, id: 'another-source', amountMl: 1500 })),
    })
    await r.importBackup('guest', second, 'keep')
    expect((await r.days('guest', '2020-01-02', '2020-01-02'))[0].totalMl).toBe(1000)
    await r.importBackup('guest', second, 'replace')
    expect((await r.days('guest', '2020-01-02', '2020-01-02'))[0].totalMl).toBe(1500)
  })
})
