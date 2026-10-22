import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { dateRange, localDate, monthRange, shiftDate } from './core/dates'
import {
  DEFAULT_REMINDER,
  type Conflict,
  type DaySummary,
  type Entity,
  type Profile,
  type ReminderConfig,
} from './core/types'
import { repository as repo } from './data/repository'
import { readLegacy } from './data/migration'
import { configureReminders, nativeAndroid, reminderStatus, requestNotifications } from './platform/reminders'
import { saveJson } from './platform/files'
import { Modal } from './ui/Modal'
import { useSync } from './ui/useSync'
import './styles.css'
const PoseCheckin = lazy(() => import('./ui/PoseCheckin'))
const CloudPanel = lazy(() => import('./ui/CloudPanel'))
const Leaderboard = lazy(() => import('./ui/Leaderboard'))
type Tab = 'today' | 'history' | 'settings'
type ImportTarget = { profile: Profile; epoch: number }
type Editor = {
  entity?: Entity
  amount: string
  time: string
  originalTime?: string
  source: 'manual' | 'pose'
}
function inputTime(time = Date.now()) {
  const d = new Date(time)
  return `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : '操作未完成，请重试；已保存的数据仍保留'
}
function Drop({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" width={small ? 22 : 36} height={small ? 28 : 44} viewBox="0 0 32 40" fill="none">
      <path d="M16 2C12 10 3 18 3 25a13 13 0 0026 0C29 18 20 10 16 2Z" fill="currentColor" />
      <path d="M9 25a7 7 0 007 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
export default function App() {
  const [ready, setReady] = useState(false),
    [bootError, setBootError] = useState(''),
    [bootAttempt, setBootAttempt] = useState(0)
  const [profile, setProfile] = useState<Profile>('guest'),
    [tab, setTab] = useState<Tab>('today'),
    [today, setToday] = useState(localDate())
  const [selectedDate, setSelectedDate] = useState(localDate()),
    [month, setMonth] = useState(localDate().slice(0, 7))
  const [days, setDays] = useState<DaySummary[]>([]),
    [entries, setEntries] = useState<Entity[]>([]),
    [total, setTotal] = useState(0),
    [goal, setGoal] = useState<number | null>(null)
  const [goalInput, setGoalInput] = useState('2000'),
    [nextGoal, setNextGoal] = useState<number | null>(null)
  const [message, setMessage] = useState(''),
    [undo, setUndo] = useState<string>(),
    [editor, setEditor] = useState<Editor>(),
    [saving, setSaving] = useState(false)
  const [poseEnabled, setPoseEnabled] = useState(false),
    [poseOpen, setPoseOpen] = useState(false)
  const [reminders, setReminders] = useState<ReminderConfig>(DEFAULT_REMINDER),
    [reminderMessage, setReminderMessage] = useState('')
  const [resumeRevision, setResumeRevision] = useState(0)
  const [cloudDialog, setCloudDialog] = useState<{ kind: 'login' | 'legacy'; target: ImportTarget }>(),
    [boardOpen, setBoardOpen] = useState(false)
  const [board, setBoard] = useState({ enabled: false, nickname: '' }),
    [boardSaving, setBoardSaving] = useState(false)
  const [importData, setImportData] = useState<{
    raw: string
    target: ImportTarget
    freezeLegacyUid?: string
    preview: { added: number; identical: number; conflicts: number; total: number }
  }>()
  const [conflicts, setConflicts] = useState<Conflict[]>([]),
    [differences, setDifferences] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Entity>(),
    [claimOpen, setClaimOpen] = useState(false)
  const activeProfile = useRef(profile)
  const scope = useRef(0)
  const request = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileTarget = useRef<ImportTarget | null>(null)
  const sync = useSync(profile, __CLOUD_ENABLED__ && ready)
  const switchProfile = useCallback((next: Profile) => {
    if (activeProfile.current === next) return
    activeProfile.current = next
    scope.current++
    request.current++
    fileTarget.current = null
    setProfile(next)
    setDays([])
    setEntries([])
    setTotal(0)
    setGoal(null)
    setNextGoal(null)
    setGoalInput('2000')
    setUndo(undefined)
    setEditor(undefined)
    setSaving(false)
    setImportData(undefined)
    setDeleteTarget(undefined)
    setClaimOpen(false)
    setPoseOpen(false)
    setBoardOpen(false)
    setCloudDialog(undefined)
    setConflicts([])
    setBoard({ enabled: false, nickname: '' })
    setBoardSaving(false)
    setMessage('')
  }, [])
  const reload = useCallback(async () => {
    const serial = ++request.current
    const p = profile
    const [start, end] = monthRange(`${month}-01`)
    const [range, list, current, currentGoal, futureGoal, cfg, pose, boardCfg, cs, ds] = await Promise.all([
      repo.days(p, start, end),
      repo.entries(p, selectedDate),
      repo.days(p, today, today),
      repo.goal(p, today),
      repo.goal(p, shiftDate(today, 1)),
      repo.setting('reminders', DEFAULT_REMINDER),
      repo.setting('poseEnabled', false),
      repo.setting(`board:${p}`, { enabled: false, nickname: '' }),
      repo.conflicts(p),
      repo.legacyDifferences(),
    ])
    if (serial !== request.current || p !== activeProfile.current) return
    setDays(range)
    setEntries(list)
    setTotal(current[0]?.totalMl ?? 0)
    setGoal(currentGoal)
    setNextGoal(futureGoal)
    setReminders(cfg)
    setPoseEnabled(pose)
    setBoard(boardCfg)
    setConflicts(cs)
    setDifferences(ds)
  }, [profile, month, selectedDate, today])
  useEffect(() => {
    let active = true
    void repo
      .initialize()
      .then(() => {
        if (active) {
          setReady(true)
          setBootError('')
        }
      })
      .catch((e) => {
        if (active) setBootError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [bootAttempt])
  useEffect(() => {
    if (!ready) return
    const refresh = () => {
      void reload().catch((e) => setMessage(errorMessage(e)))
    }
    refresh()
    return repo.subscribe(refresh)
  }, [ready, reload])
  useEffect(() => {
    const tick = () => setToday(localDate())
    const resume = () => {
      if (document.visibilityState === 'visible') {
        tick()
        setResumeRevision((n) => n + 1)
      }
    }
    const timer = setInterval(tick, 15000)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [])
  useEffect(() => {
    if (!ready || !__CLOUD_ENABLED__) return
    let active = true
    let unsubscribe: (() => void) | undefined
    void import('./cloud/firebase')
      .then((cloud) => {
        if (active && cloud.configured)
          unsubscribe = cloud.watchAuth((user) => {
            if (active) switchProfile(user ? `user:${user.uid}` : 'guest')
          })
      })
      .catch((e) => {
        if (active) setMessage(errorMessage(e))
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [ready, switchProfile])
  useEffect(() => {
    if (!ready || !nativeAndroid) return
    let active = true
    void configureReminders(reminders, profile, goal !== null && total >= goal ? today : '')
      .then(() => reminderStatus())
      .then((s) => {
        if (active)
          setReminderMessage(
            s.permission !== 'granted' && reminders.enabled
              ? '系统通知未开启，请到系统设置允许通知'
              : s.enabled && s.nextAt
                ? `下次预计：${new Date(s.nextAt).toLocaleString('zh-CN')}`
                : '提醒已关闭',
          )
      })
      .catch((e) => {
        if (active) setReminderMessage(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [ready, reminders, profile, total, goal, today, resumeRevision])
  async function perform(action: (isCurrent: () => boolean) => Promise<unknown>, success?: string) {
    const epoch = scope.current
    const isCurrent = () => epoch === scope.current
    try {
      await action(isCurrent)
      if (isCurrent() && success) setMessage(success)
    } catch (e) {
      if (isCurrent()) setMessage(errorMessage(e))
    }
  }
  async function add(amount: number, time?: number, source: 'manual' | 'pose' = 'manual') {
    const p = profile
    const epoch = scope.current
    const before = total
    const id = await repo.add(p, amount, time, source)
    if (p !== activeProfile.current || epoch !== scope.current) return
    setUndo(id)
    setMessage(`已记录 ${amount} ml`)
    const day = (await repo.days(p, today, today))[0]
    if (
      day?.goalMl &&
      before < day.goalMl &&
      day.totalMl >= day.goalMl &&
      (await repo.claimCelebration(p, today)) &&
      epoch === scope.current
    )
      setMessage('今天的目标完成了。按照自己的节奏就好。')
  }
  function current(target: ImportTarget) {
    return target.profile === activeProfile.current && target.epoch === scope.current
  }
  function openCloud(kind: 'login' | 'legacy') {
    setCloudDialog({ kind, target: { profile, epoch: scope.current } })
  }
  async function preview(raw: string, target: ImportTarget, freezeLegacyUid?: string) {
    if (!current(target)) return
    const result = await repo.previewImport(target.profile, raw)
    if (current(target)) {
      setImportData({ raw, target, freezeLegacyUid, preview: result })
      setCloudDialog(undefined)
    }
  }
  async function applyImport(choice: 'keep' | 'replace') {
    if (!importData || !current(importData.target)) return
    const target = importData.target
    await repo.importBackup(target.profile, importData.raw, choice, importData.freezeLegacyUid)
    if (current(target)) setImportData(undefined)
  }
  async function importAccountLegacy() {
    const target = { profile, epoch: scope.current }
    const cloud = await import('./cloud/firebase')
    if (!current(target)) return
    const uid = target.profile.slice(5)
    const backup = await cloud.readLegacyCloud(uid)
    await preview(JSON.stringify(backup), target, uid)
  }
  async function updateReminders(next: ReminderConfig) {
    if (next.start >= next.end) throw new Error('清醒时段的结束时间需要晚于开始时间')
    if (next.enabled && !reminders.enabled) await requestNotifications()
    await configureReminders(next, profile, goal !== null && total >= goal ? today : '')
    await repo.setSetting('reminders', next)
  }
  async function saveEditor(e: React.FormEvent) {
    e.preventDefault()
    if (!editor || saving) return
    setSaving(true)
    const epoch = scope.current
    try {
      const amount = Number(editor.amount)
      const occurredAt = new Date(editor.time).getTime()
      if (editor.entity)
        await repo.edit(
          profile,
          editor.entity.id,
          amount,
          editor.entity.kind === 'entry' && editor.time !== editor.originalTime ? occurredAt : undefined,
        )
      else await add(amount, occurredAt, editor.source)
      if (epoch === scope.current) setEditor(undefined)
    } catch (error) {
      if (epoch === scope.current) setMessage(errorMessage(error))
    } finally {
      if (epoch === scope.current) setSaving(false)
    }
  }
  async function changeBoard(enabled: boolean) {
    const target = { profile, epoch: scope.current }
    setBoardSaving(true)
    try {
      const cloud = await import('./cloud/firebase')
      if (!current(target)) return
      if (enabled && (await repo.pending(profile)).length)
        throw new Error('请先完成记录同步和冲突处理，再加入榜单')
      if (!current(target)) return
      await cloud.publishSummary(repo, profile.slice(5), board.nickname, enabled, true)
      await repo.setSetting(`board:${profile}`, { ...board, enabled })
      if (current(target)) setMessage(enabled ? '已加入榜单' : '已退出榜单，公开摘要已删除')
    } catch (e) {
      if (current(target)) setMessage(errorMessage(e))
    } finally {
      if (current(target)) setBoardSaving(false)
    }
  }
  if (!ready)
    return (
      <main className="boot">
        <Drop />
        <h1>健康喝水</h1>
        {bootError ? (
          <>
            <p role="alert">{bootError}</p>
            <p>迁移尚未完成，旧数据没有删除。</p>
            <button onClick={() => setBootAttempt((n) => n + 1)}>重试读取</button>
            <button
              onClick={() => void perform(async () => saveJson('喝水-原始数据.json', await readLegacy()))}
            >
              导出原始数据
            </button>
          </>
        ) : (
          <p role="status">正在读取本地记录…</p>
        )}
      </main>
    )
  const percent = goal ? Math.min((total / goal) * 100, 100) : 0
  const selected = days.find((d) => d.date === selectedDate)
  const completedDays = days.filter((d) => d.goalMl && d.totalMl >= d.goalMl && d.entryCount > 0).length
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Drop small />
          </span>
          <div>
            <span className="eyebrow">A LITTLE, OFTEN</span>
            <strong>健康喝水</strong>
          </div>
        </div>
        <span className="local-badge">{profile === 'guest' ? '本地记录' : '我的云账户'}</span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {new Date(`${today}T12:00:00`).toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </p>
            <h1>
              {tab === 'today'
                ? '给自己一点水分。'
                : tab === 'history'
                  ? '每一小步，都算数。'
                  : '找到舒服的节奏。'}
            </h1>
          </div>
          <span className="edition">v{__CLOUD_ENABLED__ ? '3.1' : '3.0'}</span>
        </div>
        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button onClick={() => setMessage('')} aria-label="关闭提示">
              ×
            </button>
          </div>
        )}
        {differences.length > 0 && (
          <section className="card warning">
            <h2>旧数据有 {differences.length} 个日期需要核对</h2>
            <p>目前采用旧数据库中的汇总，另一份 localStorage 原文仍在备份中。</p>
            {differences.map((date) => (
              <div className="row" key={date}>
                <span>{date}</span>
                <button onClick={() => void perform(() => repo.resolveLegacy(date, false))}>保留当前</button>
                <button onClick={() => void perform(() => repo.resolveLegacy(date, true))}>采用另一份</button>
              </div>
            ))}
          </section>
        )}
        {tab === 'today' && (
          <>
            <section className="hero card">
              <div className="hero-copy">
                <p className="eyebrow">TODAY’S WATER</p>
                <h2>今天，慢慢来</h2>
                <p className="muted">少量多次，照顾自己的日常。</p>
                <div className="water-total">
                  <strong>{total.toLocaleString()}</strong>
                  <span>ml</span>
                </div>
                <p>
                  {goal ? (
                    <>
                      今日目标 <strong>{goal.toLocaleString()} ml</strong>
                    </>
                  ) : (
                    '在设置中选择适合自己的目标'
                  )}
                </p>
                <p className="progress-copy">
                  {goal && total >= goal
                    ? '今天的目标已完成 ✓'
                    : goal
                      ? `距离目标还有 ${Math.max(0, goal - total)} ml`
                      : '记录从现在开始'}
                </p>
              </div>
              <div className="water-visual" role="img" aria-label={`今日饮水进度 ${Math.round(percent)}%`}>
                <div className="water-fill" style={{ height: `${Math.max(7, percent)}%` }} />
                <div className="water-percent">
                  <Drop />
                  <strong>
                    {Math.round(percent)}
                    <small>%</small>
                  </strong>
                </div>
                <span className="glass-line" />
              </div>
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>刚刚喝了多少？</h2>
                <span className="caption">轻点一下，记下来</span>
              </div>
              <div className="quick-grid">
                {[100, 250, 500].map((amount, i) => (
                  <button className="quick-add" key={amount} onClick={() => void perform(() => add(amount))}>
                    <svg aria-hidden="true" width="32" height="36" viewBox="0 0 32 36">
                      <path
                        d={`M${7 - i} 5h${18 + i * 2}l-3 25H${10 - i}Z`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path d="M9 17h14l-1.5 11h-11Z" fill="currentColor" opacity=".25" />
                    </svg>
                    <strong>
                      + {amount}
                      <small> ml</small>
                    </strong>
                    <span>{['小口补水', '一杯刚好', '满满一瓶'][i]}</span>
                  </button>
                ))}
              </div>
              <button
                className="custom-add"
                onClick={() => setEditor({ amount: '', time: inputTime(), source: 'manual' })}
              >
                ＋ 自定义记录
              </button>
              {undo && (
                <button
                  className="text-button"
                  onClick={() =>
                    void perform(async (isCurrent) => {
                      await repo.remove(profile, undo)
                      if (isCurrent()) setUndo(undefined)
                    }, '已撤销刚才的记录')
                  }
                >
                  撤销刚才那一笔
                </button>
              )}
            </section>
            <div className="two-columns">
              <section className="card mini-card">
                <span className="small-icon">◷</span>
                <h2>规律一点，轻松一点</h2>
                <p>
                  {reminders.enabled
                    ? `${reminders.start}–${reminders.end} · 每 ${reminders.intervalMinutes} 分钟`
                    : '让温和的提醒，陪你养成习惯。'}
                </p>
                <button className="text-button" onClick={() => setTab('settings')}>
                  {reminders.enabled ? '调整提醒 →' : '设置提醒 →'}
                </button>
              </section>
              <section className="card mini-card">
                <span className="small-icon">↗</span>
                <h2>看看自己的足迹</h2>
                <p>查看每一笔记录，也可以补记和修改。</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setSelectedDate(today)
                    setMonth(today.slice(0, 7))
                    setTab('history')
                  }}
                >
                  打开历史 →
                </button>
              </section>
            </div>
            {poseEnabled && (
              <button className="card feature-link" onClick={() => setPoseOpen(true)}>
                <span>✧ 趣味姿势打卡</span>
                <span>试一试 →</span>
              </button>
            )}
          </>
        )}
        {tab === 'history' && (
          <>
            <section className="card">
              <div className="section-heading">
                <button
                  aria-label="上个月"
                  onClick={() => {
                    const d = shiftDate(`${month}-01`, -1)
                    setMonth(d.slice(0, 7))
                    setSelectedDate(d)
                  }}
                >
                  ‹
                </button>
                <h2>{month.replace('-', ' 年 ')} 月</h2>
                <button
                  aria-label="下个月"
                  disabled={month >= today.slice(0, 7)}
                  onClick={() => {
                    const d = shiftDate(monthRange(`${month}-01`)[1], 1)
                    setMonth(d.slice(0, 7))
                    setSelectedDate(d)
                  }}
                >
                  ›
                </button>
              </div>
              <p className="muted">
                已记录 {days.filter((d) => d.totalMl > 0).length} 天 · 达标 {completedDays} 天
              </p>
              <div className="calendar-labels">
                {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="calendar">
                {Array.from({ length: (new Date(`${month}-01T12:00:00`).getDay() + 6) % 7 }, (_, i) => (
                  <span key={`blank${i}`} />
                ))}
                {dateRange(...monthRange(`${month}-01`)).map((date) => {
                  const day = days.find((d) => d.date === date)
                  return (
                    <button
                      key={date}
                      disabled={date > today}
                      className={`${selectedDate === date ? 'selected' : ''} ${day?.totalMl ? 'has-record' : ''}`}
                      aria-label={`${date}，${day?.totalMl ?? 0} 毫升`}
                      aria-pressed={selectedDate === date}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      <small>{day?.totalMl ? day.totalMl : '·'}</small>
                    </button>
                  )
                })}
              </div>
            </section>
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>{selectedDate} 的记录</h2>
                  <p className="caption">
                    合计 {selected?.totalMl ?? 0} ml ·{' '}
                    {selected?.goalMl ? `当日目标 ${selected.goalMl} ml` : '当日目标未知'}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setEditor({
                      amount: '',
                      time: selectedDate === today ? inputTime() : `${selectedDate}T12:00`,
                      source: 'manual',
                    })
                  }
                >
                  ＋ 补记
                </button>
              </div>
              {!entries.length && (
                <div className="empty-state">
                  <Drop small />
                  <p>这一天还没有记录</p>
                  <span>想起喝过的一杯水？可以补记下来。</span>
                </div>
              )}
              <ul className="record-list">
                {entries
                  .sort(
                    (a, b) =>
                      (a.kind === 'entry' ? a.occurredAt : 0) - (b.kind === 'entry' ? b.occurredAt : 0),
                  )
                  .map((e) => (
                    <li key={e.id}>
                      <span className="record-dot" />
                      <div className="record-detail">
                        <strong>{e.amountMl} ml</strong>
                        <span>
                          {e.kind === 'entry'
                            ? `${new Date(e.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · ${e.source === 'pose' ? '趣味打卡' : '手动记录'}`
                            : '旧版汇总 · 原 UTC 日期，无逐笔时间'}
                        </span>
                      </div>
                      <button
                        aria-label={`编辑 ${e.amountMl} 毫升记录`}
                        onClick={() =>
                          setEditor({
                            entity: e,
                            amount: String(e.amountMl),
                            time: e.kind === 'entry' ? inputTime(e.occurredAt) : `${e.date}T12:00`,
                            originalTime: e.kind === 'entry' ? inputTime(e.occurredAt) : undefined,
                            source: 'manual',
                          })
                        }
                      >
                        编辑
                      </button>
                      <button
                        className="danger text-button"
                        aria-label={`删除 ${e.amountMl} 毫升记录`}
                        onClick={() => setDeleteTarget(e)}
                      >
                        删除
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          </>
        )}
        {tab === 'settings' && (
          <>
            <section className="card">
              <p className="eyebrow">YOUR RHYTHM</p>
              <h2>每天的饮水目标</h2>
              <p className="muted">这是个人记录目标，可以按自己的情况调整。</p>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void perform(
                    () => repo.setGoal(profile, Number(goalInput), goal === null),
                    goal === null ? '已设置目标' : '新目标将于明天生效',
                  )
                }}
              >
                <label>
                  目标（ml）
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    required
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                  />
                </label>
                <button className="primary">保存目标</button>
              </form>
              <p className="caption">
                今天 {goal ?? '未设置'} ml
                {nextGoal !== goal && nextGoal !== null
                  ? ` · 明天起 ${nextGoal} ml`
                  : ' · 修改从次日生效，历史保持原目标'}
              </p>
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>温和的提醒</h2>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-label="开启饮水提醒"
                    disabled={!nativeAndroid}
                    checked={reminders.enabled}
                    onChange={(e) =>
                      void perform(() => updateReminders({ ...reminders, enabled: e.target.checked }))
                    }
                  />
                  <span />
                </label>
              </div>
              <p className="muted">
                {nativeAndroid
                  ? '达标后今天不再提醒，明天自动恢复。系统节电可能使通知延迟。'
                  : '后台提醒在 Android 安装版中提供。网页版可以继续记录和查看历史。'}
              </p>
              <div className="reminder-fields">
                <label>
                  开始时间
                  <input
                    type="time"
                    disabled={!nativeAndroid}
                    value={reminders.start}
                    onChange={(e) =>
                      void perform(() => updateReminders({ ...reminders, start: e.target.value }))
                    }
                  />
                </label>
                <label>
                  结束时间
                  <input
                    type="time"
                    disabled={!nativeAndroid}
                    value={reminders.end}
                    onChange={(e) =>
                      void perform(() => updateReminders({ ...reminders, end: e.target.value }))
                    }
                  />
                </label>
                <label>
                  提醒间隔
                  <select
                    disabled={!nativeAndroid}
                    value={reminders.intervalMinutes}
                    onChange={(e) =>
                      void perform(() =>
                        updateReminders({ ...reminders, intervalMinutes: Number(e.target.value) }),
                      )
                    }
                  >
                    {[30, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} 分钟
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {reminderMessage && (
                <p role="status" className="caption">
                  {reminderMessage}
                </p>
              )}
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>趣味姿势打卡</h2>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-label="显示趣味姿势打卡"
                    checked={poseEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      setPoseEnabled(enabled)
                      void perform(async () => {
                        try {
                          await repo.setSetting('poseEnabled', enabled)
                        } catch (error) {
                          setPoseEnabled(!enabled)
                          throw error
                        }
                      })
                    }}
                  />
                  <span />
                </label>
              </div>
              <p className="muted">抬手做个小互动。手动记录一直可用，识别不验证真实饮水，画面不会上传。</p>
            </section>
            <section className="card">
              <h2>数据与备份</h2>
              <p className="muted">{sync.status.message}</p>
              <div className="action-grid">
                <button
                  onClick={() =>
                    void perform(async () => saveJson(`健康喝水-${today}.json`, await repo.export(profile)))
                  }
                >
                  导出 JSON 备份
                </button>
                <button
                  onClick={() => {
                    fileTarget.current = { profile, epoch: scope.current }
                    fileRef.current?.click()
                  }}
                >
                  导入 JSON 备份
                </button>
                <button
                  onClick={() =>
                    void perform(async () =>
                      saveJson('健康喝水-迁移前原始数据.json', await repo.originalBackup()),
                    )
                  }
                >
                  导出迁移前原文
                </button>
                <button onClick={() => openCloud('legacy')}>导入旧云数据</button>
              </div>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  const target = fileTarget.current
                  e.target.value = ''
                  if (file && target) void perform(async () => preview(await file.text(), target))
                }}
              />
              <p className="caption">
                备份包含个人饮水记录，请保存在你信任的位置。旧数据迁移不会删除原数据库。
              </p>
            </section>
            {__CLOUD_ENABLED__ && (
              <section className="card">
                <div className="section-heading">
                  <h2>账号与同步</h2>
                  {profile !== 'guest' && (
                    <button className="text-button" onClick={() => sync.retry()}>
                      重试同步
                    </button>
                  )}
                </div>
                <p role="status" className="muted">
                  {sync.status.message}
                </p>
                {profile === 'guest' ? (
                  <button className="primary" onClick={() => openCloud('login')}>
                    登录或注册
                  </button>
                ) : (
                  <>
                    <p className="caption">账号 {profile.slice(5, 13)}… · 游客资料独立保留</p>
                    <div className="action-grid">
                      <button onClick={() => setClaimOpen(true)}>认领本机游客记录</button>
                      <button onClick={() => void perform(importAccountLegacy)}>迁移此账号旧云记录</button>
                      <button
                        onClick={() =>
                          void perform(async (isCurrent) => {
                            const cloud = await import('./cloud/firebase')
                            if (!isCurrent()) return
                            await cloud.logout()
                            if (isCurrent()) switchProfile('guest')
                          }, '已退出，未同步记录仍保存在原账号中')
                        }
                      >
                        退出账号
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
            {__CLOUD_ENABLED__ && profile !== 'guest' && (
              <section className="card">
                <h2>一起保持规律</h2>
                <p className="muted">
                  选择加入后，只公开昵称与达标天数。个人自报数据，每天最多计一次，超额饮水不加分。
                </p>
                <label>
                  公开昵称
                  <input
                    maxLength={24}
                    value={board.nickname}
                    onChange={(e) => setBoard({ ...board, nickname: e.target.value })}
                  />
                </label>
                <div className="action-grid">
                  <button disabled={boardSaving} onClick={() => void changeBoard(!board.enabled)}>
                    {board.enabled ? '退出榜单' : '加入榜单'}
                  </button>
                  {board.enabled && (
                    <button disabled={boardSaving} onClick={() => void changeBoard(true)}>
                      更新昵称
                    </button>
                  )}
                  <button onClick={() => setBoardOpen(true)}>查看排行榜</button>
                </div>
              </section>
            )}
            {conflicts.length > 0 && (
              <section className="card warning">
                <h2>处理同步冲突</h2>
                <p>同一条记录在其他设备发生了变化；你的本地版本仍保留。</p>
                {conflicts.map((c) => (
                  <div className="conflict" key={c.id}>
                    <p>
                      {c.local.date} · 本地 {c.local.amountMl} ml / 云端{' '}
                      {c.remote.deleted ? '已删除' : `${c.remote.amountMl} ml`}
                    </p>
                    <button onClick={() => void perform(() => repo.resolveConflict(c, false))}>
                      采用云端版本
                    </button>
                    {!c.remote.deleted && (
                      <button onClick={() => void perform(() => repo.resolveConflict(c, true))}>
                        保留本地最新修改
                      </button>
                    )}
                    {c.remote.deleted && (
                      <p className="caption">删除优先。如果需要恢复，请采用云端后重新新增记录。</p>
                    )}
                  </div>
                ))}
              </section>
            )}
            <footer className="settings-footer">
              健康喝水 · {__CLOUD_ENABLED__ ? '3.1 云功能预览' : '3.0 离线版'}
              <br />
              一杯水，一点照顾。
            </footer>
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="主要导航">
        {(
          [
            ['today', '◉', '今天'],
            ['history', '▦', '历史'],
            ['settings', '⚙', '设置'],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      {editor && (
        <Modal
          title={
            editor.entity ? '编辑饮水记录' : editor.source === 'pose' ? '动作完成，确认记录' : '记下一杯水'
          }
          onClose={() => {
            if (!saving) setEditor(undefined)
          }}
        >
          <form onSubmit={saveEditor}>
            <label>
              饮水量（ml）
              <input
                type="number"
                min="1"
                max="100000"
                step="1"
                required
                value={editor.amount}
                onChange={(e) => setEditor({ ...editor, amount: e.target.value })}
              />
            </label>
            {editor.entity?.kind !== 'legacy' ? (
              <label>
                饮水时间（设备当前时区）
                <input
                  type="datetime-local"
                  required
                  max={inputTime()}
                  value={editor.time}
                  onChange={(e) => setEditor({ ...editor, time: e.target.value })}
                />
              </label>
            ) : (
              <p className="caption">这是旧版每日汇总，只修改总量，不推断饮水时间。</p>
            )}
            <button className="primary full" disabled={saving}>
              {saving ? '保存中…' : '确认保存'}
            </button>
          </form>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="删除这条记录？" onClose={() => setDeleteTarget(undefined)}>
          <p>
            {deleteTarget.date} · {deleteTarget.amountMl} ml
          </p>
          <p className="muted">删除后当天统计会重新计算，联网后会同步到其他设备。</p>
          <button
            className="danger full"
            onClick={() =>
              void perform(async (isCurrent) => {
                await repo.remove(profile, deleteTarget.id)
                if (isCurrent()) {
                  setDeleteTarget(undefined)
                  if (undo === deleteTarget.id) setUndo(undefined)
                }
              }, '记录已删除')
            }
          >
            确认删除
          </button>
        </Modal>
      )}
      {importData && (
        <Modal title="确认导入备份" onClose={() => setImportData(undefined)}>
          <p>
            共 {importData.preview.total} 条：新增 {importData.preview.added} 条，相同{' '}
            {importData.preview.identical} 条，冲突 {importData.preview.conflicts} 条。
          </p>
          <p className="muted">
            导入到当前{profile === 'guest' ? '游客资料' : '账号'}
            。同日旧汇总不会相加，已删除的记录不会恢复，导入前的数据会留存备份。
          </p>
          <p className="caption">
            {importData.freezeLegacyUid &&
              '确认导入并保存成功后，此账号旧版本将停止写入。冻结失败时可在同步状态中重试；旧云原始数据继续保留。'}
          </p>
          <button
            className="primary full"
            onClick={() => void perform(() => applyImport('keep'), '导入完成')}
          >
            导入并保留当前冲突版本
          </button>
          {importData.preview.conflicts > 0 && (
            <button
              className="full"
              onClick={() => void perform(() => applyImport('replace'), '导入完成，原始版本已备份')}
            >
              冲突时采用备份版本
            </button>
          )}
        </Modal>
      )}
      {claimOpen && (
        <Modal title="认领本机游客记录" onClose={() => setClaimOpen(false)}>
          <p>仅在这些记录属于你时，将它们导入当前账号。游客原始资料继续保留，相同记录不会重复导入。</p>
          <button
            className="primary full"
            onClick={() =>
              void perform(async (isCurrent) => {
                await repo.claimGuest(profile)
                if (isCurrent()) setClaimOpen(false)
              }, '已认领，等待同步')
            }
          >
            这些记录属于我，确认导入
          </button>
        </Modal>
      )}
      <Suspense
        fallback={
          <div className="loading-overlay" role="status">
            正在加载…
          </div>
        }
      >
        {poseOpen && (
          <PoseCheckin
            onClose={() => setPoseOpen(false)}
            onConfirm={(source) => {
              setPoseOpen(false)
              setEditor({ amount: '250', time: inputTime(), source })
            }}
          />
        )}
        {cloudDialog && (
          <CloudPanel
            legacyOnly={cloudDialog.kind === 'legacy'}
            onClose={() => setCloudDialog(undefined)}
            onImport={(raw) => void perform(() => preview(raw, cloudDialog.target))}
            onLogin={(uid) => {
              if (current(cloudDialog.target)) switchProfile(`user:${uid}`)
            }}
          />
        )}
        {boardOpen && <Leaderboard onClose={() => setBoardOpen(false)} />}
      </Suspense>
    </div>
  )
}
