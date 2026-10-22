export type Profile = 'guest' | `user:${string}`
export interface BaseEntity {
  id: string
  profile: Profile
  version: number
  updatedAt: number
  deleted: boolean
}
export interface DrinkEntry extends BaseEntity {
  kind: 'entry'
  amountMl: number
  occurredAt: number
  date: string
  timeZone: string
  source: 'manual' | 'pose'
}
export interface LegacyDaily extends BaseEntity {
  kind: 'legacy'
  amountMl: number
  date: string
  originalDate: string
  origin: string
}
export interface GoalPolicy extends BaseEntity {
  kind: 'goal'
  amountMl: number
  date: string
}
export type Entity = DrinkEntry | LegacyDaily | GoalPolicy
export interface DaySummary {
  key: string
  profile: Profile
  date: string
  totalMl: number
  entryTotalMl: number
  goalMl: number | null
  entryCount: number
}
export interface SyncOperation {
  id: string
  order: number
  profile: Profile
  entityId: string
  baseVersion: number
  entity: Entity
  status: 'pending' | 'conflict'
}
export interface Conflict {
  id: string
  profile: Profile
  local: Entity
  remote: Entity
}
export interface Backup {
  format: 'health-water'
  version: 3
  exportedAt: string
  entities: Entity[]
}
export interface ReminderConfig {
  enabled: boolean
  start: string
  end: string
  intervalMinutes: number
}
export const DEFAULT_REMINDER: ReminderConfig = {
  enabled: false,
  start: '09:00',
  end: '21:00',
  intervalMinutes: 90,
}
export const isAccount = (profile: Profile) => profile.startsWith('user:')
