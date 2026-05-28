import { useState, useEffect, useCallback } from 'react'
import PoseCheckin from './PoseCheckin'
import './App.css'

const DEFAULT_GOAL = 2000
const CUP_CAPACITY = 500

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function loadData() {
  try {
    const raw = localStorage.getItem('waterData')
    if (!raw) return { goal: DEFAULT_GOAL, records: {}, checkInEnabled: false }
    const data = JSON.parse(raw)
    return { ...data, checkInEnabled: data.checkInEnabled || false }
  } catch {
    return { goal: DEFAULT_GOAL, records: {}, checkInEnabled: false }
  }
}

function saveData(data) {
  localStorage.setItem('waterData', JSON.stringify(data))
}

function getWeekDates() {
  const dates = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function getWeekdayLabel(dateStr) {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return days[new Date(dateStr).getDay()]
}

function App() {
  const [goal, setGoal] = useState(DEFAULT_GOAL)
  const [records, setRecords] = useState({})
  const [checkInEnabled, setCheckInEnabled] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [ripple, setRipple] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [pendingAmount, setPendingAmount] = useState(0)

  const today = getToday()
  const todayTotal = records[today] || 0
  const progress = Math.min(todayTotal / goal, 1)

  useEffect(() => {
    const data = loadData()
    setGoal(data.goal)
    setRecords(data.records)
    setCheckInEnabled(data.checkInEnabled)
  }, [])

  const doAddWater = useCallback((amount) => {
    setRecords(prev => {
      const updated = { ...prev, [today]: (prev[today] || 0) + amount }
      saveData({ goal, records: updated, checkInEnabled })
      return updated
    })
    setRipple(amount)
    setTimeout(() => setRipple(null), 600)
  }, [today, goal, checkInEnabled])

  const addWater = useCallback((amount) => {
    if (checkInEnabled) {
      setPendingAmount(amount)
      setShowCamera(true)
    } else {
      doAddWater(amount)
    }
  }, [checkInEnabled, doAddWater])

  const handleCheckinSuccess = useCallback(() => {
    setShowCamera(false)
    doAddWater(pendingAmount)
  }, [doAddWater, pendingAmount])

  const handleCheckinSkip = useCallback(() => {
    setShowCamera(false)
    doAddWater(pendingAmount)
  }, [doAddWater, pendingAmount])

  const handleCheckinCancel = useCallback(() => {
    setShowCamera(false)
    setPendingAmount(0)
  }, [])

  const handleCustomAdd = () => {
    const amount = parseInt(customAmount)
    if (amount > 0 && amount <= 5000) {
      addWater(amount)
      setCustomAmount('')
      setShowCustom(false)
    }
  }

  const handleGoalChange = () => {
    const g = parseInt(newGoal)
    if (g >= 500 && g <= 10000) {
      setGoal(g)
      saveData({ goal: g, records, checkInEnabled })
      setShowSettings(false)
      setNewGoal('')
    }
  }

  const handleCheckInToggle = (enabled) => {
    setCheckInEnabled(enabled)
    saveData({ goal, records, checkInEnabled: enabled })
  }

  const handleUndo = () => {
    if (todayTotal > 0) {
      setRecords(prev => {
        const updated = { ...prev, [today]: Math.max(0, (prev[today] || 0) - 250) }
        saveData({ goal, records: updated, checkInEnabled })
        return updated
      })
    }
  }

  const cupFillHeight = Math.min((todayTotal % CUP_CAPACITY) / CUP_CAPACITY, 1)
  const cupsCompleted = Math.floor(todayTotal / CUP_CAPACITY)

  const weekDates = getWeekDates()
  const maxInWeek = Math.max(...weekDates.map(d => records[d] || 0), goal)

  const hourlyRecords = JSON.parse(localStorage.getItem('waterHourly_' + today) || '[]')
  useEffect(() => {
    localStorage.setItem('waterHourly_' + today, JSON.stringify(hourlyRecords))
  }, [today, hourlyRecords])

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>健康喝水</h1>
        <button className="settings-btn" onClick={() => { setShowSettings(true); setNewGoal(String(goal)) }}>
          ⚙
        </button>
      </header>

      {/* Main Cup Display */}
      <main className="main-content">
        <div className="cup-container">
          <div className="cup">
            <div
              className="water-fill"
              style={{ height: `${progress * 100}%` }}
            >
              <div className="wave"></div>
            </div>
            <div className="cup-text">
              <span className="current-ml">{todayTotal}</span>
              <span className="goal-ml">/ {goal} ml</span>
            </div>
          </div>
          <div className="cup-handle"></div>
        </div>

        {/* Progress Info */}
        <div className="progress-info">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }}></div>
          </div>
          <p className="progress-text">
            {progress >= 1
              ? '今日目标已完成！'
              : `还差 ${goal - todayTotal} ml，继续加油！`
            }
          </p>
          <div className="cups-count">
            {Array.from({ length: Math.ceil(goal / CUP_CAPACITY) }).map((_, i) => (
              <span key={i} className={`cup-icon ${i < cupsCompleted ? 'filled' : ''}`}>
                {i < cupsCompleted ? '  ' : '  '}
              </span>
            ))}
          </div>
        </div>

        {/* Quick Add Buttons */}
        <div className="quick-add">
          <button className="add-btn" onClick={() => addWater(100)}>
            <span className="add-amount">+100ml</span>
            <span className="add-label">小杯</span>
          </button>
          <button className="add-btn primary" onClick={() => addWater(250)}>
            <span className="add-amount">+250ml</span>
            <span className="add-label">一杯</span>
          </button>
          <button className="add-btn" onClick={() => addWater(500)}>
            <span className="add-amount">+500ml</span>
            <span className="add-label">大杯</span>
          </button>
        </div>

        {/* Custom & Undo */}
        <div className="extra-actions">
          <button className="action-btn" onClick={() => setShowCustom(!showCustom)}>
             自定义
          </button>
          <button className="action-btn" onClick={handleUndo} disabled={todayTotal === 0}>
             撤销
          </button>
        </div>

        {/* Custom Amount Input */}
        {showCustom && (
          <div className="custom-input">
            <input
              type="number"
              placeholder="输入毫升数"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              min="1"
              max="5000"
              autoFocus
            />
            <button onClick={handleCustomAdd} disabled={!customAmount}>添加</button>
          </div>
        )}

        {/* Weekly Chart */}
        <section className="weekly-chart">
          <h2>本周记录</h2>
          <div className="chart">
            {weekDates.map(date => {
              const amount = records[date] || 0
              const height = maxInWeek > 0 ? (amount / maxInWeek) * 100 : 0
              const isGoalMet = amount >= goal
              const isToday = date === today
              return (
                <div key={date} className={`chart-bar-wrapper ${isToday ? 'today' : ''}`}>
                  <div className="chart-amount">{amount > 0 ? amount : ''}</div>
                  <div className="chart-bar-container">
                    <div
                      className={`chart-bar ${isGoalMet ? 'met' : ''}`}
                      style={{ height: `${height}%` }}
                    ></div>
                    <div className="goal-line" style={{ bottom: `${(goal / maxInWeek) * 100}%` }}></div>
                  </div>
                  <div className="chart-label">{getWeekdayLabel(date)}</div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      {/* Ripple Animation */}
      {ripple && (
        <div className="ripple-overlay">
          <div className="ripple-content">
            <span className="ripple-amount">+{ripple}ml</span>
            <span className="ripple-check">✓</span>
          </div>
        </div>
      )}

      {/* Pose Check-in Camera */}
      {showCamera && (
        <PoseCheckin
          onSuccess={handleCheckinSuccess}
          onCancel={handleCheckinCancel}
          onSkip={handleCheckinSkip}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>设置</h2>

            {/* Goal Setting */}
            <div className="modal-body">
              <label className="setting-label">每日目标</label>
              <input
                type="number"
                placeholder="目标毫升数"
                value={newGoal}
                onChange={e => setNewGoal(e.target.value)}
                min="500"
                max="10000"
                step="100"
              />
              <p className="hint">建议每日 1500~2500 ml</p>
            </div>

            {/* Check-in Toggle */}
            <div className="modal-body">
              <div className="setting-row">
                <div>
                  <label className="setting-label">姿势打卡</label>
                  <p className="hint">每次加水前需做喝水姿势</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={checkInEnabled}
                    onChange={e => handleCheckInToggle(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowSettings(false)}>取消</button>
              <button className="confirm-btn" onClick={handleGoalChange}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
