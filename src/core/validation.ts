import type { Backup, Entity, Profile } from './types'
import { localDate, positiveMl, validDate } from './dates'
export function validateEntity(value: unknown, profile?: Profile): Entity {
  if (!value || typeof value !== 'object') throw new Error('记录格式无效')
  const e = value as Entity
  if (
    !['entry', 'legacy', 'goal'].includes(e.kind) ||
    typeof e.id !== 'string' ||
    !e.id ||
    e.id.length > 250 ||
    e.id.includes('/') ||
    !validDate(e.date)
  )
    throw new Error('记录标识或日期无效')
  if (typeof e.profile !== 'string' || !/^(guest|user:[^/]+)$/.test(e.profile))
    throw new Error('资料归属无效')
  positiveMl(e.amountMl)
  if (
    !Number.isSafeInteger(e.version) ||
    e.version < 1 ||
    !Number.isSafeInteger(e.updatedAt) ||
    e.updatedAt < 0 ||
    typeof e.deleted !== 'boolean'
  )
    throw new Error('记录版本无效')
  if (e.kind === 'entry') {
    if (
      !Number.isSafeInteger(e.occurredAt) ||
      e.occurredAt < 0 ||
      !['manual', 'pose'].includes(e.source) ||
      typeof e.timeZone !== 'string' ||
      e.timeZone.length > 80
    )
      throw new Error('饮水时间或来源无效')
    try {
      new Intl.DateTimeFormat('en', { timeZone: e.timeZone }).format(e.occurredAt)
    } catch {
      throw new Error('时区无效')
    }
    if (localDate(e.occurredAt, e.timeZone) !== e.date) throw new Error('记录日期与保存时区不一致')
  }
  if (
    e.kind === 'legacy' &&
    (!validDate(e.originalDate) || typeof e.origin !== 'string' || e.origin.length > 300)
  )
    throw new Error('旧版汇总格式无效')
  if (e.kind === 'goal' && e.id !== `goal-${e.date}`) throw new Error('目标策略标识与生效日不一致')
  // Only known fields cross the persistence/cloud boundary.
  const base = {
    id: e.id,
    profile: profile ?? e.profile,
    kind: e.kind,
    version: e.version,
    updatedAt: e.updatedAt,
    deleted: e.deleted,
    date: e.date,
    amountMl: e.amountMl,
  }
  if (e.kind === 'entry')
    return { ...base, kind: 'entry', occurredAt: e.occurredAt, timeZone: e.timeZone, source: e.source }
  if (e.kind === 'legacy') return { ...base, kind: 'legacy', originalDate: e.originalDate, origin: e.origin }
  return { ...base, kind: 'goal' }
}
export function parseBackup(raw: string): Backup {
  const b = JSON.parse(raw) as Backup
  if (b?.format !== 'health-water' || b.version !== 3 || !Array.isArray(b.entities))
    throw new Error('不支持此备份格式，请使用 v3 JSON 备份')
  const entities = b.entities.map((e) => validateEntity(e))
  if (new Set(entities.map((e) => e.id)).size !== entities.length) throw new Error('备份包含重复记录 ID')
  return { format: 'health-water', version: 3, exportedAt: b.exportedAt, entities }
}
