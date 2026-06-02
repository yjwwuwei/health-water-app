import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthProvider, useAuth } from './AuthContext'
import {
  migrateFromLocalStorage,
  loadAllRecords,
  saveRecord,
  loadSetting,
  saveSetting,
} from './db'
import { syncToCloud, loadFromCloud } from './firebase'
import PoseCheckin from './PoseCheckin'
import LoginPage from './LoginPage'
import Leaderboard from './Leaderboard'
import './App.css'

const DEFAULT_GOAL = 2000
const CUP_CAPACITY = 500

function getToday() {
  return new Date().toISOString().slice(0, 10)
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

function AppContent() {
  const { user } = useAuth()
  const [goal, setGoal] = useState(DEFAULT_GOAL)
  const [records, setRecords] = useState({})
  const [checkInEnabled, setCheckInEnabled] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [pendingAmount, setPendingAmount] = useState(0)
  const [particles, setParticles] = useState([])
  const [goalReached, setGoalReached] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [dataReady, setDataReady] = useState(false)

  const today = getToday()
  const todayTotal = records[today] || 0
  const progress = Math.min(todayTotal / goal, 1)

  // 初始化：迁移 localStorage + 加载 IndexedDB
  useEffect(() => {
    const init = async () => {
      await migrateFromLocalStorage()
      const loadedRecords = await loadAllRecords()
      const loadedGoal = await loadSetting('goal', DEFAULT_GOAL)
      const loadedCheckIn = await loadSetting('checkInEnabled', false)
      setRecords(loadedRecords)
      setGoal(loadedGoal)
      setCheckInEnabled(loadedCheckIn)
      setDataReady(true)
    }
    init()
  }, [])

  // 登录后从云端同步数据
  useEffect(() => {
    if (!user || user.isAnonymous || !dataReady) return
    const sync = async () => {
      try {
        const cloudData = await loadFromCloud(user.uid)
        // 合并云端数据到本地
        if (cloudData.records && Object.keys(cloudData.records).length > 0) {
          setRecords(prev => {
            const merged = { ...prev }
            for (const [date, amount] of Object.entries(cloudData.records)) {
              if (!merged[date] || amount > merged[date]) {
                merged[date] = amount
              }
            }
            return merged
          })
          // 保存合并后的数据到 IndexedDB
          for (const [date, amount] of Object.entries(cloudData.records)) {
            await saveRecord(date, amount)
          }
        }
        if (cloudData.goal) {
          setGoal(cloudData.goal)
          await saveSetting('goal', cloudData.goal)
        }
      } catch (e) {
        console.error('云端同步失败:', e)
      }
    }
    sync()
  }, [user, dataReady])

  // 自动同步到云端（数据变化后延迟同步）
  useEffect(() => {
    if (!user || user.isAnonymous) return
    const timer = setTimeout(async () => {
      try {
        await syncToCloud(user.uid, records, goal)
      } catch (e) {
        console.error('上传云端失败:', e)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [records, goal, user])

  useEffect(() => {
    if (progress >= 1 && !goalReached) setGoalReached(true)
  }, [progress, goalReached])

  const doAddWater = useCallback(async (amount) => {
    const newTotal = (todayTotal) + amount
    setRecords(prev => {
      const updated = { ...prev, [today]: newTotal }
      return updated
    })
    await saveRecord(today, newTotal)
    setParticles(Array.from({ length: 3 }, (_, i) => ({
      id: Date.now() + i, delay: i * 0.1, x: (Math.random() - 0.5) * 60,
    })))
    setTimeout(() => setParticles([]), 1000)
  }, [today, todayTotal])

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

  const handleGoalChange = async () => {
    const g = parseInt(newGoal)
    if (g >= 500 && g <= 10000) {
      setGoal(g)
      await saveSetting('goal', g)
      setShowSettings(false)
      setNewGoal('')
    }
  }

  const handleCheckInToggle = async (enabled) => {
    setCheckInEnabled(enabled)
    await saveSetting('checkInEnabled', enabled)
  }

  const handleUndo = async () => {
    if (todayTotal > 0) {
      const newTotal = Math.max(0, todayTotal - 250)
      setRecords(prev => ({ ...prev, [today]: newTotal }))
      await saveRecord(today, newTotal)
    }
  }

  const cupsCompleted = Math.floor(todayTotal / CUP_CAPACITY)
  const weekDates = getWeekDates()
  const maxInWeek = Math.max(...weekDates.map(d => records[d] || 0), goal)

  const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  }

  if (!dataReady) {
    return (
      <div className="app">
        <div className="loading-screen">
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >加载中...</motion.p>
        </div>
      </div>
    )
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
        <div className="header-actions">
          <BouncyButton className="header-btn" onClick={() => setShowLeaderboard(true)}>

          </BouncyButton>
          <BouncyButton className="header-btn" onClick={() => setShowLogin(true)}>
            {user && !user.isAnonymous ? '  ' : ' '}
          </BouncyButton>
          <BouncyButton
            className="settings-btn"
            onClick={() => { setShowSettings(true); setNewGoal(String(goal)) }}
          >
            ⚙
          </BouncyButton>
        </div>
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
          <AnimatePresence>
            {particles.map(p => <WaterDrop key={p.id} delay={p.delay} x={p.x} />)}
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
                animate={i < cupsCompleted ? { scale: [1, 1.4, 1], rotate: [0, 15, -10, 0] } : {}}
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
        <motion.section className="weekly-chart" variants={itemVariants}>
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
                      transition={{ type: 'spring', stiffness: 120, damping: 15, delay: 0.2 + index * 0.08 }}
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

      {/* Celebration */}
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
              <BouncyButton className="celebration-close" onClick={() => setGoalReached(false)}>
                继续加油
              </BouncyButton>
            </motion.div>
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
                transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5, ease: 'easeIn' }}
              >
                {[' ', ' ', ' ', '✨', ' '][i % 5]}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pose Check-in */}
      <AnimatePresence>
        {showCamera && (
          <PoseCheckin
            onSuccess={handleCheckinSuccess}
            onCancel={handleCheckinCancel}
            onSkip={handleCheckinSkip}
          />
        )}
      </AnimatePresence>

      {/* Login */}
      <AnimatePresence>
        {showLogin && <LoginPage onClose={() => setShowLogin(false)} />}
      </AnimatePresence>

      {/* Leaderboard */}
      <AnimatePresence>
        {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} />}
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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
