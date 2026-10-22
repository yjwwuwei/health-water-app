import type { IDBPTransaction } from 'idb'
import { localDate, positiveMl, shiftDate } from '../core/dates'
import type { Backup, Conflict, DaySummary, DrinkEntry, Entity, Profile, SyncOperation } from '../core/types'
import { isAccount } from '../core/types'
import { parseBackup, validateEntity } from '../core/validation'
import { openWaterDB, profileRange, stores, type WaterDB } from './database'
import { convertLegacy, readLegacy, type LegacySnapshot } from './migration'
type Tx = IDBPTransaction<WaterDB, typeof stores, 'readwrite'>
const keyFor = (p: Profile, date: string) => `${p}|${date}`
const sameContent = (a: Entity, b: Entity) =>
  JSON.stringify(validateEntity({ ...a, version: 1, updatedAt: 0 })) ===
  JSON.stringify(validateEntity({ ...b, version: 1, updatedAt: 0 }))
export class Repository {
  readonly db: ReturnType<typeof openWaterDB>
  private initPromise?: Promise<void>
  private listeners = new Set<() => void>()
  private channel?: BroadcastChannel
  constructor(name?: string) {
    this.db = openWaterDB(name)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(name ?? 'health-water-v3')
      this.channel.onmessage = () => this.emit(false)
    }
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit(broadcast = true) {
    this.listeners.forEach((fn) => fn())
    if (broadcast) this.channel?.postMessage('changed')
  }
  async close() {
    this.channel?.close()
    ;(await this.db).close()
  }
  initialize(snapshot?: LegacySnapshot): Promise<void> {
    return (this.initPromise ??= this.migrate(snapshot).catch((error) => {
      this.initPromise = undefined
      throw error
    }))
  }
  private async migrate(snapshot?: LegacySnapshot) {
    const db = await this.db
    if (await db.get('meta', 'migration-v3')) return
    const raw = snapshot ?? (await readLegacy())
    const { entities, differences } = convertLegacy(raw)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)))
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    )
    const tx = db.transaction(stores, 'readwrite')
    // A second tab may have completed migration while this tab read the old database.
    if (await tx.objectStore('meta').get('migration-v3')) {
      await tx.done
      return
    }
    await tx.objectStore('backups').put({ id: 'pre-v3', createdAt: Date.now(), payload: raw })
    for (const e of entities) await tx.objectStore('entities').put(e)
    for (const date of new Set(entities.map((e) => e.date))) await this.recalculate(tx, 'guest', date)
    await tx.objectStore('meta').put({ key: 'migration-differences', value: differences })
    await tx
      .objectStore('meta')
      .put({ key: 'migration-v3', value: { completedAt: Date.now(), count: entities.length, fingerprint } })
    await tx.done
    this.emit()
  }
  async setting<T>(key: string, fallback: T): Promise<T> {
    return ((await (await this.db).get('meta', key))?.value as T | undefined) ?? fallback
  }
  async setSetting(key: string, value: unknown) {
    await (await this.db).put('meta', { key, value })
    this.emit()
  }
  private async goalIn(tx: Tx, profile: Profile, date: string): Promise<number | null> {
    let c = await tx
      .objectStore('entities')
      .index('profile-kind-date')
      .openCursor(IDBKeyRange.bound([profile, 'goal', ''], [profile, 'goal', date]), 'prev')
    while (c?.value.deleted) c = await c.continue()
    return c?.value.amountMl ?? null
  }
  private async recalculate(tx: Tx, profile: Profile, date: string) {
    const entries = (await tx.objectStore('entities').index('profile-date').getAll([profile, date])).filter(
      (e) => !e.deleted && e.kind !== 'goal',
    )
    const day: DaySummary = {
      key: keyFor(profile, date),
      profile,
      date,
      totalMl: entries.reduce((n, e) => n + e.amountMl, 0),
      entryTotalMl: entries.filter((e) => e.kind === 'entry').reduce((n, e) => n + e.amountMl, 0),
      goalMl: await this.goalIn(tx, profile, date),
      entryCount: entries.filter((e) => e.kind === 'entry').length,
    }
    await tx.objectStore('days').put(day)
  }
  private async put(tx: Tx, entity: Entity, sync = true) {
    const e = validateEntity(entity)
    const before = await tx.objectStore('entities').get([e.profile, e.id])
    await tx.objectStore('entities').put(e)
    if (sync && isAccount(e.profile)) {
      const order = Number((await tx.objectStore('meta').get('operation-order'))?.value ?? 0) + 1
      await tx.objectStore('meta').put({ key: 'operation-order', value: order })
      await tx.objectStore('outbox').put({
        id: crypto.randomUUID(),
        order,
        profile: e.profile,
        entityId: e.id,
        baseVersion: before?.version ?? 0,
        entity: e,
        status: 'pending',
      })
    }
    await this.recalculate(tx, e.profile, e.date)
    if (before && before.date !== e.date) await this.recalculate(tx, e.profile, before.date)
    if (e.kind === 'goal') {
      const days = await tx
        .objectStore('days')
        .index('profile-date')
        .getAll(IDBKeyRange.bound([e.profile, e.date], [e.profile, '\uffff']))
      for (const day of days) await this.recalculate(tx, e.profile, day.date)
    }
  }
  async add(
    profile: Profile,
    amountMl: number,
    occurredAt = Date.now(),
    source: DrinkEntry['source'] = 'manual',
    id: string = crypto.randomUUID(),
  ): Promise<string> {
    positiveMl(amountMl)
    if (!Number.isFinite(occurredAt) || occurredAt < 0 || occurredAt > Date.now() + 60000)
      throw new Error('饮水时间不能在未来')
    const tx = (await this.db).transaction(stores, 'readwrite')
    if (!(await tx.objectStore('entities').get([profile, id]))) {
      await this.put(tx, {
        id,
        profile,
        kind: 'entry',
        amountMl,
        occurredAt,
        date: localDate(occurredAt),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source,
        version: 1,
        updatedAt: Date.now(),
        deleted: false,
      })
    }
    await tx.done
    this.emit()
    return id
  }
  async edit(profile: Profile, id: string, amountMl: number, occurredAt?: number) {
    positiveMl(amountMl)
    if (
      occurredAt !== undefined &&
      (!Number.isFinite(occurredAt) || occurredAt < 0 || occurredAt > Date.now() + 60000)
    )
      throw new Error('饮水时间无效')
    const tx = (await this.db).transaction(stores, 'readwrite')
    const e = await tx.objectStore('entities').get([profile, id])
    if (!e || e.deleted || e.kind === 'goal') {
      tx.abort()
      throw new Error('记录已不存在，请刷新后重试')
    }
    const next = { ...e, amountMl, version: e.version + 1, updatedAt: Date.now() }
    if (next.kind === 'entry' && occurredAt !== undefined && occurredAt !== next.occurredAt) {
      next.occurredAt = occurredAt
      next.date = localDate(occurredAt)
      next.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    }
    await this.put(tx, next)
    await tx.done
    this.emit()
  }
  async remove(profile: Profile, id: string) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    const e = await tx.objectStore('entities').get([profile, id])
    if (e && !e.deleted)
      await this.put(tx, { ...e, deleted: true, version: e.version + 1, updatedAt: Date.now() })
    await tx.done
    this.emit()
  }
  async setGoal(profile: Profile, amountMl: number, first = false) {
    positiveMl(amountMl)
    const date = first ? localDate() : shiftDate(localDate(), 1)
    const id = `goal-${date}`
    const tx = (await this.db).transaction(stores, 'readwrite')
    const before = await tx.objectStore('entities').get([profile, id])
    await this.put(tx, {
      id,
      profile,
      kind: 'goal',
      date,
      amountMl,
      version: (before?.version ?? 0) + 1,
      updatedAt: Date.now(),
      deleted: false,
    })
    await tx.done
    this.emit()
  }
  async goal(profile: Profile, date = localDate()) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    const goal = await this.goalIn(tx, profile, date)
    await tx.done
    return goal
  }
  async days(profile: Profile, start: string, end: string) {
    return (await this.db).getAllFromIndex(
      'days',
      'profile-date',
      IDBKeyRange.bound([profile, start], [profile, end]),
    )
  }
  async entries(profile: Profile, date: string) {
    return (await (await this.db).getAllFromIndex('entities', 'profile-date', [profile, date])).filter(
      (e) => e.kind !== 'goal' && !e.deleted,
    )
  }
  async all(profile: Profile) {
    return (await this.db).getAllFromIndex('entities', 'profile-date', profileRange(profile))
  }
  async export(profile: Profile): Promise<Backup> {
    return {
      format: 'health-water',
      version: 3,
      exportedAt: new Date().toISOString(),
      entities: await this.all(profile),
    }
  }
  async originalBackup() {
    return (await (await this.db).get('backups', 'pre-v3'))?.payload
  }
  async legacyDifferences() {
    return this.setting<string[]>('migration-differences', [])
  }
  async resolveLegacy(date: string, useLocalStorage: boolean) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    const raw = (await tx.objectStore('backups').get('pre-v3'))?.payload as LegacySnapshot
    if (useLocalStorage && raw.localStorage) {
      const amount = JSON.parse(raw.localStorage).records?.[date]
      const id = `legacy-local-${date}`
      const previous = await tx.objectStore('entities').get(['guest', id])
      if (amount === 0 && previous && !previous.deleted)
        await this.put(tx, {
          ...previous,
          deleted: true,
          version: previous.version + 1,
          updatedAt: Date.now(),
        })
      else if (typeof amount === 'number' && amount > 0) {
        await this.put(tx, {
          id,
          kind: 'legacy',
          profile: 'guest',
          date,
          originalDate: date,
          amountMl: amount,
          origin: 'v1-local-utc',
          version: (previous?.version ?? 0) + 1,
          updatedAt: Date.now(),
          deleted: previous?.deleted ?? false,
        })
      }
    }
    const differences = ((await tx.objectStore('meta').get('migration-differences'))?.value as string[]) ?? []
    await tx
      .objectStore('meta')
      .put({ key: 'migration-differences', value: differences.filter((d) => d !== date) })
    await tx.done
    this.emit()
  }
  async previewImport(profile: Profile, raw: string) {
    const backup = parseBackup(raw)
    const current = await this.all(profile)
    const byId = new Map(current.map((e) => [e.id, e]))
    const legacy = new Map(current.filter((e) => e.kind === 'legacy' && !e.deleted).map((e) => [e.date, e]))
    let added = 0,
      identical = 0,
      conflicts = 0
    for (const incoming of backup.entities) {
      const e = { ...incoming, profile }
      const existing = byId.get(e.id) ?? (e.kind === 'legacy' ? legacy.get(e.date) : undefined)
      if (!existing) added++
      else if (sameContent(existing, e)) identical++
      else conflicts++
    }
    return { added, identical, conflicts, total: backup.entities.length }
  }
  async importBackup(profile: Profile, raw: string, conflict: 'keep' | 'replace', freezeLegacyUid?: string) {
    if (freezeLegacyUid && profile !== `user:${freezeLegacyUid}`) throw new Error('旧云迁移必须导入原账号')
    const backup = parseBackup(raw)
    const tx = (await this.db).transaction(stores, 'readwrite')
    const existing = await tx.objectStore('entities').index('profile-date').getAll(profileRange(profile))
    await tx.objectStore('backups').put({
      id: `import-${crypto.randomUUID()}`,
      createdAt: Date.now(),
      payload: { before: existing, incoming: backup },
    })
    const legacy = new Map(existing.filter((e) => e.kind === 'legacy' && !e.deleted).map((e) => [e.date, e]))
    for (const input of backup.entities) {
      const e = validateEntity(input, profile)
      const byId = await tx.objectStore('entities').get([profile, e.id])
      const previous = byId ?? (e.kind === 'legacy' ? legacy.get(e.date) : undefined)
      // Tombstones are permanent. Restoring a drink requires an explicit new entry.
      if (previous?.deleted && !e.deleted) continue
      if (previous && (sameContent(previous, e) || conflict === 'keep')) continue
      if (previous && previous.id !== e.id)
        await this.put(tx, {
          ...previous,
          deleted: true,
          updatedAt: Date.now(),
          version: previous.version + 1,
        })
      await this.put(tx, { ...e, version: (byId?.version ?? 0) + 1, updatedAt: Date.now() })
      if (e.kind === 'legacy') legacy.set(e.date, e)
    }
    if (freezeLegacyUid)
      await tx.objectStore('meta').put({ key: `legacyFreezePending:${profile}`, value: true })
    await tx.done
    this.emit()
  }
  async pending(profile: Profile): Promise<SyncOperation[]> {
    return (await this.db).getAllFromIndex(
      'outbox',
      'profile-order',
      IDBKeyRange.bound([profile, 0], [profile, Number.MAX_SAFE_INTEGER]),
    )
  }
  async conflicts(profile: Profile) {
    return (await this.db).getAllFromIndex('conflicts', 'profile', profile)
  }
  async acknowledge(op: SyncOperation, remote: Entity) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    await tx.objectStore('outbox').delete(op.id)
    const remaining = await tx.objectStore('outbox').index('profile-entity').getAll([op.profile, op.entityId])
    if (!remaining.length) await this.put(tx, remote, false)
    await tx.done
    this.emit()
  }
  async receive(profile: Profile, entities: Entity[], cursor: number) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    for (const e of entities) {
      validateEntity(e)
      if (e.profile !== profile) {
        tx.abort()
        throw new Error('云数据账号不匹配')
      }
      if (!(await tx.objectStore('outbox').index('profile-entity').count([profile, e.id])))
        await this.put(tx, e, false)
    }
    await tx.objectStore('meta').put({ key: `cursor:${profile}`, value: cursor })
    await tx.done
    this.emit()
  }
  async markConflict(op: SyncOperation, remote: Entity) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    const local = (await tx.objectStore('entities').get([op.profile, op.entityId])) ?? op.entity
    const related = await tx.objectStore('outbox').index('profile-entity').getAll([op.profile, op.entityId])
    for (const item of related) await tx.objectStore('outbox').put({ ...item, status: 'conflict' })
    await tx
      .objectStore('conflicts')
      .put({ id: `${op.profile}|${op.entityId}`, profile: op.profile, local, remote })
    await tx.done
    this.emit()
  }
  async resolveConflict(conflict: Conflict, keepLocal: boolean) {
    const tx = (await this.db).transaction(stores, 'readwrite')
    const current = await tx.objectStore('conflicts').get(conflict.id)
    if (!current) {
      await tx.done
      return
    }
    const { profile, remote } = current
    const local = (await tx.objectStore('entities').get([profile, current.local.id])) ?? current.local
    const pending = await tx.objectStore('outbox').index('profile-entity').getAll([profile, local.id])
    for (const op of pending) await tx.objectStore('outbox').delete(op.id)
    await this.put(tx, remote, false)
    if (keepLocal && !remote.deleted)
      await this.put(tx, { ...local, version: remote.version + 1, updatedAt: Date.now() })
    await tx.objectStore('conflicts').delete(conflict.id)
    await tx.done
    this.emit()
  }
  async claimGuest(profile: Profile) {
    if (!isAccount(profile)) throw new Error('请先登录')
    await this.importBackup(profile, JSON.stringify(await this.export('guest')), 'keep')
    await this.setSetting(`claimed:${profile}`, true)
  }
  async claimCelebration(profile: Profile, date: string): Promise<boolean> {
    const db = await this.db
    const tx = db.transaction('meta', 'readwrite')
    const key = `celebrated:${profile}:${date}`
    if (await tx.store.get(key)) {
      await tx.done
      return false
    }
    await tx.store.put({ key, value: true })
    await tx.done
    return true
  }
}
export const repository = new Repository()
