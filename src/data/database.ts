import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Conflict, DaySummary, Entity, SyncOperation } from '../core/types'
export interface WaterDB extends DBSchema {
  entities: {
    key: [string, string]
    value: Entity
    indexes: {
      'profile-date': [string, string]
      'profile-kind': [string, string]
      'profile-kind-date': [string, string, string]
    }
  }
  days: { key: string; value: DaySummary; indexes: { 'profile-date': [string, string] } }
  meta: { key: string; value: { key: string; value: unknown } }
  backups: { key: string; value: { id: string; createdAt: number; payload: unknown } }
  outbox: {
    key: string
    value: SyncOperation
    indexes: { 'profile-order': [string, number]; 'profile-entity': [string, string] }
  }
  conflicts: { key: string; value: Conflict; indexes: { profile: string } }
}
export const stores = ['entities', 'days', 'meta', 'backups', 'outbox', 'conflicts'] as const
export function openWaterDB(name = 'health-water-v3'): Promise<IDBPDatabase<WaterDB>> {
  return openDB<WaterDB>(name, 1, {
    upgrade(db) {
      const e = db.createObjectStore('entities', { keyPath: ['profile', 'id'] })
      e.createIndex('profile-date', ['profile', 'date'])
      e.createIndex('profile-kind', ['profile', 'kind'])
      e.createIndex('profile-kind-date', ['profile', 'kind', 'date'])
      db.createObjectStore('days', { keyPath: 'key' }).createIndex('profile-date', ['profile', 'date'])
      db.createObjectStore('meta', { keyPath: 'key' })
      db.createObjectStore('backups', { keyPath: 'id' })
      const o = db.createObjectStore('outbox', { keyPath: 'id' })
      o.createIndex('profile-order', ['profile', 'order'])
      o.createIndex('profile-entity', ['profile', 'entityId'])
      db.createObjectStore('conflicts', { keyPath: 'id' }).createIndex('profile', 'profile')
    },
  })
}
export const profileRange = (profile: string) => IDBKeyRange.bound([profile, ''], [profile, '\uffff'])
