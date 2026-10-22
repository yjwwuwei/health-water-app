import { useEffect, useState } from 'react'
import type { Profile } from '../core/types'
import { repository } from '../data/repository'
import { syncOnce, type SyncStatus } from '../cloud/sync'
export function useSync(profile: Profile, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{ profile: Profile; status: SyncStatus }>({
    profile: 'guest',
    status: { state: 'local', message: '已保存在此设备', pending: 0 },
  })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled || profile === 'guest') return
    let active = true,
      running = false,
      failures = 0
    const setStatus = (status: SyncStatus) => {
      if (active) setSnapshot({ profile, status })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (delay = 800) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, delay)
    }
    const run = async () => {
      if (!active || running || document.visibilityState !== 'visible') return
      running = true
      try {
        const pending = (await repository.pending(profile)).length
        if (!navigator.onLine) {
          setStatus({ state: 'pending', pending, message: `离线，${pending} 项等待同步` })
          return
        }
        setStatus({ state: 'syncing', pending, message: '正在同步' })
        const cloud = await import('../cloud/firebase')
        if (!active) return
        if (await repository.setting(`legacyFreezePending:${profile}`, false)) {
          if (!active) return
          await cloud.freezeLegacyWrites(profile.slice(5))
          await repository.setSetting(`legacyFreezePending:${profile}`, false)
        }
        await syncOnce(repository, profile, cloud.transportFor(profile.slice(5)), () => active)
        if (!active) return
        const left = await repository.pending(profile)
        const conflicts = await repository.conflicts(profile)
        if (conflicts.length)
          setStatus({
            state: 'conflict',
            pending: left.length,
            message: `${conflicts.length} 条记录需要处理冲突`,
          })
        else if (left.length) {
          setStatus({ state: 'pending', pending: left.length, message: `${left.length} 项等待同步` })
          schedule()
        } else {
          setStatus({ state: 'synced', pending: 0, message: '已同步到云端' })
          const board = await repository.setting(`board:${profile}`, { enabled: false, nickname: '' })
          if (active && board.enabled) {
            try {
              await cloud.publishSummary(repository, profile.slice(5), board.nickname, true)
            } catch {
              if (active)
                setStatus({ state: 'synced', pending: 0, message: '记录已同步；榜单更新失败，可重试' })
            }
          }
        }
        failures = 0
      } catch (error) {
        if (active) {
          setStatus({
            state: 'error',
            pending: (await repository.pending(profile)).length,
            message: error instanceof Error ? error.message : '同步失败，本地记录已保留',
          })
          schedule(Math.min(3600000, 5000 * 2 ** failures++))
        }
      } finally {
        running = false
      }
    }
    const unsubscribe = repository.subscribe(() => {
      void Promise.all([
        repository.pending(profile),
        repository.setting(`legacyFreezePending:${profile}`, false),
      ]).then(([ops, freeze]) => {
        if (active && !running && (freeze || ops.some((o) => o.status === 'pending'))) schedule()
      })
    })
    const focus = () => {
      if (document.visibilityState === 'visible') schedule(0)
    }
    window.addEventListener('online', focus)
    document.addEventListener('visibilitychange', focus)
    const interval = setInterval(focus, 300000)
    schedule(0)
    return () => {
      active = false
      unsubscribe()
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('online', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [profile, enabled, retry])
  return {
    status:
      enabled && profile !== 'guest'
        ? snapshot.profile === profile
          ? snapshot.status
          : { state: 'pending' as const, pending: 0, message: '正在检查此账号的同步队列' }
        : { state: 'local' as const, pending: 0, message: '已保存在此设备' },
    retry: () => setRetry((n) => n + 1),
  }
}
