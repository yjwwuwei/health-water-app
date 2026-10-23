import { openDB } from 'idb'
import { localDate, positiveMl, validDate } from '../core/dates'
import type { Entity } from '../core/types'
export interface LegacySnapshot {
  records: { date: string; amount: number }[]
  settings: { key: string; value: unknown }[]
  localStorage: string | null
}
export async function readLegacy(): Promise<LegacySnapshot> {
  let records: LegacySnapshot['records'] = [],
    settings: LegacySnapshot['settings'] = []
  const databases = indexedDB.databases ? await indexedDB.databases() : null
  if (!databases || databases.some((d) => d.name === 'health-water')) {
    try {
      const old = await openDB('health-water', undefined, {
        upgrade(_db, oldVersion, _newVersion, tx) {
          if (oldVersion === 0) tx.abort()
        },
      })
      if (old.objectStoreNames.contains('records')) records = await old.getAll('records')
      if (old.objectStoreNames.contains('settings')) settings = await old.getAll('settings')
      old.close()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    }
  }
  return { records, settings, localStorage: localStorage.getItem('waterData') }
}
export function convertLegacy(
  raw: LegacySnapshot,
  now = Date.now(),
): { entities: Entity[]; differences: string[]; pose: boolean } {
  const ls = raw.localStorage ? JSON.parse(raw.localStorage) : {}
  if (
    !ls ||
    typeof ls !== 'object' ||
    (ls.records !== undefined && (typeof ls.records !== 'object' || Array.isArray(ls.records)))
  )
    throw new Error('旧 localStorage 数据损坏；原文尚未删除')
  const amounts = new Map<string, number>()
  const differences: string[] = []
  for (const [date, amount] of Object.entries(ls.records ?? {})) {
    if (!validDate(date) || typeof amount !== 'number' || amount < 0)
      throw new Error(`旧记录格式异常：${date}`)
    if (amount > 0) positiveMl(amount)
    amounts.set(date, amount)
  }
  for (const { date, amount } of raw.records) {
    if (!validDate(date) || !Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount))
      throw new Error(`旧记录格式异常：${date}`)
    if (amount > 0) positiveMl(amount)
    if (amounts.has(date) && amounts.get(date) !== amount) differences.push(date)
    amounts.set(date, amount)
  }
  const base = { profile: 'guest' as const, version: 1, updatedAt: now, deleted: false }
  const entities: Entity[] = [...amounts]
    .filter(([, amount]) => amount > 0)
    .map(([date, amountMl]) => ({
      ...base,
      id: `legacy-local-${date}`,
      kind: 'legacy',
      date,
      originalDate: date,
      amountMl,
      origin: 'v2-local-utc',
    }))
  const goal = raw.settings.find((s) => s.key === 'goal')?.value ?? ls.goal ?? 2000
  positiveMl(Number(goal))
  entities.push({
    ...base,
    id: `goal-${localDate(now)}`,
    kind: 'goal',
    date: localDate(now),
    amountMl: Number(goal),
  })
  return {
    entities,
    differences,
    pose: Boolean(raw.settings.find((s) => s.key === 'checkInEnabled')?.value ?? ls.checkInEnabled ?? false),
  }
}
