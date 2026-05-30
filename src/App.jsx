import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

// 通用弹性按钮
function BouncyButton({ children, className, onClick, disabled, ...props }) {
  return (
    <motion.button
      className={className}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      {...props}
    >
      {children}
    </motion.button>
  )
}

// 水滴飘落粒子
function WaterDrop({ delay, x }) {
  return (
    <motion.div
      className="water-particle"
      initial={{ y: -20, x, opacity: 0, scale: 0 }}
      animate={{
        y: [0, 60, 120],
        opacity: [0, 1, 0],
        scale: [0, 1.2, 0.5],
      }}
      transition={{ duration: 0.8, delay, ease: 'easeIn' }}
    >
      💧
    </motion.div>
  )
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
  const [particles, setParticles] = useState([])
  const [goalReached, setGoalReached] = useState(false)

  const today = getToday()
  const todayTotal = records[today] || 0
  const progress = Math.min(todayTotal / goal, 1)
  const prevProgressRef = useState(progress)[0]

  useEffect(() => {
    const data = loadData()
    setGoal(data.goal)
    setRecords(data.records)
    setCheckInEnabled(data.checkInEnabled)
  }, [])

  // 检测目标达成
  useEffect(() => {
    if (progress >= 1 && !goalReached) {
      setGoalReached(true)
    }
  }, [progress, goalReached])

  const doAddWater = useCallback((amount) => {
    const prevTotal = todayTotal
    setRecords(prev => {
      const updated = { ...prev, [today]: (prev[today] || 0) + amount }
      saveData({ goal, records: updated, checkInEnabled })
      return updated
    })
    setRipple(amount)
    setTimeout(() => setRipple(null), 800)

    // 水滴粒子效果
    const newParticles = Array.from({ length: 3 }, (_, i) => ({
      id: Date.now() + i,
      delay: i * 0.1,
      x: (Math.random() - 0.5) * 60,
    }))
    setParticles(newParticles)
    setTimeout(() => setParticles([]), 1000)
  }, [today, goal, checkInEnabled, todayTotal])

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

  const cupsCompleted = Math.floor(todayTotal / CUP_CAPACITY)
  const weekDates = getWeekDates()
  const maxInWeek = Math.max(...weekDates.map(d => records[d] || 0), goal)

  // 入场动画配置
  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  }

  return (
    <div className="app">
      {/* Header */}
      <motion.header
        className="header"
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <h1>健康喝水</h1>
        <BouncyButton
          className="settings-btn"
          onClick={() => { setShowSettings(true); setNewGoal(String(goal)) }}
        >
          ⚙
        </BouncyButton>
      </motion.header>

      <motion.main
        className="main-content"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Cup Display */}
        <motion.div className="cup-container" variants={itemVariants}>
          <div className="cup">
            <motion.div
              className="water-fill"
              animate={{ height: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 80, damping: 15 }}
            >
              <div className="wave"></div>
            </motion.div>
            <div className="cup-text">
              <motion.span
                key={todayTotal}
                className="current-ml"
                initial={{ scale: 1.3, color: '#66BB6A' }}
                animate={{ scale: 1, color: '#29B6F6' }}
                transition={{ duration: 0.4 }}
              >
                {todayTotal}
              </motion.span>
              <span className="goal-ml">/ {goal} ml</span>
            </div>
          </div>
          <div className="cup-handle"></div>

          {/* 水滴粒子 */}
          <AnimatePresence>
            {particles.map(p => (
              <WaterDrop key={p.id} delay={p.delay} x={p.x} />
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Progress Info */}
        <motion.div className="progress-info" variants={itemVariants}>
          <div className="progress-bar-bg">
            <motion.div
              className="progress-bar-fill"
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={progress >= 1 ? 'done' : 'ongoing'}
              className="progress-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {progress >= 1
                ? '  今日目标已完成！'
                : `还差 ${goal - todayTotal} ml，继续加油！`
              }
            </motion.p>
          </AnimatePresence>
          <div className="cups-count">
            {Array.from({ length: Math.ceil(goal / CUP_CAPACITY) }).map((_, i) => (
              <motion.span
                key={i}
                className={`cup-icon ${i < cupsCompleted ? 'filled' : ''}`}
                initial={false}
                animate={i < cupsCompleted ? {
                  scale: [1, 1.4, 1],
                  rotate: [0, 15, -10, 0],
                } : {}}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              >
                {i < cupsCompleted ? '  ' : '  '}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* Quick Add Buttons */}
        <motion.div className="quick-add" variants={itemVariants}>
          <BouncyButton className="add-btn" onClick={() => addWater(100)}>
            <span className="add-amount">+100ml</span>
            <span className="add-label">小杯</span>
          </BouncyButton>
          <BouncyButton className="add-btn primary" onClick={() => addWater(250)}>
            <span className="add-amount">+250ml</span>
            <span className="add-label">一杯</span>
          </BouncyButton>
          <BouncyButton className="add-btn" onClick={() => addWater(500)}>
            <span className="add-amount">+500ml</span>
            <span className="add-label">大杯</span>
          </BouncyButton>
        </motion.div>

        {/* Custom & Undo */}
        <motion.div className="extra-actions" variants={itemVariants}>
          <BouncyButton className="action-btn" onClick={() => setShowCustom(!showCustom)}>
             自定义
          </BouncyButton>
          <BouncyButton className="action-btn" onClick={handleUndo} disabled={todayTotal === 0}>
             撤销
          </BouncyButton>
        </motion.div>

        {/* Custom Amount Input */}
        <AnimatePresence>
          {showCustom && (
            <motion.div
              className="custom-input"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <input
                type="number"
                placeholder="输入毫升数"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                min="1"
                max="5000"
                autoFocus
              />
              <BouncyButton onClick={handleCustomAdd} disabled={!customAmount}>添加</BouncyButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Weekly Chart */}
        <motion.section
          className="weekly-chart"
          variants={itemVariants}
        >
          <h2>本周记录</h2>
          <div className="chart">
            {weekDates.map((date, index) => {
              const amount = records[date] || 0
              const height = maxInWeek > 0 ? (amount / maxInWeek) * 100 : 0
              const isGoalMet = amount >= goal
              const isToday = date === today
              return (
                <div key={date} className={`chart-bar-wrapper ${isToday ? 'today' : ''}`}>
                  <motion.div
                    className="chart-amount"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                  >
                    {amount > 0 ? amount : ''}
                  </motion.div>
                  <div className="chart-bar-container">
                    <motion.div
                      className={`chart-bar ${isGoalMet ? 'met' : ''}`}
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{
                        type: 'spring',
                        stiffness: 120,
                        damping: 15,
                        delay: 0.2 + index * 0.08,
                      }}
                    />
                    <div className="goal-line" style={{ bottom: `${(goal / maxInWeek) * 100}%` }}></div>
                  </div>
                  <div className="chart-label">{getWeekdayLabel(date)}</div>
                </div>
              )
            })}
          </div>
        </motion.section>
      </motion.main>

      {/* Ripple Animation */}
      <AnimatePresence>
        {ripple && (
          <motion.div
            className="ripple-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="ripple-content"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 0] }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <span className="ripple-amount">+{ripple}ml</span>
              <span className="ripple-check">✓</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 目标达成庆祝 */}
      <AnimatePresence>
        {goalReached && progress >= 1 && (
          <motion.div
            className="celebration-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGoalReached(false)}
          >
            <motion.div
              className="celebration-content"
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            >
              <motion.div
                className="celebration-emoji"
                animate={{ rotate: [0, 15, -15, 10, -10, 0] }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >

              </motion.div>
              <h2>恭喜！</h2>
              <p>今日目标已完成</p>
              <p className="celebration-total">{todayTotal} ml</p>
              <BouncyButton
                className="celebration-close"
                onClick={() => setGoalReached(false)}
              >
                继续加油
              </BouncyButton>
            </motion.div>
            {/* 飘落彩带 */}
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="confetti"
                style={{ left: `${Math.random() * 100}%` }}
                initial={{ y: -20, opacity: 1, rotate: 0 }}
                animate={{
                  y: window.innerHeight + 20,
                  opacity: [1, 1, 0],
                  rotate: Math.random() * 720 - 360,
                  x: (Math.random() - 0.5) * 200,
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  delay: Math.random() * 0.5,
                  ease: 'easeIn',
                }}
              >
                {[' ', ' ', ' ', '✨', ' '][i % 5]}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pose Check-in Camera */}
      <AnimatePresence>
        {showCamera && (
          <PoseCheckin
            onSuccess={handleCheckinSuccess}
            onCancel={handleCheckinCancel}
            onSkip={handleCheckinSkip}
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.8, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
            >
              <h2>设置</h2>

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
                <BouncyButton className="cancel-btn" onClick={() => setShowSettings(false)}>取消</BouncyButton>
                <BouncyButton className="confirm-btn" onClick={handleGoalChange}>确定</BouncyButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
