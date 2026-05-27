import { useState, useEffect, useCallback } from 'react'
import './App.css'

const DEFAULT_GOAL = 2000
const CUP_CAPACITY = 500

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function loadData() {
  try {
    const raw = localStorage.getItem('waterData')
    if (!raw) return { goal: DEFAULT_GOAL, records: {} }
    return JSON.parse(raw)
  } catch {
    return { goal: DEFAULT_GOAL, records: {} }
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
  const [showSettings, setShowSettings] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [ripple, setRipple] = useState(null)

  const today = getToday()
  const todayTotal = records[today] || 0
  const progress = Math.min(todayTotal / goal, 1)

  useEffect(() => {
    const data = loadData()
    setGoal(data.goal)
    setRecords(data.records)
  }, [])

  const addWater = useCallback((amount) => {
    setRecords(prev => {
      const updated = { ...prev, [today]: (prev[today] || 0) + amount }
      const data = { goal, records: updated }
      saveData(data)
      return updated
    })
    setRipple(amount)
    setTimeout(() => setRipple(null), 600)
  }, [today, goal])

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
      saveData({ goal: g, records })
      setShowSettings(false)
      setNewGoal('')
    }
  }

  const handleUndo = () => {
    if (todayTotal > 0) {
      setRecords(prev => {
        const updated = { ...prev, [today]: Math.max(0, (prev[today] || 0) - 250) }
        const data = { goal, records: updated }
        saveData(data)
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>设置每日目标</h2>
            <div className="modal-body">
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
