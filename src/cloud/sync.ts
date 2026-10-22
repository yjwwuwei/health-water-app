import type { Entity, Profile, SyncOperation } from '../core/types'
import type { Repository } from '../data/repository'
export interface Transport {
  head(): Promise<number>
  changes(after: number, through: number): Promise<{ entities: Entity[]; cursor: number }>
  commit(op: SyncOperation): Promise<{ kind: 'applied' | 'conflict'; entity: Entity }>
}
export interface SyncStatus {
  state: 'local' | 'pending' | 'syncing' | 'synced' | 'error' | 'conflict'
  message: string
  pending: number
}
export async function syncOnce(
  repo: Repository,
  profile: Profile,
  transport: Transport,
  active: () => boolean = () => true,
) {
  const pull = async () => {
    const head = await transport.head()
    let cursor = await repo.setting(`cursor:${profile}`, 0)
    while (active() && cursor < head) {
      const page = await transport.changes(cursor, head)
      if (!active()) return
      if (page.cursor <= cursor) throw new Error('云端分页游标没有前进')
      await repo.receive(profile, page.entities, page.cursor)
      cursor = page.cursor
    }
  }
  await pull()
  const operations = await repo.pending(profile)
  const blocked = new Set(operations.filter((o) => o.status === 'conflict').map((o) => o.entityId))
  for (const op of operations) {
    if (!active()) return
    if (blocked.has(op.entityId)) continue
    const result = await transport.commit(op)
    if (!active()) return
    if (result.kind === 'conflict') {
      await repo.markConflict(op, result.entity)
      blocked.add(op.entityId)
    } else await repo.acknowledge(op, result.entity)
  }
  if (active()) await pull()
}
